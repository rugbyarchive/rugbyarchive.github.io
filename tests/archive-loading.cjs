const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
(async () => {
  const ctx = { window: {} };
  for (const name of ['archive-data', 'legacy-match-links'])
    vm.runInNewContext(
      fs.readFileSync(path.join(__dirname, '../data/' + name + '.js'), 'utf8'),
      ctx,
    );
  const d = ctx.window.RUGBY_DATA,
    f = d.fields.indexOf('match_id'),
    ids = new Set(d.rows.map((r) => r[f]));
  const aliases = ctx.window.RUGBY_MATCH_ID_ALIASES,
    nums = ctx.window.RUGBY_LEGACY_MATCH_IDS;
  const alias = Object.keys(aliases).find(
    (k) => ids.has(aliases[k]) && !ids.has(k),
  );
  const numeric = Object.keys(nums).find((k) => ids.has(nums[k]));
  assert(alias && numeric);
  const canonical = d.rows[0][f];
  const b = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || 'msedge',
    headless: true,
  });
  async function page() {
    const p = await b.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await p.route(/cloudflareinsights|formspree/, (r) => r.abort());
    p.errors = [];
    p.requests = [];
    p.on('pageerror', (e) => p.errors.push(e.message));
    p.on('request', (r) => {
      if (r.url().includes('legacy-match-links')) p.requests.push(r.url());
    });
    return p;
  }
  const url = process.env.SITE_URL + 'index.html';
  for (const hash of ['', '#team=France', '#match=' + canonical]) {
    const p = await page();
    await p.goto(url + hash);
    await p.waitForFunction(() => !!window.__ARCHIVE);
    if (hash.includes('match='))
      await p.locator('.mobile-match').waitFor({ state: 'visible' });
    assert.equal(p.requests.length, 0);
    assert.deepEqual(p.errors, []);
    await p.close();
  }
  for (const id of [alias, numeric]) {
    const p = await page();
    await p.goto(url + '#match=' + encodeURIComponent(id));
    await p.locator('.mobile-match').waitFor({ state: 'visible' });
    assert.equal(p.requests.length, 1);
    assert.equal(
      await p.evaluate(
        () =>
          RUGBY_DATA.rows[__ARCHIVE.linkedRow()][
            RUGBY_DATA.fields.indexOf('match_id')
          ],
      ),
      aliases[id] || nums[id],
    );
    await p.locator('.mobile-match-head button').click();
    assert(!p.url().includes('match='));
    assert.deepEqual(p.errors, []);
    await p.close();
  }
  const p = await page();
  let fail = true;
  await p.route('**/data/legacy-match-links.js*', (r) =>
    fail ? r.abort() : r.continue(),
  );
  await p.goto(url + '#match=' + encodeURIComponent(alias));
  await p.getByRole('button', { name: 'Try again', exact: true }).waitFor();
  fail = false;
  await p.getByRole('button', { name: 'Try again', exact: true }).click();
  await p.locator('.mobile-match').waitFor({ state: 'visible' });
  assert.equal(p.requests.length, 2);
  assert.deepEqual(p.errors, []);
  await p.close();
  const stale = await page();
  let pending;
  const requested = new Promise((resolve) => {
    pending = resolve;
  });
  await stale.route('**/data/legacy-match-links.js*', (r) => pending(r));
  await stale.goto(url + '#match=' + encodeURIComponent(alias), {
    waitUntil: 'domcontentloaded',
  });
  const route = await requested;
  await stale.evaluate((id) => {
    location.hash = 'match=' + id;
  }, canonical);
  await stale.locator('.mobile-match').waitFor({ state: 'visible' });
  await route.continue();
  await stale.waitForFunction(() => !!window.RUGBY_LEGACY_MATCH_IDS);
  assert.equal(
    await stale.evaluate(
      () =>
        RUGBY_DATA.rows[__ARCHIVE.linkedRow()][
          RUGBY_DATA.fields.indexOf('match_id')
        ],
    ),
    canonical,
  );
  assert.deepEqual(stale.errors, []);
  await stale.close();
  await b.close();
  console.log(
    'PASS archive loading: no alias download for ordinary/current links; legacy and numeric links, retry and stale-response protection.',
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

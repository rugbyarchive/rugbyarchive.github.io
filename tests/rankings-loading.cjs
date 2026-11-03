const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
(async () => {
  const ctx = { window: {} };
  for (const file of ['data/rankings-data.js', 'assets/ranking-snapshots.js'])
    vm.runInNewContext(
      fs.readFileSync(path.join(__dirname, '..', file), 'utf8'),
      ctx,
    );
  const canonical = ctx.window.RUGBY_RANKINGS;
  for (const file of ['data/rankings-core.js', 'data/rankings-official.js'])
    vm.runInNewContext(
      fs.readFileSync(path.join(__dirname, '..', file), 'utf8'),
      ctx,
    );
  assert.equal(
    JSON.stringify({
      ...ctx.window.RUGBY_RANKINGS,
      official: ctx.window.RUGBY_OFFICIAL,
    }),
    JSON.stringify(canonical),
  );
  const snapshots = canonical.official.snapshots;
  for (const [day, triples] of snapshots) {
    const result = ctx.window.RUGBY_SNAPSHOTS.at(snapshots, day);
    assert.equal(
      JSON.stringify(
        result.order.flatMap((id) => [id, result.pos[id], result.rating[id]]),
      ),
      JSON.stringify(triples),
    );
  }
  const b = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || 'msedge',
    headless: true,
  });
  const base = process.env.SITE_URL;
  for (const width of [390, 1440]) {
    const p = await b.newPage({ viewport: { width, height: 900 } });
    await p.route(/cloudflareinsights|formspree/, (r) => r.abort());
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    let calls = 0,
      fail = true,
      release;
    await p.route('**/data/rankings-official.js*', async (r) => {
      calls++;
      if (fail) return r.abort();
      if (release)
        await new Promise((resolve) => {
          release = resolve;
        });
      await r.continue();
    });
    await p.goto(base + 'rankings.html');
    await p.waitForFunction(
      () => window.__TM && !document.querySelector('#app').hidden,
    );
    assert.equal(calls, 0);
    assert.equal(
      await p.evaluate(() => !!window.RUGBY_RANKINGS.official),
      false,
    );
    await p.locator('#f-source [data-v="world"]').click();
    await p.locator('#official-status button').waitFor();
    assert.equal(await p.evaluate(() => window.__TM.state().source), 'archive');
    assert((await p.evaluate(() => window.__TM.view().length)) > 0);
    fail = false;
    await p.locator('#official-status button').click();
    await p.waitForFunction(() => window.__TM.state().source === 'world');
    assert.equal(calls, 2);
    await p.locator('#f-source [data-v="archive"]').click();
    await p.locator('#f-source [data-v="world"]').click();
    assert.equal(calls, 2);
    await p.goto(
      base + 'rankings.html#source=world&date=2019-11-04&team=France',
    );
    await p.waitForFunction(
      () => window.__TM && window.__TM.state().source === 'world',
    );
    assert.equal(await p.locator('#f-find').inputValue(), 'France');
    await p.goto(base + 'rankings.html');
    await p.waitForFunction(() => !!window.__TM);
    release = true;
    await p.locator('#f-source [data-v="world"]').click();
    while (typeof release !== 'function')
      await new Promise((resolve) => setTimeout(resolve, 20));
    await p.locator('#f-source [data-v="archive"]').click();
    release();
    release = null;
    await p.waitForFunction(() => !!window.RUGBY_OFFICIAL);
    assert.equal(await p.evaluate(() => window.__TM.state().source), 'archive');
    assert.deepEqual(errors, []);
    await p.close();
  }
  await b.close();
  console.log(
    'PASS rankings loading: exact split and all snapshot positions/ratings; default omission, retry, single load, deep links and stale source response at mobile/desktop widths.',
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

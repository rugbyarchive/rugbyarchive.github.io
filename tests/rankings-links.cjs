const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || 'msedge',
    headless: true,
  });
  const p = await browser.newPage();
  await p.route(/cloudflareinsights|formspree/, (r) => r.abort());
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const base = process.env.SITE_URL;
  for (const separator of ['?', '#']) {
    await p.goto(
      base +
        'rankings.html' +
        separator +
        'source=archive&date=2020-11-01&team=Japan',
    );
    await p.waitForFunction(
      () => document.querySelector('#datebox').value === '2020-11-01',
    );
    assert.equal(await p.locator('#f-find').inputValue(), 'Japan');
  }
  await p.evaluate(() => {
    location.hash = 'source=world&date=2019-11-04&team=France';
  });
  await p.waitForFunction(
    () => document.querySelector('#f-source button.on').dataset.v === 'world',
  );
  assert.equal(await p.locator('#f-find').inputValue(), 'France');
  const date = await p.locator('#datebox').inputValue();
  for (const bad of [
    'date=2020-02-31',
    'source=invalid',
    'team=Narnia',
    'date=%E0%A4',
  ]) {
    await p.evaluate((h) => {
      location.hash = h;
    }, bad);
    await p.waitForTimeout(80);
    assert.equal(await p.locator('#datebox').inputValue(), date);
    assert.equal(await p.locator('#f-find').inputValue(), 'France');
  }
  await p.goto(base + 'rankings.html?date=2020-11-01#date=2020-11-21');
  await p.waitForFunction(
    () => document.querySelector('#datebox').value === '2020-11-21',
  );
  assert.deepEqual(errors, []);
  await browser.close();
  console.log(
    'PASS rankings links: fragments, legacy query fallback, fragment precedence, hash changes and atomic invalid-state rejection.',
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

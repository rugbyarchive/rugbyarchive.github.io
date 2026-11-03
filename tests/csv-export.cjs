const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const b = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || 'msedge',
    headless: true,
  });
  const p = await b.newPage();
  await p.route(/cloudflareinsights|formspree/, (r) => r.abort());
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  for (const page of ['index', 'head-to-head', 'scoring', 'rankings']) {
    await p.goto(process.env.SITE_URL + page + '.html');
    if (page === 'rankings') await p.locator('.tmoptions summary').click();
    await p.locator('#export').waitFor();
    if (page === 'head-to-head')
      await p.evaluate(() =>
        window.__H2H.set({ a: 'France', b: 'New Zealand' }),
      );
    assert.equal(
      await p.evaluate(() =>
        [null, 0, false, 'a,b', 'say "hi"', 'a\rb', 'a\nb']
          .map(window.RUGBY_CSV.quote)
          .join('|'),
      ),
      '|0|false|"a,b"|"say ""hi"""|"a\rb"|"a\nb"',
    );
    const wait = p.waitForEvent('download');
    await p.locator('#export').click();
    const d = await wait;
    assert(d.suggestedFilename().endsWith('.csv'));
    const data = fs.readFileSync(await d.path());
    assert.deepEqual([...data.subarray(0, 3)], [239, 187, 191]);
    assert(data.toString('utf8').split('\r\n').length > 2);
  }
  assert.deepEqual(errors, []);
  await b.close();
  console.log(
    'PASS CSV export: four tools download populated UTF-8 CSV; quotes, commas, line breaks, zero and false retained.',
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

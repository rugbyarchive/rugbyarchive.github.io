const { chromium } = require('playwright'),
  assert = require('node:assert/strict'),
  path = require('node:path'),
  { pathToFileURL } = require('node:url');
(async () => {
  const b = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || 'msedge',
    headless: true,
  });
  const base =
    process.env.SITE_URL ||
    pathToFileURL(path.resolve(__dirname, '..')).href + '/';
  const p = await b.newPage();
  p.on('console', (m) => {
    if (m.type() === 'error') console.log(m.text());
  });
  p.on('pageerror', (e) => console.log(e.message));
  await p.route('https://static.cloudflareinsights.com/**', (r) =>
    r.fulfill({
      contentType: 'text/javascript',
      body: 'window.analyticsPolicyTest=true;',
    }),
  );
  await p.goto(base + 'index.html');
  const policy = await p
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  assert(policy.includes("object-src 'none'"));
  assert(
    !policy.split('script-src')[1].split(';')[0].includes('unsafe-inline'),
  );
  await p.evaluate(() => {
    const s = document.createElement('script');
    s.textContent = 'window.inlinePolicyTest=true';
    document.body.appendChild(s);
  });
  assert.equal(await p.evaluate(() => window.inlinePolicyTest), undefined);
  await p.evaluate(
    () =>
      new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('Allowed script timed out')), 5000);
        const s = document.createElement('script');
        s.src = 'https://static.cloudflareinsights.com/policy-test.js';
        s.onload = resolve;
        s.onerror = reject;
        document.body.appendChild(s);
      }),
  );
  assert(await p.evaluate(() => window.analyticsPolicyTest));
  const id = await p.evaluate(
    () => RUGBY_DATA.rows[0][RUGBY_DATA.fields.indexOf('match_id')],
  );
  await p.close();
  const r = await b.newPage();
  let intercepted = 0;
  await r.route(/cloudflareinsights/, (q) => q.abort());
  await r.route('https://formspree.io/**', (q) => {
    intercepted++;
    return q.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*' },
      contentType: 'application/json',
      body: '{"ok":true}',
    });
  });
  await r.goto(base + 'report.html?match=' + id);
  await r.locator('#report-form').waitFor({ state: 'visible' });
  await r.locator('#report-category').selectOption('Other');
  await r
    .locator('#report-message')
    .fill('Automated browser test — intercepted locally, never sent.');
  await r.locator('#report-send').click();
  await r
    .getByText(
      'Thank you. Your report has been submitted for review. The match record has not been changed.',
      { exact: true },
    )
    .waitFor();
  assert.equal(intercepted, 1);
  await r.close();
  await b.close();
  console.log(
    'PASS security policy: inline script blocked, permitted analytics script loads, mocked reporting request works; no report sent.',
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

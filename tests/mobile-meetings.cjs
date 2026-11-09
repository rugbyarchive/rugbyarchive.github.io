const { chromium } = require('playwright'),
  assert = require('assert'),
  path = require('path'),
  { pathToFileURL } = require('url');
(async () => {
  const b = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || 'msedge',
    headless: true,
  });
  const base =
    process.env.SITE_URL ||
    pathToFileURL(path.resolve(__dirname, '..')).href + '/';
  const errors = [];
  for (const width of [320, 390, 430]) {
    const p = await b.newPage({
      viewport: { width, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    await p.route(/cloudflareinsights|formspree/, (r) => r.abort());
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(base + 'head-to-head.html');
    await p.waitForFunction(() => window.__H2H);
    await p.evaluate(() => __H2H.set({ a: 'South Africa', b: 'New Zealand' }));
    const total = await p.evaluate(() => __H2H.stats().played);
    await p.locator('.mobile-jumps button').click();
    async function check() {
      const cards = await p.locator('.mobile-meeting').evaluateAll((els) =>
        els.map((e) => ({
          id: e.dataset.matchId,
          text: [...e.querySelectorAll('.mobile-meeting-side>span')].map(
            (x) => x.textContent,
          ),
          scores: [...e.querySelectorAll('.mobile-meeting-side b')].map(
            (x) => +x.textContent,
          ),
          link: e.querySelector('a').getAttribute('href'),
          h: e.offsetHeight,
          overflow: e.scrollWidth > e.clientWidth,
        })),
      );
      assert(cards.length > 0 && cards.length < 30);
      for (const c of cards) {
        assert.equal(c.h, 208);
        assert(!c.overflow);
        assert.equal(c.link, 'index.html#match=' + encodeURIComponent(c.id));
        const r = await p.evaluate((id) => {
          const d = RUGBY_DATA,
            f = Object.fromEntries(d.fields.map((n, i) => [n, i]));
          const row = d.rows.find((r) => r[f.match_id] === id);
          return [row[f.home_score], row[f.away_score]];
        }, c.id);
        assert.deepStrictEqual(c.scores, r);
      }
      assert(
        await p
          .locator('#meetwrap')
          .evaluate((e) => e.scrollWidth === e.clientWidth),
      );
    }
    await check();
    const firstMatchHref = await p
      .locator('.mobile-meeting a')
      .first()
      .getAttribute('href');
    await p.locator('#meetwrap').evaluate((e) => (e.scrollTop = 50 * 208));
    await p.waitForTimeout(80);
    await check();
    await p
      .locator('#meetwrap')
      .evaluate((e) => (e.scrollTop = e.scrollHeight));
    await p.waitForTimeout(80);
    await check();
    await p.setViewportSize({ width: 1440, height: 1000 });
    await p.waitForFunction(
      () => document.querySelectorAll('.mobile-meeting').length === 0,
    );
    assert.equal(await p.locator('.mobile-meeting').count(), 0);
    assert((await p.locator('#meetbody .trow').count()) > 0);
    assert.equal(
      await p
        .locator('#meetbody .trow')
        .first()
        .evaluate((e) => e.offsetHeight),
      30,
    );
    await p.setViewportSize({ width, height: 844 });
    await p.waitForFunction(
      () => document.querySelectorAll('.mobile-meeting').length > 0,
    );
    await check();
    await p.locator('#meetwrap').evaluate((e) => (e.scrollTop = 0));
    await p.waitForFunction(
      (href) =>
        document.querySelector('.mobile-meeting a')?.getAttribute('href') ===
        href,
      firstMatchHref,
    );
    const link = p.locator(`.mobile-meeting a[href="${firstMatchHref}"]`);
    const id = await link.getAttribute('href');
    await link.click();
    await p.waitForFunction(
      () => document.querySelector('.mobile-match')?.open,
    );
    assert.equal(
      new URLSearchParams(new URL(p.url()).hash.slice(1)).get('match'),
      id.split('match=')[1],
    );
    assert(await p.locator('.mobile-match h2').isVisible());
    await p.goBack();
    await p.waitForFunction(() => window.__H2H);
    assert.equal(await p.locator('#meetcount').innerText(), String(total));
    await p.evaluate(() => __H2H.set({ basis: 'restated', era: 2017 }));
    assert(
      (await p.locator('.mobile-meeting-basis').first().innerText()).match(
        /Restated score|Original score/,
      ),
    );
    await p.evaluate(() =>
      __H2H.set({
        a: 'British & Irish Lions',
        b: 'New Zealand',
        basis: 'played',
      }),
    );
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    assert.deepStrictEqual(errors, []);
    await p.close();
  }
  await b.close();
  console.log(
    'PASS H2H cards320/390/430: exact scores and IDs; first/middle/end virtual scroll; no sideways overflow; desktop table and resize restoration; full-detail link opens panel; browser Back retains rivalry; restated labels.',
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

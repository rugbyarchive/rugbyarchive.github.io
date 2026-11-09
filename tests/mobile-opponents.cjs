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
      isMobile: true,
      hasTouch: true,
    });
    await p.route(/cloudflareinsights|formspree/, (r) => r.abort());
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(base + 'head-to-head.html');
    await p.waitForFunction(() => window.__H2H);
    await p.evaluate(() => __H2H.set({ a: 'France', b: '' }));
    const expected = await p.evaluate(() => __H2H.opponents());
    const actual = await p
      .locator('.mobile-opponent')
      .evaluateAll((es) =>
        es.map((e) => [
          e.dataset.opponent,
          ...[...e.querySelectorAll('dd')].map((x) => x.textContent),
        ]),
      );
    assert.equal(actual.length, expected.length);
    for (let i = 0; i < actual.length; i++) {
      assert.equal(actual[i][0], expected[i][0]);
      for (const [ci, ei] of [
        [1, 1],
        [2, 2],
        [3, 3],
        [4, 4],
        [6, 5],
        [7, 6],
      ])
        assert.equal(+actual[i][ci].replaceAll(',', ''), expected[i][ei]);
    }
    for (let sort = 0; sort < 10; sort++) {
      await p.selectOption('#mobile-opp-sort', String(sort));
      await p.selectOption('#mobile-opp-order', '1');
      let names = await p
        .locator('.mobile-opponent')
        .evaluateAll((es) => es.map((e) => e.dataset.opponent));
      assert.deepStrictEqual(
        names,
        (await p.evaluate(() => __H2H.opponents())).map((r) => r[0]),
      );
      await p.selectOption('#mobile-opp-order', '-1');
      names = await p
        .locator('.mobile-opponent')
        .evaluateAll((es) => es.map((e) => e.dataset.opponent));
      assert.deepStrictEqual(
        names,
        (await p.evaluate(() => __H2H.opponents())).map((r) => r[0]),
      );
    }
    await p.locator('#opp-find').fill('zzzz-no-team');
    assert.equal(await p.locator('.mobile-opponent').count(), 0);
    assert(await p.locator('.mobile-opponent-empty').isVisible());
    await p.locator('#opp-find').fill('New Zealand');
    assert.equal(
      await p.locator('.mobile-opponent').count(),
      expected.filter((r) => r[0].toLowerCase().includes('new zealand')).length,
    );
    await p.locator('#opphead').scrollIntoViewIfNeeded();
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    assert(
      await p
        .locator('#oppwrap')
        .evaluate((e) => e.scrollWidth <= e.clientWidth),
    );
    await p.locator('.mobile-opponent[data-opponent="New Zealand"] a').click();
    await p.waitForFunction(() => !document.querySelector('#rivalry').hidden);
    assert((await p.locator('.mobile-meeting').count()) > 0);
    await p.evaluate(() => __H2H.set({ a: 'France', b: '', find: '' }));
    await p.setViewportSize({ width: 1440, height: 1000 });
    await p.waitForFunction(
      () => document.querySelectorAll('.mobile-opponent').length === 0,
    );
    assert.equal(await p.locator('.mobile-opponent').count(), 0);
    assert.equal(await p.locator('#opphead [data-opp-sort]').count(), 10);
    const desktopRows = await p.locator('#oppbody .trow').count();
    assert.equal(desktopRows, expected.length);
    await p.locator('[data-opp-sort="0"]').click();
    await p.setViewportSize({ width, height: 844 });
    await p.waitForFunction(
      (count) => document.querySelectorAll('.mobile-opponent').length === count,
      desktopRows,
    );
    assert.equal(await p.locator('.mobile-opponent').count(), desktopRows);
    assert.equal(await p.locator('#mobile-opp-sort').inputValue(), '0');
    assert.deepStrictEqual(errors, []);
    await p.close();
  }
  await b.close();
  console.log(
    'PASS opponents320/390/430: exact counts/points, all10sorts both directions, search and empty state, rivalry link, no overflow, desktop table and breakpoint restoration.',
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

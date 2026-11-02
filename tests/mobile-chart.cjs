const { chromium } = require('playwright'),
  assert = require('assert'),
  path = require('path'),
  { pathToFileURL } = require('url');
(async () => {
  const b = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || 'msedge',
    headless: true,
  });
  for (const width of [320, 390, 430]) {
    const p = await b.newPage({
      viewport: { width, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await p.route(/cloudflareinsights|formspree/, (r) => r.abort());
    let errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(
      (process.env.SITE_URL ||
        pathToFileURL(path.resolve(__dirname, '..')).href + '/') +
        'head-to-head.html',
    );
    await p.waitForFunction(() => window.__H2H);
    await p.evaluate(() => __H2H.set({ a: 'France', b: 'New Zealand' }));
    let count = await p.locator('#mobile-chart-match option').count();
    assert(count > 50);
    assert(
      await p
        .getByRole('button', { name: 'Next match', exact: true })
        .isDisabled(),
    );
    for (const index of [0, Math.floor(count / 2), count - 1]) {
      await p.selectOption('#mobile-chart-match', String(index));
      const data = await p.evaluate(() => {
        const d = RUGBY_DATA,
          f = Object.fromEntries(d.fields.map((n, i) => [n, i])),
          id = document.querySelector('#mobile-chart-inspector').dataset.match,
          r = d.rows.find((r) => r[f.match_id] === id);
        return {
          id,
          score: r[f.home_score] + '–' + r[f.away_score],
          text: document.querySelector('.mobile-chart-readout').textContent,
          link: document
            .querySelector('.mobile-chart-readout a')
            .getAttribute('href'),
        };
      });
      assert(data.text.includes(data.score));
      assert(data.link.endsWith(data.id));
    }
    await p.selectOption('#mobile-chart-match', '0');
    assert(
      await p
        .getByRole('button', { name: 'Previous match', exact: true })
        .isDisabled(),
    );
    await p.getByRole('button', { name: 'Next match', exact: true }).click();
    assert.equal(await p.locator('#mobile-chart-match').inputValue(), '1');
    await p
      .getByRole('button', { name: 'Previous match', exact: true })
      .click();
    assert.equal(await p.locator('#mobile-chart-match').inputValue(), '0');
    await p.locator('#chart').click({ position: { x: 100, y: 80 } });
    assert.equal(await p.locator('#tip').isVisible(), false);
    await p.locator('#mobile-chart-inspector').scrollIntoViewIfNeeded();
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await p.evaluate(() => __H2H.set({ basis: 'restated', era: 2026 }));
    assert(
      (await p.locator('.mobile-chart-readout').innerText()).match(
        /Restated|Original score/,
      ),
    );
    await p.setViewportSize({ width: 1440, height: 1000 });
    await p.waitForFunction(
      () => !document.querySelector('#mobile-chart-inspector'),
    );
    await p.locator('#chart .hit').first().hover({ force: true });
    assert(await p.locator('#tip').isVisible());
    await p.setViewportSize({ width, height: 844 });
    await p.waitForSelector('#mobile-chart-inspector');
    assert.equal(await p.locator('#mobile-chart-inspector').count(), 1);
    await p.evaluate(() =>
      __H2H.set({ meetFrom: '1800-01-01', meetTo: '1800-01-02' }),
    );
    assert.equal(await p.locator('#mobile-chart-inspector').count(), 0);
    assert.deepStrictEqual(errors, []);
    await p.close();
  }
  await b.close();
  console.log(
    'PASS chart: three phone widths, exact recorded scores and links, selection and stepping, touch, restated labels, desktop hover, resize and empty period.',
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

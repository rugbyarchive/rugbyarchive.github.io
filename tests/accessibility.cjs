const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
(async () => {
  const b = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || 'msedge',
    headless: true,
  });
  const base =
    process.env.SITE_URL ||
    pathToFileURL(path.resolve(__dirname, '..')).href + '/';
  for (const width of [390, 1440])
    for (const file of [
      'index',
      'head-to-head',
      'rankings',
      'scoring',
      'about',
      'report',
    ]) {
      const p = await b.newPage({ viewport: { width, height: 900 } });
      await p.route(/cloudflareinsights|formspree/, (r) => r.abort());
      let errors = [];
      p.on('pageerror', (e) => errors.push(e.message));
      await p.goto(base + file + '.html');
      await p.waitForTimeout(150);
      if (file === 'head-to-head')
        await p.evaluate(() => __H2H.set({ a: 'France', b: 'New Zealand' }));
      assert.equal(
        await p.locator('nav.mainnav').getAttribute('aria-label'),
        'Main navigation',
      );
      assert.equal(
        await p.locator('.mainnav [aria-current=page]').count(),
        file === 'report' ? 0 : 1,
      );
      const unnamed = await p
        .locator('input,select,textarea')
        .evaluateAll((es) =>
          es
            .filter(
              (e) =>
                e.type !== 'hidden' &&
                !e.labels?.length &&
                !e.getAttribute('aria-label') &&
                !e.getAttribute('aria-labelledby'),
            )
            .map((e) => e.id),
        );
      assert.deepEqual(unnamed, [], file);
      for (const theme of ['light', 'terminal']) {
        await p.evaluate((t) => RUGBY_THEME.apply(t), theme);
        assert.equal(
          await p
            .locator('#themeswitch [aria-pressed=true]')
            .getAttribute('data-theme'),
          theme,
        );
        assert.equal(
          await p.locator('#themeswitch [aria-pressed=false]').count(),
          1,
        );
        const link = p.locator('.site-brand a');
        await link.focus();
        assert(
          await link.evaluate(
            (e) =>
              getComputedStyle(e).outlineStyle === 'solid' &&
              parseFloat(getComputedStyle(e).outlineWidth) >= 2,
          ),
        );
        if (width === 390)
          assert(
            await p.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
            file + ' overflow',
          );
      }
      if (file === 'index' && width === 390) {
        await p.locator('#filtertoggle').focus();
        await p.keyboard.press('Enter');
        assert(await p.locator('.mobile-filters').isVisible());
        await p.keyboard.press('Tab');
        assert(
          await p.evaluate(() =>
            document
              .querySelector('.mobile-filters')
              .contains(document.activeElement),
          ),
        );
        await p.keyboard.press('Escape');
        assert(!(await p.locator('.mobile-filters').isVisible()));
        assert.equal(
          await p.evaluate(() => document.activeElement.id),
          'filtertoggle',
        );
        const first = p.locator('#tablebody [data-exp]').first();
        await first.focus();
        await p.keyboard.press('Enter');
        assert(await p.locator('.mobile-match').isVisible());
        await p.keyboard.press('Escape');
        assert(!(await p.locator('.mobile-match').isVisible()));
        assert(
          await p.evaluate(() =>
            document.activeElement.hasAttribute('data-exp'),
          ),
        );
      }
      if (file === 'rankings') {
        assert(await p.locator('#slider').getAttribute('aria-valuetext'));
        await p.locator('#play').click();
        assert.equal(
          await p.locator('#play').getAttribute('aria-pressed'),
          'true',
        );
        await p.emulateMedia({ reducedMotion: 'reduce' });
        await p.waitForFunction(() => document.querySelector('#play').disabled);
        assert(await p.locator('#play').isDisabled());
        assert.equal(
          await p.locator('#play').getAttribute('aria-pressed'),
          'false',
        );
        assert(await p.locator('#motion-note').isVisible());
        const before = await p.locator('#datebox').inputValue();
        await p.locator('#next').click();
        assert.notEqual(await p.locator('#datebox').inputValue(), before);
        assert(await p.locator('#play').isDisabled());
        await p.emulateMedia({ reducedMotion: 'no-preference' });
        await p.waitForFunction(
          () => !document.querySelector('#play').disabled,
        );
        assert(!(await p.locator('#play').isDisabled()));
        assert(!(await p.locator('#motion-note').isVisible()));
        assert.equal(
          await p.locator('#play').getAttribute('aria-pressed'),
          'false',
        );
      }
      assert.deepEqual(errors, [], file);
      await p.close();
    }
  await b.close();
  console.log(
    'PASS accessibility: named controls/navigation, theme state, focus indicators in both themes, mobile keyboard dialogs/focus return, reduced-motion playback and manual stepping, desktop/phone widths.',
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

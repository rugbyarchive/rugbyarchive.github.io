const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const b = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || 'msedge',
    headless: true,
  });
  const selectors = {
    index: '#side-label,#side-note,.arrow',
    'head-to-head':
      '.h2h .rk,.res,.tag.rwc,.chartbox .axis,.chartbox .endlabel,#swap',
    rankings: '.lastmatches li span,.arrow',
    scoring: '.bd,#src,#goalsnote,.flipmark',
    about: '.about-intro h2',
  };
  for (const theme of ['terminal', 'light'])
    for (const [file, selector] of Object.entries(selectors)) {
      const p = await b.newPage();
      await p.route(/cloudflareinsights|formspree/, (r) => r.abort());
      await p.goto(process.env.SITE_URL + file + '.html');
      await p.locator('#themeswitch [data-theme="' + theme + '"]').click();
      if (file === 'head-to-head')
        await p.evaluate(() =>
          window.__H2H.set({ a: 'France', b: 'New Zealand' }),
        );
      const pairs = await p.evaluate((selector) => {
        function rgb(s) {
          return (s.match(/[\d.]+/g) || []).map(Number);
        }
        function lum(c) {
          return c
            .slice(0, 3)
            .map((v) => {
              v /= 255;
              return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            })
            .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
        }
        return [...document.querySelectorAll(selector + ',#themeswitch button')]
          .filter(
            (e) => e.getBoundingClientRect().width && e.textContent.trim(),
          )
          .map((e) => {
            const s = getComputedStyle(e);
            let bg = [255, 255, 255],
              opacity = 1;
            for (let n = e; n; n = n.parentElement) {
              const ns = getComputedStyle(n),
                c = rgb(ns.backgroundColor);
              if (c.length === 3 || c[3] === 1) {
                bg = c;
                break;
              }
            }
            for (let n = e; n; n = n.parentElement)
              opacity *= Number(getComputedStyle(n).opacity);
            let fg = rgb(e.tagName.toLowerCase() === 'text' ? s.fill : s.color);
            fg = fg.map((v, i) =>
              i < 3 ? v * opacity + bg[i] * (1 - opacity) : v,
            );
            const a = lum(fg),
              z = lum(bg),
              ratio = (Math.max(a, z) + 0.05) / (Math.min(a, z) + 0.05);
            const symbolic = /^[▲▼⇄▸]+$/.test(e.textContent.trim()),
              large = parseFloat(s.fontSize) >= 24;
            return {
              text: e.textContent.trim().slice(0, 55),
              class: e.className.baseVal || e.className,
              ratio,
              required: symbolic || large ? 3 : 4.5,
            };
          });
      }, selector);
      assert(pairs.length > 2);
      for (const pair of pairs)
        assert(
          pair.ratio >= pair.required,
          JSON.stringify({ theme, file, ...pair }),
        );
      await p.close();
    }
  await b.close();
  console.log(
    'PASS contrast: inactive-filter explanation, both theme switches, table metadata, result badges, chart labels/symbols and About heading meet measured ratios in both themes.',
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

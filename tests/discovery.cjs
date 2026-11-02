const { chromium } = require('playwright'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm');
(async () => {
  const root = path.resolve(__dirname, '..'),
    ctx = { window: {} };
  vm.runInNewContext(
    fs.readFileSync(path.join(root, 'data/archive-data.js'), 'utf8'),
    ctx,
  );
  const d = ctx.window.RUGBY_DATA,
    f = Object.fromEntries(d.fields.map((n, i) => [n, i]));
  const b = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || 'msedge',
    headless: true,
  });
  const pairs = [
    ['team/fiji.html', 'Fiji'],
    ['team/japan.html', 'Japan'],
    ['team/south-africa.html', 'South Africa'],
    ['rivalry/japan-fiji.html', 'Japan', 'Fiji'],
    ['rivalry/france-new-zealand.html', 'France', 'New Zealand'],
    ['rivalry/australia-south-africa.html', 'Australia', 'South Africa'],
  ];
  for (const [url, a, c] of pairs) {
    const ai = d.lookups.teams.indexOf(a),
      bi = c ? d.lookups.teams.indexOf(c) : null;
    const rows = d.rows.filter(
      (r) =>
        [r[f.home], r[f.away]].includes(ai) &&
        (bi === null || [r[f.home], r[f.away]].includes(bi)),
    );
    const p = await b.newPage({
      javaScriptEnabled: false,
      viewport: { width: 390, height: 844 },
    });
    await p.goto(process.env.SITE_URL + url);
    assert(
      (await p.locator('main').innerText()).includes(
        rows.length.toLocaleString('en-GB') + ' recorded matches',
      ),
    );
    assert.equal(
      await p.locator('link[rel=canonical]').getAttribute('href'),
      'https://rugbyarchive.github.io/' + url,
    );
    assert.equal(
      await p.locator('tbody tr').count(),
      Math.min(12, rows.length),
    );
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await p.close();
  }
  for (const name of ['index', 'about']) {
    const p = await b.newPage({ javaScriptEnabled: false });
    await p.goto(process.env.SITE_URL + name + '.html');
    const schema = JSON.parse(
      await p.locator('#archive-dataset').textContent(),
    );
    assert.equal(schema['@type'], 'Dataset');
    assert.equal(schema.temporalCoverage.split('/')[1], d.meta.last_match);
    assert(await p.locator('#discovery-links a').isVisible());
    await p.close();
  }
  const xml = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  assert(!xml.includes('report.html'));
  for (const [url] of pairs) assert(xml.includes(url));
  assert.equal(
    (xml.match(/<loc>/g) || []).length,
    (xml.match(/<lastmod>/g) || []).length,
  );
  await b.close();
  console.log(
    'PASS discovery: six static pages have source-derived counts, canonical URLs, match links, no-JS content, phone layout; Dataset metadata and sitemap entries present.',
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

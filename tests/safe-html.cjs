const assert = require('node:assert/strict'),
  vm = require('node:vm'),
  fs = require('node:fs'),
  path = require('node:path');
const context = { window: {}, URL };
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '../assets/safe-html.js'), 'utf8'),
  context,
);
const safe = context.window.RUGBY_SAFE;
assert.equal(safe.escape(`<&>"'`), '&lt;&amp;&gt;&quot;&#39;');
// Deliberate malicious fixture: the test proves it is rejected, never executed.
for (const url of [
  // eslint-disable-next-line no-script-url
  'javascript:alert(1)',
  'data:text/html,test',
  'http://example.com',
  '//example.com',
  'bad',
])
  assert.equal(safe.sourceURL(url), '');
assert.equal(
  safe.sourceURL('https://example.com/report?q=1'),
  'https://example.com/report?q=1',
);
console.log(
  'PASS safe HTML: text and both quote delimiters escaped; source URLs restricted to HTTPS.',
);

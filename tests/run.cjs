const { spawnSync, fork } = require('node:child_process');
const path = require('node:path');
(async () => {
  let server;
  const env = { ...process.env };
  if (!env.SITE_URL) {
    server = fork(path.join(__dirname, 'server.cjs'));
    env.SITE_URL = await new Promise((resolve, reject) => {
      server.once('message', resolve);
      server.once('error', reject);
    });
  }
  let status = 0;
  try {
    for (const name of [
      'safe-html',
      'share-links',
      'archive-loading',
      'rankings-links',
      'accessibility',
      'supporting-pages',
      'security-policy',
      'discovery',
      'mobile-meetings',
      'mobile-opponents',
      'mobile-chart',
    ]) {
      const result = spawnSync(
        process.execPath,
        [path.join(__dirname, name + '.cjs')],
        { stdio: 'inherit', env },
      );
      if (result.error) throw result.error;
      if (result.status !== 0) {
        status = result.status || 1;
        break;
      }
    }
  } finally {
    if (server) server.kill();
  }
  process.exitCode = status;
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

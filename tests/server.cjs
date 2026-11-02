const http = require('node:http'),
  fs = require('node:fs'),
  path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml',
};
const server = http.createServer((req, res) => {
  let file;
  try {
    file = path.resolve(
      root,
      '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname),
    );
  } catch (_) {
    res.writeHead(400);
    res.end();
    return;
  }
  if (file !== root && !file.startsWith(root + path.sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (file === root) file = path.join(root, 'index.html');
  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.setHeader(
      'Content-Type',
      types[path.extname(file)] || 'application/octet-stream',
    );
    res.end(data);
  });
});
server.listen(process.env.TEST_PORT || 0, '127.0.0.1', () => {
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  if (process.send) process.send(url);
  else console.log(url);
});
process.on('disconnect', () => server.close());

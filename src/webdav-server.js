/**
 * Minimal WebDAV server for opencode-sync testing.
 * Supports: PROPFIND, GET, PUT, MKCOL
 * Usage: node src/webdav-server.js <port> <rootDir>
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.argv[2]) || 8080;
const ROOT = path.resolve(process.argv[3] || process.env.TEMP + '/opencode-sync-webdav');

if (!fs.existsSync(ROOT)) fs.mkdirSync(ROOT, { recursive: true });

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath);
  const normalized = path.normalize(decoded).replace(/^[/\\]+/, '');
  const full = path.join(ROOT, normalized);
  if (!full.startsWith(ROOT)) return null;
  return full;
}

function propfindXml(filePath, stat, urlPath) {
  const name = path.basename(filePath) || path.basename(ROOT);
  const isDir = stat.isDirectory();
  const mtime = stat.mtime.toUTCString();
  const size = stat.size;
  return `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>${urlPath || '/'}</d:href>
    <d:propstat>
      <d:prop>
        <d:displayname>${name}</d:displayname>
        <d:resourcetype>${isDir ? '<d:collection/>' : ''}</d:resourcetype>
        <d:getcontentlength>${isDir ? 0 : size}</d:getcontentlength>
        <d:getlastmodified>${mtime}</d:getlastmodified>
        <d:getcontenttype>${isDir ? '' : 'application/json'}</d:getcontenttype>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`;
}

function multiStatusXml(items) {
  const resps = items.map(({ name, stat, href }) => `
  <d:response>
    <d:href>${href}</d:href>
    <d:propstat>
      <d:prop>
        <d:displayname>${name}</d:displayname>
        <d:resourcetype>${stat.isDirectory() ? '<d:collection/>' : ''}</d:resourcetype>
        <d:getcontentlength>${stat.isDirectory() ? 0 : stat.size}</d:getcontentlength>
        <d:getlastmodified>${stat.mtime.toUTCString()}</d:getlastmodified>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>`).join('');
  return `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">${resps}
</d:multistatus>`;
}

const server = http.createServer((req, res) => {
  const filePath = safePath(req.url);
  if (!filePath) { res.writeHead(403); res.end('Forbidden'); return; }

  const method = req.method.toUpperCase();
  console.log(`${method} ${req.url}`);

  if (method === 'PROPFIND') {
    try {
      if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not Found'); return; }
      const stat = fs.statSync(filePath);
      if (req.headers.depth === '0') {
        res.writeHead(207, { 'Content-Type': 'application/xml; charset=utf-8' });
        res.end(propfindXml(filePath, stat, req.url));
      } else {
        const entries = fs.readdirSync(filePath).map(name => {
          const full = path.join(filePath, name);
          const s = fs.statSync(full);
          const href = req.url.replace(/\/?$/, '/') + encodeURIComponent(name);
          return { name, stat: s, href };
        });
        // Include self
        entries.unshift({ name: path.basename(filePath) || '', stat, href: req.url });
        res.writeHead(207, { 'Content-Type': 'application/xml; charset=utf-8' });
        res.end(multiStatusXml(entries));
      }
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  } else if (method === 'GET' || method === 'HEAD') {
    try {
      if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not Found'); return; }
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) { res.writeHead(302, { Location: req.url.replace(/\/?$/, '/') }); res.end(); return; }
      const data = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': data.length });
      if (method === 'GET') res.end(data); else res.end();
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  } else if (method === 'PUT') {
    const dir = path.dirname(filePath);
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        try {
          fs.writeFileSync(filePath, Buffer.concat(chunks));
          res.writeHead(201);
          res.end();
        } catch (e) { res.writeHead(500); res.end(String(e)); }
      });
      req.on('error', e => { res.writeHead(500); res.end(String(e)); });
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  } else if (method === 'MKCOL') {
    try {
      if (fs.existsSync(filePath)) { res.writeHead(405); res.end('Method Not Allowed'); return; }
      fs.mkdirSync(filePath, { recursive: true });
      res.writeHead(201);
      res.end();
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  } else {
    res.writeHead(405);
    res.end('Method Not Allowed');
  }
});

server.listen(PORT, () => {
  console.log(`Minimal WebDAV server running on http://localhost:${PORT}`);
  console.log(`Root: ${ROOT}`);
});

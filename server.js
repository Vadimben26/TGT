// Local / non-Vercel server:  node server.js  ->  http://localhost:3000
// (On Vercel this file is not used: /public is served and /api/* are functions.)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeAvailability } from './lib/availability.js';

// load .env if present (no dependency)
const here = path.dirname(fileURLToPath(import.meta.url));
try {
  for (const line of fs.readFileSync(path.join(here, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

let cache = null;
const TTL = 5 * 60 * 1000;

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/availability') {
    try {
      if (!cache || Date.now() - cache.t > TTL) cache = { t: Date.now(), data: await computeAvailability() };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(cache.data));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: String(e.message || e) }));
    }
  }
  const file = path.join(here, 'public', url.pathname === '/' ? 'index.html' : path.normalize(url.pathname));
  if (!file.startsWith(path.join(here, 'public')) || !fs.existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(process.env.PORT || 3000, () => console.log(`TGT on http://localhost:${process.env.PORT || 3000}`));

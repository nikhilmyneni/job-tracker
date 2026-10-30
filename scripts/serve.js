// Tiny local server that behaves like the Vercel deploy: node scripts/serve.js  →  http://localhost:5173
// Static files from web/, /app and /app/* → web/app.html (as in vercel.json), and /api/* → the functions in web/api.
// Keys for the functions (GROQ_API_KEY, GEMINI_API_KEY…) come from .env.local in the repo root, never committed.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');
const port = Number(process.env.PORT) || 5173;
try {
  fs.readFileSync(path.join(root, '..', '.env.local'), 'utf8').split(/\r?\n/).forEach(l => {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(l);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
} catch (e) { /* no .env.local: the built-in AI answers "not set up" */ }
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain', '.xml': 'application/xml' };

async function api(name, url, req, res) {
  const file = path.join(root, 'api', name + '.js');
  if (!/^[a-z-]+$/.test(name) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  const { default: handler } = await import(pathToFileURL(file).href);
  const out = {
    status(c) { res.statusCode = c; return out; },
    setHeader(k, v) { res.setHeader(k, v); },
    json(b) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(b)); },
    end(s) { res.end(s); },
  };
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 200000) break; }
  let body = raw;
  try { if (/json/.test(req.headers['content-type'] || '')) body = JSON.parse(raw); } catch (e) { body = {}; }
  await handler({ method: req.method, query: Object.fromEntries(url.searchParams), headers: req.headers, body }, out);
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  if (p.startsWith('/api/')) { api(p.slice(5), url, req, res).catch(() => { res.writeHead(500).end(); }); return; }
  const rel = p === '/app' || p.startsWith('/app/') ? '/app.html' : p.endsWith('/') ? p + 'index.html' : p;
  const file = path.join(root, rel);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}).listen(port, () => console.log(`Job Hunter on http://localhost:${port}  (app: /app, demo: /app?demo)`));

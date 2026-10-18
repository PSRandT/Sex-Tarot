#!/usr/bin/env node
// 预览静态版（build/web/）。不依赖任何包。
//
//   node tools/serve-static.mjs [--port 8080]

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', 'build', 'web');

const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const PORT = portIdx > -1 ? Number(args[portIdx + 1]) : (Number(process.env.PORT) || 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

createServer(async (req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') u = '/index.html';
  const safe = normalize(u).replace(/^(\.\.[/\\])+/, '');
  try {
    const buf = await readFile(join(ROOT, safe));
    res.writeHead(200, {
      'Content-Type': MIME[extname(safe).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': /\.(png|jpe?g|webp|svg)$/i.test(safe) ? 'public, max-age=86400' : 'no-cache',
    });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
  }
}).listen(PORT, () => console.log(`静态预览： http://localhost:${PORT}`));

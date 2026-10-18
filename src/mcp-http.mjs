// 远程 MCP 的 HTTP 层（Streamable HTTP，无状态）
//
// 路由：
//   POST /mcp       MCP 端点（客户端填 https://<域名>/mcp/tarot/mcp）
//   GET  /cards/*   牌面图
//   GET  /health    存活检查
//   GET  /          在线体验页（静态 index.html）
//
// 只监听回环，公网入口由 nginx 反代。

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, '..', 'public');

const RATE_MAX = Number(process.env.TAROT_RATE || 60); // 每 IP 每小时 POST /mcp 次数
const BODY_MAX = 128 * 1024;
const DEV = !process.env.PUBLIC_BASE_URL;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

const hits = new Map(); // ip -> 时间戳数组

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff) return xff.split(',')[0].trim();
  return req.socket.remoteAddress || '?';
}

function rateOk(ip) {
  if (!RATE_MAX) return true;
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < 3600_000);
  if (arr.length >= RATE_MAX) { hits.set(ip, arr); return false; }
  arr.push(now);
  hits.set(ip, arr);
  return true;
}

setInterval(() => {
  const cutoff = Date.now() - 3600_000;
  for (const [ip, arr] of hits) {
    const kept = arr.filter(t => t > cutoff);
    if (kept.length) hits.set(ip, kept); else hits.delete(ip);
  }
}, 300_000).unref();

function send(res, code, type, body, extra = {}) {
  res.writeHead(code, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(body);
}

const json = (res, code, obj) =>
  send(res, code, 'application/json; charset=utf-8', JSON.stringify(obj));

const rpcError = (res, code, httpCode, msg) =>
  json(res, httpCode, { jsonrpc: '2.0', error: { code, message: msg }, id: null });

async function serveStatic(res, urlPath) {
  const safe = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  try {
    const buf = await readFile(join(PUBLIC, safe));
    res.writeHead(200, {
      'Content-Type': MIME[extname(safe).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': /\.(png|jpe?g|webp|svg)$/i.test(safe) ? 'public, max-age=86400' : 'no-cache',
    });
    res.end(buf);
  } catch {
    send(res, 404, 'text/plain; charset=utf-8', '404');
  }
}

export async function startHttp({ buildServer }) {
  const port = Number(process.env.PORT || 5014);
  const host = process.env.HOST || '127.0.0.1';
  const baseUrl = (process.env.PUBLIC_BASE_URL || `http://${host}:${port}`).replace(/\/+$/, '');

  const server = http.createServer(async (req, res) => {
    const t0 = Date.now();
    const url = new URL(req.url, 'http://x');
    const p = url.pathname.replace(/\/+$/, '') || '/';
    res.on('finish', () => console.log(
      `[http] ${new Date().toISOString()} ${req.method} ${req.url} ${res.statusCode} ${Date.now() - t0}ms ${clientIp(req)}`));

    try {
      if (p === '/mcp') {
        // 浏览器直接打开端点时给个提示，AI 客户端用的是 POST
        if ((req.method === 'GET' || req.method === 'HEAD') && baseUrl && !DEV) {
          res.writeHead(302, { Location: `${baseUrl}/`, 'Cache-Control': 'no-store' });
          return res.end();
        }
        if (req.method !== 'POST') {
          res.setHeader('Allow', 'POST');
          return rpcError(res, -32000, 405, '本服务为无状态模式，只接受 POST');
        }
        const len = Number(req.headers['content-length'] || 0);
        if (len > BODY_MAX) return rpcError(res, -32600, 413, '请求体过大');
        if (!rateOk(clientIp(req)))
          return rpcError(res, -32000, 429, `请求过于频繁，每小时上限 ${RATE_MAX} 次，请稍后再试`);

        const mcp = buildServer();
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        res.on('close', () => { transport.close().catch(() => {}); mcp.close().catch(() => {}); });
        await mcp.connect(transport);
        return void await transport.handleRequest(req, res);
      }

      if (p === '/health') return json(res, 200, { ok: true, base: baseUrl });

      // 静态：/ 走 index.html，其余按路径取
      const rel = p === '/' ? '/index.html' : p;
      return await serveStatic(res, rel);
    } catch (err) {
      console.error('[http] 处理失败', req.method, req.url, err);
      if (!res.headersSent) rpcError(res, -32603, 500, '服务器内部错误');
    }
  });

  server.headersTimeout = 120_000;
  server.requestTimeout = 0; // SSE 长连接不能按普通请求超时掐断
  await new Promise((ok, no) => { server.once('error', no); server.listen(port, host, ok); });
  console.log(`[sex-tarot] HTTP MCP ready  http://${host}:${port}/mcp`);
  console.log(`[sex-tarot] 对外基址  ${baseUrl}`);
  return server;
}

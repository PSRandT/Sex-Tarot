#!/usr/bin/env node
// MCP server 入口
//
//   node src/mcp.mjs           stdio（本地客户端直连）
//   node src/mcp.mjs --http    Streamable HTTP（远程部署）

// Node 18 没有全局 crypto，MCP SDK 的 Streamable HTTP 传输会用到它。
// 必须在加载 SDK 之前补上，否则握手时抛 ReferenceError: crypto is not defined
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const argv = process.argv.slice(2);

const { buildServer } = await import('./mcp-server.mjs');

if (argv.includes('--http')) {
  const { startHttp } = await import('./mcp-http.mjs');
  await startHttp({ buildServer });
} else {
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const server = buildServer();
  await server.connect(new StdioServerTransport());
  console.error('[sex-tarot] MCP server ready on stdio');
}

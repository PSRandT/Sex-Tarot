#!/usr/bin/env node
// 构建纯静态版：把要发布的文件收进 build/web/，直接丢到任何静态站点根目录就能用。
//
//   node tools/build-static.mjs
//
// 做三件事：
//   1. data/cards.json → build/web/cards.json（唯一数据源，不再手工维护两份）
//   2. public/ 下的 index.html / deck-core.js / bg.jpg / cards/*.webp 拷过去
//   3. 量一遍体积，缺文件当场报错

import { readFile, writeFile, mkdir, copyFile, access, readdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PUB = join(ROOT, 'public');
const OUT = join(ROOT, 'build', 'web');

const FILES = ['index.html', 'deck-core.js', 'bg.jpg'];

async function exists(p) { try { await access(p); return true; } catch { return false; } }

async function main() {
  await mkdir(join(OUT, 'cards'), { recursive: true });

  for (const f of FILES) {
    const src = join(PUB, f);
    if (!await exists(src)) throw new Error(`缺文件：public/${f}`);
    await copyFile(src, join(OUT, f));
  }

  // 唯一数据源 → public/（HTTP 服务和远程 MCP 直接读这里）
  await copyFile(join(ROOT, 'data', 'cards.json'), join(PUB, 'cards.json'));
  // → build/web/（静态页读这个）
  await copyFile(join(ROOT, 'data', 'cards.json'), join(OUT, 'cards.json'));

  // 牌面：只要 webp
  const names = await readdir(join(PUB, 'cards'));
  const webps = names.filter(n => n.endsWith('.webp'));
  if (webps.length !== 22) {
    throw new Error(`public/cards 里应有 22 张 webp，实际 ${webps.length}`);
  }
  for (const n of webps) {
    await copyFile(join(PUB, 'cards', n), join(OUT, 'cards', n));
  }

  // 量体积
  let total = 0;
  for (const f of [...FILES, 'cards.json', ...webps.map(n => `cards/${n}`)]) {
    total += (await stat(join(OUT, f))).size;
  }
  console.log(`build/web 就绪：${FILES.length + 1 + webps.length} 个文件，${(total / 1024 / 1024).toFixed(2)} MB`);
  console.log(`本地预览： node tools/serve-static.mjs`);
}

main().catch(e => { console.error(e.message || e); process.exit(1); });

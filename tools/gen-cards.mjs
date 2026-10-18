#!/usr/bin/env node
// 22 张牌面高清重生成 —— 调 gpt-image-2
//
// 任何兼容 OpenAI Images 协议的中转站都能用，靠环境变量指定：
//
//   export IMAGE_API_KEY=sk-xxx
//   export IMAGE_BASE_URL=https://your-relay.example.com/v1   # 可省略
//   export IMAGE_MODEL=gpt-image-2                            # 可省略
//   node tools/gen-cards.mjs [--only 15] [--force]
//
// 风格锚：原始切图在 assets/original/，脚本会把每张原图当参考图一起发（/images/edits），
// 让它照着原来的构图和画风重画，只是分辨率拉高。

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'public', 'cards');
const ORIG = join(ROOT, 'assets', 'original');

const BASE = process.env.IMAGE_BASE_URL || 'https://api.openai.com/v1';
const MODEL = process.env.IMAGE_MODEL || 'gpt-image-2';
const KEY_ENV = 'IMAGE_API_KEY';

const SIZE = '1024x1536';

const STYLE = [
  'modern flat geometric vector illustration',
  'low-poly faceted color blocks, hard edges between tonal planes, no outlines',
  'monochromatic palette of deep navy, slate blue, ice blue and ivory white only',
  'double border: a thin dark slate outer line and a wide ivory inner margin',
  'roman numeral at the top of the border, card name in clean sans-serif capitals at the bottom',
  'subtle paper grain texture, symmetric centered composition, calm and ceremonial',
].join(', ');

const SCENES = {
  'the-fool': 'a young traveller in flowing robes standing at the edge of a cliff looking up at a huge pale sun, a small white dog beside him',
  'the-magician': 'a standing robed figure with an infinity symbol above the head, one hand raised to the sky, a stone table below holding a cup, a sword and a coin',
  'the-high-priestess': 'a seated veiled figure in long robes between a black pillar and a white pillar, crescent moon at her feet, a scroll in her hands',
  'the-empress': 'a crowned woman in a flowing gown wearing a star crown seated among lush plants, holding a sceptre, a great circle of light behind her',
  'the-emperor': 'a stern bearded king in armour seated on a stone throne, holding a sceptre, angular and rigid',
  'the-hierophant': 'a robed elder wearing a triple tiered crown seated between two stone pillars, right hand raised with two fingers extended in a gesture of blessing, two smaller robed attendants kneeling in front, crossed keys on the floor',
  'the-lovers': 'a man and a woman in simple draped garments facing each other under a great winged angel',
  'the-chariot': 'an armoured charioteer standing in a chariot pulled by a black horse and a white horse, an eight pointed star above',
  'strength': 'a woman in a light gown with an infinity symbol above her head gently closing the jaws of a white lion',
  'the-hermit': 'a cloaked old man walking to the left, holding up a lantern with a glowing star inside',
  'wheel-of-fortune': 'a great eight spoked wheel covered in mystic symbols at the centre, winged creatures in the four corners',
  'justice': 'a seated figure in long robes holding a sword in the right hand and a pair of scales in the left, blindfolded',
  'the-hanged-man': 'a figure in simple garments suspended upside down by one ankle from a living tree branch, the other leg crossed, a bright halo around the head',
  'death': 'a skeletal knight in black armour riding a white horse, carrying a black banner bearing a white five petalled rose',
  'temperance': 'a winged angel in flowing robes standing at the water edge pouring water from one cup into another, a vertical stream between them',
  'the-devil': 'an imposing horned winged figure above an inverted five pointed star, two small chained figures kneeling below in shadow',
  'the-tower': 'a tall stone tower struck by lightning, breaking apart, two small figures falling from the windows',
  'the-star': 'a woman in a flowing gown kneeling by the water pouring water from two jugs, one great eight pointed star and seven small stars above',
  'the-moon': 'a moon half bright half dark in the sky, a dog and a wolf howling at it below, two towers and a path between them',
  'the-sun': 'a great radiant sun above sunflowers and a child in a light tunic riding a white horse with a red banner',
  'judgement': 'an angel in the sky blowing a trumpet, robed figures below rising with arms outstretched',
  'the-world': 'a dancer in flowing robes at the centre surrounded by a great oval wreath, a bull, a lion, an eagle and an angel head in the four corners',
};

async function exists(p) { try { await access(p); return true; } catch { return false; } }

// 判断「已生成过高清版」：宽度 >= 512（切出来的原图只有 ~185 宽）
async function isHiRes(p) {
  try {
    const buf = await readFile(p);
    // PNG: 宽高在 IHDR，偏移 16 开始 8 字节大端
    if (buf.length < 24 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return false;
    const w = buf.readUInt32BE(16);
    return w >= 512;
  } catch { return false; }
}

async function genOne(key, base, model, id, number, { force }) {
  const outPath = join(OUT, `${String(number).padStart(2, '0')}_${id}.png`);
  if (!force && await isHiRes(outPath)) {
    const st = await readFile(outPath).catch(() => null);
    if (st) {
      console.log(`跳过 ${id}（已是高清 ${Math.round(st.length / 1024)}KB）`);
      return { id, skipped: true };
    }
  }

  const prompt = `${STYLE}. Scene: ${SCENES[id]}. Vertical tarot card aspect ratio, full card with border, no text other than the roman numeral and the card name.`;

  const origPath = join(ORIG, `${id}.png`);
  let res;
  if (await exists(origPath)) {
    // 带参考图走 edits，锁住画风
    const buf = await readFile(origPath);
    const form = new FormData();
    form.append('model', model);
    form.append('prompt', prompt);
    form.append('size', SIZE);
    form.append('image', new Blob([buf], { type: 'image/png' }), `${id}.png`);
    res = await fetch(`${base}/images/edits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
  } else {
    res = await fetch(`${base}/images/generations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, size: SIZE, n: 1 }),
    });
  }

  if (!res.ok) {
    const body = await res.text();
    return { id, error: `HTTP ${res.status} ${body.slice(0, 300)}` };
  }
  const j = await res.json();
  const item = j?.data?.[0];
  if (!item) return { id, error: 'no data in response' };

  let bytes;
  if (item.b64_json) {
    bytes = Buffer.from(item.b64_json, 'base64');
  } else if (item.url) {
    const ir = await fetch(item.url);
    bytes = Buffer.from(await ir.arrayBuffer());
  } else {
    return { id, error: 'no b64_json or url' };
  }
  await mkdir(OUT, { recursive: true });
  await writeFile(outPath, bytes);
  return { id, bytes: bytes.length };
}

async function main() {
  const args = process.argv.slice(2);

  const key = process.env[KEY_ENV];
  if (!key) { console.error(`缺少密钥环境变量 ${KEY_ENV}`); process.exit(2); }

  const only = (() => { const i = args.indexOf('--only'); return i > -1 ? args[i + 1].split(',') : null; })();
  const force = args.includes('--force');
  const pauseMs = (() => { const i = args.indexOf('--pause'); return i > -1 ? Number(args[i + 1]) : 8000; })();

  console.log(`模型 ${MODEL} | 尺寸 ${SIZE} | 间隔 ${pauseMs}ms`);

  const deck = JSON.parse(await readFile(join(ROOT, 'data', 'cards.json'), 'utf8'));
  const results = [];
  for (const card of deck) {
    if (only && !only.includes(String(card.number)) && !only.includes(card.id)) continue;
    const t0 = Date.now();
    const r = await genOne(key, BASE, MODEL, card.id, card.number, { force });
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    results.push({ ...r, number: card.number });
    console.log(`[${card.number}] ${card.id}: ${r.error ? '✗ ' + r.error : r.skipped ? 'skip' : `✓ ${Math.round(r.bytes / 1024)}KB`} (${dt}s)`);
    if (r.error && /account_busy|503/.test(r.error)) {
      console.log('  → 上游忙，等 45 秒再继续');
      await new Promise(r => setTimeout(r, 45000));
    } else {
      await new Promise(r => setTimeout(r, pauseMs));
    }
  }

  const ok = results.filter(r => r.bytes || r.skipped).length;
  const bad = results.filter(r => r.error);
  console.log(`\n完成 ${ok}/${results.length}${bad.length ? '，失败：' + bad.map(b => b.id).join(', ') : ''}`);
  if (bad.length) process.exitCode = 1;
}

main().catch(e => { console.error(e); process.exit(1); });

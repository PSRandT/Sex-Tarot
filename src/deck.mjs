// Node 侧的牌组加载 + 抽牌（浏览器用的是 public/deck-core.js，同一份逻辑）

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { drawFrom, POSITIONS, STATE_LABELS, cardImage, toText } from '../public/deck-core.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data', 'cards.json');

export { POSITIONS, STATE_LABELS, toText, cardImage };

let _cards = null;

export function loadDeck() {
  if (_cards) return _cards;
  const raw = JSON.parse(readFileSync(DATA, 'utf8'));
  if (!Array.isArray(raw) || raw.length !== 22) {
    throw new Error(`牌组必须是 22 张，实际 ${raw?.length}`);
  }
  _cards = raw;
  return _cards;
}

export function draw(rand = Math.random) {
  const cards = drawFrom(loadDeck(), rand).map(c => ({
    ...c,
    image: '/' + cardImage({ number: c.number, id: c.id }),
  }));
  return cards;
}

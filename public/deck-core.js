// 抽牌核心 —— 浏览器和 Node 共用同一份
// 三个牌位固定挂在 md 的三栏上：过去=身份设定、现在=关系、未来=play

export const POSITIONS = [
  { key: 'past',   label: '过去', state: 'relationship' },
  { key: 'now',    label: '现在', state: 'emotion' },
  { key: 'future', label: '未来', state: 'play' },
];

export const STATE_LABELS = {
  relationship: '身份设定',
  emotion: '关系',
  play: 'play',
};

export function cardImage(card) {
  return `cards/${String(card.number).padStart(2, '0')}_${card.id}.webp`;
}

/**
 * 抽三张：互不重复，每个牌位各 50% 正逆位。
 * @param {Array} deck 22 张牌
 * @param {() => number} rand 0..1 的随机源
 */
export function drawFrom(deck, rand = Math.random) {
  if (!Array.isArray(deck) || deck.length !== 22) {
    throw new Error(`牌组必须是 22 张，实际 ${deck?.length}`);
  }
  const pool = deck.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = pool.slice(0, 3);

  return POSITIONS.map((pos, i) => {
    const card = picked[i];
    const reversed = rand() < 0.5;
    const orientation = reversed ? 'reversed' : 'upright';
    const cell = card.states?.[pos.state]?.[orientation];
    if (!cell?.desc || !cell?.interpret) {
      throw new Error(`数据缺失：${card.id} / ${pos.state} / ${orientation}`);
    }
    return {
      position: pos.key,
      positionLabel: pos.label,
      state: pos.state,
      stateLabel: STATE_LABELS[pos.state],
      number: card.number,
      id: card.id,
      name: card.name,
      orientation,
      orientationLabel: reversed ? '逆位' : '正位',
      desc: cell.desc,
      interpret: cell.interpret,
      image: cardImage(card),
    };
  });
}

/** 给 MCP / LLM 看的纯文本 */
export function toText(result) {
  const lines = [];
  for (const r of result) {
    lines.push(`【${r.positionLabel}】${r.name} · ${r.orientationLabel}（${r.number}. ${r.name} / ${r.id}）`);
    lines.push(`  ${r.stateLabel}：${r.desc}`);
    lines.push(`  ${r.interpret}`);
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

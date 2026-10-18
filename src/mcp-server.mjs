// MCP server 的构建函数 —— stdio 和 HTTP 两种入口共用
// 工具定义只写一份，两处都吃同一个 buildServer()

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { draw, toText, POSITIONS, loadDeck, cardImage } from './deck.mjs';

const VERSION = '1.0.0';

export function buildServer() {
  const server = new McpServer({ name: 'sex-tarot', version: VERSION });

  // ── 抽三张 ──────────────────────────────────────────────
  server.tool(
    'draw_tarot',
    '抽三张塔罗牌（过去 / 现在 / 未来）。三张互不重复，每张各自 50% 概率正位或逆位。' +
    '三个牌位固定对应牌面的三栏：过去取「身份设定」、现在取「关系」、未来取「play」。',
    {
      format: z.enum(['text', 'json']).optional()
        .describe('输出格式：text 为给人看的纯文本（默认），json 为结构化数据'),
    },
    async ({ format }) => {
      const result = draw();
      if (format === 'json') {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ positions: POSITIONS.map(p => p.label), cards: result }, null, 2),
          }],
        };
      }
      return { content: [{ type: 'text', text: toText(result) }] };
    },
  );

  // ── 指定牌位单独抽 ───────────────────────────────────────
  server.tool(
    'draw_one',
    '只抽一个牌位。适合单独要一张牌（比如只问未来），不用凑满三张。',
    {
      position: z.enum(['past', 'now', 'future'])
        .describe('牌位：past 取身份设定、now 取关系、future 取 play'),
      format: z.enum(['text', 'json']).optional()
        .describe('输出格式：text（默认）或 json'),
    },
    async ({ position, format }) => {
      const idx = POSITIONS.findIndex(p => p.key === position);
      if (idx < 0) throw new Error(`未知牌位：${position}`);
      // 抽三张再取对应位，保证概率分布和 draw_tarot 一致
      const one = draw()[idx];
      if (format === 'json') {
        return { content: [{ type: 'text', text: JSON.stringify(one, null, 2) }] };
      }
      return { content: [{ type: 'text', text: toText([one]) }] };
    },
  );

  // ── 看牌组 ──────────────────────────────────────────────
  server.tool(
    'list_cards',
    '列出全部 22 张大阿卡纳（编号 / 中文名 / 英文 id），不带文案。',
    {},
    async () => {
      const deck = loadDeck();
      const lines = deck
        .slice()
        .sort((a, b) => a.number - b.number)
        .map(c => `${String(c.number).padStart(2, '0')}  ${c.name}  (${c.id})`);
      return { content: [{ type: 'text', text: `${deck.length} 张：\n${lines.join('\n')}` }] };
    },
  );

  // ── 看某张牌的全部文案 ───────────────────────────────────
  server.tool(
    'get_card',
    '取单张牌六个格子的完整文案（3 栏 × 正逆），用来查资料或自己拼解读。' +
    '参数可以是编号（0-21）或英文 id（如 the-fool）。',
    {
      card: z.string().describe('牌编号（0-21）或英文 id（如 the-fool）'),
    },
    async ({ card }) => {
      const deck = loadDeck();
      const key = String(card).trim().toLowerCase();
      const found = deck.find(c => String(c.number) === key || c.id === key || c.name === key);
      if (!found) throw new Error(`找不到这张牌：${card}`);

      const rows = [];
      const STATE_NAMES = { relationship: '身份设定', emotion: '关系', play: 'play' };
      for (const [state, label] of Object.entries(STATE_NAMES)) {
        for (const o of ['upright', 'reversed']) {
          const cell = found.states[state][o];
          rows.push(`【${label} · ${o === 'upright' ? '正位' : '逆位'}】`);
          rows.push(`  牌面：${cell.desc}`);
          rows.push(`  解读：${cell.interpret}`);
        }
      }
      const head = `${found.number}. ${found.name} (${found.id})  图：${cardImage(found)}`;
      return { content: [{ type: 'text', text: `${head}\n\n${rows.join('\n')}` }] };
    },
  );

  return server;
}

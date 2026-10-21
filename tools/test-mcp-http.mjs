// Real SDK handshake; optional JSONL wire log contains full tool responses.
import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const url = new URL(process.argv[2] || 'http://127.0.0.1:5014/mcp');
const wireLog = process.env.MCP_WIRE_LOG;
const record = data => {
  if (wireLog) appendFileSync(wireLog, JSON.stringify({ time: new Date().toISOString(), ...data }) + '\n');
};
const client = new Client({ name: 'sex-tarot-smoke', version: '1.0.0' });
let closing = false;
const transport = new StreamableHTTPClientTransport(url, {
  fetch: async (input, init) => {
    const headers = new Headers(init?.headers);
    const request = { method: init?.method || 'GET', url: String(input), body: init?.body,
      headers: Object.fromEntries(['accept', 'content-type', 'mcp-protocol-version']
        .filter(key => headers.has(key)).map(key => [key, headers.get(key)])) };
    record({ request });
    const response = await fetch(input, { ...init, signal: init?.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
    console.log(`${request.method} ${request.url} -> ${response.status} ${response.headers.get('content-type') || ''}`);
    record({ status: response.status, headers: Object.fromEntries(response.headers) });
    // GET SSE may stay open indefinitely. Only record finite POST responses.
    if (wireLog && request.method === 'POST') record({ responseBody: await response.clone().text() });
    return response;
  },
});
client.onerror = error => { if (!closing) console.error(`client: ${error.message}`); };
const timeout = setTimeout(() => { console.error('FAIL: overall timeout'); process.exit(1); }, 45000);
try {
  await client.connect(transport, { timeout: 15000 });
  console.log(`initialize PASS ${JSON.stringify(client.getServerVersion())}`);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(t => t.name).sort(), ['draw_tarot', 'draw_one', 'list_cards', 'get_card'].sort());
  for (const tool of tools) {
    assert.deepEqual(tool.annotations, { readOnlyHint: true, destructiveHint: false, openWorldHint: false });
    console.log(`${tool.name} annotations PASS`);
  }
  console.log(`tools/list PASS ${tools.map(t => t.name).join(',')}`);
  const call = async (name, args) => {
    const result = await client.callTool({ name, arguments: args });
    assert.ok(!result.isError, `${name} returned isError`);
    assert.ok(result.content?.length, `${name} has no content`);
    return result.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
  };
  const list = await call('list_cards', {});
  assert.equal(list.trim().split('\n').length, 23);
  assert.match(list, /^22 张：/);
  console.log('tools/call list_cards PASS count=22');
  const one = JSON.parse(await call('draw_one', { position: 'future', format: 'json' }));
  assert.equal(one.position, 'future');
  assert.equal(one.state, 'play');
  console.log('tools/call draw_one PASS position=future state=play');
  const spread = JSON.parse(await call('draw_tarot', { format: 'json' }));
  assert.equal(spread.cards.length, 3);
  assert.equal(new Set(spread.cards.map(c => c.id)).size, 3);
  assert.deepEqual(spread.cards.map(c => c.position), ['past', 'now', 'future']);
  assert.deepEqual(spread.cards.map(c => c.state), ['relationship', 'emotion', 'play']);
  console.log('tools/call draw_tarot PASS count=3 unique=3');
  const card = await call('get_card', { card: '0' });
  assert.equal((card.match(/【/g) || []).length, 6);
  console.log('tools/call get_card PASS cells=6');
} catch (error) {
  console.error(`FAIL ${error.stack}`);
  process.exitCode = 1;
} finally {
  closing = true;
  await client.close();
  clearTimeout(timeout);
}

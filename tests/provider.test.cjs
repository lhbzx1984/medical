const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadTs } = require('./load-ts.cjs');

test('text calls always have a bounded abort signal', async () => {
  const original = global.fetch;
  const saved = process.env.AGNES_API_KEY;
  process.env.AGNES_API_KEY = 'local-fixture';
  let signal;
  global.fetch = async (_url, init) => { signal = init.signal; return Response.json({ choices: [{ message: { content: 'ok' } }] }); };
  try {
    await loadTs('src/lib/agnes.ts').agnesChat([{ role: 'user', content: 'test' }]);
    assert.ok(signal instanceof AbortSignal);
  } finally { global.fetch = original; if (saved === undefined) delete process.env.AGNES_API_KEY; else process.env.AGNES_API_KEY = saved; }
});

test('ending a streaming iterator cancels its upstream body', async () => {
  let cancelled = false;
  const body = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"one"}}]}\n\n')); }, cancel() { cancelled = true; } });
  const iterator = loadTs('src/lib/agnes.ts').iterateAgnesDelta(new Response(body));
  assert.equal((await iterator.next()).value, 'one');
  await iterator.return();
  assert.equal(cancelled, true);
});

test('provider SSE errors are surfaced instead of a successful empty answer', async () => {
  const response = new Response('data: {"error":{"message":"quota"}}\n\n');
  await assert.rejects(async () => { for await (const _part of loadTs('src/lib/agnes.ts').iterateAgnesDelta(response)) { void _part; } });
});

test('the DONE event terminates the upstream protocol', async () => {
  const response = new Response('data: [DONE]\n\ndata: {"choices":[{"delta":{"content":"late"}}]}\n\n');
  const parts = [];
  for await (const part of loadTs('src/lib/agnes.ts').iterateAgnesDelta(response)) parts.push(part);
  assert.deepEqual(parts, []);
});

test('an upstream EOF without DONE rejects instead of completing a partial answer', async () => {
  const response = new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n');
  const iterator = loadTs('src/lib/agnes.ts').iterateAgnesDelta(response);
  assert.equal((await iterator.next()).value, 'partial');
  await assert.rejects(iterator.next(), /回答意外中断，请重试/);
});

test('invalid provider image fields are rejected before image persistence', async () => {
  const original = global.fetch;
  const saved = process.env.AGNES_API_KEY;
  process.env.AGNES_API_KEY = 'local-fixture';
  let persisted = 0;
  const routes = loadTs('src/app/api/image/route.ts', {
    '@/lib/auth': { requireActor: async () => ({ id: 'owner', name: '测试用户', role: 'user' }) },
    '@/lib/store': { getStore: () => ({ consumeRateLimit: async () => true,
      addGeneratedImage: async () => { persisted++; return { id: 'image' }; } }) },
  });
  try {
    for (const item of [{url:42}, {url:{}}, {url:[]}, {url:'  '}, {b64_json:42}, null,
      { url: 'javascript:alert(1)' }, { url: 'file:///private/image.png' },
      { url: '/relative/image.png' }, { b64_json: 'invalid-base64!' }]) {
      global.fetch = async () => Response.json({ data: [item] });
      const response = await routes.POST(new Request('http://localhost/api/image', {
        method: 'POST', body: JSON.stringify({ prompt: '合成测试' }),
        headers: { 'Content-Type': 'application/json' },
      }));
      assert.equal(response.status, 502);
    }
    assert.equal(persisted, 0);
  } finally {
    global.fetch = original;
    if (saved === undefined) delete process.env.AGNES_API_KEY; else process.env.AGNES_API_KEY = saved;
  }
});

test('malformed non-streaming provider responses are reported as upstream errors', async () => {
  const original = global.fetch;
  const saved = process.env.AGNES_API_KEY;
  process.env.AGNES_API_KEY = 'local-fixture';
  const { agnesChat, agnesImage, AgnesError } = loadTs('src/lib/agnes.ts');
  try {
    for (const call of [() => agnesChat([{ role: 'user', content: 'test' }]), () => agnesImage({ prompt: 'test' })]) {
      for (const body of ['null', 'not json']) {
        global.fetch = async () => new Response(body);
        await assert.rejects(call(), (error) => error instanceof AgnesError && error.status === 502);
      }
    }
  } finally {
    global.fetch = original;
    if (saved === undefined) delete process.env.AGNES_API_KEY; else process.env.AGNES_API_KEY = saved;
  }
});

test('malformed SSE objects are surfaced as upstream errors', async () => {
  const { iterateAgnesDelta, AgnesError } = loadTs('src/lib/agnes.ts');
  for (const value of [null, 42, [], { choices: {} }, { choices: [{ delta: { content: {} } }] }]) {
    const response = new Response(`data: ${JSON.stringify(value)}\n\ndata: [DONE]\n\n`);
    await assert.rejects(async () => { for await (const part of iterateAgnesDelta(response)) void part; },
      (error) => error instanceof AgnesError && error.status === 502);
  }
});

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadTs } = require('./load-ts.cjs');
const { createFakeStore, routeMocks, withProvider } = require('./fake-store.cjs');

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
  const store = createFakeStore();
  const routes = loadTs('src/app/api/image/route.ts', routeMocks(store));
  const request = () => new Request('http://localhost/api/image', {
    method: 'POST', body: JSON.stringify({ prompt: '合成测试' }),
    headers: { 'Content-Type': 'application/json' },
  });
  for (const item of [{url:42}, {url:{}}, {url:[]}, {url:'  '}, {b64_json:42}, null,
    { url: 'javascript:alert(1)' }, { url: 'file:///private/image.png' },
    { url: '/relative/image.png' }, { b64_json: 'invalid-base64!' }]) {
    const response = await withProvider(async () => Response.json({ data: [item] }), () => routes.POST(request()));
    assert.equal(response.status, 502);
  }
  assert.equal(store.calls.images.length, 0);
});

test('image generation stores the picture under the signed-in account and still returns it when history fails', async () => {
  const store = createFakeStore();
  const routes = loadTs('src/app/api/image/route.ts', routeMocks(store));
  const request = (body) => new Request('http://localhost/api/image', {
    method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
  });
  const provider = async () => Response.json({ data: [{ url: 'https://images.example.invalid/one.png' }] });
  const ok = await withProvider(provider, () => routes.POST(request({ prompt: '合成测试', organId: 'stomach', style: 'teaching' })));
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).url, 'https://images.example.invalid/one.png');
  assert.equal(store.calls.images.length, 1);
  assert.match(store.calls.images[0].prompt, /胃/);
  assert.deepEqual(store.calls.quota, ['image']);
  store.addGeneratedImage = async () => { throw new Error('simulated history failure'); };
  const degraded = await withProvider(provider, () => routes.POST(request({ prompt: '合成测试' })));
  assert.equal(degraded.status, 200);
  for (const body of [{ prompt: '合成测试', size: '9K' }, { prompt: '合成测试', organId: 'spleen-of-glass' },
    { prompt: '合成测试', style: 'gory' }, { prompt: '' }, { prompt: 'x'.repeat(4001) }]) {
    assert.equal((await withProvider(provider, () => routes.POST(request(body)))).status, 400, JSON.stringify(body));
  }
});

test('an exhausted image quota stops before the provider is called', async () => {
  const store = createFakeStore({ quotas: { image: 0 } });
  const routes = loadTs('src/app/api/image/route.ts', routeMocks(store));
  let providerCalls = 0;
  const response = await withProvider(async () => { providerCalls++; return Response.json({ data: [] }); }, () =>
    routes.POST(new Request('http://localhost/api/image', {
      method: 'POST', body: JSON.stringify({ prompt: '合成测试' }), headers: { 'Content-Type': 'application/json' },
    })));
  assert.equal(response.status, 429);
  assert.equal(providerCalls, 0);
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

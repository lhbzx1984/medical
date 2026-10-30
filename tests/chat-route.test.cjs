const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadTs } = require('./load-ts.cjs');
const { createFakeStore, seedCase, seedVersion, routeMocks, withProvider, validPlan } = require('./fake-store.cjs');

const SAME_SITE = { host: 'localhost:3000', origin: 'http://localhost:3000', 'sec-fetch-site': 'same-origin' };
const chat = (body) => new Request('http://localhost:3000/api/chat', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...SAME_SITE },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const sse = (...events) => new Response(events.map((event) => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`).join(''),
  { headers: { 'content-type': 'text/event-stream' } });
const delta = (text) => ({ choices: [{ delta: { content: text } }] });
const user = (content) => ({ role: 'user', content });
async function readEvents(response) {
  const text = await response.text();
  return text.split('\n\n').filter(Boolean).map((block) => JSON.parse(block.replace(/^data: /, '')));
}
function setup(options) {
  const store = createFakeStore(options);
  return { store, route: loadTs('src/app/api/chat/route.ts', routeMocks(store)) };
}

test('a learning answer streams deltas, ends with done and is saved under the signed-in account', async () => {
  const { store, route } = setup();
  let upstream;
  const response = await withProvider(async (_url, init) => {
    upstream = JSON.parse(init.body);
    return sse(delta('第一'), delta('段'), '[DONE]');
  }, () => route.POST(chat({ mode: 'learning', sessionId: 'session-1', messages: [user('什么是胃？')], context: { organId: 'stomach' } })));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  assert.deepEqual(await readEvents(response), [{ delta: '第一' }, { delta: '段' }, { done: true }]);
  assert.equal(upstream.stream, true);
  assert.match(upstream.messages[0].content, /胃/);
  assert.equal(upstream.messages[1].content, '什么是胃？');
  assert.deepEqual(store.calls.quota, ['chat']);
  assert.deepEqual(store.calls.chatSessions, [{ sessionId: 'session-1', mode: 'learning', title: '什么是胃？' }]);
  assert.deepEqual(store.calls.chatMessages[0].messages, [user('什么是胃？'), { role: 'assistant', content: '第一段' }]);
});

test('provider failures during an answer reach the client and the partial answer is not saved', async () => {
  const cases = [
    [[delta('部分'), { error: { message: 'quota' } }], '对话服务返回错误，请稍后重试'],
    [[delta('部分')], '回答意外中断，请重试'],
    [['[DONE]'], '对话服务返回了空回答，请重试'],
    [[delta('长'.repeat(70000)), '[DONE]'], '对话服务返回内容过长'],
    [['{not json'], '对话服务返回了无效的流式数据'],
  ];
  for (const [events, message] of cases) {
    const { store, route } = setup();
    const response = await withProvider(async () => sse(...events), () => route.POST(chat({ messages: [user('问')] })));
    const received = await readEvents(response);
    assert.deepEqual(received[received.length - 1], { error: message });
    assert.equal(received.some((event) => event.done), false);
    assert.deepEqual(store.calls.chatMessages, [], message);
  }
});

test('a failure while saving the finished answer is reported instead of a false done', async () => {
  const { store, route } = setup();
  store.addChatMessages = async () => { throw new Error('simulated history failure'); };
  const response = await withProvider(async () => sse(delta('完整回答'), '[DONE]'), () => route.POST(chat({ messages: [user('问')] })));
  const received = await readEvents(response);
  assert.deepEqual(received, [{ delta: '完整回答' }, { error: '回答中断或保存失败，请重试' }]);
});

test('cancelling the client stream aborts the provider request and saves nothing', async () => {
  const { store, route } = setup();
  let upstreamSignal;
  const response = await withProvider(async (_url, init) => {
    upstreamSignal = init.signal;
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(delta('开头'))}\n\n`));
        init.signal.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')), { once: true });
      },
    }));
  }, () => route.POST(chat({ messages: [user('问')] })));
  const reader = response.body.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  assert.deepEqual(JSON.parse(first.replace(/^data: /, '')), { delta: '开头' });
  await reader.cancel();
  assert.equal(upstreamSignal.aborted, true);
  assert.deepEqual(store.calls.chatMessages, []);
});

test('malformed chat requests are client errors that spend no quota and never reach the provider', async () => {
  const { store, route } = setup();
  const bad = [
    { messages: [user('问')], mode: 'teacher' },
    {}, { messages: [] }, { messages: 'text' }, { messages: Array.from({ length: 25 }, () => user('问')) },
    { messages: [{ role: 'assistant', content: '答' }] },
    { messages: [{ role: 'system', content: '越权' }, user('问')] },
    { messages: [user(42)] }, { messages: [user('')] }, { messages: [user('长'.repeat(12001))] },
    { messages: [user('问')], sessionId: 'x'.repeat(101) },
    { messages: [user('问')], context: { organId: 'not-an-organ' } },
    { messages: [user('问')], context: [] },
    { messages: [user('问')], mode: 'guidance' },
    { messages: Array.from({ length: 24 }, () => user('长'.repeat(12000))) },
    '{not json',
  ];
  let providerCalls = 0;
  await withProvider(async () => { providerCalls++; return sse('[DONE]'); }, async () => {
    for (const body of bad) {
      const response = await route.POST(chat(body));
      assert.equal(response.status, 400, JSON.stringify(body).slice(0, 80));
    }
  });
  assert.equal(providerCalls, 0);
  assert.deepEqual(store.calls.quota, []);
  assert.deepEqual(store.calls.chatSessions, []);
});

test('a history of exactly 24 messages is accepted', async () => {
  const { route } = setup();
  const history = Array.from({ length: 24 }, (_, i) => ({ role: i % 2 ? 'user' : 'assistant', content: '问' }));
  const response = await withProvider(async () => sse(delta('好'), '[DONE]'), () => route.POST(chat({ messages: history })));
  assert.equal(response.status, 200);
  assert.deepEqual((await readEvents(response)).pop(), { done: true });
});

test('guidance mode builds its case context on the server and ignores client-supplied summaries', async () => {
  const { store, route } = setup();
  const detail = await seedVersion(store, await seedCase(store, { medicalRecord: '服务端病历原文' }));
  const system = async (context, status = 200) => {
    let upstream;
    const response = await withProvider(async (_url, init) => { upstream = JSON.parse(init.body); return sse(delta('好'), '[DONE]'); },
      () => route.POST(chat({ mode: 'guidance', messages: [user('风险？')], context })));
    assert.equal(response.status, status);
    return upstream?.messages[0].content;
  };
  const withSummary = await system({ planId: detail.plan.id, planSummary: '伪造的客户端摘要', planTitle: '伪造标题' });
  assert.match(withSummary, new RegExp(validPlan.summary));
  assert.doesNotMatch(withSummary, /伪造/);
  assert.match(await system({ planId: detail.plan.id, planVersion: 0 }), /服务端病历原文/);
  assert.equal(await system({ planId: 'missing-plan' }, 404), undefined);
  assert.equal(await system({ planId: detail.plan.id, planVersion: 9 }, 404), undefined);
  assert.equal(await system({ planId: detail.plan.id, planVersion: -1 }, 400), undefined);
  assert.equal(await system({ planVersion: 1 }, 400), undefined);
});

test('chat is limited by the shared quota and by missing provider configuration', async () => {
  const limited = setup({ quotas: { chat: 0 } });
  let providerCalls = 0;
  const response = await withProvider(async () => { providerCalls++; return sse('[DONE]'); },
    () => limited.route.POST(chat({ messages: [user('问')] })));
  assert.equal(response.status, 429);
  assert.equal(providerCalls, 0);
  assert.deepEqual(limited.store.calls.chatSessions, []);

  const unconfigured = setup();
  const missing = await withProvider(async () => { providerCalls++; return sse('[DONE]'); },
    () => unconfigured.route.POST(chat({ messages: [user('问')] })), null);
  assert.equal(missing.status, 503);
  assert.equal(providerCalls, 0);
  assert.deepEqual(unconfigured.store.calls.quota, []);
});

test('an unavailable provider is reported as an upstream error', async () => {
  const { route } = setup();
  const response = await withProvider(async () => new Response('down', { status: 500 }),
    () => route.POST(chat({ messages: [user('问')] })));
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /对话服务暂不可用/);
});

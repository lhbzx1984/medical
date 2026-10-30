const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadTs } = require('./load-ts.cjs');
const { createFakeStore, seedCase, seedVersion, routeMocks, withProvider, validPlan, validStep } = require('./fake-store.cjs');

const content = validPlan;
const step = validStep;
const { SIMULATION_SYSTEM } = loadTs('src/lib/planning-prompt.ts');
const SAME_SITE = { host: 'localhost:3000', origin: 'http://localhost:3000', 'sec-fetch-site': 'same-origin' };
const post = (path, body) => new Request(`http://localhost:3000${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...SAME_SITE },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const idContext = (id) => ({ params: Promise.resolve({ id }) });
const chatResponse = (output) => Response.json({ choices: [{ message: { content: JSON.stringify(output) } }] });
/** Stands in for the provider: the plan call and the simulation call are told apart by their system prompt. */
const modelStub = (plan = content, simulation = { steps: [step] }) => async (_url, init) => {
  const { messages } = JSON.parse(init.body);
  return chatResponse(messages[0].content === SIMULATION_SYSTEM ? simulation : plan);
};

async function quietly(action) {
  const original = console.error;
  console.error = () => {};
  try { return await action(); } finally { console.error = original; }
}

test('malformed simulation steps are rejected instead of fabricated into playable steps', () => {
  const { normalizeSimSteps } = loadTs('src/lib/planning-prompt.ts');
  for (const steps of [null, [], [null], [42], [{}], [{ ...step, name: {} }],
    [{ ...step, narration: '' }], [{ ...step, view: 'unknown' }],
    [{ ...step, durationSec: '10' }], [{ ...step, durationSec: Infinity }],
    [{ ...step, action: {} }], [{ ...step, instruments: [{}] }],
    Array.from({ length: 13 }, () => step)]) {
    assert.throws(() => normalizeSimSteps(steps), { name: 'Error' });
  }
});

test('simulation normalization preserves explicitly empty instrument lists', () => {
  const { normalizeSimSteps } = loadTs('src/lib/planning-prompt.ts');
  const [normalized] = normalizeSimSteps([{ ...step, instruments: [], action: 'none' }]);
  assert.deepEqual(normalized, { ...step, index: 1, instruments: [], action: 'none' });
  assert.deepEqual(normalizeSimSteps([step])[0].instruments, []);
});

/** Loads generatePlan with the model replaced; the same module graph serves every call. */
function generator(store, plan = content, simulation = { steps: [step] }) {
  const agnes = loadTs('src/lib/agnes.ts');
  let calls = 0;
  const { generatePlan } = loadTs('src/lib/plan-generation.ts', {
    ...routeMocks(store),
    '@/lib/agnes': { ...agnes, agnesConfigured: () => true,
      agnesChatJSON: async (messages) => { calls++; return messages[0].content === SIMULATION_SYSTEM ? simulation : plan; } },
  });
  return { generatePlan, calls: () => calls };
}

test('invalid AI simulation uses the existing plan-derived fallback and still commits one revision', async () => {
  const store = createFakeStore();
  const detail = await seedCase(store);
  const { generatePlan } = generator(store, content, { steps: [null] });
  const result = await generatePlan(store, detail, new AbortController().signal);
  assert.equal(result.simulation.steps.length, 2);
  assert.equal(result.simulation.steps[0].name, '体区定位');
  assert.equal(result.simulation.steps[1].name, '测试步骤');
  assert.equal(result.simulation.steps[1].narration, '核对解剖标志');
  const stored = await store.getPlanDetail(detail.plan.id);
  assert.equal(stored.plan.currentVersion, 1);
  assert.equal(stored.versions.length, 1);
  assert.equal(stored.simulations.length, 1);
  assert.equal(stored.simulations[0].version, stored.versions[0].version);
});

test('incomplete AI plans are upstream errors and nothing is committed', async () => {
  const store = createFakeStore();
  const detail = await seedCase(store);
  for (const broken of [{ ...content, steps: [] }, { ...content, focusOrgan: 'unknown-organ' }, { ...content, summary: '' }, null]) {
    const { generatePlan } = generator(store, broken);
    await assert.rejects(generatePlan(store, detail, new AbortController().signal), (error) => error.status === 502);
  }
  assert.equal(store.calls.saved.length, 0);
  assert.equal((await store.getPlanDetail(detail.plan.id)).plan.currentVersion, 0);
});

test('the AI quota is consumed once per generation and an exhausted quota stops before any model call', async () => {
  const store = createFakeStore({ quotas: { plan: 1 } });
  const detail = await seedCase(store);
  const { generatePlan, calls } = generator(store);
  await generatePlan(store, detail, new AbortController().signal);
  assert.deepEqual(store.calls.quota, ['plan']);
  const used = calls();
  const next = await store.getPlanDetail(detail.plan.id);
  await assert.rejects(generatePlan(store, next, new AbortController().signal), (error) => error.status === 429);
  assert.equal(calls(), used);
  assert.equal(store.calls.saved.length, 1);
});

test('feedback revisions are signed by the logged-in account, never by a name in the request', async () => {
  const store = createFakeStore({ actor: { id: 'owner-a', name: '登录专家' } });
  const detail = await seedVersion(store, await seedCase(store));
  const routes = loadTs('src/app/api/plans/[id]/feedback/route.ts', routeMocks(store));
  const response = await withProvider(modelStub({ ...content, changelog: '合成修订' }), () =>
    routes.POST(post(`/api/plans/${detail.plan.id}/feedback`, { comment: '合成反馈', version: 1, expertName: '伪造专家' }),
      idContext(detail.plan.id)));
  assert.equal(response.status, 200);
  const saved = store.calls.saved[0];
  assert.equal(saved.feedback.expertName, '登录专家');
  assert.equal(saved.feedback.version, 1);
  assert.equal(saved.version.version, 2);
  assert.equal(saved.version.source, 'expert_refine');
  assert.equal(saved.version.changelog, '合成修订');
  assert.equal(saved.simulation.version, 2);
  assert.equal(saved.expectedVersion, 1);
});

test('feedback and generation reject missing, stale or finalized input without calling the model', async () => {
  const store = createFakeStore();
  const empty = await seedCase(store);
  const generated = await seedVersion(store, await seedCase(store));
  const finalized = await seedVersion(store, await seedCase(store));
  store.rows.plans.get(finalized.plan.id).status = 'finalized';
  let providerCalls = 0;
  const feedback = loadTs('src/app/api/plans/[id]/feedback/route.ts', routeMocks(store));
  const generate = loadTs('src/app/api/plans/[id]/generate/route.ts', routeMocks(store));
  await withProvider(async () => { providerCalls++; return chatResponse(content); }, async () => {
    const send = (route, id, body) => route.POST(post(`/api/plans/${id}/x`, body), idContext(id));
    assert.equal((await send(feedback, generated.plan.id, undefined)).status, 400);
    assert.equal((await send(feedback, generated.plan.id, { comment: '', version: 1 })).status, 400);
    assert.equal((await send(feedback, generated.plan.id, { comment: '反馈', version: '1' })).status, 400);
    assert.equal((await send(feedback, generated.plan.id, { comment: 'x'.repeat(5001), version: 1 })).status, 400);
    assert.equal((await send(feedback, generated.plan.id, { comment: '反馈', version: 2 })).status, 409);
    assert.equal((await send(feedback, empty.plan.id, { comment: '反馈', version: 1 })).status, 400);
    assert.equal((await send(feedback, finalized.plan.id, { comment: '反馈', version: 1 })).status, 409);
    assert.equal((await send(feedback, 'missing-plan', { comment: '反馈', version: 1 })).status, 404);
    assert.equal((await send(generate, finalized.plan.id, undefined)).status, 409);
    assert.equal((await send(generate, 'missing-plan', undefined)).status, 404);
  });
  assert.equal(providerCalls, 0);
  assert.equal(store.calls.saved.length, 0);
  assert.deepEqual(store.calls.quota, []);
});

test('generation without a configured model key is a service error and spends no quota', async () => {
  const store = createFakeStore();
  const detail = await seedCase(store);
  const generate = loadTs('src/app/api/plans/[id]/generate/route.ts', routeMocks(store));
  const response = await withProvider(async () => { throw new Error('provider must not be called'); },
    () => generate.POST(post(`/api/plans/${detail.plan.id}/generate`), idContext(detail.plan.id)), null);
  assert.equal(response.status, 503);
  assert.deepEqual(store.calls.quota, []);
});

test('two concurrent generations commit one version and the other reports a conflict', async () => {
  const store = createFakeStore();
  const detail = await seedCase(store);
  const { generatePlan } = generator(store);
  const results = await Promise.allSettled([
    generatePlan(store, detail, new AbortController().signal),
    generatePlan(store, detail, new AbortController().signal),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.find((result) => result.status === 'rejected').reason.name, 'RevisionConflictError');
  const stored = await store.getPlanDetail(detail.plan.id);
  assert.equal(stored.plan.currentVersion, 1);
  assert.equal(stored.versions.length, 1);
  assert.equal(stored.simulations.length, 1);
  assert.equal(stored.feedbacks.length, 0);
});

test('a revision committed by another tab while the model runs surfaces as HTTP 409', async () => {
  const store = createFakeStore();
  const detail = await seedCase(store);
  const generate = loadTs('src/app/api/plans/[id]/generate/route.ts', routeMocks(store));
  const model = modelStub();
  const response = await withProvider(async (url, init) => {
    if (!store.rows.versions.length) await seedVersion(store, detail);
    return model(url, init);
  }, () => generate.POST(post(`/api/plans/${detail.plan.id}/generate`), idContext(detail.plan.id)));
  assert.equal(response.status, 409);
  const stored = await store.getPlanDetail(detail.plan.id);
  assert.equal(stored.plan.currentVersion, 1);
  assert.equal(stored.versions.length, 1);
});

for (const action of ['generate', 'feedback']) {
  test(`${action} shares one deadline across both AI calls and never commits an expired result`, async () => {
    const store = createFakeStore();
    let detail = await seedCase(store);
    if (action === 'feedback') detail = await seedVersion(store, detail);
    const originalTimeout = AbortSignal.timeout;
    const timers = [];
    let clock = 0;
    let calls = 0;
    AbortSignal.timeout = (milliseconds) => {
      const controller = new AbortController();
      timers.push({ expires: clock + milliseconds, controller });
      return controller.signal;
    };
    function advance(milliseconds) {
      clock += milliseconds;
      for (const timer of timers) if (timer.expires <= clock) {
        timer.controller.abort(new DOMException('Timed out', 'TimeoutError'));
      }
    }
    try {
      const routes = loadTs(`src/app/api/plans/[id]/${action}/route.ts`, routeMocks(store));
      const model = modelStub({ ...content, changelog: '合成修订' });
      const response = await quietly(() => withProvider(async (url, init) => {
        calls++;
        advance(calls === 1 ? 200_000 : 100_000);
        init.signal.throwIfAborted();
        return model(url, init);
      }, () => routes.POST(post(`/api/plans/${detail.plan.id}/${action}`,
        action === 'feedback' ? { comment: '合成反馈', version: 1 } : undefined), idContext(detail.plan.id))));
      assert.equal(response.status, 504);
      assert.equal(calls, 2);
      const stored = await store.getPlanDetail(detail.plan.id);
      assert.equal(stored.plan.currentVersion, action === 'feedback' ? 1 : 0);
      assert.equal(stored.feedbacks.length, 0);
      assert.equal(store.calls.saved.length, 0);
    } finally { AbortSignal.timeout = originalTimeout; }
  });
}

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadTs } = require('./load-ts.cjs');

const content = {
  summary: '合成测试方案', diagnosis: '测试', procedureName: '测试术式',
  anesthesia: '测试', position: '测试', approach: '测试', region: '腹腔',
  instruments: [], steps: [{ name: '测试步骤', detail: '核对解剖标志', keyPoints: [] }],
  risks: [], postop: ['观察'], focusOrgan: 'intestine', simulationNotes: '',
};
const step = { name: '体位摆放', narration: '核对体位与手术区域', view: 'overview', durationSec: 10 };

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

test('invalid AI simulation uses the existing plan-derived fallback', async () => {
  const { MemoryStore } = loadTs('src/lib/store/memory.ts');
  const store = new MemoryStore();
  const actor = { id: 'invalid-simulation-owner', name: '合成用户', role: 'user' };
  const { plan } = await store.createCase({ name: '合成患者', ownerId: actor.id });
  const detail = await store.getPlanDetail(plan.id, actor.id);
  let call = 0;
  const { generatePlan } = loadTs('src/lib/plan-generation.ts', {
    './agnes': { agnesConfigured: () => true, agnesChatJSON: async () => ++call === 1 ? content : { steps: [null] } },
    './store': { getStore: () => store },
    './knowledge': { getRetriever: () => ({ retrieve: async () => [] }) },
  });
  const result = await generatePlan(detail, actor, new AbortController().signal);
  assert.equal(result.simulation.steps.length, 2);
  assert.equal(result.simulation.steps[0].name, '体区定位');
  assert.equal(result.simulation.steps[1].name, '测试步骤');
  assert.equal(result.simulation.steps[1].narration, '核对解剖标志');
  assert.equal((await store.getPlanDetail(plan.id, actor.id)).plan.currentVersion, 1);
});

for (const action of ['generate', 'feedback']) {
  test(`${action} shares one deadline across both AI calls and never commits an expired result`, async () => {
    const { MemoryStore } = loadTs('src/lib/store/memory.ts');
    const store = new MemoryStore();
    const actor = { id: `deadline-${action}-owner`, name: '合成专家', role: 'expert' };
    const { plan } = await store.createCase({ name: '合成患者', ownerId: actor.id });
    if (action === 'feedback') {
      await store.commitPlan({ planId: plan.id, ownerId: actor.id, expectedVersion: 0,
        content, changelog: '初版', source: 'ai', knowledgeUsed: [],
        simulation: { focusOrgan: 'intestine', region: '腹腔', steps: [step] } });
    }
    const originalFetch = global.fetch;
    const originalTimeout = AbortSignal.timeout;
    const savedKey = process.env.AGNES_API_KEY;
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
    global.fetch = async (_url, init) => {
      calls++;
      advance(calls === 1 ? 200_000 : 100_000);
      init.signal.throwIfAborted();
      const output = calls === 1 ? { ...content, changelog: '合成修订' } : { steps: [step] };
      return Response.json({ choices: [{ message: { content: JSON.stringify(output) } }] });
    };
    process.env.AGNES_API_KEY = 'local-fixture';
    try {
      const routes = loadTs(`src/app/api/plans/[id]/${action}/route.ts`, {
        '@/lib/auth': { requireActor: async () => actor },
        '@/lib/store': { getStore: () => store }, './store': { getStore: () => store },
        './knowledge': { getRetriever: () => ({ retrieve: async () => [] }) },
      });
      const response = await routes.POST(new Request(`http://localhost/api/plans/${plan.id}/${action}`, {
        method: 'POST', ...(action === 'feedback' ? { body: JSON.stringify({ comment: '合成反馈', baseVersion: 1 }) } : {}),
      }), { params: Promise.resolve({ id: plan.id }) });
      assert.equal(response.status, 504);
      assert.equal(calls, 2);
      const detail = await store.getPlanDetail(plan.id, actor.id);
      assert.equal(detail.plan.currentVersion, action === 'feedback' ? 1 : 0);
      assert.equal(detail.feedbacks.length, 0);
    } finally {
      global.fetch = originalFetch;
      AbortSignal.timeout = originalTimeout;
      if (savedKey === undefined) delete process.env.AGNES_API_KEY; else process.env.AGNES_API_KEY = savedKey;
    }
  });
}

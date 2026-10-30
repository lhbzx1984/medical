// Synthetic stand-in for SupabaseStore used by route tests. Rows live in memory and the store
// raises the same error classes the real store maps from database error codes. It does not model
// row-level security: ownership isolation is covered by the SQL tests that run supabase/schema.sql.
const { loadTs } = require('./load-ts.cjs');

function createFakeStore({ actor = { id: 'owner-a', name: '合成专家' }, quotas = {}, knowledge = [] } = {}) {
  const { RevisionConflictError, CaseNotFoundError } = loadTs('src/lib/store/supabase.ts');
  const patients = new Map();
  const plans = new Map();
  const versions = [];
  const feedbacks = [];
  const simulations = [];
  const used = {};
  const calls = { quota: [], saved: [], images: [], chatSessions: [], chatMessages: [] };
  let seq = 0;
  const nextId = (prefix) => `${prefix}-${++seq}`;
  const stamp = () => new Date(Date.UTC(2026, 9, 30, 8, 0, 0) + ++seq * 1000).toISOString();

  return {
    kind: 'supabase', actor, calls, rows: { patients, plans, versions, feedbacks, simulations },
    async createPatient(input) {
      const patient = { id: nextId('patient'), name: input.name, gender: input.gender ?? '', age: input.age ?? 0,
        medicalRecord: input.medicalRecord ?? '', preliminaryPlan: input.preliminaryPlan ?? '', createdAt: stamp() };
      patients.set(patient.id, patient);
      return structuredClone(patient);
    },
    async createPlan({ patientId, title }) {
      const patient = patients.get(patientId);
      const at = stamp();
      const plan = { id: nextId('plan'), patientId, title: title || `${patient?.name ?? '病例'}·手术规划`,
        patientName: patient?.name ?? '', diagnosis: '', status: 'draft', currentVersion: 0, archivedAt: null,
        finalizedVersion: null, finalizedAt: null, createdAt: at, updatedAt: at };
      plans.set(plan.id, plan);
      return structuredClone(plan);
    },
    async listPlans() { return structuredClone([...plans.values()]); },
    async getPlanDetail(planId) {
      const plan = plans.get(planId);
      const patient = plan && patients.get(plan.patientId);
      if (!plan || !patient) return null;
      return structuredClone({ plan, patient, versions: versions.filter((v) => v.planId === planId),
        feedbacks: feedbacks.filter((f) => f.planId === planId), simulations: simulations.filter((s) => s.planId === planId) });
    },
    async updateCase(planId, expectedUpdatedAt, input) {
      const plan = plans.get(planId);
      if (!plan) throw new CaseNotFoundError();
      if (plan.updatedAt !== expectedUpdatedAt) throw new RevisionConflictError();
      Object.assign(patients.get(plan.patientId), input, { name: input.name });
      plan.patientName = input.name;
      plan.updatedAt = stamp();
    },
    async consumeAiQuota(operation) {
      calls.quota.push(operation);
      used[operation] = (used[operation] ?? 0) + 1;
      return used[operation] <= (quotas[operation] ?? Infinity);
    },
    // Check and write happen without an await in between, like the database function's row lock.
    async saveRevision({ expectedVersion, expectedUpdatedAt, version, simulation, feedback }) {
      const plan = plans.get(version.planId);
      if (!plan) throw new CaseNotFoundError();
      if (plan.currentVersion !== expectedVersion || plan.updatedAt !== expectedUpdatedAt) throw new RevisionConflictError();
      calls.saved.push(structuredClone({ expectedVersion, expectedUpdatedAt, version, simulation, feedback }));
      versions.push(structuredClone(version));
      simulations.push(structuredClone(simulation));
      if (feedback) feedbacks.push(structuredClone(feedback));
      Object.assign(plan, { currentVersion: version.version, updatedAt: stamp(),
        status: version.source === 'expert_refine' ? 'refined' : 'simulated' });
    },
    async listKnowledge() { return structuredClone(knowledge); },
    async ensureChatSession(sessionId, mode, title) { calls.chatSessions.push({ sessionId, mode, title }); },
    async addChatMessages(sessionId, messages) { calls.chatMessages.push({ sessionId, messages: structuredClone(messages) }); },
    async addGeneratedImage(image) { calls.images.push(image); return { ...image, id: nextId('image'), createdAt: stamp() }; },
  };
}

/** A plan that passes the strict validation used for AI output. */
const validPlan = {
  summary: '合成测试方案', diagnosis: '测试', procedureName: '测试术式',
  anesthesia: '测试', position: '测试', approach: '测试', region: '腹腔',
  instruments: [], steps: [{ name: '测试步骤', detail: '核对解剖标志', keyPoints: [] }],
  risks: [], postop: ['观察'], focusOrgan: 'intestine', simulationNotes: '',
};
const validStep = { name: '体位摆放', narration: '核对体位与手术区域', view: 'overview', durationSec: 10 };

/** Creates a case through the store and returns its detail. */
async function seedCase(store, input = {}) {
  const patient = await store.createPatient({ name: '合成患者', medicalRecord: '合成病历', ...input });
  const plan = await store.createPlan({ patientId: patient.id });
  return store.getPlanDetail(plan.id);
}

/** Stores version 1 so feedback tests start from an existing plan. */
async function seedVersion(store, detail, overrides = {}) {
  const at = new Date().toISOString();
  await store.saveRevision({
    expectedVersion: detail.plan.currentVersion, expectedUpdatedAt: detail.plan.updatedAt,
    version: { id: 'seed-version', createdAt: at, planId: detail.plan.id, version: detail.plan.currentVersion + 1,
      content: validPlan, changelog: '初版', source: 'ai', knowledgeUsed: [], knowledgeReferences: [], ...overrides },
    simulation: { id: 'seed-simulation', createdAt: at, planId: detail.plan.id, version: detail.plan.currentVersion + 1,
      focusOrgan: 'intestine', region: '腹腔', steps: [{ index: 1, ...validStep }] },
  });
  store.calls.saved.length = 0;
  return store.getPlanDetail(detail.plan.id);
}

/** Mocks for the modules that need the Next.js server runtime, so a route runs against `store`. */
function routeMocks(store, extra = {}) {
  return {
    '@/lib/store': { getStore: async () => store },
    '@/lib/knowledge': { getRetriever: () => ({ retrieve: async () => [] }) },
    ...extra,
  };
}

/** Runs `action` with AGNES_API_KEY and fetch replaced, then restores both. */
async function withProvider(fetchStub, action, key = 'local-fixture') {
  const originalFetch = global.fetch;
  const savedKey = process.env.AGNES_API_KEY;
  if (key === null) delete process.env.AGNES_API_KEY; else process.env.AGNES_API_KEY = key;
  global.fetch = fetchStub;
  try { return await action(); } finally {
    global.fetch = originalFetch;
    if (savedKey === undefined) delete process.env.AGNES_API_KEY; else process.env.AGNES_API_KEY = savedKey;
  }
}

module.exports = { createFakeStore, seedCase, seedVersion, validPlan, validStep, routeMocks, withProvider };

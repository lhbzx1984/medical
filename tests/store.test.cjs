const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./load-ts.cjs');

const { SupabaseStore } = loadTs('src/lib/store/supabase.ts');

/** Chainable query double: every builder method returns the same object, awaiting it yields `result`. */
function query(result, seen = []) {
  const builder = {
    select() { return builder; }, eq() { return builder; }, order() { return builder; }, limit() { return builder; },
    maybeSingle() { return Promise.resolve(result); },
    or(filter) { seen.push(filter); return builder; },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
  };
  return builder;
}
const revision = {
  expectedVersion: 0, expectedUpdatedAt: '2026-10-30T08:00:00.000Z',
  version: { id: 'v', planId: 'plan', version: 1, content: {}, changelog: '测试', source: 'ai', knowledgeUsed: [], knowledgeReferences: [], createdAt: 'x' },
  simulation: { id: 's', planId: 'plan', version: 1, focusOrgan: 'intestine', region: '腹腔', steps: [], createdAt: 'x' },
};

test('a failing child query is surfaced rather than shown as an empty history', async () => {
  const store = new SupabaseStore({ from(table) {
    return query(table === 'surgical_plans' ? { data: { id: 'plan', patient_id: 'patient' }, error: null }
      : table === 'patients' ? { data: { id: 'patient', name: '合成患者' }, error: null }
      : { data: null, error: { message: 'simulated database failure' } });
  } });
  await assert.rejects(store.getPlanDetail('plan'), /simulated database failure/);
});

test('plan details are read with the signed-in session and map database rows to the API shape', async () => {
  const rows = {
    surgical_plans: { data: { id: 'plan', patient_id: 'patient', title: '病例', current_version: 1, status: 'simulated',
      finalized_version: null, archived_at: null, created_at: 'c', updated_at: 'u' }, error: null },
    patients: { data: { id: 'patient', name: '合成患者', age: 40, medical_record: '病历' }, error: null },
    plan_versions: { data: [{ id: 'v1', plan_id: 'plan', version: 1, content: { summary: '摘要' }, source: 'ai', knowledge_used: ['条目'] }], error: null },
    plan_feedback: { data: [], error: null },
    simulations: { data: [{ id: 's1', plan_id: 'plan', version: 1, focus_organ: 'stomach', region: '腹腔', steps: [] }], error: null },
  };
  const detail = await new SupabaseStore({ from: (table) => query(rows[table]) }).getPlanDetail('plan');
  assert.equal(detail.plan.currentVersion, 1);
  assert.equal(detail.patient.medicalRecord, '病历');
  assert.equal(detail.versions[0].content.summary, '摘要');
  assert.deepEqual(detail.versions[0].knowledgeUsed, ['条目']);
  assert.equal(detail.simulations[0].focusOrgan, 'stomach');
  assert.equal(await new SupabaseStore({ from: () => query({ data: null, error: null }) }).getPlanDetail('missing'), null);
});

test('knowledge search quotes filter punctuation and preserves literal LIKE characters', async () => {
  const seen = [];
  const store = new SupabaseStore({ from: () => query({ data: [], error: null }, seen) });
  await store.listKnowledge(String.raw`comma,(paren)"quote"\slash%under_`);
  assert.equal(seen[0], String.raw`title.ilike."%comma,(paren)\"quote\"\\\\slash\\%under\\_%",content.ilike."%comma,(paren)\"quote\"\\\\slash\\%under\\_%"`);
  await store.listKnowledge();
  assert.equal(seen.length, 1);
});

test('saving a revision uses one RPC and translates stale-version conflicts', async () => {
  const calls = [];
  const failing = (code) => new SupabaseStore({ rpc: async (name, args) => { calls.push({ name, args }); return { data: null, error: { code, message: 'db detail' } }; } });
  for (const code of ['40001', '23505', 'P0001']) {
    await assert.rejects(failing(code).saveRevision(revision), { name: 'RevisionConflictError' });
  }
  assert.equal(calls.length, 3);
  assert.equal(calls[0].name, 'medplan_save_revision');
  assert.equal(calls[0].args.p_plan_id, 'plan');
  assert.equal(calls[0].args.p_expected_version, 0);
  assert.equal(calls[0].args.p_version.expectedUpdatedAt, revision.expectedUpdatedAt);
  assert.equal(calls[0].args.p_simulation.version, 1);
  assert.equal(calls[0].args.p_feedback, null);
  await assert.rejects(failing('XX000').saveRevision(revision), (error) => error.name !== 'RevisionConflictError' && /保存规划版本失败/.test(error.message));
  const ok = new SupabaseStore({ rpc: async () => ({ data: null, error: null }) });
  await assert.doesNotReject(ok.saveRevision({ ...revision, feedback: { id: 'f' } }));
});

test('case state changes map database error codes to conflict and not-found errors', async () => {
  const actions = {
    setArchived: (store) => store.setArchived('plan', 'u', true),
    setFinalized: (store) => store.setFinalized('plan', 'u', 1, true),
    updateCase: (store) => store.updateCase('plan', 'u', { name: '合成患者' }),
    assignUnassignedPatient: (store) => store.assignUnassignedPatient('patient', 'owner'),
  };
  for (const [name, run] of Object.entries(actions)) {
    const withCode = (code) => new SupabaseStore({ rpc: async () => ({ data: null, error: { code, message: 'db detail' } }) });
    await assert.rejects(run(withCode('40001')), { name: 'RevisionConflictError' }, name);
    await assert.rejects(run(withCode('P0002')), { name: 'CaseNotFoundError' }, name);
    await assert.rejects(run(withCode('XX000')), (error) => !['RevisionConflictError', 'CaseNotFoundError'].includes(error.name), name);
  }
});

test('AI quota is consumed through the shared database counter and fails closed', async () => {
  const calls = [];
  const quota = (response) => new SupabaseStore({ rpc: async (name, args) => { calls.push({ name, args }); return response; } });
  assert.equal(await quota({ data: true, error: null }).consumeAiQuota('plan'), true);
  assert.equal(await quota({ data: false, error: null }).consumeAiQuota('chat'), false);
  assert.equal(await quota({ data: null, error: null }).consumeAiQuota('image'), false);
  await assert.rejects(quota({ data: null, error: { message: 'down' } }).consumeAiQuota('chat'), /AI 配额检查失败/);
  assert.deepEqual(calls.map((call) => [call.name, call.args.p_operation]),
    [['medplan_consume_ai_quota', 'plan'], ['medplan_consume_ai_quota', 'chat'], ['medplan_consume_ai_quota', 'image'], ['medplan_consume_ai_quota', 'chat']]);
});

test('knowledge seeding uses stable IDs and preserves edited seeded entries', async () => {
  assert.ok(fs.existsSync(path.join(__dirname, '../scripts/seed-knowledge.mjs')), 'seed command must exist');
  const {seedKnowledge, readSeedEntries} = await import('../scripts/seed-knowledge.mjs');
  const entries = readSeedEntries();
  const rows = new Map();
  const client = {from(){return {upsert:async(items,options) => {
    for (const row of items) if (!rows.has(row.id) || !options.ignoreDuplicates) rows.set(row.id, structuredClone(row));
    return {error:null};
  }}}};
  await seedKnowledge(client,entries);
  assert.equal(rows.size,8);
  const firstId = [...rows.keys()][0];
  assert.match(firstId,/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  rows.get(firstId).content = '管理员审核后的修订';
  await seedKnowledge(client,entries);
  assert.equal(rows.size,8);
  assert.equal(rows.get(firstId).content,'管理员审核后的修订');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./load-ts.cjs');

const { MemoryStore } = loadTs('src/lib/store/memory.ts');
const { SupabaseStore } = loadTs('src/lib/store/supabase.ts');

const content = {
  summary: '合成测试方案', diagnosis: '测试', procedureName: '测试术式',
  anesthesia: '测试', position: '测试', approach: '测试', region: '腹腔',
  instruments: ['手术刀'], steps: [{ index: 1, name: '测试步骤', detail: '测试', duration: '', risk: '', keyPoints: [] }],
  risks: [], postop: ['观察'], focusOrgan: 'intestine', simulationNotes: ''
};
function commitInput(planId, ownerId, expectedVersion = 0) {
  return { planId, ownerId, expectedVersion, content, changelog: '测试', source: 'ai', knowledgeUsed: [],
    simulation: { focusOrgan: 'intestine', region: '腹腔', steps: [{index: 1, name: '定位', narration: '测试', view: 'overview', durationSec: 8}] } };
}

test('memory store exposes atomic case creation instead of separate writes', async () => {
  const store = new MemoryStore();
  assert.equal(typeof store.createCase, 'function');
  const { patient, plan } = await store.createCase({name: '合成患者', medicalRecord: '测试', ownerId: 'owner-a'});
  assert.equal(plan.patientId, patient.id);
  assert.equal(plan.ownerId, 'owner-a');
  assert.equal((await store.getPlanDetail(plan.id, 'owner-a')).patient.id, patient.id);
  assert.equal(await store.getPlanDetail(plan.id, 'owner-b'), null);
  assert.equal((await store.listPlans('owner-b')).some(p => p.id === plan.id), false);
});

test('concurrent plan commits yield one version and no partial feedback or simulation', async () => {
  const store = new MemoryStore();
  assert.equal(typeof store.createCase, 'function');
  const { plan } = await store.createCase({name: '并发患者', ownerId: 'owner-c'});
  const input = {...commitInput(plan.id, 'owner-c'), feedback: {expertName: '专家', comment: '合成反馈'}};
  const results = await Promise.allSettled([store.commitPlan(input), store.commitPlan(input)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const rejected = results.find(r => r.status === 'rejected');
  assert.equal(rejected.reason.name, 'StoreConflictError');
  const detail = await store.getPlanDetail(plan.id, 'owner-c');
  assert.equal(detail.plan.currentVersion, 1);
  assert.equal(detail.versions.length, 1);
  assert.equal(detail.simulations.length, 1);
  assert.equal(detail.feedbacks.length, 1);
  assert.equal(detail.simulations[0].version, detail.versions[0].version);
});

test('foreign owner cannot commit or reuse another owner chat session', async () => {
  const store = new MemoryStore();
  assert.equal(typeof store.createCase, 'function');
  const {plan} = await store.createCase({name: '权限患者', ownerId: 'owner-d'});
  await assert.rejects(store.commitPlan(commitInput(plan.id, 'owner-e')), {name: 'StoreAccessError'});
  await store.ensureChatSession('store-test-session', 'learning', '测试', 'owner-d');
  await assert.rejects(store.ensureChatSession('store-test-session', 'learning', '篡改', 'owner-e'), {name: 'StoreAccessError'});
  await assert.rejects(store.addChatMessages('store-test-session', [{role:'user', content:'篡改'}], 'owner-e'), {name:'StoreAccessError'});
});

test('Supabase child query failure is surfaced rather than empty history', async () => {
  const store = new SupabaseStore('https://audit.example.invalid', 'test-placeholder');
  store.sb = {from(table) {
    const result = table === 'surgical_plans' ? {data:{id:'plan',patient_id:'patient',owner_id:'owner'},error:null}
      : table === 'patients' ? {data:{id:'patient',name:'合成患者'},error:null}
      : {data:null,error:{message:'simulated database failure'}};
    return {select(){return this;},eq(){return this;},order(){return this;},maybeSingle(){return Promise.resolve(result);},then(resolve,reject){return Promise.resolve(result).then(resolve,reject);}};
  }};
  await assert.rejects(store.getPlanDetail('plan', 'owner'), /simulated database failure/);
});

test('Supabase knowledge search quotes filter punctuation and preserves literal LIKE characters', async () => {
  const original = global.fetch;
  let filter;
  global.fetch = async (url) => {
    filter = new URL(url).searchParams.get('or');
    return Response.json([]);
  };
  try {
    const store = new SupabaseStore('https://audit.example.invalid', 'test-placeholder');
    await store.listKnowledge(String.raw`comma,(paren)"quote"\slash%under_`);
    assert.equal(filter, String.raw`(title.ilike."%comma,(paren)\"quote\"\\\\slash\\%under\\_%",content.ilike."%comma,(paren)\"quote\"\\\\slash\\%under\\_%")`);
  } finally { global.fetch = original; }
});

test('Supabase commits use one RPC and translate stale version conflicts', async () => {
  const store = new SupabaseStore('https://audit.example.invalid', 'test-placeholder');
  assert.equal(typeof store.commitPlan, 'function');
  const calls=[];
  store.sb = {rpc:async (name,args) => {calls.push({name,args}); return {data:null,error:{code:'40001',message:'版本已更新，请重新加载'}};}};
  await assert.rejects(store.commitPlan(commitInput('plan','owner')), {name:'StoreConflictError'});
  assert.equal(calls.length,1);
  assert.equal(calls[0].name,'commit_plan');
  assert.equal(calls[0].args.p_owner_id,'owner');
  assert.equal(calls[0].args.p_expected_version,0);
});

test('rate limits are atomic and separated by user and action', async () => {
  const store = new MemoryStore();
  assert.equal(typeof store.consumeRateLimit, 'function');
  const allowed = await Promise.all(Array.from({length: 5}, () => store.consumeRateLimit('rate-owner-a', 'chat', 3, 60)));
  assert.equal(allowed.filter(Boolean).length, 3);
  assert.equal(await store.consumeRateLimit('rate-owner-b', 'chat', 3, 60), true);
  assert.equal(await store.consumeRateLimit('rate-owner-a', 'image', 3, 60), true);
});

test('expired rate limit windows become available again', async () => {
  const store = new MemoryStore();
  assert.equal(typeof store.consumeRateLimit, 'function');
  const original = Date.now;
  let clock = 600_000;
  Date.now = () => clock;
  try {
    assert.equal(await store.consumeRateLimit('rate-owner-expire', 'chat', 1, 60), true);
    assert.equal(await store.consumeRateLimit('rate-owner-expire', 'chat', 1, 60), false);
    clock += 60_000;
    assert.equal(await store.consumeRateLimit('rate-owner-expire', 'chat', 1, 60), true);
  } finally { Date.now = original; }
});

test('Supabase rate limit consumes the shared database counter', async () => {
  const store = new SupabaseStore('https://audit.example.invalid', 'test-placeholder');
  assert.equal(typeof store.consumeRateLimit, 'function');
  store.sb = {rpc:async(name,args) => {
    assert.equal(name, 'consume_rate_limit');
    assert.equal(args.p_window_seconds, 60);
    return {data:false,error:null};
  }};
  assert.equal(await store.consumeRateLimit('owner', 'chat', 3, 60), false);
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

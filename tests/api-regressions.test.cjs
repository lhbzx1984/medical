const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadTs } = require('./load-ts.cjs');
const { createFakeStore, seedCase, routeMocks } = require('./fake-store.cjs');

const SAME_SITE = { host: 'localhost:3000', origin: 'http://localhost:3000', 'sec-fetch-site': 'same-origin' };
const post = (path, body, headers = SAME_SITE, method = 'POST') => new Request(`http://localhost:3000${path}`, {
  method, headers: { 'Content-Type': 'application/json', ...headers },
  ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
});
const idContext = (id) => ({ params: Promise.resolve({ id }) });

async function quietly(action) {
  const original = console.error;
  console.error = () => {};
  try { return await action(); } finally { console.error = original; }
}

test('same-origin checks use the public Host header even when Next uses an internal URL', () => {
  const { assertSameOrigin } = loadTs('src/lib/http.ts', { '@/lib/store': { getStore: async () => null } });
  const request = (origin, site) => new Request('http://localhost:4401/api/plans', {method:'POST',
    headers:{host:'127.0.0.1:4401',origin,...(site?{'sec-fetch-site':site}:{})}});
  assert.doesNotThrow(()=>assertSameOrigin(request('http://127.0.0.1:4401','same-origin')));
  assert.throws(()=>assertSameOrigin(request('https://other.example.invalid','cross-site')));
  assert.throws(()=>assertSameOrigin(request('http://127.0.0.1:4402')));
  assert.throws(()=>assertSameOrigin(request('null')));
  assert.doesNotThrow(()=>assertSameOrigin(new Request('http://localhost/api/plans',{method:'POST',
    headers:{host:'medical.example.invalid',origin:'https://medical.example.invalid','x-forwarded-proto':'https'}})));
});

test('anonymous callers are rejected before any case data is read or written', async () => {
  const mocks = routeMocks(null);
  const plans = loadTs('src/app/api/plans/route.ts', mocks);
  assert.equal((await plans.GET()).status, 401);
  assert.equal((await plans.POST(post('/api/plans', { patientName: '合成患者', medicalRecord: '病历' }))).status, 401);
  const one = loadTs('src/app/api/plans/[id]/route.ts', mocks);
  assert.equal((await one.GET(new Request('http://localhost:3000/api/plans/plan-1'), idContext('plan-1'))).status, 401);
  for (const action of ['generate', 'feedback']) {
    const route = loadTs(`src/app/api/plans/[id]/${action}/route.ts`, mocks);
    const response = await route.POST(post(`/api/plans/plan-1/${action}`, { comment: '反馈', version: 1 }), idContext('plan-1'));
    assert.equal(response.status, 401);
  }
  const chat = loadTs('src/app/api/chat/route.ts', mocks);
  assert.equal((await chat.POST(post('/api/chat', { messages: [{ role: 'user', content: '问' }] }))).status, 401);
  const image = loadTs('src/app/api/image/route.ts', mocks);
  assert.equal((await image.POST(post('/api/image', { prompt: '画' }))).status, 401);
});

test('supported organs include the uterus in AI and region validation', () => {
  const { ORGAN_IDS } = loadTs('src/lib/types.ts');
  const { normalizeRegion } = loadTs('src/lib/organ-models.ts');
  assert.ok(ORGAN_IDS.includes('uterus'));
  assert.equal(normalizeRegion('uterus', 'uterus'), '盆腔');
});

test('unsupported AI focus organs cannot silently become intestine or skin simulations', () => {
  const { normalizePlan } = loadTs('src/lib/validation.ts');
  const plan={summary:'合成测试',diagnosis:'测试',procedureName:'测试',anesthesia:'测试',position:'测试',approach:'测试',region:'腹腔',
    focusOrgan:'uterus',instruments:[],steps:[{name:'测试步骤',detail:'测试',keyPoints:[]}],risks:[],postop:[]};
  assert.equal(normalizePlan(plan).focusOrgan,'uterus');
  for (const focusOrgan of ['胃','breast','乳腺','unknown-organ']) {
    assert.throws(()=>normalizePlan({...plan,focusOrgan}),/focusOrgan/);
  }
});

test('the sourced stomach model keeps its identity across planning, labels and region fallback', () => {
  const { ORGAN_IDS } = loadTs('src/lib/types.ts');
  const { ORGANS, matchOrgan, normalizeRegion } = loadTs('src/lib/organ-models.ts');
  const { normalizePlan } = loadTs('src/lib/validation.ts');
  const { PLAN_JSON_SCHEMA_DESC } = loadTs('src/lib/planning-prompt.ts');
  const plan={summary:'合成测试',diagnosis:'测试',procedureName:'测试',anesthesia:'测试',position:'测试',approach:'测试',region:'stomach',
    focusOrgan:'stomach',instruments:[],steps:[{name:'测试步骤',detail:'测试',keyPoints:[]}],risks:[],postop:[]};
  assert.ok(ORGAN_IDS.includes('stomach'));
  assert.equal(ORGANS.stomach.glb,'/models/stomach.glb');
  for(const name of ['stomach','Stomach','胃','胃部']) assert.equal(matchOrgan(name),'stomach');
  assert.equal(matchOrgan('肠'),'intestine');
  assert.equal(normalizeRegion('stomach','stomach'),'腹腔');
  assert.equal(normalizePlan(plan).focusOrgan,'stomach');
  assert.equal(normalizePlan(plan).region,'腹腔');
  assert.match(PLAN_JSON_SCHEMA_DESC,/\bstomach\b/);
});

test('request validation rejects malformed case input as client errors before storage', async () => {
  const store = createFakeStore();
  store.createPatient = async () => { throw new Error('Invalid input must not reach storage'); };
  const routes = loadTs('src/app/api/plans/route.ts', routeMocks(store));
  const valid = { patientName: '合成患者', medicalRecord: '合成病历' };
  const bad = [null, [], '"text"', { patientName: 42, medicalRecord: '病历' },
    { ...valid, patientName: '   ' }, { ...valid, medicalRecord: '' },
    { ...valid, gender: '其他' }, { ...valid, age: -1 }, { ...valid, age: 131 }, { ...valid, age: 30.5 }, { ...valid, age: '30' },
    { ...valid, title: 42 }, { ...valid, preliminaryPlan: {} }];
  for (const body of bad) {
    const response = await routes.POST(post('/api/plans', body));
    assert.equal(response.status, 400, JSON.stringify(body));
  }
  assert.equal((await routes.POST(post('/api/plans', '{not json'))).status, 400);
  assert.equal((await routes.POST(post('/api/plans', undefined))).status, 400);
  const oversized = await routes.POST(post('/api/plans', { ...valid, medicalRecord: 'x'.repeat(140 * 1024) }));
  assert.equal(oversized.status, 400);
  assert.match((await oversized.json()).error, /128 KB/);
});

test('case creation trims input and stores patient and plan; a failing plan write is reported, not hidden', async () => {
  const store = createFakeStore();
  const routes = loadTs('src/app/api/plans/route.ts', routeMocks(store));
  const created = await routes.POST(post('/api/plans', { patientName: ' 合成患者 ', gender: '女', age: 41, medicalRecord: '合成病历' }));
  assert.equal(created.status, 201);
  const { patient, plan } = await created.json();
  assert.equal(patient.name, '合成患者');
  assert.equal(plan.patientId, patient.id);
  const listed = await (await routes.GET()).json();
  assert.equal(listed.plans.length, 1);
  assert.equal(listed.store, 'supabase');

  const failing = createFakeStore();
  failing.createPlan = async () => { throw new Error('simulated plan write failure'); };
  const failingRoutes = loadTs('src/app/api/plans/route.ts', routeMocks(failing));
  const response = await quietly(() => failingRoutes.POST(post('/api/plans', { patientName: '合成患者', medicalRecord: '合成病历' })));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.includes('simulated'), false, 'internal error text must not reach the client');
  assert.equal((await failingRoutes.GET()).status, 200);
  assert.deepEqual((await (await failingRoutes.GET()).json()).plans, []);
});

test('case edits are tied to the version they were based on and stale edits are conflicts', async () => {
  const store = createFakeStore();
  const detail = await seedCase(store);
  const routes = loadTs('src/app/api/plans/[id]/route.ts', routeMocks(store));
  const path = `/api/plans/${detail.plan.id}`;
  const body = { patientName: '改名患者', gender: '男', age: 50, medicalRecord: '更新病历', preliminaryPlan: '',
    expectedUpdatedAt: detail.plan.updatedAt };
  assert.equal((await routes.PATCH(post(path, body, SAME_SITE, 'PATCH'), idContext(detail.plan.id))).status, 200);
  assert.equal((await routes.PATCH(post(path, body, SAME_SITE, 'PATCH'), idContext(detail.plan.id))).status, 409);
  assert.equal((await routes.PATCH(post('/api/plans/none', body, SAME_SITE, 'PATCH'), idContext('none'))).status, 404);
  for (const change of [{ expectedUpdatedAt: 'not a date' }, { age: 200 }, { patientName: '' }, { medicalRecord: 7 }]) {
    const response = await routes.PATCH(post(path, { ...body, ...change }, SAME_SITE, 'PATCH'), idContext(detail.plan.id));
    assert.equal(response.status, 400, JSON.stringify(change));
  }
  assert.equal((await store.getPlanDetail(detail.plan.id)).patient.name, '改名患者');
});

const MUTATING_ROUTES = [
  ['plans', 'POST'], ['plans/[id]', 'PATCH'], ['plans/[id]/generate', 'POST'], ['plans/[id]/feedback', 'POST'],
  ['plans/[id]/archive', 'POST'], ['plans/[id]/finalize', 'POST'], ['chat', 'POST'], ['image', 'POST'],
  ['knowledge', 'POST'], ['learning/quiz', 'POST'], ['admin/users', 'POST'], ['admin/unassigned', 'POST'],
  ['auth/login', 'POST'], ['auth/logout', 'POST'], ['auth/password', 'POST'],
];

test('every state-changing route rejects cross-site requests before touching sessions or data', async () => {
  const touched = [];
  const mocks = {
    '@/lib/store': { getStore: async () => { touched.push('store'); return null; } },
    '@/lib/admin': { getAdminStore: async () => { touched.push('admin'); return { error: 'unreachable', status: 500 }; } },
    '@/lib/auth': { createAuthClient: async () => { touched.push('auth'); throw new Error('must not be reached'); } },
    '@/lib/knowledge': { getRetriever: () => ({ retrieve: async () => [] }) },
  };
  const crossSite = { host: 'localhost:3000', origin: 'https://attacker.example.invalid', 'sec-fetch-site': 'cross-site' };
  for (const [route, method] of MUTATING_ROUTES) {
    const handler = loadTs(`src/app/api/${route}/route.ts`, mocks)[method];
    const response = await handler(post(`/api/${route.replace('[id]', 'plan-1')}`, {}, crossSite, method), idContext('plan-1'));
    assert.equal(response.status, 403, `${method} /api/${route}`);
  }
  assert.deepEqual(touched, []);
});

test('the health endpoint reports configuration flags without echoing credentials', async () => {
  const route = loadTs('src/app/api/health/route.ts', { 'next/server': { connection: async () => {} } });
  const keys = ['AGNES_API_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    assert.deepEqual(
      (({ agnesConfigured, authConfigured, store }) => ({ agnesConfigured, authConfigured, store }))(await (await route.GET()).json()),
      { agnesConfigured: false, authConfigured: false, store: 'supabase' });
    Object.assign(process.env, { AGNES_API_KEY: 'secret-agnes-value', SUPABASE_URL: 'https://project.example.invalid',
      SUPABASE_ANON_KEY: 'secret-anon-value' });
    const text = await (await route.GET()).text();
    assert.doesNotMatch(text, /secret-agnes-value|secret-anon-value|project\.example\.invalid/);
    const body = JSON.parse(text);
    assert.equal(body.agnesConfigured, true);
    assert.equal(body.authConfigured, true);
  } finally {
    for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  }
});

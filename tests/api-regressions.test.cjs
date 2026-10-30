const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadTs } = require('./load-ts.cjs');

test('same-origin forms use the public Host header even when Next uses an internal URL', () => {
  const { assertSameOrigin } = loadTs('src/lib/auth.ts');
  const request = (origin, site) => new Request('http://localhost:4401/api/auth', {method:'POST',
    headers:{host:'127.0.0.1:4401',origin,...(site?{'sec-fetch-site':site}:{})}});
  assert.doesNotThrow(()=>assertSameOrigin(request('http://127.0.0.1:4401','same-origin')));
  assert.throws(()=>assertSameOrigin(request('https://other.example.invalid','cross-site')));
  assert.throws(()=>assertSameOrigin(request('http://127.0.0.1:4402')));
  assert.doesNotThrow(()=>assertSameOrigin(new Request('http://localhost/api/auth',{method:'POST',
    headers:{host:'medical.example.invalid',origin:'https://medical.example.invalid','x-forwarded-proto':'https'}})));
});

test('anonymous callers cannot list patient plans', async () => {
  const routes = loadTs('src/app/api/plans/route.ts', {
    '@/lib/store': { getStore: () => ({ kind: 'memory', listPlans: async () => [] }) },
  });
  const response = await routes.GET(new Request('http://localhost/api/plans'));
  assert.equal(response.status, 401);
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

test('request validation rejects null and scalar patient names as client errors', async () => {
  const routes = loadTs('src/app/api/plans/route.ts', {
    '@/lib/auth': { requireActor: async () => ({ id: 'owner', name: '测试用户', role: 'user' }) },
    '@/lib/store': { getStore: () => { throw new Error('Invalid input must not reach storage'); } },
  });
  for (const body of [null, { patientName: 42 }]) {
    let response;
    try {
      response = await routes.POST(new Request('http://localhost/api/plans', {
        method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
      }));
    } catch { response = { status: 500 }; }
    assert.equal(response.status, 400);
  }
});

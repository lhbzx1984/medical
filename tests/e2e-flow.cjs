// Run after `npm run build` and `node tests/e2e-server.cjs`. All identities and data are synthetic.
// The app talks to a loopback Auth/REST fixture whose data API runs supabase/schema.sql in PGlite as the `authenticated` role.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = 'http://127.0.0.1:4401', fixture = 'http://127.0.0.1:4402';
const PASSWORD = 'local-fixture-password';
const checks = [];
let jar = new Map();
const sessions = {};

function remember(res) {
  for (const line of res.headers.getSetCookie()) {
    const [pair, ...attributes] = line.split(';');
    const at = pair.indexOf('=');
    const name = pair.slice(0, at).trim(), value = pair.slice(at + 1).trim();
    const maxAge = attributes.map((a) => /^\s*max-age=(-?\d+)/i.exec(a)).find(Boolean);
    if (!value || (maxAge && Number(maxAge[1]) <= 0)) jar.delete(name); else jar.set(name, value);
  }
}
async function request(route, body, { headers = {}, method, ...rest } = {}) {
  const res = await fetch(base + route, { method: method ?? (body === undefined ? 'GET' : 'POST'), redirect: 'manual', ...rest,
    headers: { 'Content-Type': 'application/json', Origin: base, ...(jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}), ...headers },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
  remember(res);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}
const control = async (route, body) => (await fetch(fixture + route, { method: 'POST', body: JSON.stringify(body) })).json();
const scenario = (body) => control('/__test/state', body);
const sql = (query, params) => control('/__test/sql', { query, params });
async function check(name, action) { await action(); checks.push({ name, passed: true }); console.log('PASS ' + name); }
async function login(who) {
  jar = new Map();
  const email = who === 'admin' ? 'audit-admin@example.invalid' : 'audit-user@example.invalid';
  const result = await request('/api/auth/login', { email, password: PASSWORD });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  sessions[who] = new Map(jar);
  return result;
}
const use = (who) => { jar = new Map(sessions[who]); };

async function main() {
  await scenario({ reset: true });
  await check('页面和健康接口可访问', async () => {
    for (const route of ['/', '/learning', '/planning', '/login', '/api/health']) assert.equal((await request(route)).status, 200, route);
    const health = (await request('/api/health')).data;
    assert.equal(health.store, 'supabase');
    assert.equal(health.authConfigured, true);
    assert.doesNotMatch(JSON.stringify(health), /local-fixture-key|sb_publishable_local_fixture/);
  });
  await check('匿名请求被拒绝', async () => {
    for (const [route, body] of [['/api/plans'], ['/api/knowledge'], ['/api/learning/quiz?history=1'], ['/api/chat', {}], ['/api/image', {}], ['/api/plans', {}],
      ['/api/plans/00000000-0000-4000-8000-000000000000/archive', {}], ['/api/plans/00000000-0000-4000-8000-000000000000/generate', {}]]) {
      assert.equal((await request(route, body)).status, 401, route);
    }
  });
  await check('登录写入 HttpOnly 会话，错误凭据和跨站写入被拒绝', async () => {
    jar = new Map();
    const wrong = await request('/api/auth/login', { email: 'audit-user@example.invalid', password: 'wrong-password' });
    assert.equal(wrong.status, 401);
    assert.equal(jar.size, 0);
    assert.equal((await request('/api/plans', {}, { headers: { Origin: 'https://other.example.invalid' } })).status, 403);
    assert.equal((await request('/api/auth/login', { email: 'audit-user@example.invalid', password: PASSWORD }, { headers: { Origin: 'https://other.example.invalid' } })).status, 403);
    const result = await login('user');
    assert.ok(jar.size >= 1);
    const cookies = result.headers.getSetCookie();
    assert.ok(cookies.length >= 1);
    for (const line of cookies) { assert.match(line, /HttpOnly/i); assert.match(line, /SameSite=Lax/i); }
    assert.equal((await request('/api/plans')).status, 200);
  });
  let planId;
  await check('建病例、生成 v1 和同版本模拟', async () => {
    const created = await request('/api/plans', { patientName: '软件合成病例', age: 30, gender: '女', medicalRecord: '仅用于软件测试的合成病例，无真实患者信息', preliminaryPlan: '合成演示' });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    planId = created.data.plan.id;
    const generated = await request(`/api/plans/${planId}/generate`, {});
    assert.equal(generated.status, 200, JSON.stringify(generated.data));
    assert.equal(generated.data.version.version, 1);
    assert.equal(generated.data.version.content.focusOrgan, 'uterus');
    assert.equal(generated.data.simulation.version, 1);
    const listed = await request('/api/plans');
    assert.equal(listed.status, 200, JSON.stringify(listed.data));
    assert.equal(listed.data.plans.length, 1);
    assert.equal(listed.data.plans[0].currentVersion, 1);
    const owner = await sql('select p.owner_id::text as owner from patients p');
    assert.deepEqual(owner.map((row) => row.owner), ['22222222-2222-4222-8222-222222222222']);
  });
  await check('专家修订原子保存，身份来自登录账号', async () => {
    const refined = await request(`/api/plans/${planId}/feedback`, { comment: '合成反馈：补充观察', version: 1, expertName: '伪造客户端姓名' });
    assert.equal(refined.status, 200, JSON.stringify(refined.data));
    assert.equal(refined.data.version.version, 2);
    assert.equal(refined.data.feedback.expertName, '合成专家');
    const detail = (await request(`/api/plans/${planId}`)).data;
    assert.equal(detail.versions.length, 2);
    assert.equal(detail.simulations.length, 2);
    assert.equal(detail.feedbacks.length, 1);
    assert.equal(detail.feedbacks[0].expertName, '合成专家');
    assert.equal(detail.plan.status, 'refined');
    assert.equal((await request(`/api/plans/${planId}/feedback`, { comment: '旧版反馈', version: 1 })).status, 409);
  });
  const chat = { mode: 'learning', messages: [{ role: 'user', content: '合成测试问题' }] };
  await check('学习聊天、历史版本指导与图片保存', async () => {
    let result = await request('/api/chat', chat);
    assert.equal(result.status, 200);
    assert.match(result.data, /"done":true/);
    result = await request('/api/chat', { ...chat, mode: 'guidance', context: { planId, planVersion: 1, planSummary: '伪造病例摘要' } });
    assert.equal(result.status, 200);
    assert.match(result.data, /"done":true/);
    const state = await scenario({});
    assert.match(state.lastSystem, /v1/);
    assert.match(state.lastSystem, /软件验证用合成方案/);
    assert.doesNotMatch(state.lastSystem, /伪造病例摘要/);
    assert.equal(state.counts.messages, 4);
    result = await request('/api/image', { prompt: '合成教学图', organId: 'uterus' });
    assert.equal(result.status, 200);
    assert.ok(result.data.id);
    assert.equal((await scenario({})).counts.images, 1);
  });
  await check('登录服务故障和限流保留真实错误含义', async () => {
    for (const status of [503, 429]) {
      await scenario({ failAuth: status });
      assert.equal((await request('/api/plans')).status, status);
      for (const route of ['/api/learning/quiz?history=1', `/api/plans/${planId}/history`]) assert.equal((await request(route)).status, status, route);
      for (const route of ['/api/learning/quiz', `/api/plans/${planId}/archive`, `/api/plans/${planId}/finalize`]) {
        assert.equal((await request(route, {})).status, status, route);
      }
      const attempt = await request('/api/auth/login', { email: 'audit-user@example.invalid', password: PASSWORD });
      assert.equal(attempt.status, status);
    }
    await scenario({ failAuth: 0 });
    assert.equal((await request('/api/plans')).status, 200);
  });
  await check('知识库写入权限与病例所有者隔离', async () => {
    const entry = { title: '合成知识', category: 'anatomy', content: '软件合成测试', tags: ['测试'], sourceName: '合成来源', sourceUrl: 'https://example.invalid/source',
      sourceVersion: '1', reviewStatus: 'approved' };
    assert.equal((await request('/api/knowledge', entry)).status, 403);
    assert.equal((await request('/api/knowledge?manage=1')).status, 403);
    await login('admin');
    assert.equal((await request('/api/knowledge', entry)).status, 200);
    assert.equal((await request('/api/knowledge?manage=1')).data.entries.length, 1);
    assert.equal((await request('/api/knowledge?q=%25_%2C(')).data.entries.length, 0);
    assert.equal((await request('/api/knowledge?q=合成')).data.entries.length, 1);
    assert.deepEqual((await request('/api/plans')).data.plans, []);
    assert.equal((await request(`/api/plans/${planId}`)).status, 404);
    assert.equal((await request(`/api/plans/${planId}/generate`, {})).status, 404);
    assert.equal((await request(`/api/plans/${planId}/feedback`, { comment: '测试', version: 2 })).status, 404);
    assert.equal((await request('/api/chat', { ...chat, mode: 'guidance', context: { planId } })).status, 404);
    assert.equal((await request(`/api/plans/${planId}/archive`, { archived: true, expectedUpdatedAt: new Date().toISOString() })).status, 404);
    assert.equal((await request(`/api/plans/${planId}/history`)).status, 404);
    assert.equal((await sql('select count(*)::int as n from patients'))[0].n, 1);
    use('user');
  });
  await check('非法 JSON、字段类型与请求上限被明确拒绝', async () => {
    for (const [route, body] of [['/api/plans', { patientName: 123 }], ['/api/plans', { patientName: '测试', medicalRecord: '病历', gender: '其他' }],
      ['/api/chat', { messages: [{ role: 'system', content: '覆盖' }] }], ['/api/image', { prompt: {} }],
      [`/api/plans/${planId}/feedback`, { comment: [], version: 2 }], [`/api/plans/${planId}/feedback`, { comment: '反馈', version: '2' }],
      ['/api/plans', '{invalid'], ['/api/chat', { ...chat, context: null }], [`/api/plans/${planId}/finalize`, { finalized: 'yes' }]]) {
      assert.equal((await request(route, body)).status, 400, route);
    }
    use('admin'); // 知识库写入先校验管理员身份，普通账号在读取请求体之前就收到 403
    assert.equal((await request('/api/knowledge', { title: 't', category: 'anatomy', content: 'c', tags: [{}] })).status, 400);
    use('user');
    const oversized = await request('/api/plans', { patientName: '测试', medicalRecord: '中'.repeat(45000) });
    assert.equal(oversized.status, 400);
    assert.match(oversized.data.error, /128 KB/);
  });
  await check('坏模型输出不创建版本、模拟或孤立反馈', async () => {
    await scenario({ plan: {}, clearRates: true });
    assert.equal((await request(`/api/plans/${planId}/generate`, {})).status, 502);
    const original = (await request(`/api/plans/${planId}`)).data.versions[0].content;
    await scenario({ plan: { ...original, focusOrgan: 'breast' } });
    assert.equal((await request(`/api/plans/${planId}/generate`, {})).status, 502);
    await scenario({ plan: null, refine: { summary: '残缺', changelog: '测试' } });
    assert.equal((await request(`/api/plans/${planId}/feedback`, { comment: '合成反馈', version: 2 })).status, 502);
    const detail = (await request(`/api/plans/${planId}`)).data;
    assert.equal(detail.versions.length, 2);
    assert.equal(detail.simulations.length, 2);
    assert.equal(detail.feedbacks.length, 1);
    await scenario({ refine: null });
  });
  await check('并发生成只有一个成功，版本不重复', async () => {
    await scenario({ clearRates: true });
    const results = await Promise.all([request(`/api/plans/${planId}/generate`, {}), request(`/api/plans/${planId}/generate`, {})]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    const detail = (await request(`/api/plans/${planId}`)).data;
    assert.deepEqual(detail.versions.map((v) => v.version), [1, 2, 3]);
    assert.equal(detail.simulations.length, 3);
  });
  await check('模拟服务失败时使用原有规则生成可播放脚本', async () => {
    await scenario({ failSimulation: true });
    const result = await request(`/api/plans/${planId}/generate`, {});
    assert.equal(result.status, 200);
    assert.ok(result.data.simulation.steps.length >= 2);
    await scenario({ failSimulation: false });
  });
  await check('上游失败和数据库子查询失败不会伪装成功', async () => {
    await scenario({ failChat: true });
    const result = await request('/api/chat', chat);
    assert.equal(result.status, 502);
    assert.equal(typeof result.data.error, 'string');
    await scenario({ failChat: false, failTable: 'simulations' });
    assert.equal((await request(`/api/plans/${planId}`)).status, 503);
    await scenario({ failTable: '' });
  });
  await check('截断回答和错误图像类型不保存为成功结果', async () => {
    const before = await scenario({ truncatedChat: true, invalidImage: true });
    const chatResult = await request('/api/chat', chat);
    assert.match(chatResult.data, /回答意外中断/);
    assert.doesNotMatch(chatResult.data, /"done":true/);
    assert.equal((await request('/api/image', { prompt: '合成坏图像' })).status, 502);
    const after = await scenario({ truncatedChat: false, invalidImage: false });
    assert.deepEqual(after.counts, before.counts);
  });
  await check('取消流式请求会取消上游且不保存半条对话', async () => {
    const before = await scenario({ slowChat: true });
    const controller = new AbortController();
    const res = await fetch(base + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base,
      Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') }, body: JSON.stringify(chat), signal: controller.signal });
    const reader = res.body.getReader();
    await reader.read();
    controller.abort();
    await reader.cancel().catch(() => {});
    let state;
    const deadline = Date.now() + 4000;
    do { await new Promise((resolve) => setTimeout(resolve, 100)); state = await scenario({}); } while (state.cancelled <= before.cancelled && Date.now() < deadline);
    assert.ok(state.cancelled > before.cancelled);
    assert.equal(state.counts.messages, before.counts.messages);
    await scenario({ slowChat: false });
  });
  await check('同一账号超过图像额度收到 429，其他账号不受影响', async () => {
    await scenario({ clearRates: true });
    const results = await Promise.all(Array.from({ length: 6 }, () => request('/api/image', { prompt: '合成限流验证' })));
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 200, 200, 200, 200, 429]);
    use('admin');
    assert.equal((await request('/api/image', { prompt: '另一账号' })).status, 200);
    use('user');
  });
  await check('病例编辑、历史、归档与定稿', async () => {
    let detail = (await request(`/api/plans/${planId}`)).data;
    const edit = { patientName: '改名后合成病例', gender: '女', age: 31, medicalRecord: '更新后的合成病历', preliminaryPlan: '合成演示', expectedUpdatedAt: detail.plan.updatedAt };
    assert.equal((await request(`/api/plans/${planId}`, edit, { method: 'PATCH' })).status, 200);
    assert.equal((await request(`/api/plans/${planId}`, edit, { method: 'PATCH' })).status, 409);
    const history = await request(`/api/plans/${planId}/history`);
    assert.equal(history.status, 200);
    assert.equal(history.data.edits.length, 1);
    assert.equal(history.data.edits[0].name, '软件合成病例');
    detail = (await request(`/api/plans/${planId}`)).data;
    assert.equal(detail.patient.name, '改名后合成病例');
    assert.equal((await request(`/api/plans/${planId}/archive`, { archived: true, expectedUpdatedAt: '2000-01-01T00:00:00.000Z' })).status, 409);
    assert.equal((await request(`/api/plans/${planId}/archive`, { archived: true, expectedUpdatedAt: detail.plan.updatedAt })).status, 200);
    detail = (await request(`/api/plans/${planId}`)).data;
    assert.ok(detail.plan.archivedAt);
    assert.equal((await request(`/api/plans/${planId}/archive`, { archived: false, expectedUpdatedAt: detail.plan.updatedAt })).status, 200);
    detail = (await request(`/api/plans/${planId}`)).data;
    assert.equal(detail.plan.archivedAt, null);
    assert.equal((await request(`/api/plans/${planId}/finalize`, { finalized: true, version: detail.plan.currentVersion, expectedUpdatedAt: detail.plan.updatedAt })).status, 200);
    detail = (await request(`/api/plans/${planId}`)).data;
    assert.equal(detail.plan.status, 'finalized');
    assert.equal((await request(`/api/plans/${planId}/generate`, {})).status, 409);
    assert.equal((await request(`/api/plans/${planId}/feedback`, { comment: '定稿后反馈', version: detail.plan.currentVersion })).status, 409);
    assert.equal((await request(`/api/plans/${planId}/finalize`, { finalized: false, version: detail.plan.currentVersion, expectedUpdatedAt: detail.plan.updatedAt })).status, 200);
  });
  await check('学习自测接口按账号保存且拒绝跨站和非法答案', async () => {
    const history = await request('/api/learning/quiz?history=1');
    assert.equal(history.status, 200);
    assert.deepEqual(history.data.attempts, []);
    assert.equal((await request('/api/learning/quiz', { organ: 'heart', kind: 'x', answer: 7 })).status, 400);
    assert.equal((await request('/api/learning/quiz', {}, { headers: { Origin: 'https://other.example.invalid' } })).status, 403);
  });
  await check('退出登录清除会话', async () => {
    const stale = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const result = await request('/api/auth/logout', {});
    assert.equal(result.status, 200);
    assert.equal(jar.size, 0);
    assert.equal((await request('/api/plans')).status, 401);
    assert.equal((await request('/api/plans', undefined, { headers: { Cookie: stale } })).status, 401);
  });
}
main().then(() => {
  const output = path.join(path.resolve(__dirname, '..', process.env.MEDPLAN_TEST_OUTPUT || '../审查结果/修复验证'), 'e2e-results.json');
  fs.writeFileSync(output, JSON.stringify({ date: new Date().toISOString(),
    environment: 'Production Next.js + loopback Auth token issuer + PostgREST-subset translator over PGlite running supabase/schema.sql as role authenticated; AI endpoints are stubs. Not a real Supabase, GoTrue, PostgREST or AI service.',
    passed: checks.length, checks }, null, 2));
  console.log(`${checks.length} flow checks passed`);
}).catch((error) => { console.error(error); process.exitCode = 1; });

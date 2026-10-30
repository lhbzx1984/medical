const test = require('node:test');
const assert = require('node:assert/strict');
const {loadTs} = require('./load-ts.cjs');

const SAME_SITE = {host:'localhost:3000',origin:'http://localhost:3000','sec-fetch-site':'same-origin'};
const post = (path, body, headers = SAME_SITE) => new Request(`http://localhost:3000${path}`, {
  method:'POST', headers:{'Content-Type':'application/json',...headers},
  ...(body === undefined ? {} : {body: typeof body === 'string' ? body : JSON.stringify(body)}),
});

/** Stand-in for a Supabase client; each method returns whatever the test configured. */
function client({user = null, error = null, version = 1, versionError = null, signIn = {error: null}, isAdmin = true, adminError = null, update = {error: null}} = {}) {
  const calls = [];
  return {calls, auth: {
    getUser: async () => ({data: {user}, error}),
    signInWithPassword: async (credentials) => { calls.push(['signIn', credentials.email]); return signIn; },
    signOut: async () => { calls.push(['signOut']); return {error: null}; },
    updateUser: async (changes) => { calls.push(['updateUser', Object.keys(changes)]); return update; },
  }, rpc: async (name) => name === 'medplan_security_version' ? {data: version, error: versionError}
    : name === 'medplan_is_admin' ? {data: isAdmin, error: adminError} : {data: null, error: null}};
}

/** Loads the real auth module with the Next.js and Supabase runtime replaced. */
function authWith(stub, state = {}) {
  return loadTs('src/lib/auth.ts', {
    'server-only': {},
    'next/headers': {cookies: async () => ({getAll: () => [{name: 'sb-test', value: 'cookie'}], set: (name, value, options) => { (state.set ??= []).push([name, value, options]); }})},
    '@supabase/ssr': {createServerClient: (url, key, options) => { state.created = {url, key, options}; return stub; }},
  });
}

async function withConfig(values, action) {
  const keys = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, {SUPABASE_URL: 'https://project.example.invalid', SUPABASE_ANON_KEY: 'sb_publishable_synthetic', ...values});
  try { return await action(); } finally {
    for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  }
}
const jwt = (role) => `header.${Buffer.from(JSON.stringify({role})).toString('base64url')}.signature`;

test('the user client refuses privileged keys and missing configuration', () => withConfig({}, async () => {
  const stub = client();
  assert.ok(await authWith(stub).createAuthClient());
  for (const key of [jwt('service_role'), 'sb_secret_synthetic']) {
    process.env.SUPABASE_ANON_KEY = key;
    await assert.rejects(authWith(stub).createAuthClient(), /匿名或 publishable/);
  }
  process.env.SUPABASE_ANON_KEY = jwt('anon');
  assert.ok(await authWith(stub).createAuthClient());
  delete process.env.SUPABASE_ANON_KEY;
  await assert.rejects(authWith(stub).createAuthClient(), /SUPABASE_URL/);
}));

test('the user client reads and writes the visitor cookies through the Next.js cookie jar as HttpOnly', () => withConfig({}, async () => {
  const state = {};
  await authWith(client(), state).createAuthClient();
  assert.deepEqual(state.created.options.cookies.getAll(), [{name: 'sb-test', value: 'cookie'}]);
  state.created.options.cookies.setAll([{name: 'sb-test', value: 'next', options: {path: '/', sameSite: 'lax', httpOnly: false, maxAge: 60}}]);
  assert.deepEqual(state.set, [['sb-test', 'next', {path: '/', sameSite: 'lax', httpOnly: true, maxAge: 60}]]);
}));

test('auth service failures and throttling keep their status instead of reading as signed out or wrong password', () => withConfig({}, async () => {
  const {authFailureStatus} = authWith(client());
  assert.equal(authFailureStatus(null), null);
  assert.equal(authFailureStatus({status: 401}), null);
  assert.equal(authFailureStatus({status: 400}), null);
  assert.equal(authFailureStatus({status: 429}), 429);
  assert.equal(authFailureStatus({status: 503}), 503);
  assert.equal(authFailureStatus({status: 0, name: 'AuthRetryableFetchError'}), 503);
  for (const [error, status] of [[{status: 503}, 503], [{status: 0, name: 'AuthRetryableFetchError'}, 503], [{status: 429}, 429], [{status: 400}, 401]]) {
    const auth = authWith(client({signIn: {error}}));
    const route = loadTs('src/app/api/auth/login/route.ts', {'@/lib/auth': auth, '@/lib/store': {getStore: async () => null}});
    const response = await route.POST(post('/api/auth/login', {email: 'test@example.invalid', password: 'synthetic'}));
    assert.equal(response.status, status);
    if (status === 401) assert.match((await response.json()).error, /邮箱和密码/);
  }
  for (const [error, status] of [[{status: 503}, 503], [{status: 429}, 429], [{status: 401}, 401]]) {
    const auth = authWith(client({error}));
    const route = loadTs('src/app/api/auth/password/route.ts', {'@/lib/auth': auth, '@/lib/store': {getStore: async () => null}});
    const response = await route.POST(post('/api/auth/password', {currentPassword: 'a-current-secret', newPassword: 'a-new-secret-value'}));
    assert.equal(response.status, status);
  }
}));

test('a session lookup outage is an error, while an expired session is simply signed out', () => withConfig({}, async () => {
  const lookup = async (stub) => loadTs('src/lib/store/index.ts', {'@/lib/auth': authWith(stub)}).getStore();
  assert.equal(await lookup(client({error: {status: 401}})), null);
  assert.equal(await lookup(client({user: null})), null);
  for (const [error, status] of [[{status: 503}, 503], [{status: 429}, 429], [{status: 0, name: 'AuthRetryableFetchError'}, 503]]) {
    await assert.rejects(lookup(client({error})), (thrown) => thrown.name === 'AuthUnavailableError' && thrown.status === status);
  }
  const {apiError} = loadTs('src/lib/http.ts', {'@/lib/store': {getStore: async () => null}});
  const {AuthUnavailableError} = authWith(client());
  assert.equal(apiError(new AuthUnavailableError(503)).status, 503);
  assert.equal(apiError(new AuthUnavailableError(429)).status, 429);
}));

test('routes that open the store themselves report an auth outage instead of failing unhandled', async () => {
  const {AuthUnavailableError} = authWith(client());
  const get = (path) => new Request(`http://localhost:3000${path}`);
  const context = {params: Promise.resolve({id: 'plan-1'})};
  const stamp = '2026-10-30T00:00:00.000Z';
  const routes = [
    ['src/app/api/plans/[id]/archive/route.ts', 'POST', post('/api/plans/plan-1/archive', {archived: true, expectedUpdatedAt: stamp}), context],
    ['src/app/api/plans/[id]/finalize/route.ts', 'POST', post('/api/plans/plan-1/finalize', {finalized: true, version: 1, expectedUpdatedAt: stamp}), context],
    ['src/app/api/plans/[id]/history/route.ts', 'GET', get('/api/plans/plan-1/history'), context],
    ['src/app/api/learning/quiz/route.ts', 'GET', get('/api/learning/quiz?history=1')],
    ['src/app/api/learning/quiz/route.ts', 'POST', post('/api/learning/quiz', {organ: 'heart', kind: 'system', answer: 'x'})],
  ];
  for (const status of [503, 429]) {
    for (const [file, method, request, ...rest] of routes) {
      const route = loadTs(file, {'@/lib/store': {getStore: async () => { throw new AuthUnavailableError(status); }}});
      assert.equal((await route[method](request, ...rest)).status, status, `${method} ${file}`);
    }
  }
  for (const [file, method, request, ...rest] of routes) {
    const route = loadTs(file, {'@/lib/store': {getStore: async () => null}});
    assert.equal((await route[method](request, ...rest)).status, 401, `${method} ${file}`);
  }
});

test('the acting account comes from the verified session; malformed display names fall back to the email', () => withConfig({}, async () => {
  const lookup = async (user) => loadTs('src/lib/store/index.ts', {'@/lib/auth': authWith(client({user}))}).getStore();
  const base = {id: 'test-owner', email: 'test@example.invalid'};
  assert.deepEqual((await lookup({...base, user_metadata: {full_name: ' 李医生 '}})).actor, {id: 'test-owner', name: '李医生'});
  for (const full_name of [{unexpected: 'object'}, '   ', 42, undefined]) {
    assert.equal((await lookup({...base, user_metadata: {full_name}})).actor.name, 'test@example.invalid');
  }
  assert.equal((await lookup({id: 'no-email'})).actor.name, '登录用户');
  const first = await lookup(base);
  const second = await lookup(base);
  assert.notEqual(first, second, 'a store must never be shared between requests');
}));

test('an un-migrated database is refused instead of serving rows without isolation', () => withConfig({}, async () => {
  const lookup = async (stub) => loadTs('src/lib/store/index.ts', {'@/lib/auth': authWith(stub)}).getStore();
  const user = {id: 'test-owner', email: 'test@example.invalid'};
  for (const stub of [client({user, version: 0}), client({user, version: null}), client({user, versionError: {message: 'function missing'}})]) {
    await assert.rejects(lookup(stub), /用户隔离迁移/);
  }
  assert.ok(await lookup(client({user, version: 1})));
}));

test('administrator access is only granted after the database confirms the role', () => withConfig({}, async () => {
  const lookup = async (stub) => loadTs('src/lib/admin.ts', {'server-only': {}, './auth': authWith(stub)}).getAdminStore();
  const user = {id: 'admin-user', email: 'admin@example.invalid'};
  assert.deepEqual(await lookup(client({user: null})), {error: '请先登录', status: 401});
  assert.equal((await lookup(client({error: {status: 503}}))).status, 503);
  assert.equal((await lookup(client({error: {status: 429}}))).status, 429);
  assert.equal((await lookup(client({user, adminError: {message: 'missing function'}}))).status, 503);
  assert.equal((await lookup(client({user, isAdmin: false}))).status, 403);
  assert.equal((await lookup(client({user, isAdmin: 'true'}))).status, 403);
  const granted = await lookup(client({user, isAdmin: true}));
  assert.equal(granted.userId, 'admin-user');
  assert.equal(granted.store.kind, 'supabase');
}));

test('login, logout and password routes validate input before calling the auth service', () => withConfig({}, async () => {
  const stub = client({user: {id: 'u', email: 'u@example.invalid'}});
  const mocks = {'@/lib/auth': authWith(stub), '@/lib/store': {getStore: async () => null}};
  const login = loadTs('src/app/api/auth/login/route.ts', mocks);
  for (const body of [undefined, '{not json', 'null', {email: 'a@example.invalid'}, {email: 1, password: 'x'},
    {email: 'a'.repeat(321), password: 'x'}, {email: 'a@example.invalid', password: 'x'.repeat(1025)}]) {
    assert.equal((await login.POST(post('/api/auth/login', body))).status, 400, JSON.stringify(body)?.slice(0, 60));
  }
  assert.deepEqual(stub.calls, []);
  assert.equal((await login.POST(post('/api/auth/login', {email: 'a@example.invalid', password: 'x'}))).status, 200);
  assert.deepEqual(stub.calls, [['signIn', 'a@example.invalid']]);

  const password = loadTs('src/app/api/auth/password/route.ts', mocks);
  for (const body of [undefined, '[]', {currentPassword: '', newPassword: 'long-enough-value'}, {currentPassword: 'old-secret-1', newPassword: 'short'},
    {currentPassword: 'same-secret-value', newPassword: 'same-secret-value'}, {currentPassword: 'old-secret-1', newPassword: 'x'.repeat(129)}]) {
    assert.equal((await password.POST(post('/api/auth/password', body))).status, 400, JSON.stringify(body)?.slice(0, 60));
  }
  assert.equal((await password.POST(post('/api/auth/password', {currentPassword: 'old-secret-1', newPassword: 'a-new-secret-value'}))).status, 200);
  assert.deepEqual(stub.calls.at(-1), ['updateUser', ['current_password', 'password']]);

  const logout = loadTs('src/app/api/auth/logout/route.ts', mocks);
  assert.equal((await logout.POST(post('/api/auth/logout', {}))).status, 200);
  assert.deepEqual(stub.calls.at(-1), ['signOut']);
}));

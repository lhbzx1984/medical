// Loopback-only synthetic Supabase and AI fixture; it never contacts external services.
// Auth is a small token issuer. The data API translates the PostgREST requests that supabase-js sends into SQL and
// runs them in PGlite against supabase/schema.sql as the `authenticated` role, so RLS, grants and RPCs are the real ones.
// Every identity, case and answer is synthetic. Start after `npm run build`; run tests/e2e-flow.cjs against it.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { PGlite } = require('@electric-sql/pglite');

const root = path.resolve(__dirname, '..');
const APP_PORT = 4401;
const FIXTURE_PORT = 4402;
const ADMIN = { id: '11111111-1111-4111-8111-111111111111', email: 'audit-admin@example.invalid', name: '合成管理员', password: 'local-fixture-password' };
const USER = { id: '22222222-2222-4222-8222-222222222222', email: 'audit-user@example.invalid', name: '合成专家', password: 'local-fixture-password' };
const users = [ADMIN, USER];
const TABLES = new Set(['patients', 'surgical_plans', 'plan_versions', 'plan_feedback', 'simulations', 'knowledge_entries',
  'chat_sessions', 'chat_messages', 'generated_images', 'case_edit_history', 'learning_attempts', 'medplan_admin_audit']);
const defaults = { plan: null, refine: null, failChat: false, failAuth: 0, failSimulation: false, failTable: '',
  slowChat: false, truncatedChat: false, invalidImage: false, cancelled: 0, lastSystem: '' };
const state = { ...defaults };
const tokens = new Map();
const refreshTokens = new Map();
const plan = { summary: '软件验证用合成方案', diagnosis: '合成病例', procedureName: '合成演示术式',
  anesthesia: '演示', position: '演示', approach: '演示', region: '盆腔', focusOrgan: 'uterus',
  instruments: ['手术刀'], steps: [{ name: '演示切开', detail: '软件测试步骤', duration: '10分钟', risk: '测试', keyPoints: ['测试'] }],
  risks: [{ risk: '测试风险', mitigation: '测试措施' }], postop: ['测试观察'], simulationNotes: '仅验证软件行为' };

let db;
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const publicUser = (user) => ({ id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email,
  email_confirmed_at: '2026-10-30T00:00:00Z', phone: '', app_metadata: { provider: 'email' },
  user_metadata: { full_name: user.name }, identities: [], created_at: '2026-10-30T00:00:00Z', updated_at: '2026-10-30T00:00:00Z' });
function issue(user) {
  const now = Math.floor(Date.now() / 1000);
  const access = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, aud: 'authenticated', role: 'authenticated', email: user.email,
    iat: now, exp: now + 3600, jti: crypto.randomUUID() })}.local-fixture-only`;
  tokens.set(access, user.id);
  const refresh = `refresh-${crypto.randomUUID()}`;
  refreshTokens.set(refresh, user.id);
  return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600,
    refresh_token: refresh, user: publicUser(user) };
}

// ── PostgREST subset ──────────────────────────────────────────────────────────
const ident = (name) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw Object.assign(new Error(`bad identifier ${name}`), { status: 400 });
  return `"${name}"`;
};
const table = (name) => {
  if (!TABLES.has(name)) throw Object.assign(new Error(`unknown table ${name}`), { status: 404 });
  return `public.${ident(name)}`;
};
function splitTopLevel(text) {
  const parts = [];
  let current = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted && char === '\\') { current += char + text[++i]; continue; }
    if (char === '"') quoted = !quoted;
    if (char === ',' && !quoted) { parts.push(current); current = ''; } else current += char;
  }
  return [...parts, current];
}
const unquote = (value) => value.startsWith('"') ? value.slice(1, -1).replace(/\\(["\\])/g, '$1') : value;
function condition(column, operator, value, params) {
  const target = `t.${ident(column)}`;
  const text = unquote(value);
  if (operator === 'is') return `${target} is ${{ null: 'null', true: 'true', false: 'false' }[text] ?? 'null'}`;
  const sql = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'like', ilike: 'ilike' }[operator];
  if (!sql) throw Object.assign(new Error(`unsupported operator ${operator}`), { status: 400 });
  params.push(text);
  return `${target} ${sql} $${params.length}`;
}
function where(url, params) {
  const clauses = [];
  for (const [key, raw] of url.searchParams) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(key)) continue;
    if (key === 'or') {
      const inner = raw.replace(/^\(/, '').replace(/\)$/, '');
      clauses.push(`(${splitTopLevel(inner).map((part) => {
        const match = /^([a-z_][a-z0-9_]*)\.([a-z]+)\.([\s\S]*)$/.exec(part);
        if (!match) throw Object.assign(new Error('bad or filter'), { status: 400 });
        return condition(match[1], match[2], match[3], params);
      }).join(' or ')})`);
      continue;
    }
    const match = /^([a-z]+)\.([\s\S]*)$/.exec(raw);
    if (!match) throw Object.assign(new Error(`bad filter ${key}`), { status: 400 });
    clauses.push(condition(key, match[1], match[2], params));
  }
  return clauses.length ? ` where ${clauses.join(' and ')}` : '';
}
function ordering(url) {
  const order = url.searchParams.get('order');
  if (!order) return '';
  return ' order by ' + order.split(',').map((item) => {
    const [column, direction = 'asc'] = item.split('.');
    return `t.${ident(column)} ${direction === 'desc' ? 'desc' : 'asc'}`;
  }).join(', ');
}
const columnsOf = (url) => {
  const select = url.searchParams.get('select') ?? '*';
  return select === '*' ? 't.*' : select.split(',').map((column) => `t.${ident(column.trim())}`).join(', ');
};

/** Runs `action(tx)` in one transaction as the signed-in role, like PostgREST does. */
async function asRole(userId, action) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${userId ? 'authenticated' : 'anon'}`);
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? '']);
    return action(tx);
  });
}
const jsonRows = (rows) => rows.map((row) => row.r);

async function rest(req, url, body, userId) {
  const segments = url.pathname.replace('/rest/v1/', '').split('/');
  if (segments[0] === 'rpc') {
    const fn = ident(segments[1]);
    const args = Object.entries(body ?? {});
    const params = args.map(([, value]) => (value !== null && typeof value === 'object' ? JSON.stringify(value) : value));
    const named = args.map(([name], index) => `${ident(name)} := $${index + 1}`).join(', ');
    return asRole(userId, async (tx) => {
      const { rows: meta } = await tx.query(
        "select proretset, prorettype::regtype::text as type from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace limit 1", [segments[1]]);
      if (!meta.length) throw Object.assign(new Error(`function ${segments[1]} not found`), { status: 404, code: 'PGRST202' });
      if (meta[0].proretset) {
        const { rows } = await tx.query(`select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) as r from public.${fn}(${named}) q`, params);
        return { status: 200, body: rows[0].r };
      }
      if (meta[0].type === 'void') { await tx.query(`select public.${fn}(${named})`, params); return { status: 200, body: null }; }
      const { rows } = await tx.query(`select to_jsonb(public.${fn}(${named})) as r`, params);
      return { status: 200, body: rows[0].r };
    });
  }
  const target = table(segments[0]);
  const params = [];
  if (req.method === 'GET') {
    if (state.failTable === segments[0]) throw Object.assign(new Error('Synthetic database failure'), { status: 500, code: 'XX000' });
    const sql = `select ${columnsOf(url)} from ${target} t${where(url, params)}${ordering(url)}${url.searchParams.get('limit') ? ` limit ${Number(url.searchParams.get('limit'))}` : ''}`;
    return asRole(userId, async (tx) => ({ status: 200, body: jsonRows((await tx.query(`select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) as r from (${sql}) q`, params)).rows)[0] }));
  }
  const prefer = req.headers.prefer ?? '';
  const representation = prefer.includes('return=representation');
  if (req.method === 'POST') {
    const rows = Array.isArray(body) ? body : [body];
    const columns = Object.keys(rows[0] ?? {}).map(ident);
    const upsert = prefer.includes('resolution=merge-duplicates');
    const conflict = (url.searchParams.get('on_conflict') ?? 'id').split(',').map((column) => ident(column.trim()));
    const sets = columns.filter((column) => !conflict.includes(column)).map((column) => `${column} = excluded.${column}`);
    const sql = `insert into ${target} (${columns.join(', ')}) select ${columns.join(', ')} from jsonb_populate_recordset(null::${target}, $1::jsonb)` +
      (upsert ? ` on conflict (${conflict.join(', ')}) do update set ${sets.join(', ')}` : '');
    return asRole(userId, async (tx) => {
      if (!representation) { await tx.query(sql, [JSON.stringify(rows)]); return { status: 201 }; }
      const result = await tx.query(`with changed as (${sql} returning *) select coalesce(jsonb_agg(to_jsonb(changed)), '[]'::jsonb) as r from changed`, [JSON.stringify(rows)]);
      return { status: 201, body: jsonRows(result.rows)[0] };
    });
  }
  if (req.method === 'PATCH') {
    const sets = Object.keys(body).map((column) => `${ident(column)} = r.${ident(column)}`);
    params.push(JSON.stringify(body));
    const sql = `update ${target} t set ${sets.join(', ')} from jsonb_populate_record(null::${target}, $${params.length}::jsonb) r${where(url, params)} returning t.*`;
    return asRole(userId, async (tx) => {
      const result = await tx.query(`with changed as (${sql}) select coalesce(jsonb_agg(to_jsonb(changed)), '[]'::jsonb) as r from changed`, params);
      return { status: representation ? 200 : 204, body: representation ? jsonRows(result.rows)[0] : undefined };
    });
  }
  if (req.method === 'DELETE') {
    return asRole(userId, async (tx) => { await tx.query(`delete from ${target} t${where(url, params)}`, params); return { status: 204 }; });
  }
  throw Object.assign(new Error('unsupported method'), { status: 405 });
}

// ── HTTP server ───────────────────────────────────────────────────────────────
function sqlError(error) {
  const code = error.code ?? 'XX000';
  const status = error.status ?? ({ '23505': 409, '40001': 409, '42501': 403, '22023': 400, 'P0001': 400, 'P0002': 404 }[code] ?? 400);
  return { status, body: { code, message: error.message, details: null, hint: null } };
}
async function reset() {
  Object.assign(state, defaults);
  tokens.clear();
  refreshTokens.clear();
  await db.exec('truncate public.patients, public.chat_sessions, public.generated_images, public.learning_attempts, public.medplan_ai_quota, public.medplan_admin_audit, public.knowledge_entries cascade');
}
const delta = (text) => 'data: ' + JSON.stringify({ choices: [{ delta: { content: text } }] }) + '\n\n';

const fixture = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const send = (value, status = 200) => { res.statusCode = status; res.end(value === undefined ? undefined : JSON.stringify(value)); };
  try {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : undefined;
    const url = new URL(req.url, 'http://127.0.0.1');
    const bearer = req.headers.authorization?.slice(7);

    if (url.pathname === '/__test/state') {
      if (req.method === 'POST') {
        if (body.reset) await reset();
        if (body.clearRates) await db.exec('truncate public.medplan_ai_quota');
        const patch = { ...body };
        delete patch.reset;
        delete patch.clearRates;
        Object.assign(state, patch);
      }
      const count = async (name) => Number((await db.query(`select count(*)::int as n from public.${name}`)).rows[0].n);
      return send({ ...state, counts: { messages: await count('chat_messages'), images: await count('generated_images') } });
    }
    if (url.pathname === '/__test/sql') { // superuser read for invariant checks; bypasses RLS on purpose
      return send((await db.query(body.query, body.params ?? [])).rows);
    }

    if (url.pathname.startsWith('/auth/v1/')) {
      if (state.failAuth) return send({ message: 'Synthetic Auth unavailable', msg: 'Synthetic Auth unavailable' }, state.failAuth);
      if (url.pathname === '/auth/v1/token') {
        if (url.searchParams.get('grant_type') === 'refresh_token') {
          const user = users.find((candidate) => candidate.id === refreshTokens.get(body.refresh_token));
          return user ? send(issue(user)) : send({ code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' }, 400);
        }
        const user = users.find((candidate) => candidate.email === body.email);
        if (!user || user.password !== body.password) {
          return send({ code: 'invalid_credentials', error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' }, 400);
        }
        return send(issue(user));
      }
      if (url.pathname === '/auth/v1/user') {
        const user = users.find((candidate) => candidate.id === tokens.get(bearer));
        if (!user) return send({ code: 'bad_jwt', msg: 'invalid JWT' }, 401);
        if (req.method === 'PUT') {
          if (body.current_password !== user.password) return send({ code: 'invalid_credentials', msg: 'Invalid current password' }, 400);
          user.password = body.password;
        }
        return send(publicUser(user));
      }
      if (url.pathname === '/auth/v1/logout') { tokens.delete(bearer); res.statusCode = 204; return res.end(); }
      return send({ msg: 'Unknown auth endpoint' }, 404);
    }

    if (url.pathname.startsWith('/rest/v1/')) {
      const userId = tokens.get(bearer);
      if (!userId) return send({ code: 'PGRST301', message: 'JWT invalid' }, 401);
      try {
        const result = await rest(req, url, body, userId);
        res.statusCode = result.status;
        return res.end(result.body === undefined ? undefined : JSON.stringify(result.body));
      } catch (error) {
        const failure = sqlError(error);
        return send(failure.body, failure.status);
      }
    }

    if (url.pathname === '/v1/images/generations') {
      return send({ data: [{ url: state.invalidImage ? 42 : 'http://127.0.0.1:4401/cases/uterus-thumb.png' }] });
    }
    if (url.pathname === '/v1/chat/completions') {
      state.lastSystem = body.messages?.[0]?.content ?? '';
      if (body.stream) {
        if (state.failChat) return send({ error: 'SYNTHETIC_UPSTREAM_FAILURE' }, 503);
        res.setHeader('Content-Type', 'text/event-stream');
        res.write(delta('合成测试回答'));
        if (state.truncatedChat) return res.end();
        if (state.slowChat) {
          const timer = setTimeout(() => res.end('data: [DONE]\n\n'), 10000);
          res.on('close', () => { clearTimeout(timer); if (!res.writableEnded) state.cancelled++; });
          return;
        }
        return res.end('data: [DONE]\n\n');
      }
      const simulating = state.lastSystem.includes('手术模拟编排器');
      if (simulating && state.failSimulation) return send({ error: 'SYNTHETIC_SIM_FAILURE' }, 503);
      const content = simulating
        ? { steps: [{ index: 1, name: '定位', narration: '合成测试', view: 'overview', durationSec: 8, instruments: [], action: 'position' },
          { index: 2, name: '演示切开', narration: '合成测试', view: 'organ', durationSec: 8, instruments: ['手术刀'], action: 'cut' }] }
        : state.lastSystem.includes('反馈意见') ? (state.refine ?? { ...plan, changelog: '合成修订说明' }) : (state.plan ?? plan);
      await new Promise((resolve) => setTimeout(resolve, 120));
      return send({ choices: [{ message: { content: JSON.stringify(content) } }] });
    }
    send({ error: 'Unknown fixture endpoint' }, 404);
  } catch (error) {
    send({ code: 'XX000', message: error.message }, 500);
  }
});

async function main() {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key, email text);
    grant usage on schema auth to anon, authenticated;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
  await db.exec(fs.readFileSync(path.join(root, 'supabase/schema.sql'), 'utf8'));
  for (const user of users) await db.query('insert into auth.users(id, email) values ($1, $2)', [user.id, user.email]);
  await db.query('insert into public.medplan_admins(user_id) values ($1)', [ADMIN.id]);

  const output = path.resolve(root, process.env.MEDPLAN_TEST_OUTPUT || '../审查结果/修复验证');
  fs.mkdirSync(output, { recursive: true });
  fixture.listen(FIXTURE_PORT, '127.0.0.1', () => {
    const log = fs.openSync(path.join(output, 'server.log'), 'w');
    const child = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(APP_PORT)], {
      cwd: root, windowsHide: true, stdio: ['ignore', log, log],
      env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
        SUPABASE_URL: `http://127.0.0.1:${FIXTURE_PORT}`, SUPABASE_ANON_KEY: 'sb_publishable_local_fixture',
        NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
        AGNES_API_KEY: 'local-fixture-key', AGNES_API_BASE_URL: `http://127.0.0.1:${FIXTURE_PORT}` } });
    fs.writeFileSync(path.join(output, 'fixture.json'), JSON.stringify({ fixturePid: process.pid, appPid: child.pid }));
    child.on('exit', (code) => { fixture.close(); process.exitCode = code || 0; });
    process.on('SIGINT', () => { child.kill(); fixture.close(); });
    console.log(`Synthetic fixture 127.0.0.1:${FIXTURE_PORT}; production app 127.0.0.1:${APP_PORT}`);
  });
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

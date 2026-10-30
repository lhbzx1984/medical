// Explicit integration check; never contacts a cloud database or changes application dependencies.
// npm install --prefix <temporary-runtime> --save-exact @electric-sql/pglite@0.5.13
// node tests/postgres-check.mjs --pglite-dir <temporary-runtime> --output <results-directory>
// PGLITE_RUNTIME_DIR may replace --pglite-dir. PGlite is single-connection: this is not a concurrency test.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
  'pglite-dir': { type: 'string' }, output: { type: 'string' },
} });
const runtimeDir = values['pglite-dir'] ?? process.env.PGLITE_RUNTIME_DIR;
const requireRuntime = createRequire(runtimeDir
  ? path.join(path.resolve(runtimeDir), 'package.json') : import.meta.url);
const { PGlite } = await import(pathToFileURL(requireRuntime.resolve('@electric-sql/pglite')).href);
const schemaPath = fileURLToPath(new URL('../supabase/schema.sql', import.meta.url));
const schema = await readFile(schemaPath, 'utf8');
const outputDir = values.output && path.resolve(values.output);
const ownerA = '11111111-1111-4111-8111-111111111111';
const ownerB = '22222222-2222-4222-8222-222222222222';
const unknownOwner = '33333333-3333-4333-8333-333333333333';
const tables = ['patients', 'surgical_plans', 'plan_versions', 'plan_feedback', 'simulations',
  'knowledge_entries', 'chat_sessions', 'chat_messages', 'generated_images', 'rate_limit_windows'];
const content = { summary: '合成测试', steps: [{ index: 1, name: '测试步骤' }] };
const simulation = { focusOrgan: 'intestine', region: '腹腔', steps: [{ index: 1, name: '定位', durationSec: 8 }] };
const report = {
  startedAt: new Date().toISOString(), schemaPath,
  schemaSha256: createHash('sha256').update(schema).digest('hex'),
  engine: 'PGlite (actual PostgreSQL WASM, in-memory)',
  harness: 'Only auth.users, auth.uid(), test roles and Supabase-like table grants are supplied; schema.sql executes unchanged.',
  limitations: ['Single PostgreSQL connection; no multi-session lock contention or multi-instance concurrency verified.',
    'No Supabase cloud, PostgREST transport, JWT signature validation or live service connectivity verified.',
    'RLS checks use SET ROLE and a synthetic JWT subject; cloud PostgreSQL version, default privileges and legacy policies still require deployment verification.'],
  checks: [],
};

async function check(name, body) {
  try {
    await body();
    report.checks.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    report.checks.push({ name, passed: false, error: error.message, code: error.code });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

async function bootstrap(db) {
  // The grants reproduce Supabase public-table access, so RLS (not missing grants) must deny writes.
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  `);
  await db.query('insert into auth.users(id) values ($1), ($2)', [ownerA, ownerB]);
}

async function asRole(db, role, owner, body) {
  assert.ok(['anon', 'authenticated', 'service_role'].includes(role));
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [owner ?? '']);
  await db.exec(`set role ${role}`);
  try { return await body(); }
  finally { await db.exec('reset role'); }
}

const calls = {
  create_case: 'select public.create_case($1::uuid, $2::jsonb, $3::text) as result',
  commit_plan: 'select public.commit_plan($1::uuid, $2::uuid, $3::integer, $4::jsonb, $5::text, $6::text, $7::text[], $8::jsonb, $9::jsonb) as result',
  ensure_chat_session: 'select public.ensure_chat_session($1::text, $2::text, $3::text, $4::uuid) as result',
  append_chat_messages: 'select public.append_chat_messages($1::text, $2::uuid, $3::jsonb) as result',
  consume_rate_limit: 'select public.consume_rate_limit($1::uuid, $2::text, $3::integer, $4::integer) as result',
};
async function rpc(db, name, args, role = 'service_role', owner = null) {
  return asRole(db, role, owner, async () => (await db.query(calls[name], args)).rows[0].result);
}
const createCase = (db, owner, name = '合成患者') => rpc(db, 'create_case', [owner, JSON.stringify({ name, age: 42 }), null]);
function commitArgs(planId, owner, version, overrides = {}) {
  const input = { content, simulation, feedback: null, source: 'ai', ...overrides };
  return [planId, owner, version, JSON.stringify(input.content), '合成变更', input.source, ['合成知识'],
    JSON.stringify(input.simulation), input.feedback === null ? null : JSON.stringify(input.feedback)];
}
async function snapshot(db) {
  const result = {};
  for (const table of tables) {
    result[table] = (await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), '[]'::jsonb) as data from public.${table} t`)).rows[0].data;
  }
  return result;
}
async function rejectsCode(operation, code) {
  await assert.rejects(operation, error => error.code === code,
    `expected PostgreSQL SQLSTATE ${code}`);
}

const db = new PGlite();
try {
  await bootstrap(db);
  report.postgresVersion = (await db.query('select version() as version')).rows[0].version;
  await check('schema.sql executes unchanged on PostgreSQL', () => db.exec(schema));
  if (!report.checks[0].passed) throw new Error('Cannot continue without installed schema');
  let caseA, caseB;

  await check('service role creates linked patient and owner-bound plan', async () => {
    caseA = await createCase(db, ownerA);
    caseB = await createCase(db, ownerB, '第二位合成患者');
    assert.equal(caseA.plan.patient_id, caseA.patient.id);
    assert.equal(caseA.plan.owner_id, ownerA);
    assert.equal(caseA.plan.current_version, 0);
    assert.equal(caseA.plan.title, '合成患者·手术规划');
    assert.equal(caseA.patient.age, 42);
  });
  await check('create_case rolls back patient when plan owner foreign key fails', async () => {
    const before = await snapshot(db);
    await rejectsCode(() => createCase(db, unknownOwner), '23503');
    assert.deepEqual(await snapshot(db), before);
  });
  await check('create_case rejects empty names without side effects', async () => {
    const before = await snapshot(db);
    await rejectsCode(() => createCase(db, ownerA, '  '), '22023');
    assert.deepEqual(await snapshot(db), before);
  });
  await check('commit_plan atomically creates version and simulation and advances plan', async () => {
    const result = await rpc(db, 'commit_plan', commitArgs(caseA.plan.id, ownerA, 0));
    assert.equal(result.version.version, 1);
    assert.equal(result.simulation.version, 1);
    assert.equal(result.version.plan_id, caseA.plan.id);
    assert.deepEqual(result.version.content, content);
    assert.deepEqual(result.simulation.steps, simulation.steps);
    assert.equal(result.feedback, null);
    const plan = (await db.query('select current_version, status from surgical_plans where id=$1', [caseA.plan.id])).rows[0];
    assert.deepEqual(plan, { current_version: 1, status: 'simulated' });
  });
  await check('late invalid feedback rolls back inserted version and simulation', async () => {
    const before = await snapshot(db);
    await rejectsCode(() => rpc(db, 'commit_plan', commitArgs(caseA.plan.id, ownerA, 1,
      { source: 'expert_refine', feedback: { expertName: '测试专家', comment: '  ' } })), '22023');
    assert.deepEqual(await snapshot(db), before);
  });
  await check('expert refinement preserves feedback target version and advances plan', async () => {
    const result = await rpc(db, 'commit_plan', commitArgs(caseA.plan.id, ownerA, 1,
      { source: 'expert_refine', feedback: { expertName: '测试专家', comment: '合成反馈' } }));
    assert.equal(result.version.version, 2);
    assert.equal(result.simulation.version, 2);
    assert.equal(result.feedback.version, 1);
    assert.equal(result.feedback.comment, '合成反馈');
    assert.equal((await db.query('select status from surgical_plans where id=$1', [caseA.plan.id])).rows[0].status, 'refined');
  });
  await check('stale expected version is rejected without modifying history', async () => {
    const before = await snapshot(db);
    await rejectsCode(() => rpc(db, 'commit_plan', commitArgs(caseA.plan.id, ownerA, 1)), '40001');
    assert.deepEqual(await snapshot(db), before);
  });
  await check('foreign and null owner cannot commit another owner plan', async () => {
    const before = await snapshot(db);
    for (const owner of [ownerB, null]) {
      await rejectsCode(() => rpc(db, 'commit_plan', commitArgs(caseA.plan.id, owner, 2)), '42501');
    }
    assert.deepEqual(await snapshot(db), before);
  });
  await check('invalid plan and simulation step payloads leave no partial state', async () => {
    const before = await snapshot(db);
    for (const overrides of [{ content: { steps: [] } }, { simulation: { steps: [] } },
      { content: { steps: {} } }, { simulation: null }, { source: null }]) {
      await rejectsCode(() => rpc(db, 'commit_plan', commitArgs(caseA.plan.id, ownerA, 2, overrides)), '22023');
    }
    assert.deepEqual(await snapshot(db), before);
  });
  for (const table of ['plan_versions', 'simulations']) {
    await check(`${table} unique index rejects duplicate plan/version without changing original`, async () => {
      const before = await snapshot(db);
      const fields = table === 'plan_versions' ? 'content' : 'steps';
      await rejectsCode(() => db.query(`insert into ${table}(id, plan_id, version, ${fields}) select gen_random_uuid(), plan_id, version, ${fields} from ${table} where plan_id=$1 and version=1`, [caseA.plan.id]), '23505');
      assert.deepEqual(await snapshot(db), before);
    });
  }
  await check('chat session is idempotent for its owner and rejects owner takeover', async () => {
    await rpc(db, 'ensure_chat_session', ['session-a', 'learning', '合成对话', ownerA]);
    const before = await snapshot(db);
    await rpc(db, 'ensure_chat_session', ['session-a', 'guidance', '重命名', ownerA]);
    await rejectsCode(() => rpc(db, 'ensure_chat_session', ['session-a', 'learning', '篡改', ownerB]), '42501');
    assert.deepEqual(await snapshot(db), before);
    await rpc(db, 'ensure_chat_session', ['session-b', 'guidance', '另一对话', ownerB]);
  });
  await check('chat append rejects foreign owner and rolls back a partially invalid batch', async () => {
    await rpc(db, 'append_chat_messages', ['session-a', ownerA, JSON.stringify([{ role: 'user', content: '合成问题' }, { role: 'assistant', content: '合成回答' }])]);
    await rpc(db, 'append_chat_messages', ['session-b', ownerB, JSON.stringify([{ role: 'user', content: '另一个问题' }])]);
    const before = await snapshot(db);
    await rejectsCode(() => rpc(db, 'append_chat_messages', ['session-a', ownerB, '[]']), '42501');
    await rejectsCode(() => rpc(db, 'append_chat_messages', ['session-a', ownerA,
      JSON.stringify([{ role: 'user', content: '该项必须回滚' }, { role: 'system', content: '无效角色' }])]), '22023');
    assert.deepEqual(await snapshot(db), before);
  });
  await check('rate limit enforces cap and separates users and actions', async () => {
    const allowed = [];
    for (let i = 0; i < 5; i++) allowed.push(await rpc(db, 'consume_rate_limit', [ownerA, 'chat', 3, 86400]));
    assert.deepEqual(allowed, [true, true, true, false, false]);
    assert.equal(await rpc(db, 'consume_rate_limit', [ownerB, 'chat', 3, 86400]), true);
    assert.equal(await rpc(db, 'consume_rate_limit', [ownerA, 'image', 3, 86400]), true);
    assert.equal((await db.query("select request_count from rate_limit_windows where owner_id=$1 and action='chat'", [ownerA])).rows[0].request_count, 4);
  });
  await check('rate limit resets an expired stored window and rejects invalid limits', async () => {
    await db.query("update rate_limit_windows set window_start=now()-interval '2 days' where owner_id=$1 and action='chat'", [ownerA]);
    assert.equal(await rpc(db, 'consume_rate_limit', [ownerA, 'chat', 3, 86400]), true);
    assert.equal((await db.query("select request_count from rate_limit_windows where owner_id=$1 and action='chat'", [ownerA])).rows[0].request_count, 1);
    const before = await snapshot(db);
    for (const args of [[null, 'chat', 3, 60], [ownerA, '', 3, 60], [ownerA, 'chat', 0, 60], [ownerA, 'chat', 3, 0]]) {
      await rejectsCode(() => rpc(db, 'consume_rate_limit', args), '22023');
    }
    assert.deepEqual(await snapshot(db), before);
  });

  await db.query("insert into generated_images(id,owner_id,prompt,url) values (gen_random_uuid(),$1,'合成图像','https://example.invalid/a'), (gen_random_uuid(),$2,'另一图像','https://example.invalid/b')", [ownerA, ownerB]);
  await db.query("insert into knowledge_entries(id,title,content) values (gen_random_uuid(),'合成知识','测试内容')");
  // Give both owners version/simulation/feedback rows so a missing child policy cannot hide in empty fixtures.
  await rpc(db, 'commit_plan', commitArgs(caseB.plan.id, ownerB, 0,
    { feedback: { expertName: '测试专家', comment: '另一反馈' } }));

  await check('all browser roles really have table privileges and no RLS bypass', async () => {
    for (const role of ['anon', 'authenticated']) {
      await asRole(db, role, ownerA, async () => {
        const identity = (await db.query('select current_user as role, auth.uid() as owner')).rows[0];
        assert.equal(identity.role, role);
        assert.equal(identity.owner, ownerA);
        assert.equal((await db.query('select rolbypassrls from pg_roles where rolname=current_user')).rows[0].rolbypassrls, false);
        for (const table of tables) {
          for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
            const result = await db.query('select has_table_privilege(current_user,$1,$2) as allowed', [`public.${table}`, privilege]);
            assert.equal(result.rows[0].allowed, true);
          }
        }
      });
    }
  });
  const expectedOwnerCounts = {
    patients: [1, 1], surgical_plans: [1, 1], plan_versions: [2, 1], plan_feedback: [1, 1],
    simulations: [2, 1], chat_sessions: [1, 1], chat_messages: [2, 1], generated_images: [1, 1],
    knowledge_entries: [1, 1], rate_limit_windows: [0, 0],
  };
  for (const table of tables) {
    await check(`${table} RLS permits owner reads, hides foreign rows and denies browser writes`, async () => {
      const before = await snapshot(db);
      for (const [i, [role, owner]] of [['authenticated', ownerA], ['authenticated', ownerB], ['anon', null]].entries()) {
        await asRole(db, role, owner, async () => {
          const result = await db.query(`select count(*)::int as count from public.${table}`);
          assert.equal(result.rows[0].count, role === 'anon' ? 0 : expectedOwnerCounts[table][i]);
          if (table !== 'rate_limit_windows') {
            const ownCase = owner === ownerA ? caseA : caseB;
            const ownSession = owner === ownerA ? 'session-a' : 'session-b';
            const expectedIds = before[table].filter(row => role !== 'anon' && (
              table === 'knowledge_entries' ||
              (table === 'patients' && row.id === ownCase.patient.id) ||
              (table === 'surgical_plans' && row.id === ownCase.plan.id) ||
              (['plan_versions', 'plan_feedback', 'simulations'].includes(table) && row.plan_id === ownCase.plan.id) ||
              (table === 'chat_sessions' && row.id === ownSession) ||
              (table === 'chat_messages' && row.session_id === ownSession) ||
              (table === 'generated_images' && row.owner_id === owner)
            )).map(row => row.id).sort();
            const visibleIds = (await db.query(`select id from public.${table} order by id`)).rows.map(row => row.id);
            assert.deepEqual(visibleIds, expectedIds);
          }
          const updateColumn = { patients: 'name', surgical_plans: 'title', plan_versions: 'changelog',
            plan_feedback: 'comment', simulations: 'region', knowledge_entries: 'content',
            chat_sessions: 'title', chat_messages: 'content', generated_images: 'prompt', rate_limit_windows: 'action' }[table];
          assert.equal((await db.query(`update public.${table} set ${updateColumn}='forbidden'`)).affectedRows, 0);
          assert.equal((await db.query(`delete from public.${table}`)).affectedRows, 0);
          const seedRow = before[table][0];
          assert.ok(seedRow, `${table} must have a nonempty write fixture`);
          const insertRow = { ...seedRow };
          if ('id' in insertRow) insertRow.id = table === 'chat_sessions' ? `forbidden-${owner}` : unknownOwner;
          if (table === 'rate_limit_windows') insertRow.action = 'forbidden';
          await rejectsCode(() => db.query(`insert into public.${table} select * from jsonb_populate_record(null::public.${table}, $1::jsonb)`, [JSON.stringify(insertRow)]), '42501');
        });
      }
      assert.deepEqual(await snapshot(db), before);
    });
  }
  for (const role of ['anon', 'authenticated']) {
    await check(`${role} cannot call any privileged RPC, even with valid owner arguments`, async () => {
      const before = await snapshot(db);
      const argumentsByName = {
        create_case: [ownerA, '{"name":"篡改"}', null],
        commit_plan: commitArgs(caseA.plan.id, ownerA, 2),
        ensure_chat_session: ['session-a', 'learning', '篡改', ownerA],
        append_chat_messages: ['session-a', ownerA, '[]'],
        consume_rate_limit: [ownerA, 'chat', 3, 60],
      };
      for (const [name, args] of Object.entries(argumentsByName)) {
        await rejectsCode(() => rpc(db, name, args, role, ownerA), '42501');
      }
      assert.deepEqual(await snapshot(db), before);
    });
  }
  await check('schema rerun preserves all existing data and privileges', async () => {
    const before = await snapshot(db);
    await db.exec(schema);
    assert.deepEqual(await snapshot(db), before);
    await rejectsCode(() => rpc(db, 'create_case', [ownerA, '{"name":"篡改"}', null], 'authenticated', ownerA), '42501');
    await asRole(db, 'authenticated', ownerA, async () => {
      assert.equal((await db.query('select count(*)::int as count from surgical_plans')).rows[0].count, 1);
    });
  });

  for (const duplicateTable of ['plan_versions', 'simulations']) {
    await check(`legacy duplicate ${duplicateTable} aborts schema migration and preserves all original rows`, async () => {
      const legacy = new PGlite();
      try {
        await bootstrap(legacy);
        await legacy.exec(schema);
        const { plan } = await createCase(legacy, ownerA);
        await rpc(legacy, 'commit_plan', commitArgs(plan.id, ownerA, 0));
        const index = duplicateTable === 'plan_versions' ? 'uq_plan_versions_plan_version' : 'uq_simulations_plan_version';
        await legacy.exec(`drop index public.${index}`);
        const dataColumn = duplicateTable === 'plan_versions' ? 'content' : 'steps';
        await legacy.query(`insert into ${duplicateTable}(id,plan_id,version,${dataColumn}) select gen_random_uuid(),plan_id,version,${dataColumn} from ${duplicateTable} limit 1`);
        // This pending upgrade proves BEGIN rolls back earlier DDL when the duplicate guard fails.
        await legacy.exec('alter table public.generated_images drop column owner_id cascade');
        const before = await snapshot(legacy);
        await assert.rejects(() => legacy.exec(schema), error => error.code === 'P0001' && /存在重复/.test(error.message));
        await legacy.exec('rollback');
        assert.deepEqual(await snapshot(legacy), before);
        assert.equal((await legacy.query("select count(*)::int as count from information_schema.columns where table_schema='public' and table_name='generated_images' and column_name='owner_id'")).rows[0].count, 0);
      } finally { await legacy.close(); }
    });
  }
} catch (error) {
  report.fatalError = error.message;
  console.error(error.stack);
} finally {
  await db.close();
  report.finishedAt = new Date().toISOString();
  report.passed = report.checks.filter(item => item.passed).length;
  report.failed = report.checks.filter(item => !item.passed).length;
  report.ok = report.failed === 0 && !report.fatalError;
  console.log(`PostgreSQL checks: ${report.passed} passed, ${report.failed} failed${report.fatalError ? ', fatal setup/runtime error' : ''}`);
  if (outputDir) {
    await mkdir(outputDir, { recursive: true });
    await writeFile(path.join(outputDir, 'postgres-results.json'), JSON.stringify(report, null, 2) + '\n');
  }
  process.exitCode = report.ok ? 0 : 1;
}

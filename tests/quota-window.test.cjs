const { PGlite } = require('@electric-sql/pglite');
const assert = require('node:assert/strict');
const fs = require('node:fs');

// AI 配额按固定 600 秒窗口计数。PGlite 里无法快进时钟，所以由数据库管理员把已记录的窗口起点向前挪，
// 模拟窗口已经过去：新窗口从零开始，旧窗口的记录保持原样，超过一天的记录在下一次扣减时被清理。
const USER = '00000000-0000-0000-0000-000000000001';
const OTHER = '00000000-0000-0000-0000-000000000002';

(async () => {
  // 恰好跨过窗口边界会让“同一窗口内用完”的断言失真，离边界不足 20 秒时先等它过去。
  const left = 600 - ((Date.now() / 1000) % 600);
  if (left < 20) await new Promise((resolve) => setTimeout(resolve, (left + 1) * 1000));

  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); grant usage on schema auth to anon,authenticated; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
  await db.exec(fs.readFileSync('supabase/schema.sql', 'utf8'));
  await db.query('insert into auth.users values ($1),($2)', [USER, OTHER]);

  const asUser = async () => {
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [USER]);
  };
  const asAdmin = () => db.exec('reset role');
  const consume = async (operation) => (await db.query('select public.medplan_consume_ai_quota($1) ok', [operation])).rows[0].ok;
  const windows = async (operation) => (await db.query(
    'select used from public.medplan_ai_quota where owner_id = $1 and operation = $2 order by window_start', [USER, operation])).rows.map((row) => row.used);

  await asUser();
  for (let i = 0; i < 5; i++) assert.equal(await consume('plan'), true, `plan call ${i + 1} is within the limit`);
  assert.equal(await consume('plan'), false, 'the sixth plan call in one window is refused');
  assert.equal(await consume('chat'), true, 'another operation has its own count');

  await asAdmin();
  assert.deepEqual(await windows('plan'), [5]);
  await db.exec("update public.medplan_ai_quota set window_start = window_start - interval '600 seconds'");

  await asUser();
  for (let i = 0; i < 5; i++) assert.equal(await consume('plan'), true, `plan call ${i + 1} of the next window`);
  assert.equal(await consume('plan'), false, 'the next window is limited too');
  await asAdmin();
  assert.deepEqual(await windows('plan'), [5, 5], 'each window keeps its own count');

  // 超过一天的记录在该账号下一次扣减时清理；别的账号的记录和近期窗口不受影响。
  await db.exec("update public.medplan_ai_quota set window_start = window_start - interval '2 days' where operation = 'chat'");
  await db.query("insert into public.medplan_ai_quota(owner_id, operation, window_start, used) values ($1, 'chat', now() - interval '3 days', 1)", [OTHER]);
  await asUser();
  assert.equal(await consume('image'), true);
  await asAdmin();
  assert.deepEqual(await windows('chat'), [], 'records older than a day are removed by the next call');
  assert.deepEqual(await windows('plan'), [5, 5], 'recent windows are kept');
  const other = await db.query('select count(*)::int n from public.medplan_ai_quota where owner_id = $1', [OTHER]);
  assert.equal(other.rows[0].n, 1, "cleanup only touches the caller's own records");

  console.log('AI quota windows roll over, keep separate counts and clean up old records');
  await db.close();
})().catch((error) => { console.error(error); process.exitCode = 1; });

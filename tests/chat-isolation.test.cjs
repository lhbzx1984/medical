const { PGlite } = require('@electric-sql/pglite');
const assert = require('node:assert/strict');
const fs = require('node:fs');

// 对话、消息和插图记录只属于创建它们的账号：他人读不到，不能往别人的对话里写消息，
// 也不能用已有的对话编号接管别人的对话；匿名角色和没有登录身份的会话同样被拒绝。
const A = '00000000-0000-0000-0000-000000000001';
const B = '00000000-0000-0000-0000-000000000002';
const MESSAGE = '30000000-0000-0000-0000-000000000001';
const IMAGE = '40000000-0000-0000-0000-000000000001';
const TABLES = ['chat_sessions', 'chat_messages', 'generated_images'];

(async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); grant usage on schema auth to anon,authenticated; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
  await db.exec(fs.readFileSync('supabase/schema.sql', 'utf8'));
  await db.query('insert into auth.users values ($1),($2)', [A, B]);
  await db.exec('set role authenticated');

  const signInAs = (user) => db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  const rejected = (sql, params, message) => assert.rejects(() => db.query(sql, params), message);
  const count = async (table) => (await db.query(`select count(*)::int n from public.${table}`)).rows[0].n;
  const owner = async (sql, params) => (await db.query(sql, params)).rows[0].owner;

  await signInAs(A);
  await db.query("insert into chat_sessions(id, mode, title) values ('session-a', 'learning', 'A 的对话')");
  await db.query("insert into chat_messages(id, session_id, role, content) values ($1, 'session-a', 'user', '你好')", [MESSAGE]);
  await db.query("insert into generated_images(id, prompt, url, organ_id) values ($1, '心脏插图', 'https://example.invalid/heart.png', 'heart')", [IMAGE]);
  assert.equal(await owner("select owner_id::text owner from chat_sessions where id = 'session-a'"), A, 'the conversation belongs to the signed-in account');
  assert.equal(await owner('select owner_id::text owner from generated_images where id = $1', [IMAGE]), A, 'the image belongs to the signed-in account');

  await signInAs(B);
  for (const table of TABLES) assert.equal(await count(table), 0, `${table} is invisible to another account`);
  await rejected("insert into chat_messages(id, session_id, role, content) values (gen_random_uuid(), 'session-a', 'user', '插入')", [],
    "another account cannot add messages to someone else's conversation");
  await rejected("insert into chat_sessions(id, mode, title) values ('session-a', 'learning', 'B') on conflict (id) do update set title = excluded.title", [],
    'an existing conversation id cannot be taken over');
  await rejected("insert into chat_sessions(id, mode, title, owner_id) values ('session-spoof', 'learning', 'x', $1)", [A],
    'a conversation cannot be created for another account');
  await rejected("insert into generated_images(id, prompt, url, owner_id) values (gen_random_uuid(), 'x', 'https://example.invalid/x.png', $1)", [A],
    'an image cannot be recorded for another account');
  const update = await db.query("update chat_sessions set title = 'B' where id = 'session-a'");
  assert.equal(update.affectedRows, 0, 'another account updates nothing');
  await rejected('delete from chat_sessions', [], 'deleting conversations is not granted');

  await signInAs('');
  for (const table of TABLES) assert.equal(await count(table), 0, `${table} is invisible without a signed-in identity`);
  await rejected("insert into chat_sessions(id, mode, title) values ('session-anon', 'learning', 'x')", [], 'a session without an identity cannot create a conversation');
  await db.exec('set role anon');
  await rejected('select count(*) from public.chat_sessions', [], 'the anonymous role has no access');

  await db.exec('set role authenticated');
  await signInAs(A);
  for (const table of TABLES) assert.equal(await count(table), 1, `${table} still holds the owner's single record`);
  assert.equal(await owner("select title owner from chat_sessions where id = 'session-a'"), 'A 的对话', 'the conversation title is unchanged');

  console.log('chat, message and image ownership, session takeover and anonymous access passed');
  await db.close();
})().catch((error) => { console.error(error); process.exitCode = 1; });

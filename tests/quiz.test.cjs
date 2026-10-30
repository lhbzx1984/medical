const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs');
(async () => { const db = new PGlite(); await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);grant usage on schema auth to anon,authenticated;create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`); await db.exec(fs.readFileSync('supabase/schema.sql', 'utf8')); const a = '00000000-0000-0000-0000-000000000001', b = '00000000-0000-0000-0000-000000000002'; await db.query('insert into auth.users values($1),($2)', [a, b]); await db.exec('set role authenticated'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]); await db.exec("insert into learning_attempts(organ_id,question_type,answer,correct) values ('heart','system','呼吸',false)"); let r = await db.query('select * from learning_attempts'); if (r.rows.length !== 1)
    throw Error('owner cannot view attempt'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [b]); r = await db.query('select * from learning_attempts'); if (r.rows.length)
    throw Error('cross user attempt leak'); let denied = false; try {
    await db.query("insert into learning_attempts(owner_id,organ_id,question_type,answer,correct) values ($1,'heart','system','x',false)", [a]);
}
catch {
    denied = true;
} if (!denied)
    throw Error('owner spoofing allowed'); console.log('learning attempt ownership and spoofing checks passed'); await db.close(); })().catch(e => { console.error(e); process.exitCode = 1; });

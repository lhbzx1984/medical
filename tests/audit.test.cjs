const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs');
(async () => { const db = new PGlite(); await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);grant usage on schema auth to anon,authenticated;create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`); await db.exec(fs.readFileSync('supabase/schema.sql', 'utf8')); const a = '00000000-0000-0000-0000-000000000001', b = '00000000-0000-0000-0000-000000000002'; await db.query('insert into auth.users values($1),($2)', [a, b]); await db.query('insert into medplan_admins(user_id) values($1)', [a]); await db.exec('set role authenticated'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [b]); let denied = false; try {
    await db.exec("insert into medplan_admin_audit(operation_id,action,target,outcome) values ('10000000-0000-0000-0000-000000000001','create','x','requested')");
}
catch {
    denied = true;
} if (!denied)
    throw Error('nonadmin wrote audit'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]); await db.exec("insert into medplan_admin_audit(operation_id,action,target,outcome) values ('10000000-0000-0000-0000-000000000001','create','x','requested')"); denied = false; try {
    await db.exec("delete from medplan_admin_audit");
}
catch {
    denied = true;
} if (!denied)
    throw Error('audit delete allowed'); console.log('audit administrator restrictions passed'); await db.close(); })().catch(e => { console.error(e); process.exitCode = 1; });

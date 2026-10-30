const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs');
(async () => { const db = new PGlite(); await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);grant usage on schema auth to anon,authenticated;create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`); await db.exec(fs.readFileSync('supabase/schema.sql', 'utf8')); const a = '00000000-0000-0000-0000-000000000001', b = '00000000-0000-0000-0000-000000000002', p = '10000000-0000-0000-0000-000000000001'; await db.query('insert into auth.users values($1),($2)', [a, b]); await db.query('insert into medplan_admins(user_id) values($1)', [a]); await db.query("insert into patients(id,name,owner_id) values($1,'legacy',null)", [p]); await db.exec('set role authenticated'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [b]); let denied = false; try {
    await db.query('select * from public.medplan_list_unassigned_patients()');
}
catch {
    denied = true;
} if (!denied)
    throw Error('user can list unassigned'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]); let r = await db.query('select * from public.medplan_list_unassigned_patients()'); if (r.rows.length !== 1)
    throw Error('admin cannot list'); await db.query('select public.medplan_assign_unassigned_patient($1,$2)', [p, b]); r = await db.query('select * from medplan_admin_audit'); if (r.rows.length !== 1 || r.rows[0].action !== 'assign_patient')
    throw Error('audit missing'); denied = false; try {
    await db.query('select public.medplan_assign_unassigned_patient($1,$2)', [p, a]);
}
catch (e) {
    denied = e.code === '40001';
} if (!denied)
    throw Error('reassignment allowed'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [b]); r = await db.query('select * from patients'); if (r.rows.length !== 1 || r.rows[0].name !== 'legacy')
    throw Error('owner cannot see assigned case'); console.log('legacy assignment, audit, no reassignment and access control passed'); await db.close(); })().catch(e => { console.error(e); process.exitCode = 1; });

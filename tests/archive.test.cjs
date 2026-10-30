const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs');
(async () => { const db = new PGlite(); await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); grant usage on schema auth to anon,authenticated; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`); await db.exec(fs.readFileSync('supabase/schema.sql', 'utf8')); let a = '00000000-0000-0000-0000-000000000001', b = '00000000-0000-0000-0000-000000000002', p = '10000000-0000-0000-0000-000000000001', plan = '20000000-0000-0000-0000-000000000001'; await db.query('insert into auth.users values ($1),($2)', [a, b]); await db.exec('set role authenticated'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]); await db.query("insert into patients(id,name) values ($1,'test')", [p]); await db.query('insert into surgical_plans(id,patient_id) values ($1,$2)', [plan, p]); let r = await db.query('select updated_at::text stamp from surgical_plans'); let stamp = r.rows[0].stamp; await db.query('select public.medplan_set_archived($1,$2,true)', [plan, stamp]); r = await db.query('select archived_at,updated_at::text stamp from surgical_plans'); if (!r.rows[0].archived_at)
    throw Error('archive failed'); let failed = false; try {
    await db.query('select public.medplan_set_archived($1,$2,false)', [plan, stamp]);
}
catch (e) {
    failed = e.code === '40001';
} if (!failed)
    throw Error('stale archive accepted'); stamp = r.rows[0].stamp; await db.query("select set_config('request.jwt.claim.sub',$1,false)", [b]); failed = false; try {
    await db.query('select public.medplan_set_archived($1,$2,false)', [plan, stamp]);
}
catch {
    failed = true;
} if (!failed)
    throw Error('cross user restore accepted'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]); await db.query('select public.medplan_set_archived($1,$2,false)', [plan, stamp]); r = await db.query('select archived_at from surgical_plans'); if (r.rows[0].archived_at !== null)
    throw Error('restore failed'); console.log('archive, restore, conflict and user isolation passed'); await db.close(); })().catch(e => { console.error(e); process.exitCode = 1; });

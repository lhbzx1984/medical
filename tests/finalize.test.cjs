const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs');
(async () => { const db = new PGlite(); await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); grant usage on schema auth to anon,authenticated; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`); await db.exec(fs.readFileSync('supabase/schema.sql', 'utf8')); let a = '00000000-0000-0000-0000-000000000001', b = '00000000-0000-0000-0000-000000000002', p = '10000000-0000-0000-0000-000000000001', plan = '20000000-0000-0000-0000-000000000001'; await db.query('insert into auth.users values ($1),($2)', [a, b]); await db.exec('set role authenticated'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]); await db.query("insert into patients(id,name) values ($1,'test')", [p]); await db.query('insert into surgical_plans(id,patient_id) values ($1,$2)', [plan, p]); let r = await db.query('select updated_at::text stamp from surgical_plans'); const v = { id: '30000000-0000-0000-0000-000000000001', content: {}, changelog: '', source: 'ai', knowledgeUsed: [], createdAt: new Date().toISOString(), expectedUpdatedAt: r.rows[0].stamp }; const sim = { id: '40000000-0000-0000-0000-000000000001', focusOrgan: 'heart', region: 'chest', steps: [], createdAt: new Date().toISOString() }; await db.query('select public.medplan_save_revision($1,0,$2::jsonb,$3::jsonb,null)', [plan, JSON.stringify(v), JSON.stringify(sim)]); r = await db.query('select updated_at::text stamp from surgical_plans'); let stamp = r.rows[0].stamp; await db.query('select public.medplan_set_finalized($1,$2,1,true)', [plan, stamp]); r = await db.query('select status,finalized_version,updated_at::text stamp from surgical_plans'); if (r.rows[0].status !== 'finalized' || r.rows[0].finalized_version !== 1)
    throw Error('finalize failed'); stamp = r.rows[0].stamp; let failed = false; try {
    await db.query('select public.medplan_save_revision($1,1,$2::jsonb,$3::jsonb,null)', [plan, JSON.stringify({ ...v, expectedUpdatedAt: stamp }), JSON.stringify(sim)]);
}
catch (e) {
    failed = e.code === 'P0001';
} if (!failed)
    throw Error('finalized plan revision allowed'); failed = false; try {
    await db.query('select public.medplan_update_case($1,$2,$3::jsonb)', [plan, stamp, JSON.stringify({ name: 'X', gender: '', age: 0, medicalRecord: 'x', preliminaryPlan: '' })]);
}
catch (e) {
    failed = e.code === 'P0001';
} if (!failed)
    throw Error('finalized case edit allowed'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [b]); failed = false; try {
    await db.query('select public.medplan_set_finalized($1,$2,1,false)', [plan, stamp]);
}
catch {
    failed = true;
} if (!failed)
    throw Error('cross user reopen allowed'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]); await db.query('select public.medplan_set_finalized($1,$2,1,false)', [plan, stamp]); r = await db.query('select status,finalized_version from surgical_plans'); if (r.rows[0].status !== 'simulated' || r.rows[0].finalized_version !== null)
    throw Error('reopen failed'); console.log('finalize, freeze, user isolation, reopen passed'); await db.close(); })().catch(e => { console.error(e); process.exitCode = 1; });

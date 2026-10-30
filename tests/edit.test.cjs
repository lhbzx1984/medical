const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs');
(async () => { const db = new PGlite(); await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); grant usage on schema auth to anon,authenticated; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`); await db.exec(fs.readFileSync('supabase/schema.sql', 'utf8')); const a = '00000000-0000-0000-0000-000000000001', b = '00000000-0000-0000-0000-000000000002', p = '10000000-0000-0000-0000-000000000001', plan = '20000000-0000-0000-0000-000000000001'; await db.query('insert into auth.users values ($1),($2)', [a, b]); await db.exec('set role authenticated'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]); await db.query("insert into patients (id,name,medical_record) values ($1,'old','old record')", [p]); await db.query('insert into surgical_plans (id,patient_id) values ($1,$2)', [plan, p]); let r = await db.query('select updated_at::text stamp from surgical_plans'); const old = r.rows[0].stamp; const patient = { name: 'new', gender: '男', age: 35, medicalRecord: 'new record', preliminaryPlan: 'plan' }; await db.query('select public.medplan_update_case($1,$2,$3::jsonb)', [plan, old, JSON.stringify(patient)]); r = await db.query('select name,medical_record from patients'); if (r.rows[0].name !== 'new')
    throw Error('edit failed'); r = await db.query('select previous_patient from case_edit_history'); if (r.rows[0].previous_patient.name !== 'old')
    throw Error('history missing'); let conflict = false; try {
    await db.query('select public.medplan_update_case($1,$2,$3::jsonb)', [plan, old, JSON.stringify(patient)]);
}
catch (e) {
    conflict = e.code === '40001';
} if (!conflict)
    throw Error('stale edit accepted'); const v = { id: '30000000-0000-0000-0000-000000000001', content: {}, changelog: '', source: 'ai', knowledgeUsed: [], createdAt: new Date().toISOString(), expectedUpdatedAt: old }; const sim = { id: '40000000-0000-0000-0000-000000000001', focusOrgan: 'heart', region: 'chest', steps: [], createdAt: new Date().toISOString() }; conflict = false; try {
    await db.query('select public.medplan_save_revision($1,0,$2::jsonb,$3::jsonb,null)', [plan, JSON.stringify(v), JSON.stringify(sim)]);
}
catch (e) {
    conflict = e.code === '40001';
} if (!conflict)
    throw Error('revision based on stale patient accepted'); r = await db.query('select updated_at::text stamp from surgical_plans'); v.expectedUpdatedAt = r.rows[0].stamp; await db.query('select public.medplan_save_revision($1,0,$2::jsonb,$3::jsonb,null)', [plan, JSON.stringify(v), JSON.stringify(sim)]); r = await db.query('select current_version from surgical_plans'); if (r.rows[0].current_version !== 1)
    throw Error('fresh revision rejected'); let directDenied = false; try {
    await db.query("update patients set name='bypass'");
}
catch {
    directDenied = true;
} if (!directDenied)
    throw Error('direct patient update allowed'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [b]); let denied = false; try {
    await db.query('select public.medplan_update_case($1,$2,$3::jsonb)', [plan, old, JSON.stringify(patient)]);
}
catch {
    denied = true;
} if (!denied)
    throw Error('cross user edit accepted'); r = await db.query('select * from case_edit_history'); if (r.rows.length)
    throw Error('history exposed'); console.log('case edit, history, stale revision, stale edit and user isolation passed'); await db.close(); })().catch(e => { console.error(e); process.exitCode = 1; });

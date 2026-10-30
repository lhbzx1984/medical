const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs');
(async () => { const db = new PGlite(); await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); grant usage on schema auth to anon,authenticated; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`); await db.exec(fs.readFileSync('supabase/schema.sql', 'utf8')); const a = '00000000-0000-0000-0000-000000000001', b = '00000000-0000-0000-0000-000000000002'; await db.query('insert into auth.users values ($1),($2)', [a, b]); await db.exec('set role authenticated'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]); for (let i = 0; i < 6; i++) {
    let r = await db.query("select public.medplan_consume_ai_quota('image') ok");
    if (r.rows[0].ok !== (i < 5))
        throw Error('quota incorrect ' + i);
} let denied = false; try {
    await db.query('select * from public.medplan_ai_quota');
}
catch {
    denied = true;
} if (!denied)
    throw Error('quota table exposed'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [b]); let r = await db.query("select public.medplan_consume_ai_quota('image') ok"); if (!r.rows[0].ok)
    throw Error('quota shared across users'); console.log('AI quota limits and per-user isolation passed'); await db.close(); })().catch(e => { console.error(e); process.exitCode = 1; });

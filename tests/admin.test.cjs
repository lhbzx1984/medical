const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs');
(async () => { const db = new PGlite(); await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);grant usage on schema auth to anon,authenticated;create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`); await db.exec(fs.readFileSync('supabase/schema.sql', 'utf8')); const admin = '00000000-0000-0000-0000-000000000001', user = '00000000-0000-0000-0000-000000000002'; await db.query('insert into auth.users values ($1),($2)', [admin, user]); await db.query('insert into medplan_admins(user_id) values($1)', [admin]); await db.exec('set role authenticated'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]); let r = await db.query('select public.medplan_is_admin() ok'); if (r.rows[0].ok)
    throw Error('regular user admin'); for (const sql of ["insert into knowledge_entries(id,title,content) values ('50000000-0000-0000-0000-000000000001','x','x')", "insert into medplan_admins(user_id) values ('" + user + "')"]) {
    let denied = false;
    try {
        await db.exec(sql);
    }
    catch {
        denied = true;
    }
    if (!denied)
        throw Error('ordinary user write allowed');
} await db.query("select set_config('request.jwt.claim.sub',$1,false)", [admin]); r = await db.query('select public.medplan_is_admin() ok'); if (!r.rows[0].ok)
    throw Error('admin not recognized'); await db.exec("insert into knowledge_entries(id,title,content,source_name,reviewed_by,reviewed_at,review_status) values ('50000000-0000-0000-0000-000000000001','x','x','source','reviewer',now(),'approved')"); await db.exec("update knowledge_entries set content='y' where title='x'"); r = await db.query('select content from knowledge_entries'); if (r.rows[0].content !== 'y')
    throw Error('admin edit failed'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]); r = await db.query("update knowledge_entries set content='bad' where title='x' returning id"); if (r.rows.length)
    throw Error('ordinary user update allowed'); console.log('admin authorization, user denial, and knowledge edits passed'); await db.close(); })().catch(e => { console.error(e); process.exitCode = 1; });

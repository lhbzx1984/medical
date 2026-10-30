-- 限制数据库权限：RLS 不限制 TRUNCATE 等表级操作。
revoke all on table public.patients from public, anon, authenticated;
grant select, insert, update on table public.patients to authenticated;
revoke all on table public.surgical_plans from public, anon, authenticated;
grant select, insert, update on table public.surgical_plans to authenticated;
revoke all on table public.plan_versions from public, anon, authenticated;
grant select, insert, update on table public.plan_versions to authenticated;
revoke all on table public.plan_feedback from public, anon, authenticated;
grant select, insert, update on table public.plan_feedback to authenticated;
revoke all on table public.simulations from public, anon, authenticated;
grant select, insert, update on table public.simulations to authenticated;
revoke all on table public.chat_sessions from public, anon, authenticated;
grant select, insert, update on table public.chat_sessions to authenticated;
revoke all on table public.chat_messages from public, anon, authenticated;
grant select, insert, update on table public.chat_messages to authenticated;
revoke all on table public.generated_images from public, anon, authenticated;
grant select, insert, update on table public.generated_images to authenticated;
revoke all on table public.knowledge_entries from public, anon, authenticated;
grant select on table public.knowledge_entries to authenticated;

-- 每条病例归属一个 Supabase Auth 用户；旧记录保持 NULL，直到管理员核实后分配。
alter table public.patients add column if not exists owner_id uuid references auth.users(id);
alter table public.patients alter column owner_id set default auth.uid();
alter table public.chat_sessions add column if not exists owner_id uuid references auth.users(id);
alter table public.chat_sessions alter column owner_id set default auth.uid();
alter table public.generated_images add column if not exists owner_id uuid references auth.users(id);
alter table public.generated_images alter column owner_id set default auth.uid();

-- Restrictive 策略同时约束已有的宽松策略；应用用户只能读取和修改自己创建的数据。
alter table public.patients enable row level security;
drop policy if exists medplan_owner_guard on public.patients;
create policy medplan_owner_guard on public.patients as restrictive for all to public using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists medplan_owner_access on public.patients;
create policy medplan_owner_access on public.patients as permissive for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
alter table public.surgical_plans enable row level security;
drop policy if exists medplan_owner_guard on public.surgical_plans;
create policy medplan_owner_guard on public.surgical_plans as restrictive for all to public using (exists (select 1 from public.patients p where p.id = patient_id and p.owner_id = (select auth.uid()))) with check (exists (select 1 from public.patients p where p.id = patient_id and p.owner_id = (select auth.uid())));
drop policy if exists medplan_owner_access on public.surgical_plans;
create policy medplan_owner_access on public.surgical_plans as permissive for all to authenticated using (exists (select 1 from public.patients p where p.id = patient_id and p.owner_id = (select auth.uid()))) with check (exists (select 1 from public.patients p where p.id = patient_id and p.owner_id = (select auth.uid())));
alter table public.plan_versions enable row level security;
drop policy if exists medplan_owner_guard on public.plan_versions;
create policy medplan_owner_guard on public.plan_versions as restrictive for all to public using (exists (select 1 from public.surgical_plans sp join public.patients p on p.id = sp.patient_id where sp.id = plan_id and p.owner_id = (select auth.uid()))) with check (exists (select 1 from public.surgical_plans sp join public.patients p on p.id = sp.patient_id where sp.id = plan_id and p.owner_id = (select auth.uid())));
drop policy if exists medplan_owner_access on public.plan_versions;
create policy medplan_owner_access on public.plan_versions as permissive for all to authenticated using (exists (select 1 from public.surgical_plans sp join public.patients p on p.id = sp.patient_id where sp.id = plan_id and p.owner_id = (select auth.uid()))) with check (exists (select 1 from public.surgical_plans sp join public.patients p on p.id = sp.patient_id where sp.id = plan_id and p.owner_id = (select auth.uid())));
alter table public.plan_feedback enable row level security;
drop policy if exists medplan_owner_guard on public.plan_feedback;
create policy medplan_owner_guard on public.plan_feedback as restrictive for all to public using (exists (select 1 from public.surgical_plans sp join public.patients p on p.id = sp.patient_id where sp.id = plan_id and p.owner_id = (select auth.uid()))) with check (exists (select 1 from public.surgical_plans sp join public.patients p on p.id = sp.patient_id where sp.id = plan_id and p.owner_id = (select auth.uid())));
drop policy if exists medplan_owner_access on public.plan_feedback;
create policy medplan_owner_access on public.plan_feedback as permissive for all to authenticated using (exists (select 1 from public.surgical_plans sp join public.patients p on p.id = sp.patient_id where sp.id = plan_id and p.owner_id = (select auth.uid()))) with check (exists (select 1 from public.surgical_plans sp join public.patients p on p.id = sp.patient_id where sp.id = plan_id and p.owner_id = (select auth.uid())));
alter table public.simulations enable row level security;
drop policy if exists medplan_owner_guard on public.simulations;
create policy medplan_owner_guard on public.simulations as restrictive for all to public using (exists (select 1 from public.surgical_plans sp join public.patients p on p.id = sp.patient_id where sp.id = plan_id and p.owner_id = (select auth.uid()))) with check (exists (select 1 from public.surgical_plans sp join public.patients p on p.id = sp.patient_id where sp.id = plan_id and p.owner_id = (select auth.uid())));
drop policy if exists medplan_owner_access on public.simulations;
create policy medplan_owner_access on public.simulations as permissive for all to authenticated using (exists (select 1 from public.surgical_plans sp join public.patients p on p.id = sp.patient_id where sp.id = plan_id and p.owner_id = (select auth.uid()))) with check (exists (select 1 from public.surgical_plans sp join public.patients p on p.id = sp.patient_id where sp.id = plan_id and p.owner_id = (select auth.uid())));
alter table public.chat_sessions enable row level security;
drop policy if exists medplan_owner_guard on public.chat_sessions;
create policy medplan_owner_guard on public.chat_sessions as restrictive for all to public using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists medplan_owner_access on public.chat_sessions;
create policy medplan_owner_access on public.chat_sessions as permissive for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
alter table public.chat_messages enable row level security;
drop policy if exists medplan_owner_guard on public.chat_messages;
create policy medplan_owner_guard on public.chat_messages as restrictive for all to public using (exists (select 1 from public.chat_sessions cs where cs.id = session_id and cs.owner_id = (select auth.uid()))) with check (exists (select 1 from public.chat_sessions cs where cs.id = session_id and cs.owner_id = (select auth.uid())));
drop policy if exists medplan_owner_access on public.chat_messages;
create policy medplan_owner_access on public.chat_messages as permissive for all to authenticated using (exists (select 1 from public.chat_sessions cs where cs.id = session_id and cs.owner_id = (select auth.uid()))) with check (exists (select 1 from public.chat_sessions cs where cs.id = session_id and cs.owner_id = (select auth.uid())));
alter table public.generated_images enable row level security;
drop policy if exists medplan_owner_guard on public.generated_images;
create policy medplan_owner_guard on public.generated_images as restrictive for all to public using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists medplan_owner_access on public.generated_images;
create policy medplan_owner_access on public.generated_images as permissive for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- 知识库所有登录用户可读，变更仅由数据库管理员维护。
alter table public.knowledge_entries enable row level security;
drop policy if exists medplan_knowledge_read_guard on public.knowledge_entries;
create policy medplan_knowledge_read_guard on public.knowledge_entries as restrictive for select to public using ((select auth.uid()) is not null);
drop policy if exists medplan_knowledge_read on public.knowledge_entries;
create policy medplan_knowledge_read on public.knowledge_entries for select to authenticated using (true);
drop policy if exists medplan_knowledge_insert_guard on public.knowledge_entries;
create policy medplan_knowledge_insert_guard on public.knowledge_entries as restrictive for insert to public with check (false);
drop policy if exists medplan_knowledge_update_guard on public.knowledge_entries;
create policy medplan_knowledge_update_guard on public.knowledge_entries as restrictive for update to public using (false) with check (false);
drop policy if exists medplan_knowledge_delete_guard on public.knowledge_entries;
create policy medplan_knowledge_delete_guard on public.knowledge_entries as restrictive for delete to public using (false);

-- 应用通过此标记拒绝连接尚未完成隔离迁移的数据库。
create or replace function public.medplan_security_version() returns integer
language sql stable set search_path = '' as $$ select 1 $$;
revoke all on function public.medplan_security_version() from public, anon;
grant execute on function public.medplan_security_version() to authenticated;

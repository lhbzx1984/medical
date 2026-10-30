-- ============================================================
-- MedPlan Atlas 医学手术规划智能体系统 · Supabase 数据库结构
-- 在 Supabase Dashboard → SQL Editor 中执行本文件即可完成建库。
-- 应用侧：配置 .env.local 的 SUPABASE_URL 与 SUPABASE_ANON_KEY
-- 后自动启用持久化存储（src/lib/store/index.ts）。
-- ============================================================

-- 病人 / 病历
create table if not exists patients (
  id uuid primary key,
  name text not null,
  gender text default '',
  age int default 0,
  medical_record text default '',      -- 病历文本
  preliminary_plan text default '',    -- 手术初步方案
  created_at timestamptz default now()
);

-- 手术规划（一个病例一份主记录）
create table if not exists surgical_plans (
  id uuid primary key,
  patient_id uuid references patients(id) on delete cascade,
  title text,
  patient_name text default '',
  status text default 'draft',         -- draft | simulated | refined | finalized
  current_version int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 手术规划版本（AI 生成 / 专家反馈修订，每次一个版本）
create table if not exists plan_versions (
  id uuid primary key,
  plan_id uuid references surgical_plans(id) on delete cascade,
  version int not null,
  content jsonb not null,              -- StructuredPlan 全量 JSON
  changelog text default '',
  source text default 'ai',            -- ai | expert_refine
  knowledge_used text[] default '{}',  -- 本版本引用的知识库条目标题
  created_at timestamptz default now()
);

-- 专家反馈
create table if not exists plan_feedback (
  id uuid primary key,
  plan_id uuid references surgical_plans(id) on delete cascade,
  version int not null,                -- 针对的版本号
  expert_name text default '',
  comment text not null,
  created_at timestamptz default now()
);

-- 3D 模拟播放脚本（人体层面 → 器官层面）
create table if not exists simulations (
  id uuid primary key,
  plan_id uuid references surgical_plans(id) on delete cascade,
  version int not null,
  focus_organ text default 'skin',
  region text default '',
  steps jsonb not null,                -- SimulationStep[]
  created_at timestamptz default now()
);

-- 手术知识库（预留接口）
-- 生产建议：启用 pgvector 扩展后取消注释 embedding 列，接入向量检索
-- （create extension if not exists vector;）
create table if not exists knowledge_entries (
  id uuid primary key,
  title text not null,
  category text default 'guideline',   -- procedure | instrument | guideline | anatomy
  content text not null,
  tags text[] default '{}',
  -- embedding vector(1536),             -- 预留：Agnes embedding
  created_at timestamptz default now()
);

-- AI 学习对话
create table if not exists chat_sessions (
  id text primary key,                 -- 客户端生成 uuid
  mode text default 'learning',        -- learning | guidance
  title text default '',
  created_at timestamptz default now()
);

create table if not exists chat_messages (
  id uuid primary key,
  session_id text references chat_sessions(id) on delete cascade,
  role text not null,                  -- user | assistant
  content text not null,
  created_at timestamptz default now()
);

-- AI 生成图像记录
create table if not exists generated_images (
  id uuid primary key,
  prompt text not null,
  url text not null,
  organ_id text,
  created_at timestamptz default now()
);

-- 常用索引
create index if not exists idx_plans_updated on surgical_plans (updated_at desc);
create index if not exists idx_versions_plan on plan_versions (plan_id, version);
create index if not exists idx_feedback_plan on plan_feedback (plan_id);
create index if not exists idx_sim_plan on simulations (plan_id, version);
create index if not exists idx_messages_session on chat_messages (session_id);

-- 防止匿名或已登录的客户端绕过应用直接访问业务表。
-- 应用服务端的 service_role 仍会绕过 RLS，因此此迁移不能替代应用层的身份认证和病例归属校验。
-- 如果已有自定义策略，请在执行前核查；本迁移不会删除已有策略。
alter table public.patients enable row level security;
alter table public.surgical_plans enable row level security;
alter table public.plan_versions enable row level security;
alter table public.plan_feedback enable row level security;
alter table public.simulations enable row level security;
alter table public.knowledge_entries enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.generated_images enable row level security;

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

-- A revision, its simulation, optional feedback and plan status are committed together.
-- The caller retains its own RLS privileges; the plan row is locked before checking the version.
create unique index if not exists uq_plan_versions_plan_version on public.plan_versions(plan_id, version);
create unique index if not exists uq_simulations_plan_version on public.simulations(plan_id, version);

create or replace function public.medplan_save_revision(
  p_plan_id uuid, p_expected_version integer, p_version jsonb, p_simulation jsonb, p_feedback jsonb default null
) returns void
language plpgsql security invoker set search_path = '' as $$
declare v_current integer;
begin
  select current_version into v_current from public.surgical_plans where id = p_plan_id for update;
  if not found then raise exception 'plan not found' using errcode = 'P0002'; end if;
  if v_current is distinct from p_expected_version then
    raise exception 'plan version changed' using errcode = '40001';
  end if;
  insert into public.plan_versions(id, plan_id, version, content, changelog, source, knowledge_used, created_at)
  values ((p_version->>'id')::uuid, p_plan_id, p_expected_version + 1, p_version->'content',
          p_version->>'changelog', p_version->>'source',
          array(select jsonb_array_elements_text(p_version->'knowledgeUsed')), (p_version->>'createdAt')::timestamptz);
  insert into public.simulations(id, plan_id, version, focus_organ, region, steps, created_at)
  values ((p_simulation->>'id')::uuid, p_plan_id, p_expected_version + 1, p_simulation->>'focusOrgan',
          p_simulation->>'region', p_simulation->'steps', (p_simulation->>'createdAt')::timestamptz);
  if p_feedback is not null then
    insert into public.plan_feedback(id, plan_id, version, expert_name, comment, created_at)
    values ((p_feedback->>'id')::uuid, p_plan_id, p_expected_version, p_feedback->>'expertName',
            p_feedback->>'comment', (p_feedback->>'createdAt')::timestamptz);
  end if;
  update public.surgical_plans set current_version = p_expected_version + 1,
    status = case when p_version->>'source' = 'expert_refine' then 'refined' else 'simulated' end,
    updated_at = now() where id = p_plan_id;
end $$;
revoke all on function public.medplan_save_revision(uuid, integer, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.medplan_save_revision(uuid, integer, jsonb, jsonb, jsonb) to authenticated;

-- Per-user AI quota shared by all application instances.
create table if not exists public.medplan_ai_quota (
  owner_id uuid not null references auth.users(id) on delete cascade,
  operation text not null,
  window_start timestamptz not null,
  used integer not null,
  primary key (owner_id, operation, window_start)
);
alter table public.medplan_ai_quota enable row level security;
revoke all on table public.medplan_ai_quota from public, anon, authenticated;

create or replace function public.medplan_consume_ai_quota(p_operation text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_window timestamptz := pg_catalog.to_timestamp(pg_catalog.floor(extract(epoch from pg_catalog.now()) / 600) * 600);
  v_limit integer;
  v_used integer;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '42501'; end if;
  v_limit := case p_operation when 'chat' then 20 when 'image' then 5 when 'plan' then 5 else null end;
  if v_limit is null then raise exception 'invalid operation' using errcode = '22023'; end if;
  delete from public.medplan_ai_quota where owner_id = v_user and window_start < v_window - interval '1 day';
  insert into public.medplan_ai_quota as q (owner_id, operation, window_start, used)
    values (v_user, p_operation, v_window, 1)
    on conflict (owner_id, operation, window_start) do update set used = q.used + 1
      where q.used < v_limit
    returning used into v_used;
  return v_used is not null;
end $$;
revoke all on function public.medplan_consume_ai_quota(text) from public, anon;
grant execute on function public.medplan_consume_ai_quota(text) to authenticated;

-- Preserve the previous patient data for each edit. Access follows the case owner.
create table if not exists public.case_edit_history (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.surgical_plans(id) on delete cascade,
  previous_patient jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.case_edit_history enable row level security;
revoke all on public.case_edit_history from public, anon, authenticated;
grant select on public.case_edit_history to authenticated;
-- 病例更新必须经过受控函数，保证历史和版本时间一起更新。
revoke update on public.patients from authenticated;
drop policy if exists medplan_history_guard on public.case_edit_history;
create policy medplan_history_guard on public.case_edit_history as restrictive for all to public
  using (exists (select 1 from public.surgical_plans sp join public.patients p on p.id = sp.patient_id where sp.id = plan_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.surgical_plans sp join public.patients p on p.id = sp.patient_id where sp.id = plan_id and p.owner_id = (select auth.uid())));
drop policy if exists medplan_history_access on public.case_edit_history;
create policy medplan_history_access on public.case_edit_history for all to authenticated
  using (exists (select 1 from public.surgical_plans sp join public.patients p on p.id = sp.patient_id where sp.id = plan_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.surgical_plans sp join public.patients p on p.id = sp.patient_id where sp.id = plan_id and p.owner_id = (select auth.uid())));

create or replace function public.medplan_update_case(p_plan_id uuid, p_expected_updated_at timestamptz, p_patient jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_patient_id uuid; v_updated_at timestamptz; v_old jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if pg_catalog.jsonb_typeof(p_patient) is distinct from 'object' or
     pg_catalog.jsonb_typeof(p_patient->'name') is distinct from 'string' or
     pg_catalog.length(pg_catalog.btrim(p_patient->>'name')) = 0 or pg_catalog.length(p_patient->>'name') > 200 or
     pg_catalog.jsonb_typeof(p_patient->'gender') is distinct from 'string' or pg_catalog.length(p_patient->>'gender') > 50 or
     pg_catalog.jsonb_typeof(p_patient->'age') is distinct from 'number' or
     (p_patient->>'age') !~ '^[0-9]{1,3}$' or (p_patient->>'age')::integer > 150 or
     pg_catalog.jsonb_typeof(p_patient->'medicalRecord') is distinct from 'string' or pg_catalog.length(p_patient->>'medicalRecord') > 50000 or
     pg_catalog.jsonb_typeof(p_patient->'preliminaryPlan') is distinct from 'string' or pg_catalog.length(p_patient->>'preliminaryPlan') > 50000 then
    raise exception 'invalid patient data' using errcode = '22023';
  end if;
  select sp.patient_id, sp.updated_at into v_patient_id, v_updated_at
    from public.surgical_plans sp join public.patients p on p.id = sp.patient_id
    where sp.id = p_plan_id and p.owner_id = auth.uid() for update of sp;
  if not found then raise exception 'plan not found' using errcode = 'P0002'; end if;
  if v_updated_at is distinct from p_expected_updated_at then raise exception 'plan changed' using errcode = '40001'; end if;
  select pg_catalog.to_jsonb(p) into v_old from public.patients p where id = v_patient_id for update;
  if not found then raise exception 'patient not found' using errcode = 'P0002'; end if;
  insert into public.case_edit_history(plan_id, previous_patient) values (p_plan_id, v_old);
  update public.patients set name = p_patient->>'name', gender = p_patient->>'gender',
    age = (p_patient->>'age')::integer, medical_record = p_patient->>'medicalRecord',
    preliminary_plan = p_patient->>'preliminaryPlan' where id = v_patient_id;
  update public.surgical_plans set patient_name = p_patient->>'name', updated_at = clock_timestamp() where patient_id = v_patient_id;
end $$;
revoke all on function public.medplan_update_case(uuid, timestamptz, jsonb) from public, anon;
grant execute on function public.medplan_update_case(uuid, timestamptz, jsonb) to authenticated;

-- Reject revisions generated from a case that changed during the AI request.
create or replace function public.medplan_save_revision(
  p_plan_id uuid, p_expected_version integer, p_version jsonb, p_simulation jsonb, p_feedback jsonb default null
) returns void
language plpgsql security invoker set search_path = '' as $$
declare v_current integer; v_updated_at timestamptz;
begin
  select current_version, updated_at into v_current, v_updated_at from public.surgical_plans where id = p_plan_id for update;
  if not found then raise exception 'plan not found' using errcode = 'P0002'; end if;
  if v_current is distinct from p_expected_version or
     v_updated_at is distinct from (p_version->>'expectedUpdatedAt')::timestamptz then
    raise exception 'plan version changed' using errcode = '40001';
  end if;
  insert into public.plan_versions(id, plan_id, version, content, changelog, source, knowledge_used, created_at)
  values ((p_version->>'id')::uuid, p_plan_id, p_expected_version + 1, p_version->'content',
          p_version->>'changelog', p_version->>'source',
          array(select jsonb_array_elements_text(p_version->'knowledgeUsed')), (p_version->>'createdAt')::timestamptz);
  insert into public.simulations(id, plan_id, version, focus_organ, region, steps, created_at)
  values ((p_simulation->>'id')::uuid, p_plan_id, p_expected_version + 1, p_simulation->>'focusOrgan',
          p_simulation->>'region', p_simulation->'steps', (p_simulation->>'createdAt')::timestamptz);
  if p_feedback is not null then
    insert into public.plan_feedback(id, plan_id, version, expert_name, comment, created_at)
    values ((p_feedback->>'id')::uuid, p_plan_id, p_expected_version, p_feedback->>'expertName',
            p_feedback->>'comment', (p_feedback->>'createdAt')::timestamptz);
  end if;
  update public.surgical_plans set current_version = p_expected_version + 1,
    status = case when p_version->>'source' = 'expert_refine' then 'refined' else 'simulated' end,
    updated_at = now() where id = p_plan_id;
end $$;
revoke all on function public.medplan_save_revision(uuid, integer, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.medplan_save_revision(uuid, integer, jsonb, jsonb, jsonb) to authenticated;

-- Archive is reversible and keeps case data and version history.
alter table public.surgical_plans add column if not exists archived_at timestamptz;
create or replace function public.medplan_set_archived(p_plan_id uuid, p_expected_updated_at timestamptz, p_archived boolean)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_updated_at timestamptz;
begin
  if p_archived is null then raise exception 'invalid archive state' using errcode = '22023'; end if;
  select updated_at into v_updated_at from public.surgical_plans where id = p_plan_id for update;
  if not found then raise exception 'plan not found' using errcode = 'P0002'; end if;
  if v_updated_at is distinct from p_expected_updated_at then raise exception 'plan changed' using errcode = '40001'; end if;
  update public.surgical_plans set archived_at = case when p_archived then clock_timestamp() else null end,
    updated_at = clock_timestamp() where id = p_plan_id;
end $$;
revoke all on function public.medplan_set_archived(uuid, timestamptz, boolean) from public, anon;
grant execute on function public.medplan_set_archived(uuid, timestamptz, boolean) to authenticated;

-- A finalization identifies exactly which version the user approved.
alter table public.surgical_plans add column if not exists finalized_version integer;
alter table public.surgical_plans add column if not exists finalized_at timestamptz;
create or replace function public.medplan_set_finalized(p_plan_id uuid, p_expected_updated_at timestamptz, p_version integer, p_finalized boolean)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_current integer; v_updated_at timestamptz; v_status text; v_source text;
begin
  if p_finalized is null then raise exception 'invalid state' using errcode = '22023'; end if;
  select current_version, updated_at, status into v_current, v_updated_at, v_status from public.surgical_plans where id = p_plan_id for update;
  if not found then raise exception 'plan not found' using errcode = 'P0002'; end if;
  if v_updated_at is distinct from p_expected_updated_at or v_current is distinct from p_version then
    raise exception 'plan changed' using errcode = '40001';
  end if;
  select source into v_source from public.plan_versions where plan_id = p_plan_id and version = v_current;
  if not found then raise exception 'version not found' using errcode = 'P0002'; end if;
  if p_finalized and v_status = 'finalized' then raise exception 'already finalized' using errcode = '40001'; end if;
  if not p_finalized and v_status <> 'finalized' then raise exception 'not finalized' using errcode = '40001'; end if;
  update public.surgical_plans set
    status = case when p_finalized then 'finalized' when v_source = 'expert_refine' then 'refined' else 'simulated' end,
    finalized_version = case when p_finalized then v_current else null end,
    finalized_at = case when p_finalized then clock_timestamp() else null end,
    updated_at = clock_timestamp() where id = p_plan_id;
end $$;
revoke all on function public.medplan_set_finalized(uuid, timestamptz, integer, boolean) from public, anon;
grant execute on function public.medplan_set_finalized(uuid, timestamptz, integer, boolean) to authenticated;

create or replace function public.medplan_update_case(p_plan_id uuid, p_expected_updated_at timestamptz, p_patient jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_patient_id uuid; v_updated_at timestamptz; v_old jsonb; v_status text;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if pg_catalog.jsonb_typeof(p_patient) is distinct from 'object' or
     pg_catalog.jsonb_typeof(p_patient->'name') is distinct from 'string' or
     pg_catalog.length(pg_catalog.btrim(p_patient->>'name')) = 0 or pg_catalog.length(p_patient->>'name') > 200 or
     pg_catalog.jsonb_typeof(p_patient->'gender') is distinct from 'string' or pg_catalog.length(p_patient->>'gender') > 50 or
     pg_catalog.jsonb_typeof(p_patient->'age') is distinct from 'number' or
     (p_patient->>'age') !~ '^[0-9]{1,3}$' or (p_patient->>'age')::integer > 150 or
     pg_catalog.jsonb_typeof(p_patient->'medicalRecord') is distinct from 'string' or pg_catalog.length(p_patient->>'medicalRecord') > 50000 or
     pg_catalog.jsonb_typeof(p_patient->'preliminaryPlan') is distinct from 'string' or pg_catalog.length(p_patient->>'preliminaryPlan') > 50000 then
    raise exception 'invalid patient data' using errcode = '22023';
  end if;
  select sp.patient_id, sp.updated_at, sp.status into v_patient_id, v_updated_at, v_status
    from public.surgical_plans sp join public.patients p on p.id = sp.patient_id
    where sp.id = p_plan_id and p.owner_id = auth.uid() for update of sp;
  if not found then raise exception 'plan not found' using errcode = 'P0002'; end if;
  -- A patient may be referenced by more than one plan; protect every finalized plan.
  perform 1 from public.surgical_plans where patient_id = v_patient_id order by id for update;
  if exists (select 1 from public.surgical_plans where patient_id = v_patient_id and status = 'finalized') then
    raise exception 'plan finalized' using errcode = 'P0001';
  end if;
  if v_updated_at is distinct from p_expected_updated_at then raise exception 'plan changed' using errcode = '40001'; end if;
  select pg_catalog.to_jsonb(p) into v_old from public.patients p where id = v_patient_id for update;
  if not found then raise exception 'patient not found' using errcode = 'P0002'; end if;
  insert into public.case_edit_history(plan_id, previous_patient) values (p_plan_id, v_old);
  update public.patients set name = p_patient->>'name', gender = p_patient->>'gender',
    age = (p_patient->>'age')::integer, medical_record = p_patient->>'medicalRecord',
    preliminary_plan = p_patient->>'preliminaryPlan' where id = v_patient_id;
  update public.surgical_plans set patient_name = p_patient->>'name', updated_at = clock_timestamp() where patient_id = v_patient_id;
end $$;
revoke all on function public.medplan_update_case(uuid, timestamptz, jsonb) from public, anon;
grant execute on function public.medplan_update_case(uuid, timestamptz, jsonb) to authenticated;


create or replace function public.medplan_save_revision(
  p_plan_id uuid, p_expected_version integer, p_version jsonb, p_simulation jsonb, p_feedback jsonb default null
) returns void
language plpgsql security invoker set search_path = '' as $$
declare v_current integer; v_updated_at timestamptz; v_status text;
begin
  select current_version, updated_at, status into v_current, v_updated_at, v_status from public.surgical_plans where id = p_plan_id for update;
  if not found then raise exception 'plan not found' using errcode = 'P0002'; end if;
  if v_status = 'finalized' then raise exception 'plan finalized' using errcode = 'P0001'; end if;
  if v_current is distinct from p_expected_version or
     v_updated_at is distinct from (p_version->>'expectedUpdatedAt')::timestamptz then
    raise exception 'plan version changed' using errcode = '40001';
  end if;
  insert into public.plan_versions(id, plan_id, version, content, changelog, source, knowledge_used, created_at)
  values ((p_version->>'id')::uuid, p_plan_id, p_expected_version + 1, p_version->'content',
          p_version->>'changelog', p_version->>'source',
          array(select jsonb_array_elements_text(p_version->'knowledgeUsed')), (p_version->>'createdAt')::timestamptz);
  insert into public.simulations(id, plan_id, version, focus_organ, region, steps, created_at)
  values ((p_simulation->>'id')::uuid, p_plan_id, p_expected_version + 1, p_simulation->>'focusOrgan',
          p_simulation->>'region', p_simulation->'steps', (p_simulation->>'createdAt')::timestamptz);
  if p_feedback is not null then
    insert into public.plan_feedback(id, plan_id, version, expert_name, comment, created_at)
    values ((p_feedback->>'id')::uuid, p_plan_id, p_expected_version, p_feedback->>'expertName',
            p_feedback->>'comment', (p_feedback->>'createdAt')::timestamptz);
  end if;
  update public.surgical_plans set current_version = p_expected_version + 1,
    status = case when p_version->>'source' = 'expert_refine' then 'refined' else 'simulated' end,
    updated_at = now() where id = p_plan_id;
end $$;
revoke all on function public.medplan_save_revision(uuid, integer, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.medplan_save_revision(uuid, integer, jsonb, jsonb, jsonb) to authenticated;

-- Knowledge metadata and immutable snapshots on newly generated versions.
alter table public.knowledge_entries add column if not exists source_name text not null default '';
alter table public.knowledge_entries add column if not exists source_url text not null default '';
alter table public.knowledge_entries add column if not exists source_version text not null default '';
alter table public.knowledge_entries add column if not exists review_status text not null default 'unreviewed';
alter table public.knowledge_entries add column if not exists reviewed_by text not null default '';
alter table public.knowledge_entries add column if not exists reviewed_at timestamptz;
alter table public.knowledge_entries add column if not exists updated_at timestamptz not null default now();
alter table public.plan_versions add column if not exists knowledge_references jsonb not null default '[]'::jsonb;
alter table public.knowledge_entries drop constraint if exists medplan_review_metadata;
alter table public.knowledge_entries add constraint medplan_review_metadata check (
  review_status in ('unreviewed', 'approved') and
  (review_status <> 'approved' or (length(btrim(source_name)) > 0 and length(btrim(reviewed_by)) > 0 and reviewed_at is not null))
);
create or replace function public.medplan_touch_knowledge() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = pg_catalog.clock_timestamp(); return new; end $$;
drop trigger if exists medplan_knowledge_updated on public.knowledge_entries;
create trigger medplan_knowledge_updated before update on public.knowledge_entries for each row execute function public.medplan_touch_knowledge();

create or replace function public.medplan_save_revision(
  p_plan_id uuid, p_expected_version integer, p_version jsonb, p_simulation jsonb, p_feedback jsonb default null
) returns void
language plpgsql security invoker set search_path = '' as $$
declare v_current integer; v_updated_at timestamptz; v_status text;
begin
  select current_version, updated_at, status into v_current, v_updated_at, v_status from public.surgical_plans where id = p_plan_id for update;
  if not found then raise exception 'plan not found' using errcode = 'P0002'; end if;
  if v_status = 'finalized' then raise exception 'plan finalized' using errcode = 'P0001'; end if;
  if v_current is distinct from p_expected_version or
     v_updated_at is distinct from (p_version->>'expectedUpdatedAt')::timestamptz then
    raise exception 'plan version changed' using errcode = '40001';
  end if;
  insert into public.plan_versions(id, plan_id, version, content, changelog, source, knowledge_used, knowledge_references, created_at)
  values ((p_version->>'id')::uuid, p_plan_id, p_expected_version + 1, p_version->'content',
          p_version->>'changelog', p_version->>'source',
          array(select jsonb_array_elements_text(p_version->'knowledgeUsed')), coalesce(p_version->'knowledgeReferences', '[]'::jsonb), (p_version->>'createdAt')::timestamptz);
  insert into public.simulations(id, plan_id, version, focus_organ, region, steps, created_at)
  values ((p_simulation->>'id')::uuid, p_plan_id, p_expected_version + 1, p_simulation->>'focusOrgan',
          p_simulation->>'region', p_simulation->'steps', (p_simulation->>'createdAt')::timestamptz);
  if p_feedback is not null then
    insert into public.plan_feedback(id, plan_id, version, expert_name, comment, created_at)
    values ((p_feedback->>'id')::uuid, p_plan_id, p_expected_version, p_feedback->>'expertName',
            p_feedback->>'comment', (p_feedback->>'createdAt')::timestamptz);
  end if;
  update public.surgical_plans set current_version = p_expected_version + 1,
    status = case when p_version->>'source' = 'expert_refine' then 'refined' else 'simulated' end,
    updated_at = now() where id = p_plan_id;
end $$;
revoke all on function public.medplan_save_revision(uuid, integer, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.medplan_save_revision(uuid, integer, jsonb, jsonb, jsonb) to authenticated;

-- 学习练习记录仅对对应用户可见；答案由服务端依据器官注册表评分。
create table if not exists public.learning_attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  organ_id text not null,
  question_type text not null,
  answer text not null,
  correct boolean not null,
  created_at timestamptz not null default now()
);
alter table public.learning_attempts enable row level security;
revoke all on public.learning_attempts from public, anon, authenticated;
grant select, insert on public.learning_attempts to authenticated;
drop policy if exists medplan_learning_guard on public.learning_attempts;
create policy medplan_learning_guard on public.learning_attempts as restrictive for all to public using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists medplan_learning_access on public.learning_attempts;
create policy medplan_learning_access on public.learning_attempts for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create index if not exists idx_learning_attempts_owner_date on public.learning_attempts(owner_id, created_at desc);

-- Administrators are assigned by a database owner, never by application users.
create table if not exists public.medplan_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.medplan_admins enable row level security;
revoke all on public.medplan_admins from public, anon, authenticated;
create or replace function public.medplan_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from public.medplan_admins where user_id = auth.uid())
$$;
revoke all on function public.medplan_is_admin() from public, anon;
grant execute on function public.medplan_is_admin() to authenticated;

-- Only administrators can add or edit shared knowledge; all logged-in users can read.
grant insert, update on public.knowledge_entries to authenticated;
drop policy if exists medplan_knowledge_insert_guard on public.knowledge_entries;
create policy medplan_knowledge_insert_guard on public.knowledge_entries as restrictive for insert to public with check (public.medplan_is_admin());
drop policy if exists medplan_knowledge_update_guard on public.knowledge_entries;
create policy medplan_knowledge_update_guard on public.knowledge_entries as restrictive for update to public using (public.medplan_is_admin()) with check (public.medplan_is_admin());
drop policy if exists medplan_knowledge_admin_insert on public.knowledge_entries;
create policy medplan_knowledge_admin_insert on public.knowledge_entries for insert to authenticated with check (public.medplan_is_admin());
drop policy if exists medplan_knowledge_admin_update on public.knowledge_entries;
create policy medplan_knowledge_admin_update on public.knowledge_entries for update to authenticated using (public.medplan_is_admin()) with check (public.medplan_is_admin());

-- Administrative actions are recorded without passwords or service credentials.
create table if not exists public.medplan_admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null default auth.uid() references auth.users(id),
  operation_id uuid not null,
  action text not null,
  target text not null,
  outcome text not null check (outcome in ('requested', 'succeeded', 'failed')),
  created_at timestamptz not null default now()
);
alter table public.medplan_admin_audit enable row level security;
revoke all on public.medplan_admin_audit from public, anon, authenticated;
grant select, insert on public.medplan_admin_audit to authenticated;
drop policy if exists medplan_admin_audit_guard on public.medplan_admin_audit;
create policy medplan_admin_audit_guard on public.medplan_admin_audit as restrictive for all to public
  using (public.medplan_is_admin()) with check (public.medplan_is_admin() and actor_id = (select auth.uid()));
drop policy if exists medplan_admin_audit_access on public.medplan_admin_audit;
create policy medplan_admin_audit_access on public.medplan_admin_audit for all to authenticated
  using (public.medplan_is_admin()) with check (public.medplan_is_admin() and actor_id = (select auth.uid()));

-- Administrators can assign only legacy patients that have no owner.
create or replace function public.medplan_list_unassigned_patients() returns table(id uuid, name text, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.medplan_is_admin() then raise exception 'administrator required' using errcode = '42501'; end if;
  return query select p.id, p.name, p.created_at from public.patients p where p.owner_id is null order by p.created_at desc limit 100;
end $$;
revoke all on function public.medplan_list_unassigned_patients() from public, anon;
grant execute on function public.medplan_list_unassigned_patients() to authenticated;

create or replace function public.medplan_assign_unassigned_patient(p_patient_id uuid, p_owner_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_operation uuid := gen_random_uuid();
begin
  if not public.medplan_is_admin() then raise exception 'administrator required' using errcode = '42501'; end if;
  if p_owner_id is null or not exists (select 1 from auth.users u where u.id = p_owner_id) then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  select owner_id into v_owner from public.patients where id = p_patient_id for update;
  if not found then raise exception 'patient not found' using errcode = 'P0002'; end if;
  if v_owner is not null then raise exception 'patient already assigned' using errcode = '40001'; end if;
  update public.patients set owner_id = p_owner_id where id = p_patient_id;
  insert into public.medplan_admin_audit(actor_id, operation_id, action, target, outcome)
    values (auth.uid(), v_operation, 'assign_patient', p_patient_id::text || ':' || p_owner_id::text, 'succeeded');
end $$;
revoke all on function public.medplan_assign_unassigned_patient(uuid, uuid) from public, anon;
grant execute on function public.medplan_assign_unassigned_patient(uuid, uuid) to authenticated;

-- Keep the latest generated diagnosis available for case list search.
alter table public.surgical_plans add column if not exists diagnosis text not null default '';
update public.surgical_plans sp set diagnosis = coalesce((
  select pv.content->>'diagnosis' from public.plan_versions pv
  where pv.plan_id = sp.id and pv.version = sp.current_version limit 1
), '');
create or replace function public.medplan_save_revision(
  p_plan_id uuid, p_expected_version integer, p_version jsonb, p_simulation jsonb, p_feedback jsonb default null
) returns void
language plpgsql security invoker set search_path = '' as $$
declare v_current integer; v_updated_at timestamptz; v_status text;
begin
  select current_version, updated_at, status into v_current, v_updated_at, v_status from public.surgical_plans where id = p_plan_id for update;
  if not found then raise exception 'plan not found' using errcode = 'P0002'; end if;
  if v_status = 'finalized' then raise exception 'plan finalized' using errcode = 'P0001'; end if;
  if v_current is distinct from p_expected_version or
     v_updated_at is distinct from (p_version->>'expectedUpdatedAt')::timestamptz then
    raise exception 'plan version changed' using errcode = '40001';
  end if;
  insert into public.plan_versions(id, plan_id, version, content, changelog, source, knowledge_used, knowledge_references, created_at)
  values ((p_version->>'id')::uuid, p_plan_id, p_expected_version + 1, p_version->'content',
          p_version->>'changelog', p_version->>'source',
          array(select jsonb_array_elements_text(p_version->'knowledgeUsed')), coalesce(p_version->'knowledgeReferences', '[]'::jsonb), (p_version->>'createdAt')::timestamptz);
  insert into public.simulations(id, plan_id, version, focus_organ, region, steps, created_at)
  values ((p_simulation->>'id')::uuid, p_plan_id, p_expected_version + 1, p_simulation->>'focusOrgan',
          p_simulation->>'region', p_simulation->'steps', (p_simulation->>'createdAt')::timestamptz);
  if p_feedback is not null then
    insert into public.plan_feedback(id, plan_id, version, expert_name, comment, created_at)
    values ((p_feedback->>'id')::uuid, p_plan_id, p_expected_version, p_feedback->>'expertName',
            p_feedback->>'comment', (p_feedback->>'createdAt')::timestamptz);
  end if;
  update public.surgical_plans set current_version = p_expected_version + 1,
    status = case when p_version->>'source' = 'expert_refine' then 'refined' else 'simulated' end,
    diagnosis = coalesce(p_version->'content'->>'diagnosis', ''),
    updated_at = now() where id = p_plan_id;
end $$;
revoke all on function public.medplan_save_revision(uuid, integer, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.medplan_save_revision(uuid, integer, jsonb, jsonb, jsonb) to authenticated;

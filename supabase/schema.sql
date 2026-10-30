-- ============================================================

begin;
-- MedPlan Atlas 医学手术规划智能体系统 · Supabase 数据库结构
-- 在 Supabase Dashboard → SQL Editor 中执行本文件即可完成建库。
-- 应用侧：配置 .env.local 的 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY
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
  owner_id uuid references auth.users(id),
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
  owner_id uuid references auth.users(id),
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
  owner_id uuid references auth.users(id),
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

-- 同一脚本用于新库和升级。旧记录不自动分配给任意用户，确认所有者后再人工回填。
alter table public.surgical_plans add column if not exists owner_id uuid references auth.users(id);
alter table public.chat_sessions add column if not exists owner_id uuid references auth.users(id);
alter table public.generated_images add column if not exists owner_id uuid references auth.users(id);

do $$
begin
  if exists (select 1 from public.plan_versions group by plan_id, version having count(*) > 1)
     or exists (select 1 from public.simulations group by plan_id, version having count(*) > 1) then
    raise exception '存在重复方案或模拟版本，请先备份并人工确认保留记录后再执行本脚本；本脚本不会自动删除历史。';
  end if;
end $$;

create unique index if not exists uq_plan_versions_plan_version on public.plan_versions(plan_id, version);
create unique index if not exists uq_simulations_plan_version on public.simulations(plan_id, version);
create index if not exists idx_plans_owner_updated on public.surgical_plans(owner_id, updated_at desc);

-- RPC 只向经过服务端认证的 service_role 开放，相关写入在一次数据库事务内完成。
create or replace function public.create_case(p_owner_id uuid, p_patient jsonb, p_title text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_patient public.patients%rowtype;
  v_plan public.surgical_plans%rowtype;
begin
  if p_owner_id is null or jsonb_typeof(p_patient) is distinct from 'object'
     or coalesce(btrim(p_patient->>'name'), '') = '' then
    raise exception using errcode = '22023', message = '病例参数无效';
  end if;
  insert into public.patients(id, name, gender, age, medical_record, preliminary_plan)
  values (gen_random_uuid(), p_patient->>'name', coalesce(p_patient->>'gender', ''),
    coalesce((p_patient->>'age')::integer, 0), coalesce(p_patient->>'medical_record', ''),
    coalesce(p_patient->>'preliminary_plan', '')) returning * into v_patient;
  insert into public.surgical_plans(id, patient_id, owner_id, title, patient_name)
  values (gen_random_uuid(), v_patient.id, p_owner_id,
    coalesce(nullif(p_title, ''), v_patient.name || '·手术规划'), v_patient.name)
  returning * into v_plan;
  return jsonb_build_object('patient', to_jsonb(v_patient), 'plan', to_jsonb(v_plan));
end $$;

create or replace function public.commit_plan(
  p_plan_id uuid, p_owner_id uuid, p_expected_version integer, p_content jsonb,
  p_changelog text, p_source text, p_knowledge_used text[], p_simulation jsonb, p_feedback jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_plan public.surgical_plans%rowtype;
  v_version public.plan_versions%rowtype;
  v_simulation public.simulations%rowtype;
  v_feedback public.plan_feedback%rowtype;
  v_next integer;
begin
  select * into v_plan from public.surgical_plans
    where id = p_plan_id and owner_id = p_owner_id for update;
  if not found or p_owner_id is null then
    raise exception using errcode = '42501', message = '无权访问该记录';
  end if;
  if v_plan.current_version is distinct from p_expected_version then
    raise exception using errcode = '40001', message = '方案已被更新，请重新加载';
  end if;
  if p_expected_version < 0 or p_source is null or p_source not in ('ai', 'expert_refine')
     or jsonb_typeof(p_content) is distinct from 'object'
     or jsonb_typeof(p_content->'steps') is distinct from 'array'
     or jsonb_typeof(p_simulation) is distinct from 'object'
     or jsonb_typeof(p_simulation->'steps') is distinct from 'array' then
    raise exception using errcode = '22023', message = '方案或模拟数据无效';
  end if;
  if jsonb_array_length(p_content->'steps') = 0 or jsonb_array_length(p_simulation->'steps') = 0 then
    raise exception using errcode = '22023', message = '方案和模拟步骤不能为空';
  end if;
  v_next := p_expected_version + 1;
  insert into public.plan_versions(id, plan_id, version, content, changelog, source, knowledge_used)
  values (gen_random_uuid(), p_plan_id, v_next, p_content, p_changelog, p_source,
    coalesce(p_knowledge_used, '{}')) returning * into v_version;
  insert into public.simulations(id, plan_id, version, focus_organ, region, steps)
  values (gen_random_uuid(), p_plan_id, v_next, p_simulation->>'focusOrgan',
    p_simulation->>'region', p_simulation->'steps') returning * into v_simulation;
  if p_feedback is not null then
    if jsonb_typeof(p_feedback) is distinct from 'object'
       or coalesce(btrim(p_feedback->>'comment'), '') = '' then
      raise exception using errcode = '22023', message = '专家反馈无效';
    end if;
    insert into public.plan_feedback(id, plan_id, version, expert_name, comment)
    values (gen_random_uuid(), p_plan_id, p_expected_version,
      p_feedback->>'expertName', p_feedback->>'comment') returning * into v_feedback;
  end if;
  update public.surgical_plans set current_version = v_next,
    status = case when p_source = 'expert_refine' then 'refined' else 'simulated' end,
    updated_at = now() where id = p_plan_id;
  return jsonb_build_object('version', to_jsonb(v_version), 'simulation', to_jsonb(v_simulation),
    'feedback', case when p_feedback is null then null else to_jsonb(v_feedback) end);
end $$;

create or replace function public.ensure_chat_session(p_session_id text, p_mode text, p_title text, p_owner_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner uuid;
begin
  if p_owner_id is null or coalesce(p_session_id, '') = '' or p_mode is null or p_mode not in ('learning', 'guidance') then
    raise exception using errcode = '22023', message = '对话参数无效';
  end if;
  insert into public.chat_sessions(id, owner_id, mode, title)
  values (p_session_id, p_owner_id, p_mode, p_title) on conflict(id) do nothing;
  select owner_id into v_owner from public.chat_sessions where id = p_session_id for update;
  if v_owner is distinct from p_owner_id then
    raise exception using errcode = '42501', message = '无权访问该对话';
  end if;
end $$;

create or replace function public.append_chat_messages(p_session_id text, p_owner_id uuid, p_messages jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner uuid; v_message jsonb;
begin
  select owner_id into v_owner from public.chat_sessions where id = p_session_id for update;
  if not found or p_owner_id is null or v_owner is distinct from p_owner_id then
    raise exception using errcode = '42501', message = '无权访问该对话';
  end if;
  if jsonb_typeof(p_messages) is distinct from 'array' then
    raise exception using errcode = '22023', message = '对话内容无效';
  end if;
  for v_message in select value from jsonb_array_elements(p_messages) loop
    if jsonb_typeof(v_message->'role') is distinct from 'string' or v_message->>'role' not in ('user', 'assistant')
       or jsonb_typeof(v_message->'content') is distinct from 'string' then
      raise exception using errcode = '22023', message = '对话内容无效';
    end if;
    insert into public.chat_messages(id, session_id, role, content)
    values (gen_random_uuid(), p_session_id, v_message->>'role', v_message->>'content');
  end loop;
end $$;

create table if not exists public.rate_limit_windows (
  owner_id uuid references auth.users(id) on delete cascade,
  action text not null,
  window_start timestamptz not null,
  request_count integer not null,
  primary key(owner_id, action)
);

create or replace function public.consume_rate_limit(p_owner_id uuid, p_action text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_start timestamptz; v_count integer;
begin
  if p_owner_id is null or coalesce(p_action, '') = '' or length(p_action) > 64
     or p_limit is null or p_limit < 1 or p_limit > 100000
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception using errcode = '22023', message = '限流参数无效';
  end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limit_windows(owner_id, action, window_start, request_count)
  values (p_owner_id, p_action, v_start, 1)
  on conflict(owner_id, action) do update set
    request_count = case when rate_limit_windows.window_start = excluded.window_start
      then least(rate_limit_windows.request_count + 1, p_limit + 1) else 1 end,
    window_start = excluded.window_start
  returning request_count into v_count;
  return v_count <= p_limit;
end $$;

revoke all on function public.create_case(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.commit_plan(uuid, uuid, integer, jsonb, text, text, text[], jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.ensure_chat_session(text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.append_chat_messages(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.consume_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.create_case(uuid, jsonb, text) to service_role;
grant execute on function public.commit_plan(uuid, uuid, integer, jsonb, text, text, text[], jsonb, jsonb) to service_role;
grant execute on function public.ensure_chat_session(text, text, text, uuid) to service_role;
grant execute on function public.append_chat_messages(text, uuid, jsonb) to service_role;
grant execute on function public.consume_rate_limit(uuid, text, integer, integer) to service_role;

alter table public.patients enable row level security;
alter table public.surgical_plans enable row level security;
alter table public.plan_versions enable row level security;
alter table public.plan_feedback enable row level security;
alter table public.simulations enable row level security;
alter table public.knowledge_entries enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.generated_images enable row level security;
alter table public.rate_limit_windows enable row level security;

-- 浏览器只可直接读取本人的记录；所有写入仍经服务端认证接口。
drop policy if exists medplan_owner_read on public.surgical_plans;
create policy medplan_owner_read on public.surgical_plans for select to authenticated using(owner_id = auth.uid());
drop policy if exists medplan_owner_read on public.patients;
create policy medplan_owner_read on public.patients for select to authenticated using(
  exists(select 1 from public.surgical_plans p where p.patient_id = patients.id and p.owner_id = auth.uid()));
drop policy if exists medplan_owner_read on public.plan_versions;
create policy medplan_owner_read on public.plan_versions for select to authenticated using(
  exists(select 1 from public.surgical_plans p where p.id = plan_versions.plan_id and p.owner_id = auth.uid()));
drop policy if exists medplan_owner_read on public.plan_feedback;
create policy medplan_owner_read on public.plan_feedback for select to authenticated using(
  exists(select 1 from public.surgical_plans p where p.id = plan_feedback.plan_id and p.owner_id = auth.uid()));
drop policy if exists medplan_owner_read on public.simulations;
create policy medplan_owner_read on public.simulations for select to authenticated using(
  exists(select 1 from public.surgical_plans p where p.id = simulations.plan_id and p.owner_id = auth.uid()));
drop policy if exists medplan_authenticated_read on public.knowledge_entries;
create policy medplan_authenticated_read on public.knowledge_entries for select to authenticated using(true);
drop policy if exists medplan_owner_read on public.chat_sessions;
create policy medplan_owner_read on public.chat_sessions for select to authenticated using(owner_id = auth.uid());
drop policy if exists medplan_owner_read on public.chat_messages;
create policy medplan_owner_read on public.chat_messages for select to authenticated using(
  exists(select 1 from public.chat_sessions s where s.id = chat_messages.session_id and s.owner_id = auth.uid()));
drop policy if exists medplan_owner_read on public.generated_images;
create policy medplan_owner_read on public.generated_images for select to authenticated using(owner_id = auth.uid());

commit;

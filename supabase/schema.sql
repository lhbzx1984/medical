-- ============================================================
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

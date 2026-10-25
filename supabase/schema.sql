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

-- 说明：本系统服务端使用 SERVICE_ROLE_KEY 访问（绕过 RLS），
-- 所有数据访问都收敛在 Next.js API Route 内，浏览器不直接连 Supabase。
-- 若需启用 RLS，可按需为上表添加策略，并为 service_role 显式放行。

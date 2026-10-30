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

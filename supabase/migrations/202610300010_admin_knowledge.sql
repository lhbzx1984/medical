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

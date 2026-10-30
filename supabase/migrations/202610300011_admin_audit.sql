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

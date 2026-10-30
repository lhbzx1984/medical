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

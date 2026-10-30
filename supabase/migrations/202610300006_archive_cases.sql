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

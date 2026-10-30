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

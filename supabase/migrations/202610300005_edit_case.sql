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

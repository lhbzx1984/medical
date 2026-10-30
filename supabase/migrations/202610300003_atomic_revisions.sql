-- A revision, its simulation, optional feedback and plan status are committed together.
-- The caller retains its own RLS privileges; the plan row is locked before checking the version.
create unique index if not exists uq_plan_versions_plan_version on public.plan_versions(plan_id, version);
create unique index if not exists uq_simulations_plan_version on public.simulations(plan_id, version);

create or replace function public.medplan_save_revision(
  p_plan_id uuid, p_expected_version integer, p_version jsonb, p_simulation jsonb, p_feedback jsonb default null
) returns void
language plpgsql security invoker set search_path = '' as $$
declare v_current integer;
begin
  select current_version into v_current from public.surgical_plans where id = p_plan_id for update;
  if not found then raise exception 'plan not found' using errcode = 'P0002'; end if;
  if v_current is distinct from p_expected_version then
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

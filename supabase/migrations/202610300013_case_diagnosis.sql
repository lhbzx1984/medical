-- Keep the latest generated diagnosis available for case list search.
alter table public.surgical_plans add column if not exists diagnosis text not null default '';
update public.surgical_plans sp set diagnosis = coalesce((
  select pv.content->>'diagnosis' from public.plan_versions pv
  where pv.plan_id = sp.id and pv.version = sp.current_version limit 1
), '');
create or replace function public.medplan_save_revision(
  p_plan_id uuid, p_expected_version integer, p_version jsonb, p_simulation jsonb, p_feedback jsonb default null
) returns void
language plpgsql security invoker set search_path = '' as $$
declare v_current integer; v_updated_at timestamptz; v_status text;
begin
  select current_version, updated_at, status into v_current, v_updated_at, v_status from public.surgical_plans where id = p_plan_id for update;
  if not found then raise exception 'plan not found' using errcode = 'P0002'; end if;
  if v_status = 'finalized' then raise exception 'plan finalized' using errcode = 'P0001'; end if;
  if v_current is distinct from p_expected_version or
     v_updated_at is distinct from (p_version->>'expectedUpdatedAt')::timestamptz then
    raise exception 'plan version changed' using errcode = '40001';
  end if;
  insert into public.plan_versions(id, plan_id, version, content, changelog, source, knowledge_used, knowledge_references, created_at)
  values ((p_version->>'id')::uuid, p_plan_id, p_expected_version + 1, p_version->'content',
          p_version->>'changelog', p_version->>'source',
          array(select jsonb_array_elements_text(p_version->'knowledgeUsed')), coalesce(p_version->'knowledgeReferences', '[]'::jsonb), (p_version->>'createdAt')::timestamptz);
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
    diagnosis = coalesce(p_version->'content'->>'diagnosis', ''),
    updated_at = now() where id = p_plan_id;
end $$;
revoke all on function public.medplan_save_revision(uuid, integer, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.medplan_save_revision(uuid, integer, jsonb, jsonb, jsonb) to authenticated;

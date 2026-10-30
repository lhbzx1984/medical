-- Knowledge metadata and immutable snapshots on newly generated versions.
alter table public.knowledge_entries add column if not exists source_name text not null default '';
alter table public.knowledge_entries add column if not exists source_url text not null default '';
alter table public.knowledge_entries add column if not exists source_version text not null default '';
alter table public.knowledge_entries add column if not exists review_status text not null default 'unreviewed';
alter table public.knowledge_entries add column if not exists reviewed_by text not null default '';
alter table public.knowledge_entries add column if not exists reviewed_at timestamptz;
alter table public.knowledge_entries add column if not exists updated_at timestamptz not null default now();
alter table public.plan_versions add column if not exists knowledge_references jsonb not null default '[]'::jsonb;
alter table public.knowledge_entries drop constraint if exists medplan_review_metadata;
alter table public.knowledge_entries add constraint medplan_review_metadata check (
  review_status in ('unreviewed', 'approved') and
  (review_status <> 'approved' or (length(btrim(source_name)) > 0 and length(btrim(reviewed_by)) > 0 and reviewed_at is not null))
);
create or replace function public.medplan_touch_knowledge() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = pg_catalog.clock_timestamp(); return new; end $$;
drop trigger if exists medplan_knowledge_updated on public.knowledge_entries;
create trigger medplan_knowledge_updated before update on public.knowledge_entries for each row execute function public.medplan_touch_knowledge();

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
    updated_at = now() where id = p_plan_id;
end $$;
revoke all on function public.medplan_save_revision(uuid, integer, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.medplan_save_revision(uuid, integer, jsonb, jsonb, jsonb) to authenticated;

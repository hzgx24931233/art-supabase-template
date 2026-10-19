-- Project organization and responsibilities domain.
-- Applied directly through Supabase MCP; this file is the reviewed source, not a migration.

create table if not exists public.pm_project_participant (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.mdm_project(id) on delete restrict,
  participant_type text not null check (participant_type in ('owner','general_contractor','supervisor','subcontractor','supplier')),
  unit_name text not null check (btrim(unit_name) <> ''),
  registration_no text,
  contact_name text,
  contact_phone text,
  qualifications text,
  service_scope text,
  source_vendor_id uuid references public.mdm_external_vendor(id) on delete set null,
  status text not null default 'active' check (status in ('draft','active','inactive','ended')),
  create_by text default coalesce(auth.uid()::text, 'system'),
  create_time timestamptz not null default now(),
  update_by text,
  update_time timestamptz not null default now(),
  unique(project_id, unit_name, participant_type)
);

create table if not exists public.pm_project_org_version (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.mdm_project(id) on delete restrict,
  version_no integer not null check (version_no > 0),
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected','cancelled','superseded')),
  title text not null check (btrim(title) <> ''),
  change_note text,
  snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(snapshot) = 'object'),
  baseline_at timestamptz,
  baseline_by uuid,
  submitted_at timestamptz,
  submitted_by uuid,
  decided_at timestamptz,
  decided_by uuid,
  decision_note text,
  workflow_instance_id uuid references public.wf_instance(id) on delete set null,
  create_by text default coalesce(auth.uid()::text, 'system'),
  create_time timestamptz not null default now(),
  update_by text,
  update_time timestamptz not null default now(),
  unique(project_id, version_no)
);

create unique index if not exists pm_project_org_one_draft_idx
  on public.pm_project_org_version(project_id)
  where status in ('draft','submitted');

create table if not exists public.pm_project_org_node (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.pm_project_org_version(id) on delete cascade,
  parent_id uuid references public.pm_project_org_node(id) on delete restrict,
  node_type text not null check (node_type in ('unit','department','position','person')),
  group_type text not null default 'internal' check (group_type in ('internal','external')),
  participant_id uuid references public.pm_project_participant(id) on delete set null,
  position_id uuid,
  assignment_id uuid,
  node_code text,
  node_name text not null check (btrim(node_name) <> ''),
  sort_order integer not null default 0,
  layout jsonb not null default '{}'::jsonb check (jsonb_typeof(layout) = 'object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  create_by text default coalesce(auth.uid()::text, 'system'),
  create_time timestamptz not null default now(),
  update_by text,
  update_time timestamptz not null default now()
);

create table if not exists public.pm_project_position (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.mdm_project(id) on delete restrict,
  version_id uuid not null references public.pm_project_org_version(id) on delete restrict,
  position_code text not null,
  position_name text not null check (btrim(position_name) <> ''),
  responsibilities text,
  requirements text,
  approval_permissions jsonb not null default '[]'::jsonb check (jsonb_typeof(approval_permissions) = 'array'),
  status text not null default 'active' check (status in ('draft','active','inactive','ended')),
  sort_order integer not null default 0,
  create_by text default coalesce(auth.uid()::text, 'system'),
  create_time timestamptz not null default now(),
  update_by text,
  update_time timestamptz not null default now(),
  unique(version_id, position_code)
);

create table if not exists public.pm_project_person_assignment (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.mdm_project(id) on delete restrict,
  version_id uuid not null references public.pm_project_org_version(id) on delete restrict,
  position_id uuid not null references public.pm_project_position(id) on delete restrict,
  employee_id uuid references public.mdm_employee(id) on delete restrict,
  user_id uuid references public.sys_user(id) on delete restrict,
  person_name text not null check (btrim(person_name) <> ''),
  account_name text,
  unit_name text,
  phone text,
  entry_date date,
  exit_date date,
  status text not null default 'active' check (status in ('planned','active','ended')),
  certificate_no text,
  certificate_type text,
  certificate_expires_on date,
  contact_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(contact_snapshot) = 'object'),
  create_by text default coalesce(auth.uid()::text, 'system'),
  create_time timestamptz not null default now(),
  update_by text,
  update_time timestamptz not null default now(),
  check (employee_id is not null or user_id is not null),
  check (exit_date is null or entry_date is null or exit_date >= entry_date)
);

create table if not exists public.pm_project_org_artifact (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.mdm_project(id) on delete restrict,
  version_id uuid not null references public.pm_project_org_version(id) on delete cascade,
  artifact_type text not null check (artifact_type in ('org_chart','cad','image','word','pdf','excel')),
  attachment_id uuid references public.sys_attachment(id) on delete restrict,
  generation_status text not null default 'ready' check (generation_status in ('pending','ready','failed')),
  error_message text,
  create_by text default coalesce(auth.uid()::text, 'system'),
  create_time timestamptz not null default now(),
  update_time timestamptz not null default now()
);

create table if not exists public.pm_project_org_business_link (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.mdm_project(id) on delete restrict,
  version_id uuid not null references public.pm_project_org_version(id) on delete restrict,
  assignment_id uuid references public.pm_project_person_assignment(id) on delete restrict,
  position_id uuid references public.pm_project_position(id) on delete restrict,
  business_type text not null check (business_type in ('wbs','risk','special_plan')),
  business_id uuid not null,
  responsibility_type text not null default 'owner' check (responsibility_type in ('owner','author','reviewer','executor')),
  status text not null default 'active' check (status in ('active','ended')),
  create_by text default coalesce(auth.uid()::text, 'system'),
  create_time timestamptz not null default now(),
  update_by text,
  update_time timestamptz not null default now(),
  check (assignment_id is not null or position_id is not null),
  unique (business_type, business_id, responsibility_type, assignment_id, position_id)
);

create index if not exists pm_project_org_version_project_idx on public.pm_project_org_version(project_id, version_no desc);
create index if not exists pm_project_org_node_version_idx on public.pm_project_org_node(version_id, parent_id, sort_order);
create index if not exists pm_project_position_project_idx on public.pm_project_position(project_id, version_id);
create index if not exists pm_project_person_project_idx on public.pm_project_person_assignment(project_id, version_id, status);
create index if not exists pm_project_participant_project_idx on public.pm_project_participant(project_id, participant_type, status);
create index if not exists pm_project_org_business_link_idx on public.pm_project_org_business_link(project_id, business_type, business_id, status);

do $$
declare
  t text;
begin
  foreach t in array array['pm_project_participant','pm_project_org_version','pm_project_org_node','pm_project_position','pm_project_person_assignment','pm_project_org_artifact','pm_project_org_business_link'] loop
    declare
      write_permission text := case t
        when 'pm_project_participant' then 'PmProjectOrg:ManageParticipant'
        when 'pm_project_org_version' then 'PmProjectOrg:ManageVersion'
        when 'pm_project_org_node' then 'PmProjectOrg:ManageNode'
        when 'pm_project_position' then 'PmProjectOrg:ManagePosition'
        when 'pm_project_person_assignment' then 'PmProjectOrg:ManagePerson'
        when 'pm_project_org_business_link' then 'PmProjectOrg:LinkBusiness'
        else 'PmProjectOrg:UploadArtifact'
      end;
    begin
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists pm_org_read on public.%I', t);
    execute format('drop policy if exists pm_org_write on public.%I', t);
    execute format('create policy pm_org_read on public.%I for select to authenticated using ((select app_private.has_permission(''PmProjectOrg:View'')) or (select app_private.is_platform_super()))', t);
    execute format('create policy pm_org_write on public.%I for all to authenticated using ((select app_private.has_permission(''%s'')) or (select app_private.is_platform_super())) with check ((select app_private.has_permission(''%s'')) or (select app_private.is_platform_super()))', t, write_permission, write_permission);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    end;
  end loop;
end $$;

create or replace function public.pm_list_project_org(p_project_id uuid, p_version_id uuid default null)
returns jsonb
language sql
security invoker
stable
set search_path = public, app_private, pg_catalog
as $$
  select jsonb_build_object(
    'version', (select to_jsonb(v) from public.pm_project_org_version v where v.project_id = p_project_id and (p_version_id is null or v.id = p_version_id) order by v.version_no desc limit 1),
    'nodes', coalesce((select jsonb_agg(to_jsonb(n) order by n.sort_order, n.node_name) from public.pm_project_org_node n join public.pm_project_org_version v on v.id=n.version_id where v.project_id=p_project_id and (p_version_id is null or v.id=p_version_id)), '[]'::jsonb),
    'positions', coalesce((select jsonb_agg(to_jsonb(p) order by p.sort_order, p.position_name) from public.pm_project_position p where p.project_id=p_project_id and (p_version_id is null or p.version_id=p_version_id)), '[]'::jsonb),
    'assignments', coalesce((select jsonb_agg(to_jsonb(a) order by a.person_name) from public.pm_project_person_assignment a where a.project_id=p_project_id and (p_version_id is null or a.version_id=p_version_id)), '[]'::jsonb),
    'participants', coalesce((select jsonb_agg(to_jsonb(x) order by x.participant_type, x.unit_name) from public.pm_project_participant x where x.project_id=p_project_id), '[]'::jsonb),
    'artifacts', coalesce((select jsonb_agg(to_jsonb(a) order by a.create_time desc) from public.pm_project_org_artifact a where a.project_id=p_project_id and (p_version_id is null or a.version_id=p_version_id)), '[]'::jsonb)
  );
$$;

create or replace function public.pm_transition_project_org(p_version_id uuid, p_action text, p_note text default null)
returns public.pm_project_org_version
language plpgsql
security invoker
set search_path = public, app_private, pg_catalog
as $$
declare
  v public.pm_project_org_version;
begin
  select * into v from public.pm_project_org_version where id=p_version_id for update;
  if not found then raise exception '项目组织版本不存在' using errcode='P0002'; end if;
  if p_action='submit' and v.status='draft' and ((select app_private.has_permission('PmProjectOrg:Submit')) or (select app_private.is_platform_super())) then
    update public.pm_project_org_version set status='submitted', submitted_at=now(), submitted_by=auth.uid(), update_time=now(), update_by=auth.uid()::text where id=v.id returning * into v;
  elsif p_action='approve' and v.status='submitted' and ((select app_private.has_permission('PmProjectOrg:Approve')) or (select app_private.is_platform_super())) then
    update public.pm_project_org_version
    set status='superseded', update_time=now(), update_by=auth.uid()::text
    where project_id=v.project_id and status='approved' and id<>v.id;
    update public.pm_project_org_version set status='approved', baseline_at=now(), baseline_by=auth.uid(), decided_at=now(), decided_by=auth.uid(), decision_note=p_note, update_time=now(), update_by=auth.uid()::text where id=v.id returning * into v;
  elsif p_action='reject' and v.status='submitted' and ((select app_private.has_permission('PmProjectOrg:Approve')) or (select app_private.is_platform_super())) then
    update public.pm_project_org_version set status='rejected', decided_at=now(), decided_by=auth.uid(), decision_note=p_note, update_time=now(), update_by=auth.uid()::text where id=v.id returning * into v;
  elsif p_action='cancel' and v.status in ('draft','submitted') then
    update public.pm_project_org_version set status='cancelled', decision_note=p_note, update_time=now(), update_by=auth.uid()::text where id=v.id returning * into v;
  else
    raise exception '项目组织版本当前状态不支持此操作' using errcode='P0001';
  end if;
  return v;
end $$;

create or replace function public.pm_project_org_responsible_options(
  p_project_id uuid,
  p_version_id uuid default null
)
returns table (
  assignment_id uuid,
  position_id uuid,
  person_name text,
  position_name text,
  unit_name text,
  status text,
  certificate_expires_on date
)
language sql
security invoker
stable
set search_path = public, app_private, pg_catalog
as $$
  select a.id, a.position_id, a.person_name, p.position_name, a.unit_name,
         a.status, a.certificate_expires_on
  from public.pm_project_person_assignment a
  join public.pm_project_position p on p.id = a.position_id
  where a.project_id = p_project_id
    and (p_version_id is null or a.version_id = p_version_id)
    and a.status in ('planned','active')
  order by p.position_name, a.person_name;
$$;

revoke all on function public.pm_list_project_org(uuid, uuid) from public, anon;
grant execute on function public.pm_list_project_org(uuid, uuid) to authenticated;
revoke all on function public.pm_transition_project_org(uuid, text, text) from public, anon;
grant execute on function public.pm_transition_project_org(uuid, text, text) to authenticated;
revoke all on function public.pm_project_org_responsible_options(uuid, uuid) from public, anon;
grant execute on function public.pm_project_org_responsible_options(uuid, uuid) to authenticated;

create or replace function public.pm_link_project_org_responsible(
  p_project_id uuid,
  p_version_id uuid,
  p_business_type text,
  p_business_id uuid,
  p_responsibility_type text,
  p_assignment_id uuid default null,
  p_position_id uuid default null,
  p_notify boolean default true
)
returns uuid
language plpgsql
security invoker
set search_path = public, app_private, pg_catalog
as $$
declare
  v_link_id uuid;
  v_assignment record;
begin
  if not ((select app_private.has_permission('PmProjectOrg:LinkBusiness')) or (select app_private.is_platform_super())) then
    raise exception '当前账号没有关联项目责任人的权限' using errcode='42501';
  end if;
  if p_business_type not in ('wbs','risk','special_plan') then
    raise exception '不支持的项目业务类型' using errcode='22023';
  end if;
  if p_assignment_id is null and p_position_id is null then
    raise exception '必须指定项目人员或岗位' using errcode='22023';
  end if;
  insert into public.pm_project_org_business_link(
    project_id, version_id, assignment_id, position_id, business_type, business_id,
    responsibility_type, create_by, update_by
  ) values (
    p_project_id, p_version_id, p_assignment_id, p_position_id, p_business_type, p_business_id,
    p_responsibility_type, auth.uid()::text, auth.uid()::text
  )
  on conflict (business_type, business_id, responsibility_type, assignment_id, position_id)
  do update set status='active', update_time=now(), update_by=auth.uid()::text
  returning id into v_link_id;

  if p_notify then
    for v_assignment in
      select distinct a.user_id, a.person_name, p.position_name
      from public.pm_project_person_assignment a
      left join public.pm_project_position p on p.id=a.position_id
      where a.user_id is not null
        and ((p_assignment_id is not null and a.id=p_assignment_id)
          or (p_assignment_id is null and p_position_id is not null and a.position_id=p_position_id and a.status in ('planned','active')))
    loop
      perform app_private.enqueue_user_notification(
        v_assignment.user_id, 'todo', '项目责任人关联提醒',
        format('您已被关联为%s业务的%s责任人（岗位：%s）。', p_business_type, p_responsibility_type, coalesce(v_assignment.position_name, '未设置岗位')),
        'info', 'pm_project_org_business_link', v_link_id, 'pm_project_org_business_link', p_business_id,
        null, '/pm/project-organization', jsonb_build_object('projectId', p_project_id, 'businessType', p_business_type, 'businessId', p_business_id)
      );
    end loop;
  end if;
  return v_link_id;
end $$;

revoke all on function public.pm_link_project_org_responsible(uuid, uuid, text, uuid, text, uuid, uuid, boolean) from public, anon;
grant execute on function public.pm_link_project_org_responsible(uuid, uuid, text, uuid, text, uuid, uuid, boolean) to authenticated;

-- WBS work-scope domain. Apply directly through Supabase MCP; this file is reviewed source.
create table if not exists public.pm_wbs_version (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.mdm_project(id) on delete restrict,
  version_no integer not null check (version_no > 0), status text not null default 'draft' check (status in ('draft','submitted','approved','rejected','cancelled','superseded')),
  title text not null check (btrim(title) <> ''), change_note text, source_version_id uuid references public.pm_wbs_version(id) on delete restrict,
  snapshot jsonb not null default '{}'::jsonb, baseline_at timestamptz, baseline_by uuid, submitted_at timestamptz, submitted_by uuid,
  decided_at timestamptz, decided_by uuid, decision_note text, workflow_instance_id uuid references public.wf_instance(id) on delete set null,
  create_by text default coalesce(auth.uid()::text,'system'), create_time timestamptz not null default now(), update_by text, update_time timestamptz not null default now(), unique(project_id, version_no)
);
create unique index if not exists pm_wbs_one_active_version on public.pm_wbs_version(project_id) where status in ('draft','submitted');

create table if not exists public.pm_wbs_node (
  id uuid primary key default gen_random_uuid(), version_id uuid not null references public.pm_wbs_version(id) on delete cascade,
  parent_id uuid references public.pm_wbs_node(id) on delete restrict, sort_order integer not null default 0,
  wbs_code text not null, custom_code text, name text not null check (btrim(name) <> ''), description text, deliverable_summary text,
  quantity numeric, unit text, planned_quantity numeric, budget_cost numeric, responsible_department text, responsible_person text,
  quality_standard text, is_milestone boolean not null default false, status text not null default 'active' check (status in ('active','disabled','archived')),
  metadata jsonb not null default '{}'::jsonb, create_by text default coalesce(auth.uid()::text,'system'), create_time timestamptz not null default now(), update_by text, update_time timestamptz not null default now(),
  unique(version_id, wbs_code)
);
create table if not exists public.pm_wbs_deliverable (
  id uuid primary key default gen_random_uuid(), node_id uuid not null references public.pm_wbs_node(id) on delete restrict,
  name text not null check (btrim(name) <> ''), deliverable_type text, acceptance_criteria text, responsible_person text,
  status text not null default 'planned' check (status in ('planned','in_progress','accepted','cancelled')), attachment_id uuid references public.sys_attachment(id) on delete restrict,
  create_by text default coalesce(auth.uid()::text,'system'), create_time timestamptz not null default now(), update_by text, update_time timestamptz not null default now()
);
create table if not exists public.pm_wbs_scope_boundary (
  id uuid primary key default gen_random_uuid(), version_id uuid not null references public.pm_wbs_version(id) on delete cascade,
  boundary_type text not null check (boundary_type in ('included','excluded')), content text not null check (btrim(content) <> ''), basis text, sort_order integer not null default 0,
  create_by text default coalesce(auth.uid()::text,'system'), create_time timestamptz not null default now(), update_by text, update_time timestamptz not null default now()
);
create table if not exists public.pm_wbs_template (
  id uuid primary key default gen_random_uuid(), name text not null unique, category text not null, description text, enabled boolean not null default true, node_count integer not null default 0,
  create_by text default 'system', create_time timestamptz not null default now(), update_by text, update_time timestamptz not null default now()
);
create table if not exists public.pm_wbs_template_node (
  id uuid primary key default gen_random_uuid(), template_id uuid not null references public.pm_wbs_template(id) on delete cascade, parent_id uuid references public.pm_wbs_template_node(id) on delete restrict,
  sort_order integer not null default 0, wbs_code text not null, name text not null, description text, deliverable_summary text, unit text, quality_standard text, is_milestone boolean not null default false, metadata jsonb not null default '{}'::jsonb,
  unique(template_id, wbs_code)
);
create table if not exists public.pm_wbs_version_diff (
  id uuid primary key default gen_random_uuid(), source_version_id uuid not null references public.pm_wbs_version(id) on delete restrict, target_version_id uuid not null references public.pm_wbs_version(id) on delete cascade,
  summary text not null default '', added_nodes jsonb not null default '[]'::jsonb, removed_nodes jsonb not null default '[]'::jsonb, changed_nodes jsonb not null default '[]'::jsonb, create_by text default coalesce(auth.uid()::text,'system'), create_time timestamptz not null default now(), unique(source_version_id,target_version_id)
);
create table if not exists public.pm_wbs_business_link (
  id uuid primary key default gen_random_uuid(), wbs_node_id uuid not null references public.pm_wbs_node(id) on delete restrict,
  business_type text not null check (business_type in ('schedule_task','resource_plan','quality_check','site_visa','measurement','actual_cost')), business_id uuid not null, link_role text not null default 'related', status text not null default 'active' check (status in ('active','ended')),
  create_by text default coalesce(auth.uid()::text,'system'), create_time timestamptz not null default now(), update_by text, update_time timestamptz not null default now(), unique(wbs_node_id,business_type,business_id,link_role)
);
create index if not exists pm_wbs_node_version_idx on public.pm_wbs_node(version_id,parent_id,sort_order);
create index if not exists pm_wbs_link_node_idx on public.pm_wbs_business_link(wbs_node_id,business_type,status);

do $$ declare t text; perm text; begin
  foreach t in array array['pm_wbs_version','pm_wbs_node','pm_wbs_deliverable','pm_wbs_scope_boundary','pm_wbs_template','pm_wbs_template_node','pm_wbs_version_diff','pm_wbs_business_link'] loop
    perm := case when t='pm_wbs_version' then 'PmWbs:ManageVersion' when t='pm_wbs_node' then 'PmWbs:Edit' when t='pm_wbs_deliverable' then 'PmWbs:ManageDeliverable' when t='pm_wbs_scope_boundary' then 'PmWbs:ManageScope' when t in ('pm_wbs_template','pm_wbs_template_node') then 'PmWbs:ManageTemplate' else 'PmWbs:LinkBusiness' end;
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists pm_wbs_read on public.%I',t);
    execute format('drop policy if exists pm_wbs_write on public.%I',t);
    execute format('create policy pm_wbs_read on public.%I for select to authenticated using ((select app_private.has_permission(''PmWbs:View'')) or (select app_private.is_platform_super()))',t);
    execute format('create policy pm_wbs_write on public.%I for all to authenticated using ((select app_private.has_permission(''%s'')) or (select app_private.is_platform_super())) with check ((select app_private.has_permission(''%s'')) or (select app_private.is_platform_super()))',t,perm,perm);
    execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  end loop;
end $$;

create or replace function public.pm_list_wbs_workspace(p_project_id uuid, p_version_id uuid default null) returns jsonb language sql security invoker stable set search_path=public,app_private,pg_catalog as $$
  select jsonb_build_object(
    'version',(select to_jsonb(v) from public.pm_wbs_version v where v.project_id=p_project_id and (p_version_id is null or v.id=p_version_id) order by v.version_no desc limit 1),
    'nodes',coalesce((select jsonb_agg(to_jsonb(n) order by n.sort_order,n.wbs_code) from public.pm_wbs_node n join public.pm_wbs_version v on v.id=n.version_id where v.project_id=p_project_id and (p_version_id is null or v.id=p_version_id)),'[]'::jsonb),
    'deliverables',coalesce((select jsonb_agg(to_jsonb(d) order by d.create_time) from public.pm_wbs_deliverable d join public.pm_wbs_node n on n.id=d.node_id join public.pm_wbs_version v on v.id=n.version_id where v.project_id=p_project_id and (p_version_id is null or v.id=p_version_id)),'[]'::jsonb),
    'boundaries',coalesce((select jsonb_agg(to_jsonb(b) order by b.boundary_type,b.sort_order) from public.pm_wbs_scope_boundary b join public.pm_wbs_version v on v.id=b.version_id where v.project_id=p_project_id and (p_version_id is null or v.id=p_version_id)),'[]'::jsonb),
    'links',coalesce((select jsonb_agg(to_jsonb(l)) from public.pm_wbs_business_link l join public.pm_wbs_node n on n.id=l.wbs_node_id join public.pm_wbs_version v on v.id=n.version_id where v.project_id=p_project_id and (p_version_id is null or v.id=p_version_id) and l.status='active'),'[]'::jsonb)
  );
$$;

create or replace function public.pm_create_wbs_version(p_project_id uuid,p_title text,p_change_note text default null) returns public.pm_wbs_version language plpgsql security invoker set search_path=public,app_private,pg_catalog as $$
declare v public.pm_wbs_version; source public.pm_wbs_version; n public.pm_wbs_node; new_id uuid; begin
  if not ((select app_private.has_permission('PmWbs:ManageVersion')) or (select app_private.is_platform_super())) then raise exception '当前账号没有管理 WBS 版本的权限' using errcode='42501'; end if;
  if exists(select 1 from public.pm_wbs_version where project_id=p_project_id and status in ('draft','submitted')) then select * into v from public.pm_wbs_version where project_id=p_project_id and status in ('draft','submitted') order by version_no desc limit 1; return v; end if;
  select * into source from public.pm_wbs_version where project_id=p_project_id and status='approved' order by version_no desc limit 1;
  insert into public.pm_wbs_version(project_id,version_no,title,change_note,source_version_id) values(p_project_id,coalesce((select max(version_no)+1 from public.pm_wbs_version where project_id=p_project_id),1),p_title,p_change_note,source.id) returning * into v;
  if source.id is not null then for n in select * from public.pm_wbs_node where version_id=source.id loop new_id:=gen_random_uuid(); insert into public.pm_wbs_node select new_id,v.id,parent_id,sort_order,wbs_code,custom_code,name,description,deliverable_summary,quantity,unit,planned_quantity,budget_cost,responsible_department,responsible_person,quality_standard,is_milestone,status,metadata,auth.uid()::text,now(),auth.uid()::text,now() from public.pm_wbs_node where id=n.id; end loop; end if;
  return v;
end $$;

create or replace function public.pm_save_wbs_nodes(p_nodes jsonb) returns setof public.pm_wbs_node language plpgsql security invoker set search_path=public,app_private,pg_catalog as $$
declare item jsonb; v public.pm_wbs_version; result public.pm_wbs_node; begin
  for item in select * from jsonb_array_elements(p_nodes) loop
    select * into v from public.pm_wbs_version where id=(item->>'version_id')::uuid;
    if v.status <> 'draft' then raise exception '已提交或批准的 WBS 版本不可编辑' using errcode='55000'; end if;
    insert into public.pm_wbs_node(id,version_id,parent_id,sort_order,wbs_code,custom_code,name,description,deliverable_summary,quantity,unit,planned_quantity,budget_cost,responsible_department,responsible_person,quality_standard,is_milestone,status,metadata,update_by,update_time)
    values(coalesce((item->>'id')::uuid,gen_random_uuid()),v.id,nullif(item->>'parent_id','')::uuid,coalesce((item->>'sort_order')::int,0),item->>'wbs_code',nullif(item->>'custom_code',''),item->>'name',nullif(item->>'description',''),nullif(item->>'deliverable_summary',''),nullif(item->>'quantity','')::numeric,nullif(item->>'unit',''),nullif(item->>'planned_quantity','')::numeric,nullif(item->>'budget_cost','')::numeric,nullif(item->>'responsible_department',''),nullif(item->>'responsible_person',''),nullif(item->>'quality_standard',''),coalesce((item->>'is_milestone')::boolean,false),coalesce(nullif(item->>'status',''),'active'),coalesce(item->'metadata','{}'::jsonb),auth.uid()::text,now())
    on conflict(id) do update set parent_id=excluded.parent_id,sort_order=excluded.sort_order,wbs_code=excluded.wbs_code,custom_code=excluded.custom_code,name=excluded.name,description=excluded.description,deliverable_summary=excluded.deliverable_summary,quantity=excluded.quantity,unit=excluded.unit,planned_quantity=excluded.planned_quantity,budget_cost=excluded.budget_cost,responsible_department=excluded.responsible_department,responsible_person=excluded.responsible_person,quality_standard=excluded.quality_standard,is_milestone=excluded.is_milestone,status=excluded.status,metadata=excluded.metadata,update_by=auth.uid()::text,update_time=now() returning * into result;
    return next result;
  end loop; return;
end $$;

create or replace function public.pm_transition_wbs(p_version_id uuid,p_action text,p_note text default null) returns public.pm_wbs_version language plpgsql security invoker set search_path=public,app_private,pg_catalog as $$
declare v public.pm_wbs_version; begin select * into v from public.pm_wbs_version where id=p_version_id for update; if not found then raise exception 'WBS 版本不存在' using errcode='P0002'; end if;
  if p_action='submit' and v.status='draft' and ((select app_private.has_permission('PmWbs:Submit')) or (select app_private.is_platform_super())) then update public.pm_wbs_version set status='submitted',submitted_at=now(),submitted_by=auth.uid(),update_time=now() where id=v.id returning * into v;
  elsif p_action='approve' and v.status='submitted' and ((select app_private.has_permission('PmWbs:Approve')) or (select app_private.is_platform_super())) then update public.pm_wbs_version set status='superseded',update_time=now() where project_id=v.project_id and status='approved'; update public.pm_wbs_version set status='approved',baseline_at=now(),baseline_by=auth.uid(),decided_at=now(),decided_by=auth.uid(),decision_note=p_note,update_time=now() where id=v.id returning * into v;
  elsif p_action='reject' and v.status='submitted' and ((select app_private.has_permission('PmWbs:Reject')) or (select app_private.is_platform_super())) then update public.pm_wbs_version set status='rejected',decided_at=now(),decided_by=auth.uid(),decision_note=p_note,update_time=now() where id=v.id returning * into v;
  elsif p_action='cancel' and v.status in ('draft','submitted') then update public.pm_wbs_version set status='cancelled',decision_note=p_note,update_time=now() where id=v.id returning * into v;
  else raise exception 'WBS 版本当前状态不支持此操作' using errcode='P0001'; end if; return v; end $$;

create or replace function public.pm_copy_wbs_template(p_project_id uuid,p_version_id uuid,p_template_id uuid) returns integer language plpgsql security invoker set search_path=public,app_private,pg_catalog as $$
declare t record; v public.pm_wbs_version; count integer:=0; begin select * into v from public.pm_wbs_version where id=p_version_id and project_id=p_project_id; if v.status<>'draft' then raise exception '只有草稿版本可复制模板' using errcode='55000'; end if; for t in select * from public.pm_wbs_template_node where template_id=p_template_id order by sort_order loop insert into public.pm_wbs_node(version_id,parent_id,sort_order,wbs_code,name,description,deliverable_summary,unit,quality_standard,is_milestone,metadata) values(p_version_id,null,t.sort_order,t.wbs_code,t.name,t.description,t.deliverable_summary,t.unit,t.quality_standard,t.is_milestone,t.metadata); count:=count+1; end loop; return count; end $$;

create or replace function public.pm_link_wbs_business(p_wbs_node_id uuid,p_business_type text,p_business_id uuid,p_link_role text default 'related') returns uuid language plpgsql security invoker set search_path=public,app_private,pg_catalog as $$ declare id uuid; begin if not ((select app_private.has_permission('PmWbs:LinkBusiness')) or (select app_private.is_platform_super())) then raise exception '当前账号没有关联 WBS 业务的权限' using errcode='42501'; end if; insert into public.pm_wbs_business_link(wbs_node_id,business_type,business_id,link_role) values(p_wbs_node_id,p_business_type,p_business_id,p_link_role) on conflict(wbs_node_id,business_type,business_id,link_role) do update set status='active',update_time=now() returning pm_wbs_business_link.id into id; return id; end $$;

revoke all on function public.pm_list_wbs_workspace(uuid,uuid) from public,anon; grant execute on function public.pm_list_wbs_workspace(uuid,uuid) to authenticated;
revoke all on function public.pm_create_wbs_version(uuid,text,text) from public,anon; grant execute on function public.pm_create_wbs_version(uuid,text,text) to authenticated;
revoke all on function public.pm_save_wbs_nodes(jsonb) from public,anon; grant execute on function public.pm_save_wbs_nodes(jsonb) to authenticated;
revoke all on function public.pm_transition_wbs(uuid,text,text) from public,anon; grant execute on function public.pm_transition_wbs(uuid,text,text) to authenticated;
revoke all on function public.pm_copy_wbs_template(uuid,uuid,uuid) from public,anon; grant execute on function public.pm_copy_wbs_template(uuid,uuid,uuid) to authenticated;
revoke all on function public.pm_link_wbs_business(uuid,text,uuid,text) from public,anon; grant execute on function public.pm_link_wbs_business(uuid,text,uuid,text) to authenticated;

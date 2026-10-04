-- 用户迁移结果核对（在 psql 里执行）
select 'auth_users' as item, count(*)::text as value from auth.users
union all select 'auth_identities', count(*)::text from auth.identities
union all select 'sys_user', count(*)::text from public.sys_user
union all select 'sys_user_tenant', count(*)::text from public.sys_user_tenant
union all select 'tenants', count(*)::text from public.sys_tenant
union all select 'orgs', count(*)::text from public.mdm_organization
union all select 'roles', count(*)::text from public.sys_role
union all select 'role_menu_grants', count(*)::text from public.sys_role_menu
union all select 'employees', count(*)::text from public.mdm_employee
union all select 'positions', count(*)::text from public.mdm_position
union all select 'job_profiles', count(*)::text from public.mdm_job_profile
union all select 'grades', count(*)::text from public.mdm_grade
union all select 'job_families', count(*)::text from public.mdm_job_family
order by 1;

\echo '=== 超管账号关联与授权 ==='
select u.user_email,
       t.tenant_code,
       u.user_roles::text as role_codes,
       (u.auth_user_id = a.id) as auth_linked,
       (select count(*) from public.sys_user_tenant m where m.user_id = u.id) as memberships,
       (select count(*) from public.sys_role_menu rm
          join public.sys_role r on r.id = rm.role_id
          join public.sys_menu mn on mn.id = rm.menu_id
         where r.role_code = any(u.user_roles) and r.tenant_id = u.tenant_id and mn.type = 'menu') as granted_pages
  from public.sys_user u
  join public.sys_tenant t on t.id = u.tenant_id
  left join auth.users a on lower(a.email) = lower(u.user_email)
 where u.user_email in ('869123771@qq.com', '624944977@qq.com')
 order by 1;

\echo '=== 数据不变量复核 ==='
select 'org_leader_cross_tenant' as check_name, count(*)::text as violations
  from public.mdm_organization o
 where o.leader_user_id is not null
   and not exists (select 1 from public.sys_user u where u.id = o.leader_user_id and u.tenant_id = o.tenant_id)
union all
select 'user_org_cross_tenant', count(*)::text
  from public.sys_user u
 where u.organization_id is not null
   and not exists (select 1 from public.mdm_organization o where o.id = u.organization_id and o.tenant_id = u.tenant_id)
union all
select 'employee_creator_cross_tenant', count(*)::text
  from public.mdm_employee e
 where e.created_by_user_id is not null
   and not exists (select 1 from public.sys_user u where u.id = e.created_by_user_id and u.tenant_id = e.tenant_id)
union all
select 'user_without_auth_account', count(*)::text
  from public.sys_user u
 where not exists (select 1 from auth.users a where lower(a.email) = lower(u.user_email))
union all
select 'membership_without_role', count(*)::text
  from public.sys_user_tenant m
 where cardinality(m.role_codes) = 0
order by 1;

\echo '=== 各租户用户数 ==='
select t.tenant_code, count(u.id)::text as users
  from public.sys_tenant t left join public.sys_user u on u.tenant_id = t.id
 group by 1 order by 1;

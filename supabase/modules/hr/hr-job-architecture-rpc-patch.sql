-- ===========================================================================
-- 职务体系（HrJobArchitecture）RPC 补丁
--
-- 症状：打开「人事管理 → 职务体系」页面时网络面板报
--       POST /rest/v1/rpc/hr_list_job_profiles_secure 404 (Not Found)，
--       标准职务 / 职族 / 职级三个页签都取不到数据。
--
-- 原因：页面（src/views/personnel/job-architecture）与弹窗调用的 6 个 RPC
--       （3 个列表 + 3 个保存）从未在数据库里创建，PostgREST 找不到函数即返回 404；
--       同域的 hr_list_job_architecture_options_secure 与
--       hr_delete_job_architecture_record_secure 已经存在，因此页面能打开、列表全挂。
--
-- 内容：app_private 共享实现 2 个（列表分页查询、保存校验与写入各一个）
--       + public 业务 RPC 6 个 + 显式 EXECUTE 授权。
--
-- 权限：列表按页签校验 Hr:JobFamily:View / Hr:Grade:View / Hr:JobProfile:View；
--       保存按新增或编辑校验 Hr:JobFamily|Grade|JobProfile 的 Add / Edit。
--       与页面按钮权限、hr-data.sql 种入的按钮菜单一致，也沿用同域
--       hr_delete_job_architecture_record_secure 的校验方式。
--
-- 幂等：整段包在事务里，全部 CREATE OR REPLACE + REVOKE / GRANT，可重复执行。
--
-- 应用方式：supabase db query --linked --file supabase/modules/hr/hr-job-architecture-rpc-patch.sql
-- ===========================================================================

SET statement_timeout = 0;
SET lock_timeout = 0;
SET check_function_bodies = false;

begin;

-- ---------------------------------------------------------------------------
-- 列表：职族 / 职级 / 标准职务（分页 + 关键字 + 启用状态）
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_private.hr_list_job_architecture_records_internal(
  p_kind text,
  p_from integer,
  p_to integer,
  p_keyword text,
  p_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_permission text;
  v_keyword text := nullif(btrim(coalesce(p_keyword, '')), '');
  v_offset integer := greatest(coalesce(p_from, 0), 0);
  v_limit integer;
  v_result jsonb;
begin
  v_permission := case p_kind
    when 'family' then 'Hr:JobFamily:View'
    when 'grade' then 'Hr:Grade:View'
    when 'profile' then 'Hr:JobProfile:View'
    else null
  end;
  if v_permission is null then
    raise exception '不支持的职务体系记录类型' using errcode = '23514';
  end if;
  if not app_private.can_execute_business_action('HrJobArchitecture', v_permission, null, false) then
    raise exception '当前账号没有查看职务体系的权限' using errcode = '42501';
  end if;

  v_limit := least(2000, greatest(coalesce(p_to, 19) - v_offset + 1, 1));

  if p_kind = 'family' then
    v_result := (
      with filtered as materialized (
        select
          family_row.*,
          (
            select count(*)
            from public.mdm_job_profile profile_row
            where profile_row.family_id = family_row.id
          ) as job_profile_count
        from public.mdm_job_family family_row
        where true
          and (p_enabled is null or family_row.enabled = p_enabled)
          and (
            v_keyword is null
            or family_row.family_code ilike '%' || v_keyword || '%'
            or family_row.family_name ilike '%' || v_keyword || '%'
            or family_row.description ilike '%' || v_keyword || '%'
          )
      ),
      paged as (
        select *
        from filtered
        order by sort, family_name
        offset v_offset
        limit v_limit
      )
      select jsonb_build_object(
        'records', coalesce(
          (
            select jsonb_agg(to_jsonb(paged) order by paged.sort, paged.family_name)
            from paged
          ),
          '[]'::jsonb
        ),
        'total', (select count(*) from filtered)
      )
    );
    return v_result;
  end if;

  if p_kind = 'grade' then
    v_result := (
      with filtered as materialized (
        select
          grade_row.*,
          (
            select count(*)
            from public.mdm_job_profile profile_row
            where profile_row.default_grade_id = grade_row.id
          ) as job_profile_count
        from public.mdm_grade grade_row
        where true
          and (p_enabled is null or grade_row.enabled = p_enabled)
          and (
            v_keyword is null
            or grade_row.grade_code ilike '%' || v_keyword || '%'
            or grade_row.grade_name ilike '%' || v_keyword || '%'
            or grade_row.description ilike '%' || v_keyword || '%'
          )
      ),
      paged as (
        select *
        from filtered
        order by sort, grade_level, grade_name
        offset v_offset
        limit v_limit
      )
      select jsonb_build_object(
        'records', coalesce(
          (
            select jsonb_agg(to_jsonb(paged) order by paged.sort, paged.grade_level, paged.grade_name)
            from paged
          ),
          '[]'::jsonb
        ),
        'total', (select count(*) from filtered)
      )
    );
    return v_result;
  end if;

  v_result := (
    with filtered as materialized (
      select
        profile_row.*,
        family_row.family_code,
        family_row.family_name,
        grade_row.grade_code,
        grade_row.grade_name,
        (
          select count(*)
          from public.mdm_position position_row
          where position_row.job_profile_id = profile_row.id
        ) as position_count
      from public.mdm_job_profile profile_row
      join public.mdm_job_family family_row
        on family_row.id = profile_row.family_id
      left join public.mdm_grade grade_row
        on grade_row.id = profile_row.default_grade_id
      where true
        and (p_enabled is null or profile_row.enabled = p_enabled)
        and (
          v_keyword is null
          or profile_row.job_code ilike '%' || v_keyword || '%'
          or profile_row.job_name ilike '%' || v_keyword || '%'
          or profile_row.responsibilities ilike '%' || v_keyword || '%'
          or profile_row.requirements ilike '%' || v_keyword || '%'
          or profile_row.description ilike '%' || v_keyword || '%'
          or family_row.family_name ilike '%' || v_keyword || '%'
        )
    ),
    paged as (
      select *
      from filtered
      order by sort, job_name
      offset v_offset
      limit v_limit
    )
    select jsonb_build_object(
      'records', coalesce(
        (
          select jsonb_agg(
            (to_jsonb(paged) - 'family_code' - 'family_name' - 'grade_code' - 'grade_name')
            || jsonb_build_object(
              'family', jsonb_build_object(
                'id', paged.family_id,
                'family_code', paged.family_code,
                'family_name', paged.family_name
              ),
              'default_grade', case
                when paged.default_grade_id is null then null
                else jsonb_build_object(
                  'id', paged.default_grade_id,
                  'grade_code', paged.grade_code,
                  'grade_name', paged.grade_name
                )
              end
            )
            order by paged.sort, paged.job_name
          )
          from paged
        ),
        '[]'::jsonb
      ),
      'total', (select count(*) from filtered)
    )
  );
  return v_result;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 保存：职族 / 职级 / 标准职务（新增或编辑）
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_private.hr_save_job_architecture_record_internal(
  p_kind text,
  p_id uuid,
  p_payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_permission text;
  v_code text;
  v_name text;
  v_enabled boolean := (p_payload ->> 'enabled')::boolean;
  v_sort integer := (p_payload ->> 'sort')::integer;
  v_description text := nullif(btrim(coalesce(p_payload ->> 'description', '')), '');
  v_level integer;
  v_family_id uuid;
  v_grade_id uuid;
  v_id uuid;
begin
  v_permission := case p_kind
    when 'family' then case when p_id is null then 'Hr:JobFamily:Add' else 'Hr:JobFamily:Edit' end
    when 'grade' then case when p_id is null then 'Hr:Grade:Add' else 'Hr:Grade:Edit' end
    when 'profile' then case when p_id is null then 'Hr:JobProfile:Add' else 'Hr:JobProfile:Edit' end
    else null
  end;
  if v_permission is null then
    raise exception '不支持的职务体系记录类型' using errcode = '23514';
  end if;
  if not app_private.can_execute_business_action('HrJobArchitecture', v_permission, null, false) then
    raise exception '当前账号没有维护职务体系的权限' using errcode = '42501';
  end if;

  if p_kind = 'family' then
    v_code := upper(btrim(coalesce(p_payload ->> 'family_code', '')));
    v_name := btrim(coalesce(p_payload ->> 'family_name', ''));
    if v_code = '' then raise exception '请输入职族编码' using errcode = '23514'; end if;
    if v_name = '' then raise exception '请输入职族名称' using errcode = '23514'; end if;

    if p_id is null then
      insert into public.mdm_job_family(family_code, family_name, enabled, sort, description)
      values (v_code, v_name, coalesce(v_enabled, true), coalesce(v_sort, 0), v_description)
      returning id into v_id;
    else
      update public.mdm_job_family
      set family_code = v_code,
          family_name = v_name,
          enabled = coalesce(v_enabled, enabled),
          sort = coalesce(v_sort, sort),
          description = v_description
      where id = p_id;
      if not found then raise exception '职族记录不存在或无权维护'; end if;
      v_id := p_id;
    end if;
    return v_id;
  end if;

  if p_kind = 'grade' then
    v_code := upper(btrim(coalesce(p_payload ->> 'grade_code', '')));
    v_name := btrim(coalesce(p_payload ->> 'grade_name', ''));
    v_level := coalesce((p_payload ->> 'grade_level')::integer, 1);
    if v_code = '' then raise exception '请输入职级编码' using errcode = '23514'; end if;
    if v_name = '' then raise exception '请输入职级名称' using errcode = '23514'; end if;
    if v_level < 1 then raise exception '层级值必须大于等于 1' using errcode = '23514'; end if;

    if p_id is null then
      insert into public.mdm_grade(grade_code, grade_name, grade_level, enabled, sort, description)
      values (v_code, v_name, v_level, coalesce(v_enabled, true), coalesce(v_sort, 0), v_description)
      returning id into v_id;
    else
      update public.mdm_grade
      set grade_code = v_code,
          grade_name = v_name,
          grade_level = v_level,
          enabled = coalesce(v_enabled, enabled),
          sort = coalesce(v_sort, sort),
          description = v_description
      where id = p_id;
      if not found then raise exception '职级记录不存在或无权维护'; end if;
      v_id := p_id;
    end if;
    return v_id;
  end if;

  v_code := upper(btrim(coalesce(p_payload ->> 'job_code', '')));
  v_name := btrim(coalesce(p_payload ->> 'job_name', ''));
  v_family_id := nullif(btrim(coalesce(p_payload ->> 'family_id', '')), '')::uuid;
  v_grade_id := nullif(btrim(coalesce(p_payload ->> 'default_grade_id', '')), '')::uuid;
  if v_code = '' then raise exception '请输入职务编码' using errcode = '23514'; end if;
  if v_name = '' then raise exception '请输入职务名称' using errcode = '23514'; end if;
  if v_family_id is null then raise exception '请选择所属职族' using errcode = '23514'; end if;
  if not exists (
    select 1 from public.mdm_job_family where id = v_family_id and enabled
  ) then
    raise exception '所选职族不存在或已停用' using errcode = '23514';
  end if;
  if v_grade_id is not null and not exists (
    select 1 from public.mdm_grade where id = v_grade_id and enabled
  ) then
    raise exception '所选职级不存在或已停用' using errcode = '23514';
  end if;

  if p_id is null then
    insert into public.mdm_job_profile(
      family_id, default_grade_id, job_code, job_name, enabled, sort,
      responsibilities, requirements, description
    )
    values (
      v_family_id, v_grade_id, v_code, v_name, coalesce(v_enabled, true), coalesce(v_sort, 0),
      nullif(btrim(coalesce(p_payload ->> 'responsibilities', '')), ''),
      nullif(btrim(coalesce(p_payload ->> 'requirements', '')), ''),
      v_description
    )
    returning id into v_id;
  else
    update public.mdm_job_profile
    set family_id = v_family_id,
        default_grade_id = v_grade_id,
        job_code = v_code,
        job_name = v_name,
        enabled = coalesce(v_enabled, enabled),
        sort = coalesce(v_sort, sort),
        responsibilities = nullif(btrim(coalesce(p_payload ->> 'responsibilities', '')), ''),
        requirements = nullif(btrim(coalesce(p_payload ->> 'requirements', '')), ''),
        description = v_description
    where id = p_id;
    if not found then raise exception '标准职务记录不存在或无权维护'; end if;
    v_id := p_id;
  end if;
  return v_id;
exception
  when unique_violation then
    if p_kind = 'family' then raise exception '职族编码或名称已存在' using errcode = '23505';
    elsif p_kind = 'grade' then raise exception '职级编码或名称已存在' using errcode = '23505';
    else raise exception '职务编码或名称已存在' using errcode = '23505';
    end if;
end;
$function$;

-- ---------------------------------------------------------------------------
-- public 业务 RPC：列表
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.hr_list_job_families_secure(
  p_from integer DEFAULT 0,
  p_to integer DEFAULT 19,
  p_keyword text DEFAULT NULL,
  p_enabled boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  select app_private.hr_list_job_architecture_records_internal(
    'family', p_from, p_to, p_keyword, p_enabled)
$function$;

CREATE OR REPLACE FUNCTION public.hr_list_grades_secure(
  p_from integer DEFAULT 0,
  p_to integer DEFAULT 19,
  p_keyword text DEFAULT NULL,
  p_enabled boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  select app_private.hr_list_job_architecture_records_internal(
    'grade', p_from, p_to, p_keyword, p_enabled)
$function$;

CREATE OR REPLACE FUNCTION public.hr_list_job_profiles_secure(
  p_from integer DEFAULT 0,
  p_to integer DEFAULT 19,
  p_keyword text DEFAULT NULL,
  p_enabled boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  select app_private.hr_list_job_architecture_records_internal(
    'profile', p_from, p_to, p_keyword, p_enabled)
$function$;

-- ---------------------------------------------------------------------------
-- public 业务 RPC：保存
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.hr_save_job_family_secure(
  p_id uuid DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  select app_private.hr_save_job_architecture_record_internal('family', p_id, p_payload)
$function$;

CREATE OR REPLACE FUNCTION public.hr_save_grade_secure(
  p_id uuid DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  select app_private.hr_save_job_architecture_record_internal('grade', p_id, p_payload)
$function$;

CREATE OR REPLACE FUNCTION public.hr_save_job_profile_secure(
  p_id uuid DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  select app_private.hr_save_job_architecture_record_internal('profile', p_id, p_payload)
$function$;

-- ---------------------------------------------------------------------------
-- 授权：内部实现不对客户端角色开放；业务 RPC 只显式授予 authenticated / service_role
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION app_private.hr_list_job_architecture_records_internal(text, integer, integer, text, boolean) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.hr_save_job_architecture_record_internal(text, uuid, jsonb) FROM public, anon, authenticated;

REVOKE ALL ON FUNCTION public.hr_list_job_families_secure(integer, integer, text, boolean) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_list_grades_secure(integer, integer, text, boolean) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_list_job_profiles_secure(integer, integer, text, boolean) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_save_job_family_secure(uuid, jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_save_grade_secure(uuid, jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_save_job_profile_secure(uuid, jsonb) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.hr_list_job_families_secure(integer, integer, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_list_grades_secure(integer, integer, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_list_job_profiles_secure(integer, integer, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_save_job_family_secure(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_save_grade_secure(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_save_job_profile_secure(uuid, jsonb) TO authenticated, service_role;

commit;

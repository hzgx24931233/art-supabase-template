-- 增量补丁：恢复字段权限页依赖的 inheritedAccess（继承等级）
--
-- 现象：打开「字段权限」页控制台报
--   TypeError: Cannot read properties of undefined (reading 'label')
--   位置：src/views/system/field-permission/index.vue 的 accessLabel（accessMeta[value].label）
-- 原因：平台去多租户重写后，get_field_permission_configuration 只返回 defaultAccess 与 explicitAccess，
--   而页面按 inheritedAccess 渲染「继承角色（等级）」与「当前生效」；字段缺失时访问
--   accessMeta[undefined].label 会直接中断整页渲染。
-- 语义（与 app_private.resolve_field_access 保持一致）：
--   角色授权：继承等级 = 平台默认等级（sys_permission_field.default_access）
--   人员例外：继承等级 = 该用户全部启用角色在该字段上的最高等级，无角色授权时回退平台默认等级
-- 幂等：整段为 create or replace，可重复执行；函数属主与 ACL 保持不变。
--
-- 前端已按平台默认等级兜底渲染，因此不执行本补丁页面也能打开；
-- 执行后人员例外的「继承角色 / 当前生效」才反映服务端按角色合并后的真实等级。

create or replace function public.get_field_permission_configuration(
  p_resource_key text,
  p_subject_type text,
  p_subject_id uuid
) returns jsonb
  language plpgsql
  stable security definer
  set search_path to ''
as $$
declare v_resource public.sys_permission_resource%rowtype;
begin
  if not app_private.can_view_field_permissions() then raise exception 'Missing field permission page access'; end if;
  if p_subject_type not in ('role','user') then raise exception 'Invalid permission subject type'; end if;
  select * into v_resource from public.sys_permission_resource where resource_key = p_resource_key and enabled;
  if not found then raise exception 'Permission resource not found'; end if;
  if p_subject_type = 'role' and not exists(select 1 from public.sys_role where id = p_subject_id and enabled) then raise exception 'Role not found or access denied'; end if;
  if p_subject_type = 'user' and not exists(select 1 from public.sys_user where id = p_subject_id and status = '1' and deleted_at is null) then raise exception 'User not found or access denied'; end if;
  return jsonb_build_object(
    'resourceId', v_resource.id,
    'resourceKey', v_resource.resource_key,
    'resourceLabel', v_resource.resource_label,
    'subjectType', p_subject_type,
    'subjectId', p_subject_id,
    'fields', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', f.id,
          'fieldKey', f.field_key,
          'fieldLabel', f.field_label,
          'defaultAccess', f.default_access,
          'maskStrategy', f.mask_strategy,
          'ownerOverrideEnabled', f.owner_override_enabled,
          'inheritedAccess', case
            when p_subject_type = 'user' then coalesce((
              select case max(app_private.permission_access_rank(rp.access_level))
                when 3 then 'edit'
                when 2 then 'read'
                when 1 then 'masked'
                when 0 then 'hidden'
              end
              from public.sys_user u
              join public.sys_role r
                on r.enabled
               and r.role_code = any(coalesce(u.user_roles, array[]::text[]))
              join public.sys_role_field_permission rp
                on rp.role_id = r.id
               and rp.resource_id = v_resource.id
               and rp.field_id = f.id
              where u.id = p_subject_id
                and u.status = '1'
                and u.deleted_at is null
            ), f.default_access)
            else f.default_access
          end,
          'explicitAccess', case
            when p_subject_type = 'role' then (
              select rp.access_level
              from public.sys_role_field_permission rp
              where rp.role_id = p_subject_id
                and rp.resource_id = v_resource.id
                and rp.field_id = f.id
            )
            else (
              select up.access_level
              from public.sys_user_field_permission up
              where up.user_id = p_subject_id
                and up.resource_id = v_resource.id
                and up.field_id = f.id
            )
          end
        )
        order by f.sort, f.id
      )
      from public.sys_permission_field f
      where f.resource_id = v_resource.id
        and f.enabled
        and f.sensitive
    ), '[]'::jsonb)
  );
end;
$$;

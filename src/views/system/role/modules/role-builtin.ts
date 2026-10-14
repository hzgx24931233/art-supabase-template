import { SYSTEM_PARAM_DEFAULTS } from '@/config/system-param-defaults'

type RoleIdentity = Pick<Api.SystemManage.RoleListItem, 'builtinType' | 'roleCode'>

/**
 * `sys_role.builtin_type` is not populated for the shipped super role, so the role code decides as
 * well — the same rule as `app_private.is_platform_super()` and the role-permission server check.
 */
export function isPlatformSuperRole(role: RoleIdentity): boolean {
  return (
    role.builtinType === 'platform_super' ||
    role.roleCode.toUpperCase() === SYSTEM_PARAM_DEFAULTS.SUPER_ROLE_CODE
  )
}

export function isDefaultRegisterRole(role: RoleIdentity): boolean {
  return role.builtinType === 'default_register'
}

export function isBuiltinRole(role: RoleIdentity): boolean {
  return isPlatformSuperRole(role) || isDefaultRegisterRole(role)
}

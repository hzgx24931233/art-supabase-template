/**
 * Runtime identity for the independently deployable applications.
 *
 * Authentication, tenants and RBAC stay in the platform Supabase project. Each
 * frontend declares only its own application code and requests the matching
 * menu tree from the platform contract.
 *
 * 新增业务模块时，在 APPLICATION_CODES 与 APPLICATION_PROFILES 中登记应用档案，
 * 并同步 scripts/hosted-module-dependencies.ts、src/bootstrapHostedApplications.ts、
 * tsconfig.json 与 .gitmodules。
 */
export const APPLICATION_CODES = ['platform', 'fms', 'hr'] as const

export type ApplicationCode = (typeof APPLICATION_CODES)[number]

export interface ApplicationProfile {
  code: ApplicationCode
  name: string
  description: string
  defaultPath: string
  deploymentPath: string
  developmentPort: number
}

export interface ApplicationLocation {
  hostname: string
  origin: string
}

export const APPLICATION_PROFILES: Record<ApplicationCode, ApplicationProfile> = {
  platform: {
    code: 'platform',
    name: '平台管理',
    description: '系统、租户、菜单、权限与数据中心基座',
    defaultPath: '/dashboard',
    deploymentPath: '/',
    developmentPort: 3006
  },
  fms: {
    code: 'fms',
    name: 'FMS财务管理',
    description: '财务管理系统',
    defaultPath: '/fms',
    deploymentPath: '/art-supabase-fms/',
    developmentPort: 3012
  },
  hr: {
    code: 'hr',
    name: 'HR人力资源管理',
    description: '人力资源管理系统',
    defaultPath: '/hr',
    deploymentPath: '/art-supabase-hr/',
    developmentPort: 3013
  }
}

export function resolveApplicationCode(value: string | undefined): ApplicationCode {
  const normalized = value?.trim().toLowerCase()
  return APPLICATION_CODES.includes(normalized as ApplicationCode)
    ? (normalized as ApplicationCode)
    : 'platform'
}

export function resolveApplicationBaseUrl(
  applicationCode: ApplicationCode,
  configuredBaseUrl: string,
  location: ApplicationLocation
): URL {
  const baseUrl = location.hostname.toLowerCase().endsWith('.github.io')
    ? APPLICATION_PROFILES[applicationCode].deploymentPath
    : configuredBaseUrl

  return new URL(baseUrl, location.origin)
}

/**
 * 平台宿主聚合当前用户有权访问的应用；独立子应用始终只加载自己的菜单。
 * 菜单明细仍由数据库按用户角色过滤，这里只确定需要请求的应用范围。
 */
export function resolveHostedApplicationCodes(
  applicationCode: ApplicationCode,
  accessibleApplications: ReadonlyArray<{ code: ApplicationCode }>
): ApplicationCode[] {
  if (applicationCode !== 'platform') return [applicationCode]

  const accessibleCodes = new Set<ApplicationCode>([
    'platform',
    ...accessibleApplications.map((application) => application.code)
  ])
  return APPLICATION_CODES.filter((code) => accessibleCodes.has(code))
}

const runtimeEnv = (import.meta as ImportMeta & { env?: ImportMetaEnv }).env

export const currentApplication = Object.freeze(
  APPLICATION_PROFILES[resolveApplicationCode(runtimeEnv?.VITE_APP_CODE)]
)

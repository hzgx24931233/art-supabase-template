import { expect, type Page } from '@playwright/test'
import { mockApplicationMenus } from './menu-rpc'

/**
 * 用户管理页的端到端夹具：登录、菜单、字典、列表与账号生命周期全部由路由 Mock 提供，
 * 用例不接触真实 Supabase 项目，也不写入任何账号数据。
 * `sync-user` 只记录载荷并据此更新内存行，因此刷新后的列表状态与生产语义一致。
 */

/** Mock 登录账号；密码只用于登录表单，不会发往真实项目。 */
export const systemUserAccount = {
  id: 'system-user-page-auth',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'system-user-page@example.invalid'
}

export const systemUserPassword = 'system-user-page-password'

/** sys_user 行使用库内 snake_case，接口层会统一转换为 camelCase。 */
export interface SystemUserRow {
  id: string
  auth_user_id: string
  user_name: string
  nick_name: string
  user_email: string
  user_phone: string
  user_gender: string
  status: string
  deleted_at: string | null
  user_roles: string[]
  account_identity_type: string
  user_type: string
  remark: string | null
  avatar: string | null
  organization_id: string | null
  organization: Record<string, unknown> | null
  create_by: string
  create_time: string
}

export interface SystemUserFixtureOptions {
  /** 列表初始账号；禁止账号需同时保留 `deleted_at`。 */
  rows: SystemUserRow[]
  /** 当前登录账号自己的 sys_user 记录，用于按 auth_user_id 查询。 */
  selfUser?: Record<string, unknown>
}

export interface SystemUserFixture {
  /** 内存中的账号行，生命周期动作会就地更新，供用例断言。 */
  rows: SystemUserRow[]
  /** 用户列表请求次数，用于断言写入后是否重新加载。 */
  listRequests: number
  /** sync-user 调用载荷，用于断言账号生命周期动作。 */
  syncUserCalls: Array<Record<string, unknown>>
}

/** 账号行工厂：只覆盖用例关心的字段，其余保持与库内一致的默认值。 */
export function createSystemUserRow(row: Partial<SystemUserRow> & { id: string }): SystemUserRow {
  return {
    auth_user_id: `${row.id}-auth`,
    user_name: row.id,
    nick_name: row.id,
    user_email: `${row.id}@example.invalid`,
    user_phone: '13800000000',
    user_gender: '1',
    status: '1',
    deleted_at: null,
    user_roles: [],
    account_identity_type: 'platform',
    user_type: 'platform',
    remark: null,
    avatar: null,
    organization_id: null,
    organization: null,
    create_by: 'system-user-fixture',
    create_time: '2026-09-01T00:00:00+00:00',
    ...row
  }
}

const toBase64Url = (value: string): string => Buffer.from(value).toString('base64url')

// auth-js 只解码 JWT 结构，身份确认走 /auth/v1/user，因此不需要真实签名。
const createSessionToken = (): string => {
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = toBase64Url(
    JSON.stringify({
      sub: systemUserAccount.id,
      aud: systemUserAccount.aud,
      role: systemUserAccount.role,
      email: systemUserAccount.email,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    })
  )
  return `${header}.${payload}.${toBase64Url('system-user-page-signature')}`
}

const buttonMenu = (id: string, name: string, title: string) => ({
  id,
  parentId: 'system-user-menu',
  type: 'button',
  name,
  path: '',
  component: '',
  meta: { title, is_enable: true, is_auth_button: true }
})

interface DictionaryItemOptions {
  typeCode: string
  typeName: string
  value: string
  label: string
  sort: number
  tagType?: string
}

const dictionaryItem = (options: DictionaryItemOptions) => ({
  id: `${options.typeCode}-${options.value}`,
  type_id: `${options.typeCode}-type`,
  code: options.value,
  label: options.label,
  value: options.value,
  status: '1',
  sort: String(options.sort),
  color: '',
  tag_type: options.tagType ?? '',
  remark: '',
  parent_id: null,
  cascade_parent_id: null,
  dict_type_table: { code: options.typeCode, name: options.typeName }
})

/** 用户管理页与账号弹窗用到的字典项，取值与平台字典保持一致。 */
const userPageDictionaryItems = [
  dictionaryItem({
    typeCode: 'status',
    typeName: '状态',
    value: '1',
    label: '启用',
    sort: 1,
    tagType: 'success'
  }),
  dictionaryItem({
    typeCode: 'status',
    typeName: '状态',
    value: '2',
    label: '禁用',
    sort: 2,
    tagType: 'danger'
  }),
  dictionaryItem({ typeCode: 'sex', typeName: '性别', value: '1', label: '男', sort: 1 }),
  dictionaryItem({ typeCode: 'sex', typeName: '性别', value: '2', label: '女', sort: 2 }),
  dictionaryItem({
    typeCode: 'userType',
    typeName: '用户类型',
    value: '1',
    label: '系统用户',
    sort: 1
  }),
  dictionaryItem({
    typeCode: 'userType',
    typeName: '用户类型',
    value: '2',
    label: '普通用户',
    sort: 2
  }),
  dictionaryItem({
    typeCode: 'sysUserIdentityType',
    typeName: '账号身份',
    value: 'employee',
    label: '员工',
    sort: 1,
    tagType: 'success'
  }),
  dictionaryItem({
    typeCode: 'sysUserIdentityType',
    typeName: '账号身份',
    value: 'external',
    label: '外部协作',
    sort: 2,
    tagType: 'info'
  }),
  dictionaryItem({
    typeCode: 'sysUserIdentityType',
    typeName: '账号身份',
    value: 'service',
    label: '服务账号',
    sort: 3,
    tagType: 'warning'
  }),
  dictionaryItem({
    typeCode: 'sysUserIdentityType',
    typeName: '账号身份',
    value: 'platform',
    label: '平台治理',
    sort: 4,
    tagType: 'primary'
  })
]

/** 账号弹窗的所属组织树，用于验证远程选项与组织回填。 */
const organizationRows = [
  {
    id: 'system-user-org-root',
    parent_id: null,
    organization_code: 'HEAD',
    organization_name: '总部',
    organization_type: 'company',
    status: '1',
    sort: 1,
    is_system: true
  },
  {
    id: 'system-user-org-ops',
    parent_id: 'system-user-org-root',
    organization_code: 'OPS',
    organization_name: '运营中心',
    organization_type: 'department',
    status: '1',
    sort: 2,
    is_system: false
  }
]

export async function mockSystemUserPage(
  page: Page,
  options: SystemUserFixtureOptions
): Promise<SystemUserFixture> {
  const fixture: SystemUserFixture = {
    rows: options.rows.map((row) => ({ ...row })),
    listRequests: 0,
    syncUserCalls: []
  }

  await page.route('**/auth/v1/token*', (route) =>
    route.fulfill({
      json: {
        access_token: createSessionToken(),
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'system-user-page-refresh-token',
        user: systemUserAccount
      }
    })
  )
  await page.route('**/auth/v1/user', (route) => route.fulfill({ json: systemUserAccount }))
  await page.route('**/functions/v1/check_user_status', (route) =>
    route.fulfill({ json: { allowed: true } })
  )
  await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: true }))
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'platform', name: '测试平台', baseUrl: '/', sort: 1 }] })
  )
  await mockApplicationMenus(page, {
    platform: [
      {
        id: 'system-user-system',
        parentId: null,
        type: 'folder',
        name: 'System',
        path: '/system',
        component: '/index/index',
        meta: { title: '系统管理', is_enable: true }
      },
      {
        id: 'system-user-menu',
        parentId: 'system-user-system',
        type: 'menu',
        name: 'User',
        path: 'user',
        component: '/system/user',
        meta: { title: '用户管理', is_enable: true },
        children: []
      },
      buttonMenu('system-user-button-add', 'System:User:Add', '新增用户'),
      buttonMenu('system-user-button-edit', 'System:User:Edit', '编辑用户'),
      buttonMenu('system-user-button-enable', 'System:User:Enable', '启用用户'),
      buttonMenu('system-user-button-delete', 'System:User:Delete', '禁止用户'),
      buttonMenu('system-user-button-reset', 'System:User:ResetPassword', '初始化密码')
    ]
  })
  await page.route('**/rest/v1/rpc/get_header_notification_center', (route) =>
    route.fulfill({
      json: {
        notices: [],
        messages: [],
        todos: [],
        unreadNoticeCount: 0,
        unreadMessageCount: 0,
        pendingTodoCount: 0,
        totalUnreadCount: 0
      }
    })
  )
  await page.route('**/rest/v1/ai_ui_design_reference?*', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/sys_menu?*', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/sys_role_menu?*', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/sys_role?*', (route) =>
    route.fulfill({ json: [], headers: { 'content-range': '0-0/1' } })
  )
  await page.route('**/rest/v1/sys_param?*', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/mdm_organization?*', (route) =>
    route.fulfill({ json: organizationRows })
  )
  await page.route('**/rest/v1/rpc/system_list_user_employee_references_secure', (route) =>
    route.fulfill({ json: { records: [] } })
  )
  // 字典全量请求不带类型过滤，按类型补取时带 `dict_type_table.code`，与生产查询一致。
  await page.route('**/rest/v1/sys_dictionary?*', (route) => {
    const requestedCode = new URL(route.request().url()).searchParams.get('dict_type_table.code')
    const code = requestedCode?.replace(/^eq\./, '')
    return route.fulfill({
      json: code
        ? userPageDictionaryItems.filter((item) => item.dict_type_table.code === code)
        : userPageDictionaryItems
    })
  })
  await page.route('**/rest/v1/sys_user?*', (route) => {
    if (new URL(route.request().url()).searchParams.get('auth_user_id')) {
      return route.fulfill({
        json:
          options.selfUser ??
          createSystemUserRow({ id: 'system-user-self', user_email: systemUserAccount.email })
      })
    }
    fixture.listRequests += 1
    return route.fulfill({
      json: fixture.rows,
      headers: { 'content-range': `0-${fixture.rows.length - 1}/${fixture.rows.length}` }
    })
  })
  await page.route('**/functions/v1/sync-user', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    fixture.syncUserCalls.push(body)
    const target = fixture.rows.find((row) => row.id === body.id)

    if (target && body.action === 'activate') {
      target.status = '1'
      target.deleted_at = null
    }
    if (target && body.action === 'deactivate') {
      // 禁止登录能力的同时撤销角色授权，重新启用后需要再次分配。
      target.status = '2'
      target.deleted_at = new Date().toISOString()
      target.user_roles = []
    }
    if (target && body.action === 'hard_delete') {
      fixture.rows = fixture.rows.filter((row) => row.id !== target.id)
    }

    await route.fulfill({
      json: {
        ok: true,
        activated_app_user_id: body.action === 'activate' ? body.id : undefined,
        deleted_app_user_id: body.action === 'hard_delete' ? body.id : undefined,
        auth_user_id: target?.auth_user_id ?? null,
        user_roles: target?.user_roles ?? []
      }
    })
  })

  return fixture
}

/** 通过登录页进入用户管理页，确保权限与菜单走真实前端守卫。 */
export async function signInToSystemUserPage(page: Page): Promise<void> {
  await page.goto('/#/auth/login?redirect=%2Fsystem%2Fuser', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: /^欢迎使用/ })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('textbox', { name: '邮箱或手机号' }).fill(systemUserAccount.email)
  await page.locator('input[name="password"]').fill(systemUserPassword)
  await page.getByRole('button', { name: '登录', exact: true }).click()
}

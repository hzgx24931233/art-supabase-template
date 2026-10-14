import { expect, test, type Locator, type Page } from '@playwright/test'
import { mockApplicationMenus } from './support/menu-rpc'

// 平台库里的内置超管角色没有 builtin_type，只有 role_code；服务端 set_role_menus 也按角色编码
// 拒绝为它分配菜单，所以页面不能再为它提供授权入口。
const roles = [
  {
    id: 'builtin-role-super',
    role_name: 'R_SUPER',
    role_code: 'R_SUPER',
    enabled: true,
    builtin_type: null
  },
  {
    id: 'builtin-role-register',
    role_name: '注册公用',
    role_code: 'R_REGISTER',
    enabled: true,
    builtin_type: 'default_register'
  },
  {
    id: 'builtin-role-auditor',
    role_name: '财务审核员',
    role_code: 'FIN_AUDITOR',
    enabled: true,
    builtin_type: null
  }
]

const menus = [
  {
    id: 'builtin-fixture-root',
    parent_id: null,
    name: 'BuiltinFixture',
    type: 'folder',
    meta: { title: '内置角色测试目录' }
  },
  {
    id: 'builtin-fixture-button',
    parent_id: 'builtin-fixture-root',
    name: 'BuiltinFixture:View',
    type: 'button',
    meta: { title: '查看' }
  }
]

interface PreparedRolePage {
  superRow: Locator
  registerRow: Locator
  auditorRow: Locator
  dialog: Locator
  savedPayloads: unknown[]
  pageErrors: string[]
}

async function prepare(page: Page): Promise<PreparedRolePage> {
  test.setTimeout(90_000)
  const pageErrors: string[] = []
  const savedPayloads: unknown[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.route('**/rest/v1/sys_param?*', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/sys_dictionary?*', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/sys_user?*', (route) =>
    route.fulfill({
      json: {
        id: 'builtin-test-user',
        user_name: '内置角色测试用户',
        user_email: 'builtin@example.invalid',
        status: '1'
      }
    })
  )
  await page.route('**/auth/v1/user', (route) =>
    route.fulfill({
      json: { id: 'builtin-test-auth', aud: 'authenticated', role: 'authenticated' }
    })
  )
  await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: true }))
  await page.route('**/rest/v1/rpc/get_organization_list_secure', (route) =>
    route.fulfill({ json: [] })
  )
  await page.route('**/rest/v1/sys_role?*', (route) =>
    route.fulfill({
      headers: { 'content-range': `0-${roles.length - 1}/${roles.length}` },
      json: roles
    })
  )
  const roleMenu = {
    id: 'permission-page',
    parentId: 'permission-system',
    type: 'menu',
    name: 'Role',
    path: 'role',
    component: '/system/role',
    meta: { title: '角色管理', is_enable: true },
    children: []
  }
  const systemMenu = {
    id: 'permission-system',
    parentId: null,
    type: 'folder',
    name: 'System',
    path: '/system',
    component: '/index/index',
    meta: { title: '系统管理', is_enable: true },
    children: [roleMenu]
  }
  await mockApplicationMenus(page, {
    platform: [{ ...systemMenu, children: undefined }, roleMenu]
  })
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({
      json: [{ code: 'platform', name: '测试平台', baseUrl: '/', sort: 1 }]
    })
  )
  await page.route('**/rest/v1/sys_menu?*', (route) => route.fulfill({ json: menus }))
  await page.route('**/rest/v1/sys_role_menu?*', (route) => route.fulfill({ json: [] }))
  // 保存被拦截：本用例要求超管角色根本走不到保存这一步。
  await page.route('**/rest/v1/rpc/set_role_menus', async (route) => {
    savedPayloads.push(route.request().postDataJSON())
    await route.fulfill({
      status: 400,
      json: {
        code: 'P0001',
        message: 'Super admin role has all permissions and does not support menu allocation'
      }
    })
  })

  await page.goto('/#/system/role', { waitUntil: 'domcontentloaded' })
  await expect(page.getByLabel('配置菜单权限', { exact: true }).first()).toBeVisible({
    timeout: 60_000
  })

  const rowOf = (code: string) => page.locator('.el-table__row').filter({ hasText: code })
  return {
    superRow: rowOf('R_SUPER'),
    registerRow: rowOf('R_REGISTER'),
    auditorRow: rowOf('FIN_AUDITOR'),
    dialog: page.getByRole('dialog', { name: '配置菜单权限', exact: true }),
    savedPayloads,
    pageErrors
  }
}

test('超管角色只显示受保护，普通角色与注册角色仍可配置菜单权限', async ({ page }) => {
  const { superRow, registerRow, auditorRow, dialog, savedPayloads, pageErrors } =
    await prepare(page)

  await expect(superRow).toHaveCount(1)
  await expect(superRow).toContainText('受保护')
  // 这两个入口以前都在：点击后服务端必然以 400 拒绝。
  await expect(superRow.getByLabel('配置菜单权限', { exact: true })).toHaveCount(0)
  await expect(superRow.locator('.art-table__cell-link')).toHaveCount(0)

  await superRow.getByText('R_SUPER', { exact: true }).first().click()
  await expect(dialog).toHaveCount(0)

  // 注册默认角色保持原有契约：平台超管仍可授予它的菜单权限。
  await expect(registerRow.getByLabel('配置菜单权限', { exact: true })).toBeVisible()
  await expect(registerRow.locator('.art-table__cell-link')).toHaveCount(1)

  // 普通角色不受影响：入口可用且弹窗可正常打开、可保存。
  const auditorEntry = auditorRow.getByLabel('配置菜单权限', { exact: true })
  await expect(auditorEntry).toBeVisible()
  await auditorEntry.click()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: '保存权限', exact: true })).toBeEnabled()

  expect(savedPayloads).toEqual([])
  expect(pageErrors).toEqual([])
})

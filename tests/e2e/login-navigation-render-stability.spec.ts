import { expect, test, type Page, type Route } from '@playwright/test'
import { mockApplicationMenus } from './support/menu-rpc'

// 登录提交后 router.push 期间发生的渲染崩溃会被 Vue 全局 errorHandler 吞掉，
// 因此 pageerror 不会触发；这里必须同时监听控制台的 [VueError] 输出。
const VUE_ERROR_MARKER = '[VueError]'

// 近乎零延迟的 mock 会让登录页的定时副作用（成功提示、字典初始化）整体落在导航之外，
// 掩盖真实环境里“异步写响应式状态与路由切换重叠”的时序；这里按生产量级注入延迟。
const RPC_LATENCY_MS = 250
const MENU_RPC_LATENCY_MS = 1200

// logout 会把上一个账号写入该键，登录成功时用它判断是否切换了账号。
const LAST_USER_ID_STORAGE_KEY = 'sys-last-user-id'

interface RenderErrorProbe {
  vueErrors: string[]
  pageErrors: string[]
  dictionaryRequests: number
}

function probeRenderErrors(page: Page): RenderErrorProbe {
  const probe: RenderErrorProbe = { vueErrors: [], pageErrors: [], dictionaryRequests: 0 }

  page.on('console', (message) => {
    const text = message.text()
    if (message.type() === 'error' && text.includes(VUE_ERROR_MARKER)) {
      probe.vueErrors.push(text)
    }
  })
  page.on('pageerror', (error) => probe.pageErrors.push(error.message))
  page.on('request', (request) => {
    if (request.url().includes('/rest/v1/sys_dictionary')) probe.dictionaryRequests += 1
  })

  return probe
}

const authUser = {
  id: 'render-stability-auth-user',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'render-stability@example.invalid'
}

const toBase64Url = (value: string): string => Buffer.from(value).toString('base64url')

// auth-js 的 getClaims() 对 HS 系列算法（缺少非对称 kid）不做 JWKS 校验，改为回调
// /auth/v1/user 确认身份，因此这里只需要一个可解码、未过期的 JWT 结构。
const createSessionToken = (): string => {
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = toBase64Url(
    JSON.stringify({
      sub: authUser.id,
      aud: authUser.aud,
      role: authUser.role,
      email: authUser.email,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    })
  )
  return `${header}.${payload}.${toBase64Url('render-stability-signature')}`
}

const roleMenu = {
  id: 'render-stability-role',
  parentId: 'render-stability-system',
  type: 'menu',
  name: 'Role',
  path: 'role',
  component: '/system/role',
  meta: { title: '角色管理', is_enable: true },
  children: []
}

const systemMenu = {
  id: 'render-stability-system',
  parentId: null,
  type: 'folder',
  name: 'System',
  path: '/system',
  component: '/index/index',
  meta: { title: '系统管理', is_enable: true }
}

const roleAuditMenu = {
  id: 'render-stability-role-audit',
  parentId: 'render-stability-system',
  type: 'menu',
  name: 'RoleAudit',
  path: 'role-audit',
  component: '/system/role',
  meta: { title: '角色审计', is_enable: true },
  children: []
}

const platformApplication = { code: 'platform', name: '测试平台', baseUrl: '/', sort: 1 }
const hrApplication = { code: 'hr', name: '人力资源', baseUrl: '/', sort: 2 }

interface LoginBackendFixture {
  menusByApplication: Record<string, unknown[]>
  applications?: Array<{ code: string; name: string; baseUrl: string; sort: number }>
  /** 上一个账号的用户标识；模拟“切换账号登录”时 logout 写入的缓存。 */
  previousUserId?: string
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function fulfillAfterLatency(
  route: Route,
  json: unknown,
  latencyMs = RPC_LATENCY_MS,
  headers?: Record<string, string>
): Promise<void> {
  await wait(latencyMs)
  await route.fulfill({ json, headers })
}

async function mockLoginBackend(page: Page, fixture: LoginBackendFixture): Promise<void> {
  const { menusByApplication, applications = [platformApplication], previousUserId } = fixture
  if (previousUserId) {
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
      LAST_USER_ID_STORAGE_KEY,
      previousUserId
    ] as const)
  }

  await page.route('**/functions/v1/check_user_status', (route) =>
    fulfillAfterLatency(route, { allowed: true })
  )
  await page.route('**/auth/v1/token*', (route) =>
    fulfillAfterLatency(route, {
      access_token: createSessionToken(),
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: 'render-stability-refresh-token',
      user: authUser
    })
  )
  await page.route('**/auth/v1/user', (route) => fulfillAfterLatency(route, authUser))
  await page.route('**/rest/v1/rpc/current_is_super', (route) => fulfillAfterLatency(route, true))
  await page.route('**/rest/v1/sys_user?*', (route) =>
    fulfillAfterLatency(route, {
      id: 'render-stability-user',
      user_name: '渲染稳定用例用户',
      user_email: authUser.email,
      status: '1'
    })
  )
  await page.route('**/rest/v1/sys_param?*', (route) => fulfillAfterLatency(route, []))
  await page.route('**/rest/v1/sys_dictionary?*', (route) => fulfillAfterLatency(route, []))
  await page.route('**/rest/v1/rpc/get_organization_list_secure', (route) =>
    fulfillAfterLatency(route, [])
  )
  await page.route('**/rest/v1/mdm_organization?*', (route) => fulfillAfterLatency(route, []))
  await page.route('**/rest/v1/sys_menu?*', (route) => fulfillAfterLatency(route, []))
  // 顶部栏的页面设计参考与通知中心读取失败会走全局 401 处理并把会话登出，必须一并 mock。
  await page.route('**/rest/v1/ai_ui_design_reference?*', (route) => fulfillAfterLatency(route, []))
  await page.route('**/rest/v1/rpc/get_header_notification_center', (route) =>
    fulfillAfterLatency(route, {
      notices: [],
      messages: [],
      todos: [],
      unreadNoticeCount: 0,
      unreadMessageCount: 0,
      pendingTodoCount: 0,
      totalUnreadCount: 0
    })
  )
  await page.route('**/rest/v1/sys_role_menu?*', (route) => fulfillAfterLatency(route, []))
  await page.route('**/rest/v1/sys_role?*', (route) =>
    fulfillAfterLatency(route, [], RPC_LATENCY_MS, { 'content-range': '0-0/1' })
  )
  // 动态路由注册会先解析可访问应用范围，缺了它守卫会直接落到 /500。
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    fulfillAfterLatency(route, applications, MENU_RPC_LATENCY_MS)
  )
  await mockApplicationMenus(page, menusByApplication, MENU_RPC_LATENCY_MS)
}

async function signInFromLoginPage(page: Page, redirectPath: string): Promise<void> {
  await page.goto(`/#/auth/login?redirect=${encodeURIComponent(redirectPath)}`, {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.getByRole('heading', { name: /^欢迎使用/ })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('textbox', { name: '邮箱或手机号' }).fill(authUser.email)
  await page.locator('input[name="password"]').fill('render-stability-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
}

// 登录后字典初始化由 5 秒空闲定时器延迟启动；等待它真的发起请求，
// 才能覆盖“导航落定后仍有异步写响应式状态”的整段时间。
async function waitForDeferredWork(page: Page, probe: RenderErrorProbe): Promise<void> {
  await expect.poll(() => probe.dictionaryRequests, { timeout: 20_000 }).toBeGreaterThan(0)
  await page.waitForTimeout(500)
}

function expectStableRender(probe: RenderErrorProbe): void {
  expect(probe.vueErrors, `渲染期崩溃：${probe.vueErrors.join('\n')}`).toEqual([])
  expect(probe.pageErrors, `未捕获异常：${probe.pageErrors.join('\n')}`).toEqual([])
}

/**
 * 水印把内容 Teleport 到布局的 #app-content；Teleport 在挂载时就固定目标，
 * 目标解析失败会留下 null 容器，之后任何一次重渲染都会抛 insertBefore 失败。
 */
async function expectWatermarkTeleportedIntoContent(page: Page): Promise<void> {
  const placement = await page.evaluate(() => ({
    hasContent: document.querySelector('#app-content') !== null,
    hasLayer: document.querySelector('.art-watermark-layer') !== null,
    layerInsideContent: document.querySelector('#app-content .art-watermark-layer') !== null
  }))

  expect(placement.hasContent, '布局未渲染 #app-content').toBe(true)
  expect(placement.hasLayer, '水印层未渲染').toBe(true)
  expect(placement.layerInsideContent, '水印被 Teleport 到了 #app-content 之外').toBe(true)
}

test.use({ storageState: { cookies: [], origins: [] }, reducedMotion: 'reduce' })

const platformMenus = [{ ...systemMenu, children: undefined }, roleMenu, roleAuditMenu]

const hrMenus = [
  {
    id: 'render-stability-hr',
    parentId: null,
    type: 'folder',
    name: 'Hr',
    path: '/hr',
    component: '/index/index',
    meta: { title: '人力资源', is_enable: true }
  },
  {
    id: 'render-stability-hr-role',
    parentId: 'render-stability-hr',
    type: 'menu',
    name: 'HrRole',
    path: 'role',
    component: '/system/role',
    meta: { title: '角色权限', is_enable: true },
    children: []
  }
]

async function expectRolePage(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: '角色与权限', exact: true })).toBeVisible({
    timeout: 90_000
  })
}

test.describe('登录与路由切换的渲染稳定性', () => {
  test('全新浏览器登录后跳转到角色管理不产生渲染崩溃', async ({ page }) => {
    test.setTimeout(120_000)
    const probe = probeRenderErrors(page)
    await mockLoginBackend(page, { menusByApplication: { platform: platformMenus } })

    await signInFromLoginPage(page, '/system/role')

    await expect(page).toHaveURL(/#\/system\/role$/, { timeout: 90_000 })
    await expectRolePage(page)
    await waitForDeferredWork(page, probe)
    await expectWatermarkTeleportedIntoContent(page)

    expectStableRender(probe)
  })

  test('已登录会话下刷新页面后水印仍挂在内容区且不产生渲染崩溃', async ({ page }) => {
    test.setTimeout(120_000)
    const probe = probeRenderErrors(page)
    await mockLoginBackend(page, { menusByApplication: { platform: platformMenus } })

    await signInFromLoginPage(page, '/system/role')
    await expectRolePage(page)

    // 刷新后应用在已登录路由上启动，布局与水印完整重建一次；该路径不经过登录流程，
    // 因此没有延迟字典初始化，只需等首屏异步工作收敛。
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expectRolePage(page)
    await page.waitForTimeout(1_500)
    await expectWatermarkTeleportedIntoContent(page)

    expectStableRender(probe)
  })

  test('切换账号登录时从根路径重新初始化不产生渲染崩溃', async ({ page }) => {
    test.setTimeout(120_000)
    const probe = probeRenderErrors(page)
    await mockLoginBackend(page, {
      menusByApplication: { platform: platformMenus },
      // logout 留下的是另一个账号，登录成功后必须丢弃旧工作台并由用户菜单决定落点。
      previousUserId: 'render-stability-previous-user'
    })

    await signInFromLoginPage(page, '/system/role')

    await expect(page).toHaveURL(/#\/system\/role$/, { timeout: 90_000 })
    await expectRolePage(page)
    await waitForDeferredWork(page, probe)

    expectStableRender(probe)
  })

  test('连续切换菜单与缓存页面不产生渲染崩溃', async ({ page }) => {
    test.setTimeout(120_000)
    const probe = probeRenderErrors(page)
    await mockLoginBackend(page, { menusByApplication: { platform: platformMenus } })

    await signInFromLoginPage(page, '/system/role')
    await expectRolePage(page)

    const sidebar = page.locator('#app-sidebar')
    const auditMenu = sidebar.getByRole('menuitem', { name: '角色审计', exact: true })
    await auditMenu.click()
    await expect(page).toHaveURL(/#\/system\/role-audit$/, { timeout: 90_000 })
    await expectRolePage(page)

    const roleMenuEntry = sidebar.getByRole('menuitem', { name: '角色管理', exact: true })
    await roleMenuEntry.click()
    await expect(page).toHaveURL(/#\/system\/role$/, { timeout: 90_000 })
    await auditMenu.click()
    await expect(page).toHaveURL(/#\/system\/role-audit$/, { timeout: 90_000 })

    await waitForDeferredWork(page, probe)

    expectStableRender(probe)
  })

  test('刷新当前页面后立即切换菜单不产生渲染崩溃', async ({ page }) => {
    test.setTimeout(120_000)
    const probe = probeRenderErrors(page)
    await mockLoginBackend(page, { menusByApplication: { platform: platformMenus } })

    await signInFromLoginPage(page, '/system/role')
    await expectRolePage(page)

    const sidebar = page.locator('#app-sidebar')
    // 顶栏「刷新当前页面」会把整个路由视图容器卸载后重建，紧接着的导航最容易命中
    // “容器已移除但仍在 patch”的插入失败。
    await page.getByRole('button', { name: '刷新当前页面' }).click()
    await sidebar.getByRole('menuitem', { name: '角色审计', exact: true }).click()

    await expect(page).toHaveURL(/#\/system\/role-audit$/, { timeout: 90_000 })
    await expectRolePage(page)
    await waitForDeferredWork(page, probe)

    expectStableRender(probe)
  })

  test('顶部应用切换后进入目标应用页面不产生渲染崩溃', async ({ page }) => {
    test.setTimeout(120_000)
    const probe = probeRenderErrors(page)
    await mockLoginBackend(page, {
      applications: [platformApplication, hrApplication],
      menusByApplication: { platform: platformMenus, hr: hrMenus }
    })

    await signInFromLoginPage(page, '/system/role')
    await expectRolePage(page)

    // 应用清单在守卫的 pending loading 结束后才会写入顶部栏，先切一次菜单触发重试。
    await page
      .locator('#app-sidebar')
      .getByRole('menuitem', { name: '角色审计', exact: true })
      .click()
    await expect(page).toHaveURL(/#\/system\/role-audit$/, { timeout: 90_000 })

    const switcher = page.getByRole('button', { name: '切换业务应用' })
    await expect(switcher).toBeVisible({ timeout: 30_000 })
    await switcher.click()
    // 侧边栏同样存在「人力资源」子菜单，必须限定在切换器自己的浮层里点击。
    await page
      .locator('.application-switcher__menu')
      .getByRole('menuitem', { name: /人力资源/ })
      .click()

    await expect(page).toHaveURL(/#\/hr\/role$/, { timeout: 90_000 })
    await waitForDeferredWork(page, probe)

    expectStableRender(probe)
  })
})

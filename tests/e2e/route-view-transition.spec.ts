import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ reducedMotion: 'no-preference' })

/**
 * 动态菜单路由的视图切换回归：用例把平台系统管理页面挂进模拟菜单树，
 * 验证切换非缓存/缓存路由时不会出现页面堆叠或残留旧页面。
 */
async function installRouteFixtures(
  page: Page,
  cachedRouteNames: ReadonlySet<string> = new Set()
): Promise<void> {
  const storedState = JSON.parse(readFileSync('playwright/.auth/user.json', 'utf8')) as {
    origins: Array<{ localStorage: Array<{ name: string; value: string }> }>
  }
  const storedEntries = storedState.origins.find((origin) =>
    origin.localStorage.some((entry) => entry.name.includes('auth-token'))
  )?.localStorage
  if (!storedEntries) throw new Error('浏览器测试缺少已保存的登录状态')
  await page.addInitScript((entries) => {
    entries.forEach(({ name, value }) => localStorage.setItem(name, value))
  }, storedEntries)

  const tenantId = '7529f951-938e-4e2c-ac0d-316c136ae1f9'
  const tenant = { id: tenantId, tenant_code: 'DEMO', tenant_name: '示例租户' }
  const root = {
    id: 'system-root',
    parentId: null,
    name: 'System',
    path: '/system',
    component: '/index/index',
    type: 'folder',
    sort: 1,
    meta: { title: '系统管理', roles: ['R_SUPER'], is_enable: true }
  }
  const folder = {
    id: 'system-account',
    parentId: root.id,
    name: 'SystemAccount',
    path: 'account',
    component: '',
    type: 'folder',
    sort: 1,
    meta: { title: '账号与权限', roles: ['R_SUPER'], is_enable: true }
  }
  const menus = [
    {
      name: 'SystemParam',
      path: 'system-param',
      title: '参数设置',
      component: '/system/system-param'
    },
    {
      name: 'DocumentNumberRule',
      path: 'document-number',
      title: '编号规则',
      component: '/system/document-number'
    }
  ].map((item, index) => ({
    id: item.name,
    parentId: folder.id,
    name: item.name,
    path: item.path,
    component: item.component,
    type: 'menu',
    sort: index,
    meta: {
      title: item.title,
      roles: ['R_SUPER'],
      is_enable: true,
      keepAlive: cachedRouteNames.has(item.name)
    },
    children: [
      {
        id: `${item.name}:View`,
        parentId: item.name,
        name: `${item.name}:View`,
        path: '',
        component: '',
        type: 'button',
        sort: 0,
        meta: { title: '查看', roles: ['R_SUPER'], is_enable: true },
        children: []
      }
    ]
  }))
  const identityFolder = {
    ...folder,
    id: 'system-identity',
    name: 'SystemIdentity',
    path: 'identity',
    meta: { ...folder.meta, title: '身份与组织' }
  }
  const auditFolder = {
    ...folder,
    id: 'system-audit',
    name: 'SystemAudit',
    path: 'audit',
    meta: { ...folder.meta, title: '审计与配置' }
  }
  const user = {
    ...menus[0],
    id: 'User',
    parentId: identityFolder.id,
    name: 'User',
    path: 'user',
    component: '/system/user',
    meta: { ...menus[0].meta, title: '用户管理', keepAlive: cachedRouteNames.has('User') },
    children: [
      {
        ...menus[0].children[0],
        id: 'User:View',
        parentId: 'User',
        name: 'User:View'
      }
    ]
  }
  const role = {
    ...menus[0],
    id: 'Role',
    parentId: auditFolder.id,
    name: 'Role',
    path: 'role',
    component: '/system/role',
    meta: { ...menus[0].meta, title: '角色权限', keepAlive: cachedRouteNames.has('Role') },
    children: [
      {
        ...menus[0].children[0],
        id: 'Role:View',
        parentId: 'Role',
        name: 'Role:View'
      }
    ]
  }
  const flat = [
    root,
    folder,
    identityFolder,
    auditFolder,
    ...menus,
    user,
    role,
    ...menus.flatMap((menu) => menu.children),
    ...user.children,
    ...role.children
  ]

  await page.addInitScript(() => {
    for (const key of Object.keys(localStorage)) {
      if (!/^sb-.*-auth-token$/.test(key)) continue
      const session = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, unknown>
      session.expires_at = Math.floor(Date.now() / 1000) + 3600
      session.expires_in = 3600
      const [header, payload, signature] = String(session.access_token || '').split('.')
      if (header && payload && signature) {
        const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as Record<
          string,
          unknown
        >
        claims.iat = Math.floor(Date.now() / 1000)
        claims.exp = Number(claims.iat) + 3600
        const freshPayload = btoa(JSON.stringify(claims))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '')
        session.access_token = `${header}.${freshPayload}.${signature}`
      }
      localStorage.setItem(key, JSON.stringify(session))
    }
    const setting = JSON.parse(localStorage.getItem('setting') || '{}') as Record<string, unknown>
    localStorage.setItem('setting', JSON.stringify({ ...setting, pageTransition: 'slide-left' }))
  })

  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/auth/v1/user', (route) =>
    route.fulfill({
      json: {
        id: '705ddd8d-4959-4dc1-aeb0-08caed7ab51a',
        aud: 'authenticated',
        role: 'authenticated'
      }
    })
  )
  await page.route('**/rest/v1/sys_user?*', (route) =>
    route.fulfill({
      json: {
        id: 'route-test-user',
        auth_user_id: '705ddd8d-4959-4dc1-aeb0-08caed7ab51a',
        user_name: '测试用户',
        user_email: 'route@example.invalid',
        user_type: '1',
        user_roles: ['R_SUPER'],
        status: '1',
        tenant_id: tenantId,
        tenant
      }
    })
  )
  await page.route('**/rest/v1/sys_tenant?*', (route) => route.fulfill({ json: [tenant] }))
  await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: true }))
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({
      json: [{ code: 'platform', name: '测试平台', baseUrl: '/' }]
    })
  )
  await mockApplicationMenus(page, { platform: flat })
}

async function visibleRouteOverlapDuringNavigation(
  page: Page,
  targetHash: string,
  targetSelector: string
): Promise<{ overlaps: string[][]; simultaneousDomSamples: number }> {
  return page.evaluate(
    async ({ targetHash, targetSelector }) => {
      const content = document.querySelector<HTMLElement>('.layout-content')
      if (!content) throw new Error('页面内容容器未找到')

      const overlaps: string[][] = []
      let simultaneousDomSamples = 0
      const sample = () => {
        const routeViews = Array.from(content.children).filter(
          (child): child is HTMLElement =>
            child instanceof HTMLElement && child.classList.contains('art-page-view')
        )
        if (routeViews.length > 1) simultaneousDomSamples += 1
        const visibleViews = routeViews.filter((child) => {
          const style = getComputedStyle(child)
          return style.display !== 'none' && style.visibility !== 'hidden'
        })
        if (visibleViews.length > 1) {
          overlaps.push(visibleViews.map((view) => view.className))
        }
      }

      const observer = new MutationObserver(sample)
      observer.observe(content, {
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'style']
      })
      const sampleTimer = window.setInterval(sample, 16)

      try {
        window.location.hash = targetHash
        await new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(() => {
            window.clearInterval(poll)
            reject(new Error(`目标路由未渲染：${targetHash}`))
          }, 45_000)
          const poll = window.setInterval(() => {
            if (!content.querySelector(targetSelector)) return
            window.clearTimeout(timeout)
            window.clearInterval(poll)
            resolve()
          }, 20)
        })
        await new Promise((resolve) => window.setTimeout(resolve, 400))
        sample()
        return { overlaps, simultaneousDomSamples }
      } finally {
        observer.disconnect()
        window.clearInterval(sampleTimer)
      }
    },
    { targetHash, targetSelector }
  )
}

test('参数设置与编号规则切换时不会上下并列显示两个路由视图', async ({ page }, testInfo) => {
  test.setTimeout(120_000)

  await installRouteFixtures(page)
  await page.goto('/#/system/account/system-param', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.system-param-page')).toBeVisible({ timeout: 90_000 })

  const toDocumentNumber = await visibleRouteOverlapDuringNavigation(
    page,
    '#/system/account/document-number',
    '.number-rule-page'
  )
  expect(toDocumentNumber.overlaps).toEqual([])
  await expect(page.locator('.number-rule-page')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('number-rule.png') })

  const toSystemParam = await visibleRouteOverlapDuringNavigation(
    page,
    '#/system/account/system-param',
    '.system-param-page'
  )
  expect(toSystemParam.overlaps).toEqual([])
  expect(toDocumentNumber.simultaneousDomSamples + toSystemParam.simultaneousDomSamples).toBe(0)
  await expect(page.locator('.system-param-page')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('system-param.png') })
})

test('连续打开用户管理和角色权限后只保留当前路由视图', async ({ page }, testInfo) => {
  test.setTimeout(180_000)

  await installRouteFixtures(page)
  await page.goto('/#/system/account/system-param', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.system-param-page')).toBeVisible({ timeout: 90_000 })

  const routes = [
    { hash: '#/system/account/document-number', selector: '.number-rule-page' },
    { hash: '#/system/identity/user', selector: '.user-page' },
    { hash: '#/system/audit/role', selector: '.role-page' }
  ]

  for (const target of routes) {
    const result = await visibleRouteOverlapDuringNavigation(page, target.hash, target.selector)
    expect(result.overlaps, `导航至 ${target.hash} 时出现页面堆叠`).toEqual([])
    const visibleViews = await page.locator('.layout-content > .art-page-view:visible').count()
    expect(visibleViews, `导航至 ${target.hash} 后路由视图数量`).toBe(1)
    await expect(page.locator(target.selector)).toBeVisible()
  }

  await page.screenshot({
    path: testInfo.outputPath('role-after-multiple-routes.png'),
    fullPage: true
  })
})

test('快速切换多个非缓存路由后不会留下旧页面', async ({ page }) => {
  test.setTimeout(180_000)

  await installRouteFixtures(page)
  await page.goto('/#/system/account/system-param', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.system-param-page')).toBeVisible({ timeout: 90_000 })

  await page.evaluate(async () => {
    const paths = [
      '#/system/account/document-number',
      '#/system/identity/user',
      '#/system/audit/role',
      '#/system/account/system-param',
      '#/system/identity/user',
      '#/system/audit/role'
    ]
    for (const path of paths) {
      window.location.hash = path
      await new Promise((resolve) => window.setTimeout(resolve, 70))
    }
  })

  await expect(page.locator('.role-page')).toBeVisible({ timeout: 60_000 })
  await page.waitForTimeout(1000)
  await expect(page.locator('.layout-content > .art-page-view:visible')).toHaveCount(1)
  await expect(page.locator('.layout-content > .art-page-view')).toHaveCount(1)
  await expect(page.locator('.user-page')).toHaveCount(0)
  await expect(
    page.locator('.layout-sidebar .el-sub-menu__title .menu-name', { hasText: /^系统管理$/ })
  ).toHaveCount(1)
})

test('缓存页面穿过非缓存路由后仍保留原实例', async ({ page }) => {
  test.setTimeout(180_000)

  await installRouteFixtures(page, new Set(['SystemParam', 'DocumentNumberRule']))
  await page.goto('/#/system/account/system-param', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.system-param-page')).toBeVisible({ timeout: 90_000 })
  await page.locator('.layout-content > .art-page-view').evaluate((element) => {
    element.setAttribute('data-cache-probe', 'retained')
  })

  const paths = [
    { hash: '#/system/account/document-number', selector: '.number-rule-page' },
    { hash: '#/system/identity/user', selector: '.user-page' },
    { hash: '#/system/account/system-param', selector: '.system-param-page' }
  ]
  for (const target of paths) {
    const result = await visibleRouteOverlapDuringNavigation(page, target.hash, target.selector)
    expect(result.overlaps).toEqual([])
    expect(result.simultaneousDomSamples).toBe(0)
    await expect(page.locator('.layout-content > .art-page-view')).toHaveCount(1)
  }
  await expect(page.locator('.layout-content > .art-page-view')).toHaveAttribute(
    'data-cache-probe',
    'retained'
  )
})

import { expect, test, type Page } from '@playwright/test'
import { readSupabaseAuthTokenStorageKey } from './support/demo-credentials'

interface AuthFieldExpectation {
  name: string
  autocomplete: string
}

interface AuthPageExpectation {
  path: string
  fields: AuthFieldExpectation[]
  mayBeDisabled?: boolean
}

const authPages: AuthPageExpectation[] = [
  {
    path: '/auth/login',
    fields: [
      { name: 'username', autocomplete: 'username' },
      { name: 'password', autocomplete: 'current-password' }
    ]
  },
  {
    path: '/auth/register',
    mayBeDisabled: true,
    fields: [
      { name: 'email', autocomplete: 'email' },
      { name: 'password', autocomplete: 'new-password' },
      { name: 'confirmPassword', autocomplete: 'new-password' }
    ]
  },
  {
    path: '/auth/forget-password',
    fields: [{ name: 'email', autocomplete: 'email' }]
  },
  {
    path: '/auth/reset-password',
    fields: [
      { name: 'password', autocomplete: 'new-password' },
      { name: 'confirmPassword', autocomplete: 'new-password' }
    ]
  }
]

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const viewport = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }))
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth + 1)
}

test('login starts empty and keeps the remember option', async ({ page }) => {
  await page.goto('/#/auth/login', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('input[name="username"]')).toHaveValue('')
  await expect(page.locator('input[name="password"]')).toHaveValue('')
  // 记住密码是「默认开启、localStorage 里显式 false 才关闭」的偏好（见 remember-password.ts）
  await expect(page.getByRole('checkbox', { name: '记住密码' })).toBeChecked()
  await expect(page.locator('button[type="submit"]')).toContainText('登录')
})

for (const authPage of authPages) {
  test(`${authPage.path} exposes semantic form fields`, async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))

    await page.goto(`/#${authPage.path}`, { waitUntil: 'domcontentloaded' })
    if (authPage.mayBeDisabled && /#\/403$/.test(page.url())) {
      await expect(page.getByRole('heading', { name: '当前账号无法访问' })).toBeVisible()
      return
    }
    await expect(page.locator('.auth-right-wrap .form')).toBeVisible()

    for (const field of authPage.fields) {
      const input = page.locator(`input[name="${field.name}"]`)
      await expect(input).toHaveCount(1)
      await expect(input).toHaveAttribute('autocomplete', field.autocomplete)
      await expect(input).toHaveAttribute('aria-label', /\S+/)
    }

    await expectNoHorizontalOverflow(page)
    expect(pageErrors).toEqual([])
  })
}

test('login support links have usable hit areas', async ({ page }, testInfo) => {
  await page.goto('/#/auth/login', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.auth-right-wrap .form')).toBeVisible()

  for (const name of ['忘记密码', '注册']) {
    const link = page.getByRole('link', { name, exact: true })
    await expect(link).toBeVisible()
    const bounds = await link.boundingBox()
    const minimumSize = testInfo.project.name.includes('mobile') ? 44 : 24
    expect(bounds?.width).toBeGreaterThanOrEqual(minimumSize)
    expect(bounds?.height).toBeGreaterThanOrEqual(minimumSize)
  }

  await expectNoHorizontalOverflow(page)
})

test('desktop Feishu login switches the card to an inline QR and back', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'))
  await page.route('**/functions/v1/oauth-provider-bridge/feishu/qr-prepare', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        goto: 'https://passport.feishu.cn/suite/passport/oauth/authorize?client_id=cli_test&redirect_uri=https%3A%2F%2Fexample.com%2Fcallback&response_type=code&state=test-state'
      })
    })
  })
  await page.route('**/LarkSSOSDKWebQRCode-1.0.3.js', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `window.QRLogin = ({ id }) => {
        const iframe = document.createElement('iframe');
        iframe.src = 'about:blank';
        document.getElementById(id).appendChild(iframe);
        return { matchOrigin: () => true, matchData: () => true };
      };`
    })
  })
  await page.goto('/#/auth/login', { waitUntil: 'domcontentloaded' })
  const feishuButton = page.getByRole('button', { name: '使用飞书登录' })
  const channelReady = await feishuButton
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
  test.skip(!channelReady, '飞书渠道尚未在网站配置中启用')

  await feishuButton.click()
  await expect(page.getByRole('heading', { name: '飞书扫码登录' })).toBeVisible()
  await expect(page.locator('.feishu-qr__code iframe')).toBeVisible()
  await expect(page.getByText('用飞书 App 扫一扫，并在手机上确认')).toBeVisible()
  await expect(page.getByRole('button', { name: '飞书网页授权登录' })).toBeVisible()
  await expectNoHorizontalOverflow(page)

  await page.getByRole('button', { name: '返回账号密码登录' }).click()
  await expect(page.locator('input[name="username"]')).toBeVisible()
})

test('OAuth callback shows progress instead of briefly exposing the login form', async ({
  page
}) => {
  const authTokenStorageKey = readSupabaseAuthTokenStorageKey()
  await page.addInitScript((storageKey) => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        access_token: 'a.b.c',
        refresh_token: 'test-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: {
          id: '00000000-0000-0000-0000-000000000000',
          aud: 'authenticated',
          role: 'authenticated'
        }
      })
    )
  }, authTokenStorageKey)
  await page.route('**/functions/v1/check_user_status', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3_000))
    await route.abort()
  })

  await page.goto('/#/auth/login?auth_action=login&channel=feishu', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.getByRole('heading', { name: '正在完成登录' })).toBeVisible()
  await expect(page.locator('input[name="username"]')).toHaveCount(0)
  await expect(page.getByRole('status')).toContainText('正在')
  await expectNoHorizontalOverflow(page)
})

const toBase64Url = (value: string): string => Buffer.from(value).toString('base64url')

// auth-js 会解码令牌读取 exp，因此 mock 会话只需要结构可解码且未过期的 JWT。
const createSessionToken = (userId: string, email: string): string =>
  `${toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${toBase64Url(
    JSON.stringify({
      sub: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    })
  )}.${toBase64Url('auth-page-spec-signature')}`

// 人机验证与登录渠道来自网站配置；用例回落到默认配置，避免依赖真实项目的配置状态。
async function mockWebsiteConfigDefaults(page: Page): Promise<void> {
  await page.route('**/rest/v1/sys_param?*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )
}

async function submitLogin(page: Page, identifier: string, password: string): Promise<void> {
  await page.goto('/#/auth/login', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.auth-right-wrap .form')).toBeVisible()
  await page.locator('input[name="username"]').fill(identifier)
  await page.locator('input[name="password"]').fill(password)
  // 网站配置未加载完成时提交会被忽略，先等登录按钮可用。
  await expect(page.locator('button[type="submit"]')).toBeEnabled()
  await page.locator('button[type="submit"]').click()
}

test('邮箱登录先用密码校验：密码错误时不询问账号角色准入', async ({ page }) => {
  const accessCheckRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/functions/v1/check_user_status')) {
      accessCheckRequests.push(request.url())
    }
  })
  await mockWebsiteConfigDefaults(page)
  await page.route('**/auth/v1/token*', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 400,
        error_code: 'invalid_credentials',
        msg: 'Invalid login credentials'
      })
    })
  )

  await submitLogin(page, 'wrong-password@example.invalid', 'wrong-password')
  await expect(page.locator('.el-message--error')).toContainText('邮箱或密码错误')
  expect(accessCheckRequests).toEqual([])
})

test('密码正确但未分配角色时，才提示角色准入失败并清理本次会话', async ({ page }) => {
  const authTokenStorageKey = readSupabaseAuthTokenStorageKey()
  const userId = '11111111-1111-4111-8111-111111111111'
  const email = 'role-less@example.invalid'
  let storedSessionDuringAccessCheck: string | null = null

  await mockWebsiteConfigDefaults(page)
  await page.route('**/auth/v1/token*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: createSessionToken(userId, email),
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'role-less-refresh-token',
        user: { id: userId, aud: 'authenticated', role: 'authenticated', email }
      })
    })
  )
  await page.route('**/auth/v1/logout*', (route) => route.fulfill({ status: 204, body: '' }))
  await page.route('**/functions/v1/check_user_status', async (route) => {
    // 准入检查只能发生在密码校验建立会话之后。
    storedSessionDuringAccessCheck = await page.evaluate(
      (key) => localStorage.getItem(key),
      authTokenStorageKey
    )
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({
        allowed: false,
        code: 'role_not_assigned',
        error: '当前账号尚未分配角色，请联系管理员'
      })
    })
  })

  await submitLogin(page, email, 'correct-password')

  await expect(page.locator('.el-message--error')).toContainText('当前账号尚未分配角色')
  expect(storedSessionDuringAccessCheck).not.toBeNull()
  // 未通过准入检查的账号不得留下登录态。
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), authTokenStorageKey))
    .toBeNull()
})

test('anonymous login does not download hosted business page mappings', async ({ page }) => {
  const hostedRequests: string[] = []
  page.on('request', (request) => {
    if (/bootstrapHostedApplications(?:-|\.ts)/.test(new URL(request.url()).pathname)) {
      hostedRequests.push(request.url())
    }
  })

  await page.goto('/#/auth/login', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.auth-right-wrap .form')).toBeVisible()

  expect(hostedRequests).toEqual([])
})

test('short phone login keeps its header and final controls reachable', async ({
  page
}, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'))
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('/#/auth/login', { waitUntil: 'domcontentloaded' })

  const brand = page.locator('.auth-top-bar')
  const form = page.locator('.auth-right-wrap .form')
  await expect(form).toBeVisible()
  const brandBounds = await brand.boundingBox()
  const formBounds = await form.boundingBox()
  expect(brandBounds).not.toBeNull()
  expect(formBounds).not.toBeNull()
  expect(brandBounds!.y + brandBounds!.height).toBeLessThan(formBounds!.y)

  const trust = form.locator('.form__trust')
  await trust.scrollIntoViewIfNeeded()
  await expect(trust).toBeInViewport()
  await expectNoHorizontalOverflow(page)
})

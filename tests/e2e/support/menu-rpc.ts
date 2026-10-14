import type { Page } from '@playwright/test'

/**
 * 用授权平铺菜单模拟批量 RPC，和生产端一样按请求的应用编码返回。
 * `latencyMs` 用于还原冷启动菜单 RPC 的耗时，让用例覆盖导航期间的时序重叠。
 */
export async function mockApplicationMenus(
  page: Page,
  menusByApplication: Record<string, readonly unknown[]>,
  latencyMs = 0
): Promise<void> {
  await page.route('**/rest/v1/rpc/get_menus_for_current_applications', async (route) => {
    const payload: unknown = route.request().postDataJSON()
    const requestedCodes =
      payload && typeof payload === 'object' && 'p_app_codes' in payload
        ? payload.p_app_codes
        : null
    const codes = Array.isArray(requestedCodes)
      ? requestedCodes.filter((code): code is string => typeof code === 'string')
      : []

    if (latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, latencyMs))
    }
    await route.fulfill({
      json: Object.fromEntries(codes.map((code) => [code, menusByApplication[code] ?? []]))
    })
  })
}

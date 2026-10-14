import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  createSystemUserRow,
  mockSystemUserPage,
  signInToSystemUserPage
} from './support/system-user-page'

/**
 * 用户管理页的行操作菜单必须按账号状态切换生命周期入口：
 * 状态为禁用（status = '2'）时隐藏「禁止用户」并给出「启用用户」。
 * 这里只 mock 后端，不触碰真实项目数据；启用动作的调用本身由用例断言。
 */

const bannedUser = createSystemUserRow({
  id: 'user-enable-banned',
  user_name: 'michelle',
  nick_name: 'Michelle',
  status: '2',
  deleted_at: '2026-10-01T00:00:00+00:00'
})

const activeUser = createSystemUserRow({
  id: 'user-enable-active',
  user_name: 'zhangsan',
  nick_name: '张三',
  user_roles: ['R_ADMIN']
})

/** 行操作菜单是悬停触发的气泡，按 trigger 的 aria-controls 定位对应行的菜单。 */
async function openRowMenu(page: Page, row: Locator): Promise<Locator> {
  await page.mouse.move(4, 4)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  const trigger = row.locator('button[aria-label="更多操作"]')
  await trigger.hover()
  const controls = await trigger.getAttribute('aria-controls')
  expect(controls, '行操作菜单未绑定到触发按钮').toBeTruthy()

  const menu = page.locator(`#${controls}`)
  await expect(menu).toBeVisible({ timeout: 10_000 })
  return menu
}

test.use({ storageState: { cookies: [], origins: [] }, reducedMotion: 'reduce' })

test('已禁用账号隐藏「禁止用户」并改为提供「启用用户」', async ({ page, isMobile }) => {
  test.setTimeout(120_000)
  test.skip(isMobile, '行操作菜单为桌面交互，移动端不覆盖')

  const fixture = await mockSystemUserPage(page, { rows: [bannedUser, activeUser] })
  await signInToSystemUserPage(page)

  const rows = page.locator('.el-table__body .el-table__row')
  await expect(rows).toHaveCount(2, { timeout: 60_000 })
  const bannedUserRow = rows.filter({ hasText: 'Michelle' })
  const activeUserRow = rows.filter({ hasText: '张三' })
  await expect(bannedUserRow).toHaveCount(1)
  await expect(activeUserRow).toHaveCount(1)

  const bannedMenu = await openRowMenu(page, bannedUserRow)
  await expect(bannedMenu.getByText('启用用户', { exact: true })).toBeVisible()
  await expect(bannedMenu.getByText('禁止用户', { exact: true })).toHaveCount(0)

  const activeMenu = await openRowMenu(page, activeUserRow)
  await expect(activeMenu.getByText('禁止用户', { exact: true })).toBeVisible()
  await expect(activeMenu.getByText('启用用户', { exact: true })).toHaveCount(0)

  const requestsBefore = fixture.listRequests
  const bannedMenuForActivate = await openRowMenu(page, bannedUserRow)
  await bannedMenuForActivate.getByText('启用用户', { exact: true }).click()

  const confirmDialog = page.locator('.el-message-box')
  await expect(confirmDialog).toBeVisible({ timeout: 10_000 })
  await expect(confirmDialog).toContainText('重新分配角色')
  await confirmDialog.getByRole('button', { name: '确认启用' }).click()

  await expect.poll(() => fixture.syncUserCalls.length).toBeGreaterThan(0)
  expect(fixture.syncUserCalls[0]).toMatchObject({
    action: 'activate',
    id: bannedUser.id,
    auth_user_id: bannedUser.auth_user_id
  })
  await expect.poll(() => fixture.listRequests).toBeGreaterThan(requestsBefore)

  const activatedRow = page
    .locator('.el-table__body .el-table__row')
    .filter({ hasText: 'Michelle' })
  const activatedMenu = await openRowMenu(page, activatedRow)
  await expect(activatedMenu.getByText('禁止用户', { exact: true })).toBeVisible()
  await expect(activatedMenu.getByText('启用用户', { exact: true })).toHaveCount(0)
})

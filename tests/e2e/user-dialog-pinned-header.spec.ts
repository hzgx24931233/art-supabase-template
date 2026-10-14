import { expect, test } from '@playwright/test'
import {
  createSystemUserRow,
  mockSystemUserPage,
  signInToSystemUserPage,
  systemUserAccount
} from './support/system-user-page'

/**
 * 账号弹窗的身份摘要与提示必须固定在弹窗顶部，滚动表单时保持可见。
 * 后端全部 mock，用例不会创建或修改任何真实账号。
 */

test.use({ storageState: { cookies: [], origins: [] }, reducedMotion: 'reduce' })

test('账号弹窗的身份摘要固定在顶部，滚动表单时保持可见', async ({ page, isMobile }) => {
  test.setTimeout(120_000)
  test.skip(isMobile, '弹窗滚动区域按桌面尺寸验证')

  await mockSystemUserPage(page, {
    rows: [
      createSystemUserRow({ id: 'user-pinned-active', nick_name: '张三' }),
      createSystemUserRow({ id: 'user-pinned-banned', nick_name: 'Michelle', status: '2' })
    ]
  })
  await signInToSystemUserPage(page)

  await page.getByRole('button', { name: '新增用户' }).click()
  const dialog = page.locator('.art-dialog').last()
  await expect(dialog).toBeVisible({ timeout: 15_000 })

  const pinned = dialog.locator('.art-dialog__content-top .user-dialog-top')
  await expect(pinned).toContainText('创建新的登录账号')
  // 摘要与提示位于 ElScrollbar 之外，表单滚动不会带走它们
  await expect(pinned.locator('.user-dialog-top__context')).toBeVisible()
  await expect(dialog.locator('.art-dialog__scrollbar .user-dialog-top')).toHaveCount(0)

  const form = dialog.locator('.art-dialog__scrollbar')
  const scrollWrap = form.locator('.el-scrollbar__wrap')
  await expect
    .poll(
      async () => scrollWrap.evaluate((element) => element.scrollHeight - element.clientHeight),
      { message: '表单内容未超出滚动区域，无法验证固定效果' }
    )
    .toBeGreaterThan(0)

  const pinnedBefore = await pinned.boundingBox()
  const sectionBefore = await dialog.getByText('基本身份', { exact: true }).boundingBox()
  expect(pinnedBefore).not.toBeNull()
  expect(sectionBefore).not.toBeNull()

  await scrollWrap.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect.poll(() => scrollWrap.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)

  const pinnedAfter = await pinned.boundingBox()
  const sectionAfter = await dialog.getByText('基本身份', { exact: true }).boundingBox()
  expect(pinnedAfter).not.toBeNull()
  expect(sectionAfter).not.toBeNull()
  // 表单内容跟随滚动上移，摘要区保持原位
  expect(sectionAfter!.y).toBeLessThan(sectionBefore!.y - 20)
  expect(Math.abs(pinnedAfter!.y - pinnedBefore!.y)).toBeLessThanOrEqual(1)

  const dialogBox = await dialog.boundingBox()
  expect(dialogBox).not.toBeNull()
  expect(pinnedAfter!.y + pinnedAfter!.height).toBeLessThanOrEqual(dialogBox!.y + dialogBox!.height)
})

test('维护当前登录账号时，账号提示同样保留在固定区域', async ({ page, isMobile }) => {
  test.setTimeout(120_000)
  test.skip(isMobile, '行操作与弹窗滚动区域按桌面尺寸验证')

  await mockSystemUserPage(page, {
    rows: [
      createSystemUserRow({
        id: 'user-pinned-self',
        nick_name: '当前管理员',
        user_email: systemUserAccount.email
      })
    ]
  })
  await signInToSystemUserPage(page)

  const row = page.locator('.el-table__body .el-table__row').filter({ hasText: '当前管理员' })
  await expect(row).toHaveCount(1, { timeout: 60_000 })
  await row.getByRole('button', { name: '编辑' }).click()

  const dialog = page.locator('.art-dialog').last()
  await expect(dialog).toBeVisible({ timeout: 15_000 })

  const notice = dialog.locator('.art-dialog__content-top .user-dialog-top__notice')
  await expect(notice).toBeVisible()
  await expect(notice).toContainText('正在维护当前登录账号')
  await expect(dialog.locator('.art-dialog__scrollbar .user-dialog-top__notice')).toHaveCount(0)
  await expect(dialog.locator('.art-dialog__content-top')).toContainText('当前账号')
})

import { expect, test, type Locator } from '@playwright/test'

// 关闭前未保存确认：验证 X / ESC / 取消按钮统一进入提示，三个选择的处理符合约定。
// 只走新增表单的校验路径，不写入业务数据。
// 依赖带维护权限的测试账号；无权限时跳过，避免把权限差异当成回归。
const openParamPage = async (page: import('@playwright/test').Page) => {
  await page.goto('/#/system/system-param', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('参数设置', { exact: true }).first()).toBeVisible({ timeout: 45_000 })
  return page.getByRole('button', { name: '新增参数' }).first()
}

test.describe('ArtDialog 关闭前未保存确认', () => {
  test('X 关闭时提示保存，取消后继续编辑，不保存后丢弃', async ({ page }) => {
    test.setTimeout(90_000)
    const createButton = await openParamPage(page)
    test.skip(
      (await createButton.count()) === 0,
      '当前测试账号没有新增参数的权限，跳过未保存确认校验'
    )

    const openCreateDialog = async () => {
      await createButton.click()
      const dialogRoot = page.locator('.art-dialog').last()
      await expect(dialogRoot).toBeVisible({ timeout: 15_000 })
      return dialogRoot
    }

    const paramNameInput = (root: Locator) => root.getByPlaceholder('例如：密码最小长度')

    // 1. X 关闭：弹出三选一提示窗口
    let dialogRoot = await openCreateDialog()
    await paramNameInput(dialogRoot).fill('E2E 未保存确认')
    await dialogRoot.getByRole('button', { name: '关闭此对话框' }).click()

    // 提示是独立的可拖动窗口，位于 body 层级
    const panel = page.locator('.art-dialog__unsaved-prompt')
    await expect(panel).toBeVisible({ timeout: 10_000 })
    await expect(panel.getByText('未保存修改')).toBeVisible()
    await expect(panel.locator('.art-dialog__title-icon svg')).toHaveCount(1)
    await expect(panel.getByText('表单内容已修改，是否保存后关闭？')).toBeVisible()
    await expect(panel.getByRole('button', { name: '取消', exact: true })).toBeVisible()
    await expect(panel.getByRole('button', { name: '不保存', exact: true })).toBeVisible()
    await expect(panel.getByRole('button', { name: '保存', exact: true })).toBeVisible()

    // 拖动标题栏可以把提示窗口移开（不遮住表单内容）
    const beforeDrag = await panel.boundingBox()
    expect(beforeDrag).not.toBeNull()
    if (beforeDrag) {
      await page.mouse.move(beforeDrag.x + beforeDrag.width / 2, beforeDrag.y + 12)
      await page.mouse.down()
      await page.mouse.move(beforeDrag.x + beforeDrag.width / 2 - 180, beforeDrag.y + 120, {
        steps: 10
      })
      await page.mouse.up()
      const afterDrag = await panel.boundingBox()
      expect(afterDrag).not.toBeNull()
      expect(Math.abs((afterDrag?.x ?? beforeDrag.x) - beforeDrag.x)).toBeGreaterThan(80)
    }

    // 2. 取消：提示关闭，弹窗与已填内容保留
    await panel.getByRole('button', { name: '取消', exact: true }).click()
    await expect(panel).toBeHidden({ timeout: 10_000 })
    await expect(dialogRoot).toBeVisible()
    await expect(paramNameInput(dialogRoot)).toHaveValue('E2E 未保存确认')

    // 3. ESC 同样进入提示（关闭入口统一）
    await paramNameInput(dialogRoot).click()
    await page.keyboard.press('Escape')
    await expect(panel).toBeVisible({ timeout: 10_000 })

    // 4. 不保存：直接关闭并丢弃
    await panel.getByRole('button', { name: '不保存', exact: true }).click()
    await expect(page.locator('.art-dialog').last()).toBeHidden({ timeout: 15_000 })

    // 5. 底部取消按钮同样进入提示；选择保存会执行确认流程（必填校验阻止关闭）
    dialogRoot = await openCreateDialog()
    await paramNameInput(dialogRoot).fill('E2E 保存路径')
    await dialogRoot.getByRole('button', { name: '取消', exact: true }).click()
    await expect(panel).toBeVisible({ timeout: 10_000 })
    await panel.getByRole('button', { name: '保存', exact: true }).click()
    await expect(panel).toBeHidden({ timeout: 10_000 })
    await expect(dialogRoot).toBeVisible()
    await expect(dialogRoot.locator('.el-form-item__error').first()).toBeVisible({
      timeout: 10_000
    })
  })

  test('未修改表单时 X 直接关闭，不出现提示', async ({ page }) => {
    test.setTimeout(90_000)
    const createButton = await openParamPage(page)
    test.skip(
      (await createButton.count()) === 0,
      '当前测试账号没有新增参数的权限，跳过未保存确认校验'
    )

    await createButton.click()
    const dialogRoot = page.locator('.art-dialog').last()
    await expect(dialogRoot).toBeVisible({ timeout: 15_000 })
    await dialogRoot.getByRole('button', { name: '关闭此对话框' }).click()

    await expect(page.locator('.art-dialog__unsaved-prompt')).toHaveCount(0)
    await expect(dialogRoot).toBeHidden({ timeout: 15_000 })
  })
})

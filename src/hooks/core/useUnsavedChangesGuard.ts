import { ElMessageBox } from 'element-plus'
import { onBeforeUnmount, toValue, type MaybeRefOrGetter } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'

export interface UnsavedChangesGuardOptions {
  isDirty: MaybeRefOrGetter<boolean>
  /** 保存成功返回 true；返回 false 或抛错时保留当前页面。 */
  save?: () => Promise<boolean | void>
  message?: string
  detail?: string
}

/**
 * 为页面级编辑表单提供统一的路由离开与浏览器关闭保护。
 * “不离开”（关闭提示）、“不保存离开”和“保存并离开”分别对应停留、放弃修改后导航、保存后导航。
 */
export function useUnsavedChangesGuard(options: UnsavedChangesGuardOptions): void {
  const isDirty = (): boolean => Boolean(toValue(options.isDirty))

  const confirmLeave = async (): Promise<boolean> => {
    if (!isDirty()) return true
    const message = [
      options.message ?? '当前页面有未保存的修改，离开后这些修改将丢失。',
      options.detail
    ]
      .filter(Boolean)
      .join('\n')

    try {
      await ElMessageBox.confirm(message, '未保存修改', {
        type: 'warning',
        distinguishCancelAndClose: true,
        confirmButtonText: options.save ? '保存并离开' : '继续离开',
        cancelButtonText: options.save ? '不保存离开' : '不离开',
        closeOnClickModal: false,
        closeOnPressEscape: false
      })

      if (!options.save) return true
      const saved = await options.save()
      return saved !== false && !isDirty()
    } catch (error) {
      // Element Plus 用 cancel 表示点击“不保存离开”，close 表示“不离开”。
      // 关闭提示应停留当前页；点击不保存则允许继续导航。
      return error === 'cancel' && Boolean(options.save)
    }
  }

  onBeforeRouteLeave(() => confirmLeave())
  onBeforeRouteUpdate(() => confirmLeave())

  const handleBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (!isDirty()) return
    event.preventDefault()
    event.returnValue = ''
  }

  window.addEventListener('beforeunload', handleBeforeUnload)
  onBeforeUnmount(() => window.removeEventListener('beforeunload', handleBeforeUnload))
}

import { onScopeDispose, readonly, ref, type Ref } from 'vue'

export interface DelayedLoadingState {
  /** 请求是否仍在执行；用于按钮 Loading 与交互锁定。 */
  active: Readonly<Ref<boolean>>
  /** 请求持续超过延迟阈值后是否显示内容遮罩。 */
  visible: Readonly<Ref<boolean>>
  start: () => void
  stop: () => void
}

const DEFAULT_DELAY = 200

/**
 * 为页面级保存操作提供按钮即时反馈与延迟内容遮罩，避免快速请求闪烁。
 */
export const useDelayedLoading = (delay = DEFAULT_DELAY): DelayedLoadingState => {
  const active = ref(false)
  const visible = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  const clearTimer = () => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  const start = () => {
    if (active.value) return
    active.value = true
    clearTimer()
    timer = setTimeout(() => {
      timer = undefined
      if (active.value) visible.value = true
    }, delay)
  }

  const stop = () => {
    active.value = false
    visible.value = false
    clearTimer()
  }

  onScopeDispose(stop)

  return {
    active: readonly(active),
    visible: readonly(visible),
    start,
    stop
  }
}

import { readonly, ref, type Ref } from 'vue'

export interface RowActionLoadingState {
  activeKeys: Readonly<Ref<ReadonlySet<string>>>
  start: (rowId: string, action: string) => boolean
  isActive: (rowId: string, action: string) => boolean
  isRowActive: (rowId: string) => boolean
  stop: (rowId: string, action: string) => void
}

/** 限制列表中同一单据的异步操作，并为操作按钮提供行级 Loading。 */
export const useRowActionLoading = (): RowActionLoadingState => {
  const activeKeys = ref(new Set<string>())
  const getKey = (rowId: string, action: string) => `${rowId}:${action}`

  const start = (rowId: string, action: string): boolean => {
    if (isRowActive(rowId)) return false
    activeKeys.value = new Set(activeKeys.value).add(getKey(rowId, action))
    return true
  }

  const isActive = (rowId: string, action: string): boolean =>
    activeKeys.value.has(getKey(rowId, action))

  const isRowActive = (rowId: string): boolean =>
    [...activeKeys.value].some((key) => key.startsWith(`${rowId}:`))

  const stop = (rowId: string, action: string) => {
    const next = new Set(activeKeys.value)
    next.delete(getKey(rowId, action))
    activeKeys.value = next
  }

  return { activeKeys: readonly(activeKeys), start, isActive, isRowActive, stop }
}

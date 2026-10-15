import { nextTick, ref, shallowRef, toRaw, type Component, type Ref, type ShallowRef } from 'vue'

export type Awaitable<T> = T | Promise<T>
export type ArtScrollOptions =
  | number
  | {
      top?: number
      left?: number
      behavior?: 'auto' | 'smooth'
    }

/** 未保存数据的处理结果；cancel 表示取消本次关闭 */
export type ArtUnsavedDecision = 'save' | 'discard' | 'cancel'

export interface ArtUnsavedPromptRequest {
  /** 提示主文案 */
  message: string
  /** 是否允许取消（路由切换等被动关闭场景为 false） */
  allowCancel: boolean
}

/** 变更来源：即编辑表单等可编辑区域的脏状态提供方 */
export interface ArtOverlayDirtySource {
  /** 当前是否存在未保存修改 */
  isDirty: () => boolean
  /** 保存成功或重新取基线后，清除未保存标记 */
  markPristine: () => void
  /** 已修改字段的用户可读名称；没有可用名称时返回空数组 */
  getDirtyFieldLabels?: () => string[]
}

export interface ArtOverlayOptions<TData, TApi> {
  /** 内容区域是否显示加载遮罩 */
  loading?: boolean
  /** 内容加载遮罩文本 */
  loadingText?: string
  /** 内容加载遮罩背景色 */
  loadingBackground?: string
  /** 内容加载遮罩自定义 class */
  loadingCustomClass?: string
  /** 内容区域固定高度，设置后启用滚动容器 */
  contentHeight?: string | number
  /** 内容区域最大高度，超过后启用滚动容器 */
  contentMaxHeight?: string | number
  /** 是否显示底部操作区 */
  showFooter?: boolean
  /** 是否显示默认取消按钮 */
  showCancelButton?: boolean
  /** 是否显示默认确认按钮 */
  showConfirmButton?: boolean
  /** 取消按钮文字 */
  cancelText?: string
  /** 确认按钮文字 */
  confirmText?: string
  /** 确认请求超过延迟阈值后显示的内容遮罩文案 */
  confirmLoadingText?: string
  /** 是否禁用确认按钮 */
  confirmDisabled?: boolean
  /** 确认成功后是否自动关闭 */
  autoClose?: boolean
  /** 编辑态且表单没有变化时，跳过确认回调并直接按 autoClose 关闭 */
  skipConfirmWhenPristine?: boolean
  /** 关闭完成后是否重置数据和加载状态 */
  resetOnClose?: boolean
  /** 确认回调抛出异常时是否仍然关闭 */
  closeOnConfirmError?: boolean
  /** 关闭前是否检测未保存修改，默认 false */
  confirmOnClose?: boolean
  /** 未保存修改的提示文案 */
  confirmOnCloseMessage?: string
  /** 业务自定义变更检测；与已注册变更来源取并集 */
  isDirty?: () => boolean
  /** 是否始终显示滚动条 */
  scrollbarAlways?: boolean
  /** 是否使用原生滚动条 */
  nativeScrollbar?: boolean
  /** 动态内容组件 */
  content?: Component
  /** 传递给动态内容组件的属性 */
  contentProps?: Record<string, unknown>
  /** 内容挂载完成后的打开回调 */
  onOpen?: (data: TData, api: TApi) => Awaitable<void>
  /** 确认回调；返回 false 阻止自动关闭 */
  onConfirm?: (data: TData, api: TApi) => Awaitable<boolean | void>
  /** 关闭前回调；返回 false 阻止关闭 */
  onClose?: (data: TData, api: TApi) => Awaitable<boolean | void>
  /** 重置完成后的回调 */
  onReset?: (api: TApi) => void
}

export interface ArtOverlayExpose<TData, TOptions> {
  /** 当前是否显示 */
  visible: Readonly<Ref<boolean>>
  /** 内容加载状态 */
  loading: Readonly<Ref<boolean>>
  /** 确认按钮加载状态 */
  confirmLoading: Readonly<Ref<boolean>>
  /** 确认请求的内容遮罩状态（短暂请求不会闪烁） */
  confirmOverlayLoading: Readonly<Ref<boolean>>
  /** 当前打开数据 */
  data: Readonly<Ref<TData>>
  /** 当前合并后的运行时配置 */
  options: Readonly<Ref<TOptions>>
  /** 当前是否存在未保存修改；每次调用都重新判定，避免 computed 缓存导致状态陈旧 */
  isDirty: () => boolean
  /** 关闭；force=true 时跳过 onClose 拦截与未保存提示 */
  handleClose: (force?: boolean) => Promise<boolean>
  /** 执行确认流程 */
  handleConfirm: () => Promise<boolean>
  /** 恢复打开时的数据快照并清理加载状态 */
  handleReset: () => void
  /** 清除所有变更来源的未保存标记 */
  markPristine: () => void
  /** 设置内容加载状态 */
  setLoading: (value: boolean) => void
  /** 设置确认按钮加载状态 */
  setConfirmLoading: (value: boolean) => void
  /** 增量更新运行时配置 */
  setOptions: (options: Partial<TOptions>) => void
  /** 替换当前数据 */
  setData: (data: TData) => void
  /** 浅合并当前对象数据 */
  updateData: (data: Partial<TData>) => void
  /** 获取当前数据 */
  getData: () => TData
}

interface UseArtOverlayConfig<TData, TOptions, TApi> {
  getDefaultOptions: () => TOptions
  mergeOptions: (base: TOptions, override?: Partial<TOptions>) => TOptions
  getApi: () => TApi
  emitConfirm: (data: TData) => void
  emitReset: () => void
  emitError: (error: unknown) => void
  /** 确认被表单校验阻止时，由具体弹层定位其内容中的错误字段。 */
  onConfirmRejected?: () => void
  /** 未保存修改的确认交互；由具体弹层渲染。返回 undefined 表示无法询问，按放弃修改处理。 */
  confirmUnsaved?: (request: ArtUnsavedPromptRequest) => Promise<ArtUnsavedDecision>
  /** 打开流程结束后重新采集变更基线，避免把异步加载的初始数据判定为修改。 */
  onOpenSettled?: () => void
}

export const cloneOverlayData = <TValue>(value: TValue): TValue => {
  if (value === undefined || value === null) return value
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(toRaw(value))
    } catch {
      // Component instances and functions intentionally remain by reference.
    }
  }
  if (Array.isArray(value)) return value.map((item) => cloneOverlayData(item)) as TValue
  if (typeof value === 'object') return { ...(toRaw(value) as object) } as TValue
  return value
}

export const mergeOverlayRecords = <T extends Record<string, unknown> | undefined>(
  base: T,
  override: T
): T => {
  if (!base && !override) return undefined as T
  return { ...(base ?? {}), ...(override ?? {}) } as T
}

export const useArtOverlay = <TData, TApi, TOptions extends ArtOverlayOptions<TData, TApi>>(
  config: UseArtOverlayConfig<TData, TOptions, TApi>
) => {
  const visible = ref(false)
  const loading = ref(false)
  const confirmLoading = ref(false)
  const confirmOverlayLoading = ref(false)
  let confirmLoadingTimer: ReturnType<typeof setTimeout> | undefined
  const openData = ref<TData>({} as TData) as Ref<TData>
  const initialData = shallowRef<TData>({} as TData) as ShallowRef<TData>
  const options = ref<TOptions>(config.getDefaultOptions()) as Ref<TOptions>
  const closePending = ref(false)
  const unsavedSavePending = ref(false)
  const dirtySources = new Set<ArtOverlayDirtySource>()
  let openSequence = 0

  const registerDirtySource = (source: ArtOverlayDirtySource): (() => void) => {
    dirtySources.add(source)
    return () => {
      dirtySources.delete(source)
    }
  }

  const isDirty = (): boolean => {
    if (options.value.isDirty?.()) return true
    return Array.from(dirtySources).some((source) => source.isDirty())
  }

  const getDirtyFieldLabels = (): string[] => {
    const labels = new Set<string>()
    dirtySources.forEach((source) => {
      source.getDirtyFieldLabels?.().forEach((label) => labels.add(label))
    })
    return Array.from(labels)
  }

  const markPristine = () => {
    dirtySources.forEach((source) => source.markPristine())
  }

  const setLoading = (value: boolean) => {
    loading.value = value
  }

  const setConfirmLoading = (value: boolean) => {
    confirmLoading.value = value
  }

  const clearConfirmLoadingTimer = () => {
    if (confirmLoadingTimer !== undefined) {
      clearTimeout(confirmLoadingTimer)
      confirmLoadingTimer = undefined
    }
  }

  const resetConfirmOverlayLoading = () => {
    clearConfirmLoadingTimer()
    confirmOverlayLoading.value = false
  }

  const setOptions = (value: Partial<TOptions>) => {
    options.value = config.mergeOptions(options.value, value)
    if ('loading' in value) loading.value = Boolean(value.loading)
  }

  const setData = (data: TData) => {
    openData.value = data
  }

  const updateData = (data: Partial<TData>) => {
    if (openData.value && typeof openData.value === 'object') {
      openData.value = { ...openData.value, ...data }
    }
  }

  const getData = () => openData.value

  const handleReset = () => {
    openData.value = cloneOverlayData(initialData.value)
    loading.value = false
    confirmLoading.value = false
    resetConfirmOverlayLoading()
    options.value.onReset?.(config.getApi())
    config.emitReset()
  }

  const handleOpen = async (data = {} as TData, openOptions: Partial<TOptions> = {}) => {
    const sequence = ++openSequence
    options.value = config.mergeOptions(config.getDefaultOptions(), openOptions)
    const activeOptions = options.value
    loading.value = Boolean(options.value.loading)
    confirmLoading.value = false
    resetConfirmOverlayLoading()
    initialData.value = cloneOverlayData(data)
    openData.value = cloneOverlayData(data)
    closePending.value = false
    unsavedSavePending.value = false
    visible.value = true

    await nextTick()
    if (sequence !== openSequence || !visible.value) return

    try {
      await activeOptions.onOpen?.(openData.value, config.getApi())
    } catch (error) {
      if (sequence === openSequence && visible.value) config.emitError(error)
    }

    if (sequence !== openSequence || !visible.value) return
    await nextTick()
    if (sequence !== openSequence || !visible.value) return

    config.onOpenSettled?.()
  }

  /**
   * 关闭前的未保存修改确认；返回 false 表示关闭被取消。
   * 选择保存时由确认流程负责关闭弹窗，本函数不再继续关闭。
   */
  const confirmUnsavedClose = async (allowCancel = true): Promise<boolean> => {
    if (options.value.confirmOnClose !== true) return true
    // 由「保存」触发的后续关闭不再重复确认
    if (unsavedSavePending.value) return true
    // 没有未保存修改：直接放行，包括保存成功后的自动关闭
    if (!isDirty()) return true
    // 内容仍在加载时用户无法编辑，避免把异步初始数据判定为修改
    if (loading.value) return true
    // 保存进行中：关闭请求交由保存结果决定，避免中途丢弃正在提交的数据
    if (confirmLoading.value) return false

    const confirmUnsaved = config.confirmUnsaved
    // 弹层未提供确认交互时保持原有关闭行为
    if (!confirmUnsaved) return true

    const decision = await confirmUnsaved({
      message: options.value.confirmOnCloseMessage ?? '表单内容已修改，是否保存后关闭？',
      allowCancel
    })

    if (decision === 'cancel') return false

    if (decision === 'save') {
      // 释放关闭锁，允许确认流程自行关闭弹窗
      closePending.value = false
      unsavedSavePending.value = true
      try {
        const saved = await handleConfirm()
        if (saved && visible.value) await handleClose(false)
      } finally {
        unsavedSavePending.value = false
      }
      // 本次关闭请求的结论取决于弹窗是否已经关闭
      return !visible.value
    }

    return true
  }

  const handleClose = async (force = false): Promise<boolean> => {
    if (closePending.value || !visible.value) return false
    closePending.value = true

    try {
      if (!force) {
        if (!(await confirmUnsavedClose(true))) return false

        if (options.value.onClose) {
          const canClose = await options.value.onClose(openData.value, config.getApi())
          if (canClose === false) return false
        }
      }

      ++openSequence
      visible.value = false
      return true
    } catch (error) {
      config.emitError(error)
      return false
    } finally {
      closePending.value = false
    }
  }

  const handleConfirm = async (): Promise<boolean> => {
    if (confirmLoading.value || loading.value || closePending.value) return false

    if (options.value.skipConfirmWhenPristine && !isDirty()) {
      if (options.value.autoClose) {
        markPristine()
        return await handleClose()
      }
      return true
    }

    config.emitConfirm(openData.value)
    if (!options.value.onConfirm) {
      if (options.value.autoClose) {
        markPristine()
        await handleClose()
      }
      return true
    }

    confirmLoading.value = true
    clearConfirmLoadingTimer()
    confirmLoadingTimer = setTimeout(() => {
      confirmLoadingTimer = undefined
      if (confirmLoading.value) confirmOverlayLoading.value = true
    }, 200)
    try {
      const result = await options.value.onConfirm(openData.value, config.getApi())
      if (result === false) {
        await nextTick()
        config.onConfirmRejected?.()
      }
      if (result !== false) {
        // 保存成功后清除未保存标记，避免自动关闭时重复提示
        markPristine()
        if (options.value.autoClose) await handleClose()
      }
      return result !== false
    } catch (error) {
      config.emitError(error)
      if (options.value.closeOnConfirmError) {
        await handleClose(true)
      } else {
        await nextTick()
        config.onConfirmRejected?.()
      }
      return false
    } finally {
      confirmLoading.value = false
      resetConfirmOverlayLoading()
    }
  }

  const handleModelValueChange = (value: boolean) => {
    if (value) {
      visible.value = true
      return
    }
    void handleClose()
  }

  const handleClosed = () => {
    ++openSequence
    visible.value = false
    closePending.value = false
    unsavedSavePending.value = false
    if (options.value.resetOnClose) handleReset()
  }

  return {
    visible,
    loading,
    confirmLoading,
    confirmOverlayLoading,
    openData,
    options,
    isDirty,
    handleOpen,
    handleClose,
    handleConfirm,
    handleReset,
    handleModelValueChange,
    handleClosed,
    setLoading,
    setConfirmLoading,
    setOptions,
    setData,
    updateData,
    getData,
    registerDirtySource,
    markPristine,
    getDirtyFieldLabels,
    confirmUnsavedClose
  }
}

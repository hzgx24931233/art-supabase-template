<template>
  <ElDialog
    ref="dialogRef"
    :model-value="visible"
    v-bind="dialogBindings"
    :class="[
      'art-dialog',
      options.size ? `art-dialog--${options.size}` : '',
      dialogClass,
      {
        'is-fullscreen-toggle-enabled': options.showFullscreenButton,
        'has-content-top': Boolean($slots['content-top'])
      }
    ]"
    @update:model-value="handleModelValueChange"
    @open="handleOpenedStart"
    @opened="handleOpened"
    @close="handleClosedStart"
    @closed="handleClosed"
    @open-auto-focus="emit('open-auto-focus')"
    @close-auto-focus="emit('close-auto-focus')"
  >
    <template
      v-if="
        $slots.header ||
        hasSubtitle ||
        hasTitleIcon ||
        $slots['header-actions'] ||
        formCount ||
        options.showFullscreenButton
      "
      #header="{ titleId, titleClass }"
    >
      <div class="art-dialog__header" :inert="unsavedPromptOpen || confirmLoading">
        <div
          class="art-dialog__header-main"
          :class="{ 'has-header-actions': $slots['header-actions'] || formCount }"
        >
          <slot v-if="$slots.header" name="header" :data="openData" :api="exposedApi" />
          <div v-else class="art-dialog__title-row">
            <span v-if="dialogTitleIcon" class="art-dialog__title-icon" aria-hidden="true">
              <ArtSvgIcon :icon="dialogTitleIcon" />
            </span>
            <span :id="titleId" :class="titleClass">{{ dialogTitle }}</span>
          </div>
          <div v-if="hasSubtitle && !isFocusMode" class="art-dialog__subtitle">
            <slot name="subtitle" :data="openData" :api="exposedApi">
              {{ dialogSubtitle }}
            </slot>
          </div>
        </div>
        <div v-if="$slots['header-actions'] || formCount" class="art-dialog__header-actions">
          <slot name="header-actions" :data="openData" :api="exposedApi" />
          <ArtIconButton
            v-if="formCount"
            :icon="isFocusMode ? 'ri:focus-2-line' : 'ri:focus-3-line'"
            :label="isFocusMode ? '退出专注填单' : '进入专注填单'"
            :aria-pressed="isFocusMode"
            @click="toggleFocusMode"
          />
        </div>
        <ArtIconButton
          v-if="options.showFullscreenButton"
          class="el-dialog__headerbtn art-dialog__fullscreen-button"
          :icon="fullscreenIcon"
          :label="fullscreenLabel"
          @click.stop="toggleFullscreen"
        />
      </div>
    </template>
    <div
      v-if="$slots['content-top']"
      class="art-dialog__content-top"
      :inert="unsavedPromptOpen || confirmLoading"
    >
      <slot name="content-top" :data="openData" :loading="contentLoading" :api="exposedApi" />
    </div>
    <ElScrollbar
      v-if="shouldUseScrollbar"
      ref="scrollbarRef"
      :height="normalizedContentHeight"
      :max-height="normalizedContentMaxHeight"
      :always="options.scrollbarAlways"
      :native="false"
      class="art-dialog__scrollbar"
      :inert="unsavedPromptOpen || confirmLoading"
      :aria-busy="contentLoading || confirmOverlayLoading"
      @wheel.capture="handleWheelBoundary"
    >
      <div ref="contentRef" class="art-dialog__content">
        <ArtOverlayLoading
          :loading="contentLoading || confirmOverlayLoading"
          :preserve-content="confirmOverlayLoading"
          :text="confirmOverlayLoading ? options.confirmLoadingText : options.loadingText"
          :background="
            confirmOverlayLoading
              ? 'color-mix(in srgb, var(--default-box-color) 82%, transparent)'
              : options.loadingBackground
          "
          :custom-class="options.loadingCustomClass"
        >
          <component
            :is="options.content"
            v-if="options.content"
            v-bind="options.contentProps"
            :data="openData"
            :dialog-api="exposedApi"
          />
          <slot v-else :data="openData" :loading="contentLoading" :api="exposedApi" />
        </ArtOverlayLoading>
      </div>
    </ElScrollbar>

    <div
      v-else
      ref="contentRef"
      class="art-dialog__content"
      :inert="unsavedPromptOpen || confirmLoading"
      :aria-busy="contentLoading || confirmOverlayLoading"
    >
      <ArtOverlayLoading
        :loading="contentLoading || confirmOverlayLoading"
        :preserve-content="confirmOverlayLoading"
        :text="confirmOverlayLoading ? options.confirmLoadingText : options.loadingText"
        :background="
          confirmOverlayLoading
            ? 'color-mix(in srgb, var(--default-box-color) 82%, transparent)'
            : options.loadingBackground
        "
        :custom-class="options.loadingCustomClass"
      >
        <component
          :is="options.content"
          v-if="options.content"
          v-bind="options.contentProps"
          :data="openData"
          :dialog-api="exposedApi"
        />
        <slot v-else :data="openData" :loading="contentLoading" :api="exposedApi" />
      </ArtOverlayLoading>
    </div>

    <!--
      未保存修改提示：带标题、图标与拖动条的独立小窗口。
      v-if 必须有：ArtDialog 自引用渲染提示窗口，无守卫会无限嵌套。
    -->
    <ArtDialog
      v-if="unsavedPrompt"
      ref="promptDialogRef"
      class="art-dialog__unsaved-prompt"
      :show-fullscreen-button="false"
      @opened="focusUnsavedPromptAction"
      @closed="handleUnsavedPromptClosed"
    >
      <p class="art-dialog__unsaved-message">{{ unsavedPrompt.message }}</p>
      <p v-if="unsavedPrompt.detail" class="art-dialog__unsaved-detail">
        {{ unsavedPrompt.detail }}
      </p>
      <template #footer>
        <div class="art-dialog__footer">
          <div class="art-dialog__footer-actions">
            <ElButton
              v-if="unsavedPrompt.allowCancel"
              ref="promptCancelButtonRef"
              @click="handleUnsavedCancel"
            >
              取消
            </ElButton>
            <ElButton @click="handleUnsavedDiscard">
              {{ unsavedPrompt.allowCancel ? '不保存' : '不保存并关闭' }}
            </ElButton>
            <ElButton type="primary" @click="handleUnsavedSave">
              {{ unsavedPrompt.allowCancel ? '保存' : '保存并关闭' }}
            </ElButton>
          </div>
        </div>
      </template>
    </ArtDialog>

    <template v-if="options.showFooter" #footer>
      <slot name="footer" :data="openData" :loading="confirmLoading" :api="exposedApi">
        <div
          class="art-dialog__footer"
          :class="{ 'has-left': $slots['footer-left'] }"
          :inert="unsavedPromptOpen || confirmLoading"
        >
          <div v-if="$slots['footer-left']" class="art-dialog__footer-left">
            <slot name="footer-left" :data="openData" :loading="confirmLoading" :api="exposedApi" />
          </div>
          <div class="art-dialog__footer-actions">
            <ElButton
              v-if="options.showCancelButton"
              :disabled="contentLoading || confirmLoading || unsavedPromptOpen"
              @click="() => handleClose()"
            >
              {{ options.cancelText }}
            </ElButton>
            <ElButton
              v-if="options.showConfirmButton"
              type="primary"
              :loading="confirmLoading"
              :disabled="contentLoading || unsavedPromptOpen || options.confirmDisabled"
              @click="handleConfirm"
            >
              {{ options.confirmText }}
            </ElButton>
          </div>
        </div>
      </slot>
    </template>
  </ElDialog>
</template>

<script setup lang="ts" generic="T = Record<string, unknown>">
  import type { ButtonInstance, DialogInstance, ScrollbarInstance } from 'element-plus'
  import type {
    ArtDialogEmits,
    ArtDialogExpose,
    ArtDialogOptions,
    ArtDialogProps,
    ArtDialogSlots,
    ArtScrollOptions
  } from './types'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtOverlayLoading from '@/components/core/feedback/art-overlay-loading/index.vue'
  import {
    mergeOverlayRecords,
    useArtOverlay,
    type ArtUnsavedDecision,
    type ArtUnsavedPromptRequest
  } from '@/hooks/core/useArtOverlay'
  import { focusFirstInvalidFormField } from '@/utils/form/validation'
  import { handoffVerticalWheel } from '@/utils/ui/wheel-scroll'
  import { artFormOverlayKey } from '@/components/core/forms/art-form/overlay'

  defineOptions({
    name: 'ArtDialog',
    inheritAttrs: false
  })

  const props = withDefaults(defineProps<ArtDialogProps<T>>(), {
    title: '',
    titleIcon: 'ri:windows-fill',
    subtitle: '',
    width: undefined,
    size: undefined,
    fullscreen: false,
    showFullscreenButton: true,
    fullscreenText: '全屏',
    exitFullscreenText: '退出全屏',
    loading: false,
    loadingText: '',
    loadingBackground: '',
    loadingCustomClass: '',
    contentHeight: undefined,
    contentMaxHeight: undefined,
    useScrollbar: true,
    closeOnRouteChange: true,
    showFooter: true,
    showCancelButton: true,
    showConfirmButton: true,
    cancelText: '取消',
    confirmText: '确定',
    confirmLoadingText: '保存中…',
    confirmDisabled: false,
    autoClose: true,
    resetOnClose: true,
    closeOnConfirmError: false,
    confirmOnClose: false,
    scrollbarAlways: false,
    nativeScrollbar: false
  })

  const emit = defineEmits<ArtDialogEmits<T>>()

  const DEFAULT_CONTENT_MAX_HEIGHT = 'min(70vh, calc(100vh - 200px))'
  const MAX_CONTENT_VIEWPORT_HEIGHT = 'calc(100dvh - 160px)'

  const attrs = useAttrs()
  const route = useRoute()
  const slots = defineSlots<ArtDialogSlots<T>>()
  const dialogRef = shallowRef<DialogInstance>()
  const scrollbarRef = shallowRef<ScrollbarInstance>()
  const contentRef = ref<HTMLElement>()
  const formCount = ref(0)
  const isFocusMode = ref(false)
  const wasFullscreenBeforeFocus = ref(false)

  interface UnsavedPromptState {
    message: string
    detail: string
    allowCancel: boolean
  }

  const promptDialogRef = shallowRef<ArtDialogExpose<unknown>>()
  const promptCancelButtonRef = ref<ButtonInstance>()
  const unsavedPrompt = ref<UnsavedPromptState>()
  // 提示窗口打开期间冻结外层弹窗内容，避免未决状态下继续编辑
  const unsavedPromptOpen = ref(false)
  let settleUnsavedDecision: ((decision: ArtUnsavedDecision) => void) | undefined

  const setUnsavedPrompt = async (
    request: ArtUnsavedPromptRequest
  ): Promise<ArtUnsavedDecision> => {
    // 已有提示未决时不叠加，按取消关闭处理
    if (unsavedPrompt.value) return 'cancel'

    const labels = getDirtyFieldLabels()
    const detail = labels.length
      ? `已修改：${labels.slice(0, 3).join('、')}${labels.length > 3 ? ` 等 ${labels.length} 项` : ''}`
      : ''
    unsavedPrompt.value = {
      message: request.message,
      detail,
      allowCancel: request.allowCancel
    }
    unsavedPromptOpen.value = true

    // 先建立决解器，再打开窗口，避免窗口刚出现时的点击丢失
    const decision = new Promise<ArtUnsavedDecision>((resolve) => {
      settleUnsavedDecision = resolve
    })

    await nextTick()
    await promptDialogRef.value?.handleOpen(undefined, {
      title: '未保存修改',
      titleIcon: 'ri:error-warning-line',
      size: 'sm',
      loading: false,
      dialogProps: {
        // 不加第二层遮罩：窗口可拖开，方便对照被挡住的表单内容
        modal: false,
        closeOnClickModal: false,
        closeOnPressEscape: request.allowCancel,
        showClose: request.allowCancel
      },
      onClose: () => {
        settleUnsavedPrompt('cancel')
        return true
      }
    })

    return decision
  }

  const clearUnsavedPrompt = () => {
    const resolve = settleUnsavedDecision
    settleUnsavedDecision = undefined
    unsavedPromptOpen.value = false
    unsavedPrompt.value = undefined
    // 弹窗被强制关闭时，未决提示按取消关闭处理，避免关闭流程悬挂
    resolve?.('cancel')
  }

  const settleUnsavedPrompt = (decision: ArtUnsavedDecision) => {
    const resolve = settleUnsavedDecision
    settleUnsavedDecision = undefined
    // 先解除冻结，再收起提示窗口，让后续保存流程不必等待退场动画
    unsavedPromptOpen.value = false
    resolve?.(decision)
    void promptDialogRef.value?.handleClose(true)
  }

  const handleUnsavedPromptClosed = () => {
    unsavedPrompt.value = undefined
  }

  const focusUnsavedPromptAction = () => {
    // 默认聚焦「取消」，避免回车误触保存
    void nextTick(() => promptCancelButtonRef.value?.ref?.focus())
  }

  provide(artFormOverlayKey, {
    focusMode: readonly(isFocusMode),
    registerForm: () => {
      formCount.value += 1
      return () => {
        formCount.value = Math.max(0, formCount.value - 1)
      }
    }
  })

  const getDefaultOptions = (): ArtDialogOptions<T> => ({
    title: props.title,
    titleIcon: props.titleIcon,
    subtitle: props.subtitle,
    width: props.width,
    size: props.size,
    fullscreen: props.fullscreen,
    showFullscreenButton: props.showFullscreenButton,
    fullscreenText: props.fullscreenText,
    exitFullscreenText: props.exitFullscreenText,
    loading: props.loading,
    loadingText: props.loadingText,
    loadingBackground: props.loadingBackground,
    loadingCustomClass: props.loadingCustomClass,
    confirmLoadingText: props.confirmLoadingText,
    contentHeight: props.contentHeight,
    contentMaxHeight: props.contentMaxHeight,
    useScrollbar: props.useScrollbar,
    closeOnRouteChange: props.closeOnRouteChange,
    showFooter: props.showFooter,
    showCancelButton: props.showCancelButton,
    showConfirmButton: props.showConfirmButton,
    cancelText: props.cancelText,
    confirmText: props.confirmText,
    confirmDisabled: props.confirmDisabled,
    autoClose: props.autoClose,
    skipConfirmWhenPristine: props.skipConfirmWhenPristine,
    resetOnClose: props.resetOnClose,
    closeOnConfirmError: props.closeOnConfirmError,
    confirmOnClose: props.confirmOnClose,
    confirmOnCloseMessage: props.confirmOnCloseMessage,
    isDirty: props.isDirty,
    scrollbarAlways: props.scrollbarAlways,
    nativeScrollbar: props.nativeScrollbar,
    content: props.content,
    contentProps: props.contentProps,
    dialogProps: props.dialogProps,
    onOpen: props.onOpen,
    onConfirm: props.onConfirm,
    onClose: props.onClose,
    onReset: props.onReset
  })

  const mergeOptions = (
    base: ArtDialogOptions<T>,
    override: Partial<ArtDialogOptions<T>> = {}
  ): ArtDialogOptions<T> => {
    return {
      ...base,
      ...override,
      contentProps: mergeOverlayRecords(base.contentProps, override.contentProps),
      dialogProps: mergeOverlayRecords(base.dialogProps, override.dialogProps)
    }
  }

  let exposedApi!: ArtDialogExpose<T>
  const overlay = useArtOverlay<T, ArtDialogExpose<T>, ArtDialogOptions<T>>({
    getDefaultOptions,
    mergeOptions,
    getApi: () => exposedApi,
    emitConfirm: (data) => {
      if (!props.onConfirm || options.value.onConfirm !== props.onConfirm) emit('confirm', data)
    },
    emitReset: () => {
      if (!props.onReset || options.value.onReset !== props.onReset) emit('reset')
    },
    emitError: (error) => emit('error', error),
    onConfirmRejected: () => focusFirstInvalidFormField(contentRef),
    confirmUnsaved: setUnsavedPrompt,
    // 打开流程结束后重新采集基线，避免把异步加载的初始数据判定为修改
    onOpenSettled: () => overlay.markPristine()
  })

  const {
    visible,
    loading: contentLoading,
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
  } = overlay

  provide(artFormOverlayKey, {
    focusMode: readonly(isFocusMode),
    registerForm: () => {
      formCount.value += 1
      return () => {
        formCount.value = Math.max(0, formCount.value - 1)
      }
    },
    registerDirtySource
  })

  const normalizeSize = (value?: string | number) => {
    return typeof value === 'number' ? `${value}px` : value
  }

  const clampContentSizeToViewport = (value?: string) => {
    return value ? `min(${value}, ${MAX_CONTENT_VIEWPORT_HEIGHT})` : undefined
  }

  const dialogSizeMap = {
    sm: 'var(--art-dialog-width-sm)',
    md: 'var(--art-dialog-width-md)',
    lg: 'var(--art-dialog-width-lg)',
    xl: 'var(--art-dialog-width-xl)',
    full: 'calc(100vw - 24px)'
  } as const

  const isFullscreen = computed(() => Boolean(options.value.fullscreen))

  const normalizedDialogWidth = computed(() => {
    const inheritedWidth = attrs.width as string | number | undefined
    const presetWidth = options.value.size ? dialogSizeMap[options.value.size] : undefined
    const configuredWidth = options.value.width ?? inheritedWidth
    const width = normalizeSize(configuredWidth ?? presetWidth ?? '50%')
    if (!width) return undefined
    return `min(${width}, calc(100vw - 32px))`
  })

  const normalizedContentHeight = computed(() => {
    if (isFullscreen.value) return undefined
    const height = options.value.contentHeight
    return clampContentSizeToViewport(normalizeSize(height))
  })

  const normalizedContentMaxHeight = computed(() => {
    if (isFullscreen.value) return undefined
    return clampContentSizeToViewport(
      normalizeSize(
        options.value.contentMaxHeight ?? options.value.contentHeight ?? DEFAULT_CONTENT_MAX_HEIGHT
      )
    )
  })

  const shouldUseScrollbar = computed(() => {
    return Boolean(
      isFullscreen.value ||
      (options.value.useScrollbar !== false &&
        (normalizedContentHeight.value || normalizedContentMaxHeight.value))
    )
  })

  const dialogClass = computed(() => [
    attrs.class,
    (options.value.dialogProps as Record<string, unknown> | undefined)?.class,
    { 'is-focus-mode': isFocusMode.value }
  ])

  const dialogTitle = computed(() => String(options.value.title ?? attrs.title ?? ''))
  const dialogTitleIcon = computed(() => String(options.value.titleIcon ?? '').trim())
  const hasTitleIcon = computed(() => Boolean(dialogTitleIcon.value))
  const dialogSubtitle = computed(() => String(options.value.subtitle ?? ''))
  const hasSubtitle = computed(() => Boolean(slots.subtitle || dialogSubtitle.value))
  const fullscreenIcon = computed(() =>
    isFullscreen.value ? 'dashicons:fullscreen-exit-alt' : 'dashicons:fullscreen-alt'
  )
  const fullscreenLabel = computed(() =>
    isFullscreen.value
      ? String(options.value.exitFullscreenText ?? '退出全屏')
      : String(options.value.fullscreenText ?? '全屏')
  )

  const setFullscreen = (value: boolean) => {
    if (isFullscreen.value === value) return
    setOptions({ fullscreen: value } as Partial<ArtDialogOptions<T>>)
    emit('fullscreen-change', value)
  }

  const toggleFullscreen = () => {
    setFullscreen(!isFullscreen.value)
  }

  const setFocusMode = (value: boolean) => {
    if (isFocusMode.value === value) return
    if (value) {
      wasFullscreenBeforeFocus.value = isFullscreen.value
      isFocusMode.value = true
      setFullscreen(true)
    } else {
      isFocusMode.value = false
      setFullscreen(wasFullscreenBeforeFocus.value)
    }
    emit('focus-change', value)
  }

  const toggleFocusMode = () => setFocusMode(!isFocusMode.value)

  watch(isFullscreen, (fullscreen) => {
    if (!fullscreen && isFocusMode.value) {
      isFocusMode.value = false
      emit('focus-change', false)
    }
  })

  watch(
    () => props.loading,
    (value) => setLoading(value)
  )

  watch(
    () => route.fullPath,
    (currentPath, previousPath) => {
      if (
        currentPath !== previousPath &&
        visible.value &&
        options.value.closeOnRouteChange !== false
      ) {
        // 路由已切换：只保留保存/放弃两个选择，避免弹窗悬停在新页面上
        void confirmUnsavedClose(false).then((canClose) => {
          if (canClose) void handleClose(true)
        })
      }
    }
  )

  // 选择保存后交给确认流程：面板收起，由弹窗自己的确认 loading 反映保存进度
  const handleUnsavedSave = () => {
    settleUnsavedPrompt('save')
  }
  const handleUnsavedDiscard = () => {
    settleUnsavedPrompt('discard')
  }
  const handleUnsavedCancel = () => {
    settleUnsavedPrompt('cancel')
  }

  /**
   * X、ESC 与遮罩点击统一转交关闭流程，保证 onClose 拦截与未保存提示对所有关闭入口生效。
   * Element Plus 只在本回调调用 done() 时才关闭弹窗，这里改为由统一的关闭流程处理。
   */
  const handleDialogBeforeClose = () => {
    const userBeforeClose = options.value.dialogProps?.beforeClose ?? props.beforeClose
    if (typeof userBeforeClose === 'function') {
      userBeforeClose((cancel?: boolean) => {
        if (cancel) return
        void handleClose()
      })
      return
    }
    void handleClose()
  }

  const dialogBindings = computed<Record<string, unknown>>(() => {
    const runtimeProps = options.value.dialogProps ?? {}
    const inheritedAttrs = { ...attrs } as Record<string, unknown>
    delete inheritedAttrs.class
    const runtimeBindings = { ...runtimeProps }
    delete runtimeBindings.class
    delete inheritedAttrs.modelValue
    delete inheritedAttrs['onUpdate:modelValue']
    delete inheritedAttrs.onOpen
    delete inheritedAttrs.onOpened
    delete inheritedAttrs.onClose
    delete inheritedAttrs.onClosed
    delete inheritedAttrs.onOpenAutoFocus
    delete inheritedAttrs.onCloseAutoFocus

    return {
      alignCenter: true,
      appendToBody: true,
      destroyOnClose: true,
      draggable: true,
      ...inheritedAttrs,
      ...runtimeBindings,
      // Element Plus 的 beforeClose 是普通 prop；统一入口后由 handleDialogBeforeClose 决定是否关闭
      beforeClose: handleDialogBeforeClose,
      title: dialogTitle.value,
      width: normalizedDialogWidth.value,
      fullscreen: Boolean(options.value.fullscreen)
    }
  })

  const getDialogInstance = () => dialogRef.value

  const scrollTo = (scrollOptions: ArtScrollOptions) => {
    scrollbarRef.value?.scrollTo(scrollOptions as never)
  }

  const handleWheelBoundary = (event: WheelEvent): void => {
    const scrollOwner = scrollbarRef.value?.wrapRef
    handoffVerticalWheel(event, scrollOwner, scrollOwner)
  }

  const handleOpenedStart = () => {
    if (!props.onOpen || options.value.onOpen !== props.onOpen) emit('open', openData.value)
  }
  const handleOpened = () => emit('opened', openData.value)
  const handleClosedStart = () => {
    if (!props.onClose || options.value.onClose !== props.onClose) emit('close', openData.value)
  }

  const handleClosed = () => {
    if (isFocusMode.value) {
      isFocusMode.value = false
      emit('focus-change', false)
    }
    wasFullscreenBeforeFocus.value = false
    clearUnsavedPrompt()
    overlay.handleClosed()
    emit('closed')
  }

  exposedApi = {
    visible: readonly(visible),
    loading: readonly(contentLoading),
    confirmLoading: readonly(confirmLoading),
    confirmOverlayLoading: readonly(confirmOverlayLoading),
    data: readonly(openData) as Readonly<Ref<T>>,
    fullscreen: readonly(isFullscreen),
    focusMode: readonly(isFocusMode),
    options: readonly(options) as Readonly<Ref<ArtDialogOptions<T>>>,
    dialogRef: readonly(dialogRef),
    scrollbarRef: readonly(scrollbarRef),
    isDirty,
    handleOpen,
    handleClose,
    handleConfirm,
    handleReset,
    markPristine,
    setLoading,
    setConfirmLoading,
    setFullscreen,
    toggleFullscreen,
    setFocusMode,
    toggleFocusMode,
    setOptions,
    setData,
    updateData,
    getData,
    getDialogInstance,
    scrollTo
  }

  defineExpose(exposedApi)
</script>

<style scoped lang="scss">
  :global(.art-dialog) {
    max-width: calc(100vw - 32px);
  }

  :global(.art-dialog:not(.is-fullscreen)) {
    display: flex;
    flex-direction: column;
    max-height: calc(100dvh - 16px);
    overflow: hidden;
  }

  :global(.art-dialog:not(.is-fullscreen) > .el-dialog__header),
  :global(.art-dialog:not(.is-fullscreen) > .el-dialog__footer) {
    flex: none;
  }

  :global(.art-dialog:not(.is-fullscreen) > .el-dialog__body) {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  :global(.art-dialog.has-content-top > .el-dialog__body) {
    display: flex;
    flex-direction: column;
  }

  :global(.art-dialog.has-content-top .art-dialog__scrollbar) {
    flex: 0 1 auto;
    min-height: 0;
  }

  :global(.art-dialog > .el-dialog__body) {
    overscroll-behavior: contain;
  }

  :global(.art-dialog.is-fullscreen) {
    display: flex;
    flex-direction: column;
    max-width: none;
    overflow: hidden;
  }

  :global(.art-dialog.is-fullscreen > .el-dialog__header),
  :global(.art-dialog.is-fullscreen > .el-dialog__footer) {
    flex: none;
  }

  :global(.art-dialog.is-fullscreen > .el-dialog__body) {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  :global(.art-dialog.is-focus-mode .art-dialog__content) {
    box-sizing: border-box;
    width: min(100%, 1120px);
    margin-inline: auto;
  }

  :global(.art-dialog.is-focus-mode .art-form .el-form-item) {
    margin-bottom: 14px;
  }

  :global(.art-dialog.is-focus-mode .art-entity-summary),
  :global(.art-dialog.is-focus-mode [data-art-dialog-focus-hide]) {
    display: none;
  }

  .art-dialog {
    &__header {
      display: flex;
      align-items: center;
      min-width: 0;
      min-height: 24px;
    }

    &__header-main {
      flex: 1;
      min-width: 0;

      &.has-header-actions {
        padding-right: 72px;
      }
    }

    &__title-row {
      display: flex;
      gap: var(--art-space-2);
      align-items: center;
      min-width: 0;

      > .el-dialog__title {
        min-width: 0;
        overflow-wrap: anywhere;
      }
    }

    &__title-icon {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 10%, transparent);
      border-radius: var(--art-control-radius);

      :deep(svg) {
        width: 16px;
        height: 16px;
      }
    }

    &__header-actions {
      position: absolute;
      top: 12px;
      right: 92px;
      display: flex;
      gap: 8px;
      align-items: center;
      min-height: 32px;
    }

    &__fullscreen-button {
      right: 52px !important;
    }

    &__content-top {
      flex: none;
      min-width: 0;
      padding: var(--art-space-4) var(--art-space-5) 0;
    }

    &__content {
      box-sizing: border-box;
      min-height: 1px;
      padding: var(
        --art-dialog-content-padding,
        var(--art-space-4) var(--art-space-5) var(--art-space-5)
      );
    }

    &__subtitle {
      margin-top: 3px;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 13px;
      line-height: 20px;
      color: var(--el-text-color-secondary);
      overflow-wrap: anywhere;
    }

    &__unsaved-message {
      margin: 0;
      font-size: 14px;
      line-height: 22px;
      color: var(--el-text-color-primary);
      overflow-wrap: anywhere;
    }

    &__unsaved-detail {
      margin: var(--art-space-2) 0 0;
      font-size: 13px;
      line-height: 20px;
      color: var(--el-text-color-secondary);
      overflow-wrap: anywhere;
    }

    &__scrollbar {
      width: 100%;

      :deep(.el-scrollbar__wrap) {
        overscroll-behavior: contain;
      }
    }

    &__footer {
      display: flex;
      gap: 0;
      align-items: center;
      justify-content: flex-end;
      width: 100%;

      &.has-left {
        justify-content: space-between;
      }
    }

    &__footer-left {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 14px;
      color: var(--el-text-color-secondary);
      white-space: nowrap;
    }

    &__footer-actions {
      display: flex;
      flex: none;
      gap: var(--art-space-2);

      > .el-button {
        min-width: 72px;
        margin-left: 0;
      }
    }
  }

  :global(.art-dialog > .el-dialog__header .el-dialog__headerbtn) {
    top: 12px;
    right: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    color: var(--el-text-color-secondary);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--art-control-radius);
    transition:
      color var(--art-motion-duration-fast) ease,
      background-color var(--art-motion-duration-fast) ease,
      border-color var(--art-motion-duration-fast) ease,
      box-shadow var(--art-motion-duration-fast) ease;
  }

  :global(.art-dialog > .el-dialog__header .el-dialog__headerbtn:hover) {
    color: var(--theme-color);
    background: color-mix(in srgb, var(--theme-color) 9%, transparent);
    border-color: transparent;
    box-shadow: var(--art-themed-action-hover-shadow);
  }

  :global(.art-dialog > .el-dialog__header .el-dialog__headerbtn:focus-visible) {
    color: var(--theme-color);
    outline: none;
    box-shadow: var(--art-themed-action-focus-shadow);
  }

  :global(.art-dialog > .el-dialog__header .el-dialog__headerbtn .el-dialog__close) {
    position: static;
    width: 18px;
    height: 18px;
    color: currentcolor;
    background: transparent !important;
    border-radius: 0;
  }

  :global(.art-dialog > .el-dialog__body > .art-dialog__content > .art-form),
  :global(
    .art-dialog > .el-dialog__body > .art-dialog__scrollbar .art-dialog__content > .art-form
  ) {
    padding: 0 !important;
  }
</style>

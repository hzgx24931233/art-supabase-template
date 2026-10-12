<template>
  <Transition name="art-unsaved-panel">
    <div v-if="open" class="art-unsaved-panel">
      <div
        ref="cardRef"
        class="art-unsaved-panel__card"
        role="alertdialog"
        :aria-labelledby="`${titleId}`"
        :aria-describedby="`${descriptionId}`"
        aria-modal="false"
        tabindex="-1"
        @keydown.esc.stop.prevent="handleCancel"
      >
        <div class="art-unsaved-panel__header">
          <span class="art-unsaved-panel__icon" aria-hidden="true">
            <ArtSvgIcon icon="ri:error-warning-line" />
          </span>
          <span :id="titleId" class="art-unsaved-panel__title">未保存修改</span>
        </div>
        <p :id="descriptionId" class="art-unsaved-panel__message">{{ message }}</p>
        <p v-if="detail" class="art-unsaved-panel__detail">{{ detail }}</p>
        <div class="art-unsaved-panel__actions">
          <ElButton v-if="allowCancel" ref="cancelButtonRef" @click="handleCancel"> 取消 </ElButton>
          <ElButton @click="emit('discard')">
            {{ discardText }}
          </ElButton>
          <ElButton ref="saveButtonRef" type="primary" @click="emit('save')">
            {{ saveText }}
          </ElButton>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
  import { computed, nextTick, onMounted, ref, useId, watch } from 'vue'
  import type { ButtonInstance } from 'element-plus'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'

  defineOptions({ name: 'ArtUnsavedChangesPanel' })

  const props = withDefaults(
    defineProps<{
      /** 是否显示提示 */
      open?: boolean
      /** 提示主文案 */
      message?: string
      /** 附加说明，例如已修改字段 */
      detail?: string
      /** 是否提供取消；被动关闭场景为 false */
      allowCancel?: boolean
    }>(),
    {
      open: false,
      message: '表单内容已修改，是否保存后关闭？',
      detail: '',
      allowCancel: true
    }
  )

  const emit = defineEmits<{
    save: []
    discard: []
    cancel: []
  }>()

  const titleId = `art-unsaved-title-${useId()}`
  const descriptionId = `art-unsaved-message-${useId()}`
  const cardRef = ref<HTMLElement>()
  const cancelButtonRef = ref<ButtonInstance>()
  const saveButtonRef = ref<ButtonInstance>()

  // 被动关闭场景没有取消，主操作放在保存上
  const saveText = computed(() => (props.allowCancel ? '保存' : '保存并关闭'))
  const discardText = computed(() => (props.allowCancel ? '不保存' : '不保存并关闭'))

  const handleCancel = () => {
    if (!props.allowCancel) return
    emit('cancel')
  }

  const focusPrimaryAction = () => {
    const target = props.allowCancel ? cancelButtonRef.value?.ref : saveButtonRef.value?.ref
    target?.focus()
  }

  onMounted(() => {
    void nextTick(focusPrimaryAction)
  })

  watch(
    () => props.open,
    (open) => {
      if (open) void nextTick(focusPrimaryAction)
    }
  )
</script>

<style scoped lang="scss">
  .art-unsaved-panel {
    position: absolute;
    inset: 0;
    z-index: 8;
    display: flex;
    padding: var(--art-space-4);
    overflow: auto;
    background: color-mix(in srgb, var(--default-bg-color) 68%, transparent);
    backdrop-filter: blur(2px);
  }

  .art-unsaved-panel__card {
    box-sizing: border-box;
    width: min(100%, 420px);
    padding: var(--art-space-5);
    margin: auto;
    background: var(--default-box-color);
    border: 1px solid var(--art-modal-surface-border, var(--art-card-border));
    border-radius: var(--art-floating-radius);
    box-shadow: var(--art-modal-surface-shadow, var(--art-floating-shadow));
    outline: none;
  }

  .art-unsaved-panel__header {
    display: flex;
    gap: var(--art-space-2);
    align-items: center;
    margin-bottom: var(--art-space-3);
  }

  .art-unsaved-panel__icon {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    color: var(--el-color-warning);
    background: color-mix(in srgb, var(--el-color-warning) 12%, transparent);
    border-radius: var(--art-control-radius);

    :deep(svg) {
      width: 16px;
      height: 16px;
    }
  }

  .art-unsaved-panel__title {
    font-size: 15px;
    font-weight: 600;
    line-height: 22px;
    color: var(--el-text-color-primary);
  }

  .art-unsaved-panel__message {
    margin: 0;
    font-size: 14px;
    line-height: 22px;
    color: var(--el-text-color-primary);
    overflow-wrap: anywhere;
  }

  .art-unsaved-panel__detail {
    margin: var(--art-space-2) 0 0;
    font-size: 13px;
    line-height: 20px;
    color: var(--el-text-color-secondary);
    overflow-wrap: anywhere;
  }

  .art-unsaved-panel__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--art-space-2);
    justify-content: flex-end;
    margin-top: var(--art-space-5);

    > .el-button {
      min-width: 72px;
      margin-left: 0;
    }
  }

  .art-unsaved-panel-enter-active,
  .art-unsaved-panel-leave-active {
    transition: opacity var(--art-motion-duration-fast) ease;
  }

  .art-unsaved-panel-enter-from,
  .art-unsaved-panel-leave-to {
    opacity: 0;
  }
</style>

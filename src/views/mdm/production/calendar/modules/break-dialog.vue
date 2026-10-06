<template>
  <ArtDialog ref="dialogRef" size="md">
    <ElAlert
      :title="`${form.shift.name} · ${form.shift.startTime} — ${form.shift.endTime}，休息时段需按时间先后填写。`"
      type="info"
      :closable="false"
    />
    <ArtForm
      v-model="form"
      :items="[{ key: 'rows', label: '休息时段', span: 24 }]"
      :show-submit="false"
      :show-reset="false"
    >
      <template #rows>
        <div class="break-dialog">
          <div v-for="(row, index) in form.rows" :key="index" class="break-dialog__row">
            <ElTimePicker
              v-model="row.startTime"
              format="HH:mm"
              value-format="HH:mm"
              :clearable="false"
              :aria-label="`休息 ${index + 1} 开始时间`"
            />
            <span>至</span>
            <ElTimePicker
              v-model="row.endTime"
              format="HH:mm"
              value-format="HH:mm"
              :clearable="false"
              :aria-label="`休息 ${index + 1} 结束时间`"
            />
            <ArtIconButton
              icon="ri:delete-bin-line"
              :label="`删除休息时段 ${index + 1}`"
              @click="form.rows.splice(index, 1)"
            />
          </div>
          <ElButton
            :disabled="form.rows.length >= 20"
            @click="
              form.rows.push({ startTime: form.shift.startTime, endTime: form.shift.startTime })
            "
            >添加休息时段</ElButton
          >
          <p :class="preview.error ? 'is-error' : ''">{{
            preview.error || `合计休息 ${preview.minutes} 分钟`
          }}</p>
        </div>
      </template>
    </ArtForm>
  </ArtDialog>
</template>
<script setup lang="ts">
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { ref, reactive, computed } from 'vue'
  import { cloneDeep } from 'lodash-es'
  import { ElMessage } from 'element-plus'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import type { ProductionShift, ShiftBreak } from '@/api/mdm'
  import { calculateBreaks } from '../../modules/production-model'
  const dialogRef = ref<ArtDialogExpose>()
  const form = reactive({
    shift: { name: '', startTime: '08:00', endTime: '17:00' },
    rows: [] as ShiftBreak[]
  })
  const preview = computed(() => {
    try {
      return { minutes: calculateBreaks(form.shift, form.rows), error: '' }
    } catch (error) {
      return { minutes: 0, error: getFriendlySupabaseErrorMessage(error, '休息时间无效') }
    }
  })
  async function handleOpen(shift: ProductionShift, onSave: (rows: ShiftBreak[]) => void) {
    Object.assign(form, { shift: cloneDeep(shift), rows: cloneDeep(shift.breaks) })
    await dialogRef.value?.handleOpen(undefined, {
      title: '休息时段设置',
      confirmText: '保存休息时段',
      onConfirm: () => {
        if (preview.value.error) {
          ElMessage.warning(preview.value.error)
          return false
        }
        onSave(cloneDeep(form.rows))
      }
    })
  }
  defineExpose({ handleOpen })
</script>
<style scoped lang="scss">
  .break-dialog {
    display: grid;
    gap: 12px;
    width: 100%;

    &__row {
      display: flex;
      gap: 8px;
      align-items: center;

      :deep(.el-date-editor) {
        flex: 1;
        width: 0;
      }
    }

    p {
      margin: 0;
      color: var(--el-text-color-secondary);
    }

    .is-error {
      color: var(--el-color-danger);
    }
  }
</style>

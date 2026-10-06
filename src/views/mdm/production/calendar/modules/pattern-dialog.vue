<template>
  <ArtDialog ref="dialogRef" size="xl">
    <ArtForm
      ref="formRef"
      v-model="form.model"
      :items="items"
      :rules="rules"
      :span="12"
      :show-reset="false"
      :show-submit="false"
    >
      <template #color><ElColorPicker v-model="form.model.color" :predefine="colors" /></template>
      <template #shifts>
        <div class="pattern-dialog__shifts">
          <div class="pattern-dialog__summary">
            <span
              ><ArtSvgIcon icon="ri:time-line" />已配置 {{ form.model.shifts.length }} 个班次</span
            >
            <strong>日生产时长 {{ totalWorkMinutes }} 分钟</strong>
          </div>
          <ArtSectionCard
            v-for="(shift, index) in form.model.shifts"
            :key="index"
            :title="`班次 ${index + 1}`"
            :subtitle="shiftSummary(index)"
          >
            <template #actions
              ><ArtIconButton
                icon="ri:delete-bin-line"
                :label="`删除班次 ${index + 1}`"
                :disabled="form.model.shifts.length === 1"
                @click="form.model.shifts.splice(index, 1)"
            /></template>
            <ArtForm
              v-model="form.model.shifts[index]"
              :items="shiftItems"
              :span="8"
              :show-submit="false"
              :show-reset="false"
            >
              <template #breaks>
                <ElButton @click="openBreaks(index)"
                  >休息 {{ computedShift(index)?.restMinutes ?? 0 }} 分钟</ElButton
                >
              </template>
              <template #handoverMinutes>
                <div class="pattern-dialog__handover">
                  <ElInputNumber
                    :model-value="
                      shift.handoverAuto
                        ? (computedShift(index)?.handoverMinutes ?? 0)
                        : shift.handoverMinutes
                    "
                    @update:model-value="(value) => (shift.handoverMinutes = value ?? 0)"
                    :disabled="shift.handoverAuto"
                    :min="0"
                    :max="1439"
                    :precision="0"
                    :aria-label="`班次 ${index + 1} 交班分钟`"
                  />
                  <ElCheckbox v-model="shift.handoverAuto">自动计算</ElCheckbox>
                  <span v-if="shift.handoverAuto"
                    >{{ computedShift(index)?.handoverMinutes ?? 0 }} 分钟</span
                  >
                </div>
              </template>
            </ArtForm>
          </ArtSectionCard>
          <ElButton
            type="primary"
            plain
            :disabled="form.model.shifts.length >= 12"
            @click="addShift"
            >新增班次</ElButton
          >
          <ElAlert
            v-if="calculation.error"
            :title="calculation.error"
            type="warning"
            :closable="false"
          />
        </div>
      </template>
    </ArtForm>
    <BreakDialog ref="breakDialog" />
  </ArtDialog>
</template>
<script setup lang="ts">
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { ref, reactive, computed } from 'vue'
  import { cloneDeep, pick } from 'lodash-es'
  import { ElMessage } from 'element-plus'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import {
    saveShiftPattern,
    type ShiftPattern,
    type ShiftPatternInput,
    type ProductionShift
  } from '@/api/mdm'
  import { calculateShifts } from '../../modules/production-model'
  import BreakDialog from './break-dialog.vue'
  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const breakDialog = ref<InstanceType<typeof BreakDialog>>()
  const colors = ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#9b59b6', '#168a8a']
  const createShift = (): ProductionShift => ({
    name: '白班',
    startTime: '08:00',
    endTime: '17:00',
    breaks: [],
    handoverAuto: true,
    handoverMinutes: 0
  })
  const createModel = (): ShiftPatternInput => ({
    departmentId: '',
    name: '',
    description: '',
    color: '#409eff',
    sort: 0,
    shifts: [createShift()]
  })
  const form = reactive({ model: createModel(), id: undefined as string | undefined })
  const rules = {
    name: [{ required: true, message: '请输入轮班模式名称', trigger: 'blur' }],
    color: [{ required: true, message: '请选择日历颜色', trigger: 'change' }]
  }
  const items: FormItem[] = [
    { key: 'name', label: '轮班模式', type: 'input', props: { maxlength: 120 } },
    { key: 'color', label: '日历颜色', span: 6 },
    { key: 'sort', label: '排序', span: 6, type: 'number', props: { min: 0, precision: 0 } },
    { key: 'description', label: '描述', type: 'textarea', props: { rows: 2, maxlength: 1000 } },
    { key: 'shiftSection', label: '班次安排', type: 'divider', span: 24 },
    {
      key: 'shifts',
      label: '班次明细',
      span: 24,
      help: '结束时间早于开始时间表示跨午夜班次。自动交班按当前班次与下一班次的重叠时间计算。'
    }
  ]
  const shiftItems: FormItem[] = [
    { key: 'name', label: '班次名称', type: 'input' },
    {
      key: 'startTime',
      label: '开始时间',
      type: 'timePicker',
      props: { format: 'HH:mm', valueFormat: 'HH:mm', clearable: false }
    },
    {
      key: 'endTime',
      label: '结束时间',
      type: 'timePicker',
      props: { format: 'HH:mm', valueFormat: 'HH:mm', clearable: false }
    },
    { key: 'breaks', label: '休息时段' },
    { key: 'handoverMinutes', label: '交班时长（分钟）', span: 16 }
  ]
  const calculation = computed(() => {
    try {
      return { shifts: calculateShifts(form.model.shifts), error: '' }
    } catch (error) {
      return {
        shifts: [] as ProductionShift[],
        error: getFriendlySupabaseErrorMessage(error, '班次配置无效')
      }
    }
  })
  const computedShift = (index: number) => calculation.value.shifts[index]
  const totalWorkMinutes = computed(() =>
    calculation.value.shifts.reduce((total, shift) => total + (shift.workMinutes || 0), 0)
  )
  const shiftSummary = (index: number) =>
    computedShift(index)
      ? `净生产时长 ${computedShift(index)?.workMinutes} 分钟 · 休息 ${computedShift(index)?.restMinutes} 分钟`
      : '请完善班次时间'
  function addShift() {
    form.model.shifts.push({ ...createShift(), name: '夜班', startTime: '17:00', endTime: '08:00' })
  }
  function openBreaks(index: number) {
    void breakDialog.value?.handleOpen(form.model.shifts[index], (rows) => {
      form.model.shifts[index].breaks = rows
    })
  }
  async function handleOpen(departmentId: string, row?: ShiftPattern) {
    form.id = row?.id
    form.model = row
      ? (cloneDeep(pick(row, Object.keys(createModel()))) as ShiftPatternInput)
      : { ...createModel(), departmentId }
    await dialogRef.value?.handleOpen(undefined, {
      title: row ? '编辑轮班模式' : '新增轮班模式',
      subtitle: row ? `正在维护：${row.name}` : '定义一套可复用的班次与休息安排',
      confirmText: row ? '保存更改' : '创建轮班模式',
      contentMaxHeight: '72vh',
      onConfirm: async () => {
        try {
          await formRef.value?.validate()
          if (calculation.value.error) {
            ElMessage.warning(calculation.value.error)
            return false
          }
          await saveShiftPattern(
            { ...form.model, name: form.model.name.trim(), shifts: calculation.value.shifts },
            form.id
          )
          emit('success')
        } catch {
          return false
        }
      }
    })
  }
  defineExpose({ handleOpen })
</script>
<style scoped lang="scss">
  .pattern-dialog {
    &__shifts {
      display: grid;
      gap: 16px;
      width: 100%;
    }

    &__summary {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      font-size: 12px;
      color: var(--el-text-color-secondary);
      background: var(--el-fill-color-light);
      border-radius: var(--el-border-radius-base);

      span {
        display: inline-flex;
        gap: 6px;
        align-items: center;
      }

      strong {
        color: var(--el-text-color-primary);
      }
    }

    &__handover {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;

      > span {
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }
  }
</style>

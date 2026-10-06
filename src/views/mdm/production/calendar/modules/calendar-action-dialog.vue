<template>
  <ArtDialog ref="dialogRef" size="md">
    <div class="calendar-action-dialog">
      <div class="calendar-action-dialog__intro">
        <span aria-hidden="true"><ArtSvgIcon :icon="context.icon" /></span>
        <div>
          <strong>{{ context.title }}</strong>
          <p>{{ context.description }}</p>
        </div>
      </div>
      <ElAlert
        v-if="form.dates.length"
        :title="`将更新已选择的 ${form.dates.length} 个日期，原有排班将被覆盖。`"
        type="warning"
        :closable="false"
        show-icon
      />
      <ArtForm
        ref="formRef"
        v-model="form.model"
        :items="items"
        :show-submit="false"
        :show-reset="false"
        :span="24"
        label-position="top"
      />
    </div>
  </ArtDialog>
</template>
<script setup lang="ts">
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { ref, reactive, computed } from 'vue'
  import dayjs from 'dayjs'
  import { ElMessage } from 'element-plus'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import {
    setProductionCalendar,
    replaceProductionCalendarRange,
    referenceShiftPatterns,
    saveCalendarReminder,
    type ShiftPattern,
    type ProductionDepartment,
    type CalendarReminder
  } from '@/api/mdm'
  import { datesInRange, productionToday } from '../../modules/production-model'
  import { ALL_SHIFT_WEEKDAYS, SHIFT_WEEKDAY_OPTIONS } from '../../modules/shift-schedule-policy'
  type Kind = 'batch' | 'reference' | 'reminder'
  interface OpenData {
    kind: Kind
    departmentId: string
    patterns?: ShiftPattern[]
    departments?: ProductionDepartment[]
    dates?: string[]
    reminder?: CalendarReminder | null
  }
  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const form = reactive({
    kind: 'batch' as Kind,
    departmentId: '',
    patterns: [] as ShiftPattern[],
    departments: [] as ProductionDepartment[],
    dates: [] as string[],
    reminderId: undefined as string | undefined,
    model: {
      patternId: '',
      range: [] as string[],
      weekdays: [...ALL_SHIFT_WEEKDAYS],
      includeStatutoryHolidays: false,
      sourceId: '',
      enabled: true,
      leadDays: 7
    }
  })
  const items = computed<FormItem[]>(() => {
    if (form.kind === 'reference')
      return [
        {
          key: 'sourceId',
          label: '参考产线',
          type: 'select',
          options: form.departments
            .filter((d) => d.id !== form.departmentId)
            .map((d) => ({ label: `${d.name} · ${d.code}`, value: d.id })),
          props: { filterable: true },
          help: '仅在当前产线没有轮班模式时可参考，复制后独立维护。'
        }
      ]
    if (form.kind === 'reminder')
      return [
        { key: 'enabled', label: '开启日历提醒', type: 'switch' },
        {
          key: 'leadDays',
          label: '提前提醒天数',
          type: 'number',
          props: { min: 1, max: 30, precision: 0 }
        }
      ]
    return [
      {
        key: 'patternId',
        label: '轮班模式',
        type: 'select',
        options: form.patterns.map((p) => ({ label: p.name, value: p.id })),
        props: { filterable: true }
      },
      {
        key: 'range',
        label: '日期范围',
        type: 'date',
        hidden: form.dates.length > 0,
        props: {
          type: 'daterange',
          valueFormat: 'YYYY-MM-DD',
          startPlaceholder: '开始日期',
          endPlaceholder: '结束日期',
          disabledDate: (date: Date) => dayjs(date).format('YYYY-MM-DD') <= productionToday()
        }
      },
      {
        key: 'weekdays',
        label: '适用星期',
        type: 'checkboxGroup',
        hidden: form.dates.length > 0,
        options: SHIFT_WEEKDAY_OPTIONS.map((option) => ({ ...option })),
        help: '未勾选的星期会从本次日期范围中清除，不再应用轮班模式。'
      },
      {
        key: 'includeStatutoryHolidays',
        label: '法定假日',
        type: 'checkbox',
        hidden: form.dates.length > 0,
        slots: { default: () => '法定假日参与排班' },
        help: '勾选后，所选星期遇到法定假日仍安排轮班；不勾选则自动排除。'
      }
    ]
  })
  const context = computed(() => {
    if (form.kind === 'reference')
      return {
        icon: 'ri:file-copy-line',
        title: '复制一套可继续维护的轮班模式',
        description: '只复制模式和班次结构，不会复制源产线已经安排的日历日期。'
      }
    if (form.kind === 'reminder')
      return {
        icon: 'ri:notification-3-line',
        title: '提前发现尚未排班的生产日期',
        description: '提醒只用于页面提示，不会自动修改现有轮班模式或生产日历。'
      }
    return {
      icon: 'ri:calendar-check-line',
      title: '把轮班模式应用到指定日期',
      description: form.dates.length
        ? '本次仅处理已选择日期。'
        : '可按日期范围和星期批量生成生产日历。'
    }
  })
  async function handleOpen(data: OpenData) {
    Object.assign(form, {
      kind: data.kind,
      departmentId: data.departmentId,
      patterns: data.patterns ?? [],
      departments: data.departments ?? [],
      dates: data.dates ?? [],
      reminderId: data.reminder?.id
    })
    form.model = {
      patternId: data.patterns?.[0]?.id ?? '',
      range: [
        dayjs(productionToday()).add(1, 'day').format('YYYY-MM-DD'),
        dayjs(productionToday()).add(1, 'month').endOf('month').format('YYYY-MM-DD')
      ],
      weekdays: [...ALL_SHIFT_WEEKDAYS],
      includeStatutoryHolidays: false,
      sourceId: '',
      enabled: data.reminder?.enabled ?? true,
      leadDays: data.reminder?.leadDays ?? 7
    }
    await dialogRef.value?.handleOpen(undefined, {
      title:
        data.kind === 'reference'
          ? '参考其他产线轮班模式'
          : data.kind === 'reminder'
            ? '日历提醒设置'
            : form.dates.length
              ? '修改选中日期排班'
              : '批量设置生产日历',
      subtitle:
        data.kind === 'reference'
          ? '从已有产线快速建立独立的班次配置'
          : data.kind === 'reminder'
            ? '配置当前生产组织的排班覆盖提醒'
            : '选择轮班模式并明确生效日期',
      confirmText:
        data.kind === 'reference'
          ? '复制轮班模式'
          : data.kind === 'reminder'
            ? '保存提醒'
            : '应用到日历',
      contentMaxHeight: '60vh',
      onConfirm: async () => {
        if (form.kind === 'batch' && !form.model.patternId) {
          ElMessage.warning('请选择轮班模式')
          return false
        }
        if (form.kind === 'batch' && !form.dates.length && !form.model.weekdays.length) {
          ElMessage.warning('请至少选择一个参与排班的星期')
          return false
        }
        if (form.kind === 'reference' && !form.model.sourceId) {
          ElMessage.warning('请选择参考产线')
          return false
        }
        const dates = form.dates
        if (form.kind === 'batch' && !dates.length) {
          try {
            datesInRange(form.model.range?.[0], form.model.range?.[1], form.model.weekdays)
          } catch (error) {
            ElMessage.warning(getFriendlySupabaseErrorMessage(error, '日期范围无效'))
            return false
          }
        }
        try {
          if (form.kind === 'batch') {
            if (dates.length) {
              await setProductionCalendar(form.departmentId, form.model.patternId, dates)
            } else {
              await replaceProductionCalendarRange(
                form.departmentId,
                form.model.patternId,
                form.model.range[0],
                form.model.range[1],
                form.model.weekdays,
                form.model.includeStatutoryHolidays
              )
            }
          } else if (form.kind === 'reference')
            await referenceShiftPatterns(form.model.sourceId, form.departmentId)
          else
            await saveCalendarReminder({
              id: form.reminderId,
              departmentId: form.departmentId,
              enabled: form.model.enabled,
              leadDays: form.model.leadDays
            })
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
  .calendar-action-dialog {
    display: grid;
    gap: 16px;

    &__intro {
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 14px;
      background: var(--el-fill-color-light);
      border-radius: var(--el-border-radius-base);

      > span {
        display: grid;
        flex: none;
        place-items: center;
        width: 40px;
        height: 40px;
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 10%, var(--el-bg-color));
        border-radius: var(--el-border-radius-base);
      }

      strong {
        color: var(--el-text-color-primary);
      }

      p {
        margin: 4px 0 0;
        font-size: 13px;
        line-height: 1.6;
        color: var(--el-text-color-secondary);
      }
    }
  }
</style>

<template>
  <ArtDialog
    ref="dialogRef"
    size="sm"
    :close-on-click-modal="!saving"
    :close-on-press-escape="!saving"
    :show-close="!saving"
  >
    <div class="calendar-day-type-dialog">
      <div class="calendar-day-type-dialog__date">
        <span><ArtSvgIcon icon="ri:calendar-check-line" /></span>
        <div>
          <strong>{{ dayjs(context.workDate).format('YYYY 年 M 月 D 日') }}</strong>
          <p>{{ dayjs(context.workDate).locale('zh-cn').format('dddd') }} · 点击类型后立即保存</p>
        </div>
      </div>

      <div class="calendar-day-type-dialog__options" role="radiogroup" aria-label="日期类型">
        <button
          v-for="option in calendarDayTypes"
          :key="option.value"
          type="button"
          role="radio"
          :aria-checked="context.dayType === option.value"
          :class="[`is-${option.value}`, { 'is-current': context.dayType === option.value }]"
          :disabled="saving"
          :style="{ '--day-type-color': option.color }"
          @click="saveDayType(option.value)"
        >
          <span><ArtSvgIcon :icon="option.icon" /></span>
          <strong>{{ option.label }}</strong>
          <small>{{ option.description }}</small>
          <ArtSvgIcon
            v-if="context.dayType === option.value"
            class="calendar-day-type-dialog__check"
            icon="ri:check-line"
          />
        </button>
      </div>

      <ElAlert
        v-if="context.holidayName"
        :title="`当前日期由法定节假日“${context.holidayName}”自动标识；手动选择会覆盖本日显示。`"
        type="info"
        :closable="false"
        show-icon
      />
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import dayjs from 'dayjs'
  import 'dayjs/locale/zh-cn'
  import { reactive, ref } from 'vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import { setProductionCalendarDayType, type ProductionCalendarDayType } from '@/api/mdm'
  import { calendarDayTypes } from './calendar-day-types'

  interface OpenData {
    departmentId: string
    workDate: string
    dayType: ProductionCalendarDayType
    holidayName?: string | null
  }

  const emit = defineEmits<{ success: [workDate: string, dayType: ProductionCalendarDayType] }>()
  const dialogRef = ref<ArtDialogExpose<OpenData>>()
  const saving = ref(false)
  const context = reactive<OpenData>({
    departmentId: '',
    workDate: '',
    dayType: 'work_day'
  })

  const saveDayType = async (dayType: ProductionCalendarDayType): Promise<void> => {
    saving.value = true
    try {
      await setProductionCalendarDayType(context.departmentId, context.workDate, dayType)
      context.dayType = dayType
      emit('success', context.workDate, dayType)
      await dialogRef.value?.handleClose()
    } catch {
      // The API presents the error; retain the selected date for retry.
    } finally {
      saving.value = false
    }
  }

  const handleOpen = async (data: OpenData): Promise<void> => {
    Object.assign(context, data)
    await dialogRef.value?.handleOpen(data, {
      title: '设置日期类型',
      subtitle: '快速标记工厂日历中的生产属性',
      showFooter: false
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .calendar-day-type-dialog {
    display: grid;
    gap: 16px;

    &__date {
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr);
      gap: 12px;
      align-items: center;
      padding: 13px 14px;
      background: color-mix(in srgb, var(--theme-color) 7%, var(--default-box-color));
      border-radius: var(--el-border-radius-base);

      > span {
        display: grid;
        place-items: center;
        width: 42px;
        height: 42px;
        color: var(--theme-color);
        background: var(--default-box-color);
        border-radius: var(--el-border-radius-base);
      }

      strong {
        color: var(--el-text-color-primary);
      }

      p {
        margin: 3px 0 0;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    &__options {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;

      button {
        position: relative;
        display: grid;
        grid-template-columns: 38px minmax(0, 1fr);
        gap: 2px 10px;
        align-items: center;
        min-height: 82px;
        padding: 12px;
        color: var(--el-text-color-primary);
        text-align: left;
        cursor: pointer;
        background: var(--el-bg-color);
        border: 1px solid var(--el-border-color-light);
        border-radius: var(--el-border-radius-base);
        transition:
          border-color 0.18s ease,
          box-shadow 0.18s ease,
          transform 0.18s ease;

        &:hover:not(:disabled) {
          border-color: var(--day-type-color);
          box-shadow: 0 7px 18px rgb(15 23 42 / 8%);
          transform: translateY(-1px);
        }

        &:focus-visible {
          outline: 2px solid var(--day-type-color);
          outline-offset: 2px;
        }

        &:disabled {
          cursor: wait;
          opacity: 0.65;
        }

        > span {
          display: grid;
          grid-row: 1 / 3;
          place-items: center;
          width: 38px;
          height: 38px;
          color: var(--day-type-color);
          background: color-mix(in srgb, var(--day-type-color) 12%, var(--el-bg-color));
          border-radius: 50%;
        }

        strong,
        small {
          min-width: 0;
        }

        small {
          color: var(--el-text-color-secondary);
        }
      }

      .is-current {
        background: color-mix(in srgb, var(--day-type-color) 7%, var(--el-bg-color));
        border-color: var(--day-type-color);
      }
    }

    &__check {
      position: absolute;
      top: 8px;
      right: 8px;
      color: var(--day-type-color);
    }

    @media (width <= 540px) {
      &__options {
        grid-template-columns: 1fr;
      }
    }
  }
</style>

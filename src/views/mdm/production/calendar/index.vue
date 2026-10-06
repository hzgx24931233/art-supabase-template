<template>
  <div class="production-calendar production-workspace business-workspace-page art-full-height">
    <ProductionWorkspaceHeader
      title="工厂日历"
      description="按车间、产线编排每日生产班次，统一轮班模式、休息时间与交班安排。"
      icon="ri:calendar-schedule-line"
      capability="班次日历配置"
      :metrics="metrics"
      density="compact"
    >
      <template #actions>
        <ElButton
          v-auth="'MdmFactoryCalendar:Reminder'"
          :disabled="!scope.selected"
          @click="openAction('reminder')"
          ><template #icon><ArtSvgIcon icon="ri:notification-3-line" /></template>日历提醒</ElButton
        >
        <ElButton
          v-auth="'MdmFactoryCalendar:Configure'"
          type="primary"
          :disabled="!scope.selected || !calendar.patterns.length"
          @click="openAction('batch')"
          ><template #icon><ArtSvgIcon icon="ri:settings-3-line" /></template>批量设置</ElButton
        >
      </template>
    </ProductionWorkspaceHeader>
    <div class="production-workspace__body">
      <ArtWorkspaceSplitter
        primary-size="256px"
        primary-min="220px"
        primary-max="380px"
        :breakpoint="800"
        stacked-primary-size="240px"
      >
        <template #primary>
          <ProductionTree
            class="production-workspace__tree"
            :departments="scope.departments"
            :selected="scope.selected"
            :loading="scope.loading"
            :error="scope.error"
            :show-all="false"
            @select="selectDepartment"
            @refresh="loadDepartments"
          />
        </template>
        <ElScrollbar class="production-calendar__scroll">
          <div class="production-calendar__content">
            <ArtSectionCard
              v-if="!scope.selected"
              title="开始配置工厂日历"
              subtitle="按生产组织建立轮班模式，再把班次批量安排到具体日期。"
              preserve-content-structure
            >
              <ol class="production-calendar__guide">
                <li>
                  <span>01</span>
                  <div><strong>选择生产组织</strong><p>从左侧定位需要排班的车间或产线。</p></div>
                </li>
                <li>
                  <span>02</span>
                  <div><strong>维护轮班模式</strong><p>配置班次时间、休息时长和交班时间。</p></div>
                </li>
                <li>
                  <span>03</span>
                  <div
                    ><strong>安排生产日期</strong><p>在日历中选择日期并批量应用轮班模式。</p></div
                  >
                </li>
              </ol>
            </ArtSectionCard>
            <template v-else>
              <ElAlert
                v-if="reminderText"
                :title="reminderText"
                type="warning"
                show-icon
                :closable="false"
              />
              <ArtSectionCard
                :title="selectedDepartment?.name || '生产日历'"
                :subtitle="selectedDepartment?.code"
                :loading="calendar.loading"
                :error="calendar.error"
                retryable
                @retry="loadCalendar"
              >
                <template #actions>
                  <ElSegmented
                    v-model="calendar.tab"
                    :options="[
                      { label: '轮班日历', value: 'calendar' },
                      { label: '轮班模式', value: 'patterns' }
                    ]"
                    aria-label="日历视图"
                  />
                </template>
                <template v-if="calendar.tab === 'calendar'">
                  <div class="production-calendar__legend">
                    <span v-for="meta in dayTypeLegend" :key="meta.value"
                      ><i :style="{ background: meta.color }" />{{ meta.label }}</span
                    >
                    <span class="production-calendar__legend-divider" aria-hidden="true" />
                    <span v-for="pattern in calendar.patterns" :key="pattern.id"
                      ><i :style="{ background: pattern.color }" />{{ pattern.name }}</span
                    >
                    <span><i class="is-empty" />未设置</span>
                  </div>
                  <div class="production-calendar__hint">
                    <span
                      >单击日期可快速设置休息日、节假日、工作日或半工作日；按住 Ctrl / ⌘
                      点击可多选后批量调整轮班。</span
                    >
                    <ElButton
                      v-auth="'MdmFactoryCalendar:Configure'"
                      size="small"
                      :disabled="
                        !calendar.selectedDates.length ||
                        calendar.selectedDates.some((date) => date <= today) ||
                        !calendar.patterns.length
                      "
                      @click="openAction('batch', calendar.selectedDates)"
                      >修改选中日期（{{ calendar.selectedDates.length }}）</ElButton
                    >
                    <ElButton
                      v-if="calendar.selectedDates.length"
                      size="small"
                      @click="calendar.selectedDates = []"
                      >清空选择</ElButton
                    >
                  </div>
                  <ElCalendar v-model="calendar.month">
                    <template #header>
                      <div class="production-calendar__month">
                        <strong>{{ monthTitle }}</strong>
                        <div
                          ><ArtIconButton
                            label="上个月"
                            icon="ri:arrow-left-s-line"
                            @click="moveMonth(-1)" /><ElButton @click="calendar.month = new Date()"
                            >本月</ElButton
                          ><ArtIconButton
                            label="下个月"
                            icon="ri:arrow-right-s-line"
                            @click="moveMonth(1)"
                        /></div>
                      </div>
                    </template>
                    <template #date-cell="{ data }">
                      <button
                        type="button"
                        class="production-calendar__day"
                        :class="{
                          'is-selected': calendar.selectedDates.includes(data.day),
                          'is-outside': data.type !== 'current-month',
                          'is-today': data.day === today,
                          'is-past': data.day <= today,
                          [`is-${resolveDayType(data.day)}`]: true
                        }"
                        :style="{
                          '--shift-color': dayPattern(data.day)?.color,
                          '--day-type-color': resolveDayTypeMeta(data.day).color
                        }"
                        :aria-label="dayLabel(data.day)"
                        :title="dayLabel(data.day)"
                        :aria-pressed="calendar.selectedDates.includes(data.day)"
                        :disabled="!hasAuth('MdmFactoryCalendar:Configure')"
                        @click.stop="selectDate(data.day, $event)"
                        @keydown.enter.prevent="openDayType(data.day)"
                      >
                        <span class="production-calendar__day-number"
                          >{{ Number(data.day.slice(-2))
                          }}<small v-if="data.day === today">今天</small></span
                        >
                        <span v-if="dayPattern(data.day)" class="production-calendar__shift"
                          ><i /><span>{{ dayPattern(data.day)?.name }}</span></span
                        >
                        <span class="production-calendar__day-type">
                          <ArtSvgIcon :icon="resolveDayTypeMeta(data.day).icon" />
                          {{ resolveDayTypeMeta(data.day).displayLabel }}
                        </span>
                        <span
                          v-if="schedulesForDate(data.day).length"
                          class="production-calendar__schedules"
                        >
                          <span
                            v-for="schedule in schedulesForDate(data.day).slice(0, 2)"
                            :key="schedule.id"
                            class="production-calendar__schedule"
                            :title="`${schedule.shiftName} · ${schedule.memberCount} 人`"
                          >
                            <i :style="{ background: schedule.patternColor }" />
                            <span>{{ schedule.shiftName }}</span>
                            <small>{{ schedule.memberCount }}人</small>
                          </span>
                          <small v-if="schedulesForDate(data.day).length > 2"
                            >+{{ schedulesForDate(data.day).length - 2 }} 个班次</small
                          >
                        </span>
                        <small
                          v-else-if="dayPattern(data.day)"
                          class="production-calendar__duration"
                          >{{ patternMinutes(dayPattern(data.day)) }} 分钟</small
                        >
                        <small v-else class="production-calendar__unset">未设置</small>
                      </button>
                    </template>
                  </ElCalendar>
                </template>
                <template v-else>
                  <div class="production-calendar__pattern-actions">
                    <ElButton
                      v-auth="'MdmFactoryCalendar:AddPattern'"
                      type="primary"
                      @click="editPattern()"
                      >添加轮班模式</ElButton
                    >
                    <ElButton
                      v-auth="'MdmFactoryCalendar:ReferencePattern'"
                      :disabled="calendar.patterns.length > 0"
                      @click="openAction('reference')"
                      >参考其他产线</ElButton
                    >
                    <span>各产线独立维护；修改模式后对应日历立即使用最新班次。</span>
                  </div>
                  <ArtEmptyState
                    v-if="!calendar.patterns.length"
                    title="尚未配置轮班模式"
                    description="添加班次与休息时间，或参考其他产线的现有模式。"
                  />
                  <div v-else class="production-calendar__patterns">
                    <article
                      v-for="(pattern, index) in calendar.patterns"
                      :key="pattern.id"
                      class="production-calendar__pattern"
                    >
                      <div class="production-calendar__pattern-title"
                        ><span
                          class="production-calendar__swatch"
                          :style="{ background: pattern.color }" /><div
                          ><strong>{{ index + 1 }}. {{ pattern.name }}</strong
                          ><p>{{ pattern.description || '暂无描述' }}</p></div
                        ><BusinessTableRowActions
                          ><ArtButtonTable
                            type="edit"
                            permission="MdmFactoryCalendar:EditPattern"
                            @click="editPattern(pattern)" /><ArtButtonTable
                            type="delete"
                            permission="MdmFactoryCalendar:DeletePattern"
                            @click="removePattern(pattern)" /></BusinessTableRowActions
                      ></div>
                      <div class="production-calendar__shift-list">
                        <div v-for="(shift, shiftIndex) in pattern.shifts" :key="shiftIndex"
                          ><strong>{{ shift.name }}</strong
                          ><span
                            >{{ shift.startTime }} — {{ shift.endTime
                            }}{{ shift.startTime > shift.endTime ? '（次日）' : '' }}</span
                          ><small
                            >休息 {{ shift.restMinutes || 0 }} 分钟 · 交班
                            {{ shift.handoverMinutes }} 分钟 · 生产
                            {{ shift.workMinutes || 0 }} 分钟</small
                          ></div
                        >
                      </div>
                    </article>
                  </div>
                </template>
              </ArtSectionCard>
            </template>
          </div>
        </ElScrollbar>
      </ArtWorkspaceSplitter>
    </div>
    <PatternDialog ref="patternDialog" @success="loadCalendar" />
    <CalendarActionDialog ref="actionDialog" @success="loadCalendar" />
    <CalendarDayTypeDialog ref="dayTypeDialog" @success="handleDayTypeSuccess" />
  </div>
</template>
<script setup lang="ts">
  import { ref, reactive, computed, watch } from 'vue'
  import dayjs from 'dayjs'
  import { uniqBy } from 'lodash-es'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import { storeToRefs } from 'pinia'
  import { useAuth } from '@/hooks/core/useAuth'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import {
    fetchProductionDepartments,
    fetchShiftPatterns,
    fetchProductionCalendar,
    fetchProductionCalendarDaySettings,
    fetchCalendarReminder,
    fetchShiftSchedules,
    deleteShiftPattern,
    type ProductionDepartment,
    type ShiftPattern,
    type ProductionCalendarDay,
    type ProductionCalendarDaySetting,
    type ProductionCalendarDayType,
    type CalendarReminder,
    type ShiftScheduleRecord
  } from '@/api/mdm'
  import ProductionTree from '../modules/production-tree.vue'
  import ProductionWorkspaceHeader from '../modules/production-workspace-header.vue'
  import { productionToday } from '../modules/production-model'
  import { isShiftScheduleActiveOnDate } from '../modules/shift-schedule-policy'
  import PatternDialog from './modules/pattern-dialog.vue'
  import CalendarActionDialog from './modules/calendar-action-dialog.vue'
  import { calendarDayTypes } from './modules/calendar-day-types'
  import CalendarDayTypeDialog from './modules/calendar-day-type-dialog.vue'
  defineOptions({ name: 'MdmFactoryCalendar' })
  const tenantScopeStore = useTenantScopeStore()
  const { effectiveTenantId } = storeToRefs(tenantScopeStore)
  const { hasAuth } = useAuth()
  const { confirmAction } = useArtFeedback()
  const patternDialog = ref<InstanceType<typeof PatternDialog>>()
  const actionDialog = ref<InstanceType<typeof CalendarActionDialog>>()
  const dayTypeDialog = ref<InstanceType<typeof CalendarDayTypeDialog>>()
  const scope = reactive({
    departments: [] as ProductionDepartment[],
    selected: '',
    loading: false,
    error: ''
  })
  const calendar = reactive({
    month: new Date(),
    tab: 'calendar',
    patterns: [] as ShiftPattern[],
    days: [] as ProductionCalendarDay[],
    daySettings: [] as ProductionCalendarDaySetting[],
    schedules: [] as ShiftScheduleRecord[],
    selectedDates: [] as string[],
    loading: false,
    error: '',
    reminder: null as CalendarReminder | null
  })
  const today = productionToday()
  const selectedDepartment = computed(() => scope.departments.find((d) => d.id === scope.selected))
  const monthKey = computed(() => dayjs(calendar.month).format('YYYY-MM'))
  const monthTitle = computed(() => dayjs(calendar.month).format('YYYY 年 M 月'))
  const dayMap = computed(() => new Map(calendar.days.map((d) => [d.workDate, d.patternId])))
  const daySettingMap = computed(
    () => new Map(calendar.daySettings.map((setting) => [setting.workDate, setting]))
  )
  const holidayDateSet = computed(
    () =>
      new Set(
        calendar.daySettings
          .filter(
            (setting) => setting.source === 'statutory_holiday' && setting.dayType !== 'work_day'
          )
          .map((setting) => setting.workDate)
      )
  )
  const patternMap = computed(() => new Map(calendar.patterns.map((p) => [p.id, p])))
  const dayTypeLegend = calendarDayTypes
  const dayPattern = (date: string) => patternMap.value.get(dayMap.value.get(date) || '')
  const schedulesForDate = (date: string) =>
    calendar.schedules.filter((schedule) =>
      isShiftScheduleActiveOnDate(schedule, date, holidayDateSet.value)
    )
  const resolveDayType = (date: string): ProductionCalendarDayType =>
    daySettingMap.value.get(date)?.dayType ??
    (dayPattern(date) ? 'work_day' : [0, 6].includes(dayjs(date).day()) ? 'rest_day' : 'work_day')
  const resolveDayTypeMeta = (date: string) => {
    const dayType = resolveDayType(date)
    const meta = dayTypeLegend.find((item) => item.value === dayType) ?? dayTypeLegend[2]
    const setting = daySettingMap.value.get(date)
    return {
      ...meta,
      displayLabel: setting?.holidayName
        ? `${dayType === 'work_day' ? '班 · ' : dayType === 'rest_day' ? '休 · ' : ''}${setting.holidayName}`
        : meta.label
    }
  }
  const patternMinutes = (pattern: ShiftPattern | undefined) =>
    pattern?.shifts.reduce((sum, s) => sum + (s.workMinutes || 0), 0) || 0
  const monthDays = computed(() =>
    !scope.selected || calendar.loading || calendar.error
      ? []
      : calendar.days.filter((d) => d.workDate.startsWith(monthKey.value))
  )
  const metrics = computed(() => [
    {
      label: '当前产线',
      value: selectedDepartment.value?.name || '未选择',
      icon: 'ri:node-tree',
      description: selectedDepartment.value?.factory || '选择左侧生产组织'
    },
    {
      label: '本月已排班',
      value: `${monthDays.value.length} 天`,
      icon: 'ri:calendar-check-line',
      description: `共 ${dayjs(calendar.month).daysInMonth()} 个自然日`
    },
    {
      label: '本月生产时长',
      value: `${(monthDays.value.reduce((sum, d) => sum + patternMinutes(patternMap.value.get(d.patternId)), 0) / 60).toFixed(1)} 小时`,
      icon: 'ri:time-line',
      description: '各班次时长合计，已扣除休息'
    }
  ])
  const reminderText = computed(() => {
    if (!scope.selected || !calendar.reminder?.enabled || calendar.loading || calendar.error)
      return ''
    const upcoming = Array.from({ length: calendar.reminder.leadDays }, (_, i) =>
      dayjs(today)
        .add(i + 1, 'day')
        .format('YYYY-MM-DD')
    )
    const missing = upcoming.filter((date) => !dayMap.value.has(date))
    return missing.length
      ? `未来 ${calendar.reminder.leadDays} 天有 ${missing.length} 天尚未覆盖班次，请及时完善产线日历。`
      : ''
  })
  let departmentRequest = 0
  let calendarRequest = 0
  async function loadDepartments() {
    const request = ++departmentRequest
    scope.loading = true
    scope.error = ''
    try {
      await tenantScopeStore.loadTenantOptions()
      const rows = await fetchProductionDepartments(effectiveTenantId.value)
      if (request !== departmentRequest) return
      scope.departments = rows
      if (!rows.some((d) => d.id === scope.selected)) {
        const firstDepartment = rows.find((row) => row.enabled) || rows[0]
        await selectDepartment(firstDepartment?.id || '')
      }
    } catch {
      if (request === departmentRequest) scope.error = '部门加载失败，请重试。'
    } finally {
      if (request === departmentRequest) scope.loading = false
    }
  }
  async function selectDepartment(id: string) {
    scope.selected = id
    calendar.selectedDates = []
    await loadCalendar()
  }
  async function loadCalendar() {
    const request = ++calendarRequest
    const selectedTenantId = selectedDepartment.value?.tenantId
    if (!scope.selected || !selectedTenantId || !hasAuth('MdmFactoryCalendar:View')) {
      Object.assign(calendar, {
        patterns: [],
        days: [],
        daySettings: [],
        schedules: [],
        reminder: null,
        loading: false,
        error: ''
      })
      return
    }
    calendar.loading = true
    calendar.error = ''
    const start = dayjs(calendar.month).startOf('month').subtract(7, 'day').format('YYYY-MM-DD')
    const monthEnd = dayjs(calendar.month).endOf('month').add(7, 'day')
    const reminderEnd = dayjs(today).add(30, 'day')
    // Include the reminder horizon independently of the visible month.
    try {
      const [patterns, visibleDays, upcomingDays, reminder, daySettings, schedules] =
        await Promise.all([
          fetchShiftPatterns(selectedTenantId, scope.selected),
          fetchProductionCalendar(
            selectedTenantId,
            scope.selected,
            start,
            monthEnd.format('YYYY-MM-DD')
          ),
          fetchProductionCalendar(
            selectedTenantId,
            scope.selected,
            today,
            reminderEnd.format('YYYY-MM-DD')
          ),
          fetchCalendarReminder(selectedTenantId, scope.selected),
          fetchProductionCalendarDaySettings(scope.selected, start, monthEnd.format('YYYY-MM-DD')),
          hasAuth('MdmShiftScheduling:View')
            ? fetchShiftSchedules({
                departmentId: scope.selected,
                startDate: start,
                endDate: monthEnd.format('YYYY-MM-DD')
              })
            : Promise.resolve([])
        ])
      if (request !== calendarRequest) return
      Object.assign(calendar, {
        patterns,
        days: uniqBy([...visibleDays, ...upcomingDays], 'workDate'),
        reminder,
        daySettings,
        schedules
      })
    } catch {
      if (request === calendarRequest) calendar.error = '日历加载失败，请重试。'
    } finally {
      if (request === calendarRequest) calendar.loading = false
    }
  }
  function moveMonth(amount: number) {
    calendar.month = dayjs(calendar.month).add(amount, 'month').toDate()
  }
  function selectDate(date: string, event: MouseEvent) {
    if (!hasAuth('MdmFactoryCalendar:Configure')) return
    calendar.selectedDates =
      event.ctrlKey || event.metaKey
        ? calendar.selectedDates.includes(date)
          ? calendar.selectedDates.filter((d) => d !== date)
          : [...calendar.selectedDates, date]
        : [date]
    if (!event.ctrlKey && !event.metaKey) openDayType(date)
  }
  function openDayType(date: string) {
    if (!hasAuth('MdmFactoryCalendar:Configure')) return
    calendar.selectedDates = [date]
    void dayTypeDialog.value?.handleOpen({
      departmentId: scope.selected,
      workDate: date,
      dayType: resolveDayType(date),
      holidayName: daySettingMap.value.get(date)?.holidayName
    })
  }
  async function handleDayTypeSuccess() {
    await loadCalendar()
  }
  function dayLabel(date: string) {
    const pattern = dayPattern(date)
    const schedules = schedulesForDate(date)
    const scheduleText = schedules.length
      ? schedules.map((schedule) => `${schedule.shiftName}${schedule.memberCount}人`).join('，')
      : '无人员排班'
    return `${date}，${resolveDayTypeMeta(date).displayLabel}，${pattern ? pattern.name + '，' + patternMinutes(pattern) + ' 分钟' : '未设置轮班模式'}，${scheduleText}`
  }
  function openAction(kind: 'batch' | 'reference' | 'reminder', dates: string[] = []) {
    void actionDialog.value?.handleOpen({
      kind,
      departmentId: scope.selected,
      patterns: calendar.patterns,
      departments: scope.departments,
      dates,
      reminder: calendar.reminder
    })
  }
  function editPattern(row?: ShiftPattern) {
    void patternDialog.value?.handleOpen(scope.selected, row)
  }
  async function removePattern(row: ShiftPattern) {
    try {
      await confirmAction(
        `删除“${row.name}”后，使用此模式的日历将清空，此操作不可恢复。`,
        '删除轮班模式',
        { type: 'warning' }
      )
      await deleteShiftPattern(row.id)
      await loadCalendar()
    } catch {
      /* Cancellation or API-owned feedback. */
    }
  }
  watch(monthKey, () => {
    calendar.selectedDates = []
    void loadCalendar()
  })
  watch(
    effectiveTenantId,
    () => {
      scope.selected = ''
      scope.departments = []
      void loadDepartments()
    },
    { immediate: true }
  )
</script>
<style scoped lang="scss">
  .production-calendar {
    &__scroll {
      min-width: 0;
      height: 100%;
      min-height: 0;
    }

    &__content {
      display: grid;
      gap: 12px;
      padding-bottom: 12px;
    }

    &__guide {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
      padding: 0;
      margin: 0;
      list-style: none;

      li {
        display: grid;
        grid-template-columns: 36px minmax(0, 1fr);
        gap: 12px;
        align-items: start;
        padding: 16px;
        background: var(--el-fill-color-light);
        border-radius: var(--el-border-radius-base);
      }

      li > span {
        display: grid;
        place-items: center;
        width: 36px;
        height: 36px;
        font-size: 12px;
        font-weight: 700;
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 9%, var(--el-bg-color));
        border-radius: var(--el-border-radius-base);
      }

      strong {
        color: var(--el-text-color-primary);
      }

      p {
        margin: 4px 0 0;
        font-size: 12px;
        line-height: 1.7;
        color: var(--el-text-color-secondary);
      }
    }

    &__legend {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      padding: 4px 0 12px;

      span {
        display: flex;
        gap: 6px;
        align-items: center;
        font-size: 12px;
      }

      i {
        width: 10px;
        height: 10px;
        border-radius: var(--el-border-radius-small);
      }

      .is-empty {
        border: 1px solid var(--el-border-color);
      }
    }

    &__hint {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      padding: 12px;
      background: var(--el-fill-color-light);
      border-radius: var(--el-border-radius-base);

      > span {
        flex: 1;
        min-width: 220px;
        font-size: 12px;
        line-height: 1.7;
        color: var(--el-text-color-secondary);
      }
    }

    &__month {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      width: 100%;

      > div {
        display: flex;
        gap: 8px;
        align-items: center;
      }
    }

    :deep(.el-calendar) {
      --el-calendar-cell-width: 108px;
    }

    :deep(.el-calendar__body) {
      padding: 12px 0 0;
    }

    :deep(.el-calendar__header) {
      padding: 18px 0 12px;
    }

    :deep(.el-calendar-day) {
      height: 152px;
      padding: 4px;
    }

    &__day {
      display: flex;
      flex-direction: column;
      gap: 7px;
      width: 100%;
      height: 100%;
      padding: 8px;
      color: var(--el-text-color-primary);
      text-align: left;
      cursor: pointer;
      background: var(--el-bg-color);
      border: 1px solid transparent;
      border-radius: var(--el-border-radius-base);

      &:hover:not(:disabled) {
        background: var(--el-fill-color-light);
      }

      &:focus-visible {
        outline: 2px solid var(--theme-color);
        outline-offset: 1px;
      }

      &.is-selected {
        border-color: var(--theme-color);
        box-shadow: inset 0 0 0 1px var(--theme-color);
      }

      &.is-rest_day,
      &.is-statutory_holiday,
      &.is-half_work_day {
        background: color-mix(in srgb, var(--day-type-color) 15%, var(--el-bg-color));
      }

      &.is-work_day.is-selected {
        background: var(--el-color-primary-light-9);
      }

      &.is-outside {
        opacity: 0.55;
      }

      &.is-today .production-calendar__day-number {
        color: var(--theme-color);
      }
    }

    &__day-number {
      display: flex;
      gap: 6px;
      align-items: center;
      font-weight: 600;

      small {
        font-size: 10px;
        font-weight: 400;
      }
    }

    &__day-type {
      display: flex;
      gap: 5px;
      align-items: center;
      min-width: 0;
      font-size: 12px;
      font-weight: 600;
      color: var(--el-text-color-primary);
      overflow-wrap: anywhere;
    }

    &__legend-divider {
      border-left: 1px solid var(--el-border-color);
    }

    &__shift {
      display: flex;
      gap: 5px;
      align-items: center;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;

      > span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      font-size: 12px;
      white-space: nowrap;

      i {
        flex: none;
        width: 4px;
        height: 14px;
        background: var(--shift-color);
        border-radius: var(--el-border-radius-small);
      }
    }

    &__duration,
    &__unset {
      font-size: 11px;
      color: var(--el-text-color-secondary);
      white-space: nowrap;
    }

    &__schedules {
      display: grid;
      gap: 3px;
      min-width: 0;

      > small {
        font-size: 10px;
        color: var(--el-text-color-secondary);
      }
    }

    &__schedule {
      display: grid;
      grid-template-columns: 5px minmax(0, 1fr) auto;
      gap: 4px;
      align-items: center;
      min-width: 0;
      padding: 3px 5px;
      font-size: 11px;
      background: var(--el-fill-color-light);
      border-radius: var(--el-border-radius-small);

      > i {
        width: 5px;
        height: 5px;
        border-radius: 50%;
      }

      > span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      > small {
        font-size: 10px;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }
    }

    &__pattern-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      margin-bottom: 16px;

      span {
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    &__patterns {
      display: grid;
      gap: 16px;
    }

    &__pattern {
      padding: 16px;
      border: 1px solid var(--el-border-color-light);
      border-radius: var(--el-border-radius-base);
    }

    &__pattern-title {
      display: flex;
      gap: 12px;
      align-items: flex-start;

      strong {
        font-size: 15px;
      }

      p {
        margin: 5px 0 0;
        font-size: 12px;
        line-height: 1.6;
        color: var(--el-text-color-secondary);
        overflow-wrap: anywhere;
      }
    }

    &__swatch {
      flex: none;
      width: 14px;
      height: 14px;
      margin-top: 3px;
      border-radius: var(--el-border-radius-small);
    }

    &__pattern-tools {
      display: flex;
      flex: none;
      gap: 8px;
      margin-left: auto;
    }

    &__shift-list {
      display: grid;
      gap: 8px;
      margin-top: 16px;

      > div {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: center;
        padding: 10px 12px;
        font-size: 13px;
        background: var(--el-fill-color-light);
        border-radius: var(--el-border-radius-base);
      }

      small {
        margin-left: auto;
        color: var(--el-text-color-secondary);
      }
    }

    @media (width <= 1100px) {
      &__guide {
        grid-template-columns: 1fr;
      }

      :deep(.el-calendar-day) {
        height: 146px;
      }

      &__day {
        gap: 5px;
        padding: 6px;
      }

      &__duration {
        font-size: 10px;
      }
    }
  }
</style>

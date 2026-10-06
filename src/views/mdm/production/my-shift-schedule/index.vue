<template>
  <div class="my-shift-schedule production-workspace business-workspace-page art-full-height">
    <ProductionWorkspaceHeader
      title="我的排班"
      description="查看与当前账号关联的个人班次，快速确认上班日期、时间与生产范围。"
      icon="ri:calendar-check-line"
      capability="个人班次视图"
      :metrics="metrics"
      density="compact"
    >
      <template #actions>
        <ElButton :loading="schedule.loading" @click="loadSchedule">
          <ArtSvgIcon icon="ri:refresh-line" />
          刷新排班
        </ElButton>
      </template>
    </ProductionWorkspaceHeader>

    <ElScrollbar class="my-shift-schedule__scroll">
      <ArtSectionCard
        :title="monthTitle"
        subtitle="日期格仅展示当前账号关联员工的班次，不包含同班组其他人员信息。"
        :loading="schedule.loading"
        :error="schedule.error"
        :empty="!schedule.loading && !schedule.error && !schedule.profiles.length"
        empty-title="当前账号尚未关联生产人员"
        empty-description="请联系管理员先在用户管理中关联员工，再在生产主数据的人员配置中建立对应身份。"
        retryable
        preserve-content-structure
        @retry="loadSchedule"
      >
        <template #empty-action>
          <div class="my-shift-schedule__empty-actions">
            <ElButton v-auth="'System:User:Edit'" type="primary" @click="openUserManagement">
              去关联员工账号
            </ElButton>
            <ElButton v-auth="'MdmProductionPersonnel:View'" @click="openProductionPersonnel">
              查看人员配置
            </ElButton>
          </div>
        </template>

        <template #actions>
          <div class="my-shift-schedule__month-control">
            <ArtIconButton label="上个月" icon="ri:arrow-left-s-line" @click="moveMonth(-1)" />
            <ElButton size="small" @click="returnToCurrentMonth">
              <template #icon><ArtSvgIcon icon="ri:calendar-line" /></template>
              本月
            </ElButton>
            <ArtIconButton label="下个月" icon="ri:arrow-right-s-line" @click="moveMonth(1)" />
          </div>
        </template>

        <template v-if="schedule.profiles.length">
          <div class="my-shift-schedule__identity">
            <span class="my-shift-schedule__identity-icon" aria-hidden="true">
              <ArtSvgIcon icon="ri:user-3-line" />
            </span>
            <div>
              <strong>{{ primaryProfile?.employeeName }}</strong>
              <p>
                {{ primaryProfile?.employeeNo }}
                <template v-if="primaryProfile?.jobTitle">
                  · {{ primaryProfile.jobTitle }}</template
                >
              </p>
            </div>
            <span class="my-shift-schedule__scope" :title="profileScopeText">
              <ArtSvgIcon icon="ri:map-pin-2-line" />
              {{ profileScopeText }}
            </span>
            <small>仅本人可见</small>
          </div>

          <div class="my-shift-schedule__workspace">
            <ElCalendar v-model="schedule.month" class="my-shift-schedule__calendar">
              <template #header><span /></template>
              <template #date-cell="{ data }">
                <button
                  type="button"
                  class="my-shift-schedule__day"
                  :class="{
                    'is-outside': data.type !== 'current-month',
                    'is-today': data.day === today,
                    'is-selected': data.day === schedule.selectedDate,
                    'is-holiday': holidayDateSet.has(data.day),
                    'has-shift': schedulesForDate(data.day).length
                  }"
                  :aria-label="dayAriaLabel(data.day)"
                  @click.stop="selectDate(data.day)"
                >
                  <span class="my-shift-schedule__day-number">
                    <strong>{{ Number(data.day.slice(-2)) }}</strong>
                    <small v-if="data.day === today">今天</small>
                    <small v-if="holidayDateSet.has(data.day)" class="my-shift-schedule__holiday">
                      法定假日
                    </small>
                  </span>
                  <span
                    v-for="row in schedulesForDate(data.day)"
                    :key="row.id"
                    class="my-shift-schedule__day-shift"
                    :style="{ '--shift-color': row.patternColor }"
                  >
                    <i />
                    <span>{{ row.shiftName }}</span>
                    <small>{{ row.shiftStartTime }}</small>
                  </span>
                  <small
                    v-if="data.type === 'current-month' && !schedulesForDate(data.day).length"
                    class="my-shift-schedule__rest"
                    >休息</small
                  >
                </button>
              </template>
            </ElCalendar>

            <aside class="my-shift-schedule__detail" aria-live="polite">
              <div class="my-shift-schedule__detail-date">
                <span>{{ selectedDateWeekday }}</span>
                <strong>{{ selectedDateTitle }}</strong>
                <ElTag v-if="schedule.selectedDate === today" type="primary" effect="plain"
                  >今天</ElTag
                >
              </div>

              <div v-if="selectedSchedules.length" class="my-shift-schedule__shift-list">
                <article
                  v-for="row in selectedSchedules"
                  :key="row.id"
                  class="my-shift-schedule__shift-card"
                  :style="{ '--shift-color': row.patternColor }"
                >
                  <div class="my-shift-schedule__shift-heading">
                    <span><i />{{ row.shiftName }}</span>
                    <small>{{ row.patternName }}</small>
                  </div>
                  <p class="my-shift-schedule__shift-time">
                    {{ row.shiftStartTime }}
                    <span>—</span>
                    {{ row.shiftEndTime }}
                    <small v-if="isCrossMidnight(row)">次日</small>
                  </p>
                  <dl>
                    <div>
                      <dt>生产范围</dt>
                      <dd>
                        <strong class="block">{{ row.departmentName }}</strong>
                        <small class="block text-[var(--el-text-color-secondary)]">{{
                          row.departmentCode
                        }}</small>
                      </dd>
                    </div>
                    <div v-if="row.factory">
                      <dt>工厂</dt>
                      <dd>{{ row.factory }}</dd>
                    </div>
                    <div>
                      <dt>参与规则</dt>
                      <dd>{{ participationText(row) }}</dd>
                    </div>
                    <div v-if="row.note">
                      <dt>排班备注</dt>
                      <dd>{{ row.note }}</dd>
                    </div>
                  </dl>
                </article>
              </div>

              <div v-else class="my-shift-schedule__rest-detail">
                <span aria-hidden="true"><ArtSvgIcon icon="ri:moon-clear-line" /></span>
                <strong>当天没有排班</strong>
                <p>
                  {{
                    holidayDateSet.has(schedule.selectedDate)
                      ? '法定假日未安排班次，可选择其他日期继续查看。'
                      : '可选择月历中的其他日期继续查看。'
                  }}
                </p>
              </div>
            </aside>
          </div>
        </template>
      </ArtSectionCard>
    </ElScrollbar>
  </div>
</template>

<script setup lang="ts">
  import { computed, reactive, watch } from 'vue'
  import dayjs from 'dayjs'
  import { uniq } from 'lodash-es'
  import { fetchMyShiftSchedule, type MyShiftProfile, type MyShiftScheduleRecord } from '@/api/mdm'
  import ProductionWorkspaceHeader from '../modules/production-workspace-header.vue'
  import {
    isShiftScheduleActiveOnDate,
    shiftScheduleParticipationText
  } from '../modules/shift-schedule-policy'

  defineOptions({ name: 'MdmMyShiftSchedule' })

  const router = useRouter()

  interface ScheduleState {
    month: Date
    selectedDate: string
    profiles: MyShiftProfile[]
    rows: MyShiftScheduleRecord[]
    holidayDates: string[]
    loading: boolean
    error: string
  }

  const today = dayjs().format('YYYY-MM-DD')
  const schedule = reactive<ScheduleState>({
    month: new Date(),
    selectedDate: today,
    profiles: [],
    rows: [],
    holidayDates: [],
    loading: false,
    error: ''
  })
  const monthKey = computed(() => dayjs(schedule.month).format('YYYY-MM'))
  const monthTitle = computed(() => dayjs(schedule.month).format('YYYY 年 M 月班表'))
  const primaryProfile = computed(() => schedule.profiles[0])
  const profileScopeText = computed(() =>
    uniq(
      schedule.profiles.map((profile) =>
        profile.factory ? `${profile.factory} · ${profile.departmentName}` : profile.departmentName
      )
    ).join('、')
  )
  const holidayDateSet = computed(() => new Set(schedule.holidayDates))
  const selectedSchedules = computed(() => schedulesForDate(schedule.selectedDate))
  const selectedDateTitle = computed(() => dayjs(schedule.selectedDate).format('M 月 D 日'))
  const selectedDateWeekday = computed(
    () =>
      ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][
        dayjs(schedule.selectedDate).day()
      ]
  )
  const scheduledDayCount = computed(() => {
    const start = dayjs(schedule.month).startOf('month')
    const days = start.daysInMonth()
    let count = 0
    for (let index = 0; index < days; index += 1) {
      if (schedulesForDate(start.add(index, 'day').format('YYYY-MM-DD')).length) count += 1
    }
    return count
  })
  const metrics = computed(() => [
    {
      label: '排班身份',
      value: primaryProfile.value?.employeeName || '待关联',
      description: primaryProfile.value
        ? `${primaryProfile.value.employeeNo}${primaryProfile.value.jobTitle ? ` · ${primaryProfile.value.jobTitle}` : ''}`
        : '当前账号未关联生产人员',
      icon: 'ri:user-3-line',
      loading: schedule.loading
    },
    {
      label: schedule.selectedDate === today ? '今日安排' : '选中日期',
      value:
        selectedSchedules.value.map((row) => row.shiftName).join('、') ||
        (holidayDateSet.value.has(schedule.selectedDate) ? '法定假日' : '休息'),
      description: selectedSchedules.value.length
        ? selectedSchedules.value
            .map((row) => `${row.shiftStartTime}—${row.shiftEndTime}`)
            .join('、')
        : dayjs(schedule.selectedDate).format('M 月 D 日'),
      icon: selectedSchedules.value.length ? 'ri:time-line' : 'ri:moon-clear-line',
      tone: selectedSchedules.value.length ? ('success' as const) : ('info' as const),
      loading: schedule.loading
    },
    {
      label: '本月排班',
      value: `${scheduledDayCount.value} 天`,
      description: `${dayjs(schedule.month).daysInMonth()} 个自然日`,
      icon: 'ri:calendar-2-line',
      tone: 'primary' as const,
      loading: schedule.loading
    }
  ])

  let scheduleRequest = 0

  async function loadSchedule(): Promise<void> {
    const request = ++scheduleRequest
    const startDate = dayjs(schedule.month).startOf('month').subtract(7, 'day').format('YYYY-MM-DD')
    const endDate = dayjs(schedule.month).endOf('month').add(7, 'day').format('YYYY-MM-DD')
    schedule.loading = true
    schedule.error = ''
    try {
      const response = await fetchMyShiftSchedule(startDate, endDate)
      if (request !== scheduleRequest) return
      Object.assign(schedule, {
        profiles: response.profiles,
        rows: response.schedules,
        holidayDates: response.holidayDates
      })
    } catch {
      if (request === scheduleRequest) schedule.error = '我的排班加载失败，请重试。'
    } finally {
      if (request === scheduleRequest) schedule.loading = false
    }
  }

  function schedulesForDate(date: string): MyShiftScheduleRecord[] {
    return schedule.rows.filter((row) =>
      isShiftScheduleActiveOnDate(row, date, holidayDateSet.value)
    )
  }

  function participationText(row: MyShiftScheduleRecord): string {
    return shiftScheduleParticipationText(row)
  }

  function isCrossMidnight(row: MyShiftScheduleRecord): boolean {
    return row.shiftEndTime <= row.shiftStartTime
  }

  function dayAriaLabel(date: string): string {
    const shifts = schedulesForDate(date)
    const holiday = holidayDateSet.value.has(date) ? '，法定假日' : ''
    return shifts.length
      ? `${dayjs(date).format('M月D日')}${holiday}，${shifts.map((row) => `${row.shiftName} ${row.shiftStartTime}至${row.shiftEndTime}`).join('，')}`
      : `${dayjs(date).format('M月D日')}${holiday}，休息`
  }

  function selectDate(date: string): void {
    schedule.selectedDate = date
  }

  function moveMonth(amount: number): void {
    const nextMonth = dayjs(schedule.month).add(amount, 'month')
    schedule.month = nextMonth.toDate()
    schedule.selectedDate = nextMonth.startOf('month').format('YYYY-MM-DD')
  }

  function returnToCurrentMonth(): void {
    schedule.month = new Date()
    schedule.selectedDate = today
  }

  function openUserManagement(): void {
    void router.push('/system/user')
  }

  function openProductionPersonnel(): void {
    void router.push('/mdm/production/personnel')
  }

  watch(monthKey, () => void loadSchedule(), { immediate: true })
</script>

<style scoped lang="scss">
  .my-shift-schedule {
    &__scroll {
      flex: 1;
      min-width: 0;
      min-height: 0;
    }

    &__month-control {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    &__empty-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
    }

    &__identity {
      display: flex;
      gap: 12px;
      align-items: center;
      min-width: 0;
      padding: 12px 14px;
      margin-bottom: 14px;
      background: color-mix(in srgb, var(--theme-color) 7%, var(--el-bg-color));
      border-radius: var(--el-border-radius-base);

      > div {
        min-width: 0;

        strong {
          color: var(--el-text-color-primary);
        }

        p {
          margin: 2px 0 0;
          font-size: 12px;
          color: var(--el-text-color-secondary);
        }
      }

      > small {
        flex: none;
        padding-left: 12px;
        margin-left: auto;
        color: var(--el-text-color-secondary);
        border-left: 1px solid var(--el-border-color-lighter);
      }
    }

    &__identity-icon {
      display: grid;
      flex: 0 0 38px;
      place-items: center;
      width: 38px;
      height: 38px;
      color: var(--theme-color);
      background: var(--el-bg-color);
      border-radius: var(--el-border-radius-base);
    }

    &__scope {
      display: flex;
      gap: 6px;
      align-items: center;
      min-width: 0;
      max-width: 45%;
      margin-left: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 12px;
      color: var(--el-text-color-regular);
      white-space: nowrap;
    }

    &__workspace {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 320px;
      gap: 16px;
      align-items: stretch;
      min-width: 0;
    }

    &__calendar {
      min-width: 0;

      :deep(.el-calendar__header) {
        display: none;
      }

      :deep(.el-calendar__body) {
        padding: 0;
      }

      :deep(.el-calendar-day) {
        height: 104px;
        padding: 4px;
      }
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
      background: transparent;
      border: 1px solid transparent;
      border-radius: var(--el-border-radius-base);
      transition:
        background-color 0.18s ease,
        border-color 0.18s ease,
        box-shadow 0.18s ease;

      &:hover {
        background: var(--el-fill-color-light);
      }

      &:focus-visible {
        outline: 2px solid color-mix(in srgb, var(--theme-color) 62%, transparent);
        outline-offset: 1px;
      }

      &.is-selected {
        background: color-mix(in srgb, var(--theme-color) 9%, var(--el-bg-color));
        border-color: color-mix(in srgb, var(--theme-color) 44%, var(--el-border-color));
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--theme-color) 18%, transparent);
      }

      &.is-outside {
        opacity: 0.42;
      }

      &.is-outside.is-holiday {
        opacity: 0.8;
      }

      &.is-today .my-shift-schedule__day-number strong {
        color: var(--theme-color);
      }
    }

    &__day-number {
      display: flex;
      gap: 6px;
      align-items: baseline;

      strong {
        font-size: 14px;
        font-variant-numeric: tabular-nums;
      }

      small {
        font-size: 10px;
        color: var(--theme-color);
      }

      .my-shift-schedule__holiday {
        padding: 1px 4px;
        color: var(--el-color-warning-dark-2);
        background: var(--el-color-warning-light-9);
        border-radius: var(--el-border-radius-small);
      }
    }

    &__day-shift {
      display: grid;
      grid-template-columns: 4px minmax(0, 1fr) auto;
      gap: 6px;
      align-items: center;
      min-width: 0;
      padding: 5px 6px;
      font-size: 11px;
      background: var(--el-fill-color-light);
      border-radius: var(--el-border-radius-small);

      i {
        width: 4px;
        height: 16px;
        background: var(--shift-color);
        border-radius: var(--el-border-radius-small);
      }

      span {
        overflow: hidden;
        text-overflow: ellipsis;
        font-weight: 600;
        white-space: nowrap;
      }

      small {
        font-variant-numeric: tabular-nums;
        color: var(--el-text-color-secondary);
      }
    }

    &__rest {
      margin-top: auto;
      font-size: 10px;
      color: var(--el-text-color-placeholder);
    }

    &__detail {
      min-width: 0;
      padding: 18px;
      background: var(--el-fill-color-light);
      border-radius: var(--el-border-radius-base);
    }

    &__detail-date {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--el-border-color-lighter);

      > span {
        grid-column: 1 / -1;
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      > strong {
        margin-top: 2px;
        font-size: 20px;
        color: var(--el-text-color-primary);
      }
    }

    &__shift-list {
      display: grid;
      gap: 12px;
      margin-top: 16px;
    }

    &__shift-card {
      padding-left: 12px;
      border-left: 3px solid var(--shift-color);
    }

    &__shift-heading {
      display: flex;
      gap: 10px;
      align-items: center;
      justify-content: space-between;

      span {
        display: flex;
        gap: 7px;
        align-items: center;
        font-weight: 700;
        color: var(--el-text-color-primary);
      }

      i {
        width: 7px;
        height: 7px;
        background: var(--shift-color);
        border-radius: 50%;
      }

      small {
        color: var(--el-text-color-secondary);
      }
    }

    &__shift-time {
      margin: 12px 0 16px;
      font-size: 24px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: var(--el-text-color-primary);
      letter-spacing: -0.02em;

      span {
        margin: 0 4px;
        font-weight: 400;
        color: var(--el-text-color-placeholder);
      }

      small {
        margin-left: 5px;
        font-size: 11px;
        font-weight: 500;
        color: var(--el-color-warning-dark-2);
      }
    }

    dl {
      display: grid;
      gap: 11px;
      margin: 0;

      div {
        display: grid;
        gap: 2px;
      }

      dt {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      dd {
        margin: 0;
        font-size: 12px;
        line-height: 1.6;
        color: var(--el-text-color-regular);
        overflow-wrap: anywhere;
      }
    }

    &__rest-detail {
      display: grid;
      justify-items: center;
      min-height: 260px;
      padding: 56px 20px 24px;
      text-align: center;

      > span {
        display: grid;
        place-items: center;
        width: 46px;
        height: 46px;
        margin-bottom: 14px;
        font-size: 21px;
        color: var(--el-color-info);
        background: var(--el-color-info-light-9);
        border-radius: 50%;
      }

      strong {
        color: var(--el-text-color-primary);
      }

      p {
        margin: 6px 0 0;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    @media (width <= 1100px) {
      &__workspace {
        grid-template-columns: minmax(0, 1fr) 280px;
        gap: 12px;
      }

      &__calendar :deep(.el-calendar-day) {
        height: 96px;
      }

      &__day-shift small {
        display: none;
      }
    }

    @media (width <= 820px) {
      &__identity {
        flex-wrap: wrap;

        > small {
          margin-left: 0;
          border-left: 0;
        }
      }

      &__scope {
        order: 3;
        width: 100%;
        max-width: none;
        margin-left: 50px;
      }

      &__workspace {
        grid-template-columns: 1fr;
      }

      &__detail {
        min-height: 260px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      &__day {
        transition: none;
      }
    }
  }
</style>

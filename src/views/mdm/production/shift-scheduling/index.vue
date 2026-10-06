<template>
  <div class="shift-scheduling production-workspace business-workspace-page art-full-height">
    <ProductionWorkspaceHeader
      title="排班管理"
      description="按部门与产线安排班次和班组人员，在日历与班表之间快速核对有效范围。"
      icon="ri:calendar-todo-line"
      capability="人员班次编排"
      :metrics="metrics"
      density="compact"
    >
      <template #actions>
        <ElButton
          v-auth="'MdmShiftScheduling:Add'"
          type="primary"
          :disabled="!scope.selected"
          @click="openSchedule('add')"
        >
          <ArtSvgIcon icon="ri:add-line" />
          新增排班
        </ElButton>
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

        <ElScrollbar class="shift-scheduling__scroll">
          <div class="shift-scheduling__content">
            <ArtSectionCard
              v-if="!scope.selected"
              title="选择排班范围"
              subtitle="从左侧选择部门或产线后，可查看日历排班并维护班组人员。"
              preserve-content-structure
            >
              <div class="shift-scheduling__guide">
                <span aria-hidden="true"><ArtSvgIcon icon="ri:node-tree" /></span>
                <div>
                  <strong>先定位生产组织</strong>
                  <p>轮班模式、班次与人员候选项都会随左侧部门 / 产线自动级联。</p>
                </div>
              </div>
            </ArtSectionCard>

            <ArtSectionCard
              v-else
              :title="selectedDepartment?.name || '排班日历'"
              :subtitle="selectedDepartment?.code"
              :loading="schedule.loading"
              :error="schedule.error"
              :empty="!schedule.loading && !schedule.error && !schedule.rows.length"
              empty-title="当前范围暂无排班"
              empty-description="新增排班后，班次与班组人数会同时显示在日历和班表中。"
              retryable
              preserve-content-structure
              @retry="loadSchedules"
            >
              <template #actions>
                <ElSegmented v-model="schedule.view" :options="viewOptions" aria-label="排班视图" />
              </template>

              <template #empty-action>
                <ElButton
                  v-auth="'MdmShiftScheduling:Add'"
                  type="primary"
                  @click="openSchedule('add')"
                  >新增排班</ElButton
                >
              </template>

              <template v-if="schedule.rows.length">
                <div class="shift-scheduling__toolbar">
                  <div class="shift-scheduling__month-control">
                    <ArtIconButton
                      label="上个月"
                      icon="ri:arrow-left-s-line"
                      @click="moveMonth(-1)"
                    />
                    <strong>{{ monthTitle }}</strong>
                    <ElButton size="small" @click="schedule.month = new Date()">本月</ElButton>
                    <ArtIconButton
                      label="下个月"
                      icon="ri:arrow-right-s-line"
                      @click="moveMonth(1)"
                    />
                  </div>
                  <p>
                    <span><i class="is-active" />生效中</span>
                    <span><i class="is-upcoming" />待生效</span>
                    <span><i class="is-expired" />已结束</span>
                  </p>
                </div>

                <ElCalendar
                  v-if="schedule.view === 'calendar'"
                  v-model="schedule.month"
                  class="shift-scheduling__calendar"
                >
                  <template #header><span /></template>
                  <template #date-cell="{ data }">
                    <div
                      class="shift-scheduling__day"
                      :class="{
                        'is-outside': data.type !== 'current-month',
                        'is-today': data.day === today
                      }"
                    >
                      <div class="shift-scheduling__day-head">
                        <strong>{{ Number(data.day.slice(-2)) }}</strong>
                        <small v-if="data.day === today">今天</small>
                        <ElButton
                          v-if="data.type === 'current-month' && hasAuth('MdmShiftScheduling:Add')"
                          link
                          type="primary"
                          :aria-label="`新增 ${data.day} 排班`"
                          @click.stop="openSchedule('add', undefined, data.day)"
                        >
                          <ArtSvgIcon icon="ri:add-line" />
                        </ElButton>
                      </div>
                      <div class="shift-scheduling__day-body">
                        <div
                          v-for="row in schedulesForDate(data.day)"
                          :key="row.id"
                          class="shift-scheduling__shift"
                          :style="{ '--schedule-color': row.patternColor }"
                        >
                          <button type="button" @click.stop="openSchedule('view', row)">
                            <span><i />{{ row.shiftName }}</span>
                            <strong>{{ row.memberCount }}人</strong>
                          </button>
                          <div class="shift-scheduling__shift-actions">
                            <ArtIconButton
                              v-if="hasAuth('MdmShiftScheduling:Edit')"
                              :label="`编辑 ${row.shiftName} 排班`"
                              icon="ri:edit-line"
                              @click.stop="openSchedule('edit', row)"
                            />
                            <ArtIconButton
                              v-if="hasAuth('MdmShiftScheduling:Delete')"
                              :label="`删除 ${row.shiftName} 排班`"
                              icon="ri:delete-bin-6-line"
                              class="shift-scheduling__delete"
                              @click.stop="removeSchedule(row)"
                            />
                          </div>
                        </div>
                        <span
                          v-if="!schedulesForDate(data.day).length"
                          class="shift-scheduling__unset"
                          >未排班</span
                        >
                      </div>
                    </div>
                  </template>
                </ElCalendar>

                <ArtTable
                  v-else
                  :data="schedule.rows"
                  :columns="columns"
                  :show-pagination="false"
                  table-layout="fixed"
                  row-key="id"
                  empty-text="暂无班表"
                  empty-description="当前月份没有生效或待生效的排班。"
                />
              </template>
            </ArtSectionCard>
          </div>
        </ElScrollbar>
      </ArtWorkspaceSplitter>
    </div>

    <ShiftScheduleDialog ref="scheduleDialog" @success="loadSchedules" />
  </div>
</template>

<script setup lang="tsx">
  import { computed, reactive, ref, watch } from 'vue'
  import dayjs from 'dayjs'
  import { uniq } from 'lodash-es'
  import { ElButton, ElTag } from 'element-plus'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtButtonMore from '@/components/core/forms/art-button-more/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import type { ColumnOption } from '@/types'
  import {
    deleteShiftSchedule,
    fetchShiftScheduleDepartments,
    fetchShiftScheduleHolidayDates,
    fetchShiftSchedules,
    type ProductionDepartment,
    type ShiftScheduleDateMode,
    type ShiftScheduleRecord
  } from '@/api/mdm'
  import ProductionTree from '../modules/production-tree.vue'
  import ProductionWorkspaceHeader from '../modules/production-workspace-header.vue'
  import {
    isShiftScheduleActiveOnDate,
    shiftScheduleParticipationText
  } from '../modules/shift-schedule-policy'
  import ShiftScheduleDialog from './modules/shift-schedule-dialog.vue'

  defineOptions({ name: 'MdmShiftScheduling' })

  const { hasAuth } = useAuth()
  const { confirmAction } = useArtFeedback()
  const scheduleDialog = ref<InstanceType<typeof ShiftScheduleDialog>>()
  const scope = reactive({
    departments: [] as ProductionDepartment[],
    selected: '',
    loading: false,
    error: ''
  })
  const schedule = reactive({
    view: 'calendar' as 'calendar' | 'roster',
    month: new Date(),
    rows: [] as ShiftScheduleRecord[],
    holidayDates: [] as string[],
    loading: false,
    error: ''
  })
  const viewOptions = [
    { label: '日历视图', value: 'calendar' },
    { label: '班表视图', value: 'roster' }
  ]
  const today = dayjs().format('YYYY-MM-DD')
  const monthKey = computed(() => dayjs(schedule.month).format('YYYY-MM'))
  const monthTitle = computed(() => dayjs(schedule.month).format('YYYY 年 M 月'))
  const holidayDateSet = computed(() => new Set(schedule.holidayDates))
  const selectedDepartment = computed(() =>
    scope.departments.find((department) => department.id === scope.selected)
  )
  const metrics = computed(() => [
    {
      label: '当前范围',
      value: selectedDepartment.value?.name || '未选择',
      description: selectedDepartment.value?.code || '选择左侧部门 / 产线',
      icon: 'ri:node-tree'
    },
    {
      label: '本月排班',
      value: `${schedule.rows.length} 组`,
      description: '当前月份有效的班次安排',
      icon: 'ri:calendar-check-line'
    },
    {
      label: '班组人员',
      value: `${uniq(schedule.rows.flatMap((row) => row.members.map((member) => member.id))).length} 人`,
      description: '按人员去重统计',
      icon: 'ri:team-line'
    }
  ])

  const dateModeLabel: Record<ShiftScheduleDateMode, string> = {
    single: '单日',
    ongoing: '长期',
    range: '期间'
  }

  const scheduleStatus = (row: ShiftScheduleRecord): 'success' | 'warning' | 'info' => {
    if (row.startDate > today) return 'warning'
    if (row.endDate && row.endDate < today) return 'info'
    return 'success'
  }
  const scheduleStatusText = (row: ShiftScheduleRecord): string => {
    if (row.startDate > today) return '待生效'
    if (row.endDate && row.endDate < today) return '已结束'
    return '生效中'
  }
  const effectiveDate = (row: ShiftScheduleRecord): string => {
    if (row.dateMode === 'single') return row.startDate
    if (row.dateMode === 'ongoing') return `${row.startDate} 起长期有效`
    return `${row.startDate} 至 ${row.endDate || '—'}`
  }

  const columns: ColumnOption<ShiftScheduleRecord>[] = [
    {
      prop: 'shift',
      label: '班次',
      minWidth: 210,
      fixed: 'left',
      formatter: (row) => (
        <div class="shift-scheduling__table-shift">
          <i style={{ background: row.patternColor }} />
          <span>
            <ElButton
              link
              type="primary"
              disabled={!hasAuth('MdmShiftScheduling:View')}
              onClick={() => openSchedule('view', row)}
            >
              {row.shiftName}（{row.memberCount}人）
            </ElButton>
            <small>{row.patternName}</small>
          </span>
        </div>
      )
    },
    {
      prop: 'time',
      label: '班次时间',
      width: 150,
      formatter: (row) => `${row.shiftStartTime} — ${row.shiftEndTime}`
    },
    {
      prop: 'dateMode',
      label: '有效方式',
      width: 92,
      formatter: (row) => dateModeLabel[row.dateMode]
    },
    {
      prop: 'effectiveDate',
      label: '排班日期',
      minWidth: 210,
      formatter: effectiveDate
    },
    {
      prop: 'weekdays',
      label: '参与日期',
      minWidth: 260,
      showOverflowTooltip: true,
      formatter: shiftScheduleParticipationText
    },
    {
      prop: 'members',
      label: '班组人员',
      minWidth: 250,
      formatter: (row) => (
        <span
          class="shift-scheduling__member-summary"
          title={row.members.map((m) => m.employeeName).join('、')}
        >
          {row.members
            .slice(0, 3)
            .map((member) => member.employeeName)
            .join('、')}
          {row.members.length > 3 ? ` 等 ${row.members.length} 人` : ''}
        </span>
      )
    },
    {
      prop: 'status',
      label: '状态',
      width: 92,
      formatter: (row) => <ElTag type={scheduleStatus(row)}>{scheduleStatusText(row)}</ElTag>
    },
    {
      prop: 'operation',
      label: '操作',
      width: 150,
      fixed: 'right',
      formatter: (row) => (
        <BusinessTableRowActions>
          <ArtButtonTable
            type="view"
            permission="MdmShiftScheduling:View"
            onClick={() => openSchedule('view', row)}
          />
          <ArtButtonTable
            type="edit"
            permission="MdmShiftScheduling:Edit"
            onClick={() => openSchedule('edit', row)}
          />
          <ArtButtonMore
            list={[
              {
                key: 'delete',
                label: '删除',
                icon: 'ri:delete-bin-6-line',
                color: 'var(--el-color-danger)',
                auth: 'MdmShiftScheduling:Delete'
              }
            ]}
            onClick={() => void removeSchedule(row)}
          />
        </BusinessTableRowActions>
      )
    }
  ]

  let departmentRequest = 0
  let scheduleRequest = 0

  async function loadDepartments(): Promise<void> {
    const request = ++departmentRequest
    scope.loading = true
    scope.error = ''
    try {
      const departments = await fetchShiftScheduleDepartments()
      if (request !== departmentRequest) return
      scope.departments = departments
      if (!departments.some((department) => department.id === scope.selected)) {
        const first = departments.find((department) => department.enabled) || departments[0]
        await selectDepartment(first?.id || '')
      }
    } catch {
      if (request === departmentRequest) scope.error = '部门 / 产线加载失败，请重试。'
    } finally {
      if (request === departmentRequest) scope.loading = false
    }
  }

  async function selectDepartment(id: string): Promise<void> {
    scope.selected = id
    await loadSchedules()
  }

  async function loadSchedules(): Promise<void> {
    const request = ++scheduleRequest
    if (!scope.selected || !hasAuth('MdmShiftScheduling:View')) {
      schedule.rows = []
      schedule.holidayDates = []
      schedule.error = ''
      schedule.loading = false
      return
    }
    schedule.loading = true
    schedule.error = ''
    try {
      const startDate = dayjs(schedule.month)
        .startOf('month')
        .subtract(7, 'day')
        .format('YYYY-MM-DD')
      const endDate = dayjs(schedule.month).endOf('month').add(7, 'day').format('YYYY-MM-DD')
      const [rows, holidayDates] = await Promise.all([
        fetchShiftSchedules({
          departmentId: scope.selected,
          startDate,
          endDate
        }),
        fetchShiftScheduleHolidayDates(scope.selected, startDate, endDate)
      ])
      if (request === scheduleRequest) {
        schedule.rows = rows
        schedule.holidayDates = holidayDates
      }
    } catch {
      if (request === scheduleRequest) schedule.error = '排班加载失败，请重试。'
    } finally {
      if (request === scheduleRequest) schedule.loading = false
    }
  }

  function moveMonth(amount: number): void {
    schedule.month = dayjs(schedule.month).add(amount, 'month').toDate()
  }

  function schedulesForDate(date: string): ShiftScheduleRecord[] {
    return schedule.rows.filter((row) =>
      isShiftScheduleActiveOnDate(row, date, holidayDateSet.value)
    )
  }

  function openSchedule(
    mode: 'add' | 'edit' | 'view',
    row?: ShiftScheduleRecord,
    initialDate?: string
  ): void {
    const department = selectedDepartment.value
    if (!department) return
    void scheduleDialog.value?.handleOpen({ mode, row, department, initialDate })
  }

  async function removeSchedule(row: ShiftScheduleRecord): Promise<void> {
    try {
      await confirmAction(
        `确认删除“${row.shiftName} · ${effectiveDate(row)}”排班？删除后将不再出现在日历和班表中。`,
        '删除排班',
        { type: 'warning' }
      )
      await deleteShiftSchedule(row.id)
      await loadSchedules()
    } catch {
      // Cancelled confirmations and API failures keep the current workspace intact.
    }
  }

  watch(monthKey, loadSchedules)
  void loadDepartments()
</script>

<style scoped lang="scss">
  @use '../modules/production-workspace';

  .shift-scheduling {
    &__scroll {
      min-width: 0;
      height: 100%;
    }

    &__content {
      min-width: 0;
      padding: 0 0 16px 16px;
    }

    &__guide {
      display: grid;
      grid-template-columns: 52px minmax(0, 1fr);
      gap: 16px;
      align-items: center;
      max-width: 560px;
      padding: 24px;
      background: color-mix(in srgb, var(--theme-color) 6%, var(--art-gray-100));
      border-radius: var(--art-surface-radius);

      > span {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 52px;
        height: 52px;
        font-size: 24px;
        color: var(--theme-color);
        background: var(--default-box-color);
        border-radius: var(--art-control-radius);
      }

      strong {
        font-size: 16px;
        color: var(--el-text-color-primary);
      }

      p {
        margin: 5px 0 0;
        line-height: 1.6;
        color: var(--el-text-color-secondary);
      }
    }

    &__toolbar {
      display: flex;
      gap: 16px;
      align-items: center;
      justify-content: space-between;
      min-width: 0;
      padding: 10px 12px;
      margin-bottom: 12px;
      background: var(--art-gray-100);
      border-radius: var(--art-control-radius);

      > p {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin: 0;
        font-size: 12px;
        color: var(--el-text-color-secondary);

        span {
          display: inline-flex;
          gap: 5px;
          align-items: center;
        }

        i {
          width: 7px;
          height: 7px;
          border-radius: 50%;

          &.is-active {
            background: var(--el-color-success);
          }

          &.is-upcoming {
            background: var(--el-color-warning);
          }

          &.is-expired {
            background: var(--el-text-color-placeholder);
          }
        }
      }
    }

    &__month-control {
      display: flex;
      gap: 8px;
      align-items: center;

      strong {
        min-width: 112px;
        font-variant-numeric: tabular-nums;
        color: var(--el-text-color-primary);
        text-align: center;
      }
    }

    &__calendar {
      overflow: hidden;
      border-radius: var(--art-surface-radius);

      :deep(.el-calendar__header) {
        display: none;
      }

      :deep(.el-calendar__body) {
        padding: 0;
      }

      :deep(.el-calendar-table th) {
        height: 38px;
        font-size: 12px;
        font-weight: 600;
        color: var(--el-text-color-secondary);
      }

      :deep(.el-calendar-table td) {
        vertical-align: top;
        border-color: var(--el-border-color-lighter);
      }

      :deep(.el-calendar-day) {
        height: 132px;
        padding: 0;
      }

      :deep(.el-calendar-table td.is-selected) {
        background: transparent;
      }
    }

    &__day {
      min-width: 0;
      height: 100%;
      padding: 8px;
      background: var(--default-box-color);

      &.is-outside {
        opacity: 0.5;
      }

      &.is-today {
        background: color-mix(in srgb, var(--theme-color) 5%, var(--default-box-color));
        box-shadow: inset 0 3px 0 var(--theme-color);
      }
    }

    &__day-head {
      display: flex;
      align-items: center;
      min-height: 24px;
      margin-bottom: 4px;

      strong {
        font-size: 13px;
        font-variant-numeric: tabular-nums;
        color: var(--el-text-color-primary);
      }

      small {
        margin-left: 5px;
        font-size: 10px;
        color: var(--theme-color);
      }

      .el-button {
        min-width: 24px;
        min-height: 24px;
        padding: 0;
        margin-left: auto;
      }
    }

    &__day-body {
      display: grid;
      gap: 4px;
      min-width: 0;
    }

    &__shift {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      min-width: 0;
      background: color-mix(in srgb, var(--schedule-color) 10%, var(--art-gray-100));
      border-radius: var(--el-border-radius-small);

      > button {
        min-width: 0;
        padding: 5px 6px;
        font: inherit;
        color: var(--el-text-color-regular);
        text-align: left;
        cursor: pointer;
        background: transparent;
        border: 0;
        border-radius: var(--el-border-radius-small);

        &:hover {
          color: var(--theme-color);
        }

        &:focus-visible {
          outline: 2px solid var(--theme-color);
          outline-offset: 1px;
        }

        span {
          display: flex;
          gap: 5px;
          align-items: center;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 12px;
          white-space: nowrap;

          i {
            flex: 0 0 7px;
            width: 7px;
            height: 7px;
            background: var(--schedule-color);
            border-radius: 50%;
          }
        }

        strong {
          display: block;
          margin-top: 1px;
          font-size: 11px;
          font-variant-numeric: tabular-nums;
          color: var(--el-text-color-secondary);
        }
      }
    }

    &__shift-actions {
      display: none;
      padding-right: 2px;

      :deep(.art-icon-button) {
        width: 24px;
        min-width: 24px;
        height: 24px;
        min-height: 24px;
      }
    }

    &__shift:hover &__shift-actions,
    &__shift:focus-within &__shift-actions {
      display: flex;
    }

    &__delete {
      color: var(--el-color-danger);
    }

    &__unset {
      padding: 5px 2px;
      font-size: 11px;
      color: var(--el-text-color-placeholder);
    }

    :deep(.shift-scheduling__table-shift) {
      display: grid;
      grid-template-columns: 8px minmax(0, 1fr);
      gap: 9px;
      align-items: center;
      min-width: 0;

      > i {
        width: 8px;
        height: 32px;
        border-radius: 999px;
      }

      > span,
      small {
        display: block;
        min-width: 0;
      }

      .el-button {
        max-width: 100%;
        padding: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      small {
        margin-top: 2px;
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }
    }

    :deep(.shift-scheduling__member-summary) {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    @media (width <= 1100px) {
      &__toolbar {
        flex-direction: column;
        align-items: flex-start;
      }

      &__calendar :deep(.el-calendar-day) {
        height: 122px;
      }
    }

    @media (width <= 767px) {
      &__content {
        padding: 12px 0 0;
      }

      &__month-control {
        justify-content: space-between;
        width: 100%;
      }

      &__calendar {
        min-width: 760px;
      }
    }
  }
</style>

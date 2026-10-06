<template>
  <ArtPermissionGuard permission="MdmStatutoryHoliday:View" resource-name="法定节假日">
    <div class="holiday-page business-workspace-page art-full-height">
      <BusinessWorkspaceHeader
        eyebrow="STATUTORY HOLIDAY CALENDAR"
        title="法定节假日"
        description="统一维护生产组织法定假期与调休区间，配置结果会自动标识到工厂日历。"
        icon="ri:calendar-event-line"
        :tags="[
          { label: '组织假期日历', type: 'primary', effect: 'plain' },
          { label: '系统组织联动', type: 'success', effect: 'light' }
        ]"
        :metrics="workspaceMetrics"
      >
        <template #actions>
          <BusinessTableWorkspaceActions
            :table="tableQueryRef"
            :show-display-controls="viewMode === 'list'"
          />
        </template>
      </BusinessWorkspaceHeader>

      <div class="holiday-page__viewbar">
        <div>
          <strong>{{ viewMode === 'calendar' ? '月历配置' : '明细管理' }}</strong>
          <span>{{
            viewMode === 'calendar' ? '点击日期即可新增安排' : '支持筛选、批量删除与导入导出'
          }}</span>
        </div>
        <ElSegmented v-model="viewMode" :options="viewOptions" />
      </div>

      <ArtSectionCard
        :show-scrollbar="false"
        v-show="viewMode === 'calendar'"
        class="holiday-page__calendar-card"
        title="假期日历"
        subtitle="区间内每一天都会显示对应假期；点击标签可直接编辑。"
        :loading="calendarLoading"
        :error="calendarError"
        :min-height="520"
        @retry="loadCalendarRows"
      >
        <template #actions>
          <ElButton @click="resetCalendarFilters"
            ><ArtSvgIcon icon="ri:restart-line" />重置</ElButton
          >
          <ElButton type="primary" @click="loadCalendarRows"
            ><ArtSvgIcon icon="ri:search-line" />查询</ElButton
          >
        </template>

        <div class="holiday-page__calendar-filters">
          <ElTreeSelect
            v-model="calendarFilters.organizationId"
            :data="organizationTree"
            :props="organizationTreeProps"
            node-key="id"
            value-key="id"
            check-strictly
            filterable
            clearable
            default-expand-all
            placeholder="全部公司/组织"
          />
          <ElSelect v-model="calendarFilters.holidayType" clearable placeholder="全部假期类型">
            <ElOption
              v-for="item in holidayTypeOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </ElSelect>
          <ElDatePicker
            v-model="calendarFilters.year"
            type="year"
            value-format="YYYY"
            format="YYYY 年"
            :clearable="false"
          />
        </div>

        <ElScrollbar class="holiday-page__calendar-scrollbar">
          <ElCalendar v-model="calendarDate" class="holiday-page__calendar">
            <template #header="{ date }">
              <div class="holiday-page__calendar-header">
                <ElButton text aria-label="上个月" @click="shiftMonth(-1)"
                  ><ArtSvgIcon icon="ri:arrow-left-s-line"
                /></ElButton>
                <strong>{{ date }}</strong>
                <ElButton text aria-label="下个月" @click="shiftMonth(1)"
                  ><ArtSvgIcon icon="ri:arrow-right-s-line"
                /></ElButton>
              </div>
            </template>
            <template #date-cell="{ data }">
              <div
                class="holiday-page__day"
                :class="{ 'is-other-month': data.type !== 'current-month' }"
              >
                <span class="holiday-page__day-heading">
                  <span>{{ dayjs(data.day).date() }}</span>
                  <button
                    type="button"
                    :aria-label="`${data.day}，新增节假日安排`"
                    title="新增当天安排"
                    v-if="hasAuth('MdmStatutoryHoliday:Add')"
                    @click="openDialog(undefined, data.day)"
                    ><ArtSvgIcon icon="ri:add-line"
                  /></button>
                </span>
                <span class="holiday-page__events">
                  <button
                    v-for="holiday in getDayHolidays(data.day).slice(0, 3)"
                    :key="holiday.id"
                    type="button"
                    class="holiday-page__event"
                    :disabled="!hasAuth('MdmStatutoryHoliday:Edit')"
                    :class="{
                      'is-work': holiday.holidayType === 'makeup_work',
                      'is-rest': holiday.holidayType === 'compensatory_leave'
                    }"
                    :title="`${resolveHolidayType(holiday.holidayType)} · ${holiday.organization.organizationName}`"
                    @click.stop="openDialog(holiday)"
                    >{{
                      holiday.holidayType === 'makeup_work'
                        ? '班 · 补班'
                        : holiday.holidayType === 'compensatory_leave'
                          ? '休 · 调休'
                          : resolveHolidayType(holiday.holidayType)
                    }}</button
                  >
                  <small v-if="getDayHolidays(data.day).length > 3"
                    >+{{ getDayHolidays(data.day).length - 3 }}</small
                  >
                </span>
              </div>
            </template>
          </ElCalendar>
        </ElScrollbar>
      </ArtSectionCard>

      <ArtTableQuery
        v-show="viewMode === 'list'"
        ref="tableQueryRef"
        v-model="searchQuery"
        :api-fn="fetchTableData"
        :search-items="searchItems"
        :columns-factory="columnsFactory"
        :header-actions="headerActions"
        header-actions-placement="workspace"
        :search-bar-props="{ span: 8, labelWidth: 88, showExpand: false }"
        :table-props="{
          rowKey: 'id',
          tableLayout: 'fixed',
          emptyText: '暂无节假日安排',
          emptyDescription: '可点击“新增”或在月历中选择日期配置。'
        }"
        focusable
      />

      <StatutoryHolidayDialog ref="dialogRef" @success="handleSaveSuccess" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { computed, onMounted, reactive, ref, shallowRef, watch } from 'vue'
  import { storeToRefs } from 'pinia'
  import { useAuth } from '@/hooks/core/useAuth'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import dayjs from 'dayjs'
  import { ElMessage } from 'element-plus'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExcelColumn,
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction,
    ArtTableQueryHeaderActionContext
  } from '@/components/core/tables/art-table-query/index.vue'
  import type { ColumnOption } from '@/types'
  import { pageInfoHandler } from '@/utils/table/tableUtils'
  import TreeUtils from '@/utils/tree'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useUserStore } from '@/store/modules/user'
  import { fetchGetOrganizationOptionsTree } from '@/api/system-manage'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric
  } from '@/components/business/business-workspace-header/index.vue'
  import {
    deleteStatutoryHolidays,
    fetchStatutoryHolidayList,
    saveStatutoryHoliday,
    type StatutoryHoliday,
    type StatutoryHolidaySearchParams
  } from '@/api/mdm'
  import StatutoryHolidayDialog, {
    type StatutoryHolidayDialogOpenData
  } from './modules/statutory-holiday-dialog.vue'

  defineOptions({ name: 'MdmStatutoryHoliday' })
  type Organization = Api.SystemManage.OrganizationListItem
  type TableParams = StatutoryHolidaySearchParams &
    Pick<Api.Common.PaginationParams, 'current' | 'size'>
  interface DialogExpose {
    handleOpen: (data: StatutoryHolidayDialogOpenData) => Promise<void>
  }
  interface HolidayImportRow {
    organizationCode: string
    holidayType: string
    startDate: string
    endDate: string
    remark?: string
  }

  const { hasAuth } = useAuth()
  const { confirmDelete } = useArtFeedback()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const treeUtils = new TreeUtils({ idKey: 'id', parentKey: 'parentId', childrenKey: 'children' })
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<DialogExpose>()
  const organizationTree = shallowRef<Organization[]>([])
  const calendarRows = shallowRef<StatutoryHoliday[]>([])
  const calendarLoading = ref(false)
  const calendarError = ref<string | null>(null)
  const calendarDate = ref(dayjs().startOf('month').toDate())
  const viewMode = ref<'calendar' | 'list'>('calendar')
  const viewOptions = [
    { label: '月历配置', value: 'calendar' },
    { label: '明细列表', value: 'list' }
  ]
  const searchQuery = ref<StatutoryHolidaySearchParams>({ year: dayjs().year() })
  const calendarFilters = reactive<{ organizationId?: string; holidayType?: string; year: string }>(
    { year: dayjs().format('YYYY') }
  )
  const organizationTreeProps = { children: 'children', label: 'organizationName', value: 'id' }

  const holidayTypeOptions = computed(() =>
    (getDictMap.value.smisHolidayType ?? []).map((item) => ({
      label: item.label || item.name,
      value: item.value
    }))
  )
  const flatOrganizations = computed(() => treeUtils.treeToList(organizationTree.value))
  const resolveHolidayType = (value: string): string =>
    holidayTypeOptions.value.find((item) => item.value === value)?.label || value
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '当前年度',
      value: calendarFilters.year,
      description: '日历展示年度',
      icon: 'ri:calendar-2-line'
    },
    {
      label: '假期安排',
      value: calendarRows.value.length,
      description: '当前筛选范围',
      icon: 'ri:calendar-event-line'
    },
    {
      label: '覆盖组织',
      value: new Set(calendarRows.value.map((row) => row.organizationId)).size,
      description: '已配置公司/组织',
      icon: 'ri:organization-chart',
      tone: 'success'
    },
    {
      label: '调休安排',
      value: calendarRows.value.filter((row) => row.holidayType === 'compensatory_leave').length,
      description: '当前年度调休区间',
      icon: 'ri:refresh-line',
      tone: 'warning'
    }
  ])
  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '公司/组织',
      key: 'organizationId',
      type: 'treeSelect',
      props: {
        data: organizationTree.value,
        props: organizationTreeProps,
        nodeKey: 'id',
        valueKey: 'id',
        checkStrictly: true,
        filterable: true,
        clearable: true,
        defaultExpandAll: true,
        placeholder: '全部公司/组织'
      }
    },
    {
      label: '假期类型',
      key: 'holidayType',
      type: 'select',
      props: { options: holidayTypeOptions.value, clearable: true, placeholder: '全部类型' }
    },
    {
      label: '年度',
      key: 'year',
      type: 'date',
      props: {
        type: 'year',
        valueFormat: 'YYYY',
        format: 'YYYY 年',
        clearable: true,
        class: '!w-full'
      }
    }
  ])
  const excelColumns: ArtTableQueryExcelColumn[] = [
    { key: 'organizationCode', title: '组织编码', required: true },
    { key: 'holidayType', title: '假期类型', required: true },
    { key: 'startDate', title: '开始日期', required: true },
    { key: 'endDate', title: '结束日期', required: true },
    { key: 'remark', title: '备注' }
  ]
  const importRows = async (rows: unknown[]): Promise<void> => {
    for (const raw of rows as HolidayImportRow[]) {
      const organization = flatOrganizations.value.find(
        (item) => item.organizationCode === String(raw.organizationCode).trim()
      )
      if (!organization?.id) throw new Error(`未找到组织编码：${raw.organizationCode}`)
      const type = holidayTypeOptions.value.find(
        (item) => item.value === raw.holidayType || item.label === raw.holidayType
      )
      if (!type) throw new Error(`无法识别假期类型：${raw.holidayType}`)
      await saveStatutoryHoliday({
        organizationId: organization.id,
        holidayType: type.value,
        startDate: dayjs(raw.startDate).format('YYYY-MM-DD'),
        endDate: dayjs(raw.endDate).format('YYYY-MM-DD'),
        remark: raw.remark || ''
      })
    }
    await loadCalendarRows()
  }
  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      permission: 'MdmStatutoryHoliday:Add',
      type: 'add',
      label: '新增节假日',
      onClick: () => openDialog()
    },
    {
      permission: 'MdmStatutoryHoliday:Import',
      type: 'import',
      importColumns: excelColumns,
      importApi: importRows,
      onImportError: () => {
        ElMessage.error('导入失败，请检查组织编码、假期类型与日期格式')
      }
    },
    {
      permission: 'MdmStatutoryHoliday:Export',
      type: 'export',
      exportFilename: '法定节假日',
      exportSheetName: '法定节假日',
      exportColumns: excelColumns,
      exportApi: async () => ({
        data: (
          await fetchStatutoryHolidayList({ ...searchQuery.value, from: 0, to: 4999 })
        ).data.map((row) => ({
          organizationCode: row.organization.organizationCode,
          holidayType: resolveHolidayType(row.holidayType),
          startDate: row.startDate,
          endDate: row.endDate,
          remark: row.remark || ''
        }))
      })
    },
    {
      permission: 'MdmStatutoryHoliday:Delete',
      type: 'delete',
      content: ({ selectedCount }: ArtTableQueryHeaderActionContext) =>
        `确定删除选中的 ${selectedCount} 条节假日安排吗？删除后无法恢复。`,
      onClick: async ({ selectedRows, api }) => {
        const ids = selectedRows
          .map((row) => row.id)
          .filter((id): id is string => typeof id === 'string')
        await deleteStatutoryHolidays(ids)
        await api.refreshRemove()
        await loadCalendarRows()
      }
    }
  ])
  const columnsFactory = (): ColumnOption<StatutoryHoliday>[] => [
    { type: 'selection', width: 48 },
    { type: 'globalIndex', label: '序号', width: 76 },
    {
      prop: 'organization',
      label: '公司/组织',
      minWidth: 210,
      formatter: (row) => (
        <div class="holiday-page__organization">
          <strong>{row.organization.organizationName}</strong>
          <small>{row.organization.organizationCode}</small>
        </div>
      )
    },
    {
      prop: 'holidayType',
      label: '假期类型',
      width: 120,
      formatter: (row) => (
        <ArtDictDisplay dictCode="smisHolidayType" value={row.holidayType} display="tag" />
      )
    },
    {
      prop: 'startDate',
      label: '日期区间',
      minWidth: 210,
      formatter: (row) => (
        <div class="holiday-page__period">
          <strong>
            {row.startDate} 至 {row.endDate}
          </strong>
          <small>共 {dayjs(row.endDate).diff(dayjs(row.startDate), 'day') + 1} 天</small>
        </div>
      )
    },
    { prop: 'remark', label: '备注', minWidth: 220, showOverflowTooltip: true },
    {
      prop: 'updateTime',
      label: '更新时间',
      width: 156,
      formatter: (row) => (row.updateTime ? dayjs(row.updateTime).format('YYYY-MM-DD HH:mm') : '—')
    },
    {
      prop: 'operation',
      label: '操作',
      width: 112,
      fixed: 'right',
      formatter: (row) => (
        <BusinessTableRowActions>
          <ArtButtonTable
            type="edit"
            permission="MdmStatutoryHoliday:Edit"
            onClick={() => openDialog(row)}
          />
          <ArtButtonTable
            type="delete"
            permission="MdmStatutoryHoliday:Delete"
            onClick={() => void handleDelete(row)}
          />
        </BusinessTableRowActions>
      )
    }
  ]
  const fetchTableData = (params: TableParams) => {
    const { from, to } = pageInfoHandler({ current: params.current, size: params.size })
    return fetchStatutoryHolidayList({
      organizationId: params.organizationId,
      holidayType: params.holidayType,
      year: params.year ? Number(params.year) : undefined,
      from,
      to
    })
  }
  const loadOrganizations = async (): Promise<void> => {
    const response = await fetchGetOrganizationOptionsTree({ status: '1' })
    organizationTree.value = response.data ?? []
  }
  const loadCalendarRows = async (): Promise<void> => {
    calendarLoading.value = true
    calendarError.value = null
    try {
      calendarRows.value = (
        await fetchStatutoryHolidayList({
          organizationId: calendarFilters.organizationId,
          holidayType: calendarFilters.holidayType,
          year: Number(calendarFilters.year),
          from: 0,
          to: 4999
        })
      ).data
    } catch {
      calendarError.value = '节假日日历加载失败，请稍后重试'
    } finally {
      calendarLoading.value = false
    }
  }
  const getDayHolidays = (date: string): StatutoryHoliday[] =>
    calendarRows.value.filter(
      (row) =>
        !dayjs(date).isBefore(row.startDate, 'day') && !dayjs(date).isAfter(row.endDate, 'day')
    )
  const shiftMonth = (offset: number): void => {
    calendarDate.value = dayjs(calendarDate.value).add(offset, 'month').toDate()
  }
  const resetCalendarFilters = (): void => {
    Object.assign(calendarFilters, {
      organizationId: undefined,
      holidayType: undefined,
      year: dayjs().format('YYYY')
    })
    calendarDate.value = dayjs().startOf('month').toDate()
    void loadCalendarRows()
  }
  const openDialog = (row?: StatutoryHoliday, selectedDate?: string): void => {
    if (!hasAuth(row ? 'MdmStatutoryHoliday:Edit' : 'MdmStatutoryHoliday:Add')) return
    void dialogRef.value?.handleOpen({
      organizations: organizationTree.value,
      row,
      selectedDate,
      defaultOrganizationId: calendarFilters.organizationId
    })
  }
  const handleSaveSuccess = async (type: 'add' | 'edit'): Promise<void> => {
    await (type === 'add'
      ? tableQueryRef.value?.refreshCreate()
      : tableQueryRef.value?.refreshUpdate())
    await loadCalendarRows()
  }
  const handleDelete = async (row: StatutoryHoliday): Promise<void> => {
    if (!row.id) return
    try {
      await confirmDelete(
        `确定删除“${resolveHolidayType(row.holidayType)}”安排吗？删除后无法恢复。`
      )
      await deleteStatutoryHolidays([row.id])
      await tableQueryRef.value?.refreshRemove()
      await loadCalendarRows()
    } catch {
      /* 用户取消 */
    }
  }
  watch(calendarDate, (value) => {
    const year = dayjs(value).format('YYYY')
    if (calendarFilters.year !== year) {
      calendarFilters.year = year
      void loadCalendarRows()
    }
  })
  onMounted(async () => {
    await Promise.all([userStore.ensureDictLoaded('smisHolidayType'), loadOrganizations()])
    await loadCalendarRows()
  })
</script>

<style scoped lang="scss">
  .holiday-page {
    gap: 12px;
    min-width: 0;

    &__viewbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      background: var(--default-box-color);
      border: 1px solid var(--art-card-border);
      border-radius: var(--el-border-radius-base);
    }

    &__viewbar > div {
      display: grid;
      min-width: 0;
    }

    &__viewbar span {
      margin-top: 2px;
      font-size: 11px;
      color: var(--el-text-color-secondary);
    }

    &__calendar-card {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
    }

    &__calendar-card :deep(.art-section-card__body) {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
    }

    &__calendar-filters {
      display: grid;
      grid-template-columns: minmax(220px, 1.35fr) minmax(160px, 1fr) 150px;
      gap: 12px;
      margin-bottom: 12px;
    }

    &__calendar-filters > * {
      width: 100%;
    }

    &__calendar {
      border-top: 1px solid var(--el-border-color-lighter);
    }

    &__calendar-scrollbar {
      flex: 1;
      min-height: 0;
    }

    &__calendar :deep(.el-calendar__header) {
      padding: 12px 4px;
    }

    &__calendar :deep(.el-calendar__body) {
      padding: 0;
    }

    &__calendar :deep(.el-calendar-day) {
      height: 92px;
      padding: 0;
    }

    &__calendar-header {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: center;
      width: 100%;
    }

    &__day {
      display: flex;
      flex-direction: column;
      gap: 5px;
      width: 100%;
      height: 100%;
      padding: 7px;
      color: var(--el-text-color-primary);
      text-align: left;
      background: transparent;
      border: 0;
    }

    &__day.is-other-month {
      color: var(--el-text-color-placeholder);
      opacity: 0.72;
    }

    &__events {
      display: grid;
      gap: 3px;
      min-width: 0;
    }

    &__day-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    &__day-heading button {
      display: inline-grid;
      place-items: center;
      width: 22px;
      height: 22px;
      padding: 0;
      color: var(--theme-color);
      cursor: pointer;
      background: transparent;
      border: 0;
      border-radius: var(--el-border-radius-small);
    }

    &__day-heading button:hover,
    &__day-heading button:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--theme-color) 35%, transparent);
      background: color-mix(in srgb, var(--theme-color) 10%, var(--el-bg-color));
    }

    &__event {
      padding: 2px 6px;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 11px;
      color: var(--theme-color);
      white-space: nowrap;
      cursor: pointer;
      background: color-mix(in srgb, var(--theme-color) 9%, var(--el-bg-color));
      border: 1px solid color-mix(in srgb, var(--theme-color) 18%, transparent);
      border-radius: var(--el-border-radius-small);
    }

    :deep(.holiday-page__organization),
    :deep(.holiday-page__period) {
      display: grid;
      min-width: 0;
    }

    :deep(.holiday-page__organization small),
    :deep(.holiday-page__period small) {
      margin-top: 2px;
      font-size: 11px;
      color: var(--el-text-color-secondary);
    }

    :deep(.holiday-page__organization strong),
    :deep(.holiday-page__organization small),
    :deep(.holiday-page__period strong),
    :deep(.holiday-page__period small) {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    @media (width <= 760px) {
      &__calendar-filters {
        grid-template-columns: 1fr;
      }

      &__calendar :deep(.el-calendar-day) {
        height: 78px;
      }
    }
  }
</style>

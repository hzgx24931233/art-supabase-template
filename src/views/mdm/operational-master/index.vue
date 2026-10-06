<template>
  <BusinessTypePage v-if="isBusinessTypeRoute" />
  <DocumentTypePage v-else-if="isDocumentTypeRoute" />
  <ArtPermissionGuard v-else :permission="`${config.routeName}:View`" :resource-name="config.title">
    <div class="operational-master-page business-workspace-page art-full-height">
      <BusinessWorkspaceHeader
        :eyebrow="config.eyebrow"
        :title="config.title"
        :description="config.description"
        :icon="config.icon"
        :tags="workspaceTags"
        :metrics="workspaceMetrics"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
      </BusinessWorkspaceHeader>

      <div
        class="operational-master-page__workspace"
        :class="{ 'has-group-panel': !!config.groupDomain }"
      >
        <MasterGroupPanel
          v-if="config.groupDomain"
          :title="config.groupTitle || '业务分组'"
          :groups="groupState.rows"
          :selected-id="groupState.selectedId"
          :loading="groupState.loading"
          :error="groupState.error"
          :manage-permission="`${config.routeName}:ManageGroup`"
          @select="selectGroup"
          @refresh="loadGroups"
          @add="openGroupAdd"
          @edit="openGroupEdit"
          @remove="removeGroup"
        />

        <ArtTableQuery
          ref="tableRef"
          v-model="table.search"
          :api-fn="fetchRows"
          :search-items="table.searchItems"
          :columns-factory="columnsFactory"
          :header-actions="table.headerActions"
          :selection-actions="table.selectionActions"
          :immediate="false"
          header-actions-placement="workspace"
          :search-bar-props="{ span: 8, labelWidth: 82, showExpand: false }"
          :table-props="{
            rowKey: 'id',
            tableLayout: 'fixed',
            emptyText: `暂无${config.title}`,
            emptyDescription: `点击新增，建立第一条${config.title}主数据。`
          }"
          :focus-scope-selector="
            config.groupDomain ? '.operational-master-page__workspace' : undefined
          "
          focusable
        />
      </div>

      <ActivityFormulaDialog
        v-if="config.kind === 'activity-formula'"
        ref="activityFormulaDialogRef"
        @success="handleSaved"
      />
      <MasterDialog v-else ref="dialogRef" @success="handleSaved" />
      <GroupDialog ref="groupDialogRef" @success="handleGroupSaved" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import dayjs from 'dayjs'
  import { ElTag } from 'element-plus'
  import { cloneDeep } from 'lodash-es'
  import TreeUtils from '@/utils/tree'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import ArtButtonMore from '@/components/core/forms/art-button-more/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric,
    type BusinessWorkspaceTag
  } from '@/components/business/business-workspace-header/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction,
    ArtTableQueryHeaderActionContext
  } from '@/components/core/tables/art-table-query/index.vue'
  import type { ColumnOption } from '@/types'
  import {
    deleteMasterGroup,
    deleteOperationalMasters,
    fetchMasterGroups,
    fetchOperationalMaster,
    fetchOperationalMasterReferences,
    importOperationalMasters,
    type MasterGroup,
    type MasterReferenceOption,
    type OperationalMasterInput,
    type OperationalMasterRecord,
    type OperationalMasterReferences
  } from '@/api/mdm'
  import GroupDialog, { type GroupDialogOpenData } from './modules/group-dialog.vue'
  import { activityFormulaPurposeLabel } from './modules/activity-formula-builder'
  import ActivityFormulaDialog from './modules/activity-formula-dialog.vue'
  import MasterDialog, { type MasterDialogOpenData } from './modules/master-dialog.vue'
  import MasterGroupPanel from '@/components/business/master-group-panel/index.vue'
  import { resolveMasterConfig } from './modules/master-config'
  import DocumentTypePage from '../document-type/index.vue'
  import BusinessTypePage from '../business-type/index.vue'

  defineOptions({ name: 'MdmOperationalMaster' })
  const declaredPermissions = [
    'MdmSalesCustomer:View',
    'MdmSalesCustomer:Add',
    'MdmSalesCustomer:Copy',
    'MdmSalesCustomer:Edit',
    'MdmSalesCustomer:Delete',
    'MdmSalesCustomer:Import',
    'MdmSalesCustomer:Export',
    'MdmSalesCustomer:ManageGroup',
    'MdmSalesProject:View',
    'MdmSalesProject:Add',
    'MdmSalesProject:Copy',
    'MdmSalesProject:Edit',
    'MdmSalesProject:Delete',
    'MdmSalesProject:Import',
    'MdmSalesProject:Export',
    'MdmSalesProject:ManageGroup',
    'MdmActivityFormula:View',
    'MdmActivityFormula:Add',
    'MdmActivityFormula:Copy',
    'MdmActivityFormula:Edit',
    'MdmActivityFormula:Delete',
    'MdmActivityFormula:Export',
    'MdmActivityFormula:ManageParameter',
    'MdmOperationControlCode:View',
    'MdmOperationControlCode:Add',
    'MdmOperationControlCode:Copy',
    'MdmOperationControlCode:Edit',
    'MdmOperationControlCode:Delete',
    'MdmOperationControlCode:Export',
    'MdmOperationSet:View',
    'MdmOperationSet:Add',
    'MdmOperationSet:Copy',
    'MdmOperationSet:Edit',
    'MdmOperationSet:Delete',
    'MdmOperationSet:Import',
    'MdmOperationSet:Export',
    'MdmOperationSet:ManageGroup',
    'MdmWorkstation:View',
    'MdmWorkstation:Add',
    'MdmWorkstation:Copy',
    'MdmWorkstation:Edit',
    'MdmWorkstation:Delete',
    'MdmWorkstation:Export'
  ] as const
  void declaredPermissions

  const route = useRoute()
  const isDocumentTypeRoute = computed(() => route.path.endsWith('/document-type'))
  const isBusinessTypeRoute = computed(() => route.path.endsWith('/business-type'))
  const { confirmDelete } = useArtFeedback()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const tenantScopeStore = useTenantScopeStore()
  const { effectiveTenantId, tenantOptions } = storeToRefs(tenantScopeStore)
  const config = computed(() => resolveMasterConfig(route.path))
  const tableRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<{ handleOpen: (data: MasterDialogOpenData) => Promise<void> }>()
  const activityFormulaDialogRef = ref<{
    handleOpen: (data: MasterDialogOpenData) => Promise<void>
  }>()
  const groupDialogRef = ref<{ handleOpen: (data: GroupDialogOpenData) => Promise<void> }>()
  const overview = reactive({ total: 0, enabled: 0, rows: [] as OperationalMasterRecord[] })
  const groupState = reactive({
    rows: [] as MasterGroup[],
    selectedId: '',
    loading: false,
    error: ''
  })
  const groupTreeUtils = new TreeUtils({ parentKey: 'parentId' })
  const selectedGroupIds = computed(() =>
    groupState.selectedId
      ? groupTreeUtils
          .getDescendants(groupTreeUtils.listToTree(groupState.rows), groupState.selectedId, true)
          .map((group) => String(group.id))
      : undefined
  )
  const references = ref<OperationalMasterReferences>({
    customers: [],
    employees: [],
    departments: [],
    workCenters: [],
    personnel: [],
    units: [],
    menus: []
  })

  void userStore.ensureDictLoaded('commonBoolean')
  const workspaceTags = computed<BusinessWorkspaceTag[]>(() => [
    { label: config.value.groupDomain ? '层级分组' : '统一口径', type: 'primary' },
    { label: '租户隔离', type: 'success' },
    { label: '权限受控', type: 'info' }
  ])
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '主档总数',
      value: overview.total,
      description: '当前筛选范围内记录',
      icon: config.value.icon
    },
    {
      label: '本页已启用',
      value: overview.enabled,
      description: '可供下游业务引用',
      icon: 'ri:checkbox-circle-line',
      tone: 'success'
    },
    {
      label: config.value.groupDomain ? '分组节点' : '资料状态',
      value: config.value.groupDomain
        ? groupState.rows.length
        : overview.total
          ? '已建立'
          : '待建设',
      description: config.value.groupDomain ? '支持多级业务分类' : '保持编码与名称完整',
      icon: config.value.groupDomain ? 'ri:node-tree' : 'ri:shield-check-line',
      tone: overview.total ? 'success' : 'warning'
    }
  ])

  const booleanOptions = computed(() =>
    (getDictMap.value.commonBoolean ?? []).map((item) => ({
      ...item,
      value: item.value === 'true' || item.value === '1'
    }))
  )
  const table = reactive({
    search: { keyword: '', enabled: undefined as boolean | undefined },
    searchItems: computed<SearchFormItem[]>(() => [
      {
        key: 'keyword',
        label: '关键字',
        type: 'input',
        props: { clearable: true, placeholder: '编码、名称或业务说明' }
      },
      {
        key: 'enabled',
        label: '启用状态',
        type: 'select',
        props: { clearable: true, placeholder: '全部状态', options: booleanOptions.value }
      }
    ]),
    headerActions: computed<ArtTableQueryHeaderAction[]>(() => {
      const actions: ArtTableQueryHeaderAction[] = [
        {
          type: 'add',
          label: `新增${config.value.title}`,
          permission: `${config.value.routeName}:Add`,
          onClick: () => openDialog()
        },
        {
          key: 'copy',
          label: '复制',
          icon: 'ri:file-copy-line',
          permission: `${config.value.routeName}:Copy`,
          selectionRequired: true,
          disabled: ({ selectedCount }: ArtTableQueryHeaderActionContext) => selectedCount !== 1,
          onClick: ({ selectedRows }) =>
            openDialog(selectedRows[0] as OperationalMasterRecord, true)
        },
        {
          type: 'export',
          label: '导出',
          permission: `${config.value.routeName}:Export`,
          exportColumns: config.value.fields
            .filter((field) => field.table || field.exportable)
            .map((field) => ({ key: String(field.key), title: field.label }))
        }
      ]
      if (config.value.importable) {
        actions.splice(1, 0, {
          type: 'import',
          label: '导入',
          permission: `${config.value.routeName}:Import`,
          importColumns: config.value.fields
            .filter(
              (field) =>
                field.key !== 'groupId' &&
                !field.reference &&
                field.type !== 'slot' &&
                !field.systemGenerated
            )
            .map((field) => ({
              key: String(field.key),
              title: field.label,
              required: !!field.required
            })),
          importTransformer: (rows) =>
            rows.map((row) => ({
              ...row,
              tenantId: effectiveTenantId.value || '',
              enabled: row.enabled === '是' || row.enabled === true || row.enabled === '启用'
            })),
          importApi: async (rows) => {
            if (!effectiveTenantId.value) throw new Error('请先选择目标租户再导入')
            await importOperationalMasters(config.value.kind, rows as OperationalMasterInput[])
          }
        })
      }
      return actions
    }),
    selectionActions: computed<ArtTableQueryHeaderAction[]>(() => [
      {
        type: 'delete',
        permission: `${config.value.routeName}:Delete`,
        content: (context: ArtTableQueryHeaderActionContext) =>
          `确定删除选中的 ${context.selectedCount} 条${config.value.title}吗？`,
        onClick: async (context: ArtTableQueryHeaderActionContext) => {
          await deleteOperationalMasters(
            config.value.kind,
            context.selectedRows.map((row) => String(row.id))
          )
          await context.api.refreshRemove()
        }
      }
    ])
  })

  function referenceLabel(items: MasterReferenceOption[], id: unknown): string {
    if (!id) return '—'
    const ids = Array.isArray(id) ? id : [id]
    return ids.map((value) => items.find((item) => item.id === value)?.name || '未识别').join('、')
  }

  function displayValue(row: OperationalMasterRecord, key: keyof OperationalMasterRecord): string {
    const value = row[key]
    const field = config.value.fields.find((item) => item.key === key)
    if (config.value.kind === 'activity-formula') {
      if (key === 'purpose') {
        const rawValue = value === null || value === undefined ? '' : String(value)
        const dictionaryLabel = getDictMap.value[field?.dictCode || '']?.find(
          (item) => item.value === rawValue
        )?.label
        return rawValue ? activityFormulaPurposeLabel(rawValue, dictionaryLabel) : '—'
      }
      if (key === 'activityTypes') {
        const legacyActivityType = row.activityType ? [row.activityType] : []
        const activityTypes = Array.isArray(value) && value.length ? value : legacyActivityType
        return (
          activityTypes
            .map(
              (entry) =>
                getDictMap.value[field?.dictCode || '']?.find((item) => item.value === entry)
                  ?.label || String(entry)
            )
            .join('、') || '—'
        )
      }
      if (key === 'formulaExpression') {
        return row.formulaExpression || row.planExpression || row.reportExpression || '—'
      }
      if (key === 'formulaTranslation') {
        return (
          row.formulaTranslation ||
          row.formulaExpression ||
          row.planExpression ||
          row.reportExpression ||
          '—'
        )
      }
    }
    if (key === 'groupId')
      return groupState.rows.find((item) => item.id === value)?.name || '未分组'
    if (field?.reference) return referenceLabel(references.value[field.reference], value)
    if (field?.dictCode) {
      if (Array.isArray(value)) {
        return (
          value
            .map(
              (entry) =>
                getDictMap.value[field.dictCode!]?.find((item) => item.value === entry)?.label ||
                String(entry)
            )
            .join('、') || '—'
        )
      }
      const normalizedValue = typeof value === 'boolean' ? String(value) : value
      return (
        getDictMap.value[field.dictCode]?.find((item) => item.value === normalizedValue)?.label ||
        (value === null || value === undefined || value === '' ? '—' : String(value))
      )
    }
    if (key === 'ownerId' || key === 'salespersonId') {
      return referenceLabel(references.value.employees, value)
    }
    if (key === 'responsiblePersonId') {
      return referenceLabel(references.value.personnel, value)
    }
    if (Array.isArray(value)) return value.join('、') || '—'
    if (typeof value === 'boolean') return value ? '是' : '否'
    return value === null || value === undefined || value === '' ? '—' : String(value)
  }

  const columnsFactory = (): ColumnOption<OperationalMasterRecord>[] => {
    const columns: ColumnOption<OperationalMasterRecord>[] = [
      { type: 'selection', width: 48 },
      { type: 'globalIndex', label: '序号', width: 72 }
    ]
    for (const field of config.value.fields.filter((item) => item.table)) {
      if (field.key === 'enabled') {
        columns.push({
          prop: 'enabled',
          label: field.label,
          width: field.width,
          align: 'center',
          formatter: (row) => (
            <ElTag type={row.enabled ? 'success' : 'info'} effect="light">
              {row.enabled ? '启用' : '停用'}
            </ElTag>
          )
        })
      } else {
        columns.push({
          prop: String(field.key),
          label: field.label,
          width: field.width,
          minWidth: field.minWidth,
          fixed: field.key === config.value.nameKey ? 'left' : undefined,
          showOverflowTooltip: true,
          link:
            field.key === config.value.nameKey
              ? {
                  permission: `${config.value.routeName}:View`,
                  onClick: (row) => openDialog(row, false, true)
                }
              : undefined,
          formatter: (row) => displayValue(row, field.key)
        })
      }
    }
    columns.push(
      {
        prop: 'updateTime',
        label: '更新时间',
        width: 164,
        formatter: (row) =>
          row.updateTime ? dayjs(row.updateTime).format('YYYY-MM-DD HH:mm') : '—'
      },
      {
        prop: 'operation',
        label: '操作',
        width: 178,
        fixed: 'right',
        formatter: (row) => (
          <BusinessTableRowActions>
            <ArtButtonTable
              type="view"
              permission={`${config.value.routeName}:View`}
              onClick={() => openDialog(row, false, true)}
            />
            <ArtButtonTable
              type="edit"
              permission={`${config.value.routeName}:Edit`}
              onClick={() => openDialog(row)}
            />
            <ArtButtonMore
              list={[
                {
                  key: 'copy',
                  label: '复制',
                  icon: 'ri:file-copy-line',
                  auth: `${config.value.routeName}:Copy`
                },
                {
                  key: 'delete',
                  label: '删除',
                  icon: 'ri:delete-bin-6-line',
                  color: 'var(--el-color-danger)',
                  auth: `${config.value.routeName}:Delete`
                }
              ]}
              onClick={(item) =>
                item.key === 'copy' ? openDialog(row, true) : void removeRow(row)
              }
            />
          </BusinessTableRowActions>
        )
      }
    )
    return columns
  }

  async function fetchRows(
    params: { current: number; size: number; keyword?: string; enabled?: boolean },
    options?: { signal?: AbortSignal }
  ) {
    const response = await fetchOperationalMaster(
      config.value.kind,
      {
        ...params,
        tenantId: effectiveTenantId.value,
        groupId: groupState.selectedId || undefined,
        groupIds: selectedGroupIds.value
      },
      options
    )
    overview.total = response.total
    overview.rows = response.data
    overview.enabled = response.data.filter((row) => row.enabled).length
    return { records: response.data, total: response.total }
  }

  function tenantChoices(): Array<{ label: string; value: string }> {
    return tenantOptions.value.map((tenant) => ({
      label: `${tenant.tenantName || tenant.tenantCode}（${tenant.tenantCode}）`,
      value: tenant.id
    }))
  }

  function openDialog(row?: OperationalMasterRecord, copy = false, readonly = false): void {
    const data: MasterDialogOpenData = {
      config: config.value,
      tenantId: row?.tenantId || effectiveTenantId.value || '',
      tenantOptions: tenantChoices(),
      groups: groupState.rows,
      initialGroupId:
        config.value.kind === 'operation' && !row ? groupState.selectedId || undefined : undefined,
      row: row ? cloneDeep(row) : undefined,
      copy,
      readonly
    }
    if (config.value.kind === 'activity-formula') {
      void activityFormulaDialogRef.value?.handleOpen(data)
      return
    }
    void dialogRef.value?.handleOpen(data)
  }

  function openGroupAdd(parent?: MasterGroup): void {
    if (!config.value.groupDomain) return
    void groupDialogRef.value?.handleOpen({
      domain: config.value.groupDomain,
      tenantId: parent?.tenantId || effectiveTenantId.value || '',
      tenantOptions: tenantChoices(),
      groups: groupState.rows,
      parent
    })
  }

  function openGroupEdit(row: MasterGroup): void {
    if (!config.value.groupDomain) return
    void groupDialogRef.value?.handleOpen({
      domain: config.value.groupDomain,
      tenantId: row.tenantId,
      tenantOptions: tenantChoices(),
      groups: groupState.rows,
      row
    })
  }

  async function removeRow(row: OperationalMasterRecord): Promise<void> {
    await confirmDelete(`确定删除“${displayValue(row, config.value.nameKey)}”吗？`)
    await deleteOperationalMasters(config.value.kind, [row.id])
    await tableRef.value?.refreshRemove()
  }

  async function removeGroup(row: MasterGroup): Promise<void> {
    await confirmDelete(`确定删除分组“${row.name}”吗？`)
    await deleteMasterGroup(row.id)
    if (groupState.selectedId === row.id) groupState.selectedId = ''
    await loadGroups()
    await tableRef.value?.refreshData()
  }

  async function loadGroups(): Promise<void> {
    if (!config.value.groupDomain) {
      groupState.rows = []
      return
    }
    groupState.loading = true
    groupState.error = ''
    try {
      groupState.rows = await fetchMasterGroups(config.value.groupDomain, effectiveTenantId.value)
    } catch (error) {
      groupState.error = getFriendlySupabaseErrorMessage(error, '分组加载失败，请重试')
    } finally {
      groupState.loading = false
    }
  }

  function selectGroup(id: string): void {
    groupState.selectedId = id
    void tableRef.value?.getData()
  }

  async function handleSaved(mode: 'add' | 'edit'): Promise<void> {
    if (mode === 'add') await tableRef.value?.refreshCreate()
    else await tableRef.value?.refreshUpdate()
    references.value = await fetchOperationalMasterReferences(effectiveTenantId.value || undefined)
  }

  async function handleGroupSaved(): Promise<void> {
    await loadGroups()
    await tableRef.value?.refreshData()
  }

  async function loadContext(): Promise<void> {
    Object.assign(table.search, { keyword: '', enabled: undefined })
    groupState.selectedId = ''
    await tenantScopeStore.loadTenantOptions()
    await Promise.all([
      ...config.value.fields
        .map((field) => field.dictCode)
        .filter((code): code is string => !!code)
        .map((code) => userStore.ensureDictLoaded(code)),
      loadGroups(),
      fetchOperationalMasterReferences(effectiveTenantId.value || undefined).then(
        (value) => (references.value = value)
      )
    ])
    await tableRef.value?.getData()
  }

  watch(
    [() => route.path, effectiveTenantId],
    () => {
      if (isDocumentTypeRoute.value || isBusinessTypeRoute.value) return
      void loadContext()
    },
    { immediate: true }
  )
</script>

<style scoped lang="scss">
  .operational-master-page {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
    min-height: 0;

    &__workspace {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-height: 0;

      &.has-group-panel {
        display: grid;
        grid-template-columns: minmax(250px, 300px) minmax(0, 1fr);
        gap: 14px;
      }
    }

    @media (width <= 1024px) {
      &__workspace.has-group-panel {
        grid-template-columns: minmax(220px, 260px) minmax(0, 1fr);
      }
    }

    @media (width <= 767px) {
      &__workspace.has-group-panel {
        grid-template-rows: minmax(240px, 34vh) minmax(520px, 1fr);
        grid-template-columns: 1fr;
      }
    }
  }
</style>

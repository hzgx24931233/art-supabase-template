<template>
  <div class="production-workspace business-workspace-page art-full-height">
    <ProductionWorkspaceHeader
      :title="departmentMode ? '部门 / 产线' : '人员配置'"
      :description="
        departmentMode
          ? '维护工厂、车间与产线层级，为人员、工作中心和生产日历提供统一组织范围。'
          : '按产线配置生产人员，关联员工花名册与岗位信息，统一工号和作业身份。'
      "
      :icon="departmentMode ? 'ri:node-tree' : 'ri:team-line'"
      :capability="departmentMode ? '组织层级治理' : '人员身份配置'"
      :metrics="metrics"
      density="compact"
    >
      <template #actions>
        <BusinessTableWorkspaceActions
          v-if="departmentMode || canViewPeople"
          :table="departmentMode ? departmentTableRef : tableRef"
        />
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
            @select="selectDepartment"
            @refresh="loadDepartments"
          />
        </template>
        <div class="production-workspace__main">
          <ArtTableQuery
            v-if="departmentMode"
            ref="departmentTableRef"
            v-model="departmentTable.search"
            :api-fn="fetchDepartmentTableData"
            :search-items="departmentSearchItems"
            :columns-factory="departmentColumnsFactory"
            :header-actions="departmentHeaderActions"
            header-actions-placement="workspace"
            :table-props="{
              rowKey: 'id',
              tableLayout: 'fixed',
              emptyText: '暂无生产组织',
              emptyDescription: '新增部门或产线，建立生产人员、工作中心与日历的组织基础。'
            }"
            :search-bar-props="{ span: 8, labelWidth: 76, showExpand: false }"
            :on-success="onDepartmentTableSuccess"
            :enable-cache="false"
            focusable
            focus-scope-selector=".production-workspace__body"
          />
          <ArtTableQuery
            v-else-if="canViewPeople"
            ref="tableRef"
            v-model="table.search"
            :api-fn="fetchTableData"
            :search-items="searchItems"
            :columns-factory="columnsFactory"
            :header-actions="headerActions"
            header-actions-placement="workspace"
            :selection-actions="selectionActions"
            :table-props="{
              rowKey: 'id',
              tableLayout: 'fixed',
              emptyText: '暂无生产人员',
              emptyDescription: '请调整部门范围，或新增、导入人员配置。'
            }"
            :search-bar-props="{ span: 8, labelWidth: 76, showExpand: false }"
            :on-success="onTableSuccess"
            :enable-cache="false"
            focusable
            focus-scope-selector=".production-workspace__body"
          >
          </ArtTableQuery>
          <ArtSectionCard v-else title="人员信息" class="production-workspace__personnel-access">
            <ElAlert
              title="人员信息需要单独授权"
              description="当前账号没有“人员配置 · 查看”权限，未加载人员档案。请联系管理员在角色管理中授权；部门浏览与已有部门操作不受影响。"
              type="info"
              show-icon
              :closable="false"
            />
          </ArtSectionCard>
        </div>
      </ArtWorkspaceSplitter>
    </div>
    <DepartmentDialog ref="departmentDialog" @success="loadDepartments" />
    <PersonDialog v-if="canViewPeople" ref="personDialog" @success="refreshPeople" />
    <RecordDetail ref="detailRef" />
  </div>
</template>
<script setup lang="tsx">
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { ref, reactive, computed, watch } from 'vue'
  import { storeToRefs } from 'pinia'
  import { ElAvatar, ElMessage, ElTag } from 'element-plus'
  import type { ColumnOption } from '@/types'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type { BusinessWorkspaceMetric } from '@/components/business/business-workspace-header/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction,
    ArtTableQueryProps
  } from '@/components/core/tables/art-table-query/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtButtonMore, {
    type ButtonMoreItem
  } from '@/components/core/forms/art-button-more/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import { resolveTenantWriteTargetId } from '@/utils/tenant-scope-context'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useAuth } from '@/hooks/core/useAuth'
  import {
    fetchProductionDepartments,
    fetchProductionPeople,
    deleteProductionDepartment,
    setProductionDepartmentEnabled,
    deleteProductionPeople,
    setProductionPeopleEnabled,
    importProductionDepartments,
    importProductionPeople,
    type ProductionDepartment,
    type ProductionPerson,
    type ProductionPeopleQuery
  } from '@/api/mdm'
  import ProductionTree from '../modules/production-tree.vue'
  import ProductionWorkspaceHeader from '../modules/production-workspace-header.vue'
  import DepartmentDialog from '../modules/department-dialog.vue'
  import PersonDialog from '../modules/person-dialog.vue'
  import RecordDetail from '../modules/record-detail.vue'
  import { productionTree } from '../modules/production-model'
  import {
    departmentLabels,
    personLabels,
    exportDepartments,
    exportPeople,
    parseDepartmentImport,
    parsePeopleImport
  } from '../modules/production-transfer'

  const commonEnabledDisabledStatusOptions = useDictionaryOptions(
    'commonEnabledDisabledStatus',
    (value) => value === 'enabled'
  )
  defineOptions({ name: 'MdmProductionPersonnel' })
  const props = withDefaults(
    defineProps<{
      departmentMode?: boolean
      departmentPermissions?: Record<
        'add' | 'edit' | 'delete' | 'view' | 'import' | 'export' | 'enable' | 'disable',
        string
      >
    }>(),
    {
      departmentMode: false,
      departmentPermissions: () => ({
        add: '',
        edit: '',
        delete: '',
        view: '',
        import: '',
        export: '',
        enable: '',
        disable: ''
      })
    }
  )
  const user = useUserStore()
  const tenantScopeStore = useTenantScopeStore()
  const { effectiveTenantId, isAllTenants, tenantOptions } = storeToRefs(tenantScopeStore)
  const tenantNames = computed(() =>
    Object.fromEntries(tenantOptions.value.map((tenant) => [tenant.id, tenant.tenantName]))
  )
  const tenantName = (tenantId: string): string => tenantNames.value[tenantId] || tenantId
  const { hasAuth } = useAuth()
  const canViewPeople = computed(
    () => !props.departmentMode && hasAuth('MdmProductionPersonnel:View')
  )
  const { confirmAction } = useArtFeedback()
  const tableRef = ref<ArtTableQueryExpose>()
  const departmentTableRef = ref<ArtTableQueryExpose>()
  const departmentDialog = ref<InstanceType<typeof DepartmentDialog>>()
  const personDialog = ref<InstanceType<typeof PersonDialog>>()
  const detailRef = ref<InstanceType<typeof RecordDetail>>()
  const scope = reactive({
    departments: [] as ProductionDepartment[],
    selected: '',
    loading: false,
    error: ''
  })
  const table = reactive({
    search: { keyword: '', phone: '', enabled: undefined as boolean | undefined },
    total: 0,
    importing: false
  })
  const departmentTable = reactive({
    search: {
      keyword: '',
      kind: '',
      enabled: undefined as boolean | undefined
    },
    total: 0
  })
  watch(canViewPeople, (allowed) => {
    if (!allowed) table.total = 0
  })
  const selectedDepartment = computed(() => scope.departments.find((d) => d.id === scope.selected))
  const metrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '生产部门',
      value: scope.departments.length,
      icon: 'ri:node-tree',
      description: isAllTenants.value ? '全部租户组织层级' : '当前租户组织层级',
      loading: scope.loading
    },
    {
      label: '启用部门',
      value: scope.departments.filter((d) => d.enabled).length,
      icon: 'ri:checkbox-circle-line',
      description: '可用的生产组织',
      tone: 'success',
      loading: scope.loading
    },
    ...(props.departmentMode
      ? [
          {
            label: '当前范围',
            value: departmentTable.total,
            icon: 'ri:focus-3-line',
            description: selectedDepartment.value?.name || '全部生产组织',
            tone: 'primary' as const
          }
        ]
      : canViewPeople.value
        ? [
            {
              label: '筛选人员',
              value: table.total,
              icon: 'ri:team-line',
              description: '当前查询范围内的人员',
              tone: 'primary' as const
            }
          ]
        : [])
  ])
  interface DepartmentQuery {
    current: number
    size: number
    keyword?: string
    kind?: string
    enabled?: boolean
  }
  const departmentSearchItems: SearchFormItem[] = [
    {
      key: 'keyword',
      label: '生产组织',
      type: 'input',
      props: { placeholder: '名称 / 编码 / 工厂', clearable: true }
    },
    {
      key: 'kind',
      label: '组织类型',
      type: 'select',
      props: {
        clearable: true,
        options: user.getDictMap.mdmProductionDepartmentKind ?? []
      }
    },
    {
      key: 'enabled',
      label: '状态',
      type: 'select',
      props: {
        clearable: true,
        options: commonEnabledDisabledStatusOptions
      }
    }
  ]
  const searchItems: SearchFormItem[] = [
    {
      key: 'keyword',
      label: '人员',
      type: 'input',
      props: { placeholder: '姓名 / 工号 / 条码', clearable: true }
    },
    {
      key: 'phone',
      label: '手机号',
      type: 'input',
      props: { placeholder: '输入手机号', clearable: true }
    },
    {
      key: 'enabled',
      label: '状态',
      type: 'select',
      props: {
        clearable: true,
        options: commonEnabledDisabledStatusOptions
      }
    }
  ]
  let departmentRequest = 0
  async function loadDepartments() {
    const request = ++departmentRequest
    scope.loading = true
    scope.error = ''
    try {
      await tenantScopeStore.loadTenantOptions()
      const rows = await fetchProductionDepartments(effectiveTenantId.value)
      if (request !== departmentRequest) return
      scope.departments = rows
      if (scope.selected && !rows.some((d) => d.id === scope.selected)) scope.selected = ''
      await (props.departmentMode
        ? departmentTableRef.value?.refreshData()
        : tableRef.value?.refreshData())
    } catch {
      if (request === departmentRequest) scope.error = '部门加载失败，请重试。'
    } finally {
      if (request === departmentRequest) scope.loading = false
    }
  }
  const departmentIds = () =>
    scope.selected
      ? productionTree
          .getDescendants(productionTree.listToTree(scope.departments), scope.selected, true)
          .map((d) => d.id)
      : undefined
  async function fetchTableData(params: ProductionPeopleQuery, options?: { signal?: AbortSignal }) {
    if (!canViewPeople.value) throw new Error('人员信息需要单独授权')
    return fetchProductionPeople(
      { ...params, tenantId: effectiveTenantId.value, departmentIds: departmentIds() },
      options
    )
  }
  const onTableSuccess: ArtTableQueryProps['onSuccess'] = (_rows, response) => {
    table.total = canViewPeople.value ? (response.total ?? 0) : 0
  }
  async function selectDepartment(id: string) {
    scope.selected = id
    await (props.departmentMode
      ? departmentTableRef.value?.refreshContext()
      : tableRef.value?.refreshContext())
  }
  async function refreshPeople() {
    await tableRef.value?.refreshData()
  }
  function openDepartment(row?: ProductionDepartment) {
    void departmentDialog.value?.handleOpen({
      row,
      parentId: scope.selected,
      departments: scope.departments
    })
  }
  function openPerson(row?: ProductionPerson) {
    void personDialog.value?.handleOpen({
      row,
      departmentId: scope.selected,
      departments: scope.departments
    })
  }
  function viewDepartmentRow(row: ProductionDepartment) {
    void detailRef.value?.handleOpen(
      '部门 / 产线详情',
      {
        ...row,
        parentCode: scope.departments.find((d) => d.id === row.parentId)?.code,
        enabledText: row.enabled ? '启用' : '禁用'
      },
      departmentLabels
    )
  }
  function viewPerson(row: ProductionPerson) {
    void detailRef.value?.handleOpen(
      '生产人员详情',
      {
        ...row,
        departmentCode: row.department?.code,
        permissionDepartmentCodes: row.permissionDepartmentIds
          .map((id) => scope.departments.find((d) => d.id === id)?.name || '')
          .join('、'),
        enabledText: row.enabled ? '启用' : '禁用'
      },
      personLabels
    )
  }
  async function removeDepartment(row: ProductionDepartment) {
    try {
      await confirmAction(`确认删除“${row.name}”？有关联人员或下级部门时无法删除。`, '删除部门', {
        type: 'warning'
      })
      await deleteProductionDepartment(row.id)
      await loadDepartments()
    } catch {
      /* Cancellation or API-owned notification. */
    }
  }
  async function toggleDepartment(row: ProductionDepartment) {
    try {
      await setProductionDepartmentEnabled(row.id, !row.enabled)
      await loadDepartments()
    } catch {
      /* API owns failure feedback. */
    }
  }
  const departmentMoreActions = (row: ProductionDepartment): ButtonMoreItem[] => [
    {
      key: 'toggle',
      label: row.enabled ? '禁用' : '启用',
      icon: row.enabled ? 'ri:forbid-line' : 'ri:checkbox-circle-line',
      auth: row.enabled ? 'MdmProductionDepartment:Disable' : 'MdmProductionDepartment:Enable'
    },
    {
      key: 'delete',
      label: '删除',
      icon: 'ri:delete-bin-6-line',
      color: 'var(--el-color-danger)',
      auth: 'MdmProductionDepartment:Delete'
    }
  ]
  function handleDepartmentMore(key: ButtonMoreItem['key'], row: ProductionDepartment) {
    if (key === 'toggle') void toggleDepartment(row)
    if (key === 'delete') void removeDepartment(row)
  }
  async function fetchDepartmentTableData(params: DepartmentQuery) {
    const scopedIds = departmentIds()
    const normalizedKeyword = params.keyword?.trim().toLocaleLowerCase('zh-CN') || ''
    const filtered = scope.departments.filter((row) => {
      if (scopedIds && !scopedIds.includes(row.id)) return false
      if (params.kind && row.kind !== params.kind) return false
      if (typeof params.enabled === 'boolean' && row.enabled !== params.enabled) return false
      return (
        !normalizedKeyword ||
        [row.name, row.code, row.factory].some((value) =>
          value.toLocaleLowerCase('zh-CN').includes(normalizedKeyword)
        )
      )
    })
    const start = (params.current - 1) * params.size
    return {
      data: filtered.slice(start, start + params.size),
      total: filtered.length,
      current: params.current,
      size: params.size
    }
  }
  const onDepartmentTableSuccess: ArtTableQueryProps['onSuccess'] = (_rows, response) => {
    departmentTable.total = Number(response.total ?? 0)
  }
  const departmentColumnsFactory = (): ColumnOption<ProductionDepartment>[] => [
    {
      prop: 'name',
      label: '部门 / 产线',
      minWidth: 220,
      fixed: 'left',
      link: { permission: props.departmentPermissions.view, onClick: viewDepartmentRow },
      formatter: (row) => (
        <div class="production-workspace__resource-identity">
          <span aria-hidden="true">{row.kind === '工厂' ? '厂' : '组'}</span>
          <span>
            <strong title={row.name}>{row.name}</strong>
            <small title={row.code}>
              {isAllTenants.value ? `${tenantName(row.tenantId)} · ${row.code}` : row.code}
            </small>
          </span>
        </div>
      )
    },
    { prop: 'kind', label: '组织类型', width: 110 },
    {
      prop: 'parentId',
      label: '上级组织',
      minWidth: 150,
      formatter: (row) => scope.departments.find((item) => item.id === row.parentId)?.name || '—'
    },
    {
      prop: 'factory',
      label: '所属工厂',
      minWidth: 150,
      formatter: (row) => row.factory || '待完善'
    },
    {
      prop: 'enabled',
      label: '状态',
      width: 90,
      formatter: (row) => (
        <ElTag type={row.enabled ? 'success' : 'info'}>{row.enabled ? '启用' : '禁用'}</ElTag>
      )
    },
    {
      prop: 'operation',
      label: '操作',
      width: 164,
      fixed: 'right',
      formatter: (row) => (
        <BusinessTableRowActions>
          <ArtButtonTable
            type="view"
            permission={props.departmentPermissions.view}
            onClick={() => viewDepartmentRow(row)}
          />
          <ArtButtonTable
            type="edit"
            permission={props.departmentPermissions.edit}
            onClick={() => openDepartment(row)}
          />
          <ArtButtonMore
            list={departmentMoreActions(row)}
            onClick={(item) => handleDepartmentMore(item.key, row)}
          />
        </BusinessTableRowActions>
      )
    }
  ]
  async function removePerson(row: ProductionPerson) {
    try {
      await confirmAction(`确认删除“${row.name}”的生产人员配置？`, '删除人员', {
        type: 'warning'
      })
      await deleteProductionPeople([row.id])
      await refreshPeople()
    } catch {
      /* Cancellation or API-owned notification. */
    }
  }
  async function togglePerson(row: ProductionPerson) {
    try {
      await setProductionPeopleEnabled([row.id], !row.enabled)
      await refreshPeople()
    } catch {
      /* API owns failure feedback. */
    }
  }
  const columnsFactory = (): ColumnOption<ProductionPerson>[] => [
    { type: 'selection', width: 48 },
    {
      prop: 'name',
      label: '姓名',
      minWidth: 170,
      fixed: 'left',
      link: { permission: 'MdmProductionPersonnel:View', onClick: viewPerson },
      formatter: (row) => (
        <div class="production-workspace__identity">
          <ElAvatar size={32} src={row.avatarUrl}>
            <span class="production-workspace__avatar-initial">
              {row.name.trim().slice(0, 1) || '人'}
            </span>
          </ElAvatar>
          <span>
            <strong title={row.name}>{row.name}</strong>
            <small title={row.employeeNo}>
              {isAllTenants.value
                ? `${tenantName(row.tenantId)} · ${row.employeeNo || '工号待完善'}`
                : row.employeeNo || '工号待完善'}
            </small>
          </span>
        </div>
      )
    },
    {
      prop: 'department',
      label: '部门',
      minWidth: 130,
      formatter: (row) => row.department?.name || '—'
    },
    { prop: 'barcode', label: '条码', minWidth: 130 },
    { prop: 'phone', label: '手机号', minWidth: 135 },
    {
      prop: 'workType',
      label: '工作类型',
      minWidth: 100,
      dict: { code: 'mdmProductionWorkType', display: 'auto' }
    },
    { prop: 'jobTitle', label: '职位', minWidth: 120 },
    {
      prop: 'permissionDepartmentIds',
      label: '权限部门',
      minWidth: 180,
      formatter: (row) =>
        row.permissionDepartmentIds
          .map((id) => scope.departments.find((d) => d.id === id)?.name)
          .filter(Boolean)
          .join('、') || '—'
    },
    {
      prop: 'enabled',
      label: '状态',
      width: 95,
      formatter: (row) => (
        <ElTag type={row.enabled ? 'success' : 'info'}>{row.enabled ? '启用' : '禁用'}</ElTag>
      )
    },
    {
      prop: 'operation',
      label: '操作',
      width: 164,
      fixed: 'right',
      formatter: (row) => (
        <BusinessTableRowActions>
          <ArtButtonTable
            type="view"
            permission="MdmProductionPersonnel:View"
            onClick={() => viewPerson(row)}
          />
          <ArtButtonTable
            type="edit"
            permission="MdmProductionPersonnel:Edit"
            onClick={() => openPerson(row)}
          />
          <ArtButtonMore
            list={[
              {
                key: 'toggle',
                label: row.enabled ? '禁用' : '启用',
                icon: row.enabled ? 'ri:forbid-line' : 'ri:checkbox-circle-line',
                auth: row.enabled
                  ? 'MdmProductionPersonnel:Disable'
                  : 'MdmProductionPersonnel:Enable'
              },
              {
                key: 'delete',
                label: '删除',
                icon: 'ri:delete-bin-6-line',
                color: 'var(--el-color-danger)',
                auth: 'MdmProductionPersonnel:Delete'
              }
            ]}
            onClick={(item) =>
              item.key === 'toggle' ? void togglePerson(row) : void removePerson(row)
            }
          />
        </BusinessTableRowActions>
      )
    }
  ]
  const headerActions: ArtTableQueryHeaderAction[] = [
    {
      type: 'add',
      label: '新增人员',
      permission: 'MdmProductionPersonnel:Add',
      disabled: () => !scope.departments.length,
      onClick: () => openPerson()
    },
    {
      type: 'import',
      label: '导入',
      permission: 'MdmProductionPersonnel:Import',
      onImportSuccess: importPeople,
      onImportError: importError
    },
    {
      type: 'export',
      label: '导出',
      permission: 'MdmProductionPersonnel:Export',
      onClick: exportPersonList
    }
  ]
  const departmentHeaderActions: ArtTableQueryHeaderAction[] = [
    {
      type: 'add',
      label: '新增部门',
      permission: 'MdmProductionDepartment:Add',
      onClick: () => openDepartment()
    },
    {
      type: 'import',
      label: '导入',
      permission: 'MdmProductionDepartment:Import',
      onImportSuccess: importDepartments,
      onImportError: importError
    },
    {
      type: 'export',
      label: '导出',
      permission: 'MdmProductionDepartment:Export',
      disabled: () => !scope.departments.length,
      onClick: exportDepartmentList
    }
  ]
  const selectionActions: ArtTableQueryHeaderAction[] = [
    {
      type: 'delete',
      permission: 'MdmProductionPersonnel:Delete',
      onClick: async (ctx) => {
        await deleteProductionPeople(ctx.selectedRows.map((row) => String(row.id)))
        await refreshPeople()
      }
    },
    {
      key: 'enable',
      label: '启用',
      permission: 'MdmProductionPersonnel:Enable',
      selectionRequired: true,
      onClick: async (ctx) => {
        await setProductionPeopleEnabled(
          ctx.selectedRows.map((row) => String(row.id)),
          true
        )
        await refreshPeople()
      }
    },
    {
      key: 'disable',
      label: '禁用',
      permission: 'MdmProductionPersonnel:Disable',
      selectionRequired: true,
      confirm: true,
      onClick: async (ctx) => {
        await setProductionPeopleEnabled(
          ctx.selectedRows.map((row) => String(row.id)),
          false
        )
        await refreshPeople()
      }
    }
  ]
  function importError() {
    ElMessage.error('文件解析失败，请使用标准 Excel 文件重试。')
  }
  function importTenantId(): string {
    return resolveTenantWriteTargetId({
      explicitTenantId: effectiveTenantId.value || selectedDepartment.value?.tenantId,
      actorTenantId: user.info.tenantId,
      isPlatformSuper: user.isPlatformSuper
    })
  }
  async function importDepartments(rows: Record<string, unknown>[]) {
    let payload
    try {
      const tenantId = importTenantId()
      payload = parseDepartmentImport(
        rows,
        scope.departments.filter((department) => department.tenantId === tenantId),
        tenantId
      )
    } catch (error) {
      ElMessage.error(getFriendlySupabaseErrorMessage(error, '导入数据无效'))
      return
    }
    table.importing = true
    try {
      await importProductionDepartments(payload)
      await loadDepartments()
    } catch {
      /* API owns failure feedback. */
    } finally {
      table.importing = false
    }
  }
  async function importPeople(rows: Record<string, unknown>[]) {
    let payload
    try {
      const tenantId = importTenantId()
      payload = parsePeopleImport(
        rows,
        scope.departments.filter((department) => department.tenantId === tenantId),
        scope.selected,
        tenantId
      )
    } catch (error) {
      ElMessage.error(getFriendlySupabaseErrorMessage(error, '导入数据无效'))
      return
    }
    try {
      await importProductionPeople(payload)
      await refreshPeople()
    } catch {
      /* API owns failure feedback. */
    }
  }
  async function exportDepartmentList() {
    try {
      await exportDepartments(scope.departments, isAllTenants.value ? tenantNames.value : undefined)
    } catch {
      ElMessage.error('部门导出失败，请重试。')
    }
  }
  async function exportPersonList() {
    if (!canViewPeople.value) return
    try {
      const people: ProductionPerson[] = []
      for (let current = 1; current <= 10; current++) {
        const response = await fetchProductionPeople({
          ...table.search,
          tenantId: effectiveTenantId.value,
          departmentIds: departmentIds(),
          current,
          size: 1000
        })
        if (response.total > 10000) {
          ElMessage.warning('导出最多 10000 条，请缩小筛选范围。')
          return
        }
        people.push(...response.data)
        if (people.length >= response.total) break
      }
      if (!people.length) {
        ElMessage.info('当前筛选范围没有可导出的人员。')
        return
      }
      if (canViewPeople.value)
        await exportPeople(
          people,
          scope.departments,
          isAllTenants.value ? tenantNames.value : undefined
        )
    } catch {
      ElMessage.error('人员导出失败，请重试。')
    }
  }
  watch(
    effectiveTenantId,
    () => {
      scope.departments = []
      scope.selected = ''
      void loadDepartments()
    },
    { immediate: true }
  )
</script>

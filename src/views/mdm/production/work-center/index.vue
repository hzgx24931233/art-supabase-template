<template>
  <div class="production-workspace business-workspace-page art-full-height">
    <ProductionWorkspaceHeader
      title="工作中心"
      description="以设备、产线或岗位组织生产资源，统一人员安排、报工规则与执行控制。"
      icon="ri:dashboard-3-line"
      capability="生产资源配置"
      :metrics="workspaceMetrics"
      density="compact"
      ><template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template
    ></ProductionWorkspaceHeader>
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
        <ArtTableQuery
          ref="tableRef"
          v-model="table.search"
          :api-fn="fetchRows"
          :search-items="searchItems"
          :columns-factory="columns"
          :header-actions="headerActions"
          header-actions-placement="workspace"
          :selection-actions="selectionActions"
          :on-success="onSuccess"
          :enable-cache="false"
          focusable
          focus-scope-selector=".production-workspace__body"
          :table-props="{
            rowKey: 'id',
            tableLayout: 'fixed',
            emptyText: '暂无工作中心',
            emptyDescription: '在当前部门下新增工作中心，配置生产资源与作业规则。'
          }"
          :search-bar-props="{ span: 8, labelWidth: 82, showExpand: false }"
        />
      </ArtWorkspaceSplitter>
    </div>
    <CenterDialog ref="centerDialog" @success="refresh" /><PersonnelDialog
      ref="personnelDialog"
      @success="refresh"
    /><DevicesDialog ref="devicesDialog" /><DefaultsDialog ref="defaultsDialog" /><QrDialog
      ref="qrDialog"
    />
  </div>
</template>
<script setup lang="tsx">
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  const { confirmAction } = useArtFeedback()
  import { ref, reactive, computed, watch } from 'vue'
  import { storeToRefs } from 'pinia'
  import { ElButton, ElMessage } from 'element-plus'
  import { uniq } from 'lodash-es'
  import type { ColumnOption } from '@/types'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction,
    ArtTableQueryProps
  } from '@/components/core/tables/art-table-query/index.vue'
  import type { BusinessWorkspaceMetric } from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtButtonMore from '@/components/core/forms/art-button-more/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import { resolveTenantWriteTargetId } from '@/utils/tenant-scope-context'
  import { useAuth } from '@/hooks/core/useAuth'
  import { exportExcel } from '@/utils/file'
  import {
    fetchProductionDepartments,
    fetchWorkCenters,
    fetchCenterPeople,
    deleteWorkCenters,
    importWorkCenters,
    fetchCenterImportReferences,
    fetchCenterDefaults,
    updateCenterProcesses,
    type ProductionDepartment,
    type WorkCenter,
    type WorkspaceQuery
  } from '@/api/mdm'
  import { productionTree } from '../modules/production-model'
  import { createCenterPolicy } from './modules/center-policy'
  import {
    centerPolicyColumns,
    parseCenterImport,
    splitStaffNumbers
  } from './modules/center-transfer'
  import ProductionTree from '../modules/production-tree.vue'
  import ProductionWorkspaceHeader from '../modules/production-workspace-header.vue'
  import CenterDialog from './modules/center-dialog.vue'
  import PersonnelDialog from './modules/personnel-dialog.vue'
  import DevicesDialog from './modules/devices-dialog.vue'
  import DefaultsDialog from './modules/defaults-dialog.vue'
  import QrDialog from './modules/qr-dialog.vue'
  defineOptions({ name: 'MdmWorkCenter' })
  const user = useUserStore()
  const tenantScopeStore = useTenantScopeStore()
  const { effectiveTenantId, isAllTenants, tenantOptions } = storeToRefs(tenantScopeStore)
  const tenantNames = computed(() =>
    Object.fromEntries(tenantOptions.value.map((tenant) => [tenant.id, tenant.tenantName]))
  )
  const { hasAuth } = useAuth()
  const tableRef = ref<ArtTableQueryExpose>()
  const centerDialog = ref<InstanceType<typeof CenterDialog>>()
  const personnelDialog = ref<InstanceType<typeof PersonnelDialog>>()
  const devicesDialog = ref<InstanceType<typeof DevicesDialog>>()
  const defaultsDialog = ref<InstanceType<typeof DefaultsDialog>>()
  const qrDialog = ref<InstanceType<typeof QrDialog>>()
  const scope = reactive({
    departments: [] as ProductionDepartment[],
    selected: '',
    loading: false,
    error: ''
  })
  const table = reactive({
    search: { keyword: '' },
    people: {} as Record<string, string>,
    rows: [] as WorkCenter[],
    total: 0
  })
  const selectedDepartment = computed(() => scope.departments.find((d) => d.id === scope.selected))
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '工作中心',
      value: table.total,
      description: selectedDepartment.value
        ? `属于“${selectedDepartment.value.name}”及下级`
        : '当前查询范围内的生产资源',
      icon: 'ri:dashboard-3-line'
    },
    {
      label: '生产部门',
      value: scope.departments.length,
      description: isAllTenants.value ? '全部租户组织层级' : '当前租户组织层级',
      icon: 'ri:node-tree',
      loading: scope.loading
    },
    {
      label: '已安排人员',
      value: uniq(table.rows.flatMap((row) => row.personIds)).length,
      description: '当前页工作中心直接关联',
      icon: 'ri:team-line',
      tone: 'success'
    }
  ])
  const departmentIds = () =>
    scope.selected
      ? productionTree
          .getDescendants(productionTree.listToTree(scope.departments), scope.selected, true)
          .map((d) => d.id)
      : undefined
  const searchItems: SearchFormItem[] = [
    {
      key: 'keyword',
      label: '工作中心',
      type: 'input',
      props: { placeholder: '编号 / 名称', clearable: true }
    }
  ]
  const refresh = () => tableRef.value?.refreshData()
  let loadVersion = 0
  async function loadDepartments() {
    const version = ++loadVersion
    scope.loading = true
    scope.error = ''
    try {
      await tenantScopeStore.loadTenantOptions()
      const rows = await fetchProductionDepartments(effectiveTenantId.value)
      if (version !== loadVersion) return
      scope.departments = rows
      await refresh()
    } catch {
      if (version === loadVersion) scope.error = '部门加载失败，请重试'
    } finally {
      if (version === loadVersion) scope.loading = false
    }
  }
  async function selectDepartment(id: string) {
    scope.selected = id
    await tableRef.value?.getData()
  }
  const fetchRows = (p: WorkspaceQuery, o?: { signal?: AbortSignal }) =>
    fetchWorkCenters(
      { ...p, tenantId: effectiveTenantId.value || '', departmentIds: departmentIds() },
      o
    )
  const onSuccess: ArtTableQueryProps['onSuccess'] = async (rows, response) => {
    table.rows = rows as WorkCenter[]
    table.total = Number(response.total ?? rows.length)
    const ids = uniq(
      rows.flatMap((row) =>
        Array.isArray(row.personIds)
          ? row.personIds.filter((id): id is string => typeof id === 'string')
          : []
      )
    )
    try {
      const people = await fetchCenterPeople(ids)
      table.people = Object.fromEntries(
        people.map((p) => [p.id, `${p.employeeName} · ${p.employeeNo}`])
      )
    } catch {
      ElMessage.warning('人员姓名加载失败，可打开人员安排重试')
    }
  }
  const open = (mode: 'add' | 'edit' | 'copy' | 'view', row?: WorkCenter) =>
    void centerDialog.value?.handleOpen({
      mode,
      row,
      departments: scope.departments,
      departmentId: scope.selected
    })
  async function remove(row: WorkCenter) {
    try {
      await confirmAction(`确认删除“${row.name}”？设备和临时人员配置将一并移除。`, '删除工作中心', {
        type: 'warning'
      })
      await deleteWorkCenters([row.id])
      await refresh()
      return true
    } catch {
      /* API owns feedback. */
      return false
    }
  }
  async function updateProcesses(row: WorkCenter) {
    try {
      await confirmAction(`将“${row.name}”的当前规则更新至所有关联工艺工序？`, '更新产品工艺', {
        type: 'warning'
      })
      const count = await updateCenterProcesses(row.id)
      ElMessage.success(count ? `已更新 ${count} 个工艺工序` : '当前没有关联的工艺工序')
    } catch {
      /* API owns feedback. */
    }
  }
  const staff = (r: WorkCenter) =>
    r.personnelMode === '指定人数'
      ? `指定人数 ${r.headcount} 人`
      : r.personIds.map((id) => table.people[id] || '人员信息加载中').join('、')
  const columns = (): ColumnOption<WorkCenter>[] => [
    { type: 'selection', width: 48 },
    {
      prop: 'code',
      label: '工作中心',
      minWidth: 220,
      fixed: 'left',
      formatter: (r) => (
        <div class="production-workspace__resource-identity">
          <span aria-hidden="true">
            <ArtSvgIcon icon="ri:dashboard-3-line" />
          </span>
          <span>
            <ElButton
              link
              type="primary"
              disabled={!hasAuth('MdmWorkCenter:View')}
              onClick={() => open('view', r)}
            >
              {r.name}
            </ElButton>
            <small title={r.code}>
              {isAllTenants.value
                ? `${tenantNames.value[r.tenantId] || r.tenantId} · ${r.code}`
                : r.code}
            </small>
          </span>
        </div>
      )
    },
    {
      prop: 'department',
      label: '所属产线',
      minWidth: 150,
      formatter: (r) => r.department?.name || '—'
    },
    {
      prop: 'mainCenter',
      label: '主工序位',
      minWidth: 140,
      formatter: (r) => r.mainCenter?.code || r.code
    },
    {
      prop: 'personnelMode',
      label: '人员安排',
      minWidth: 210,
      formatter: (r) => (
        <div class="production-workspace__stack">
          <strong title={staff(r)}>{staff(r)}</strong>
          {r.personnelMode === '指定人员' && hasAuth('MdmWorkCenter:Personnel') && (
            <ElButton link type="primary" onClick={() => void personnelDialog.value?.handleOpen(r)}>
              临时调整
            </ElButton>
          )}
        </div>
      )
    },
    {
      prop: 'dailyCapacityMinutes',
      label: '标准产能',
      minWidth: 190,
      formatter: (r) => (
        <div class="production-workspace__stack">
          <strong>{r.capacityMode === 'finite' ? '有限产能' : '无限产能'}</strong>
          <small>
            {r.dailyCapacityMinutes} 分钟/日 · {r.parallelCapacity} 台并行
          </small>
        </div>
      )
    },
    {
      prop: 'operation',
      label: '操作',
      width: 164,
      fixed: 'right',
      formatter: (r) => (
        <BusinessTableRowActions>
          <ArtButtonTable
            type="view"
            permission="MdmWorkCenter:View"
            onClick={() => open('view', r)}
          />
          <ArtButtonTable
            type="edit"
            permission="MdmWorkCenter:Edit"
            onClick={() => open('edit', r)}
          />
          <ArtButtonMore
            list={[
              {
                key: 'copy',
                label: '复制',
                icon: 'ri:file-copy-line',
                auth: 'MdmWorkCenter:Copy'
              },
              {
                key: 'delete',
                label: '删除',
                icon: 'ri:delete-bin-6-line',
                color: 'var(--el-color-danger)',
                auth: 'MdmWorkCenter:Delete'
              },
              {
                key: 'devices',
                label: '设备列表',
                icon: 'ri:server-line',
                auth: 'MdmWorkCenter:Devices'
              },
              {
                key: 'update',
                label: '更新产品工艺',
                icon: 'ri:refresh-line',
                auth: 'MdmWorkCenter:UpdateProcess'
              }
            ]}
            onClick={(item) => {
              if (item.key === 'copy') open('copy', r)
              else if (item.key === 'delete') void remove(r)
              else if (item.key === 'devices') void devicesDialog.value?.handleOpen(r)
              else void updateProcesses(r)
            }}
          />
        </BusinessTableRowActions>
      )
    }
  ]
  async function allRows(limit = 10000) {
    const rows: WorkCenter[] = []
    for (let current = 1; current <= Math.ceil(limit / 1000); current++) {
      const result = await fetchRows({ ...table.search, tenantId: '', current, size: 1000 })
      if (result.total > limit) throw new Error(`最多导出 ${limit} 条，请缩小部门范围`)
      rows.push(...result.data)
      if (rows.length >= result.total) break
    }
    return rows
  }
  async function exportRows() {
    try {
      const rows = await allRows()
      const people = await fetchCenterPeople(uniq(rows.flatMap((r) => r.personIds)))
      await exportExcel({
        data: rows.map((r) => ({
          tenantName: tenantNames.value[r.tenantId] || r.tenantId,
          code: r.code,
          name: r.name,
          department: r.department?.code,
          main: r.mainCenter?.code || r.code,
          mode: r.personnelMode,
          people: r.personIds
            .map((id) => people.find((p) => p.id === id)?.employeeNo || '')
            .join('；'),
          headcount: r.headcount,
          sort: r.sort,
          remark: r.remark,
          ...Object.fromEntries(
            centerPolicyColumns.map(({ key }) => [
              key,
              Array.isArray(r.policy[key]) ? r.policy[key].join('；') : r.policy[key]
            ])
          )
        })),
        columns: [
          ...(isAllTenants.value ? [{ key: 'tenantName', title: '所属租户' }] : []),
          ...Object.entries({
            code: '工作中心',
            name: '名称',
            department: '所属产线编码',
            main: '主工序位',
            mode: '人员安排',
            people: '人员工号',
            headcount: '人数',
            sort: '排序',
            remark: '备注'
          }).map(([key, title]) => ({ key, title })),
          ...centerPolicyColumns
        ],
        filename: '工作中心'
      })
    } catch {
      ElMessage.error('导出失败，请确认有数据且筛选范围不超过 10000 条')
    }
  }
  async function exportQr() {
    try {
      const rows = await allRows(500)
      if (!rows.length) {
        ElMessage.info('当前范围没有工作中心')
        return
      }
      await qrDialog.value?.handleOpen(rows)
    } catch {
      ElMessage.error('二维码加载失败，请重试或将范围缩小至 500 个以内')
    }
  }
  async function importRows(rows: Record<string, unknown>[]) {
    try {
      if (!rows.length || rows.length > 1000) {
        ElMessage.warning('每次可导入 1 至 1000 行')
        return
      }
      const targetTenantId = resolveTenantWriteTargetId({
        explicitTenantId: effectiveTenantId.value || selectedDepartment.value?.tenantId,
        actorTenantId: user.info.tenantId,
        isPlatformSuper: user.isPlatformSuper
      })
      const [references, defaults] = await Promise.all([
        fetchCenterImportReferences(
          uniq(rows.map((r) => String(r['主工序位'] || '').trim()).filter(Boolean)),
          uniq(rows.flatMap((r) => splitStaffNumbers(r['人员工号']))),
          targetTenantId
        ),
        fetchCenterDefaults(targetTenantId)
      ])
      const inputs = parseCenterImport(
        rows,
        {
          ...references,
          departments: scope.departments.filter(
            (department) => department.tenantId === targetTenantId
          ),
          defaults: defaults || createCenterPolicy()
        },
        targetTenantId
      )
      await importWorkCenters(inputs)
      await refresh()
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('第 ')) ElMessage.error(error.message)
      else if (error instanceof Error && error.message === '请先选择目标租户')
        ElMessage.warning(error.message)
      else ElMessage.error('导入失败，请检查表头、编码唯一性和产线归属')
    }
  }
  const headerActions: ArtTableQueryHeaderAction[] = [
    {
      type: 'add',
      label: '新增工作中心',
      permission: 'MdmWorkCenter:Add',
      onClick: () => open('add')
    },
    { type: 'import', permission: 'MdmWorkCenter:Import', onImportSuccess: importRows },
    { type: 'export', permission: 'MdmWorkCenter:Export', onClick: exportRows },
    { key: 'qr', label: '导出二维码', permission: 'MdmWorkCenter:ExportQr', onClick: exportQr },
    {
      key: 'settings',
      label: '设置',
      permission: 'MdmWorkCenter:Configure',
      onClick: () => {
        try {
          const targetTenantId = resolveTenantWriteTargetId({
            explicitTenantId: effectiveTenantId.value || selectedDepartment.value?.tenantId,
            actorTenantId: user.info.tenantId,
            isPlatformSuper: user.isPlatformSuper
          })
          void defaultsDialog.value?.handleOpen(targetTenantId)
        } catch {
          ElMessage.warning('请先选择目标租户或左侧部门后再配置默认值')
        }
      }
    }
  ]
  const selectionActions: ArtTableQueryHeaderAction[] = [
    {
      type: 'delete',
      permission: 'MdmWorkCenter:Delete',
      onClick: async (c) => {
        await deleteWorkCenters(c.selectedRows.map((r) => String(r.id)))
        await refresh()
      }
    }
  ]
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

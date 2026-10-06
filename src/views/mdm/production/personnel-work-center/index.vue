<template>
  <ArtPermissionGuard permission="MdmPersonnelWorkCenter:View" resource-name="人员/工作中心配置">
    <div class="production-workspace personnel-work-center business-workspace-page art-full-height">
      <ProductionWorkspaceHeader
        title="人员/工作中心配置"
        description="为现场作业员维护常用工作中心清单，减少查找路径，让高频作业入口更快抵达。"
        icon="ri:user-settings-line"
        capability="现场作业偏好"
        :metrics="workspaceMetrics"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
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
              emptyText: '暂无匹配人员',
              emptyDescription: '请调整员工关键词或左侧部门 / 产线范围。'
            }"
            :search-bar-props="{ span: 8, labelWidth: 72, showExpand: false }"
          />
        </ArtWorkspaceSplitter>
      </div>

      <ConfigurationDialog ref="configurationDialog" @success="refresh" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { computed, reactive, ref, watch } from 'vue'
  import { storeToRefs } from 'pinia'
  import { ElAvatar, ElButton, ElMessage, ElTag } from 'element-plus'
  import ArtTooltip from '@/components/core/feedback/art-tooltip/index.vue'
  import type { ColumnOption } from '@/types'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction,
    ArtTableQueryHeaderActionContext,
    ArtTableQueryProps
  } from '@/components/core/tables/art-table-query/index.vue'
  import type { BusinessWorkspaceMetric } from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { exportExcel } from '@/utils/file'
  import {
    deletePersonnelCommonWorkCenters,
    fetchPersonnelWorkCenterConfigs,
    fetchProductionDepartments,
    savePersonnelCommonWorkCenters,
    type CommonWorkCenter,
    type PersonnelWorkCenterConfig,
    type PersonnelWorkCenterQuery,
    type ProductionDepartment
  } from '@/api/mdm'
  import ProductionTree from '../modules/production-tree.vue'
  import ProductionWorkspaceHeader from '../modules/production-workspace-header.vue'
  import { productionTree } from '../modules/production-model'
  import ConfigurationDialog from './modules/configuration-dialog.vue'

  defineOptions({ name: 'MdmPersonnelWorkCenter' })

  const tenantScopeStore = useTenantScopeStore()
  const { effectiveTenantId, isAllTenants, tenantOptions } = storeToRefs(tenantScopeStore)
  const tenantNames = computed(() =>
    Object.fromEntries(tenantOptions.value.map((tenant) => [tenant.id, tenant.tenantName]))
  )
  const { hasAuth } = useAuth()
  const { confirmAction } = useArtFeedback()
  const tableRef = ref<ArtTableQueryExpose>()
  const configurationDialog = ref<InstanceType<typeof ConfigurationDialog>>()
  const inlineSavingId = ref('')
  const scope = reactive({
    departments: [] as ProductionDepartment[],
    selected: '',
    loading: false,
    error: ''
  })
  const table = reactive({
    search: { keyword: '' },
    rows: [] as PersonnelWorkCenterConfig[],
    total: 0
  })
  const departmentTree = computed(() => productionTree.listToTree(scope.departments))
  const selectedDepartment = computed(() =>
    scope.departments.find((department) => department.id === scope.selected)
  )
  const selectedScopeLabel = computed(() =>
    selectedDepartment.value ? `${selectedDepartment.value.name}及下级` : '全部部门与产线'
  )
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '人员',
      value: table.total,
      description: selectedDepartment.value
        ? `属于“${selectedDepartment.value.name}”及下级`
        : '当前查询范围内的启用人员',
      icon: 'ri:team-line'
    },
    {
      label: '已配置',
      value: table.rows.filter((row) => row.commonWorkCenters.length > 0).length,
      description: '当前页已有常用项的人员',
      icon: 'ri:checkbox-circle-line',
      tone: 'success'
    },
    {
      label: '常用项',
      value: table.rows.reduce((total, row) => total + row.commonWorkCenters.length, 0),
      description: '当前页人员与工作中心关系',
      icon: 'ri:dashboard-3-line'
    }
  ])
  const searchItems: SearchFormItem[] = [
    {
      key: 'keyword',
      label: '员工',
      type: 'input',
      props: { placeholder: '姓名 / 工号 / 手机号', clearable: true }
    }
  ]

  function departmentIds(): string[] | undefined {
    if (!scope.selected) return undefined
    return productionTree
      .getDescendants(departmentTree.value, scope.selected, true)
      .map((department) => String(department.id))
  }

  function departmentPath(departmentId: string): string {
    const path = productionTree
      .getAncestors(departmentTree.value, departmentId)
      .map((department) => String(department.name))
    return path.join(' / ') || '未分配部门'
  }

  const fetchRows = (params: PersonnelWorkCenterQuery, options?: { signal?: AbortSignal }) =>
    fetchPersonnelWorkCenterConfigs(
      {
        ...params,
        tenantId: effectiveTenantId.value || '',
        departmentIds: departmentIds()
      },
      options
    )

  const onSuccess: ArtTableQueryProps['onSuccess'] = (rows, response) => {
    table.rows = rows as PersonnelWorkCenterConfig[]
    table.total = Number(response.total ?? rows.length)
  }

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
      if (version === loadVersion) scope.error = '部门与产线加载失败，请重试'
    } finally {
      if (version === loadVersion) scope.loading = false
    }
  }

  async function selectDepartment(id: string) {
    scope.selected = id
    await tableRef.value?.getData()
  }

  function openConfiguration(mode: 'add' | 'edit', row?: PersonnelWorkCenterConfig) {
    void configurationDialog.value?.handleOpen({
      mode,
      row,
      departmentId: row?.departmentId || scope.selected,
      departments: scope.departments,
      departmentIds: departmentIds(),
      scopeLabel: selectedScopeLabel.value
    })
  }

  async function removeConfiguration(row: PersonnelWorkCenterConfig) {
    if (!row.commonWorkCenters.length) {
      ElMessage.info('该员工尚未配置常用工作中心')
      return
    }
    try {
      await confirmAction(
        `确认清空“${row.name}”的 ${row.commonWorkCenters.length} 个常用工作中心？`,
        '删除常用配置',
        { type: 'warning' }
      )
      await deletePersonnelCommonWorkCenters([row.id])
      await refresh()
    } catch {
      /* API owns failure feedback. */
    }
  }

  async function removeCenter(row: PersonnelWorkCenterConfig, center: CommonWorkCenter) {
    if (inlineSavingId.value) return
    inlineSavingId.value = row.id
    try {
      await savePersonnelCommonWorkCenters({
        personnelId: row.id,
        departmentId: row.departmentId,
        workCenterIds: row.commonWorkCenters
          .filter((item) => item.id !== center.id)
          .map((item) => item.id)
      })
      await refresh()
    } catch {
      /* API owns failure feedback. */
    } finally {
      inlineSavingId.value = ''
    }
  }

  const visibleCenters = (row: PersonnelWorkCenterConfig) => row.commonWorkCenters.slice(0, 4)

  const columns = (): ColumnOption<PersonnelWorkCenterConfig>[] => [
    { type: 'selection', width: 40 },
    {
      prop: 'departmentId',
      label: '部门 / 产线',
      minWidth: 140,
      formatter: (row) => (
        <div class="personnel-work-center__department" title={departmentPath(row.departmentId)}>
          <span aria-hidden="true">
            <ArtSvgIcon icon="ri:node-tree" />
          </span>
          <span>
            <strong>{row.department.name}</strong>
            <small>{departmentPath(row.departmentId)}</small>
          </span>
        </div>
      )
    },
    {
      prop: 'name',
      label: '员工',
      minWidth: 140,
      formatter: (row) => (
        <div class="personnel-work-center__employee">
          <ElAvatar size={34} src={row.avatarUrl || undefined}>
            <span class="production-workspace__avatar-initial">
              {row.name.trim().slice(0, 1) || '人'}
            </span>
          </ElAvatar>
          <span>
            <strong>{row.name}</strong>
            <small>
              {isAllTenants.value
                ? `${tenantNames.value[row.tenantId] || row.tenantId} · ${row.jobTitle || '现场作业员'}`
                : row.jobTitle || '现场作业员'}
            </small>
          </span>
        </div>
      )
    },
    { prop: 'employeeNo', label: '工号', minWidth: 90 },
    {
      prop: 'phone',
      label: '手机号',
      minWidth: 115,
      formatter: (row) => <span class="personnel-work-center__phone">{row.phone || '—'}</span>
    },
    {
      prop: 'commonWorkCenters',
      label: '常用工作中心',
      width: 210,
      fixed: 'right',
      formatter: (row) => (
        <div class="personnel-work-center__centers">
          <div class="personnel-work-center__center-list">
            {visibleCenters(row).map((center) => (
              <ArtTooltip
                key={center.id}
                content={`${center.code} · ${center.name} · ${center.departmentName}`}
                placement="top"
              >
                <ElTag
                  closable={hasAuth('MdmPersonnelWorkCenter:Edit')}
                  disableTransitions
                  onClose={(event: MouseEvent) => {
                    event.stopPropagation()
                    void removeCenter(row, center)
                  }}
                >
                  {center.code} · {center.name}
                </ElTag>
              </ArtTooltip>
            ))}
            {row.commonWorkCenters.length > 4 ? (
              <ElButton link type="primary" onClick={() => openConfiguration('edit', row)}>
                +{row.commonWorkCenters.length - 4} 项
              </ElButton>
            ) : null}
            {!row.commonWorkCenters.length ? (
              <span class="personnel-work-center__empty">未配置</span>
            ) : null}
          </div>
        </div>
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
            type="add"
            permission={
              row.commonWorkCenters.length
                ? 'MdmPersonnelWorkCenter:Edit'
                : 'MdmPersonnelWorkCenter:Add'
            }
            label="配置常用工作中心"
            onClick={() => openConfiguration(row.commonWorkCenters.length ? 'edit' : 'add', row)}
          />
          <ArtButtonTable
            type="edit"
            permission="MdmPersonnelWorkCenter:Edit"
            disabled={!row.commonWorkCenters.length}
            label="编辑常用工作中心"
            onClick={() => openConfiguration('edit', row)}
          />
          <ArtButtonTable
            type="delete"
            permission="MdmPersonnelWorkCenter:Delete"
            disabled={!row.commonWorkCenters.length}
            label="删除常用工作中心配置"
            onClick={() => void removeConfiguration(row)}
          />
        </BusinessTableRowActions>
      )
    }
  ]

  async function allRows(limit = 10000) {
    const rows: PersonnelWorkCenterConfig[] = []
    for (let current = 1; current <= Math.ceil(limit / 1000); current++) {
      const result = await fetchRows({
        tenantId: '',
        keyword: table.search.keyword,
        current,
        size: 1000
      })
      if (result.total > limit) throw new Error(`最多导出 ${limit} 条，请缩小查询范围`)
      rows.push(...result.data)
      if (rows.length >= result.total) break
    }
    return rows
  }

  async function exportRows() {
    try {
      const rows = await allRows()
      if (!rows.length) {
        ElMessage.info('当前筛选范围没有可导出的人员')
        return
      }
      await exportExcel({
        data: rows.map((row) => ({
          department: departmentPath(row.departmentId),
          employee: row.name,
          employeeNo: row.employeeNo,
          phone: row.phone,
          commonWorkCenters: row.commonWorkCenters
            .map((center) => `${center.code} · ${center.name}`)
            .join('；')
        })),
        columns: [
          { key: 'department', title: '部门/产线' },
          { key: 'employee', title: '员工' },
          { key: 'employeeNo', title: '工号' },
          { key: 'phone', title: '手机号' },
          { key: 'commonWorkCenters', title: '常用工作中心' }
        ],
        filename: '人员工作中心配置'
      })
    } catch {
      ElMessage.error('导出失败，请缩小查询范围后重试')
    }
  }

  const headerActions: ArtTableQueryHeaderAction[] = [
    {
      type: 'add',
      label: '新增配置',
      permission: 'MdmPersonnelWorkCenter:Add',
      onClick: () => openConfiguration('add')
    },
    {
      type: 'export',
      permission: 'MdmPersonnelWorkCenter:Export',
      onClick: exportRows
    }
  ]
  const selectionActions: ArtTableQueryHeaderAction[] = [
    {
      type: 'delete',
      label: '批量删除配置',
      permission: 'MdmPersonnelWorkCenter:Delete',
      content: (context: ArtTableQueryHeaderActionContext) =>
        `确认清空已选 ${context.selectedCount} 名员工的常用工作中心配置？人员档案不会被删除。`,
      onClick: async (context) => {
        await deletePersonnelCommonWorkCenters(context.selectedRows.map((row) => String(row.id)))
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

<style scoped lang="scss">
  .personnel-work-center {
    :deep(.personnel-work-center__department),
    :deep(.personnel-work-center__employee) {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr);
      gap: 10px;
      align-items: center;
      min-width: 0;

      > span:last-child,
      strong,
      small {
        display: block;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      strong {
        color: var(--el-text-color-primary);
      }

      small {
        margin-top: 2px;
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }

    :deep(.personnel-work-center__department) {
      > span:first-child {
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 9%, var(--el-bg-color));
        border-radius: var(--el-border-radius-base);
      }
    }

    :deep(.personnel-work-center__phone) {
      font-variant-numeric: tabular-nums;
      color: var(--el-text-color-regular);
    }

    :deep(.personnel-work-center__centers) {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      min-width: 0;
      padding-block: 4px;
    }

    :deep(.personnel-work-center__center-list) {
      display: flex;
      flex: 1;
      flex-wrap: wrap;
      gap: 6px;
      min-width: 0;

      .el-tag {
        max-width: 130px;

        .el-tag__content {
          overflow: hidden;
          text-overflow: ellipsis;
        }
      }

      .el-button {
        min-height: 24px;
      }
    }

    :deep(.personnel-work-center__empty) {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }
  }
</style>

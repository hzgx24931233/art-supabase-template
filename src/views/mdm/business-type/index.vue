<template>
  <ArtPermissionGuard permission="MdmBusinessType:View" resource-name="业务类型">
    <div class="business-type-page business-workspace-page art-full-height">
      <BusinessWorkspaceHeader
        density="compact"
        eyebrow="BUSINESS TYPE GOVERNANCE"
        title="业务类型"
        description="按菜单功能和单据类型统一维护业务口径、库存方向与核算属性，为入库、出库、退货等业务提供稳定可审计的类型定义。"
        icon="ri:git-branch-line"
        :tags="workspaceTags"
        :metrics="workspaceMetrics"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
      </BusinessWorkspaceHeader>

      <div class="business-type-page__workspace">
        <ArtWorkspaceSplitter :breakpoint="1200" narrow-mode="hide">
          <template #primary>
            <aside v-if="isDesktopMenuLayout" class="business-type-page__menu-panel">
              <BusinessTypeMenuFilter
                :data="menu.tree"
                :counts="overview.stats.menuCounts"
                :selected-menu-id="menu.selectedId"
                :loading="menu.loading"
                @select="handleMenuSelect"
                @refresh="refreshContext"
              />
            </aside>
          </template>

          <div class="business-type-page__table-workspace">
            <section
              v-if="!isDesktopMenuLayout"
              class="business-type-page__mobile-menu art-card-xs"
            >
              <span aria-hidden="true"><ArtSvgIcon icon="ri:node-tree" /></span>
              <div>
                <small>当前功能范围</small>
                <strong>{{ selectedMenuLabel }}</strong>
              </div>
              <ElButton type="primary" plain @click="openMenuDrawer">
                <ArtSvgIcon icon="ri:filter-3-line" />
                菜单筛选
              </ElButton>
            </section>

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
              :table-header-props="{ layout: 'refresh,size,fullscreen,columns,settings' }"
              :table-props="tableProps"
              focus-scope-selector=".business-type-page__workspace"
              focusable
            />
          </div>
        </ArtWorkspaceSplitter>
      </div>

      <BusinessTypeDialog ref="dialogRef" @success="handleSaved" />
      <BusinessTypeDetailDrawer ref="detailDrawerRef" />
      <ArtDrawer ref="menuDrawerRef">
        <BusinessTypeMenuFilter
          class="business-type-page__drawer-filter"
          :data="menu.tree"
          :counts="overview.stats.menuCounts"
          :selected-menu-id="menu.selectedId"
          :loading="menu.loading"
          @select="handleDrawerMenuSelect"
          @refresh="refreshContext"
        />
      </ArtDrawer>
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import dayjs from 'dayjs'
  import { ElTag } from 'element-plus'
  import type { CSSProperties, ComputedRef, UnwrapNestedRefs } from 'vue'
  import { useMediaQuery } from '@vueuse/core'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtWorkspaceSplitter from '@/components/core/layouts/art-workspace-splitter/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric,
    type BusinessWorkspaceTag
  } from '@/components/business/business-workspace-header/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction,
    ArtTableQueryHeaderActionContext,
    ArtTableQueryTableProps
  } from '@/components/core/tables/art-table-query/index.vue'
  import type { ColumnOption } from '@/types'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import { useUserStore } from '@/store/modules/user'
  import { formatWithDayjs } from '@/utils/time'
  import TreeUtils from '@/utils/tree'
  import {
    deleteBusinessTypes,
    exportBusinessTypes,
    fetchBusinessTypeList,
    fetchBusinessTypeMenuTree,
    fetchBusinessTypeStats,
    type BusinessTypeExportRecord,
    type BusinessTypeMenuNode,
    type BusinessTypeQuery,
    type BusinessTypeRecord,
    type BusinessTypeStats
  } from '@/api/mdm'
  import BusinessTypeDialog, {
    type BusinessTypeDialogOpenData
  } from './modules/business-type-dialog.vue'
  import BusinessTypeDetailDrawer, {
    type BusinessTypeDetailData
  } from './modules/business-type-detail-drawer.vue'
  import BusinessTypeMenuFilter from './modules/business-type-menu-filter.vue'

  defineOptions({ name: 'MdmBusinessType' })

  const declaredPermissions = [
    'MdmBusinessType:View',
    'MdmBusinessType:Add',
    'MdmBusinessType:Copy',
    'MdmBusinessType:Edit',
    'MdmBusinessType:Delete',
    'MdmBusinessType:Export'
  ] as const
  void declaredPermissions

  interface SearchModel {
    keyword: string
    enabled?: boolean
    isDefault?: boolean
  }

  interface TableGroup {
    search: SearchModel
    searchItems: ComputedRef<SearchFormItem[]>
    headerActions: ComputedRef<ArtTableQueryHeaderAction[]>
    selectionActions: ComputedRef<ArtTableQueryHeaderAction[]>
  }

  interface MenuGroup {
    tree: BusinessTypeMenuNode[]
    selectedId: string
    loading: boolean
  }

  interface OverviewGroup {
    stats: BusinessTypeStats
    metrics: ComputedRef<BusinessWorkspaceMetric[]>
  }

  type TableParams = SearchModel & Pick<BusinessTypeQuery, 'current' | 'size'>
  type ExportRow = BusinessTypeExportRecord & { menuPath: string; statusLabel: string }

  const route = useRoute()
  const tableRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<{ handleOpen: (data: BusinessTypeDialogOpenData) => Promise<void> }>()
  const detailDrawerRef = ref<{ handleOpen: (data: BusinessTypeDetailData) => Promise<void> }>()
  const menuDrawerRef = ref<ArtDrawerExpose<Record<string, never>>>()
  const isInitializing = ref(true)
  const isDesktopMenuLayout = useMediaQuery('(min-width: 1201px)')
  const treeUtils = new TreeUtils({ idKey: 'id', parentKey: 'parentId', childrenKey: 'children' })
  const userStore = useUserStore()
  const tenantScopeStore = useTenantScopeStore()
  const { getDictMap } = storeToRefs(userStore)
  const { effectiveTenantId, isAllTenants, scopeLabel, tenantOptions } =
    storeToRefs(tenantScopeStore)
  const { hasAuth, hasAnyAuth } = useAuth()
  const { confirmDelete } = useArtFeedback()
  const canManage = computed(() =>
    hasAnyAuth([
      'MdmBusinessType:Add',
      'MdmBusinessType:Copy',
      'MdmBusinessType:Edit',
      'MdmBusinessType:Delete'
    ])
  )
  const showTenantColumn = computed(() => isAllTenants.value)

  const menu: UnwrapNestedRefs<MenuGroup> = reactive<MenuGroup>({
    tree: [],
    selectedId: typeof route.query.menuId === 'string' ? route.query.menuId : '',
    loading: false
  })
  const overview: UnwrapNestedRefs<OverviewGroup> = reactive<OverviewGroup>({
    stats: {
      total: 0,
      enabled: 0,
      defaults: 0,
      menuCount: 0,
      documentTypeCount: 0,
      tenantCount: 0,
      menuCounts: {}
    },
    metrics: computed(() => [
      {
        label: '类型总数',
        value: overview.stats.total,
        description: '当前租户范围内的业务口径',
        icon: 'ri:git-branch-line',
        tone: 'primary'
      },
      {
        label: '已启用',
        value: overview.stats.enabled,
        description: '可供业务单据直接引用',
        icon: 'ri:checkbox-circle-line',
        tone: 'success'
      },
      {
        label: '默认类型',
        value: overview.stats.defaults,
        description: '已为单据类型设置默认项',
        icon: 'ri:star-line',
        tone: overview.stats.defaults ? 'warning' : 'info'
      },
      {
        label: '覆盖单据',
        value: overview.stats.documentTypeCount,
        description: '已配置业务类型的单据类型',
        icon: 'ri:file-list-3-line',
        tone: 'info'
      }
    ])
  })

  const workspaceTags = computed<BusinessWorkspaceTag[]>(() => [
    {
      label: canManage.value ? '已授权维护' : '安全只读视图',
      type: canManage.value ? 'primary' : 'info'
    },
    { label: `数据范围：${scopeLabel.value}`, type: 'success' },
    { label: `最近更新：${formatWithDayjs(overview.stats.lastUpdateTime) || '-'}` }
  ])
  const workspaceMetrics = computed(() => overview.metrics)
  const booleanOptions = computed(() =>
    (getDictMap.value.commonBoolean ?? []).map((item) => ({
      label: item.label,
      value: String(item.value) === 'true' || String(item.value) === '1'
    }))
  )
  const selectedMenu = computed(() =>
    menu.selectedId ? treeUtils.findNode(menu.tree, menu.selectedId) : undefined
  )
  const selectedMenuLabel = computed(() =>
    selectedMenu.value
      ? String(selectedMenu.value.meta?.title || selectedMenu.value.name || '未命名菜单')
      : '全部功能'
  )
  const selectedMenuIds = computed(() =>
    menu.selectedId
      ? treeUtils.getDescendants(menu.tree, menu.selectedId, true).map((item) => item.id)
      : undefined
  )

  const table: UnwrapNestedRefs<TableGroup> = reactive<TableGroup>({
    search: { keyword: '', enabled: undefined, isDefault: undefined },
    searchItems: computed<SearchFormItem[]>(() => [
      {
        key: 'keyword',
        label: '关键字',
        type: 'input',
        props: { clearable: true, placeholder: '搜索业务类型编号、名称或备注' }
      },
      {
        key: 'enabled',
        label: '状态',
        type: 'select',
        props: { clearable: true, placeholder: '全部状态', options: booleanOptions.value }
      },
      {
        key: 'isDefault',
        label: '默认类型',
        type: 'select',
        props: { clearable: true, placeholder: '全部类型', options: booleanOptions.value }
      }
    ]),
    headerActions: computed<ArtTableQueryHeaderAction[]>(() => [
      {
        type: 'add',
        label: '新增业务类型',
        permission: 'MdmBusinessType:Add',
        onClick: () => openDialog('add')
      },
      {
        key: 'copy',
        label: '复制',
        icon: 'ri:file-copy-line',
        permission: 'MdmBusinessType:Copy',
        selectionRequired: false,
        disabled: ({ selectedCount }: ArtTableQueryHeaderActionContext) => selectedCount !== 1,
        onClick: ({ selectedRows }) => openDialog('copy', selectedRows[0] as BusinessTypeRecord)
      },
      {
        type: 'export',
        label: '导出',
        permission: 'MdmBusinessType:Export',
        exportFilename: () => `业务类型_${dayjs().format('YYYYMMDD_HHmm')}`,
        exportSheetName: '业务类型',
        exportColumns: [
          { key: 'menuPath', title: '所属菜单功能' },
          { key: 'businessTypeCode', title: '业务类型编号' },
          { key: 'businessTypeName', title: '业务类型名称' },
          { key: 'documentTypeCode', title: '单据类型编号' },
          { key: 'documentTypeName', title: '所属单据类型' },
          { key: 'isDefault', title: '默认业务类型', formatter: (value) => (value ? '是' : '否') },
          { key: 'sourceBusinessTypeCode', title: '源业务类型编号' },
          { key: 'sourceBusinessTypeName', title: '源业务类型' },
          { key: 'inventoryDirection', title: '库存方向' },
          { key: 'ownerType', title: '货主类型' },
          {
            key: 'inventoryAccounting',
            title: '存货核算标志',
            formatter: (value) => (value ? '是' : '否')
          },
          { key: 'remark', title: '备注' },
          { key: 'sortOrder', title: '排序' },
          { key: 'textColor', title: '文字颜色' },
          { key: 'tagStyle', title: '标签样式' },
          { key: 'statusLabel', title: '状态' },
          ...(showTenantColumn.value
            ? [
                { key: 'tenantName', title: '所属租户' },
                { key: 'tenantCode', title: '租户编码' }
              ]
            : [])
        ],
        exportApi: async ({ searchParams, maxRows }) => {
          const rows = await exportBusinessTypes({
            tenantId: effectiveTenantId.value,
            menuIds: selectedMenuIds.value,
            keyword: String(searchParams.keyword ?? ''),
            enabled: typeof searchParams.enabled === 'boolean' ? searchParams.enabled : undefined,
            isDefault:
              typeof searchParams.isDefault === 'boolean' ? searchParams.isDefault : undefined,
            limit: maxRows
          })
          return rows.map<ExportRow>((row) => ({
            ...row,
            menuPath: resolveMenuPath(row.menuId ?? ''),
            statusLabel: row.enabled ? '启用' : '禁用'
          }))
        }
      }
    ]),
    selectionActions: computed<ArtTableQueryHeaderAction[]>(() => [
      {
        type: 'delete',
        permission: 'MdmBusinessType:Delete',
        content: ({ selectedCount }: ArtTableQueryHeaderActionContext) =>
          `确定删除选中的 ${selectedCount} 条业务类型吗？已被业务单据引用的类型不会被删除。`,
        onClick: async ({ selectedRows, api }) => {
          await deleteBusinessTypes(selectedRows.map((row) => String(row.id)))
          await Promise.all([api.refreshRemove(), loadStats()])
        }
      }
    ])
  })

  const tableProps: ArtTableQueryTableProps = {
    rowKey: 'id',
    tableLayout: 'fixed',
    height: '100%',
    showOverflowTooltip: true,
    emptyText: '当前菜单暂无业务类型',
    emptyDescription: '可切换左侧菜单或调整筛选条件；有权限的用户可以新增第一条类型。'
  }

  const fetchRows = (params: TableParams, options?: { signal?: AbortSignal }) =>
    fetchBusinessTypeList(
      {
        ...params,
        tenantId: effectiveTenantId.value,
        menuIds: selectedMenuIds.value
      },
      options
    )

  const columnsFactory = (): ColumnOption<BusinessTypeRecord>[] => [
    {
      type: 'selection',
      width: 50,
      fixed: 'left',
      reserveSelection: true,
      selectable: () => hasAuth('MdmBusinessType:Copy') || hasAuth('MdmBusinessType:Delete')
    },
    {
      prop: 'businessTypeName',
      label: '业务类型',
      minWidth: 250,
      fixed: 'left',
      link: { permission: 'MdmBusinessType:View', onClick: openDetail },
      formatter: (row) => (
        <div class="business-type-identity">
          <span class="business-type-identity__icon" aria-hidden="true">
            <ArtSvgIcon icon={row.isDefault ? 'ri:star-fill' : 'ri:file-list-3-line'} />
          </span>
          <div>
            <span class="business-type-identity__heading">
              <strong title={row.businessTypeName}>{row.businessTypeName}</strong>
              {row.isDefault ? <em>默认</em> : null}
            </span>
            <code title={row.businessTypeCode} translate="no">
              {row.businessTypeCode}
            </code>
          </div>
        </div>
      )
    },
    {
      prop: 'documentType',
      label: '所属单据类型',
      minWidth: 190,
      formatter: (row) => (
        <div class="business-type-menu-cell">
          <strong title={row.documentType?.documentTypeName}>
            {row.documentType?.documentTypeName || '--'}
          </strong>
          <small title={row.documentType?.documentTypeCode}>
            {row.documentType?.documentTypeCode || '--'}
          </small>
        </div>
      )
    },
    {
      prop: 'inventoryDirection',
      label: '库存方向',
      width: 106,
      formatter: (row) =>
        row.inventoryDirection ? (
          <ArtDictDisplay
            dictCode="mdmBusinessInventoryDirection"
            value={row.inventoryDirection}
            display="auto"
          />
        ) : (
          '--'
        )
    },
    {
      prop: 'sourceBusinessType',
      label: '源业务类型',
      minWidth: 170,
      formatter: (row) => (
        <div class="business-type-menu-cell">
          <strong title={row.sourceBusinessType?.businessTypeName}>
            {row.sourceBusinessType?.businessTypeName || '--'}
          </strong>
          {row.sourceBusinessType ? (
            <small title={row.sourceBusinessType.businessTypeCode}>
              {row.sourceBusinessType.businessTypeCode}
            </small>
          ) : null}
        </div>
      )
    },
    {
      prop: 'ownerType',
      label: '货主类型',
      width: 108,
      formatter: (row) =>
        row.ownerType ? (
          <ArtDictDisplay dictCode="mdmBusinessOwnerType" value={row.ownerType} display="auto" />
        ) : (
          '--'
        )
    },
    {
      prop: 'inventoryAccounting',
      label: '存货核算',
      width: 100,
      formatter: (row) => (
        <ArtDictDisplay
          dictCode="commonBoolean"
          value={String(row.inventoryAccounting)}
          display="tag"
        />
      )
    },
    ...(showTenantColumn.value
      ? [
          {
            prop: 'tenant',
            label: '所属租户',
            minWidth: 154,
            formatter: (row: BusinessTypeRecord) => (
              <div class="business-type-tenant-cell">
                <strong>{row.tenant?.tenantName || '--'}</strong>
                <small>{row.tenant?.tenantCode || '--'}</small>
              </div>
            )
          } satisfies ColumnOption<BusinessTypeRecord>
        ]
      : []),
    {
      prop: 'tagStyle',
      label: '标签预览',
      minWidth: 140,
      formatter: (row) => (
        <ElTag
          type={row.tagStyle || 'primary'}
          effect="light"
          round
          style={{ color: row.textColor || undefined } as CSSProperties}
        >
          {row.businessTypeName}
        </ElTag>
      )
    },
    {
      prop: 'isDefault',
      label: '默认类型',
      width: 96,
      formatter: (row) => (
        <ArtDictDisplay dictCode="commonBoolean" value={String(row.isDefault)} display="tag" />
      )
    },
    { prop: 'sortOrder', label: '排序', width: 82, sortable: true },
    {
      prop: 'enabled',
      label: '状态',
      width: 88,
      formatter: (row) => (
        <ArtDictDisplay dictCode="commonBoolean" value={String(row.enabled)} display="tag" />
      )
    },
    { prop: 'remark', label: '备注', minWidth: 190 },
    {
      prop: 'updateTime',
      label: '更新信息',
      minWidth: 170,
      formatter: (row) => (
        <div class="business-type-update-cell">
          <span>{formatWithDayjs(row.updateTime) || '--'}</span>
          <small>{row.updateBy || '系统维护'}</small>
        </div>
      )
    },
    {
      prop: 'operation',
      label: '操作',
      width: 136,
      fixed: 'right',
      formatter: (row) => (
        <BusinessTableRowActions>
          <ArtButtonTable
            type="view"
            permission="MdmBusinessType:View"
            onClick={() => openDetail(row)}
          />
          <ArtButtonTable
            type="edit"
            permission="MdmBusinessType:Edit"
            onClick={() => openDialog('edit', row)}
          />
          <ArtButtonTable
            type="delete"
            permission="MdmBusinessType:Delete"
            onClick={() => void removeRow(row)}
          />
        </BusinessTableRowActions>
      )
    }
  ]

  const resolveMenuPath = (menuId: string): string =>
    treeUtils
      .getAncestors(menu.tree, menuId)
      .map((item) => String(item.meta?.title || item.name || '未命名菜单'))
      .join(' / ')

  const rowMenuId = (record: BusinessTypeRecord): string => record.documentType?.menuId ?? ''

  const openDialog = (mode: 'add' | 'copy' | 'edit', record?: BusinessTypeRecord): void => {
    void dialogRef.value?.handleOpen({
      mode,
      record,
      selectedMenuIds: selectedMenuIds.value,
      menuTree: menu.tree,
      tenantOptions: tenantOptions.value.map((tenant) => ({
        label: `${tenant.tenantName}（${tenant.tenantCode}）`,
        value: tenant.id
      })),
      effectiveTenantId: effectiveTenantId.value
    })
  }

  const openDetail = (record: BusinessTypeRecord): void => {
    void detailDrawerRef.value?.handleOpen({
      record,
      menuPath: resolveMenuPath(rowMenuId(record))
    })
  }

  const removeRow = async (row: BusinessTypeRecord): Promise<void> => {
    await confirmDelete(`确定删除业务类型“${row.businessTypeName}”吗？`)
    await deleteBusinessTypes([row.id])
    await Promise.all([tableRef.value?.refreshRemove(), loadStats()])
  }

  const loadStats = async (): Promise<void> => {
    Object.assign(overview.stats, await fetchBusinessTypeStats(effectiveTenantId.value))
  }

  const loadMenuTree = async (): Promise<void> => {
    menu.tree = await fetchBusinessTypeMenuTree()
    if (menu.selectedId && !treeUtils.findNode(menu.tree, menu.selectedId)) menu.selectedId = ''
  }

  const refreshContext = async (): Promise<void> => {
    menu.loading = true
    try {
      await Promise.all([loadMenuTree(), loadStats()])
      await tableRef.value?.getData()
    } finally {
      menu.loading = false
    }
  }

  const handleMenuSelect = async (menuId: string): Promise<void> => {
    if (menu.selectedId === menuId) return
    menu.selectedId = menuId
    await tableRef.value?.getData()
  }

  const handleDrawerMenuSelect = async (menuId: string): Promise<void> => {
    await handleMenuSelect(menuId)
    await menuDrawerRef.value?.handleClose()
  }

  const openMenuDrawer = async (): Promise<void> => {
    await menuDrawerRef.value?.handleOpen(
      {},
      {
        title: '筛选菜单功能',
        subtitle: '选择目录时，右侧列表会包含全部下级菜单的业务类型。',
        size: 'sm',
        contentHeight: 'calc(100vh - 118px)',
        showFooter: false,
        drawerProps: {
          appendToBody: true,
          bodyClass: 'business-type-menu-filter-drawer__body'
        }
      }
    )
  }

  const handleSaved = (mode: 'add' | 'edit'): void => {
    void Promise.all([
      mode === 'add' ? tableRef.value?.refreshCreate() : tableRef.value?.refreshUpdate(),
      loadStats()
    ])
  }

  const initialize = async (): Promise<void> => {
    menu.loading = true
    try {
      await Promise.all([
        userStore.ensureDictLoaded('commonBoolean'),
        userStore.ensureDictLoaded('mdmBusinessInventoryDirection'),
        userStore.ensureDictLoaded('mdmBusinessOwnerType'),
        tenantScopeStore.loadTenantOptions(),
        loadMenuTree()
      ])
      await Promise.all([loadStats(), tableRef.value?.getData()])
    } finally {
      isInitializing.value = false
      menu.loading = false
    }
  }

  onMounted(() => void initialize())
  watch(effectiveTenantId, () => {
    if (!isInitializing.value) void refreshContext()
  })
</script>

<style scoped lang="scss">
  .business-type-page {
    gap: 12px;
    min-width: 0;
    overflow: hidden;

    &__workspace {
      flex: 1 1 auto;
      width: 100%;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }

    &__menu-panel,
    &__table-workspace {
      min-width: 0;
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }

    &__table-workspace {
      display: flex;
      flex-direction: column;
    }

    &__mobile-menu {
      display: flex;
      flex: none;
      gap: var(--art-space-3);
      align-items: center;
      min-width: 0;
      padding: var(--art-space-3) var(--art-space-4);
      margin-bottom: var(--art-space-3);

      > span {
        display: inline-flex;
        flex: 0 0 36px;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 9%, var(--default-box-color));
        border: 1px solid color-mix(in srgb, var(--theme-color) 18%, var(--art-card-border));
        border-radius: var(--art-control-radius);
      }

      > div {
        display: grid;
        flex: 1;
        min-width: 0;
      }

      small,
      strong {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      small {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      strong {
        font-size: 14px;
        color: var(--el-text-color-primary);
      }
    }

    &__drawer-filter {
      height: 100%;
      border: 0;
      border-radius: 0;
    }

    :deep(.art-table-query) {
      flex: 1 1 auto;
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }

    :deep(.business-type-identity) {
      display: flex;
      gap: var(--art-space-3);
      align-items: center;
      min-width: 0;

      > div {
        min-width: 0;
      }

      code {
        display: block;
        margin-top: 3px;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 11px;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }
    }

    :deep(.business-type-identity__icon) {
      display: grid;
      flex: 0 0 34px;
      place-items: center;
      width: 34px;
      height: 34px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 9%, var(--default-box-color));
      border-radius: var(--art-control-radius);
    }

    :deep(.business-type-identity__heading) {
      display: flex;
      gap: var(--art-space-2);
      align-items: center;
      min-width: 0;

      strong {
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }

      em {
        flex: none;
        padding: 1px 6px;
        font-size: 10px;
        font-style: normal;
        line-height: 18px;
        color: var(--el-color-warning-dark-2);
        background: var(--el-color-warning-light-9);
        border-radius: 999px;
      }
    }

    :deep(.business-type-menu-cell),
    :deep(.business-type-tenant-cell),
    :deep(.business-type-update-cell) {
      display: grid;
      min-width: 0;

      strong,
      span,
      small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      small {
        margin-top: 3px;
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }

    :deep(.business-type-menu-cell strong),
    :deep(.business-type-tenant-cell strong) {
      color: var(--el-text-color-primary);
    }
  }

  :global(.business-type-menu-filter-drawer__body) {
    --art-drawer-content-padding: 0;

    padding: 0 !important;
    overflow: hidden !important;
  }
</style>

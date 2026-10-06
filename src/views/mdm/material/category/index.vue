<template>
  <ArtPermissionGuard permission="MdmMaterialCategory:View" resource-name="物料分类">
    <div class="material-category-page business-workspace-page art-full-height">
      <BusinessWorkspaceHeader
        eyebrow="MATERIAL TAXONOMY"
        title="物料分类"
        description="建立稳定的分类树和业务默认策略，为物料档案、采购收货、库存与成本核算提供一致口径。"
        icon="ri:node-tree"
        :tags="[
          { label: '分类治理', type: 'primary' },
          { label: '策略继承', type: 'success' }
        ]"
        :metrics="metrics"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
      </BusinessWorkspaceHeader>
      <div class="material-category-page__workspace">
        <CategoryTreePanel
          :categories="records"
          :selected-id="selectedCategoryId"
          :loading="treeLoading"
          :error="treeError"
          @select="selectCategory"
          @refresh="refresh"
          @add="openChildDialog"
          @edit="openDialog"
        />
        <div class="material-category-page__table-pane">
          <ArtTableQuery
            ref="tableRef"
            v-model="search"
            :api-fn="fetchData"
            :search-items="searchItems"
            :columns-factory="columnsFactory"
            :header-actions="headerActions"
            header-actions-placement="workspace"
            :search-bar-props="{ span: 8, labelWidth: 82, showExpand: false }"
            :table-props="{
              rowKey: 'id',
              tableLayout: 'fixed',
              emptyText: selectedCategoryId ? '当前分类下暂无数据' : '暂无物料分类',
              emptyDescription: selectedCategoryId
                ? '可在左侧节点新增下级分类，或清除层级筛选。'
                : '点击新增分类，建立企业物料分类体系。'
            }"
            focusable
            focus-scope-selector=".material-category-page__workspace"
          />
        </div>
      </div>
      <CategoryDialog ref="dialogRef" @success="refresh" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import dayjs from 'dayjs'
  import { ElTag } from 'element-plus'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric
  } from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import TreeUtils from '@/utils/tree'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction,
    ArtTableQueryHeaderActionContext
  } from '@/components/core/tables/art-table-query/index.vue'
  import type { ColumnOption } from '@/types'
  import {
    deleteMaterialCategories,
    fetchMaterialCategories,
    fetchMaterialReferenceOptions,
    fetchMaterialSiteOptions,
    setMaterialCategoriesEnabled,
    type MaterialCategory,
    type MaterialType,
    type MaterialContextOption
  } from '@/api/mdm'
  import CategoryDialog, { type CategoryDialogOpenData } from './modules/category-dialog.vue'
  import CategoryTreePanel from './modules/category-tree-panel.vue'

  defineOptions({ name: 'MdmMaterialCategory' })
  interface DialogExpose {
    handleOpen: (data: CategoryDialogOpenData) => Promise<void>
  }
  const { confirmDelete } = useArtFeedback()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const { effectiveTenantId, tenantOptions } = storeToRefs(useTenantScopeStore())
  const tenantId = computed(() => effectiveTenantId.value ?? '')
  const tableRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<DialogExpose>()
  const records = ref<MaterialCategory[]>([])
  const materialTypes = ref<MaterialType[]>([])
  const sites = ref<MaterialContextOption[]>([])
  const selectedCategoryId = ref('')
  const treeLoading = ref(false)
  const treeError = ref('')
  const treeUtils = new TreeUtils({ parentKey: 'parentId' })
  const search = reactive({ keyword: '', status: undefined as 'enabled' | 'disabled' | undefined })
  const metrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '分类总数',
      value: records.value.length,
      description: '当前租户分类',
      icon: 'ri:node-tree'
    },
    {
      label: '顶级分类',
      value: records.value.filter((item) => !item.parentId).length,
      description: '企业分类主干',
      icon: 'ri:git-branch-line',
      tone: 'primary'
    },
    {
      label: '已启用',
      value: records.value.filter((item) => item.status === 'enabled').length,
      description: '可供物料引用',
      icon: 'ri:checkbox-circle-line',
      tone: 'success'
    }
  ])
  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '关键字',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: '分类编码、名称或说明' }
    },
    {
      label: '启用状态',
      key: 'status',
      type: 'select',
      props: {
        clearable: true,
        options: getDictMap.value.commonEnabledStatus ?? []
      }
    }
  ])
  void userStore.ensureDictLoaded('commonEnabledStatus')
  const openDialog = (row?: MaterialCategory, copy = false, parentId?: string): void =>
    void dialogRef.value?.handleOpen({
      row,
      copy,
      categories: records.value,
      materialTypes: materialTypes.value,
      sites: sites.value,
      tenantId: row?.tenantId || tenantId.value,
      tenantOptions: tenantOptions.value.map((tenant) => ({
        label: tenant.tenantName || tenant.tenantCode,
        value: tenant.id
      })),
      parentId
    })
  const openChildDialog = (parentId?: string): void => openDialog(undefined, false, parentId)
  const selectCategory = async (id: string): Promise<void> => {
    selectedCategoryId.value = id
    await tableRef.value?.getData()
  }
  const headerActions: ArtTableQueryHeaderAction[] = [
    {
      permission: 'MdmMaterialCategory:Add',
      type: 'add',
      label: '新增分类',
      onClick: () => openDialog(undefined, false, selectedCategoryId.value || undefined)
    },
    { permission: 'MdmMaterialCategory:Export', type: 'export', label: '导出' },
    {
      permission: 'MdmMaterialCategory:Copy',
      label: '复制',
      icon: 'ri:file-copy-line',
      selectionRequired: true,
      disabled: ({ selectedCount }: ArtTableQueryHeaderActionContext) => selectedCount !== 1,
      onClick: ({ selectedRows }: ArtTableQueryHeaderActionContext) => {
        const selectedId = selectedRows[0]?.id
        const selectedRecord = records.value.find((item) => item.id === selectedId)
        if (selectedRecord) openDialog(selectedRecord, true)
      }
    },
    {
      permission: 'MdmMaterialCategory:Enable',
      label: '启用',
      icon: 'ri:checkbox-circle-line',
      selectionRequired: true,
      onClick: async ({ selectedRows, api }: ArtTableQueryHeaderActionContext) => {
        await setMaterialCategoriesEnabled(
          selectedRows.map((item) => String(item.id)),
          true
        )
        await api.refreshUpdate()
      }
    },
    {
      permission: 'MdmMaterialCategory:Disable',
      label: '停用',
      icon: 'ri:forbid-line',
      selectionRequired: true,
      onClick: async ({ selectedRows, api }: ArtTableQueryHeaderActionContext) => {
        await setMaterialCategoriesEnabled(
          selectedRows.map((item) => String(item.id)),
          false
        )
        await api.refreshUpdate()
      }
    },
    {
      permission: 'MdmMaterialCategory:Delete',
      type: 'delete',
      content: ({ selectedCount }: ArtTableQueryHeaderActionContext) =>
        `确定删除选中的 ${selectedCount} 个物料分类吗？`,
      onClick: async ({ selectedRows, api }: ArtTableQueryHeaderActionContext) => {
        await deleteMaterialCategories(selectedRows.map((item) => String(item.id)))
        await api.refreshRemove()
      }
    }
  ]
  const parentName = (row: MaterialCategory): string =>
    records.value.find((item) => item.id === row.parentId)?.categoryName || '顶级分类'
  const identity = (row: MaterialCategory) => (
    <div class="material-category-page__identity">
      <strong>{row.categoryName}</strong>
      <small>{row.categoryCode}</small>
    </div>
  )
  const columnsFactory = (): ColumnOption<MaterialCategory>[] => [
    { type: 'selection', width: 48 },
    { prop: 'sort', label: '顺序', width: 86, align: 'center', sortable: true },
    { prop: 'categoryName', label: '分类', minWidth: 210, fixed: 'left', formatter: identity },
    { prop: 'codePrefix', label: '编码前缀', minWidth: 120 },
    { prop: 'parentId', label: '上级分类', minWidth: 150, formatter: parentName },
    {
      prop: 'materialTypeId',
      label: '物料类型',
      minWidth: 150,
      formatter: (row) => row.materialType?.typeName || '未限定'
    },
    {
      prop: 'batchManaged',
      label: '批次',
      width: 90,
      align: 'center',
      formatter: (row) =>
        row.batchManaged ? (
          <ElTag size="small" type="success">
            管理
          </ElTag>
        ) : (
          '否'
        )
    },
    {
      prop: 'requiresInspection',
      label: '来料检验',
      width: 100,
      align: 'center',
      formatter: (row) => (row.requiresInspection ? '需要' : '免检')
    },
    {
      prop: 'valuationMethod',
      label: '计价方法',
      width: 130,
      formatter: (row) =>
        ({
          moving_average: '移动平均',
          standard_cost: '标准成本',
          fifo: '先进先出',
          specific: '个别计价'
        })[row.valuationMethod] || row.valuationMethod
    },
    {
      prop: 'status',
      label: '状态',
      width: 90,
      align: 'center',
      formatter: (row) => (
        <ElTag type={row.status === 'enabled' ? 'success' : 'info'} effect="light">
          {row.status === 'enabled' ? '启用' : '停用'}
        </ElTag>
      )
    },
    {
      prop: 'updateTime',
      label: '更新时间',
      width: 168,
      formatter: (row) => (row.updateTime ? dayjs(row.updateTime).format('YYYY-MM-DD HH:mm') : '—')
    },
    {
      prop: 'operation',
      label: '操作',
      width: 170,
      fixed: 'right',
      formatter: (row) => (
        <BusinessTableRowActions>
          <ArtButtonTable
            permission="MdmMaterialCategory:Edit"
            type="edit"
            onClick={() => openDialog(row)}
          />
          <ArtButtonTable
            permission="MdmMaterialCategory:Delete"
            type="delete"
            onClick={async () => {
              await confirmDelete(`确定删除“${row.categoryName}”吗？`)
              await deleteMaterialCategories([row.id])
              await tableRef.value?.getData()
            }}
          />
        </BusinessTableRowActions>
      )
    }
  ]
  const fetchData = async (params: Api.Common.PaginationParams & typeof search) => {
    treeLoading.value = true
    treeError.value = ''
    try {
      const [categoryRecords, typeRecords, siteRecords] = await Promise.all([
        fetchMaterialCategories(tenantId.value),
        fetchMaterialReferenceOptions<MaterialType>('material-type', tenantId.value),
        fetchMaterialSiteOptions(tenantId.value)
      ])
      records.value = categoryRecords
      materialTypes.value = typeRecords
      sites.value = siteRecords
      if (
        selectedCategoryId.value &&
        !records.value.some((item) => item.id === selectedCategoryId.value)
      ) {
        selectedCategoryId.value = ''
      }
      const scopedIds = selectedCategoryId.value
        ? new Set(
            treeUtils
              .getDescendants(treeUtils.listToTree(records.value), selectedCategoryId.value, true)
              .map((item) => item.id)
          )
        : null
      const keyword = params.keyword?.trim().toLowerCase()
      const filtered = records.value.filter(
        (item) =>
          (!scopedIds || scopedIds.has(item.id)) &&
          (!params.status || item.status === params.status) &&
          (!keyword ||
            [item.categoryCode, item.codePrefix, item.categoryName, item.description].some(
              (value) => value?.toLowerCase().includes(keyword)
            ))
      )
      const start = (params.current - 1) * params.size
      return { records: filtered.slice(start, start + params.size), total: filtered.length }
    } catch (error) {
      treeError.value = getFriendlySupabaseErrorMessage(error, '分类层级加载失败，请重试')
      throw error
    } finally {
      treeLoading.value = false
    }
  }
  const refresh = async (): Promise<void> => {
    await tableRef.value?.getData()
  }
</script>

<style scoped lang="scss">
  .material-category-page {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 0;
  }

  .material-category-page__workspace {
    display: grid;
    flex: 1;
    grid-template-columns: minmax(280px, 320px) minmax(0, 1fr);
    gap: 14px;
    min-height: 0;
  }

  .material-category-page__table-pane {
    display: flex;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  :deep(.material-category-page__identity) {
    display: grid;
    min-width: 0;
  }

  :deep(.material-category-page__identity strong),
  :deep(.material-category-page__identity small) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :deep(.material-category-page__identity small) {
    margin-top: 3px;
    font-size: 11px;
    color: var(--el-text-color-secondary);
  }

  @media (width <= 1080px) {
    .material-category-page__workspace {
      grid-template-columns: minmax(240px, 280px) minmax(0, 1fr);
    }
  }

  @media (width <= 820px) {
    .material-category-page__workspace {
      grid-template-rows: minmax(260px, 38vh) minmax(520px, 1fr);
      grid-template-columns: 1fr;
    }
  }
</style>

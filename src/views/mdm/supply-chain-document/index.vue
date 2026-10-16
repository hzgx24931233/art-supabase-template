<template>
  <ArtPermissionGuard
    :permission="`${definition.routeName}:View`"
    :resource-name="pageConfig.title"
  >
    <div class="supply-chain-document-page business-workspace-page art-full-height">
      <BusinessWorkspaceHeader
        :eyebrow="pageConfig.eyebrow"
        :title="pageConfig.title"
        :description="pageConfig.description"
        :icon="pageConfig.icon"
        :tags="workspaceTags"
      >
        <template #actions>
          <BusinessTableWorkspaceActions :table="tableRef" />
        </template>
      </BusinessWorkspaceHeader>

      <ArtTableQuery
        ref="tableRef"
        v-model="table.search"
        :api-fn="fetchRows"
        :search-items="table.searchItems"
        :columns-factory="columnsFactory"
        :header-actions="table.headerActions"
        :selection-actions="table.selectionActions"
        header-actions-placement="workspace"
        :search-bar-props="{ span: 8, labelWidth: 70, showExpand: false }"
        :table-props="{
          rowKey: 'id',
          tableLayout: 'fixed',
          emptyText: `暂无${pageConfig.title}`,
          emptyDescription: '点击新增，登记第一张单据；编号由编号规则在保存时生成。'
        }"
        focusable
        focus-scope-selector=".supply-chain-document-page"
      />
    </div>

    <DocumentDialog ref="dialogRef" @success="handleSaved" />
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useUserStore } from '@/store/modules/user'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessWorkspaceHeader, {
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
    deleteSupplyChainDocuments,
    fetchSupplyChainDocuments,
    resolveSupplyChainDocumentDefinition,
    type SupplyChainDocumentKind,
    type SupplyChainDocumentQuery,
    type SupplyChainDocumentRecord
  } from '@/api/mdm/supply-chain-document'
  import { formatWithDayjs } from '@/utils/time'
  import DocumentDialog from './modules/document-dialog.vue'
  import {
    resolveSupplyChainDocumentPageConfig,
    type SupplyChainDocumentPageConfig
  } from './modules/document-config'

  defineOptions({ name: 'MdmSupplyChainDocument' })

  const declaredPermissions = [
    'MdmPurchaseContract:View',
    'MdmPurchaseContract:Add',
    'MdmPurchaseContract:Edit',
    'MdmPurchaseContract:Delete',
    'MdmPurchaseContract:Export',
    'MdmPurchaseRequest:View',
    'MdmPurchaseRequest:Add',
    'MdmPurchaseRequest:Edit',
    'MdmPurchaseRequest:Delete',
    'MdmPurchaseRequest:Export',
    'MdmPurchaseOrder:View',
    'MdmPurchaseOrder:Add',
    'MdmPurchaseOrder:Edit',
    'MdmPurchaseOrder:Delete',
    'MdmPurchaseOrder:Export',
    'MdmReceiptNotice:View',
    'MdmReceiptNotice:Add',
    'MdmReceiptNotice:Edit',
    'MdmReceiptNotice:Delete',
    'MdmReceiptNotice:Export',
    'MdmSalesContractDoc:View',
    'MdmSalesContractDoc:Add',
    'MdmSalesContractDoc:Edit',
    'MdmSalesContractDoc:Delete',
    'MdmSalesContractDoc:Export',
    'MdmSalesOrder:View',
    'MdmSalesOrder:Add',
    'MdmSalesOrder:Edit',
    'MdmSalesOrder:Delete',
    'MdmSalesOrder:Export',
    'MdmShippingNotice:View',
    'MdmShippingNotice:Add',
    'MdmShippingNotice:Edit',
    'MdmShippingNotice:Delete',
    'MdmShippingNotice:Export'
  ] as const
  void declaredPermissions

  interface DocumentDialogExpose {
    handleOpen: (data: {
      kind: SupplyChainDocumentKind
      config: SupplyChainDocumentPageConfig
      row?: SupplyChainDocumentRecord
      readonly?: boolean
    }) => Promise<void>
  }

  const route = useRoute()
  const tableRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<DocumentDialogExpose>()
  const { confirmDelete } = useArtFeedback()
  const userStore = useUserStore()

  const pageConfig = computed(() => resolveSupplyChainDocumentPageConfig(route.path))
  const definition = computed(() => resolveSupplyChainDocumentDefinition(pageConfig.value.kind))

  void userStore.ensureDictLoaded('commonDocumentReviewStatus')

  const workspaceTags = computed<BusinessWorkspaceTag[]>(() => [
    { label: '单据台账', type: 'primary' },
    { label: `往来单位：${pageConfig.value.partyLabel}` }
  ])

  const table = reactive({
    search: { keyword: '' } as SupplyChainDocumentQuery,
    searchItems: computed<SearchFormItem[]>(() => [
      {
        key: 'keyword',
        label: '关键字',
        type: 'input',
        props: { clearable: true, placeholder: '搜索单据编号或备注' }
      }
    ]),
    headerActions: computed<ArtTableQueryHeaderAction[]>(() => [
      {
        type: 'add',
        label: `新增${pageConfig.value.title}`,
        permission: `${definition.value.routeName}:Add`,
        onClick: () => openDialog()
      }
    ]),
    selectionActions: computed<ArtTableQueryHeaderAction[]>(() => [
      {
        type: 'delete',
        permission: `${definition.value.routeName}:Delete`,
        content: (context: ArtTableQueryHeaderActionContext) =>
          `确定删除选中的 ${context.selectedCount} 张${pageConfig.value.title}吗？`,
        onClick: async (context: ArtTableQueryHeaderActionContext) => {
          await deleteSupplyChainDocuments(
            pageConfig.value.kind,
            context.selectedRows.map((row) => String(row.id))
          )
          await context.api.refreshRemove()
        }
      }
    ])
  })

  const fetchRows = (params: SupplyChainDocumentQuery) =>
    fetchSupplyChainDocuments(pageConfig.value.kind, params)

  const columnsFactory = (): ColumnOption<SupplyChainDocumentRecord>[] => [
    {
      prop: 'documentNo',
      label: '单据编号',
      minWidth: 170,
      fixed: 'left',
      formatter: (row) => (
        <div class="scm-document-number">
          <strong title={row.documentNo}>{row.documentNo}</strong>
          <small>{row.documentType?.name || '--'}</small>
        </div>
      )
    },
    {
      prop: 'status',
      label: '单据状态',
      width: 110,
      dict: { code: 'commonDocumentReviewStatus', display: 'tag' }
    },
    {
      prop: 'party',
      label: pageConfig.value.partyLabel,
      minWidth: 190,
      formatter: (row) => {
        const party = definition.value.party === 'supplier' ? row.supplier : row.customer
        return (
          <div class="scm-document-party">
            <strong>{party?.name || '--'}</strong>
            <small>{party?.code || ''}</small>
          </div>
        )
      }
    },
    {
      prop: 'project',
      label: '关联项目',
      minWidth: 190,
      formatter: (row) => <span title={row.project?.name || ''}>{row.project?.name || '--'}</span>
    },
    {
      prop: 'documentDate',
      label: '单据日期',
      width: 120,
      formatter: (row) => formatWithDayjs(row.documentDate) || '--'
    },
    {
      prop: 'deliveryDate',
      label: '交付日期',
      width: 120,
      formatter: (row) => formatWithDayjs(row.deliveryDate) || '--'
    },
    {
      prop: 'totalAmount',
      label: '价税合计',
      width: 130,
      formatter: (row) => (
        <div class="scm-document-amount">
          <strong>{Number(row.totalAmount ?? 0).toFixed(2)}</strong>
          <small>{row.currency || 'CNY'}</small>
        </div>
      )
    },
    {
      prop: 'updatedAt',
      label: '更新时间',
      width: 170,
      formatter: (row) => formatWithDayjs(row.updatedAt) || '--'
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
            permission={`${definition.value.routeName}:View`}
            onClick={() => void openDialog(row, true)}
          />
          <ArtButtonTable
            type="edit"
            permission={`${definition.value.routeName}:Edit`}
            onClick={() => void openDialog(row)}
          />
          <ArtButtonTable
            type="delete"
            permission={`${definition.value.routeName}:Delete`}
            onClick={() => void removeRow(row)}
          />
        </BusinessTableRowActions>
      )
    }
  ]

  const openDialog = async (row?: SupplyChainDocumentRecord, readonly = false): Promise<void> => {
    await dialogRef.value?.handleOpen({
      kind: pageConfig.value.kind,
      config: pageConfig.value,
      row,
      readonly
    })
  }

  const removeRow = async (row: SupplyChainDocumentRecord): Promise<void> => {
    await confirmDelete(`确定删除“${row.documentNo}”吗？`)
    await deleteSupplyChainDocuments(pageConfig.value.kind, [String(row.id)])
    await tableRef.value?.refreshRemove()
  }

  const handleSaved = (): void => {
    void tableRef.value?.refreshUpdate()
  }

  watch(
    () => pageConfig.value.kind,
    async () => {
      table.search.keyword = ''
      await tableRef.value?.refreshCreate()
    }
  )
</script>

<style scoped lang="scss">
  .supply-chain-document-page {
    gap: 12px;
    min-width: 0;
    overflow: hidden;

    :deep(.art-table-query) {
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
    }
  }

  :deep(.scm-document-number),
  :deep(.scm-document-amount) {
    display: grid;
    min-width: 0;

    strong,
    small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    small {
      margin-top: 3px;
      font-size: 12px;
      color: var(--art-text-gray-500);
    }
  }

  :deep(.scm-document-amount strong) {
    font-variant-numeric: tabular-nums;
  }
</style>

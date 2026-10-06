<template>
  <ArtPermissionGuard :permission="`${config.routeName}:View`" :resource-name="config.title">
    <div class="material-reference-page business-workspace-page art-full-height">
      <BusinessWorkspaceHeader
        eyebrow="MATERIAL MASTER DATA"
        :title="config.title"
        :description="config.description"
        :icon="config.icon"
        :tags="config.tags"
        :metrics="metrics"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
      </BusinessWorkspaceHeader>
      <ArtTableQuery
        ref="tableRef"
        v-model="table.search"
        :api-fn="fetchData"
        :search-items="table.searchItems"
        :columns-factory="columnsFactory"
        :header-actions="table.headerActions"
        header-actions-placement="workspace"
        :search-bar-props="{ span: 8, labelWidth: 82, showExpand: false }"
        :table-props="{
          rowKey: 'id',
          tableLayout: 'fixed',
          emptyText: `暂无${config.title}`,
          emptyDescription: `点击新增，建立第一条${config.title}。`
        }"
        focusable
      />
      <ReferenceDialog ref="dialogRef" @success="refresh" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import dayjs from 'dayjs'
  import { ElTag } from 'element-plus'
  import { cloneDeep } from 'lodash-es'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction,
    ArtTableQueryHeaderActionContext
  } from '@/components/core/tables/art-table-query/index.vue'
  import type { ColumnOption } from '@/types'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric,
    type BusinessWorkspaceTag
  } from '@/components/business/business-workspace-header/index.vue'
  import {
    deleteMaterialReferences,
    fetchMaterialReferences,
    setMaterialReferencesEnabled,
    type MaterialAttributeGroup,
    type MaterialCodeRule,
    type MaterialReferenceKind,
    type MaterialReferenceQuery,
    type MaterialReferenceRecord,
    type MaterialType,
    type UnitOfMeasure
  } from '@/api/mdm'
  import ReferenceDialog, { type ReferenceDialogOpenData } from './modules/reference-dialog.vue'

  interface DialogExpose {
    handleOpen: (data: ReferenceDialogOpenData) => Promise<void>
  }
  interface ReferenceConfig {
    kind: MaterialReferenceKind
    routeName: string
    title: string
    description: string
    icon: string
    tags: BusinessWorkspaceTag[]
  }
  type TableParams = Omit<MaterialReferenceQuery, 'tenantId'> &
    Pick<Api.Common.PaginationParams, 'current' | 'size'>
  const route = useRoute()
  const configs: Record<string, ReferenceConfig> = {
    'unit-of-measure': {
      kind: 'unit-of-measure',
      routeName: 'MdmUnitOfMeasure',
      title: '计量单位',
      description: '统一维护单位编码、计量维度、精度和基准换算口径，供物料各业务视图一致引用。',
      icon: 'ri:ruler-line',
      tags: [
        { label: '统一口径', type: 'primary' },
        { label: '换算可追溯', type: 'success' }
      ]
    },
    'material-type': {
      kind: 'material-type',
      routeName: 'MdmMaterialType',
      title: '物料类型',
      description: '定义企业级物料顶层语义与编码前缀，为分类、编码规则和业务视图提供稳定边界。',
      icon: 'ri:price-tag-3-line',
      tags: [
        { label: '类型治理', type: 'primary' },
        { label: '编码前缀', type: 'info' }
      ]
    },
    'attribute-group': {
      kind: 'attribute-group',
      routeName: 'MdmMaterialAttributeGroup',
      title: '物料属性组',
      description: '把规格、颜色、材质等属性和值域结构化管理，提升检索、描述组合和数据质量。',
      icon: 'ri:list-settings-line',
      tags: [
        { label: '结构化属性', type: 'primary' },
        { label: '值域受控', type: 'success' }
      ]
    },
    'code-rule': {
      kind: 'code-rule',
      routeName: 'MdmMaterialCodeRule',
      title: '物料编码规则',
      description: '组合类型、分类、固定字符、日期与流水号，形成可预览、可审计的企业编码规则。',
      icon: 'ri:barcode-line',
      tags: [
        { label: '五段式规则', type: 'primary' },
        { label: '服务端流水', type: 'warning' }
      ]
    }
  }
  const declaredPermissions = [
    'MdmUnitOfMeasure:View',
    'MdmUnitOfMeasure:Add',
    'MdmUnitOfMeasure:Copy',
    'MdmUnitOfMeasure:Edit',
    'MdmUnitOfMeasure:Delete',
    'MdmUnitOfMeasure:Export',
    'MdmUnitOfMeasure:Enable',
    'MdmUnitOfMeasure:Disable',
    'MdmMaterialType:View',
    'MdmMaterialType:Add',
    'MdmMaterialType:Copy',
    'MdmMaterialType:Edit',
    'MdmMaterialType:Delete',
    'MdmMaterialType:Export',
    'MdmMaterialType:Enable',
    'MdmMaterialType:Disable',
    'MdmMaterialAttributeGroup:View',
    'MdmMaterialAttributeGroup:Add',
    'MdmMaterialAttributeGroup:Copy',
    'MdmMaterialAttributeGroup:Edit',
    'MdmMaterialAttributeGroup:Delete',
    'MdmMaterialAttributeGroup:Export',
    'MdmMaterialAttributeGroup:Enable',
    'MdmMaterialAttributeGroup:Disable',
    'MdmMaterialCodeRule:View',
    'MdmMaterialCodeRule:Add',
    'MdmMaterialCodeRule:Copy',
    'MdmMaterialCodeRule:Edit',
    'MdmMaterialCodeRule:Delete',
    'MdmMaterialCodeRule:Export',
    'MdmMaterialCodeRule:Enable',
    'MdmMaterialCodeRule:Disable'
  ] as const
  void declaredPermissions
  const config = computed(
    () => configs[String(route.path.split('/').at(-1))] ?? configs['unit-of-measure']
  )
  defineOptions({ name: 'MdmMaterialReference' })
  const { confirmDelete } = useArtFeedback()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const { effectiveTenantId, tenantOptions } = storeToRefs(useTenantScopeStore())
  const tenantId = computed(() => effectiveTenantId.value ?? '')
  void userStore.ensureDictLoaded('commonEnabledStatus')
  const tableRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<DialogExpose>()
  const overview = reactive({ total: 0, enabled: 0 })
  const metrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '主档总数',
      value: overview.total,
      description: '当前租户定义',
      icon: config.value.icon
    },
    {
      label: '本页已启用',
      value: overview.enabled,
      description: '当前页可供业务引用',
      icon: 'ri:checkbox-circle-line',
      tone: 'success'
    },
    {
      label: '治理状态',
      value: overview.total ? '运行中' : '待建设',
      description: overview.total ? '规则已生效' : '从第一条主档开始',
      icon: 'ri:shield-check-line',
      tone: overview.total ? 'success' : 'warning'
    }
  ])
  const openDialog = (row?: MaterialReferenceRecord, copy = false): void =>
    void dialogRef.value?.handleOpen({
      kind: config.value.kind,
      row: row ? cloneDeep(row) : undefined,
      copy,
      tenantId: row?.tenantId || tenantId.value,
      tenantOptions: tenantOptions.value.map((tenant) => ({
        label: tenant.tenantName || tenant.tenantCode,
        value: tenant.id
      }))
    })
  const permission = (action: string): string => `${config.value.routeName}:${action}`
  const table = reactive({
    search: { keyword: '', status: undefined as 'enabled' | 'disabled' | undefined },
    searchItems: computed<SearchFormItem[]>(() => [
      {
        label: '关键字',
        key: 'keyword',
        type: 'input',
        props: { clearable: true, placeholder: '编码、名称或业务说明' }
      },
      {
        label: '启用状态',
        key: 'status',
        type: 'select',
        props: {
          clearable: true,
          placeholder: '全部状态',
          options: getDictMap.value.commonEnabledStatus ?? []
        }
      }
    ]),
    headerActions: computed<ArtTableQueryHeaderAction[]>(() => [
      {
        permission: permission('Add'),
        type: 'add',
        label: `新增${config.value.title}`,
        onClick: () => openDialog()
      },
      { permission: permission('Export'), type: 'export', label: '导出' },
      {
        permission: permission('Copy'),
        label: '复制',
        icon: 'ri:file-copy-line',
        selectionRequired: true,
        disabled: ({ selectedCount }: ArtTableQueryHeaderActionContext) => selectedCount !== 1,
        onClick: ({ selectedRows }: ArtTableQueryHeaderActionContext) =>
          openDialog(selectedRows[0] as MaterialReferenceRecord, true)
      },
      {
        permission: permission('Enable'),
        label: '启用',
        icon: 'ri:checkbox-circle-line',
        selectionRequired: true,
        disabled: ({ selectedCount }: ArtTableQueryHeaderActionContext) =>
          config.value.kind === 'code-rule' && selectedCount !== 1,
        onClick: async ({ selectedRows, api }: ArtTableQueryHeaderActionContext) => {
          await setMaterialReferencesEnabled(
            config.value.kind,
            selectedRows.map((row) => String(row.id)),
            true
          )
          await api.refreshUpdate()
        }
      },
      {
        permission: permission('Disable'),
        label: '停用',
        icon: 'ri:forbid-line',
        selectionRequired: true,
        onClick: async ({ selectedRows, api }: ArtTableQueryHeaderActionContext) => {
          await setMaterialReferencesEnabled(
            config.value.kind,
            selectedRows.map((row) => String(row.id)),
            false
          )
          await api.refreshUpdate()
        }
      },
      {
        permission: permission('Delete'),
        type: 'delete',
        content: ({ selectedCount }: ArtTableQueryHeaderActionContext) =>
          `确定删除选中的 ${selectedCount} 条${config.value.title}吗？已被业务引用的记录无法删除。`,
        onClick: async ({ selectedRows, api }: ArtTableQueryHeaderActionContext) => {
          await deleteMaterialReferences(
            config.value.kind,
            selectedRows.map((row) => String(row.id))
          )
          await api.refreshRemove()
        }
      }
    ])
  })
  const identity = (title: string, code: string) => (
    <div class="material-reference-page__identity">
      <strong title={title}>{title}</strong>
      <small title={code}>{code}</small>
    </div>
  )
  const columnsFactory = (): ColumnOption<MaterialReferenceRecord>[] => {
    const shared: ColumnOption<MaterialReferenceRecord>[] = [
      { type: 'selection', width: 48 },
      { prop: 'sort', label: '顺序', width: 82, align: 'center', sortable: true }
    ]
    if (config.value.kind === 'unit-of-measure')
      shared.push(
        {
          prop: 'unitName',
          label: '计量单位',
          minWidth: 190,
          fixed: 'left',
          formatter: (row) =>
            identity((row as UnitOfMeasure).unitName, (row as UnitOfMeasure).unitCode)
        },
        {
          prop: 'symbol',
          label: '符号',
          width: 100,
          align: 'center',
          formatter: (row) => (row as UnitOfMeasure).symbol || '—'
        },
        { prop: 'dimension', label: '计量维度', minWidth: 140 },
        {
          prop: 'decimalPlaces',
          label: '精度',
          width: 90,
          align: 'center',
          formatter: (row) => `${(row as UnitOfMeasure).decimalPlaces} 位`
        },
        { prop: 'conversionFactor', label: '基准系数', width: 120, align: 'right' }
      )
    else if (config.value.kind === 'material-type')
      shared.push(
        {
          prop: 'typeName',
          label: '物料类型',
          minWidth: 220,
          fixed: 'left',
          formatter: (row) =>
            identity((row as MaterialType).typeName, (row as MaterialType).typeCode)
        },
        {
          prop: 'codePrefix',
          label: '编码前缀',
          width: 130,
          align: 'center',
          formatter: (row) => (row as MaterialType).codePrefix || '—'
        },
        {
          prop: 'tagType',
          label: '标签样式',
          width: 120,
          align: 'center',
          formatter: (row) => (
            <ElTag
              type={(row as MaterialType).tagType || undefined}
              effect="light"
              size="small"
              round
            >
              {(row as MaterialType).tagType}
            </ElTag>
          )
        }
      )
    else if (config.value.kind === 'attribute-group')
      shared.push(
        {
          prop: 'groupName',
          label: '属性组',
          minWidth: 230,
          fixed: 'left',
          formatter: (row) =>
            identity(
              (row as MaterialAttributeGroup).groupName,
              (row as MaterialAttributeGroup).groupCode
            )
        },
        {
          prop: 'attributeCount',
          label: '属性数量',
          width: 110,
          align: 'center',
          formatter: (row) => `${(row as MaterialAttributeGroup).attributes.length} 项`
        },
        {
          prop: 'attributeSummary',
          label: '值域摘要',
          minWidth: 260,
          showOverflowTooltip: true,
          formatter: (row) =>
            (row as MaterialAttributeGroup).attributes.map((item) => item.name).join('、') ||
            '尚未配置属性'
        }
      )
    else
      shared.push(
        {
          prop: 'ruleName',
          label: '编码规则',
          minWidth: 230,
          fixed: 'left',
          formatter: (row) =>
            identity((row as MaterialCodeRule).ruleName, (row as MaterialCodeRule).ruleCode)
        },
        {
          prop: 'strategy',
          label: '归类策略',
          width: 130,
          formatter: (row) =>
            (row as MaterialCodeRule).strategy === 'material_type' ? '按物料类型' : '按物料分类'
        },
        {
          prop: 'exampleCode',
          label: '编码示例',
          minWidth: 200,
          formatter: (row) => (
            <span translate="no">{(row as MaterialCodeRule).exampleCode || '—'}</span>
          )
        },
        { prop: 'codeLength', label: '总长度', width: 90, align: 'center' }
      )
    shared.push(
      {
        prop: 'status',
        label: '状态',
        width: 96,
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
        formatter: (row) =>
          row.updateTime ? dayjs(row.updateTime).format('YYYY-MM-DD HH:mm') : '—'
      },
      {
        prop: 'operation',
        label: '操作',
        width: 112,
        fixed: 'right',
        formatter: (row) => (
          <BusinessTableRowActions>
            <ArtButtonTable
              permission={permission('Edit')}
              type="edit"
              onClick={() => openDialog(row)}
            />
            <ArtButtonTable
              permission={permission('Delete')}
              type="delete"
              onClick={async () => {
                await confirmDelete(
                  `确定删除“${'unitName' in row ? row.unitName : 'typeName' in row ? row.typeName : 'groupName' in row ? row.groupName : row.ruleName}”吗？`
                )
                await deleteMaterialReferences(config.value.kind, [row.id])
                await tableRef.value?.getData()
              }}
            />
          </BusinessTableRowActions>
        )
      }
    )
    return shared
  }
  const fetchData = async (params: TableParams) => {
    const result = await fetchMaterialReferences(config.value.kind, {
      ...params,
      tenantId: tenantId.value
    })
    overview.total = result.total
    overview.enabled = result.data.filter((row) => row.status === 'enabled').length
    return { records: result.data, total: result.total }
  }
  const refresh = async (): Promise<void> => {
    await tableRef.value?.getData()
  }
  watch(
    () => route.path,
    () => {
      Object.assign(table.search, { keyword: '', status: undefined })
      void tableRef.value?.getData()
    }
  )
</script>

<style scoped lang="scss">
  .material-reference-page {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 0;

    :deep(.material-reference-page__identity) {
      display: grid;
      min-width: 0;

      strong,
      small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      strong {
        color: var(--el-text-color-primary);
      }

      small {
        margin-top: 3px;
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }
  }
</style>

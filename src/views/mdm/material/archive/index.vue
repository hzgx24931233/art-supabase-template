<template>
  <ArtPermissionGuard permission="MdmMaterialArchive:View" resource-name="物料编码">
    <div class="material-archive-page business-workspace-page art-full-height">
      <BusinessWorkspaceHeader
        eyebrow="MATERIAL CODING"
        title="物料编码"
        description="按物料分类统一维护编码、描述、属性与采购、销售、库存、生产业务视图。"
        icon="ri:barcode-box-line"
        :tags="[
          { label: '统一物料身份', type: 'primary' },
          { label: '多业务视图', type: 'success' },
          { label: '项目隔离', type: 'info' }
        ]"
        :metrics="metrics"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
      </BusinessWorkspaceHeader>
      <div class="material-archive-page__workspace">
        <CategoryTreePanel
          :categories="categories"
          :selected-id="selectedCategoryId"
          :loading="optionsLoading"
          :error="optionsError"
          navigation-only
          @select="selectCategory"
          @refresh="loadOptions"
        />
        <div class="material-archive-page__table">
          <ArtTableQuery
            ref="tableRef"
            v-model="search"
            :api-fn="fetchData"
            :search-items="searchItems"
            :columns-factory="columnsFactory"
            :header-actions="headerActions"
            header-actions-placement="workspace"
            :search-bar-props="{ span: 6, labelWidth: 82, showExpand: false, isExpand: true }"
            :table-props="{
              rowKey: 'id',
              tableLayout: 'fixed',
              emptyText: '暂无物料编码',
              emptyDescription: '点击新增物料，建立第一条受治理的物料编码。'
            }"
            focusable
          />
        </div>
      </div>
      <ArchiveDialog ref="dialogRef" @success="refresh" />
      <ArtDrawer
        ref="detailDrawerRef"
        title="物料编码"
        subtitle="统一身份、业务视图与计量换算"
        size="lg"
        :show-footer="false"
      >
        <div v-if="detailRow" class="material-detail">
          <div class="material-detail__hero"
            ><span><ArtSvgIcon icon="ri:archive-drawer-line" /></span
            ><div
              ><small>{{ detailRow.materialCode }}</small
              ><h2>{{ detailRow.materialName }}</h2
              ><p>{{ detailRow.specificationModel || '未维护规格型号' }}</p></div
            ><div class="material-detail__state"
              ><ElTag
                :type="detailRow.status === 'enabled' ? 'success' : 'info'"
                effect="plain"
                round
                >{{ detailRow.status === 'enabled' ? '启用' : '停用' }}</ElTag
              ><small>资料完整度</small><strong>{{ detailCompletion }}%</strong></div
            ></div
          >
          <div class="material-detail__summary-grid">
            <div
              ><small>物料类型</small><strong>{{ detailTypeLabel }}</strong></div
            >
            <div
              ><small>成本分类</small
              ><strong>{{ detailRow.category?.categoryName || '—' }}</strong></div
            >
            <div
              ><small>基本单位</small><strong>{{ detailBaseUnitLabel }}</strong></div
            >
          </div>
          <ElTabs v-model="detailTab" class="material-detail__tabs">
            <ElTabPane label="基础资料" name="base">
              <section class="material-detail__section">
                <header
                  ><span><ArtSvgIcon icon="ri:fingerprint-line" /></span
                  ><div
                    ><strong>主身份与特征</strong><small>跨业务系统共享的识别信息</small></div
                  ></header
                >
                <ArtDescriptions
                  :data="detailRow"
                  :items="[
                    {
                      key: 'source',
                      label: '物料来源',
                      value: sourceLabel(detailRow.materialSource)
                    },
                    { key: 'drawingNo', label: '图号', field: 'drawingNo' },
                    { key: 'brand', label: '品牌', field: 'brand' },
                    { key: 'manufacturer', label: '制造商', field: 'manufacturer' },
                    {
                      key: 'composition',
                      label: '材质',
                      field: 'materialComposition'
                    },
                    {
                      key: 'colorOrigin',
                      label: '颜色 / 产地',
                      value:
                        [detailRow.color, detailRow.placeOfOrigin].filter(Boolean).join(' · ') ||
                        '—'
                    },
                    {
                      key: 'description',
                      label: '物料描述',
                      field: 'description',
                      span: 2
                    }
                  ]"
                  :columns="2"
                  empty-text="—"
                />
              </section>
              <section class="material-detail__section material-detail__section--governance">
                <header
                  ><span><ArtSvgIcon icon="ri:shield-check-line" /></span
                  ><div
                    ><strong>数据治理</strong><small>引用关系、维护责任与最近变更</small></div
                  ></header
                >
                <ArtDescriptions
                  :data="detailRow"
                  :items="[
                    {
                      key: 'attributeGroup',
                      label: '属性组',
                      value: detailAttributeGroupLabel
                    },
                    {
                      key: 'governanceStatus',
                      label: '治理状态',
                      value: detailCompletion >= 80 ? '资料可用' : '待补充资料'
                    },
                    {
                      key: 'createBy',
                      label: '创建人',
                      field: 'createBy'
                    },
                    {
                      key: 'createTime',
                      label: '创建时间',
                      value: formatDateTime(detailRow.createTime)
                    },
                    {
                      key: 'updateBy',
                      label: '最近维护人',
                      field: 'updateBy'
                    },
                    {
                      key: 'updateTime',
                      label: '最近更新时间',
                      value: formatDateTime(detailRow.updateTime)
                    }
                  ]"
                  :columns="2"
                  empty-text="—"
                />
              </section>
            </ElTabPane>
            <ElTabPane label="业务视图" name="business">
              <div class="material-detail__business-grid">
                <section
                  v-for="view in detailBusinessViews"
                  :key="view.title"
                  class="material-detail__business-card"
                >
                  <header
                    ><span><ArtSvgIcon :icon="view.icon" /></span
                    ><div
                      ><strong>{{ view.title }}</strong
                      ><small>{{ view.description }}</small></div
                    ></header
                  >
                  <dl
                    ><template v-for="item in view.items" :key="item.label"
                      ><dt>{{ item.label }}</dt
                      ><dd>{{ item.value }}</dd></template
                    ></dl
                  >
                </section>
              </div>
            </ElTabPane>
            <ElTabPane label="单位换算" name="conversion">
              <section class="material-detail__section">
                <header
                  ><span><ArtSvgIcon icon="ri:exchange-2-line" /></span
                  ><div
                    ><strong>换算关系</strong><small>所有业务单位统一折算到基本单位</small></div
                  ></header
                >
                <ArtEmptyState
                  v-if="!detailRow.unitConversions.length"
                  title="暂未维护单位换算"
                  description="业务单位将暂时沿用物料的基本单位。"
                  size="compact"
                  :visual-size="72"
                />
                <div v-else class="material-detail__conversions">
                  <div
                    v-for="(item, index) in detailRow.unitConversions"
                    :key="`${item.sourceUnitId}-${index}`"
                  >
                    <span>{{ unitLabel(item.sourceUnitId) }}</span
                    ><strong
                      >{{ item.sourceFactor }} = {{ item.baseFactor }}
                      {{ detailBaseUnitLabel }}</strong
                    ><small>{{ item.remark || '标准换算' }}</small>
                  </div>
                </div>
              </section>
            </ElTabPane>
          </ElTabs>
        </div>
      </ArtDrawer>
      <MasterDataDeleteGuard ref="deleteGuardRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'

  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { createDateTimeFormatter } from '@/utils/ui/format'

  import { ElImage, ElTag } from 'element-plus'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import { resolveTenantWorkspaceId } from '@/utils/tenant-scope-context'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtButtonMore from '@/components/core/forms/art-button-more/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric
  } from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction,
    ArtTableQueryHeaderActionContext
  } from '@/components/core/tables/art-table-query/index.vue'
  import type { ColumnOption } from '@/types'
  import {
    deleteMaterialArchives,
    fetchMaterialArchives,
    fetchMaterialCategories,
    fetchMaterialGroupOptions,
    fetchMaterialOutboundRuleOptions,
    fetchMaterialReferenceOptions,
    fetchMaterialSupplierOptions,
    fetchMaterialSupplyRuleOptions,
    fetchMaterialStorageOptions,
    fetchMaterialWarehouseOptions,
    setMaterialArchivesEnabled,
    type MaterialArchive,
    type MaterialArchiveQuery,
    type MaterialAttributeGroup,
    type MaterialCategory,
    type MaterialCodeRule,
    type MaterialContextOption,
    type MaterialType,
    type UnitOfMeasure
  } from '@/api/mdm'
  import type { ArchiveDialogOpenData } from './modules/archive-dialog.vue'
  import ArchiveDialog from './modules/archive-dialog.vue'
  import CategoryTreePanel from '../category/modules/category-tree-panel.vue'

  defineOptions({ name: 'MdmMaterialArchive' })
  interface DialogExpose {
    handleOpen: (data: ArchiveDialogOpenData) => Promise<void>
  }
  type QueryParams = Omit<MaterialArchiveQuery, 'tenantId'> & Api.Common.PaginationParams
  const { confirmDelete } = useArtFeedback()
  const { deleteGuardRef, inspectDeleteReferences } = useRecordDeleteGuard('mdm_material', '物料')
  const deleteBusy = ref(false)
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const tenantId = computed(() =>
    resolveTenantWorkspaceId(effectiveTenantId.value, userStore.getUserInfo.tenantId)
  )
  const tableRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<DialogExpose>()
  const detailDrawerRef = ref<ArtDrawerExpose<MaterialArchive>>()
  const detailRow = ref<MaterialArchive>()
  const detailTab = ref<'base' | 'business' | 'conversion'>('base')
  const categories = ref<MaterialCategory[]>([])
  const materialTypes = ref<MaterialType[]>([])
  const units = ref<UnitOfMeasure[]>([])
  const attributeGroups = ref<MaterialAttributeGroup[]>([])
  const codeRules = ref<MaterialCodeRule[]>([])
  const storageOptions = ref<MaterialContextOption[]>([])
  const materialGroupOptions = ref<MaterialContextOption[]>([])
  const supplierOptions = ref<MaterialContextOption[]>([])
  const warehouseOptions = ref<MaterialContextOption[]>([])
  const outboundRuleOptions = ref<MaterialContextOption[]>([])
  const supplyRuleOptions = ref<MaterialContextOption[]>([])
  const selectedCategoryId = ref('')
  const optionsLoading = ref(false)
  const optionsError = ref('')
  const overview = reactive({ total: 0, enabled: 0, purchase: 0 })
  const search = reactive({
    keyword: '',
    materialTypeId: undefined as string | undefined,
    status: undefined as 'enabled' | 'disabled' | undefined
  })
  const metrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '物料总数',
      value: overview.total,
      description: '当前租户可见',
      icon: 'ri:archive-drawer-line'
    },
    {
      label: '本页已启用',
      value: overview.enabled,
      description: '当前页可供业务引用',
      icon: 'ri:checkbox-circle-line',
      tone: 'success'
    },
    {
      label: '本页采购物料',
      value: overview.purchase,
      description: '当前页来源为采购',
      icon: 'ri:shopping-bag-3-line',
      tone: 'primary'
    },
    { label: '治理维度', value: 7, description: '跨业务视图', icon: 'ri:apps-2-line', tone: 'info' }
  ])
  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '关键字',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: '编码、名称、规格或物料描述' }
    },
    {
      label: '物料类型',
      key: 'materialTypeId',
      type: 'select',
      props: {
        clearable: true,
        filterable: true,
        options: materialTypes.value.map((item) => ({ label: item.typeName, value: item.id }))
      }
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
  void userStore.ensureDictLoaded('mdmMaterialSpecialPurchaseType')
  const dialogData = (row?: MaterialArchive, copy = false): ArchiveDialogOpenData => ({
    row,
    copy,
    presetCategoryId: !row ? selectedCategoryId.value || undefined : undefined,
    tenantId: row?.tenantId || tenantId.value,
    categories: categories.value,
    materialTypes: materialTypes.value,
    units: units.value,
    attributeGroups: attributeGroups.value,
    codeRules: codeRules.value,
    storageOptions: storageOptions.value,
    materialGroupOptions: materialGroupOptions.value,
    supplierOptions: supplierOptions.value,
    warehouseOptions: warehouseOptions.value,
    outboundRuleOptions: outboundRuleOptions.value,
    supplyRuleOptions: supplyRuleOptions.value
  })
  const openDialog = async (row?: MaterialArchive, copy = false): Promise<void> => {
    await dialogRef.value?.handleOpen(dialogData(row, copy))
  }
  const isMaterialArchiveRecord = (
    value: Record<string, unknown> | undefined
  ): value is Record<string, unknown> & MaterialArchive =>
    Boolean(
      value &&
      typeof value.id === 'string' &&
      typeof value.materialCode === 'string' &&
      typeof value.materialName === 'string'
    )
  const headerActions: ArtTableQueryHeaderAction[] = [
    {
      permission: 'MdmMaterialArchive:Add',
      type: 'add',
      label: '新增物料',
      onClick: () => void openDialog()
    },
    { permission: 'MdmMaterialArchive:Export', type: 'export', label: '导出' },
    {
      permission: 'MdmMaterialArchive:Copy',
      label: '复制',
      icon: 'ri:file-copy-line',
      selectionRequired: true,
      disabled: ({ selectedCount }: ArtTableQueryHeaderActionContext) => selectedCount !== 1,
      onClick: ({ selectedRows }: ArtTableQueryHeaderActionContext) => {
        const selectedRecord = selectedRows[0]
        if (isMaterialArchiveRecord(selectedRecord)) void openDialog(selectedRecord, true)
      }
    },
    {
      permission: 'MdmMaterialArchive:Enable',
      label: '启用',
      icon: 'ri:checkbox-circle-line',
      selectionRequired: true,
      onClick: async ({ selectedRows, api }: ArtTableQueryHeaderActionContext) => {
        await setMaterialArchivesEnabled(
          selectedRows.map((item) => String(item.id)),
          true
        )
        await api.refreshUpdate()
      }
    },
    {
      permission: 'MdmMaterialArchive:Disable',
      label: '停用',
      icon: 'ri:forbid-line',
      selectionRequired: true,
      onClick: async ({ selectedRows, api }: ArtTableQueryHeaderActionContext) => {
        await setMaterialArchivesEnabled(
          selectedRows.map((item) => String(item.id)),
          false
        )
        await api.refreshUpdate()
      }
    },
    {
      permission: 'MdmMaterialArchive:Delete',
      type: 'delete',
      confirm: false,
      disabled: () => deleteBusy.value,
      onClick: async ({ selectedRows }: ArtTableQueryHeaderActionContext) => {
        await removeMaterials(
          selectedRows.map((item) => ({
            id: String(item.id),
            materialName: String(item.materialName),
            materialCode: String(item.materialCode)
          }))
        )
      }
    }
  ]
  const sourceLabel = (value: MaterialArchive['materialSource']): string =>
    ({ purchase: '采购', self_made: '自制', outsourcing: '委外' })[value]
  const valuationLabel = (value?: string | null): string =>
    value
      ? {
          moving_average: '移动平均',
          standard_cost: '标准成本',
          fifo: '先进先出',
          specific: '个别计价'
        }[value] || value
      : '—'
  const unitLabel = (id?: string | null): string =>
    id
      ? units.value.find(
          (item) =>
            item.id === id || item.unitCode === id || item.unitName === id || item.symbol === id
        )?.unitName || '未识别单位'
      : '—'
  const materialTypeLabel = (row: MaterialArchive): string =>
    row.materialTypeRef?.typeName ||
    materialTypes.value.find(
      (item) =>
        item.id === row.materialTypeId ||
        item.typeCode === row.materialType ||
        item.typeName === row.materialType
    )?.typeName ||
    '未识别类型'
  const baseUnitLabel = (row: MaterialArchive): string =>
    row.baseUnit?.unitName || unitLabel(row.baseUnitId || row.basicUnit)
  const formatDateTime = createDateTimeFormatter({ format: 'YYYY-MM-DD HH:mm', emptyText: '—' })
  const detailTypeLabel = computed(() =>
    detailRow.value ? materialTypeLabel(detailRow.value) : '—'
  )
  const detailBaseUnitLabel = computed(() =>
    detailRow.value ? baseUnitLabel(detailRow.value) : '—'
  )
  const detailAttributeGroupLabel = computed(() => {
    const id = detailRow.value?.attributeGroupId
    return id
      ? attributeGroups.value.find((item) => item.id === id)?.groupName || '未识别属性组'
      : '—'
  })
  const detailCompletion = computed(() => {
    if (!detailRow.value) return 0
    const row = detailRow.value
    const values = [
      row.materialCode,
      row.materialName,
      row.categoryId,
      row.materialTypeId,
      row.baseUnitId,
      row.specificationModel,
      row.attributeGroupId,
      row.description,
      row.purchaseUnitId,
      row.inventoryUnitId,
      row.productionUnitId,
      row.costUnitId
    ]
    return Math.round((values.filter(Boolean).length / values.length) * 100)
  })
  const detailBusinessViews = computed(() => {
    const row = detailRow.value
    if (!row) return []
    return [
      {
        title: '采购',
        description: '采购与补货口径',
        icon: 'ri:shopping-bag-3-line',
        items: [
          { label: '采购单位', value: unitLabel(row.purchaseUnitId) },
          { label: '批量策略', value: row.batchPolicy || '—' },
          {
            label: '批量范围',
            value: [row.minBatch, row.maxBatch].filter((value) => value != null).join(' ～ ') || '—'
          }
        ]
      },
      {
        title: '库存',
        description: '仓储执行口径',
        icon: 'ri:stack-line',
        items: [
          { label: '库存单位', value: unitLabel(row.inventoryUnitId) },
          {
            label: '默认库位',
            value:
              storageOptions.value.find((item) => item.id === row.storageLocationId)?.name || '—'
          }
        ]
      },
      {
        title: '生产',
        description: '计划与制造口径',
        icon: 'ri:factory-line',
        items: [
          { label: '生产单位', value: unitLabel(row.productionUnitId) },
          {
            label: 'MRP 类型',
            value:
              (
                { demand: '需求驱动', forecast: '预测驱动', none: '不参与 MRP' } as Record<
                  string,
                  string
                >
              )[row.mrpType || ''] || '—'
          },
          { label: '排产优先级', value: String(row.schedulingPriority ?? 50) },
          {
            label: '排产方向',
            value: (
              { inherit: '继承规则', forward: '正向排产', backward: '反向排产' } as Record<
                string,
                string
              >
            )[row.schedulingStrategy || 'inherit']
          },
          { label: '计划冻结期', value: `${row.planningTimeFenceDays ?? 0} 天` },
          { label: '批量圆整', value: row.batchRoundingQuantity ?? '—' }
        ]
      },
      {
        title: '财务',
        description: '成本与存货核算',
        icon: 'ri:bank-card-line',
        items: [
          { label: '成本单位', value: unitLabel(row.costUnitId) },
          { label: '计价方法', value: valuationLabel(row.valuationMethod) },
          { label: '币种', value: row.currencyCode || 'CNY' }
        ]
      }
    ]
  })
  const identity = (row: MaterialArchive) => (
    <div class="material-archive-page__identity">
      <span aria-hidden="true">
        <ArtSvgIcon icon="ri:archive-drawer-line" />
      </span>
      <span>
        <strong title={row.materialName}>{row.materialName}</strong>
        <small title={row.materialCode}>
          {[row.materialCode, row.specificationModel].filter(Boolean).join(' · ')}
        </small>
      </span>
    </div>
  )
  const attributeSummary = (row: MaterialArchive) => {
    const definitions =
      attributeGroups.value.find((item) => item.id === row.attributeGroupId)?.attributes ?? []
    const labels = new Map(definitions.map((item) => [item.key, item.name]))
    const entries = Object.entries(row.attributeValues ?? {}).filter(([, value]) => Boolean(value))
    if (!entries.length) return <span class="material-archive-page__empty-cell">—</span>
    return (
      <div
        class="material-archive-page__attributes"
        title={entries.map(([key, value]) => `${labels.get(key) || key}: ${value}`).join('；')}
      >
        {entries.slice(0, 4).map(([key, value]) => (
          <span key={key}>
            <b>{labels.get(key) || key}</b>
            <em>{value}</em>
          </span>
        ))}
        {entries.length > 4 ? <small>+{entries.length - 4}</small> : null}
      </div>
    )
  }
  const showDetail = async (row: MaterialArchive): Promise<void> => {
    detailRow.value = row
    detailTab.value = 'base'
    await nextTick()
    await detailDrawerRef.value?.handleOpen(row, {
      contentHeight: 'calc(100vh - 86px)',
      showFooter: false
    })
  }
  const columnsFactory = (): ColumnOption<MaterialArchive>[] => [
    { type: 'selection', width: 48 },
    { type: 'globalIndex', label: '序号', width: 72, fixed: 'left' },
    {
      prop: 'imageUrls',
      label: '图片',
      width: 76,
      formatter: (row) =>
        row.imageUrls?.[0] ? (
          <ElImage
            class="material-archive-page__image"
            src={row.imageUrls[0]}
            previewSrcList={row.imageUrls}
            previewTeleported
            fit="cover"
            aria-label={`${row.materialName}图片`}
          />
        ) : (
          <span class="material-archive-page__image material-archive-page__image--empty">
            <ArtSvgIcon icon="ri:image-line" />
          </span>
        )
    },
    {
      prop: 'materialName',
      label: '物料主身份',
      minWidth: 280,
      fixed: 'left',
      formatter: identity,
      link: { permission: 'MdmMaterialArchive:View', onClick: showDetail }
    },
    {
      prop: 'categoryId',
      label: '分类',
      minWidth: 180,
      formatter: (row) => (
        <div class="material-archive-page__classification">
          <strong>{row.category?.categoryName || '未分类'}</strong>
          <small>{materialTypeLabel(row)}</small>
        </div>
      )
    },
    { prop: 'description', label: '物料描述', minWidth: 240, showOverflowTooltip: true },
    { prop: 'materialTypeId', label: '物料类型', minWidth: 130, formatter: materialTypeLabel },
    {
      prop: 'specialPurchaseType',
      label: '特殊采购类',
      width: 120,
      dict: { code: 'mdmMaterialSpecialPurchaseType', display: 'tag' }
    },
    { prop: 'drawingNo', label: '图号', minWidth: 130, showOverflowTooltip: true },
    { prop: 'materialComposition', label: '材质', minWidth: 120, showOverflowTooltip: true },
    { prop: 'brand', label: '品牌', minWidth: 110, showOverflowTooltip: true },
    { prop: 'color', label: '颜色', minWidth: 100, showOverflowTooltip: true },
    {
      prop: 'basicUnit',
      label: '基本单位',
      width: 110,
      formatter: (row) => baseUnitLabel(row)
    },
    {
      prop: 'materialSource',
      label: '物料来源',
      width: 108,
      formatter: (row) => (
        <ElTag
          effect="plain"
          type={
            row.materialSource === 'self_made'
              ? 'success'
              : row.materialSource === 'outsourcing'
                ? 'warning'
                : 'primary'
          }
        >
          {sourceLabel(row.materialSource)}
        </ElTag>
      )
    },
    {
      prop: 'auxiliaryUnitId',
      label: '辅助单位',
      minWidth: 112,
      formatter: (row) => row.auxiliaryUnit?.unitName || unitLabel(row.auxiliaryUnitId)
    },
    {
      prop: 'auxiliaryUnit2Id',
      label: '辅助单位(2)',
      minWidth: 124,
      formatter: (row) => row.auxiliaryUnit2?.unitName || unitLabel(row.auxiliaryUnit2Id)
    },
    {
      prop: 'attributeGroupId',
      label: '属性组',
      minWidth: 120,
      formatter: (row) => row.attributeGroup?.groupName || '—'
    },
    { prop: 'attributeValues', label: '属性', minWidth: 360, formatter: attributeSummary },
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
      formatter: (row) => formatDateTime(row.updateTime)
    },
    {
      prop: 'operation',
      label: '操作',
      width: 176,
      fixed: 'right',
      formatter: (row) => (
        <div class="material-archive-page__actions">
          <ArtButtonTable
            permission="MdmMaterialArchive:View"
            type="view"
            onClick={() => void showDetail(row)}
          />
          <ArtButtonTable
            permission="MdmMaterialArchive:Edit"
            type="edit"
            onClick={() => void openDialog(row)}
          />
          <ArtButtonMore
            list={[
              {
                key: 'copy',
                label: '复制物料',
                icon: 'ri:file-copy-line',
                auth: 'MdmMaterialArchive:Copy'
              },
              {
                key: 'delete',
                label: '删除',
                icon: 'ri:delete-bin-6-line',
                color: 'var(--el-color-danger)',
                auth: 'MdmMaterialArchive:Delete'
              }
            ]}
            onClick={(item) =>
              item.key === 'copy' ? void openDialog(row, true) : void removeMaterial(row)
            }
          />
        </div>
      )
    }
  ]
  const removeMaterials = async (
    rows: Array<Pick<MaterialArchive, 'id' | 'materialName' | 'materialCode'>>
  ): Promise<void> => {
    if (deleteBusy.value || !rows.length) return
    deleteBusy.value = true
    const resources = rows.map((row) => ({
      id: row.id,
      label: `${row.materialName} · ${row.materialCode}`
    }))
    try {
      if (await inspectDeleteReferences(resources)) return
      await confirmDelete(
        rows.length === 1
          ? `确定删除物料“${rows[0].materialName}”吗？`
          : `确定删除选中的 ${rows.length} 条物料档案吗？`
      )
      await deleteMaterialArchives(rows.map((row) => row.id))
      await tableRef.value?.refreshRemove()
    } catch (cause) {
      if (cause !== 'cancel' && cause !== 'close') {
        ElMessage.error(getFriendlySupabaseErrorMessage(cause, '物料删除失败，请重试'))
      }
    } finally {
      deleteBusy.value = false
    }
  }
  const removeMaterial = (row: MaterialArchive): Promise<void> => removeMaterials([row])
  const descendantCategoryIds = (id: string): string[] => {
    const ids = new Set<string>([id])
    let changed = true
    while (changed) {
      changed = false
      categories.value.forEach((item) => {
        if (item.parentId && ids.has(item.parentId) && !ids.has(item.id)) {
          ids.add(item.id)
          changed = true
        }
      })
    }
    return [...ids]
  }
  const selectCategory = async (id: string): Promise<void> => {
    selectedCategoryId.value = id
    await tableRef.value?.getData()
  }
  const loadOptions = async (): Promise<void> => {
    optionsLoading.value = true
    optionsError.value = ''
    try {
      const [categoryRows, typeRows, unitRows, groupRows, ruleRows] = await Promise.all([
        fetchMaterialCategories(tenantId.value),
        fetchMaterialReferenceOptions<MaterialType>('material-type', tenantId.value),
        fetchMaterialReferenceOptions<UnitOfMeasure>('unit-of-measure', tenantId.value),
        fetchMaterialReferenceOptions<MaterialAttributeGroup>('attribute-group', tenantId.value),
        fetchMaterialReferenceOptions<MaterialCodeRule>('code-rule', tenantId.value)
      ])
      const [locationRows, masterGroupRows, supplierRows, warehouseRows, outboundRows, supplyRows] =
        await Promise.all([
          fetchMaterialStorageOptions(tenantId.value).catch(() => []),
          fetchMaterialGroupOptions(tenantId.value).catch(() => []),
          fetchMaterialSupplierOptions(tenantId.value).catch(() => []),
          fetchMaterialWarehouseOptions(tenantId.value).catch(() => []),
          fetchMaterialOutboundRuleOptions(tenantId.value).catch(() => []),
          fetchMaterialSupplyRuleOptions(tenantId.value).catch(() => [])
        ])
      categories.value = categoryRows
      materialTypes.value = typeRows
      units.value = unitRows
      attributeGroups.value = groupRows
      codeRules.value = ruleRows
      storageOptions.value = locationRows
      materialGroupOptions.value = masterGroupRows
      supplierOptions.value = supplierRows
      warehouseOptions.value = warehouseRows
      outboundRuleOptions.value = outboundRows
      supplyRuleOptions.value = supplyRows
    } catch (error) {
      optionsError.value = getFriendlySupabaseErrorMessage(error, '物料选项加载失败')
    } finally {
      optionsLoading.value = false
    }
  }
  const fetchData = async (params: QueryParams) => {
    if (!categories.value.length && tenantId.value) await loadOptions()
    const result = await fetchMaterialArchives({
      ...params,
      tenantId: tenantId.value,
      categoryIds: selectedCategoryId.value
        ? descendantCategoryIds(selectedCategoryId.value)
        : undefined
    })
    overview.total = result.total
    overview.enabled = result.data.filter((item) => item.status === 'enabled').length
    overview.purchase = result.data.filter((item) => item.materialSource === 'purchase').length
    return { records: result.data, total: result.total }
  }
  const refresh = async (): Promise<void> => {
    await tableRef.value?.getData()
  }
</script>

<style scoped lang="scss">
  .material-archive-page {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 0;
  }

  .material-archive-page__workspace {
    display: grid;
    flex: 1;
    grid-template-columns: minmax(260px, 300px) minmax(0, 1fr);
    gap: 14px;
    min-height: 0;
    overflow: hidden;
  }

  .material-archive-page__table {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .material-archive-page__table > :deep(.art-table-query) {
    flex: 1 1 0;
    height: 100%;
    min-height: 0;
  }

  :deep(.material-archive-page__image) {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    overflow: hidden;
    color: var(--el-text-color-placeholder);
    background: var(--el-fill-color-lighter);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--el-border-radius-base);
  }

  :deep(.material-archive-page__attributes) {
    display: flex;
    gap: 5px;
    align-items: center;
    overflow: hidden;
    white-space: nowrap;
  }

  :deep(.material-archive-page__attributes > span) {
    display: inline-flex;
    overflow: hidden;
    border: 1px solid var(--el-border-color);
    border-radius: var(--el-border-radius-small);
  }

  :deep(.material-archive-page__attributes b),
  :deep(.material-archive-page__attributes em) {
    padding: 2px 6px;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 11px;
    font-style: normal;
    font-weight: 500;
  }

  :deep(.material-archive-page__attributes b) {
    color: var(--el-text-color-secondary);
    background: var(--el-fill-color);
  }

  :deep(.material-archive-page__attributes em) {
    max-width: 92px;
    color: var(--el-text-color-primary);
    background: var(--el-bg-color);
  }

  :deep(.material-archive-page__attributes small) {
    color: var(--theme-color);
  }

  :deep(.material-archive-page__empty-cell) {
    color: var(--el-text-color-placeholder);
  }

  :deep(.material-archive-page__identity) {
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    min-width: 0;
  }

  :deep(.material-archive-page__identity > span:first-child) {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    color: var(--theme-color);
    background: color-mix(in srgb, var(--theme-color) 9%, var(--el-bg-color));
    border: 1px solid color-mix(in srgb, var(--theme-color) 12%, transparent);
    border-radius: 10px;
  }

  :deep(.material-archive-page__identity > span:last-child) {
    display: grid;
    min-width: 0;
  }

  :deep(.material-archive-page__identity strong),
  :deep(.material-archive-page__identity small) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :deep(.material-archive-page__identity small) {
    margin-top: 3px;
    font-family: var(--art-font-family-mono, Consolas, monospace);
    font-size: 11px;
    color: var(--el-text-color-secondary);
  }

  :deep(.material-archive-page__classification) {
    display: grid;
    min-width: 0;
  }

  :deep(.material-archive-page__classification strong),
  :deep(.material-archive-page__classification small) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :deep(.material-archive-page__classification strong) {
    font-size: 13px;
    font-weight: 600;
  }

  :deep(.material-archive-page__classification small) {
    margin-top: 2px;
    color: var(--el-text-color-secondary);
  }

  :deep(.material-archive-page__actions) {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .material-detail {
    display: grid;
    gap: 18px;
  }

  .material-detail__hero {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 14px;
    align-items: center;
    padding: 18px;
    background: color-mix(in srgb, var(--theme-color) 7%, var(--el-bg-color));
    border: 1px solid color-mix(in srgb, var(--theme-color) 16%, var(--el-border-color-lighter));
    border-radius: var(--el-border-radius-base);
  }

  .material-detail__hero > span {
    display: grid;
    place-items: center;
    width: 54px;
    height: 54px;
    font-size: 24px;
    color: var(--theme-color);
    background: var(--el-bg-color);
    border-radius: 14px;
  }

  .material-detail__state {
    display: grid;
    grid-template-columns: auto auto;
    gap: 3px 8px;
    place-items: center end;
  }

  .material-detail__state .el-tag {
    grid-column: 1 / -1;
  }

  .material-detail__state small {
    font-size: 10px;
    color: var(--el-text-color-secondary);
  }

  .material-detail__state strong {
    font-variant-numeric: tabular-nums;
    color: var(--theme-color);
  }

  .material-detail__hero small,
  .material-detail__hero h2,
  .material-detail__hero p {
    margin: 0;
  }

  .material-detail__hero small {
    font-size: 10px;
    color: var(--theme-color);
    letter-spacing: 0.08em;
  }

  .material-detail__hero h2 {
    margin-top: 3px;
    font-size: 19px;
  }

  .material-detail__hero p {
    margin-top: 4px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  .material-detail__summary-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    overflow: hidden;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--el-border-radius-base);
  }

  .material-detail__summary-grid > div {
    display: grid;
    gap: 4px;
    min-width: 0;
    padding: 12px 14px;
  }

  .material-detail__summary-grid > div + div {
    border-left: 1px solid var(--el-border-color-lighter);
  }

  .material-detail__summary-grid small,
  .material-detail__summary-grid strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .material-detail__summary-grid small,
  .material-detail__section header small,
  .material-detail__business-card header small {
    font-size: 11px;
    color: var(--el-text-color-secondary);
  }

  .material-detail__tabs :deep(.el-tabs__header) {
    margin-bottom: 12px;
  }

  .material-detail__tabs :deep(.el-tab-pane) {
    display: grid;
    gap: 12px;
  }

  .material-detail__section,
  .material-detail__business-card {
    padding: 14px;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--el-border-radius-base);
  }

  .material-detail__section--governance {
    background: color-mix(in srgb, var(--el-fill-color-lighter) 56%, transparent);
  }

  .material-detail__section > header,
  .material-detail__business-card > header {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    margin-bottom: 12px;
  }

  .material-detail__section > header > span,
  .material-detail__business-card > header > span {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    color: var(--theme-color);
    background: color-mix(in srgb, var(--theme-color) 8%, var(--el-bg-color));
    border-radius: 9px;
  }

  .material-detail__section header strong,
  .material-detail__section header small,
  .material-detail__business-card header strong,
  .material-detail__business-card header small {
    display: block;
  }

  .material-detail__business-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .material-detail__business-card dl {
    display: grid;
    grid-template-columns: minmax(74px, auto) minmax(0, 1fr);
    gap: 8px 12px;
    margin: 0;
    font-size: 12px;
  }

  .material-detail__business-card dt {
    color: var(--el-text-color-secondary);
  }

  .material-detail__business-card dd {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 600;
    white-space: nowrap;
  }

  .material-detail__conversions {
    display: grid;
    gap: 8px;
  }

  .material-detail__conversions > div {
    display: grid;
    grid-template-columns: minmax(90px, 0.6fr) minmax(180px, 1fr) minmax(100px, 0.6fr);
    gap: 12px;
    align-items: center;
    padding: 10px 12px;
    background: var(--el-fill-color-lighter);
    border-radius: 8px;
  }

  .material-detail__conversions small {
    color: var(--el-text-color-secondary);
  }

  @media (width <= 620px) {
    .material-archive-page__workspace {
      grid-template-columns: 1fr;
    }

    .material-archive-page__workspace > :first-child {
      max-height: 300px;
    }

    .material-detail__hero {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .material-detail__state {
      grid-template-columns: auto 1fr auto;
      grid-column: 1 / -1;
      justify-items: start;
      width: 100%;
    }

    .material-detail__state .el-tag {
      grid-column: auto;
    }

    .material-detail__summary-grid,
    .material-detail__business-grid {
      grid-template-columns: 1fr;
    }

    .material-detail__summary-grid > div + div {
      border-top: 1px solid var(--el-border-color-lighter);
      border-left: 0;
    }

    .material-detail__conversions > div {
      grid-template-columns: 1fr;
      gap: 4px;
    }
  }
</style>

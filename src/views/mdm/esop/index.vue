<template>
  <ArtPermissionGuard permission="MdmEsop:View" resource-name="ESOP">
    <div class="esop-page business-workspace-page art-full-height">
      <BusinessWorkspaceHeader
        eyebrow="CONTROLLED WORK INSTRUCTION"
        title="ESOP"
        description="统一管理电子标准作业指导书，并将当前有效版本准确关联到产品与工艺路线。"
        icon="ri:file-shield-2-line"
        :tags="[
          { label: '版本受控', type: 'primary' },
          { label: '产品与工艺关联', type: 'success' },
          { label: '租户隔离', type: 'info' }
        ]"
        :metrics="metrics"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
      </BusinessWorkspaceHeader>

      <section class="esop-page__workspace">
        <ArtWorkspaceSplitter
          primary-size="256px"
          primary-min="224px"
          primary-max="360px"
          :breakpoint="900"
          stacked-primary-size="300px"
        >
          <template #primary>
            <aside class="esop-page__catalog art-card-xs" aria-label="ESOP 文档分类">
              <header>
                <div>
                  <span>ESOP LIBRARY</span>
                  <strong>文档分类</strong>
                  <small>按业务用途组织</small>
                </div>
                <div class="esop-page__catalog-actions">
                  <ArtIconButton
                    icon="ri:add-line"
                    label="新增文档分类"
                    permission="MdmEsop:Add"
                    @click="openCategoryDialog()"
                  />
                  <ArtIconButton
                    icon="ri:edit-line"
                    label="编辑选中分类"
                    permission="MdmEsop:Edit"
                    :disabled="!selectedCategory"
                    @click="openCategoryDialog(selectedCategory)"
                  />
                  <ArtIconButton
                    icon="ri:delete-bin-6-line"
                    label="删除选中分类"
                    tone="danger"
                    permission="MdmEsop:Delete"
                    :disabled="!selectedCategory"
                    @click="removeCategory"
                  />
                </div>
              </header>
              <ElInput
                v-model="categoryKeyword"
                clearable
                placeholder="搜索分类"
                :prefix-icon="Search"
                :disabled="!categories.length"
                class="esop-page__catalog-search"
              />
              <button
                type="button"
                class="esop-page__all-category"
                :class="{ 'is-active': !selectedCategoryId }"
                @click="selectCategory()"
              >
                <span><ArtSvgIcon icon="ri:folder-open-line" />全部文档</span>
                <strong>{{ overview.total }}</strong>
              </button>
              <ArtAsyncState
                :loading="loadingOptions"
                :error="optionsError"
                error-title="文档分类加载失败"
                :empty="!categoryTree.length"
                empty-text="尚未建立文档分类"
                empty-description="先创建一个分类，再登记受控 ESOP 文档。"
                :empty-image-size="70"
                :min-height="180"
                size="compact"
                full-height
                class="esop-page__catalog-state"
                @retry="loadOptions"
              >
                <template #empty-action>
                  <ElButton
                    v-auth="'MdmEsop:Add'"
                    type="primary"
                    plain
                    @click="openCategoryDialog()"
                  >
                    <ArtSvgIcon icon="ri:add-line" />新建分类
                  </ElButton>
                </template>
                <ElScrollbar class="esop-page__category-scrollbar">
                  <ElTree
                    ref="categoryTreeRef"
                    :data="categoryTree"
                    node-key="id"
                    :props="categoryTreeProps"
                    :filter-node-method="filterCategory"
                    :expand-on-click-node="false"
                    default-expand-all
                    highlight-current
                    class="esop-page__category-tree"
                    @node-click="handleCategoryClick"
                  >
                    <template #default="{ data }">
                      <span class="esop-page__tree-node">
                        <span>
                          <ArtSvgIcon
                            :icon="data.children?.length ? 'ri:folder-3-line' : 'ri:folder-line'"
                          />
                          <span>{{ data.categoryName }}</span>
                        </span>
                        <i v-if="data.status === 'disabled'">停用</i>
                      </span>
                    </template>
                    <template #empty>
                      <ArtEmptyState
                        title="未找到匹配分类"
                        description="请更换关键词或清空搜索条件。"
                        size="compact"
                        :visual-size="64"
                      />
                    </template>
                  </ElTree>
                </ElScrollbar>
              </ArtAsyncState>
            </aside>
          </template>

          <main class="esop-page__results">
            <div class="esop-page__scope-bar art-card-xs">
              <div>
                <span><ArtSvgIcon icon="ri:focus-3-line" /></span>
                <div>
                  <small>当前文档范围</small>
                  <strong>{{ selectedCategory?.categoryName || '全部文档' }}</strong>
                  <p>{{ selectedCategoryPath }}</p>
                </div>
              </div>
              <div class="esop-page__scope-meta">
                <span>{{ overview.total }} 份文档</span>
                <ElTag v-if="selectedCategory" effect="plain" round>包含下级分类</ElTag>
              </div>
            </div>
            <ArtTableQuery
              ref="tableRef"
              v-model="search"
              :api-fn="fetchData"
              :search-items="searchItems"
              :columns-factory="columnsFactory"
              :header-actions="headerActions"
              header-actions-placement="workspace"
              :search-bar-props="{ span: 6, labelWidth: 80, showExpand: false, isExpand: true }"
              :table-props="{
                rowKey: 'id',
                tableLayout: 'fixed',
                emptyText: '暂无 ESOP 文档',
                emptyDescription: selectedCategory
                  ? '当前分类暂无文档，可新增或切换到全部文档。'
                  : '新增第一份受控作业指导书，并维护产品与工艺适用范围。'
              }"
              :on-success="handleTableSuccess"
              focusable
            />
          </main>
        </ArtWorkspaceSplitter>
      </section>

      <EsopCategoryDialog ref="categoryDialogRef" @success="handleCategorySaved" />
      <EsopDocumentDialog ref="documentDialogRef" @success="refresh" />
      <ArtDrawer
        ref="detailDrawerRef"
        title="ESOP 文档详情"
        subtitle="受控附件、版本与业务适用范围"
        size="lg"
        :show-footer="false"
      >
        <div v-if="detailRow" class="esop-detail">
          <div class="esop-detail__hero">
            <span><ArtSvgIcon icon="ri:file-shield-2-line" /></span>
            <div>
              <small>{{ detailRow.documentCode }} · {{ detailRow.versionNo }}</small>
              <h2>{{ detailRow.documentName }}</h2>
              <p>{{ detailRow.category?.categoryName || '未分类' }}</p>
            </div>
            <ArtDictDisplay dict-code="commonEnabledStatus" :value="detailRow.status" />
          </div>
          <div class="esop-detail__summary">
            <div
              ><small>上传时间</small
              ><strong>{{ formatDateTime(detailRow.uploadTime) }}</strong></div
            >
            <div
              ><small>生效日期</small
              ><strong>{{ formatDate(detailRow.effectiveDate) }}</strong></div
            >
            <div
              ><small>适用对象</small><strong>{{ detailRow.bindings.length }} 项</strong></div
            >
          </div>
          <section class="esop-detail__section">
            <header>
              <span><ArtSvgIcon icon="ri:attachment-2" /></span>
              <div><strong>受控附件</strong><small>预览或下载当前版本文件</small></div>
            </header>
            <div class="esop-detail__attachment">
              <span><ArtSvgIcon :icon="fileIcon(detailRow.attachmentType)" /></span>
              <div>
                <strong>{{ detailRow.attachmentName }}</strong>
                <small>{{ attachmentMeta(detailRow) }}</small>
              </div>
              <ElButton type="primary" plain @click="previewDocument(detailRow)">
                <ArtSvgIcon icon="ri:eye-line" />预览文档
              </ElButton>
            </div>
          </section>
          <section class="esop-detail__section">
            <header>
              <span><ArtSvgIcon icon="ri:git-branch-line" /></span>
              <div><strong>适用范围</strong><small>生产任务调用边界</small></div>
            </header>
            <div
              v-if="detailMaterials.length || detailRoutes.length"
              class="esop-detail__scope-grid"
            >
              <div>
                <h3
                  >产品 / 物料 <span>{{ detailMaterials.length }}</span></h3
                >
                <ul>
                  <li v-for="item in detailMaterials" :key="item.id">
                    <strong>{{ item.materialName }}</strong
                    ><small>{{ item.materialCode }}</small>
                  </li>
                </ul>
              </div>
              <div>
                <h3
                  >工艺路线 <span>{{ detailRoutes.length }}</span></h3
                >
                <ul>
                  <li v-for="item in detailRoutes" :key="item.id">
                    <strong>{{ item.name }}</strong>
                    <small>{{ item.material?.materialName || '关联产品待识别' }}</small>
                  </li>
                </ul>
              </div>
            </div>
            <ArtEmptyState
              v-else
              title="暂未限定适用范围"
              description="该文档尚未关联具体产品或工艺路线。"
              size="compact"
              :visual-size="70"
            />
          </section>
          <section class="esop-detail__section esop-detail__section--audit">
            <header>
              <span><ArtSvgIcon icon="ri:history-line" /></span>
              <div><strong>版本与审计</strong><small>最近一次维护记录</small></div>
            </header>
            <ArtDescriptions
              :data="detailRow"
              :columns="2"
              :items="[
                { key: 'versionNo', label: '当前版本', field: 'versionNo' },
                { key: 'createBy', label: '创建人', field: 'createBy' },
                {
                  key: 'createTime',
                  label: '创建时间',
                  value: formatDateTime(detailRow.createTime)
                },
                { key: 'updateBy', label: '最近维护人', field: 'updateBy' },
                {
                  key: 'updateTime',
                  label: '最近更新',
                  value: formatDateTime(detailRow.updateTime)
                },
                { key: 'description', label: '文档说明', field: 'description', span: 2 }
              ]"
              empty-text="—"
            />
          </section>
        </div>
      </ArtDrawer>
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { createDateTimeFormatter } from '@/utils/ui/format'

  import { Search } from '@element-plus/icons-vue'
  import { ElMessage, ElTag, type TreeNodeData } from 'element-plus'
  import type { ColumnOption } from '@/types'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import { exportExcel, viewAttachment } from '@/utils/file'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import TreeUtils from '@/utils/tree'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtButtonMore, {
    type ButtonMoreItem
  } from '@/components/core/forms/art-button-more/index.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtWorkspaceSplitter from '@/components/core/layouts/art-workspace-splitter/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric
  } from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction,
    ArtTableQueryHeaderActionContext,
    ArtTableQueryProps
  } from '@/components/core/tables/art-table-query/index.vue'
  import {
    deleteEsopCategory,
    deleteEsopDocuments,
    fetchEsopCategories,
    fetchEsopDocuments,
    fetchEsopReferenceOptions,
    saveEsopDocument,
    setEsopDocumentsEnabled,
    type EsopCategory,
    type EsopDocument,
    type EsopDocumentInput,
    type EsopDocumentQuery,
    type EsopReferenceOptions
  } from '@/api/mdm'
  import EsopCategoryDialog, {
    type EsopCategoryDialogOpenData
  } from './modules/category-dialog.vue'
  import EsopDocumentDialog, {
    type EsopDocumentDialogMode,
    type EsopDocumentDialogOpenData
  } from './modules/document-dialog.vue'

  defineOptions({ name: 'MdmEsop' })
  type SearchModel = Omit<EsopDocumentQuery, 'tenantId' | 'categoryIds' | 'current' | 'size'>
  type QueryParams = SearchModel & Api.Common.PaginationParams
  interface CategoryTreeExpose {
    filter: (value: string) => void
    setCurrentKey: (key?: string) => void
  }
  interface CategoryDialogExpose {
    handleOpen: (data: EsopCategoryDialogOpenData) => Promise<void>
  }
  interface DocumentDialogExpose {
    handleOpen: (data: EsopDocumentDialogOpenData) => Promise<void>
  }

  const { confirmAction } = useArtFeedback()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const { effectiveTenantId, tenantOptions } = storeToRefs(useTenantScopeStore())
  const tenantId = computed(() => effectiveTenantId.value ?? '')
  const tableRef = ref<ArtTableQueryExpose>()
  const categoryTreeRef = ref<CategoryTreeExpose>()
  const categoryDialogRef = ref<CategoryDialogExpose>()
  const documentDialogRef = ref<DocumentDialogExpose>()
  const detailDrawerRef = ref<ArtDrawerExpose<EsopDocument>>()
  const detailRow = ref<EsopDocument>()
  const categories = ref<EsopCategory[]>([])
  const references = ref<EsopReferenceOptions>({ materials: [], routes: [] })
  const selectedCategoryId = ref<string>()
  const categoryKeyword = ref('')
  const loadingOptions = ref(false)
  const optionsError = ref<Error | null>(null)
  const optionsLoaded = ref(false)
  const overview = reactive({ total: 0, rows: [] as EsopDocument[] })
  const search = reactive<SearchModel>({
    keyword: '',
    status: undefined,
    uploadDateRange: undefined
  })
  const categoryTreeProps = { label: 'categoryName', children: 'children' }
  const categoryTreeUtils = new TreeUtils({
    idKey: 'id',
    parentKey: 'parentId',
    childrenKey: 'children',
    deepClone: false
  })
  const compareCategories = (a: EsopCategory, b: EsopCategory): number =>
    a.sort - b.sort || a.categoryName.localeCompare(b.categoryName, 'zh-CN')
  const categoryTree = computed(() =>
    categoryTreeUtils.listToTree(categories.value, compareCategories)
  )
  const selectedCategory = computed(() =>
    categories.value.find((item) => item.id === selectedCategoryId.value)
  )
  const selectedCategoryIds = computed(() => {
    if (!selectedCategoryId.value) return []
    return categoryTreeUtils
      .getDescendants(categoryTree.value, selectedCategoryId.value, true)
      .map((item) => item.id)
  })
  const selectedCategoryPath = computed(() => {
    if (!selectedCategoryId.value) return '覆盖当前查询范围内的全部分类'
    return categoryTreeUtils
      .getAncestors(categoryTree.value, selectedCategoryId.value)
      .map((item) => item.categoryName)
      .join(' / ')
  })
  const metrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: 'ESOP 总数',
      value: overview.total,
      description: '当前分类范围',
      icon: 'ri:file-list-3-line'
    },
    {
      label: '本页已启用',
      value: overview.rows.filter((row) => row.status === 'enabled').length,
      description: '可供生产任务调用',
      icon: 'ri:checkbox-circle-line',
      tone: 'success'
    },
    {
      label: '本页已关联',
      value: overview.rows.filter((row) => row.bindings.length > 0).length,
      description: '已定义业务适用范围',
      icon: 'ri:git-branch-line',
      tone: 'info'
    },
    {
      label: '文档分类',
      value: categories.value.length,
      description: '层级分类节点',
      icon: 'ri:folder-3-line',
      tone: 'warning'
    }
  ])
  const searchItems = computed<SearchFormItem[]>(() => [
    {
      key: 'keyword',
      label: '关键字',
      type: 'input',
      props: { clearable: true, placeholder: '文档编号、名称或附件名' }
    },
    {
      key: 'uploadDateRange',
      label: '上传日期',
      type: 'daterange',
      props: { valueFormat: 'YYYY-MM-DD', startPlaceholder: '开始日期', endPlaceholder: '结束日期' }
    },
    {
      key: 'status',
      label: '状态',
      type: 'select',
      props: {
        clearable: true,
        options: getDictMap.value.commonEnabledStatus ?? []
      }
    }
  ])
  void userStore.ensureDictLoaded('commonEnabledStatus')
  const loadOptions = async (): Promise<void> => {
    loadingOptions.value = true
    optionsError.value = null
    try {
      const [categoryRows, referenceRows] = await Promise.all([
        fetchEsopCategories(tenantId.value),
        fetchEsopReferenceOptions(tenantId.value)
      ])
      categories.value = categoryRows
      references.value = referenceRows
      optionsLoaded.value = true
    } catch (error) {
      optionsLoaded.value = false
      optionsError.value = error instanceof Error ? error : new Error('ESOP 基础数据加载失败')
      throw error
    } finally {
      loadingOptions.value = false
    }
  }
  const fetchData = async (params: QueryParams, options?: { signal?: AbortSignal }) => {
    if (!optionsLoaded.value) await loadOptions()
    return fetchEsopDocuments(
      {
        ...params,
        tenantId: tenantId.value,
        categoryIds: selectedCategoryIds.value.length ? selectedCategoryIds.value : undefined
      },
      options
    )
  }
  const handleTableSuccess: ArtTableQueryProps['onSuccess'] = (rows, response) => {
    overview.rows = rows as EsopDocument[]
    overview.total = Number(response.total ?? rows.length)
  }
  const refresh = async (): Promise<void> => {
    await loadOptions()
    await tableRef.value?.refreshData()
  }
  const selectCategory = async (id?: string): Promise<void> => {
    selectedCategoryId.value = id
    categoryTreeRef.value?.setCurrentKey(id)
    await nextTick()
    await tableRef.value?.refreshData()
  }
  const handleCategoryClick = (data: EsopCategory): void => {
    void selectCategory(data.id)
  }
  const filterCategory = (value: string, data: TreeNodeData): boolean => {
    const category = data as EsopCategory
    return (
      !value ||
      `${category.categoryCode} ${category.categoryName}`
        .toLowerCase()
        .includes(value.toLowerCase())
    )
  }
  watch(categoryKeyword, (value) => categoryTreeRef.value?.filter(value))
  const openCategoryDialog = (row?: EsopCategory): void => {
    void categoryDialogRef.value?.handleOpen({
      row,
      parentId: row ? undefined : selectedCategoryId.value,
      categories: categoryTree.value,
      tenantId: row?.tenantId || selectedCategory.value?.tenantId || tenantId.value,
      tenantOptions: tenantOptions.value.map((tenant) => ({
        label: tenant.tenantName || tenant.tenantCode,
        value: tenant.id
      }))
    })
  }
  const handleCategorySaved = async (): Promise<void> => {
    await loadOptions()
    await tableRef.value?.refreshData()
  }
  const removeCategory = async (): Promise<void> => {
    if (!selectedCategory.value) return
    await confirmAction(
      `确定删除分类“${selectedCategory.value.categoryName}”吗？仅空分类可以删除。`,
      '删除文档分类',
      { type: 'warning' }
    )
    await deleteEsopCategory(selectedCategory.value.id)
    selectedCategoryId.value = undefined
    await handleCategorySaved()
  }
  const openDocumentDialog = (mode: EsopDocumentDialogMode, row?: EsopDocument): void => {
    if (mode === 'add' && !categories.value.length) {
      ElMessage.warning('请先创建文档分类，再新增 ESOP 文档')
      openCategoryDialog()
      return
    }
    void documentDialogRef.value?.handleOpen({
      mode,
      row,
      categoryId: selectedCategoryId.value,
      categories: categoryTree.value,
      references: references.value,
      tenantId: row?.tenantId || selectedCategory.value?.tenantId || tenantId.value,
      tenantOptions: tenantOptions.value.map((tenant) => ({
        label: tenant.tenantName || tenant.tenantCode,
        value: tenant.id
      }))
    })
  }
  const formatDateTime = createDateTimeFormatter({ format: 'YYYY-MM-DD HH:mm', emptyText: '—' })
  const formatDate = createDateTimeFormatter({ format: 'YYYY-MM-DD', emptyText: '—' })
  const formatSize = (value?: number | null): string => {
    if (value == null) return '大小未知'
    if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
    return `${Math.max(1, Math.ceil(value / 1024))} KB`
  }
  const fileIcon = (type?: string | null): string => {
    const value = String(type || '').toLowerCase()
    if (value.includes('pdf')) return 'ri:file-pdf-2-line'
    if (value.includes('doc')) return 'ri:file-word-2-line'
    if (value.includes('xls')) return 'ri:file-excel-2-line'
    if (value.includes('ppt')) return 'ri:file-ppt-2-line'
    if (value.includes('image')) return 'ri:image-line'
    return 'ri:file-text-line'
  }
  const attachmentMeta = (row: EsopDocument): string =>
    [String(row.attachmentType || '').toUpperCase(), formatSize(row.attachmentSize)]
      .filter(Boolean)
      .join(' · ')
  const previewDocument = (row: EsopDocument): void => {
    viewAttachment({
      name: row.attachmentName,
      url: row.attachmentUrl,
      fileType: row.attachmentType || undefined
    })
  }
  const showDetail = async (row: EsopDocument): Promise<void> => {
    detailRow.value = row
    await nextTick()
    await detailDrawerRef.value?.handleOpen(row, {
      contentHeight: 'calc(100vh - 86px)',
      showFooter: false
    })
  }
  const detailMaterials = computed(() =>
    (detailRow.value?.bindings || []).flatMap((item) => (item.material ? [item.material] : []))
  )
  const detailRoutes = computed(() =>
    (detailRow.value?.bindings || []).flatMap((item) =>
      item.processRoute ? [item.processRoute] : []
    )
  )
  const moreActions = (row: EsopDocument): ButtonMoreItem[] => [
    { key: 'copy', label: '复制文档', icon: 'ri:file-copy-line', auth: 'MdmEsop:Copy' },
    {
      key: row.status === 'enabled' ? 'disable' : 'enable',
      label: row.status === 'enabled' ? '停用' : '启用',
      icon: row.status === 'enabled' ? 'ri:forbid-line' : 'ri:checkbox-circle-line',
      auth: row.status === 'enabled' ? 'MdmEsop:Disable' : 'MdmEsop:Enable'
    },
    {
      key: 'delete',
      label: '删除',
      icon: 'ri:delete-bin-6-line',
      color: 'var(--el-color-danger)',
      auth: 'MdmEsop:Delete'
    }
  ]
  const handleMore = async (item: ButtonMoreItem, row: EsopDocument): Promise<void> => {
    if (item.key === 'copy') return openDocumentDialog('copy', row)
    if (item.key === 'delete') {
      await confirmAction(`确定删除 ESOP“${row.documentName}”吗？`, '删除 ESOP', {
        type: 'warning'
      })
      await deleteEsopDocuments([row.id])
      return void tableRef.value?.refreshData()
    }
    const enabled = item.key === 'enable'
    await setEsopDocumentsEnabled([row.id], enabled)
    await tableRef.value?.refreshData()
  }
  const columnsFactory = (): ColumnOption<EsopDocument>[] => [
    { type: 'selection', width: 48 },
    { type: 'globalIndex', label: '序号', width: 70, fixed: 'left' },
    {
      prop: 'documentName',
      label: '受控文档',
      minWidth: 300,
      fixed: 'left',
      link: { permission: 'MdmEsop:View', onClick: showDetail },
      formatter: (row) => (
        <div class="esop-page__identity">
          <span aria-hidden="true">
            <ArtSvgIcon icon={fileIcon(row.attachmentType)} />
          </span>
          <span>
            <strong title={row.documentName}>{row.documentName}</strong>
            <small title={row.documentCode}>
              {row.documentCode} · {row.versionNo}
            </small>
          </span>
        </div>
      )
    },
    {
      prop: 'categoryId',
      label: '分类',
      minWidth: 160,
      formatter: (row) => row.category?.categoryName || '未分类'
    },
    {
      prop: 'bindings',
      label: '适用范围',
      minWidth: 170,
      formatter: (row) => {
        const materialCount = row.bindings.filter((item) => item.targetType === 'material').length
        const routeCount = row.bindings.filter((item) => item.targetType === 'process_route').length
        return (
          <div class="esop-page__scope-cell">
            <span>
              <ArtSvgIcon icon="ri:box-3-line" />
              {materialCount} 产品
            </span>
            <span>
              <ArtSvgIcon icon="ri:git-branch-line" />
              {routeCount} 路线
            </span>
          </div>
        )
      }
    },
    {
      prop: 'status',
      label: '状态',
      width: 92,
      align: 'center',
      dict: { code: 'commonEnabledStatus', display: 'tag' }
    },
    {
      prop: 'uploadTime',
      label: '上传时间',
      width: 168,
      formatter: (row) => formatDateTime(row.uploadTime)
    },
    {
      prop: 'updateBy',
      label: '操作人',
      minWidth: 130,
      formatter: (row) => row.updateBy || row.createBy || '—'
    },
    {
      prop: 'operation',
      label: '操作',
      width: 176,
      fixed: 'right',
      formatter: (row) => (
        <div class="esop-page__row-actions">
          <ArtButtonTable
            permission="MdmEsop:View"
            type="view"
            onClick={() => void showDetail(row)}
          />
          <ArtButtonTable
            permission="MdmEsop:Edit"
            type="edit"
            onClick={() => openDocumentDialog('edit', row)}
          />
          <ArtButtonMore
            list={() => moreActions(row)}
            onClick={(item) => void handleMore(item, row)}
          />
        </div>
      )
    }
  ]
  const exportRows = async (): Promise<void> => {
    const result = await fetchEsopDocuments({
      ...search,
      tenantId: tenantId.value,
      categoryIds: selectedCategoryIds.value.length ? selectedCategoryIds.value : undefined,
      current: 1,
      size: 10000
    })
    await exportExcel({
      data: result.data.map((row) => ({
        documentCode: row.documentCode,
        documentName: row.documentName,
        category: row.category?.categoryName,
        version: row.versionNo,
        status: row.status === 'enabled' ? '启用' : '停用',
        effectiveDate: row.effectiveDate,
        uploadTime: formatDateTime(row.uploadTime),
        materialCount: row.bindings.filter((item) => item.targetType === 'material').length,
        routeCount: row.bindings.filter((item) => item.targetType === 'process_route').length,
        attachmentUrl: row.attachmentUrl
      })),
      columns: [
        { key: 'documentCode', title: '文档编号' },
        { key: 'documentName', title: '文档名称' },
        { key: 'category', title: '文档分类' },
        { key: 'version', title: '版本' },
        { key: 'status', title: '状态' },
        { key: 'effectiveDate', title: '生效日期' },
        { key: 'uploadTime', title: '上传时间' },
        { key: 'materialCount', title: '关联产品数' },
        { key: 'routeCount', title: '关联工艺路线数' },
        { key: 'attachmentUrl', title: '附件地址' }
      ],
      filename: 'ESOP文档台账'
    })
  }
  const importRows = async (rows: Record<string, unknown>[]): Promise<void> => {
    if (!rows.length || rows.length > 200) {
      ElMessage.warning('每次可导入 1 至 200 行 ESOP 文档')
      return
    }
    try {
      const inputs: EsopDocumentInput[] = rows.map((row, index) => {
        const categoryKey = String(row['分类编码'] || row['文档分类'] || '').trim()
        const category = categories.value.find(
          (item) => item.categoryCode === categoryKey || item.categoryName === categoryKey
        )
        const documentCode = String(row['文档编号'] || '')
          .trim()
          .toUpperCase()
        const documentName = String(row['文档名称'] || '').trim()
        const attachmentUrl = String(row['附件地址'] || '').trim()
        if (!category || !documentCode || !documentName || !attachmentUrl)
          throw new Error(`第 ${index + 2} 行缺少文档编号、名称、有效分类或附件地址`)
        return {
          tenantId: category.tenantId,
          categoryId: category.id,
          documentCode,
          documentName,
          versionNo: String(row['版本'] || 'V1.0').trim(),
          attachmentUrl,
          attachmentName: decodeURIComponent(
            attachmentUrl.split('/').pop() || `${documentCode}.pdf`
          ),
          attachmentType: attachmentUrl.split('.').pop() || '',
          description: normalizeNullableText(String(row['说明'] || '')),
          effectiveDate: normalizeNullableText(String(row['生效日期'] || '')),
          status: String(row['状态'] || '启用').trim() === '停用' ? 'disabled' : 'enabled',
          materialIds: [],
          routeIds: []
        }
      })
      for (const input of inputs) await saveEsopDocument(input)
      await refresh()
    } catch (error) {
      ElMessage.error(getFriendlySupabaseErrorMessage(error, '导入失败，请检查模板内容'))
    }
  }
  const headerActions: ArtTableQueryHeaderAction[] = [
    {
      type: 'add',
      label: '新增 ESOP',
      permission: 'MdmEsop:Add',
      onClick: () => openDocumentDialog('add')
    },
    { type: 'import', permission: 'MdmEsop:Import', onImportSuccess: importRows },
    { type: 'export', permission: 'MdmEsop:Export', onClick: () => void exportRows() },
    {
      permission: 'MdmEsop:Enable',
      label: '启用',
      icon: 'ri:checkbox-circle-line',
      selectionRequired: true,
      onClick: async ({ selectedRows, api }: ArtTableQueryHeaderActionContext) => {
        await setEsopDocumentsEnabled(
          selectedRows.map((row) => String(row.id)),
          true
        )
        await api.refreshUpdate()
      }
    },
    {
      permission: 'MdmEsop:Disable',
      label: '停用',
      icon: 'ri:forbid-line',
      selectionRequired: true,
      onClick: async ({ selectedRows, api }: ArtTableQueryHeaderActionContext) => {
        await setEsopDocumentsEnabled(
          selectedRows.map((row) => String(row.id)),
          false
        )
        await api.refreshUpdate()
      }
    },
    {
      type: 'delete',
      permission: 'MdmEsop:Delete',
      content: ({ selectedCount }: ArtTableQueryHeaderActionContext) =>
        `确定删除选中的 ${selectedCount} 份 ESOP 文档吗？`,
      onClick: async ({ selectedRows, api }: ArtTableQueryHeaderActionContext) => {
        await deleteEsopDocuments(selectedRows.map((row) => String(row.id)))
        await api.refreshRemove()
      }
    }
  ]
  watch(tenantId, async (value, oldValue) => {
    if (value === oldValue) return
    selectedCategoryId.value = undefined
    optionsLoaded.value = false
    await loadOptions()
    await tableRef.value?.refreshData()
  })
</script>

<style scoped lang="scss">
  .esop-page {
    display: flex;
    flex-direction: column;
    gap: var(--art-space-3);
    min-width: 0;
    min-height: 0;

    &__workspace {
      display: flex;
      flex: 1;
      min-width: 0;
      min-height: 0;
    }

    &__catalog {
      display: flex;
      flex-direction: column;
      gap: var(--art-space-3);
      min-width: 0;
      min-height: 0;
      padding: var(--art-space-4);
      overflow: hidden;

      > header {
        display: flex;
        gap: var(--art-space-2);
        align-items: flex-start;
        justify-content: space-between;

        > div:first-child {
          min-width: 0;

          > span,
          strong,
          small {
            display: block;
          }

          > span {
            margin-bottom: 2px;
            font-size: 9px;
            font-weight: 700;
            color: var(--theme-color);
            letter-spacing: 0.08em;
          }

          strong {
            font-size: var(--art-font-size-section-title);
          }

          small {
            margin-top: 2px;
            font-size: 11px;
            color: var(--el-text-color-secondary);
          }
        }
      }
    }

    &__catalog-actions {
      display: flex;
      flex: none;
      gap: 1px;
    }

    &__catalog-search {
      flex: none;
    }

    &__all-category {
      display: flex;
      flex: none;
      gap: var(--art-space-2);
      align-items: center;
      justify-content: space-between;
      width: 100%;
      min-height: 40px;
      padding: 0 var(--art-space-3);
      color: var(--el-text-color-regular);
      cursor: pointer;
      background: var(--el-fill-color-lighter);
      border: 1px solid transparent;
      border-radius: var(--el-border-radius-base);
      transition:
        color 0.16s ease,
        background-color 0.16s ease,
        border-color 0.16s ease;

      &:hover,
      &.is-active {
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 8%, var(--el-bg-color));
        border-color: color-mix(in srgb, var(--theme-color) 18%, var(--el-border-color-lighter));
      }

      > span,
      strong {
        display: inline-flex;
        align-items: center;
      }

      > span {
        gap: var(--art-space-2);
      }

      strong {
        justify-content: center;
        min-width: 24px;
        height: 22px;
        padding: 0 7px;
        font-size: 11px;
        font-variant-numeric: tabular-nums;
        background: var(--el-bg-color);
        border-radius: 999px;
      }
    }

    &__catalog-state {
      flex: 1;
      min-height: 0;
    }

    &__category-scrollbar {
      height: 100%;
    }

    &__category-tree {
      padding-right: var(--art-space-1);
      background: transparent;

      :deep(.el-tree-node__content) {
        height: 40px;
        margin-bottom: 2px;
        border: 1px solid transparent;
        border-radius: var(--el-border-radius-base);

        &:hover {
          border-color: var(--el-border-color-lighter);
        }
      }

      :deep(.el-tree-node.is-current > .el-tree-node__content) {
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 8%, var(--el-bg-color));
        border-color: color-mix(in srgb, var(--theme-color) 16%, var(--el-border-color-lighter));
      }
    }

    &__tree-node {
      display: flex;
      gap: var(--art-space-2);
      align-items: center;
      justify-content: space-between;
      width: calc(100% - 6px);
      min-width: 0;

      > span {
        display: inline-flex;
        gap: var(--art-space-2);
        align-items: center;
        min-width: 0;

        > span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      }

      i {
        padding: 1px 5px;
        font-size: 9px;
        font-style: normal;
        color: var(--el-text-color-secondary);
        background: var(--el-fill-color);
        border-radius: 999px;
      }
    }

    &__results {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: var(--art-space-3);
      min-width: 0;
      min-height: 0;

      > .art-table-query {
        flex: 1;
        min-height: 0;
      }
    }

    &__scope-bar {
      display: flex;
      flex: none;
      gap: var(--art-space-3);
      align-items: center;
      justify-content: space-between;
      min-height: 64px;
      padding: var(--art-space-3) var(--art-space-4);

      > div:first-child {
        display: flex;
        gap: var(--art-space-3);
        align-items: center;
        min-width: 0;

        > span {
          display: grid;
          flex: none;
          place-items: center;
          width: 38px;
          height: 38px;
          color: var(--theme-color);
          background: color-mix(in srgb, var(--theme-color) 8%, var(--el-bg-color));
          border-radius: var(--el-border-radius-base);
        }

        > div {
          min-width: 0;
        }
      }

      small,
      strong,
      p {
        display: block;
        margin: 0;
      }

      small {
        font-size: 10px;
        font-weight: 600;
        color: var(--theme-color);
      }

      strong {
        margin-top: 1px;
      }

      p {
        margin-top: 2px;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 11px;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }
    }

    &__scope-meta {
      display: flex;
      flex: none;
      gap: var(--art-space-2);
      align-items: center;

      > span {
        font-size: var(--art-font-size-caption);
        color: var(--el-text-color-secondary);
      }
    }

    :deep(.esop-page__identity) {
      display: grid;
      grid-template-columns: 38px minmax(0, 1fr);
      gap: var(--art-space-2);
      align-items: center;
      min-width: 0;

      > span:first-child {
        display: grid;
        place-items: center;
        width: 38px;
        height: 38px;
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 8%, var(--el-bg-color));
        border-radius: var(--el-border-radius-base);
      }

      > span:last-child {
        display: grid;
        min-width: 0;
      }

      strong,
      small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      small {
        margin-top: 3px;
        font-family: var(--art-font-family-mono, Consolas, monospace);
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }

    :deep(.esop-page__scope-cell) {
      display: flex;
      gap: var(--art-space-3);
      color: var(--el-text-color-secondary);

      span {
        display: inline-flex;
        gap: var(--art-space-2);
        align-items: center;
      }

      svg {
        color: var(--theme-color);
      }
    }

    :deep(.esop-page__row-actions) {
      display: flex;
      gap: var(--art-space-1);
      align-items: center;
    }

    @media (width <= 720px) {
      &__scope-bar {
        align-items: flex-start;
      }

      &__scope-meta {
        flex-direction: column;
        align-items: flex-end;
      }
    }
  }

  .esop-detail {
    display: grid;
    gap: 14px;
  }

  .esop-detail__hero {
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr) auto;
    gap: 13px;
    align-items: center;
    padding: 16px;
    background: color-mix(in srgb, var(--theme-color) 7%, var(--el-bg-color));
    border: 1px solid color-mix(in srgb, var(--theme-color) 15%, var(--el-border-color-lighter));
    border-radius: var(--el-border-radius-base);
  }

  .esop-detail__hero > span:first-child {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    font-size: 23px;
    color: var(--theme-color);
    background: var(--el-bg-color);
    border-radius: 13px;
  }

  .esop-detail__hero small,
  .esop-detail__hero h2,
  .esop-detail__hero p {
    margin: 0;
  }

  .esop-detail__hero small {
    font-family: var(--art-font-family-mono, Consolas, monospace);
    font-size: 10px;
    color: var(--theme-color);
  }

  .esop-detail__hero h2 {
    margin-top: 3px;
    font-size: 18px;
  }

  .esop-detail__hero p {
    margin-top: 3px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  .esop-detail__summary {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    overflow: hidden;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--el-border-radius-base);
  }

  .esop-detail__summary > div {
    display: grid;
    gap: 4px;
    padding: 11px 13px;
  }

  .esop-detail__summary > div + div {
    border-left: 1px solid var(--el-border-color-lighter);
  }

  .esop-detail__summary small,
  .esop-detail__section header small,
  .esop-detail__attachment small,
  .esop-detail__scope-grid li small {
    font-size: 11px;
    color: var(--el-text-color-secondary);
  }

  .esop-detail__section {
    padding: 14px;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--el-border-radius-base);
  }

  .esop-detail__section--audit {
    background: color-mix(in srgb, var(--el-fill-color-lighter) 54%, transparent);
  }

  .esop-detail__section > header {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    margin-bottom: 12px;
  }

  .esop-detail__section > header > span {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    color: var(--theme-color);
    background: color-mix(in srgb, var(--theme-color) 8%, var(--el-bg-color));
    border-radius: 9px;
  }

  .esop-detail__section header strong,
  .esop-detail__section header small {
    display: block;
  }

  .esop-detail__attachment {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) auto;
    gap: 11px;
    align-items: center;
    padding: 11px 12px;
    background: var(--el-fill-color-lighter);
    border-radius: 9px;
  }

  .esop-detail__attachment > span {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    font-size: 20px;
    color: var(--theme-color);
    background: var(--el-bg-color);
    border-radius: 9px;
  }

  .esop-detail__attachment strong,
  .esop-detail__attachment small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .esop-detail__scope-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .esop-detail__scope-grid > div {
    min-width: 0;
    padding: 11px;
    background: var(--el-fill-color-lighter);
    border-radius: 9px;
  }

  .esop-detail__scope-grid h3 {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0 0 8px;
    font-size: 12px;
  }

  .esop-detail__scope-grid h3 span {
    color: var(--theme-color);
  }

  .esop-detail__scope-grid ul {
    display: grid;
    gap: 6px;
    padding: 0;
    margin: 0;
    list-style: none;
  }

  .esop-detail__scope-grid li {
    display: grid;
    min-width: 0;
    padding: 7px 8px;
    background: var(--el-bg-color);
    border-radius: 7px;
  }

  .esop-detail__scope-grid li strong,
  .esop-detail__scope-grid li small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (width <= 960px) {
    .esop-page {
      height: auto;
    }

    .esop-page__catalog {
      min-height: 240px;
    }
  }

  @media (width <= 620px) {
    .esop-detail__hero {
      grid-template-columns: 46px minmax(0, 1fr);
    }

    .esop-detail__hero .el-tag {
      grid-column: 1 / -1;
      justify-self: start;
    }

    .esop-detail__summary,
    .esop-detail__scope-grid {
      grid-template-columns: 1fr;
    }

    .esop-detail__summary > div + div {
      border-top: 1px solid var(--el-border-color-lighter);
      border-left: 0;
    }

    .esop-detail__attachment {
      grid-template-columns: 40px minmax(0, 1fr);
    }

    .esop-detail__attachment .el-button {
      grid-column: 1 / -1;
    }
  }
</style>

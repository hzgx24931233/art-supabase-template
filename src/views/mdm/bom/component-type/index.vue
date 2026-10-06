<template>
  <ArtPermissionGuard permission="MdmComponentType:View" resource-name="BOM 组件类型">
    <div class="component-type-page business-workspace-page art-full-height">
      <BusinessWorkspaceHeader
        density="compact"
        eyebrow="ENGINEERING MASTER"
        title="BOM 组件类型"
        description="按行业维护组件角色，为 BOM、结构查询和生产工单提供一致的分类口径。"
        icon="ri:price-tag-3-line"
        :metrics="metrics"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
      </BusinessWorkspaceHeader>
      <div class="component-type-page__workspace">
        <ArtWorkspaceSplitter
          primary-size="320px"
          primary-min="288px"
          primary-max="380px"
          :breakpoint="900"
          narrow-mode="stack"
        >
          <template #primary>
            <ArtSectionCard
              :show-scrollbar="false"
              class="component-type-page__navigation"
              body-class="component-type-page__navigation-body"
              title="行业分组"
              subtitle="选择分组联动筛选组件类型"
              :loading="groupLoading"
              :error="groupError"
              :empty="!groupLoading && !groupError && !groups.length"
              empty-title="暂无行业分组"
              empty-description="先建立行业，再维护组件类型。"
              retryable
              @retry="loadGroups"
            >
              <template #actions>
                <div class="component-type-page__navigation-actions">
                  <ArtTreeExpandToggle
                    :tree="treeRef"
                    :data="groupTree"
                    label="行业分组树"
                    :default-expanded="groups.length < 18"
                  />
                  <ArtIconButton
                    v-auth="'MdmComponentType:ManageGroup'"
                    icon="ri:add-line"
                    label="新增行业分组"
                    @click="openGroupDialog()"
                  />
                  <ArtIconButton icon="ri:refresh-line" label="刷新行业分组" @click="loadGroups" />
                </div>
              </template>
              <ElInput
                v-model="groupKeyword"
                clearable
                placeholder="搜索行业名称或编码"
                aria-label="搜索行业分组"
              >
                <template #prefix><ArtSvgIcon icon="ri:search-line" /></template>
              </ElInput>
              <button
                type="button"
                class="component-type-page__all-group"
                :class="{ 'is-current': !selectedGroupId }"
                @click="selectGroup('')"
              >
                <span class="component-type-page__all-icon" aria-hidden="true">
                  <ArtSvgIcon icon="ri:apps-2-line" />
                </span>
                <span
                  ><strong>全部分组</strong><small>{{ groups.length }} 个行业节点</small></span
                >
                <ArtSvgIcon v-if="!selectedGroupId" icon="ri:check-line" aria-hidden="true" />
              </button>
              <ElScrollbar class="component-type-page__tree-scroll">
                <ElTree
                  ref="treeRef"
                  :data="groupTree"
                  node-key="id"
                  :props="{ label: 'name', children: 'children' }"
                  :current-node-key="selectedGroupId || undefined"
                  :filter-node-method="filterGroup"
                  :default-expand-all="groups.length < 18"
                  :expand-on-click-node="false"
                  highlight-current
                  @node-click="selectGroup($event.id)"
                >
                  <template #default="{ data }">
                    <div class="component-type-page__tree-node">
                      <span class="component-type-page__folder" aria-hidden="true">
                        <ArtSvgIcon icon="ri:folder-3-line" />
                      </span>
                      <span
                        ><strong :title="data.name">{{ data.name }}</strong
                        ><small>{{ data.code }}</small></span
                      >
                      <span class="component-type-page__node-actions">
                        <ArtIconButton
                          v-auth="'MdmComponentType:ManageGroup'"
                          icon="ri:add-line"
                          label="新增下级分组"
                          @click.stop="openGroupDialog(undefined, data)"
                        />
                        <ArtIconButton
                          v-auth="'MdmComponentType:ManageGroup'"
                          icon="ri:edit-line"
                          label="编辑行业分组"
                          @click.stop="openGroupDialog(data)"
                        />
                        <ArtIconButton
                          v-auth="'MdmComponentType:ManageGroup'"
                          icon="ri:delete-bin-6-line"
                          label="删除行业分组"
                          tone="danger"
                          @click.stop="removeGroup(data)"
                        />
                      </span>
                    </div>
                  </template>
                  <template #empty>
                    <ArtEmptyState
                      title="未找到匹配项"
                      description="请调整关键词或清空筛选条件。"
                      size="compact"
                      :visual-size="64"
                    />
                  </template>
                </ElTree>
              </ElScrollbar>
            </ArtSectionCard>
          </template>
          <div class="component-type-page__table-pane">
            <ArtTableQuery
              ref="tableRef"
              v-model="search"
              :api-fn="fetchData"
              :search-items="searchItems"
              :columns-factory="columnsFactory"
              :header-actions="headerActions"
              header-actions-placement="workspace"
              :search-bar-props="{ span: 8, labelWidth: 72, showExpand: false, isExpand: true }"
              :table-props="{
                rowKey: 'id',
                tableLayout: 'fixed',
                emptyText: selectedGroupId ? '当前行业暂无组件类型' : '暂无组件类型',
                emptyDescription: '点击新增组件类型，建立可供 BOM 参选的分类。'
              }"
              :on-success="handleTableSuccess"
              focusable
            />
          </div>
        </ArtWorkspaceSplitter>
      </div>
      <ComponentTypeDialog ref="typeDialogRef" @success="refresh" />
      <IndustryGroupDialog ref="groupDialogRef" @success="handleGroupSaved" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { ElTag, type ElTree } from 'element-plus'
  import TreeUtils from '@/utils/tree'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import ArtWorkspaceSplitter from '@/components/core/layouts/art-workspace-splitter/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtTreeExpandToggle from '@/components/core/widget/art-tree-expand-toggle/index.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric
  } from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import type { ColumnOption } from '@/types'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction,
    ArtTableQueryProps
  } from '@/components/core/tables/art-table-query/index.vue'
  import {
    deleteComponentIndustryGroup,
    deleteComponentType,
    fetchComponentIndustryGroups,
    fetchComponentTypes,
    type ComponentIndustryGroup,
    type ComponentTypeQuery,
    type ComponentTypeRecord
  } from '@/api/mdm'
  import ComponentTypeDialog from './modules/component-type-dialog.vue'
  import IndustryGroupDialog from './modules/industry-group-dialog.vue'

  const commonEnabledDisabledStatusOptions = useDictionaryOptions(
    'commonEnabledDisabledStatus',
    (value) => value === 'enabled'
  )

  defineOptions({ name: 'MdmComponentType' })
  const { confirmDelete } = useArtFeedback()
  const { hasAnyAuth } = useAuth()
  const { effectiveTenantId, tenantOptions } = storeToRefs(useTenantScopeStore())
  const tableRef = ref<ArtTableQueryExpose>()
  const typeDialogRef = ref<InstanceType<typeof ComponentTypeDialog>>()
  const groupDialogRef = ref<InstanceType<typeof IndustryGroupDialog>>()
  const treeRef = ref<InstanceType<typeof ElTree>>()
  const treeUtils = new TreeUtils({ parentKey: 'parentId' })
  const groups = ref<ComponentIndustryGroup[]>([])
  const groupLoading = ref(false)
  const groupError = ref<Error | null>(null)
  const groupKeyword = ref('')
  const selectedGroupId = ref('')
  const totalTypes = ref(0)
  const search = reactive({ keyword: '', enabled: undefined as boolean | undefined })
  const groupTree = computed(
    () =>
      treeUtils.listToTree(
        groups.value,
        (left, right) => left.sort - right.sort || left.name.localeCompare(right.name, 'zh-CN')
      ) as ComponentIndustryGroup[]
  )
  const metrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '行业分组',
      value: groups.value.length,
      description: '当前数据范围',
      icon: 'ri:folder-3-line'
    },
    {
      label: '组件类型',
      value: totalTypes.value,
      description: '当前查询范围',
      icon: 'ri:price-tag-3-line',
      tone: 'success'
    }
  ])
  const searchItems: SearchFormItem[] = [
    {
      key: 'keyword',
      label: '关键字',
      type: 'input',
      props: { clearable: true, placeholder: '类型编码、名称或备注' }
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
  const tenantChoices = () =>
    tenantOptions.value.map((tenant) => ({
      label: tenant.tenantName || tenant.tenantCode,
      value: tenant.id
    }))
  const loadGroups = async () => {
    groupLoading.value = true
    groupError.value = null
    try {
      groups.value = await fetchComponentIndustryGroups(effectiveTenantId.value)
    } catch (error) {
      groupError.value = error instanceof Error ? error : new Error('行业分组加载失败')
    } finally {
      groupLoading.value = false
    }
  }
  const refresh = async () => {
    await Promise.all([loadGroups(), tableRef.value?.getData()])
  }
  const filterGroup = (value: string, data: Record<string, unknown>) =>
    !value ||
    `${String(data.name ?? '')} ${String(data.code ?? '')}`
      .toLowerCase()
      .includes(value.toLowerCase())
  watch(groupKeyword, (value) => treeRef.value?.filter(value))
  watch(selectedGroupId, async (id) => {
    await nextTick()
    treeRef.value?.setCurrentKey(id || undefined)
  })
  watch(effectiveTenantId, () => {
    selectedGroupId.value = ''
    void refresh()
  })
  onMounted(() => void loadGroups())
  const selectGroup = (id: string) => {
    selectedGroupId.value = id
    void tableRef.value?.getData()
  }
  const groupIds = () =>
    selectedGroupId.value
      ? treeUtils
          .getDescendants(groupTree.value, selectedGroupId.value, true)
          .map((group) => group.id)
      : undefined
  const fetchData = (params: ComponentTypeQuery, options?: { signal?: AbortSignal }) =>
    fetchComponentTypes(
      { ...params, tenantId: effectiveTenantId.value, groupIds: groupIds() },
      options
    )
  const handleTableSuccess: ArtTableQueryProps['onSuccess'] = (rows, response) => {
    totalTypes.value = Number(response.total ?? rows.length)
  }
  const openTypeDialog = (row?: ComponentTypeRecord) => {
    void typeDialogRef.value?.handleOpen({
      row,
      tenantId: row?.tenantId || effectiveTenantId.value || '',
      tenantOptions: tenantChoices(),
      groups: groups.value,
      groupId: selectedGroupId.value
    })
  }
  const openGroupDialog = (row?: ComponentIndustryGroup, parent?: ComponentIndustryGroup) => {
    void groupDialogRef.value?.handleOpen({
      row,
      parent,
      groups: groups.value,
      tenantId: row?.tenantId || parent?.tenantId || effectiveTenantId.value || '',
      tenantOptions: tenantChoices()
    })
  }
  const handleGroupSaved = async (id: string) => {
    selectedGroupId.value = id
    await refresh()
  }
  const removeGroup = async (row: ComponentIndustryGroup) => {
    await confirmDelete(`确定删除行业分组“${row.name}”吗？下级分组和已引用的类型需先处理。`)
    await deleteComponentIndustryGroup(row.id)
    if (selectedGroupId.value === row.id) selectedGroupId.value = ''
    await refresh()
  }
  const removeType = async (row: ComponentTypeRecord) => {
    await confirmDelete(
      `确定删除组件类型“${row.componentTypeName}”吗？已被 BOM 引用的类型不能删除。`
    )
    await deleteComponentType(row.id)
    await tableRef.value?.getData()
  }
  const headerActions: ArtTableQueryHeaderAction[] = [
    {
      permission: 'MdmComponentType:Add',
      type: 'add',
      label: '新增组件类型',
      onClick: () => openTypeDialog()
    }
  ]
  const actionColumn: ColumnOption<ComponentTypeRecord> = {
    prop: 'operation',
    label: '操作',
    width: 100,
    fixed: 'right',
    formatter: (row) => (
      <BusinessTableRowActions>
        <ArtButtonTable
          type="edit"
          permission="MdmComponentType:Edit"
          onClick={() => openTypeDialog(row)}
        />
        <ArtButtonTable
          type="delete"
          permission="MdmComponentType:Delete"
          onClick={() => void removeType(row)}
        />
      </BusinessTableRowActions>
    )
  }
  const columnsFactory = (): ColumnOption<ComponentTypeRecord>[] => [
    { type: 'globalIndex', label: '#', width: 58, fixed: 'left' },
    { prop: 'componentTypeCode', label: '组件类型编码', minWidth: 156, fixed: 'left' },
    { prop: 'componentTypeName', label: '组件类型', minWidth: 130 },
    {
      prop: 'groupId',
      label: '行业分组',
      minWidth: 128,
      formatter: (row) => row.group?.name || '—'
    },
    { prop: 'sortOrder', label: '排序', width: 76, align: 'right', sortable: true },
    {
      prop: 'enabled',
      label: '状态',
      width: 78,
      formatter: (row) => (
        <ElTag size="small" effect="plain" type={row.enabled ? 'success' : 'info'}>
          {row.enabled ? '启用' : '禁用'}
        </ElTag>
      )
    },
    {
      prop: 'textColor',
      label: '文字颜色',
      width: 106,
      formatter: (row) => (
        <span class="component-type-page__color-value">
          <i style={{ backgroundColor: row.textColor || 'var(--el-text-color-primary)' }} />
          {row.textColor || '默认'}
        </span>
      )
    },
    {
      prop: 'tagStyle',
      label: '标签样式',
      minWidth: 108,
      formatter: (row) => (
        <ElTag
          size="small"
          effect="light"
          type={row.tagStyle || 'primary'}
          style={{ color: row.textColor || undefined }}
        >
          {row.componentTypeName}
        </ElTag>
      )
    },
    { prop: 'remark', label: '备注', minWidth: 140, showOverflowTooltip: true },
    ...(hasAnyAuth(['MdmComponentType:Edit', 'MdmComponentType:Delete']) ? [actionColumn] : [])
  ]
</script>

<style scoped lang="scss">
  .component-type-page {
    &__workspace {
      display: flex;
      flex: 1;
      min-height: 0;
    }

    &__navigation {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }

    :deep(.component-type-page__navigation-body) {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 12px;
      min-height: 0;
    }

    &__navigation-actions,
    &__node-actions {
      display: flex;
      gap: 2px;
      align-items: center;
    }

    &__tree-scroll {
      flex: 1;
      min-height: 0;
    }

    &__tree-scroll :deep(.el-tree-node__content) {
      height: auto;
      min-height: 48px;
      padding-block: 5px;
      margin-bottom: 2px;
      border: 1px solid transparent;
      border-radius: var(--el-border-radius-base);
      transition:
        background-color var(--art-motion-duration-fast),
        border-color var(--art-motion-duration-fast);

      &:hover,
      &:focus-within {
        background: var(--art-gray-100);
        border-color: var(--el-border-color-lighter);
      }

      &:hover .component-type-page__node-actions,
      &:focus-within .component-type-page__node-actions {
        opacity: 1;
      }
    }

    &__tree-scroll :deep(.el-tree-node.is-current > .el-tree-node__content) {
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 10%, var(--default-box-color));
      border-color: color-mix(in srgb, var(--theme-color) 18%, transparent);
      box-shadow: inset 3px 0 0 var(--theme-color);
    }

    &__all-group {
      display: grid;
      grid-template-columns: 36px minmax(0, 1fr) 18px;
      gap: 10px;
      align-items: center;
      width: 100%;
      min-height: 58px;
      padding: 8px 10px;
      font: inherit;
      color: var(--el-text-color-regular);
      text-align: left;
      cursor: pointer;
      background: var(--art-gray-100);
      border: 1px solid transparent;
      border-radius: var(--el-border-radius-base);
      transition:
        background-color var(--art-motion-duration-fast),
        border-color var(--art-motion-duration-fast),
        box-shadow var(--art-motion-duration-fast);

      &:hover,
      &.is-current {
        background: color-mix(in srgb, var(--theme-color) 9%, var(--default-box-color));
        border-color: color-mix(in srgb, var(--theme-color) 22%, transparent);
      }
    }

    &__all-group.is-current {
      box-shadow: inset 3px 0 0 var(--theme-color);
    }

    &__all-group:focus-visible {
      outline: 2px solid var(--theme-color);
      outline-offset: 2px;
    }

    &__all-icon {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      color: var(--theme-color);
      background: var(--default-box-color);
      border-radius: var(--el-border-radius-base);
    }

    &__all-group > span:nth-child(2),
    &__tree-node > span:nth-child(2) {
      display: grid;
      min-width: 0;
    }

    &__all-group strong,
    &__tree-node strong {
      font-size: 13px;
      font-weight: 600;
      color: var(--el-text-color-primary);
    }

    &__all-group small,
    &__tree-node small {
      margin-top: 2px;
      font-size: 11px;
      color: var(--el-text-color-secondary);
    }

    &__tree-node {
      display: grid;
      flex: 1;
      grid-template-columns: 20px minmax(0, 1fr) auto;
      gap: 7px;
      align-items: center;
      min-width: 0;
    }

    &__folder {
      color: var(--el-text-color-secondary);
    }

    &__node-actions {
      opacity: 0;
      transition: opacity var(--art-motion-duration-fast);
    }

    &__tree-node strong,
    &__tree-node small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &__table-pane {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
    }

    &__color-value {
      display: inline-flex;
      gap: 7px;
      align-items: center;

      i {
        width: 12px;
        height: 12px;
        border: 1px solid var(--el-border-color);
        border-radius: 50%;
      }
    }

    &__table-pane :deep(.art-table-query) {
      flex: 1;
      min-height: 0;
    }

    @media (hover: none) {
      &__node-actions {
        opacity: 1;
      }
    }
  }
</style>

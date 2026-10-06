<template>
  <section class="business-type-menu-filter" aria-label="业务类型功能菜单筛选">
    <header class="business-type-menu-filter__header">
      <div class="business-type-menu-filter__heading">
        <span class="business-type-menu-filter__brand" aria-hidden="true">
          <ArtSvgIcon icon="ri:node-tree" />
        </span>
        <div>
          <strong>功能导航</strong>
          <small>{{ menuPageCount }} 个菜单 · {{ assignedMenuCount }} 个已配置</small>
        </div>
      </div>

      <ArtTooltip content="刷新菜单目录" placement="top">
        <ArtIconButton
          icon="ri:refresh-line"
          label="刷新菜单目录"
          :loading="loading"
          @click="emit('refresh')"
        />
      </ArtTooltip>
    </header>

    <div class="business-type-menu-filter__search">
      <ElInput v-model="keyword" clearable placeholder="搜索菜单功能" aria-label="搜索菜单功能">
        <template #prefix><ArtSvgIcon icon="ri:search-line" /></template>
      </ElInput>
    </div>

    <nav class="business-type-menu-filter__quick" aria-label="全部菜单功能">
      <button type="button" :class="{ 'is-active': !selectedMenuId }" @click="handleSelect('')">
        <span class="business-type-menu-filter__quick-icon" aria-hidden="true">
          <ArtSvgIcon icon="ri:apps-2-line" />
        </span>
        <span>
          <strong>全部功能</strong>
          <small>查看当前数据范围内全部业务类型</small>
        </span>
        <ElTag size="small" round>{{ totalCount }}</ElTag>
      </button>
    </nav>

    <div class="business-type-menu-filter__section-title">
      <span>业务菜单树</span>
      <small>选择目录包含下级</small>
    </div>

    <div class="business-type-menu-filter__tree-area" :aria-busy="loading">
      <ArtOverlayLoading
        v-if="loading"
        loading
        overlay
        size="compact"
        text="正在加载菜单树…"
        description=""
      />
      <ElScrollbar v-if="displayTree.length">
        <ElTree
          ref="treeRef"
          :data="displayTree"
          node-key="id"
          :props="treeProps"
          :default-expanded-keys="defaultExpandedKeys"
          :expand-on-click-node="false"
          highlight-current
          :filter-node-method="filterNode"
          @node-click="handleNodeClick"
        >
          <template #default="{ data }">
            <div class="business-type-menu-filter__node">
              <span class="business-type-menu-filter__node-icon" aria-hidden="true">
                <ArtSvgIcon :icon="resolveNodeIcon(data)" />
              </span>
              <span class="business-type-menu-filter__node-copy">
                <strong :title="resolveLabel(data)">{{ resolveLabel(data) }}</strong>
                <small>{{
                  data.directCount ? `${data.directCount} 项直接配置` : '业务目录'
                }}</small>
              </span>
              <span class="business-type-menu-filter__node-count">{{ data.totalCount }}</span>
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

      <ArtEmptyState
        v-else
        title="暂无可用菜单功能"
        description="请刷新后重试，或联系管理员检查菜单配置。"
        size="compact"
        :visual-size="58"
      />
    </div>

    <footer class="business-type-menu-filter__footer">
      <div class="business-type-menu-filter__selection" aria-live="polite">
        <span aria-hidden="true"><ArtSvgIcon icon="ri:filter-3-line" /></span>
        <div>
          <small>当前筛选</small>
          <strong>{{ selectedLabel }}</strong>
        </div>
        <ElTag type="primary" effect="plain" size="small" round> {{ selectedCount }} 项 </ElTag>
      </div>
    </footer>
  </section>
</template>

<script setup lang="ts">
  import { ElTree, type TreeNodeData } from 'element-plus'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import TreeUtils from '@/utils/tree'
  import type { BusinessTypeMenuNode } from '@/api/mdm'

  interface DisplayMenuNode extends BusinessTypeMenuNode {
    directCount: number
    totalCount: number
    children?: DisplayMenuNode[]
  }

  const props = withDefaults(
    defineProps<{
      data: BusinessTypeMenuNode[]
      counts: Record<string, number>
      selectedMenuId?: string
      loading?: boolean
    }>(),
    {
      selectedMenuId: '',
      loading: false
    }
  )

  const emit = defineEmits<{
    select: [menuId: string]
    refresh: []
  }>()

  const treeRef = ref<InstanceType<typeof ElTree>>()
  const keyword = ref('')
  const treeUtils = new TreeUtils({ idKey: 'id', parentKey: 'parentId', childrenKey: 'children' })
  const treeProps = { children: 'children', label: (data: TreeNodeData) => resolveLabel(data) }

  const displayTree = computed<DisplayMenuNode[]>(
    () =>
      treeUtils.mapTree<BusinessTypeMenuNode>(props.data, (menu) => {
        const relatedMenus = treeUtils.getDescendants(props.data, menu.id, true)
        return {
          ...menu,
          directCount: props.counts[menu.id] ?? 0,
          totalCount: relatedMenus.reduce((total, item) => total + (props.counts[item.id] ?? 0), 0)
        } as DisplayMenuNode
      }) as DisplayMenuNode[]
  )
  const flatTree = computed(() => treeUtils.treeToList(displayTree.value))
  const menuPageCount = computed(() => flatTree.value.filter((item) => item.type === 'menu').length)
  const assignedMenuCount = computed(
    () => Object.values(props.counts).filter((count) => count > 0).length
  )
  const totalCount = computed(() =>
    Object.values(props.counts).reduce((total, count) => total + count, 0)
  )
  const defaultExpandedKeys = computed(() => displayTree.value.map((item) => item.id))
  const selectedNode = computed(() =>
    flatTree.value.find((item) => item.id === props.selectedMenuId)
  )
  const selectedLabel = computed(() =>
    selectedNode.value ? resolveLabel(selectedNode.value) : '全部功能'
  )
  const selectedCount = computed(() => selectedNode.value?.totalCount ?? totalCount.value)

  function resolveLabel(menu: { meta?: { title?: unknown }; name?: unknown }): string {
    return String(menu.meta?.title || menu.name || '未命名菜单')
  }

  const resolveNodeIcon = (menu: DisplayMenuNode): string =>
    menu.type === 'folder' ? 'ri:folder-3-line' : String(menu.meta?.icon || 'ri:file-list-3-line')

  const filterNode = (value: string, data: TreeNodeData): boolean => {
    const menu = data as DisplayMenuNode
    const normalized = value.trim().toLocaleLowerCase('zh-CN')
    if (!normalized) return true
    return [resolveLabel(menu), menu.name, menu.path, menu.component].some((field) =>
      String(field ?? '')
        .toLocaleLowerCase('zh-CN')
        .includes(normalized)
    )
  }

  const syncCurrentNode = async (): Promise<void> => {
    await nextTick()
    treeRef.value?.setCurrentKey(props.selectedMenuId || undefined)
  }
  const handleSelect = (menuId: string): void => emit('select', menuId)
  const handleNodeClick = (menu: DisplayMenuNode): void => handleSelect(menu.id)

  watch(keyword, (value) => treeRef.value?.filter(value))
  watch(() => props.selectedMenuId, syncCurrentNode, { immediate: true })
  watch(displayTree, async () => {
    await syncCurrentNode()
    treeRef.value?.filter(keyword.value)
  })
</script>

<style scoped lang="scss">
  .business-type-menu-filter {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    min-width: 0;
    height: 100%;
    overflow: hidden;
    background: var(--default-box-color);
    border: 1px solid var(--art-card-border);
    border-radius: var(--custom-radius);

    &__header,
    &__heading,
    &__node,
    &__selection,
    &__quick button {
      display: flex;
      align-items: center;
    }

    &__header {
      flex: none;
      justify-content: space-between;
      padding: 12px;
      background: color-mix(in srgb, var(--theme-color) 6%, var(--default-box-color));
      border-bottom: 1px solid var(--art-card-border);
    }

    &__heading {
      min-width: 0;

      > div {
        display: grid;
        min-width: 0;
      }

      strong {
        font-size: 14px;
        color: var(--el-text-color-primary);
      }

      small {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }

    &__brand,
    &__quick-icon,
    &__node-icon,
    &__selection > span {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 9%, var(--default-box-color));
      border-radius: var(--art-control-radius);
    }

    &__brand {
      width: 32px;
      height: 32px;
      margin-right: 8px;
      border: 1px solid color-mix(in srgb, var(--theme-color) 18%, var(--art-card-border));
    }

    &__search {
      flex: none;
      padding: 10px 10px 8px;
    }

    &__quick {
      flex: none;
      padding: 0 8px 8px;

      button {
        width: 100%;
        min-height: 48px;
        padding: 6px 8px;
        font: inherit;
        text-align: left;
        cursor: pointer;
        background: transparent;
        border: 1px solid transparent;
        border-radius: var(--el-border-radius-base);
        transition:
          background-color var(--art-duration-fast),
          border-color var(--art-duration-fast),
          box-shadow var(--art-duration-fast);

        > span:nth-child(2) {
          display: grid;
          flex: 1;
          min-width: 0;
        }

        strong {
          font-size: 13px;
          color: var(--el-text-color-primary);
        }

        small {
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 10px;
          color: var(--el-text-color-secondary);
          white-space: nowrap;
        }

        &:hover {
          background: var(--el-fill-color-light);
        }

        &:focus-visible {
          outline: 2px solid var(--theme-color);
          outline-offset: 2px;
        }

        &.is-active {
          background: color-mix(in srgb, var(--theme-color) 10%, var(--default-box-color));
          border-color: color-mix(in srgb, var(--theme-color) 24%, var(--art-card-border));
          box-shadow: inset 3px 0 0 var(--theme-color);
        }
      }
    }

    &__quick-icon {
      width: 28px;
      height: 28px;
      margin-right: 7px;
    }

    &__section-title {
      display: flex;
      flex: none;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px 6px;
      background: var(--el-fill-color-lighter);
      border-block: 1px solid var(--art-card-border);

      span {
        font-size: 12px;
        font-weight: 700;
      }

      small {
        font-size: 10px;
        color: var(--el-text-color-secondary);
      }
    }

    &__tree-area {
      position: relative;
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-height: 0;
      padding: 6px;
      overflow: hidden;

      :deep(.el-scrollbar) {
        flex: 1 1 auto;
        min-height: 0;
      }

      :deep(.el-tree) {
        background: transparent;
      }

      :deep(.el-tree-node__content) {
        height: 44px;
        padding-right: 5px;
        margin-bottom: 2px;
        border-radius: var(--el-border-radius-base);
      }

      :deep(.el-tree-node__children) {
        padding-left: 6px;
        margin-left: 11px;
        border-left: 1px dashed color-mix(in srgb, var(--theme-color) 28%, transparent);
      }

      :deep(.el-tree-node.is-current > .el-tree-node__content) {
        background: color-mix(in srgb, var(--theme-color) 10%, var(--default-box-color));
        box-shadow: inset 3px 0 0 var(--theme-color);
      }
    }

    &__node {
      flex: 1;
      min-width: 0;
      height: 100%;
    }

    &__node-icon {
      width: 28px;
      height: 28px;
      margin-right: 7px;
    }

    &__node-copy {
      display: grid;
      flex: 1;
      min-width: 0;

      strong,
      small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      strong {
        font-size: 12px;
        color: var(--el-text-color-primary);
      }

      small {
        font-size: 10px;
        color: var(--el-text-color-secondary);
      }
    }

    &__node-count {
      flex: none;
      min-width: 23px;
      padding: 0 5px;
      margin-left: 6px;
      font-size: 10px;
      font-variant-numeric: tabular-nums;
      line-height: 20px;
      color: var(--el-text-color-secondary);
      text-align: center;
      background: var(--el-fill-color);
      border-radius: 999px;
    }

    &__footer {
      flex: none;
      padding: 8px 10px 10px;
      background: var(--el-fill-color-lighter);
      border-top: 1px solid var(--art-card-border);
    }

    &__selection {
      gap: 9px;
      min-width: 0;
      padding: 6px 8px;
      background: var(--default-box-color);
      border: 1px solid var(--art-card-border);
      border-radius: var(--el-border-radius-base);

      > span {
        flex: 0 0 28px;
        width: 28px;
        height: 28px;
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
        font-size: 10px;
        color: var(--el-text-color-secondary);
      }

      strong {
        font-size: 12px;
        color: var(--el-text-color-primary);
      }

      .el-tag {
        flex: none;
        min-width: 48px;
        font-variant-numeric: tabular-nums;
      }
    }

    :global([data-box-mode='shadow-mode']) & {
      border-color: transparent;
      box-shadow: var(--art-card-shadow-xs);
    }
  }
</style>

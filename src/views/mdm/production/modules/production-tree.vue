<template>
  <ArtSectionCard
    :show-scrollbar="false"
    class="production-tree"
    title="部门 / 产线"
    subtitle="按组织范围查看生产配置"
    :loading="loading"
    :error="error"
    :empty="!loading && !error && !departments.length"
    empty-title="尚未建立生产组织"
    empty-description="新增部门或产线后，可在这里按组织范围定位业务数据。"
    retryable
    @retry="$emit('refresh')"
    body-class="production-tree__body"
  >
    <template #actions>
      <ArtTreeExpandToggle :tree="treeRef" :data="nodes" label="组织树" />
      <ArtIconButton label="刷新部门树" icon="ri:refresh-line" @click="$emit('refresh')" />
    </template>
    <ElInput
      v-model="keyword"
      placeholder="搜索组织名称或编码"
      aria-label="搜索部门名称或编码"
      clearable
    >
      <template #prefix><ArtSvgIcon icon="ri:search-line" /></template>
    </ElInput>
    <button
      v-if="showAll"
      type="button"
      class="production-tree__all"
      :class="{ 'is-current': !selected }"
      @click="emit('select', '')"
    >
      <span aria-hidden="true"><ArtSvgIcon icon="ri:organization-chart" /></span>
      <span
        ><strong>全部生产组织</strong><small>{{ allDescription }}</small></span
      >
      <ArtSvgIcon v-if="!selected" icon="ri:check-line" aria-hidden="true" />
    </button>
    <div class="production-tree__section-label">
      <span>组织结构</span>
      <small>{{ activeCount }} 个可用节点</small>
    </div>
    <ElScrollbar class="production-tree__scroll">
      <ElTree
        ref="treeRef"
        :data="nodes"
        node-key="id"
        :props="{ label: 'name' }"
        :current-node-key="selected"
        :filter-node-method="filterNode"
        :default-expanded-keys="defaultExpandedKeys"
        highlight-current
        :expand-on-click-node="false"
        @node-click="selectNode"
      >
        <template #default="{ data }">
          <div class="production-tree__node">
            <span aria-hidden="true"><ArtSvgIcon :icon="organizationIcon(data)" /></span>
            <span>
              <strong :title="data.name">{{ data.name }}</strong>
              <small :title="departmentSubtitle(data)">{{ departmentSubtitle(data) }}</small>
            </span>
            <ElTag v-if="!data.enabled" type="info" size="small">停用</ElTag>
            <ArtSvgIcon
              v-else-if="selected === data.id"
              class="production-tree__check"
              icon="ri:check-line"
              aria-hidden="true"
            />
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
<script setup lang="ts">
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import { ref, computed, watch, nextTick } from 'vue'
  import type { ElTree } from 'element-plus'
  import type { ProductionDepartment } from '@/api/mdm'
  import ArtTreeExpandToggle from '@/components/core/widget/art-tree-expand-toggle/index.vue'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import { storeToRefs } from 'pinia'
  import { productionTree } from './production-model'
  const props = withDefaults(
    defineProps<{
      departments: ProductionDepartment[]
      selected: string
      loading: boolean
      error: string
      showAll?: boolean
      allDescription?: string
    }>(),
    {
      showAll: true,
      allDescription: '查看全部部门与产线'
    }
  )
  const emit = defineEmits<{ select: [id: string]; refresh: [] }>()
  const treeRef = ref<InstanceType<typeof ElTree>>()
  const { isAllTenants, tenantOptions } = storeToRefs(useTenantScopeStore())
  const tenantNames = computed(() =>
    Object.fromEntries(tenantOptions.value.map((tenant) => [tenant.id, tenant.tenantName]))
  )
  const departmentSubtitle = (department: ProductionDepartment): string =>
    isAllTenants.value
      ? `${tenantNames.value[department.tenantId] || department.tenantId} · ${department.code}`
      : department.code
  const keyword = ref('')
  const nodes = computed(() => productionTree.listToTree(props.departments))
  const activeCount = computed(() => props.departments.filter((row) => row.enabled).length)
  const defaultExpandedKeys = computed(() => nodes.value.map((row) => row.id))
  const filterNode = (value: string, row: Record<string, unknown>) =>
    !value || `${row.name} ${row.code}`.toLowerCase().includes(value.toLowerCase())
  const selectNode = (row: ProductionDepartment) => emit('select', row.id)
  const organizationIcon = (row: ProductionDepartment): string =>
    ({
      工厂: 'ri:building-4-line',
      车间: 'ri:git-branch-line',
      产线: 'ri:node-tree',
      部门: 'ri:team-line'
    })[row.kind] || 'ri:organization-chart'
  const syncCurrentNode = async (): Promise<void> => {
    await nextTick()
    treeRef.value?.setCurrentKey(props.selected || undefined)
  }
  watch(keyword, (value) => treeRef.value?.filter(value))
  watch(() => props.selected, syncCurrentNode, { immediate: true })
  watch(nodes, async () => {
    await syncCurrentNode()
    treeRef.value?.filter(keyword.value)
  })
</script>
<style scoped lang="scss">
  .production-tree {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;

    :deep(.production-tree__body) {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 12px;
      min-height: 0;
    }

    &__all {
      display: grid;
      grid-template-columns: 36px minmax(0, 1fr) 18px;
      gap: 10px;
      align-items: center;
      width: 100%;
      min-height: 58px;
      padding: 8px 10px;
      margin: 0;
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

      &.is-current {
        box-shadow: inset 3px 0 0 var(--theme-color);
      }

      &:focus-visible {
        outline: 2px solid var(--theme-color);
        outline-offset: 2px;
      }

      > span:first-child {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        color: var(--theme-color);
        background: var(--default-box-color);
        border-radius: var(--el-border-radius-base);
      }

      > span:nth-child(2) {
        display: grid;
        min-width: 0;
      }

      strong {
        color: var(--el-text-color-primary);
      }

      small {
        margin-top: 2px;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 11px;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }

      > svg {
        color: var(--theme-color);
      }
    }

    &__section-label {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-inline: 2px;
      font-size: 12px;
      color: var(--el-text-color-secondary);

      span {
        font-weight: 600;
        color: var(--el-text-color-primary);
      }
    }

    &__scroll {
      flex: 1;
      min-height: 0;
    }

    &__node {
      display: grid;
      flex: 1;
      grid-template-columns: 20px minmax(0, 1fr) auto;
      gap: 7px;
      align-items: center;
      min-width: 0;
      padding-right: 8px;

      > span:nth-child(2) {
        display: grid;
        min-width: 0;
      }

      strong,
      small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      strong {
        font-size: 13px;
        color: var(--el-text-color-primary);
      }

      small {
        margin-top: 1px;
        font-size: 10px;
        color: var(--el-text-color-secondary);
      }
    }

    :deep(.el-tree-node__content) {
      min-height: 48px;
      margin-bottom: 2px;
      border-radius: var(--el-border-radius-base);
    }

    :deep(.el-tree-node.is-current > .el-tree-node__content) {
      background: color-mix(in srgb, var(--theme-color) 10%, var(--default-box-color));
      box-shadow: inset 3px 0 0 var(--theme-color);
    }

    &__check {
      color: var(--theme-color);
    }

    @media (width <= 767px) {
      overflow: hidden;

      :deep(.art-section-card__header) {
        flex-direction: row;
        align-items: center;
        margin-bottom: 10px;
      }

      :deep(.art-section-card__actions) {
        width: auto;
      }

      :deep(.art-section-card__identity p) {
        display: none;
      }
    }
  }
</style>

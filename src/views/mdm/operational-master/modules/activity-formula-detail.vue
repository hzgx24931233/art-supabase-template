<template>
  <div class="formula-detail">
    <ArtSectionCard class="formula-detail__section" preserve-content-structure>
      <ArtSectionTitle title="公式概览" description="核对公式的业务范围、活动口径和当前状态。" />
      <ArtDescriptions
        :data="record"
        :items="overviewItems"
        :columns="4"
        :tablet-columns="2"
        :mobile-columns="1"
        direction="vertical"
        empty-text="—"
      />
    </ArtSectionCard>

    <section class="formula-detail__workspace">
      <aside class="formula-detail__section formula-detail__parameters art-card-xs">
        <header class="formula-detail__heading">
          <div>
            <span>参数范围</span>
            <h3>本用途可引用参数</h3>
          </div>
          <ElTag type="info" effect="plain">{{ parameterCount }} 个参数</ElTag>
        </header>

        <ElTree
          v-if="parameterTree.length"
          :data="parameterTree"
          node-key="id"
          default-expand-all
          :expand-on-click-node="false"
          class="formula-detail__tree"
        >
          <template #default="{ data }">
            <div
              class="formula-detail__node"
              :class="{ 'is-parameter': data.nodeType === 'parameter' }"
            >
              <span class="formula-detail__node-icon">
                <ArtSvgIcon
                  :icon="data.nodeType === 'group' ? 'ri:folder-3-line' : 'ri:braces-line'"
                />
              </span>
              <span class="formula-detail__node-main">
                <strong>{{ data.name }}</strong>
                <small
                  >{{ data.code
                  }}<template v-if="data.activityUnit">
                    · {{ dictLabel('mdmActivityUnit', data.activityUnit) }}</template
                  ></small
                >
              </span>
            </div>
          </template>
          <template #empty>
            <ArtEmptyState
              title="暂无可显示内容"
              description="请调整当前范围或稍后刷新。"
              size="compact"
              :visual-size="64"
            />
          </template>
        </ElTree>
        <ArtEmptyState
          v-else
          class="formula-detail__empty"
          title="当前用途暂无参数"
          description="公式仍可使用已保存的常量或历史表达式。"
          size="compact"
          :visual-size="64"
        />
      </aside>

      <main class="formula-detail__section formula-detail__result art-card-xs">
        <header class="formula-detail__heading">
          <div>
            <span>计算结果</span>
            <h3>公式与业务译文</h3>
          </div>
          <ElTag :type="record.formulaExpression ? 'success' : 'warning'" effect="light">
            {{ record.formulaExpression ? '已配置' : '待完善' }}
          </ElTag>
        </header>

        <div class="formula-detail__expression">
          <span>公式表达式</span>
          <code>{{
            record.formulaExpression || record.planExpression || record.reportExpression || '—'
          }}</code>
        </div>

        <div class="formula-detail__translation">
          <span>公式译文</span>
          <p>{{
            record.formulaTranslation ||
            record.formulaExpression ||
            record.planExpression ||
            record.reportExpression ||
            '—'
          }}</p>
        </div>

        <div
          v-if="record.formulaTokens?.length"
          class="formula-detail__tokens"
          aria-label="公式组成"
        >
          <span
            v-for="(token, index) in record.formulaTokens"
            :key="`${token.type}-${index}-${token.value}`"
            :class="['formula-detail__token', `is-${token.type}`]"
          >
            {{ token.type === 'parameter' ? token.label : token.value }}
          </span>
        </div>

        <div class="formula-detail__note">
          <ArtSvgIcon icon="ri:information-line" />
          <div>
            <strong>公式说明</strong>
            <p>{{ record.description || '暂未填写公式口径说明。' }}</p>
          </div>
        </div>
      </main>
    </section>
  </div>
</template>

<script setup lang="ts">
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import type { ActivityFormulaParameter, OperationalMasterRecord } from '@/api/mdm'
  import {
    activityFormulaPurposeLabel,
    buildActivityFormulaParameterTree
  } from './activity-formula-builder'

  const props = defineProps<{
    record: OperationalMasterRecord
    parameters: ActivityFormulaParameter[]
    tenantOptions: Array<{ label: string; value: string }>
  }>()

  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const parameterTree = computed(() => buildActivityFormulaParameterTree(props.parameters))
  const parameterCount = computed(
    () => props.parameters.filter((item) => item.nodeType === 'parameter').length
  )

  function dictLabel(code: string, value: string): string {
    return getDictMap.value[code]?.find((item) => String(item.value) === value)?.label || value
  }

  const overviewItems = computed<ArtDescriptionItem<OperationalMasterRecord>[]>(() => [
    { key: 'code', label: '公式编码', field: 'code', copyable: true },
    { key: 'name', label: '公式名称', field: 'name' },
    {
      key: 'purpose',
      label: '用途',
      field: 'purpose',
      formatter: (value) => {
        const rawValue = String(value || '')
        return activityFormulaPurposeLabel(rawValue, dictLabel('mdmFormulaPurpose', rawValue))
      }
    },
    {
      key: 'activityTypes',
      label: '活动类型',
      field: 'activityTypes',
      formatter: (value) => {
        const values = Array.isArray(value) && value.length ? value : [props.record.activityType]
        return (
          values
            .filter(Boolean)
            .map((item) => dictLabel('mdmActivityType', String(item)))
            .join('、') || '—'
        )
      }
    },
    {
      key: 'tenantId',
      label: '所属租户',
      field: 'tenantId',
      formatter: (value) =>
        props.tenantOptions.find((item) => item.value === value)?.label || '当前租户'
    },
    {
      key: 'isDefault',
      label: '默认公式',
      field: 'isDefault',
      formatter: (value) => (value ? '是' : '否')
    },
    {
      key: 'enabled',
      label: '使用状态',
      field: 'enabled',
      formatter: (value) => (value ? '启用' : '停用')
    },
    { key: 'remark', label: '备注', field: 'remark' }
  ])
</script>

<style scoped lang="scss">
  .formula-detail {
    display: grid;
    gap: var(--art-space-4);
  }

  .formula-detail__section {
    min-width: 0;
    padding: var(--art-space-4);
    background: var(--el-bg-color);
    border: 1px solid var(--el-border-color-lighter);
  }

  .formula-detail__workspace {
    display: grid;
    grid-template-columns: minmax(260px, 32%) minmax(0, 1fr);
    gap: var(--art-space-4);
  }

  .formula-detail__heading {
    display: flex;
    gap: var(--art-space-3);
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--art-space-4);
  }

  .formula-detail__heading span,
  .formula-detail__expression > span,
  .formula-detail__translation > span {
    font-size: 11px;
    font-weight: 700;
    color: var(--el-color-primary);
    letter-spacing: 0.06em;
  }

  .formula-detail__heading h3 {
    margin: 4px 0 0;
    font-size: 16px;
  }

  .formula-detail__tree {
    min-height: 300px;

    --el-tree-node-hover-bg-color: transparent;

    :deep(.el-tree-node__content) {
      height: auto;
      min-height: 48px;
      padding: 2px 6px 2px 0;
      margin-bottom: 2px;
      border: 1px solid transparent;
      border-radius: var(--el-border-radius-base);
      transition:
        background-color var(--art-motion-duration-fast),
        border-color var(--art-motion-duration-fast);

      &:hover,
      &:focus-within {
        background: color-mix(in srgb, var(--theme-color) 8%, var(--default-box-color)) !important;
        border-color: color-mix(in srgb, var(--theme-color) 20%, transparent);
      }
    }

    :deep(.el-tree-node__expand-icon) {
      color: var(--el-text-color-secondary);
    }
  }

  .formula-detail__node {
    display: flex;
    gap: var(--art-space-2);
    align-items: center;
    width: 100%;
    min-width: 0;
    padding: 7px 4px;
  }

  .formula-detail__node-icon {
    display: grid;
    flex: none;
    place-items: center;
    width: 28px;
    height: 28px;
    color: var(--el-text-color-secondary);
    background: var(--el-fill-color-light);
    border-radius: 8px;
  }

  .formula-detail__node.is-parameter .formula-detail__node-icon {
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
  }

  .formula-detail__node-main {
    display: grid;
    flex: 1;
    min-width: 0;
  }

  .formula-detail__node-main strong,
  .formula-detail__node-main small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .formula-detail__node-main strong {
    font-size: 13px;
    font-weight: 600;
  }

  .formula-detail__node-main small {
    color: var(--el-text-color-secondary);
  }

  .formula-detail__empty {
    min-height: 300px;
  }

  .formula-detail__result {
    display: grid;
    gap: var(--art-space-4);
    align-content: start;
  }

  .formula-detail__expression,
  .formula-detail__translation {
    display: grid;
    gap: var(--art-space-2);
  }

  .formula-detail__expression code {
    min-height: 72px;
    padding: var(--art-space-4);
    font: 600 14px/1.7 var(--art-font-family-mono, monospace);
    color: var(--el-text-color-primary);
    overflow-wrap: anywhere;
    white-space: pre-wrap;
    background: var(--el-fill-color-extra-light);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--art-control-radius);
  }

  .formula-detail__translation p {
    padding: var(--art-space-4);
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    line-height: 1.7;
    color: var(--el-text-color-primary);
    background: var(--el-color-primary-light-9);
    border-left: 3px solid var(--el-color-primary);
    border-radius: 0 var(--art-control-radius) var(--art-control-radius) 0;
  }

  .formula-detail__tokens {
    display: flex;
    flex-wrap: wrap;
    gap: var(--art-space-2);
  }

  .formula-detail__token {
    padding: 6px 10px;
    font-size: 12px;
    color: var(--el-text-color-regular);
    background: var(--el-fill-color-light);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 7px;
  }

  .formula-detail__token.is-parameter {
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
    border-color: var(--el-color-primary-light-7);
  }

  .formula-detail__note {
    display: flex;
    gap: var(--art-space-3);
    padding: var(--art-space-3);
    color: var(--el-text-color-secondary);
    background: var(--el-fill-color-extra-light);
    border-radius: var(--art-control-radius);
  }

  .formula-detail__note > svg {
    flex: none;
    margin-top: 2px;
    color: var(--el-color-primary);
  }

  .formula-detail__note strong {
    color: var(--el-text-color-primary);
  }

  .formula-detail__note p {
    margin: 4px 0 0;
    line-height: 1.6;
  }

  @media (width <= 900px) {
    .formula-detail__workspace {
      grid-template-columns: 1fr;
    }

    .formula-detail__tree,
    .formula-detail__empty {
      min-height: 220px;
    }
  }
</style>

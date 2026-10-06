<template>
  <ArtDrawer ref="drawerRef">
    <div class="business-type-detail">
      <ArtEntitySummary
        icon="ri:git-branch-line"
        eyebrow="BUSINESS TYPE"
        :title="detail.record.businessTypeName"
        :description="`${detail.record.businessTypeCode} · ${detail.menuPath || '未关联菜单'}`"
      >
        <template #aside>
          <ElTag
            :type="detail.record.tagStyle || 'primary'"
            effect="light"
            round
            :style="tagPreviewStyle"
          >
            {{ detail.record.businessTypeName }}
          </ElTag>
        </template>
      </ArtEntitySummary>

      <ArtSectionCard title="类型定义" subtitle="业务类型的单据归属、稳定标识与来源关系。">
        <ArtDescriptions :data="detail" :items="definitionItems" :columns="2">
          <template #item-isDefault>
            <ArtDictDisplay
              dict-code="commonBoolean"
              :value="String(detail.record.isDefault)"
              display="tag"
            />
          </template>
          <template #item-enabled>
            <ArtDictDisplay
              dict-code="commonBoolean"
              :value="String(detail.record.enabled)"
              display="tag"
            />
          </template>
          <template #item-inventoryDirection>
            <ArtDictDisplay
              v-if="detail.record.inventoryDirection"
              dict-code="mdmBusinessInventoryDirection"
              :value="detail.record.inventoryDirection"
              display="auto"
            />
            <span v-else>--</span>
          </template>
          <template #item-ownerType>
            <ArtDictDisplay
              v-if="detail.record.ownerType"
              dict-code="mdmBusinessOwnerType"
              :value="detail.record.ownerType"
              display="auto"
            />
            <span v-else>--</span>
          </template>
          <template #item-inventoryAccounting>
            <ArtDictDisplay
              dict-code="commonBoolean"
              :value="String(detail.record.inventoryAccounting)"
              display="tag"
            />
          </template>
        </ArtDescriptions>
      </ArtSectionCard>

      <ArtSectionCard title="显示与审计" subtitle="列表展示风格以及最近一次维护信息。">
        <ArtDescriptions :data="detail" :items="auditItems" :columns="2">
          <template #item-tagStyle>
            <ElTag
              :type="detail.record.tagStyle || 'primary'"
              effect="light"
              :style="tagPreviewStyle"
            >
              {{ detail.record.tagStyle || '默认' }}
            </ElTag>
          </template>
          <template #item-textColor>
            <span class="business-type-detail__color">
              <i :style="{ backgroundColor: detail.record.textColor || 'currentColor' }" />
              {{ detail.record.textColor || '跟随标签样式' }}
            </span>
          </template>
        </ArtDescriptions>
      </ArtSectionCard>
    </div>
  </ArtDrawer>
</template>

<script setup lang="ts">
  import type { CSSProperties } from 'vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import { formatWithDayjs } from '@/utils/time'
  import type { BusinessTypeRecord } from '@/api/mdm'

  export interface BusinessTypeDetailData {
    record: BusinessTypeRecord
    menuPath: string
  }

  const drawerRef = ref<ArtDrawerExpose<BusinessTypeDetailData>>()
  const detail = reactive<BusinessTypeDetailData>({
    record: {
      id: '',
      tenantId: '',
      documentTypeId: '',
      businessTypeCode: '',
      businessTypeName: '',
      isDefault: false,
      sourceBusinessTypeId: null,
      inventoryDirection: null,
      ownerType: null,
      inventoryAccounting: false,
      remark: '',
      sortOrder: 10,
      textColor: '',
      tagStyle: 'primary',
      enabled: true
    },
    menuPath: ''
  })

  const tagPreviewStyle = computed<CSSProperties>(() => ({
    color: detail.record.textColor || undefined
  }))
  const definitionItems: ArtDescriptionItem<BusinessTypeDetailData>[] = [
    { key: 'menuPath', label: '所属菜单功能', field: 'menuPath', span: 2 },
    {
      key: 'documentType',
      label: '所属单据类型',
      value: (data: BusinessTypeDetailData) =>
        data.record.documentType
          ? `${data.record.documentType.documentTypeName} · ${data.record.documentType.documentTypeCode}`
          : '--',
      span: 2
    },
    {
      key: 'businessTypeCode',
      label: '业务类型编号',
      field: 'record.businessTypeCode',
      copyable: true
    },
    { key: 'businessTypeName', label: '业务类型名称', field: 'record.businessTypeName' },
    { key: 'isDefault', label: '默认业务类型', field: 'record.isDefault' },
    {
      key: 'sourceBusinessType',
      label: '源业务类型',
      value: (data: BusinessTypeDetailData) =>
        data.record.sourceBusinessType
          ? `${data.record.sourceBusinessType.businessTypeName} · ${data.record.sourceBusinessType.businessTypeCode}`
          : '--',
      span: 2
    },
    { key: 'inventoryDirection', label: '库存方向', field: 'record.inventoryDirection' },
    { key: 'ownerType', label: '货主类型', field: 'record.ownerType' },
    {
      key: 'inventoryAccounting',
      label: '存货核算标志',
      field: 'record.inventoryAccounting'
    },
    { key: 'enabled', label: '状态', field: 'record.enabled' },
    { key: 'sortOrder', label: '排序', field: 'record.sortOrder' },
    {
      key: 'tenantName',
      label: '所属租户',
      value: (data: BusinessTypeDetailData) => data.record.tenant?.tenantName
    },
    { key: 'remark', label: '备注', field: 'record.remark', span: 2 }
  ]
  const auditItems: ArtDescriptionItem<BusinessTypeDetailData>[] = [
    { key: 'tagStyle', label: '标签样式', field: 'record.tagStyle' },
    { key: 'textColor', label: '文字颜色', field: 'record.textColor' },
    { key: 'createBy', label: '创建人', field: 'record.createBy' },
    {
      key: 'createTime',
      label: '创建时间',
      value: (data: BusinessTypeDetailData) => formatWithDayjs(data.record.createTime) || '--'
    },
    { key: 'updateBy', label: '更新人', field: 'record.updateBy' },
    {
      key: 'updateTime',
      label: '更新时间',
      value: (data: BusinessTypeDetailData) => formatWithDayjs(data.record.updateTime) || '--'
    }
  ]

  const handleOpen = async (data: BusinessTypeDetailData): Promise<void> => {
    Object.assign(detail, data)
    await drawerRef.value?.handleOpen(data, {
      title: '查看业务类型',
      subtitle: '核对业务归属、默认状态与展示配置。',
      size: 'md',
      showFooter: false,
      contentMaxHeight: 'calc(100vh - 118px)'
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .business-type-detail {
    display: grid;
    gap: var(--art-space-4);

    &__color {
      display: inline-flex;
      gap: var(--art-space-2);
      align-items: center;

      i {
        width: 12px;
        height: 12px;
        border: 1px solid var(--art-card-border);
        border-radius: 50%;
      }
    }
  }
</style>

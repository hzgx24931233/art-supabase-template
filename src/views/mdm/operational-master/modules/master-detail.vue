<template>
  <div class="operational-master-detail">
    <section class="operational-master-detail__section">
      <ArtSectionTitle title="主档信息" />
      <ArtDescriptions
        :data="record"
        :items="primaryItems"
        :columns="2"
        :tablet-columns="2"
        :mobile-columns="1"
        empty-text="—"
      />
    </section>

    <section class="operational-master-detail__section">
      <ArtSectionTitle title="补充与审计" />
      <ArtDescriptions
        :data="record"
        :items="auditItems"
        :columns="2"
        :tablet-columns="2"
        :mobile-columns="1"
        empty-text="—"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import type {
    MasterGroup,
    MasterReferenceOption,
    OperationalMasterRecord,
    OperationalMasterReferences
  } from '@/api/mdm'
  import type { MasterFieldConfig, OperationalMasterConfig } from './master-config'

  const props = defineProps<{
    config: OperationalMasterConfig
    record: OperationalMasterRecord
    groups: MasterGroup[]
    references: OperationalMasterReferences
    tenantOptions: Array<{ label: string; value: string }>
  }>()

  function referenceLabel(items: MasterReferenceOption[], id: unknown): string {
    if (!id) return '—'
    const ids = Array.isArray(id) ? id : [id]
    return ids.map((value) => items.find((item) => item.id === value)?.name || '未识别').join('、')
  }

  function formatter(
    field: MasterFieldConfig
  ): ArtDescriptionItem<OperationalMasterRecord>['formatter'] {
    if (field.key === 'groupId') {
      return (value) => props.groups.find((item) => item.id === value)?.name || '未分组'
    }
    if (field.reference) {
      return (value) => referenceLabel(props.references[field.reference!], value)
    }
    if (field.key === 'ownerId' || field.key === 'salespersonId') {
      return (value) => referenceLabel(props.references.employees, value)
    }
    if (field.key === 'responsiblePersonId') {
      return (value) => referenceLabel(props.references.personnel, value)
    }
    if (Array.isArray(props.record[field.key])) {
      return (value) => (Array.isArray(value) && value.length ? value.join('、') : '—')
    }
    return undefined
  }

  function toDescriptionItem(
    field: MasterFieldConfig
  ): ArtDescriptionItem<OperationalMasterRecord> {
    return {
      key: String(field.key),
      label: field.label,
      field: String(field.key),
      dictCode: field.dictCode,
      dictDisplay: field.key === 'enabled' ? 'tag' : 'text',
      formatter: field.dictCode ? undefined : formatter(field),
      copyable: field.key === props.config.codeKey,
      span: field.type === 'textarea' || field.key === 'addressDetail' ? 2 : 1
    }
  }

  const primaryItems = computed<ArtDescriptionItem<OperationalMasterRecord>[]>(() => [
    {
      key: 'tenantId',
      label: '所属租户',
      field: 'tenantId',
      formatter: (value) =>
        props.tenantOptions.find((item) => item.value === value)?.label || '当前租户'
    },
    ...props.config.fields
      .filter((field) => !['remark'].includes(String(field.key)))
      .map(toDescriptionItem)
  ])

  const auditItems = computed<ArtDescriptionItem<OperationalMasterRecord>[]>(() => [
    {
      key: 'remark',
      label: '备注',
      field: 'remark',
      span: 2
    },
    {
      key: 'createTime',
      label: '创建时间',
      field: 'createTime',
      format: 'datetime'
    },
    {
      key: 'updateTime',
      label: '更新时间',
      field: 'updateTime',
      format: 'datetime'
    }
  ])
</script>

<style scoped lang="scss">
  .operational-master-detail {
    display: grid;
    gap: 22px;

    &__section {
      min-width: 0;
    }

    :deep(.el-descriptions__label) {
      width: 132px;
    }
  }
</style>

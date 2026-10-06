<template>
  <ArtDialog
    ref="dialogRef"
    size="xl"
    :show-cancel-button="false"
    confirm-text="关闭"
    content-max-height="76vh"
    show-fullscreen-button
  >
    <div v-if="record" class="bom-detail-dialog">
      <section class="bom-detail-dialog__identity art-card-xs">
        <span class="bom-detail-dialog__identity-icon" aria-hidden="true">
          <ArtSvgIcon icon="ri:git-merge-line" />
        </span>
        <div class="bom-detail-dialog__identity-copy">
          <small>BILL OF MATERIALS</small>
          <h3>{{ record.material?.materialName || '未关联父项物料' }}</h3>
          <p>{{ materialIdentity(record) }}</p>
        </div>
        <ArtDictDisplay dict-code="mdmBomStatus" :value="record.status" display="tag" />
      </section>

      <ArtSectionCard
        title="BOM 身份"
        subtitle="父项物料、版本用途与当前生命周期。"
        preserve-content-structure
      >
        <ArtDescriptions
          :data="record"
          :items="identityItems"
          :columns="3"
          :tablet-columns="2"
          empty-text="—"
        />
      </ArtSectionCard>

      <ArtSectionCard
        title="数量与有效期"
        subtitle="基准计量口径及版本生效范围。"
        preserve-content-structure
      >
        <ArtDescriptions
          :data="record"
          :items="validityItems"
          :columns="3"
          :tablet-columns="2"
          empty-text="—"
        />
      </ArtSectionCard>

      <ArtSectionCard
        title="组件明细"
        :subtitle="`共 ${record.items.length} 项组件；用量按当前 BOM 基准口径展示。`"
        preserve-content-structure
      >
        <ArtTable
          class="bom-detail-dialog__component-table"
          :data="record.items"
          :columns="componentColumns"
          row-key="id"
          :pagination="false"
          table-layout="fixed"
          scrollbar-always-on
          :max-height="360"
          empty-text="暂无 BOM 组件"
          empty-description="当前 BOM 尚未维护组件明细。"
        />
      </ArtSectionCard>

      <ArtSectionCard
        title="审计信息"
        subtitle="记录该版本的创建与最近维护信息。"
        preserve-content-structure
      >
        <ArtDescriptions
          :data="record"
          :items="auditItems"
          :columns="2"
          :tablet-columns="2"
          empty-text="—"
        />
      </ArtSectionCard>
    </div>
  </ArtDialog>
</template>

<script setup lang="tsx">
  import { createDateTimeFormatter } from '@/utils/ui/format'

  import dayjs from 'dayjs'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
  import type { ColumnOption } from '@/types'
  import type { BomItem, BomRecord } from '@/api/mdm'

  defineOptions({ name: 'MdmBomDetailDialog' })

  const dialogRef = ref<ArtDialogExpose<BomRecord>>()
  const record = shallowRef<BomRecord>()

  const formatQuantity = (value: unknown, maximumFractionDigits = 6): string => {
    const amount = Number(value)
    return Number.isFinite(amount) ? amount.toLocaleString('zh-CN', { maximumFractionDigits }) : '—'
  }

  const formatDateTime = createDateTimeFormatter({
    format: 'YYYY-MM-DD HH:mm',
    emptyText: '—',
    invalidText: '—'
  })

  const formatDate = (value?: string | null): string =>
    value && dayjs(value).isValid() ? dayjs(value).format('YYYY-MM-DD') : '—'

  const formatText = (value?: string | null): string => value?.trim() || '—'

  const materialIdentity = (row: BomRecord): string =>
    [row.material?.materialCode, row.material?.specificationModel].filter(Boolean).join(' · ') ||
    '—'

  const unitIdentity = (name?: string | null, code?: string | null): string =>
    [name, code].filter(Boolean).join(' · ') || '—'

  const identityItems: ArtDescriptionItem<BomRecord>[] = [
    {
      key: 'material',
      label: '父项物料',
      value: (row: BomRecord) =>
        [row.material?.materialName, row.material?.materialCode, row.material?.specificationModel]
          .filter(Boolean)
          .join(' · ')
    },
    { key: 'bomCode', label: 'BOM 编码', field: 'bomCode', copyable: true },
    { key: 'version', label: '版本', field: 'version' },
    { key: 'purpose', label: 'BOM 用途', field: 'purpose', dictCode: 'mdmBomPurpose' },
    {
      key: 'processRoute',
      label: '组件分配路线',
      value: (row: BomRecord) =>
        row.processRoute
          ? `${row.processRoute.name} · ${row.processRoute.code} · ${row.processRoute.version}`
          : '未关联工艺路线'
    },
    { key: 'status', label: '生命周期', field: 'status', dictCode: 'mdmBomStatus' },
    { key: 'sort', label: '显示顺序', field: 'sort', format: 'number' }
  ]

  const validityItems: ArtDescriptionItem<BomRecord>[] = [
    {
      key: 'baseQuantity',
      label: '基准数量',
      value: (row: BomRecord) => formatQuantity(row.baseQuantity)
    },
    {
      key: 'baseUnit',
      label: '基准单位',
      value: (row: BomRecord) => unitIdentity(row.baseUnit?.unitName, row.baseUnit?.unitCode)
    },
    { key: 'effectiveFrom', label: '生效日期', field: 'effectiveFrom', format: 'date' },
    { key: 'effectiveTo', label: '失效日期', field: 'effectiveTo', format: 'date' },
    { key: 'description', label: '版本说明', field: 'description', span: 2 }
  ]

  const auditItems: ArtDescriptionItem<BomRecord>[] = [
    { key: 'createBy', label: '创建人', field: 'createBy' },
    {
      key: 'createTime',
      label: '创建时间',
      value: (row: BomRecord) => formatDateTime(row.createTime)
    },
    { key: 'updateBy', label: '更新人', field: 'updateBy' },
    {
      key: 'updateTime',
      label: '更新时间',
      value: (row: BomRecord) => formatDateTime(row.updateTime)
    }
  ]

  const componentIdentity = (row: BomItem) => {
    const description = row.component?.description?.trim() || '未维护物料描述'
    const detail =
      [row.component?.materialCode, row.component?.specificationModel]
        .filter(Boolean)
        .join(' · ') || '—'
    return (
      <div class="bom-detail-dialog__material">
        <span aria-hidden="true">
          <ArtSvgIcon icon="ri:box-3-line" />
        </span>
        <div>
          <strong title={description}>{description}</strong>
          <small title={detail}>{detail}</small>
        </div>
      </div>
    )
  }

  const componentColumns: ColumnOption<BomItem>[] = [
    { type: 'index', label: '#', width: 48, align: 'center', fixed: 'left' },
    {
      prop: 'componentMaterialId',
      label: '组件物料',
      width: 300,
      fixed: 'left',
      formatter: componentIdentity
    },
    { prop: 'sequenceNo', label: '行号', width: 84, align: 'center' },
    {
      prop: 'componentTypeId',
      label: '组件类型',
      width: 130,
      formatter: (row) => row.componentType?.componentTypeName || '—'
    },
    {
      prop: 'mrpEnabled',
      label: 'MRP 运算',
      width: 100,
      align: 'center',
      dict: {
        code: 'commonBoolean',
        display: 'text',
        value: (row) => String(row.mrpEnabled)
      }
    },
    {
      prop: 'materialCode',
      label: '物料编码',
      width: 180,
      formatter: (row) => row.component?.materialCode || '—'
    },
    {
      prop: 'specificationModel',
      label: '规格型号',
      width: 180,
      formatter: (row) => row.component?.specificationModel || '—'
    },
    {
      prop: 'materialSource',
      label: '物料来源',
      width: 120,
      dict: {
        code: 'mdmMaterialSource',
        value: (row) => row.component?.materialSource
      }
    },
    {
      prop: 'virtualPart',
      label: '虚拟件项',
      width: 100,
      align: 'center',
      dict: {
        code: 'commonBoolean',
        display: 'text',
        value: (row) => String(row.component?.specialPurchaseType === 'virtual_part')
      }
    },
    {
      prop: 'quantity',
      label: '用量',
      width: 120,
      align: 'right',
      formatter: (row) => formatQuantity(row.quantity)
    },
    {
      prop: 'unitId',
      label: '单位',
      minWidth: 150,
      formatter: (row) => (
        <BusinessTableIdentityCell primary={row.unit?.unitName} secondary={row.unit?.unitCode} />
      )
    },
    {
      prop: 'defaultIssueWarehouseId',
      label: '默认发料仓库',
      minWidth: 200,
      formatter: (row) => {
        const warehouse = row.defaultIssueWarehouse || row.component?.defaultWarehouse
        return (
          <BusinessTableIdentityCell
            primary={warehouse?.warehouseName}
            secondary={warehouse?.warehouseCode}
          />
        )
      }
    },
    {
      prop: 'issueMethod',
      label: '领送料方式',
      width: 160,
      dict: { code: 'mdmMaterialIssueMethod' }
    },
    {
      prop: 'backflushMethod',
      label: '倒冲',
      width: 140,
      dict: { code: 'mdmMaterialBackflushMethod' }
    },
    {
      prop: 'overIssueControlMethod',
      label: '超发控制方式',
      width: 180,
      dict: { code: 'mdmMaterialOverIssueControl' }
    },
    {
      prop: 'effectiveFrom',
      label: '生效日期',
      width: 150,
      formatter: (row) => formatDate(row.effectiveFrom)
    },
    {
      prop: 'effectiveTo',
      label: '失效日期',
      width: 150,
      formatter: (row) => formatDate(row.effectiveTo)
    },
    {
      prop: 'projectText',
      label: '项目文本',
      width: 220,
      formatter: (row) => formatText(row.projectText)
    },
    {
      prop: 'scrapRate',
      label: '损耗率 %',
      width: 120,
      align: 'right',
      formatter: (row) => formatQuantity(row.scrapRate, 2)
    },
    {
      prop: 'processSequenceNo',
      label: '工序序列',
      width: 100,
      align: 'center',
      formatter: (row) => row.processRouteStep?.sequence?.sequenceNo ?? '—'
    },
    {
      prop: 'processSequenceType',
      label: '序列类型',
      width: 120,
      dict: {
        code: 'mdmProcessRouteSequenceType',
        value: (row) => row.processRouteStep?.sequence?.sequenceType
      }
    },
    {
      prop: 'processRouteStepId',
      label: '分配工序',
      width: 220,
      formatter: (row) => {
        const step = row.processRouteStep
        if (!step) return formatText(row.operationName)
        return (
          <BusinessTableIdentityCell
            primary={step.name || '未命名工序'}
            secondary={step.code}
            tertiary={step.sequence?.sequenceNo ? `序列 ${step.sequence.sequenceNo}` : undefined}
          />
        )
      }
    },
    {
      prop: 'workCenter',
      label: '工作中心',
      width: 180,
      formatter: (row) =>
        row.processRouteStep?.workCenter?.name ||
        (row.processRouteStep?.workCenterIds?.length ? '已配置工作中心' : '未指定')
    },
    {
      prop: 'positionNo',
      label: '位号',
      width: 140,
      formatter: (row) => formatText(row.positionNo)
    },
    {
      prop: 'remark',
      label: '备注',
      width: 220,
      formatter: (row) => formatText(row.remark)
    }
  ]

  const handleOpen = async (row: BomRecord): Promise<void> => {
    record.value = row
    await dialogRef.value?.handleOpen(row, {
      title: 'BOM 结构详情',
      subtitle: `${row.bomCode} · ${row.version}`
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .bom-detail-dialog {
    display: grid;
    gap: var(--art-space-3);
    min-width: 0;

    &__identity {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: var(--art-space-3);
      align-items: center;
      padding: var(--art-space-4);
      background: color-mix(in srgb, var(--theme-color) 7%, var(--el-bg-color));
    }

    &__identity-icon,
    :deep(.bom-detail-dialog__material > span) {
      display: grid;
      flex: none;
      place-items: center;
      color: var(--theme-color);
      background: var(--el-bg-color);
      border-radius: var(--el-border-radius-base);
    }

    &__identity-icon {
      width: 44px;
      height: 44px;
      font-size: 21px;
    }

    &__identity-copy {
      min-width: 0;

      small,
      h3,
      p {
        display: block;
        margin: 0;
        overflow-wrap: anywhere;
      }

      small {
        font-size: var(--art-font-size-caption);
        font-weight: 700;
        color: var(--theme-color);
        letter-spacing: 0.08em;
      }

      h3 {
        margin-top: var(--art-space-1);
        font-size: 16px;
        color: var(--el-text-color-primary);
      }

      p {
        margin-top: var(--art-space-1);
        font-family: var(--art-font-family-mono, Consolas, monospace);
        font-size: var(--art-font-size-caption);
        color: var(--el-text-color-secondary);
      }
    }

    :deep(.bom-detail-dialog__material) {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr);
      gap: var(--art-space-2);
      align-items: center;
      min-width: 0;

      > span {
        width: 34px;
        height: 34px;
        background: color-mix(in srgb, var(--theme-color) 8%, var(--el-bg-color));
      }

      > div,
      strong,
      small {
        min-width: 0;
      }

      strong,
      small {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      strong {
        color: var(--el-text-color-primary);
      }

      small {
        margin-top: var(--art-space-1);
        font-family: var(--art-font-family-mono, Consolas, monospace);
        font-size: var(--art-font-size-caption);
        color: var(--el-text-color-secondary);
      }
    }

    :deep(.art-section-card) {
      min-width: 0;
    }

    &__component-table {
      width: 100%;
      min-width: 0;
    }

    :deep(.el-table .cell) {
      font-variant-numeric: tabular-nums;
    }

    @media (width <= 760px) {
      &__identity {
        grid-template-columns: auto minmax(0, 1fr);

        > .el-tag {
          grid-column: 1 / -1;
          justify-self: start;
        }
      }
    }
  }
</style>

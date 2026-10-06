<template>
  <div class="activity-editor">
    <div v-if="!readonly" class="activity-editor__toolbar">
      <div>
        <ElButton type="primary" @click="addRow">新增</ElButton>
        <ElButton :disabled="!selectedRows.length" @click="removeRows">删除</ElButton>
        <ElButton :disabled="currentIndex <= 0" @click="moveCurrent(-1)">上移</ElButton>
        <ElButton
          :disabled="currentIndex < 0 || currentIndex >= model.length - 1"
          @click="moveCurrent(1)"
          >下移</ElButton
        >
      </div>
      <span>点击行后可调整顺序；勾选一行或多行后可批量删除。</span>
    </div>

    <ArtTable
      ref="tableRef"
      :data="model"
      :columns="columns"
      :height="tableHeight"
      :empty-height="tableHeight"
      :show-pagination="false"
      :show-table-header="false"
      :highlight-current-row="!readonly"
      :fixed-column-min-width="960"
      empty-text="暂无活动信息"
      empty-description="新增活动后，可配置计划与汇报活动量的计算公式。"
      @current-change="setCurrentRow"
      @selection-change="setSelectedRows"
    />
  </div>
</template>

<script setup lang="tsx">
  import { computed, ref } from 'vue'
  import { storeToRefs } from 'pinia'
  import { ElButton, ElInput, ElInputNumber, ElOption, ElSelect, ElSwitch } from 'element-plus'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import type {
    ArtTableExpose,
    ArtTableValidationResult
  } from '@/components/core/tables/art-table/index.vue'
  import type { ColumnOption } from '@/types'
  import { useUserStore } from '@/store/modules/user'
  import type { WorkCenterActivityInput, WorkCenterReference } from '@/api/mdm'

  const props = defineProps<{
    formulas: WorkCenterReference[]
    fullscreen?: boolean
    readonly?: boolean
  }>()
  const model = defineModel<WorkCenterActivityInput[]>({ required: true })
  const { getDictMap } = storeToRefs(useUserStore())
  const tableRef = ref<ArtTableExpose>()
  const currentRow = ref<WorkCenterActivityInput>()
  const selectedRows = ref<WorkCenterActivityInput[]>([])
  const currentIndex = computed(() =>
    currentRow.value ? model.value.indexOf(currentRow.value) : -1
  )
  const tableHeight = computed(() => (props.fullscreen ? 'calc(100vh - 330px)' : '440px'))

  const dictOptions = (code: string) => getDictMap.value[code] ?? []
  const formulaLabel = (id: string | null) => {
    const formula = props.formulas.find((item) => item.id === id)
    return formula ? `${formula.name} · ${formula.code}` : '—'
  }
  const dictDisplay = (code: string, value: string) => (
    <ArtDictDisplay dictCode={code} value={value} display="text" />
  )
  const select = (
    row: WorkCenterActivityInput,
    field: 'activityName' | 'activityType' | 'maintenanceRule' | 'activityUnit',
    code: string,
    placeholder: string
  ) =>
    props.readonly ? (
      dictDisplay(code, row[field])
    ) : (
      <ElSelect v-model={row[field]} placeholder={placeholder} filterable clearable class="w-full">
        {dictOptions(code).map((item) => (
          <ElOption key={item.value} label={item.label} value={item.value} />
        ))}
      </ElSelect>
    )

  const formulaSelect = (
    row: WorkCenterActivityInput,
    field: 'planFormulaId' | 'reportFormulaId'
  ) =>
    props.readonly ? (
      <span title={formulaLabel(row[field])}>{formulaLabel(row[field])}</span>
    ) : (
      <ElSelect
        v-model={row[field]}
        filterable
        clearable
        placeholder="请选择活动公式"
        onChange={(id: string) => applyFormulaType(row, id)}
        class="w-full"
      >
        {props.formulas.map((item) => (
          <ElOption key={item.id} label={`${item.name} · ${item.code}`} value={item.id} />
        ))}
      </ElSelect>
    )

  const columns = computed<ColumnOption<WorkCenterActivityInput>[]>(() => [
    ...(!props.readonly ? [{ type: 'selection' as const, width: 48, fixed: 'left' as const }] : []),
    { type: 'globalIndex', label: '#', width: 52, fixed: 'left' },
    {
      prop: 'activityName',
      label: '活动名称',
      minWidth: 150,
      required: true,
      requiredMessage: '请选择活动名称',
      formatter: (row) => select(row, 'activityName', 'mdmWorkCenterActivityName', '请选择活动名称')
    },
    {
      prop: 'activityType',
      label: '活动类型',
      minWidth: 128,
      required: true,
      requiredMessage: '请选择活动类型',
      formatter: (row) => select(row, 'activityType', 'mdmActivityType', '请选择活动类型')
    },
    {
      prop: 'maintenanceRule',
      label: '维护规则',
      minWidth: 132,
      required: true,
      requiredMessage: '请选择维护规则',
      formatter: (row) =>
        select(row, 'maintenanceRule', 'mdmWorkCenterMaintenanceRule', '请选择维护规则')
    },
    {
      prop: 'baseQuantity',
      label: '基数数量',
      minWidth: 132,
      align: 'right',
      required: true,
      rules: {
        validator: ({ value }) => Number.isFinite(Number(value)) && Number(value) >= 0,
        message: '基数数量不能小于 0'
      },
      formatter: (row) =>
        props.readonly ? (
          <span class="tabular-nums">{Number(row.baseQuantity).toFixed(2)}</span>
        ) : (
          <ElInputNumber
            v-model={row.baseQuantity}
            min={0}
            precision={2}
            controls-position="right"
          />
        )
    },
    {
      prop: 'activityUnit',
      label: '活动单位',
      minWidth: 120,
      required: true,
      requiredMessage: '请选择活动单位',
      formatter: (row) => select(row, 'activityUnit', 'mdmActivityUnit', '请选择活动单位')
    },
    {
      prop: 'planFormulaId',
      label: '计划活动量公式',
      minWidth: 220,
      formatter: (row) => formulaSelect(row, 'planFormulaId')
    },
    {
      prop: 'reportFormulaId',
      label: '汇报活动量公式',
      minWidth: 220,
      formatter: (row) => formulaSelect(row, 'reportFormulaId')
    },
    {
      prop: 'backflush',
      label: '倒冲',
      width: 92,
      align: 'center',
      formatter: (row) =>
        props.readonly ? (
          dictDisplay('commonBoolean', String(row.backflush))
        ) : (
          <ElSwitch v-model={row.backflush} aria-label="倒冲" />
        )
    },
    {
      prop: 'remark',
      label: '备注',
      minWidth: 200,
      formatter: (row) =>
        props.readonly ? (
          <span title={row.remark || '—'}>{row.remark || '—'}</span>
        ) : (
          <ElInput v-model={row.remark} maxlength={500} placeholder="填写备注" />
        )
    }
  ])

  function applyFormulaType(row: WorkCenterActivityInput, formulaId: string) {
    if (row.activityType) return
    const formula = props.formulas.find((item) => item.id === formulaId)
    if (formula?.activityType) row.activityType = formula.activityType
  }

  function addRow() {
    model.value.push({
      activityName: '',
      activityType: '',
      maintenanceRule: 'no_check',
      baseQuantity: 0,
      activityUnit: 'minute',
      planFormulaId: null,
      reportFormulaId: null,
      backflush: false,
      remark: '',
      sort: model.value.length
    })
    currentRow.value = model.value.at(-1)
  }

  function removeRows() {
    const selected = new Set(selectedRows.value)
    model.value = model.value.filter((row) => !selected.has(row))
    selectedRows.value = []
    if (currentRow.value && selected.has(currentRow.value)) currentRow.value = undefined
    normalizeSort()
  }

  function moveCurrent(delta: number) {
    const index = currentIndex.value
    const target = index + delta
    if (index < 0 || target < 0 || target >= model.value.length) return
    ;[model.value[index], model.value[target]] = [model.value[target], model.value[index]]
    model.value = [...model.value]
    normalizeSort()
    tableRef.value?.elTableRef?.setCurrentRow(currentRow.value)
  }

  function normalizeSort() {
    model.value.forEach((row, index) => (row.sort = index))
  }

  function setCurrentRow(row?: WorkCenterActivityInput) {
    currentRow.value = row
  }

  function setSelectedRows(rows: WorkCenterActivityInput[]) {
    selectedRows.value = rows
  }

  async function validate(): Promise<ArtTableValidationResult | undefined> {
    return tableRef.value?.validate()
  }

  defineExpose({ validate })
</script>

<style scoped lang="scss">
  .activity-editor {
    display: grid;
    gap: var(--art-space-3);
    min-width: 0;

    &__toolbar {
      display: flex;
      gap: var(--art-space-3);
      align-items: center;
      justify-content: space-between;

      > div {
        display: flex;
        flex-wrap: wrap;
        gap: var(--art-space-2);
      }

      :deep(.el-button + .el-button) {
        margin-left: 0;
      }

      > span {
        font-size: var(--art-font-size-caption);
        line-height: 1.5;
        color: var(--el-text-color-secondary);
        text-align: right;
      }
    }

    :deep(.art-table) {
      min-width: 0;
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--el-border-radius-base);
    }

    :deep(.el-select),
    :deep(.el-input-number) {
      width: 100%;
    }
  }

  @media (width <= 900px) {
    .activity-editor__toolbar {
      flex-direction: column;
      align-items: flex-start;

      > span {
        text-align: left;
      }
    }
  }
</style>

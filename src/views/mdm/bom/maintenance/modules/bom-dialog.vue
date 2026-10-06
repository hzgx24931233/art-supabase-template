<template>
  <ArtDialog ref="dialogRef" width="1440px" show-fullscreen-button>
    <div class="bom-dialog">
      <ArtEntitySummary
        icon="ri:git-merge-line"
        eyebrow="BILL OF MATERIALS"
        :title="formatBomMaterialDescription(selectedParent[0]) || '选择父项物料建立 BOM'"
        :description="[form.bomCode || '待定义编码', form.version].filter(Boolean).join(' · ')"
      >
        <template #aside>
          <ArtDictDisplay dict-code="mdmBomStatus" :value="form.status" display="tag" />
        </template>
      </ArtEntitySummary>

      <ArtForm
        ref="formRef"
        v-model="form"
        :items="formItems"
        :rules="rules"
        :span="8"
        :gutter="18"
        label-position="top"
        :show-reset="false"
        :show-submit="false"
        root-class="bom-dialog__form"
      >
        <template #materialId>
          <ArtMaterialSelect
            v-model="form.materialId"
            :selected-data="selectedParent"
            :api-fn="fetchMaterials"
            :categories="materialCategories"
            dialog-width="1600px"
            subtitle="按物料分类筛选；父项物料决定 BOM 的基本计量口径"
            placeholder="请选择父项物料"
            empty-description="请先维护物料编码后再建立 BOM。"
            @change="handleParentChange"
          />
        </template>
      </ArtForm>

      <ElAlert
        v-if="form.materialId && !routeLoading && !processRoutes.length"
        type="warning"
        :closable="false"
        show-icon
        title="该父项物料尚未维护可用工艺路线"
        description="可以继续维护 BOM；建立工艺路线后再次编辑，未分配组件会自动归入第一道工序。"
      />

      <section class="bom-dialog__components">
        <header>
          <div>
            <strong>组件明细</strong
            ><small>按装配顺序维护；新增或未分配组件默认归入第一道工序</small>
          </div>
          <div class="bom-dialog__component-actions">
            <ElButton
              v-if="canMaintainBom"
              :disabled="!firstProcessStep || !form.items.length"
              @click="assignAllComponentsToFirstStep"
            >
              <ArtSvgIcon icon="ri:route-line" />全部归首工序
            </ElButton>
            <ArtTableSingleSelect
              v-model="batchSelectedStepId"
              :selected-data="batchSelectedSteps"
              :data="processSteps"
              :columns="batchStepColumns"
              :label-key="batchStepLabel"
              :description-key="batchStepDescription"
              title="批量分配组件工序"
              :subtitle="`将所选工序分配给已勾选的 ${selectedComponentRows.length} 项 BOM 组件`"
              placeholder="选择目标工序"
              search-placeholder="搜索工序号、工序名称或工作中心"
              empty-text="暂无可分配工序"
              empty-description="请先为父项物料选择一条包含工序的工艺路线。"
              dialog-width="xl"
              @confirm="handleBatchStepConfirm"
            >
              <template #trigger="{ open }">
                <ElButton
                  v-if="canMaintainBom"
                  :disabled="!selectedComponentRows.length || !processSteps.length"
                  @click="open"
                >
                  <ArtSvgIcon icon="ri:git-merge-line" />
                  批量分配工序<span v-if="selectedComponentRows.length"
                    >（{{ selectedComponentRows.length }}）</span
                  >
                </ElButton>
              </template>
            </ArtTableSingleSelect>
            <ArtMaterialSelect
              v-model:model-values="selectedComponentIds"
              multiple
              v-model:selected-data="pickerSelectedComponents"
              :api-fn="fetchMaterials"
              :categories="materialCategories"
              title="批量添加组件物料"
              subtitle="父项物料不可作为自身组件；已存在组件不会重复加入"
              dialog-width="1600px"
              :disabled-key="isComponentMaterialDisabled"
              @confirm="handleComponentsConfirm"
            >
              <template #trigger="{ open }">
                <ElButton v-if="canMaintainBom" type="primary" plain @click="open"
                  ><ArtSvgIcon icon="ri:add-line" />参选物料</ElButton
                >
              </template>
            </ArtMaterialSelect>
          </div>
        </header>
        <ArtTable
          ref="componentTableRef"
          class="bom-dialog__component-table"
          :data="form.items"
          :columns="componentColumns"
          row-key="componentMaterialId"
          :pagination="false"
          table-layout="fixed"
          scrollbar-always-on
          :max-height="360"
          empty-text="暂无 BOM 组件"
          empty-description="组件为选填，可直接保存；后续可通过“参选物料”补充装配关系。"
          @selection-change="handleComponentSelectionChange"
        />
        <footer
          ><span>共 {{ form.items.length }} 项组件</span
          ><span>已分配 {{ assignedComponentCount }} 项 · 有效用量已包含损耗率口径</span></footer
        >
      </section>
    </div>
  </ArtDialog>
</template>

<script setup lang="tsx">
  import { cloneDeep } from 'lodash-es'
  import dayjs from 'dayjs'
  import {
    ElAlert,
    ElDatePicker,
    ElCheckbox,
    ElInput,
    ElInputNumber,
    ElMessage,
    ElOption,
    ElSelect,
    ElSwitch,
    type FormRules
  } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtTableSingleSelect from '@/components/core/forms/art-data-select/table-single.vue'
  import ArtMaterialSelect from '@/components/business/art-material-select/index.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import { useAuth } from '@/hooks/core/useAuth'
  import type { ArtTableExpose } from '@/components/core/tables/art-table/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import type { ColumnOption } from '@/types'
  import type {
    DataSelectColumn,
    DataSelectFetchParams,
    DataSelectRecord
  } from '@/components/core/forms/art-data-select/types'
  import {
    fetchBomProcessRoutes,
    fetchBomProcessRouteSteps,
    fetchComponentTypeOptions,
    fetchMaterialArchives,
    fetchMaterialCategories,
    saveBom,
    type BomGroup,
    type BomInput,
    type BomProcessRouteOption,
    type BomProcessRouteStepOption,
    type BomRecord,
    type ComponentTypeRecord,
    type MaterialArchive,
    type MaterialCategory,
    type UnitOfMeasure
  } from '@/api/mdm'
  import { formatBomMaterialDescription } from '../../modules/material-description'
  import {
    assignBomComponentsToStep,
    mergeBomComponentSelection,
    removeBomComponentSelection
  } from './bom-component-selection'
  import { convertBomComponentQuantity } from './bom-unit-conversion'

  export interface BomDialogOpenData {
    row?: BomRecord
    copy?: boolean
    tenantId: string
    tenantOptions: Array<{ label: string; value: string }>
    units: UnitOfMeasure[]
    loadUnits?: () => Promise<UnitOfMeasure[]>
    groups: BomGroup[]
  }
  interface FormExpose {
    validate: () => Promise<boolean>
    clearValidate: () => void
  }
  type BomComponentInput = BomInput['items'][number]

  const emit = defineEmits<{ success: [] }>()
  const { hasAnyAuth } = useAuth()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const dialogRef = ref<ArtDialogExpose<BomDialogOpenData>>()
  const formRef = ref<FormExpose>()
  const componentTableRef = ref<ArtTableExpose>()
  const tenantOptions = ref<Array<{ label: string; value: string }>>([])
  const units = ref<UnitOfMeasure[]>([])
  const groups = ref<BomGroup[]>([])
  const processRoutes = ref<BomProcessRouteOption[]>([])
  const processSteps = ref<BomProcessRouteStepOption[]>([])
  const componentTypes = ref<ComponentTypeRecord[]>([])
  const routeLoading = ref(false)
  const stepLoading = ref(false)
  const selectedParent = ref<MaterialArchive[]>([])
  const selectedComponents = ref<MaterialArchive[]>([])
  const pickerSelectedComponents = ref<MaterialArchive[]>([])
  const selectedComponentIds = ref<string[]>([])
  const materialCategories = ref<MaterialCategory[]>([])
  const selectedComponentRows = shallowRef<BomComponentInput[]>([])
  const batchSelectedStepId = ref<string | number>()
  const canMaintainBom = computed(() =>
    hasAnyAuth(['MdmBomMaintenance:Add', 'MdmBomMaintenance:Edit', 'MdmBomMaintenance:Copy'])
  )
  const initialForm = (): BomInput & { status: BomRecord['status'] } => ({
    id: undefined,
    tenantId: '',
    bomCode: '',
    materialId: '',
    processRouteId: null,
    version: '',
    purpose: 'production',
    status: 'design',
    baseQuantity: 1,
    baseUnitId: '',
    groupId: null,
    effectiveFrom: dayjs().format('YYYY-MM-DD'),
    effectiveTo: '9999-12-31',
    description: '',
    sort: 10,
    items: []
  })
  const form = reactive(initialForm())
  const tenantId = computed(() => form.tenantId)
  const scopedUnits = computed(() => units.value.filter((unit) => unit.tenantId === form.tenantId))
  const inheritedParentUnitId = computed(() => {
    const parent = selectedParent.value[0]
    return parent?.productionUnitId || parent?.baseUnitId || ''
  })
  const firstProcessStep = computed(() => processSteps.value[0] ?? null)
  const assignedComponentCount = computed(
    () => form.items.filter((item) => Boolean(item.processRouteStepId)).length
  )
  const batchSelectedSteps = computed<DataSelectRecord[]>(() => {
    const step = processSteps.value.find((item) => item.id === batchSelectedStepId.value)
    return step ? [step as DataSelectRecord] : []
  })
  const formItems = computed<FormItem[]>(() => [
    {
      key: 'tenantId',
      label: '目标租户',
      type: 'select',
      options: tenantOptions.value,
      props: {
        disabled: Boolean(form.id),
        filterable: true,
        placeholder: '请选择本次维护的数据归属租户'
      }
    },
    { key: 'identity', label: 'BOM 身份', type: 'divider', span: 24 },
    { key: 'materialId', label: '父项物料', type: 'slot', span: 16 },
    {
      key: 'processRouteId',
      label: '组件分配工艺路线',
      type: 'select',
      options: processRoutes.value.map((route) => ({
        label: `${route.name} · ${route.code}${route.isDefault ? '（默认）' : ''}`,
        value: route.id
      })),
      span: 8,
      props: {
        clearable: false,
        filterable: true,
        loading: routeLoading.value,
        disabled: !form.materialId || routeLoading.value || !processRoutes.value.length,
        placeholder: form.materialId ? '请选择组件分配路线' : '请先选择父项物料',
        onChange: handleProcessRouteChange
      }
    },
    {
      key: 'bomCode',
      label: 'BOM 编码',
      type: 'input',
      props: { disabled: true, placeholder: '保存后按月度 3 位流水规则自动生成' }
    },
    {
      key: 'version',
      label: '版本',
      type: 'input',
      props: { maxlength: 30, placeholder: '例如 V1.0' }
    },
    {
      key: 'groupId',
      label: 'BOM 分组',
      type: 'select',
      options: groups.value.map((group) => ({ label: group.name, value: group.id })),
      props: { clearable: true, placeholder: '请选择 BOM 分组' }
    },
    {
      key: 'purpose',
      label: 'BOM 用途',
      type: 'select',
      options: getDictMap.value.mdmBomPurpose ?? []
    },
    {
      key: 'sort',
      label: '显示顺序',
      type: 'number',
      props: { min: 0, max: 999999, precision: 0, class: '!w-full' }
    },
    { key: 'validity', label: '数量与有效期', type: 'divider', span: 24 },
    {
      key: 'baseQuantity',
      label: '基准数量',
      type: 'number',
      props: { min: 1, precision: 0, class: '!w-full' }
    },
    {
      key: 'baseUnitId',
      label: '生产单位',
      type: 'select',
      options: scopedUnits.value.map((unit) => ({
        label: `${unit.unitName} · ${unit.unitCode}`,
        value: unit.id
      })),
      props: {
        disabled: Boolean(inheritedParentUnitId.value),
        clearable: !inheritedParentUnitId.value,
        placeholder: inheritedParentUnitId.value
          ? '已由父项物料自动带入'
          : form.materialId
            ? '父项未维护单位，请在此补充'
            : '请先选择父项物料'
      }
    },
    {
      key: 'effectiveFrom',
      label: '生效日期',
      type: 'date',
      props: { valueFormat: 'YYYY-MM-DD', class: '!w-full' }
    },
    {
      key: 'effectiveTo',
      label: '失效日期',
      type: 'date',
      props: { valueFormat: 'YYYY-MM-DD', class: '!w-full' }
    },
    {
      key: 'description',
      label: '版本说明',
      type: 'input',
      span: 16,
      props: { type: 'textarea', rows: 2, maxlength: 500, showWordLimit: true, resize: 'none' }
    }
  ])
  const rules: FormRules<Record<string, unknown>> = {
    tenantId: [{ required: true, message: '请选择目标租户', trigger: 'change' }],
    materialId: [{ required: true, message: '请选择父项物料', trigger: 'change' }],
    baseUnitId: [
      {
        required: true,
        message: '请选择生产单位；父项物料未维护单位时可在此补充',
        trigger: 'change'
      }
    ]
  }
  void Promise.all([
    userStore.ensureDictLoaded('mdmBomPurpose'),
    userStore.ensureDictLoaded('mdmBomStatus'),
    userStore.ensureDictLoaded('mdmMaterialSource'),
    userStore.ensureDictLoaded('mdmMaterialIssueMethod'),
    userStore.ensureDictLoaded('mdmMaterialBackflushMethod'),
    userStore.ensureDictLoaded('mdmMaterialOverIssueControl'),
    userStore.ensureDictLoaded('mdmProcessRouteSequenceType')
  ])
  const fetchMaterials = (params: DataSelectFetchParams) =>
    fetchMaterialArchives({
      current: params.page,
      size: params.pageSize,
      tenantId: tenantId.value,
      keyword: params.keyword,
      categoryId: String(params.filters.categoryId || '') || undefined,
      status: 'enabled'
    })
  let materialCategoryRequestVersion = 0
  const loadMaterialCategories = async (): Promise<void> => {
    const requestVersion = ++materialCategoryRequestVersion
    if (!form.tenantId) {
      materialCategories.value = []
      return
    }
    const categories = await fetchMaterialCategories(form.tenantId)
    if (requestVersion === materialCategoryRequestVersion) materialCategories.value = categories
  }
  const sequenceTypeLabel = (value?: string | null): string =>
    getDictMap.value.mdmProcessRouteSequenceType?.find((item) => item.value === value)?.label ||
    (value === 'main' ? '标准序列' : value || '—')
  const workCenterLabel = (step?: BomProcessRouteStepOption | null): string =>
    step?.workCenter?.name || (step?.workCenterIds?.length ? '已配置工作中心' : '未指定')
  const processStepLabel = (step: BomProcessRouteStepOption): string =>
    [
      step.sequence?.sequenceNo ? `序列 ${step.sequence.sequenceNo}` : '',
      sequenceTypeLabel(step.sequence?.sequenceType),
      step.code,
      step.name
    ]
      .filter(Boolean)
      .join(' · ')
  const batchStepLabel = (row: DataSelectRecord): string => {
    const step = row as BomProcessRouteStepOption
    return `${step.code} · ${step.name}`
  }
  const batchStepDescription = (row: DataSelectRecord): string => {
    const step = row as BomProcessRouteStepOption
    return [
      step.sequence?.sequenceNo ? `序列 ${step.sequence.sequenceNo}` : '',
      sequenceTypeLabel(step.sequence?.sequenceType),
      workCenterLabel(step)
    ]
      .filter(Boolean)
      .join(' · ')
  }
  const batchStepColumns: DataSelectColumn[] = [
    {
      prop: 'sequenceNo',
      label: '工序序列',
      width: 100,
      align: 'center',
      formatter: (row) => (row as BomProcessRouteStepOption).sequence?.sequenceNo ?? '—'
    },
    {
      prop: 'sequenceType',
      label: '序列类型',
      width: 120,
      formatter: (row) =>
        sequenceTypeLabel((row as BomProcessRouteStepOption).sequence?.sequenceType)
    },
    { prop: 'code', label: '工序号', width: 110 },
    { prop: 'name', label: '工序名称', minWidth: 180 },
    {
      prop: 'workCenter',
      label: '工作中心',
      minWidth: 180,
      formatter: (row) => workCenterLabel(row as BomProcessRouteStepOption)
    }
  ]
  const syncComponentAssignment = (
    row: BomComponentInput,
    stepId: string | null | undefined
  ): void => {
    const step = processSteps.value.find((item) => item.id === stepId)
    row.processRouteStepId = step?.id ?? null
    row.operationName = step?.name ?? ''
  }
  const normalizeComponentAssignments = (forceFirst = false): void => {
    const validIds = new Set(processSteps.value.map((step) => step.id))
    const firstStep = firstProcessStep.value
    form.items.forEach((item) => {
      if (!forceFirst && item.processRouteStepId && validIds.has(item.processRouteStepId)) {
        syncComponentAssignment(item, item.processRouteStepId)
        return
      }
      syncComponentAssignment(item, firstStep?.id)
    })
  }
  const loadProcessSteps = async (routeId?: string | null, forceFirst = false): Promise<void> => {
    processSteps.value = []
    if (!routeId || !form.tenantId) {
      normalizeComponentAssignments(forceFirst)
      return
    }
    stepLoading.value = true
    try {
      const rows = await fetchBomProcessRouteSteps(form.tenantId, routeId)
      processSteps.value = [...rows].sort(
        (left, right) =>
          (left.sequence?.sequenceNo ?? 0) - (right.sequence?.sequenceNo ?? 0) ||
          left.sort - right.sort ||
          left.code.localeCompare(right.code)
      )
      normalizeComponentAssignments(forceFirst)
    } finally {
      stepLoading.value = false
    }
  }
  const loadProcessRoutes = async (
    materialId?: string,
    preferredRouteId?: string | null
  ): Promise<void> => {
    processRoutes.value = []
    processSteps.value = []
    if (!materialId || !form.tenantId) {
      form.processRouteId = null
      return
    }
    routeLoading.value = true
    try {
      processRoutes.value = await fetchBomProcessRoutes(form.tenantId, materialId)
      const preferred = processRoutes.value.find((route) => route.id === preferredRouteId)
      form.processRouteId = preferred?.id ?? processRoutes.value[0]?.id ?? null
      await loadProcessSteps(form.processRouteId)
    } finally {
      routeLoading.value = false
    }
  }
  const handleProcessRouteChange = async (value: string): Promise<void> => {
    form.processRouteId = value || null
    await loadProcessSteps(form.processRouteId, true)
  }
  const assignAllComponentsToFirstStep = (): void => {
    normalizeComponentAssignments(true)
    if (firstProcessStep.value) ElMessage.success(`已全部分配到${firstProcessStep.value.name}`)
  }
  const handleComponentSelectionChange = (rows: BomComponentInput[]): void => {
    selectedComponentRows.value = rows
  }
  const handleBatchStepConfirm = (_value: unknown, rows: DataSelectRecord[]): void => {
    const step = rows[0] as BomProcessRouteStepOption | undefined
    if (!step || !selectedComponentRows.value.length) return
    const selectedIds = selectedComponentRows.value.map((item) => item.componentMaterialId)
    form.items = assignBomComponentsToStep(form.items, selectedIds, step)
    batchSelectedStepId.value = step.id
    selectedComponentRows.value = []
    componentTableRef.value?.elTableRef?.clearSelection()
    ElMessage.success(`已将 ${selectedIds.length} 项组件分配到“${step.code} · ${step.name}”`)
  }
  const materialById = (id: string) =>
    [...selectedParent.value, ...selectedComponents.value].find((item) => item.id === id)
  const componentRowLabel = (row: BomComponentInput, rowIndex: number): string => {
    const description = materialById(row.componentMaterialId)?.description?.trim()
    return `第 ${rowIndex + 1} 行${description ? `“${description}”` : '组件'}`
  }
  const componentColumns = computed<ColumnOption<BomComponentInput>[]>(() => [
    { type: 'selection', width: 48, fixed: 'left' },
    { type: 'index', label: '#', width: 48, align: 'center' },
    {
      prop: 'componentMaterialId',
      label: '组件物料',
      width: 300,
      formatter: (row) => {
        const material = materialById(row.componentMaterialId)
        const materialDescription = material?.description?.trim() || '未维护物料描述'
        const materialDetail =
          [material?.materialCode, material?.specificationModel].filter(Boolean).join(' · ') || '—'
        return (
          <div class="bom-dialog__material-cell">
            <span class="bom-dialog__material-icon" aria-hidden="true">
              <ArtSvgIcon icon="ri:box-3-line" />
            </span>
            <div class="bom-dialog__material-copy">
              <strong title={materialDescription}>{materialDescription}</strong>
              <small title={materialDetail}>{materialDetail}</small>
            </div>
          </div>
        )
      }
    },
    {
      prop: 'sequenceNo',
      label: '行号',
      width: 84,
      align: 'center',
      formatter: (row) => (
        <ElInputNumber
          v-model={row.sequenceNo}
          min={1}
          max={999999}
          controls={false}
          aria-label="组件顺序"
          class="bom-dialog__number-input"
        />
      )
    },
    {
      prop: 'mrpEnabled',
      label: 'MRP 运算',
      width: 94,
      align: 'center',
      formatter: (row) => <ElSwitch v-model={row.mrpEnabled} aria-label="MRP 运算" />
    },
    {
      prop: 'materialCode',
      label: '物料编码',
      width: 180,
      formatter: (row) => materialById(row.componentMaterialId)?.materialCode || '—'
    },
    {
      prop: 'componentTypeId',
      label: '组件类型',
      width: 160,
      formatter: (row) => (
        <ElSelect
          v-model={row.componentTypeId}
          clearable
          filterable
          placeholder="选择组件类型"
          class="w-full!"
        >
          {componentTypes.value
            .filter((item) => item.tenantId === form.tenantId)
            .map((item) => (
              <ElOption
                key={item.id}
                label={item.componentTypeName}
                value={item.id}
                disabled={!item.enabled}
              />
            ))}
        </ElSelect>
      )
    },
    {
      prop: 'specificationModel',
      label: '规格型号',
      width: 180,
      formatter: (row) => materialById(row.componentMaterialId)?.specificationModel || '—'
    },
    {
      prop: 'materialSource',
      label: '物料来源',
      width: 110,
      formatter: (row) => (
        <ArtDictDisplay
          dictCode="mdmMaterialSource"
          value={materialById(row.componentMaterialId)?.materialSource || ''}
        />
      )
    },
    {
      prop: 'virtualPart',
      label: '虚拟件项',
      width: 100,
      align: 'center',
      formatter: (row) => (
        <ElCheckbox
          modelValue={materialById(row.componentMaterialId)?.specialPurchaseType === 'virtual_part'}
          disabled
          aria-label="虚拟件项"
        />
      )
    },
    {
      prop: 'quantity',
      label: '用量',
      required: true,
      requiredMessage: ({ row, rowIndex }) => `${componentRowLabel(row, rowIndex)}的用量不能为空`,
      rules: {
        validator: ({ value }) => Number.isFinite(Number(value)) && Number(value) > 0,
        message: ({ row, rowIndex }) => `${componentRowLabel(row, rowIndex)}的用量必须大于 0`
      },
      width: 150,
      align: 'center',
      formatter: (row) => (
        <ElInputNumber
          v-model={row.quantity}
          min={0.00000001}
          precision={6}
          controlsPosition="right"
          aria-label="组件用量"
          class="bom-dialog__number-input"
        />
      )
    },
    {
      prop: 'unitId',
      label: '计量单位',
      required: true,
      requiredMessage: ({ row, rowIndex }) => `${componentRowLabel(row, rowIndex)}未选择单位`,
      width: 160,
      formatter: (row) => (
        <ElSelect
          modelValue={row.unitId}
          filterable
          clearable
          aria-label="组件单位"
          class="w-full!"
          onUpdate:modelValue={(unitId: string) => handleComponentUnitChange(row, unitId)}
        >
          {scopedUnits.value.map((unit) => (
            <ElOption key={unit.id} label={unit.unitName} value={unit.id} />
          ))}
        </ElSelect>
      )
    },
    {
      prop: 'defaultIssueWarehouseId',
      label: '默认发料仓库',
      width: 180,
      formatter: (row) =>
        materialById(row.componentMaterialId)?.defaultWarehouse?.warehouseName || '—'
    },
    {
      prop: 'issueMethod',
      label: '领送料方式',
      width: 170,
      formatter: (row) => (
        <ElSelect v-model={row.issueMethod}>
          {(getDictMap.value.mdmMaterialIssueMethod ?? []).map((item) => (
            <ElOption key={item.value} label={item.label} value={item.value} />
          ))}
        </ElSelect>
      )
    },
    {
      prop: 'backflushMethod',
      label: '倒冲',
      width: 150,
      formatter: (row) => (
        <ElSelect v-model={row.backflushMethod}>
          {(getDictMap.value.mdmMaterialBackflushMethod ?? []).map((item) => (
            <ElOption key={item.value} label={item.label} value={item.value} />
          ))}
        </ElSelect>
      )
    },
    {
      prop: 'overIssueControlMethod',
      label: '超发控制方式',
      width: 190,
      formatter: (row) => (
        <ElSelect v-model={row.overIssueControlMethod} clearable>
          {(getDictMap.value.mdmMaterialOverIssueControl ?? []).map((item) => (
            <ElOption key={item.value} label={item.label} value={item.value} />
          ))}
        </ElSelect>
      )
    },
    {
      prop: 'effectiveFrom',
      label: '生效日期',
      width: 180,
      formatter: (row) => <ElDatePicker v-model={row.effectiveFrom} value-format="YYYY-MM-DD" />
    },
    {
      prop: 'effectiveTo',
      label: '失效日期',
      width: 180,
      formatter: (row) => <ElDatePicker v-model={row.effectiveTo} value-format="YYYY-MM-DD" />
    },
    {
      prop: 'projectText',
      label: '项目文本',
      width: 220,
      formatter: (row) => (
        <ElInput v-model={row.projectText} maxlength={200} placeholder="填写项目文本" />
      )
    },
    {
      prop: 'scrapRate',
      label: '损耗率 %',
      width: 140,
      align: 'center',
      formatter: (row) => (
        <ElInputNumber
          v-model={row.scrapRate}
          min={0}
          max={100}
          precision={2}
          controls={false}
          aria-label="组件损耗率"
          class="bom-dialog__number-input"
        />
      )
    },
    {
      prop: 'processSequenceNo',
      label: '工序序列',
      width: 100,
      align: 'center',
      formatter: (row) =>
        processSteps.value.find((step) => step.id === row.processRouteStepId)?.sequence
          ?.sequenceNo ?? '—'
    },
    {
      prop: 'processSequenceType',
      label: '序列类型',
      width: 120,
      formatter: (row) =>
        sequenceTypeLabel(
          processSteps.value.find((step) => step.id === row.processRouteStepId)?.sequence
            ?.sequenceType
        )
    },
    {
      prop: 'processRouteStepId',
      label: '分配工序',
      width: 260,
      formatter: (row) => (
        <ElSelect
          v-model={row.processRouteStepId}
          clearable
          filterable
          loading={stepLoading.value}
          disabled={!processSteps.value.length}
          placeholder={processSteps.value.length ? '选择对应工序' : '暂无可分配工序'}
          aria-label="组件分配工序"
          onChange={(value: string) => syncComponentAssignment(row, value)}
        >
          {processSteps.value.map((step) => (
            <ElOption key={step.id} label={processStepLabel(step)} value={step.id} />
          ))}
        </ElSelect>
      )
    },
    {
      prop: 'positionNo',
      label: '位号',
      width: 140,
      formatter: (row) => (
        <ElInput
          v-model={row.positionNo}
          clearable
          maxlength={60}
          placeholder="填写位号"
          aria-label="组件位号"
        />
      )
    },
    {
      prop: 'operation',
      label: '操作',
      width: 64,
      fixed: 'right',
      align: 'center',
      formatter: (row) => (
        <ArtIconButton
          icon="ri:delete-bin-line"
          label="移除组件"
          tone="danger"
          onClick={() => handleRemoveComponent(row)}
        />
      )
    }
  ])
  const handleParentChange = async (_value: unknown, rows: DataSelectRecord[]) => {
    const row = rows[0] as MaterialArchive | undefined
    selectedParent.value = row ? [row] : []
    form.baseUnitId = row?.productionUnitId || row?.baseUnitId || ''
    await loadProcessRoutes(row?.id)
    if (row && !form.baseUnitId) {
      ElMessage.warning('该父项物料未维护生产单位，请在“生产单位”字段补充后保存')
    }
    if (!row || !form.items.some((item) => item.componentMaterialId === row.id)) return
    handleRemoveComponentById(row.id)
    ElMessage.info('父项物料不能同时作为组件，已从组件明细中移除')
  }
  const isComponentMaterialDisabled = (row: DataSelectRecord) =>
    row.id === form.materialId || form.items.some((item) => item.componentMaterialId === row.id)
  const syncComponentSelection = (materials: MaterialArchive[]) => {
    selectedComponents.value = materials
  }
  const handleRemoveComponentById = (componentMaterialId: string) => {
    const result = removeBomComponentSelection(
      form.items,
      selectedComponents.value,
      componentMaterialId
    )
    form.items = result.items
    syncComponentSelection(result.materials)
    selectedComponentIds.value = []
    pickerSelectedComponents.value = []
    selectedComponentRows.value = []
    componentTableRef.value?.elTableRef?.clearSelection()
  }
  const handleRemoveComponent = (row: BomComponentInput) =>
    handleRemoveComponentById(row.componentMaterialId)
  const handleComponentsConfirm = (_value: unknown, rows: DataSelectRecord[]) => {
    const result = mergeBomComponentSelection(
      form.items,
      selectedComponents.value,
      rows as MaterialArchive[],
      form.materialId,
      dayjs().format('YYYY-MM-DD'),
      firstProcessStep.value
    )
    form.items = result.items
    syncComponentSelection(result.materials)
    selectedComponentIds.value = []
    pickerSelectedComponents.value = []
  }
  const handleComponentUnitChange = (row: BomComponentInput, unitId: string) => {
    const material = materialById(row.componentMaterialId)
    if (!material || !unitId) {
      row.unitId = unitId
      return
    }
    const previousUnitId = row.unitId
    row.unitId = unitId
    if (!previousUnitId || previousUnitId === unitId) return
    const converted = convertBomComponentQuantity(row.quantity, previousUnitId, unitId, material)
    if (converted === null) {
      ElMessage.warning('该物料未维护所选单位的换算关系，请手动填写用量')
      return
    }
    row.quantity = converted
  }
  const validateComponents = async (): Promise<boolean> => {
    const result = await componentTableRef.value?.validate()
    if (result?.valid !== false) return true
    ElMessage.warning(
      `${result.firstError?.message || '组件明细填写不完整'}，请完善红色标记项后再保存`
    )
    return false
  }
  const handleSubmit = async (): Promise<boolean> => {
    try {
      await formRef.value?.validate()
    } catch {
      ElMessage.warning('请先完善 BOM 基本信息中的必填项')
      dialogRef.value?.scrollTo({ top: 0 })
      return false
    }

    if (!(await validateComponents())) return false

    try {
      await saveBom(form)
      emit('success')
      return true
    } catch {
      return false
    }
  }
  const handleOpen = async (data: BomDialogOpenData): Promise<void> => {
    Object.assign(form, initialForm())
    tenantOptions.value = data.tenantOptions
    units.value = data.units
    groups.value = data.groups
    selectedParent.value = data.row?.material ? [data.row.material as MaterialArchive] : []
    selectedComponents.value = (data.row?.items.map((item) => item.component).filter(Boolean) ||
      []) as MaterialArchive[]
    selectedComponentIds.value = []
    pickerSelectedComponents.value = []
    selectedComponentRows.value = []
    batchSelectedStepId.value = undefined
    if (data.row) Object.assign(form, cloneDeep(data.row))
    form.tenantId = data.row?.tenantId || data.tenantId
    form.effectiveFrom ||= dayjs().format('YYYY-MM-DD')
    form.effectiveTo ||= '9999-12-31'
    form.items.forEach((item) => {
      item.effectiveFrom ||= form.effectiveFrom
      item.effectiveTo ||= form.effectiveTo
    })
    if (data.copy) {
      form.id = undefined
      form.bomCode = ''
      form.version = ''
      form.status = 'design'
    }
    await dialogRef.value?.handleOpen(data, {
      title: data.copy ? '复制 BOM' : data.row ? '编辑 BOM' : '新增 BOM',
      subtitle: '版本化维护父项与组件的工程关系',
      confirmText: '保存 BOM',
      contentMaxHeight: '76vh',
      loading: true,
      onConfirm: handleSubmit,
      onOpen: async (_openData, api) => {
        try {
          await Promise.all([
            data.loadUnits?.().then((rows) => {
              units.value = rows
            }),
            loadProcessRoutes(form.materialId, data.row?.processRouteId),
            loadMaterialCategories(),
            fetchComponentTypeOptions(form.tenantId).then((rows) => {
              componentTypes.value = rows
            })
          ])
          formRef.value?.clearValidate()
          componentTableRef.value?.clearValidate()
          componentTableRef.value?.elTableRef?.clearSelection()
        } finally {
          api.setLoading(false)
        }
      }
    })
  }
  watch(
    () => form.tenantId,
    (value, previous) => {
      if (value === previous || !previous) return
      form.materialId = ''
      form.processRouteId = null
      form.baseUnitId = ''
      form.items = []
      componentTypes.value = []
      processRoutes.value = []
      processSteps.value = []
      selectedParent.value = []
      selectedComponents.value = []
      selectedComponentIds.value = []
      pickerSelectedComponents.value = []
      void loadMaterialCategories()
    }
  )
  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .bom-dialog {
    display: grid;
    gap: 12px;
  }

  :deep(.bom-dialog__form) {
    padding-top: 0;
  }

  .bom-dialog__components {
    overflow: hidden;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--el-border-radius-base);
  }

  .bom-dialog__components > header,
  .bom-dialog__components > footer {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    padding: 11px 14px;
    background: var(--el-fill-color-lighter);
  }

  .bom-dialog__components > footer {
    position: sticky;
    bottom: 0;
    z-index: 4;
    border-top: 1px solid var(--el-border-color-lighter);
  }

  .bom-dialog__components header strong,
  .bom-dialog__components header small {
    display: block;
  }

  .bom-dialog__components header small,
  .bom-dialog__components footer {
    margin-top: 2px;
    font-size: 11px;
    color: var(--el-text-color-secondary);
  }

  .bom-dialog__component-actions {
    display: flex;
    flex: none;
    flex-wrap: nowrap;
    gap: 8px;
    align-items: center;
    width: max-content;

    :deep(.el-button + .el-button) {
      margin-left: 0;
    }
  }

  :deep(.bom-dialog__material-cell) {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    min-width: 0;
  }

  :deep(.bom-dialog__material-icon) {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    color: var(--theme-color);
    background: color-mix(in srgb, var(--theme-color) 8%, var(--el-bg-color));
    border: 1px solid color-mix(in srgb, var(--theme-color) 12%, transparent);
    border-radius: 9px;
  }

  :deep(.bom-dialog__material-copy) {
    min-width: 0;
  }

  :deep(.bom-dialog__material-copy strong),
  :deep(.bom-dialog__material-copy small) {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :deep(.bom-dialog__material-copy strong) {
    line-height: 20px;
    color: var(--el-text-color-primary);
  }

  :deep(.bom-dialog__material-copy small) {
    margin-top: 2px;
    font-family: var(--art-font-family-mono, Consolas, monospace);
    font-size: 11px;
    line-height: 16px;
    color: var(--el-text-color-secondary);
  }

  :deep(.art-table__cell-value),
  :deep(.art-table__cell-content),
  :deep(.el-input-number),
  :deep(.el-select) {
    width: 100%;
  }

  :deep(.bom-dialog__number-input .el-input__inner) {
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .bom-dialog__component-table {
    width: 100%;
    min-width: 0;
  }

  @media (width <= 820px) {
    .bom-dialog__components > header {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>

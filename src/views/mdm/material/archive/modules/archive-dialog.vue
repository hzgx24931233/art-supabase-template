<template>
  <ArtDialog ref="dialogRef" size="xl">
    <div class="material-archive-dialog">
      <ElTabs v-model="activeTab" class="material-archive-dialog__tabs">
        <ElTabPane v-for="tab in tabs" :key="tab.name" :name="tab.name">
          <template #label
            ><span class="material-archive-dialog__tab-label"
              ><ArtSvgIcon :icon="tab.icon" />{{ tab.label
              }}<i v-if="isTabConfigured(tab.name)" aria-label="已配置"></i></span
          ></template>
        </ElTabPane>
      </ElTabs>

      <section class="material-archive-dialog__panel">
        <header class="material-archive-dialog__section-heading">
          <div>
            <strong>{{ activeTabMeta.title }}</strong>
            <p>{{ activeTabMeta.description }}</p>
          </div>
          <div class="material-archive-dialog__completion">
            <span>资料完整度</span><strong>{{ completion }}%</strong>
          </div>
        </header>
        <div class="material-archive-dialog__notice">
          <span><ArtSvgIcon :icon="activeTabMeta.icon" /></span>
          <p>{{ activeTabMeta.notice }}</p>
        </div>

        <ArtForm
          ref="formRef"
          v-model="formModel"
          :items="formItems"
          :rules="formRules"
          :span="12"
          :gutter="24"
          label-position="top"
          :show-reset="false"
          :show-submit="false"
          root-class="material-archive-dialog__form"
        >
          <template #materialCode>
            <ElInput
              v-model="formModel.materialCode"
              maxlength="60"
              :disabled="Boolean(formModel.codeRuleId && !formModel.id)"
              :placeholder="
                formModel.codeRuleId ? '保存时按编码策略自动生成' : '未选择策略时手工录入编码'
              "
            >
              <template #prefix><ArtSvgIcon icon="ri:barcode-line" /></template>
            </ElInput>
          </template>
          <template #codeRuleId>
            <ElSelect
              v-model="formModel.codeRuleId"
              clearable
              filterable
              placeholder="选择编码策略"
            >
              <ElOption
                v-for="item in scopedCodeRules"
                :key="item.id"
                :label="item.ruleName"
                :value="item.id"
              />
            </ElSelect>
          </template>
          <template #imageUrls>
            <ArtUploadImage
              v-model="formModel.imageUrls"
              :resource-tenant-id="formModel.tenantId"
              multiple
              :limit="5"
              :size="92"
              tip="支持上传或从资源库选择，最多 5 张"
            />
          </template>
          <template #area>
            <div class="material-archive-dialog__area-field">
              <ElInputNumber
                v-model="formModel.area"
                :min="0"
                :precision="4"
                controls-position="right"
                placeholder="请输入面积"
                class="!w-full"
              />
              <ElButton plain aria-label="按长度和宽度计算面积" @click="recalculateArea"
                ><ArtSvgIcon icon="ri:calculator-line" />按长×宽计算</ElButton
              >
            </div>
          </template>
          <template #description>
            <div class="material-archive-dialog__description">
              <ElInput
                :model-value="materialDescription"
                type="textarea"
                :rows="2"
                readonly
                resize="none"
                placeholder="填写分类配置的组成字段后自动生成"
                aria-label="自动生成的物料描述"
              />
              <div class="material-archive-dialog__description-rule">
                <span><ArtSvgIcon icon="ri:magic-line" />分类描述规则</span>
                <template v-if="descriptionRuleLabels.length">
                  <ElTag
                    v-for="(label, index) in descriptionRuleLabels"
                    :key="`${label}-${index}`"
                    size="small"
                    effect="plain"
                    >{{ label }}</ElTag
                  >
                  <small>连接符：{{ selectedCategory?.compositionSeparator || '（空）' }}</small>
                </template>
                <small v-else>当前分类尚未配置描述组成字段</small>
              </div>
            </div>
          </template>
          <template #purchaserId
            ><ArtEmployeeSelect
              :model-value="formModel.purchaserId ?? undefined"
              v-model:selected-data="employeeSelections.purchaserId"
              :tenant-id="tenantId"
              placeholder="选择采购员"
              @update:model-value="formModel.purchaserId = $event ?? null"
          /></template>
          <template #plannerId
            ><ArtEmployeeSelect
              :model-value="formModel.plannerId ?? undefined"
              v-model:selected-data="employeeSelections.plannerId"
              :tenant-id="tenantId"
              placeholder="选择计划员"
              @update:model-value="formModel.plannerId = $event ?? null"
          /></template>
          <template #salespersonId
            ><ArtEmployeeSelect
              :model-value="formModel.salespersonId ?? undefined"
              v-model:selected-data="employeeSelections.salespersonId"
              :tenant-id="tenantId"
              placeholder="选择销售员"
              @update:model-value="formModel.salespersonId = $event ?? null"
          /></template>
          <template #custodianId
            ><ArtEmployeeSelect
              :model-value="formModel.custodianId ?? undefined"
              v-model:selected-data="employeeSelections.custodianId"
              :tenant-id="tenantId"
              placeholder="选择仓管员"
              @update:model-value="formModel.custodianId = $event ?? null"
          /></template>
          <template #dispatcherId
            ><ArtEmployeeSelect
              :model-value="formModel.dispatcherId ?? undefined"
              v-model:selected-data="employeeSelections.dispatcherId"
              :tenant-id="tenantId"
              placeholder="选择调度员"
              @update:model-value="formModel.dispatcherId = $event ?? null"
          /></template>
          <template #productionPlannerId
            ><ArtEmployeeSelect
              :model-value="formModel.productionPlannerId ?? undefined"
              v-model:selected-data="employeeSelections.productionPlannerId"
              :tenant-id="tenantId"
              placeholder="选择生产计划员"
              @update:model-value="formModel.productionPlannerId = $event ?? null"
          /></template>
          <template #unitConversions>
            <div class="conversion-builder">
              <div
                v-for="(conversion, index) in formModel.unitConversions"
                :key="`${conversion.sourceUnitId}-${index}`"
                class="conversion-builder__row"
              >
                <ElSelect v-model="conversion.sourceUnitId" filterable placeholder="选择来源单位">
                  <ElOption
                    v-for="unit in units"
                    :key="unit.id"
                    :label="`${unit.unitName} · ${unit.unitCode}`"
                    :value="unit.id"
                  />
                </ElSelect>
                <ElInputNumber
                  v-model="conversion.sourceFactor"
                  :min="0.00000001"
                  :precision="8"
                  controls-position="right"
                />
                <span class="conversion-builder__equals">=</span>
                <ElInputNumber
                  v-model="conversion.baseFactor"
                  :min="0.00000001"
                  :precision="8"
                  controls-position="right"
                />
                <span class="conversion-builder__base">{{
                  selectedBaseUnit?.unitName || '基本单位'
                }}</span>
                <ElInput v-model="conversion.remark" maxlength="120" placeholder="换算说明" />
                <ArtIconButton
                  icon="ri:delete-bin-line"
                  label="删除换算"
                  @click="formModel.unitConversions.splice(Number(index), 1)"
                />
              </div>
              <ElButton plain @click="addConversion"
                ><ArtSvgIcon icon="ri:add-line" />添加单位换算</ElButton
              >
            </div>
          </template>
        </ArtForm>
      </section>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import dayjs from 'dayjs'
  import { ElMessage, type FormRules } from 'element-plus'
  import { cloneDeep } from 'lodash-es'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtUploadImage from '@/components/core/forms/art-upload-image/index.vue'
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import {
    fetchEmployeeSelectorList,
    type EmployeeIntegrationItem
  } from '@/api/integration/employees'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import TreeUtils from '@/utils/tree'
  import {
    saveMaterialArchive,
    type MaterialArchive,
    type MaterialArchiveInput,
    type MaterialAttributeGroup,
    type MaterialCategory,
    type MaterialCodeRule,
    type MaterialContextOption,
    type MaterialType,
    type UnitOfMeasure
  } from '@/api/mdm'
  import { buildMaterialArchiveWriteInput } from './archive-payload'
  import { buildMaterialDescription } from './material-description'

  type ArchiveTab =
    'base' | 'purchase' | 'sales' | 'inventory' | 'production' | 'finance' | 'conversion'
  interface ArchiveFormModel extends MaterialArchiveInput {
    id?: string
  }
  type EmployeeSelectionField =
    | 'purchaserId'
    | 'plannerId'
    | 'salespersonId'
    | 'custodianId'
    | 'dispatcherId'
    | 'productionPlannerId'
  type EmployeeSelections = Record<EmployeeSelectionField, EmployeeIntegrationItem[]>
  interface MaterialCategoryOption {
    id: string
    parentId?: string | null
    label: string
    value: string
    sort: number
    children?: MaterialCategoryOption[]
  }
  export interface ArchiveDialogOpenData {
    row?: MaterialArchive
    copy?: boolean
    presetCategoryId?: string
    tenantId: string
    categories: MaterialCategory[]
    materialTypes: MaterialType[]
    units: UnitOfMeasure[]
    attributeGroups: MaterialAttributeGroup[]
    codeRules: MaterialCodeRule[]
    storageOptions: MaterialContextOption[]
    materialGroupOptions: MaterialContextOption[]
    supplierOptions: MaterialContextOption[]
    warehouseOptions: MaterialContextOption[]
    outboundRuleOptions: MaterialContextOption[]
    supplyRuleOptions: MaterialContextOption[]
  }
  interface FormExpose {
    validate: () => Promise<boolean>
    clearValidate: () => void
  }

  const emit = defineEmits<{ success: [] }>()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const dialogRef = ref<ArtDialogExpose<ArchiveDialogOpenData>>()
  const formRef = ref<FormExpose>()
  const activeTab = ref<ArchiveTab>('base')
  const categories = ref<MaterialCategory[]>([])
  const materialTypes = ref<MaterialType[]>([])
  const units = ref<UnitOfMeasure[]>([])
  const attributeGroups = ref<MaterialAttributeGroup[]>([])
  const codeRules = ref<MaterialCodeRule[]>([])
  const storageOptions = ref<MaterialContextOption[]>([])
  const materialGroupOptions = ref<MaterialContextOption[]>([])
  const supplierOptions = ref<MaterialContextOption[]>([])
  const warehouseOptions = ref<MaterialContextOption[]>([])
  const outboundRuleOptions = ref<MaterialContextOption[]>([])
  const supplyRuleOptions = ref<MaterialContextOption[]>([])
  const initialEmployeeSelections = (): EmployeeSelections => ({
    purchaserId: [],
    plannerId: [],
    salespersonId: [],
    custodianId: [],
    dispatcherId: [],
    productionPlannerId: []
  })
  const employeeSelections = reactive<EmployeeSelections>(initialEmployeeSelections())
  const tabs = [
    { name: 'base', label: '基本信息', icon: 'ri:information-line' },
    { name: 'purchase', label: '采购', icon: 'ri:shopping-bag-3-line' },
    { name: 'sales', label: '销售', icon: 'ri:shopping-cart-line' },
    { name: 'inventory', label: '库存', icon: 'ri:stack-line' },
    { name: 'production', label: '生产', icon: 'ri:settings-5-line' },
    { name: 'finance', label: '财务', icon: 'ri:bank-card-line' },
    { name: 'conversion', label: '单位换算', icon: 'ri:exchange-2-line' }
  ] as const
  const tabMeta: Record<
    ArchiveTab,
    { title: string; description: string; notice: string; icon: string }
  > = {
    base: {
      title: '统一物料身份',
      description: '编码、分类、类型与计量单位构成跨业务系统共享的主身份。',
      notice: '优先完成带星号的核心字段；选择属性组后会自动出现该类物料的扩展属性。',
      icon: 'ri:fingerprint-line'
    },
    purchase: {
      title: '采购默认视图',
      description: '定义采购单位、责任人和补货批量边界。',
      notice: '采购单位默认继承基本单位，可按实际采购包装和补货策略调整。',
      icon: 'ri:shopping-bag-3-line'
    },
    sales: {
      title: '销售默认视图',
      description: '维护销售计量口径、责任人和归属组织。',
      notice: '销售视图只维护业务默认值，不改变物料的统一基本计量口径。',
      icon: 'ri:shopping-cart-line'
    },
    inventory: {
      title: '库存默认视图',
      description: '统一库存单位、默认库位与保管责任。',
      notice: '默认库位来自仓储主数据，后续业务单据可根据仓库规则覆盖。',
      icon: 'ri:stack-line'
    },
    production: {
      title: '生产与计划视图',
      description: '约束生产计量、MRP 策略和调度责任。',
      notice: '生产单位和 MRP 类型将作为计划运算与工单创建的默认参数。',
      icon: 'ri:settings-5-line'
    },
    finance: {
      title: '财务计价视图',
      description: '明确成本单位、存货计价方法与核算币种。',
      notice: '计价方法影响存货成本核算，物料发生业务后应通过受控变更调整。',
      icon: 'ri:bank-card-line'
    },
    conversion: {
      title: '计量单位换算',
      description: '维护业务单位到基本单位的精确换算关系。',
      notice: '每条换算都应以当前基本单位为目标，系统会在保存时校验重复和精度。',
      icon: 'ri:exchange-2-line'
    }
  }
  const initialForm = (): ArchiveFormModel => ({
    id: undefined,
    tenantId: '',
    codeRuleId: null,
    categoryId: '',
    materialCode: '',
    oldMaterialCode: '',
    materialName: '',
    specificationModel: '',
    drawingNo: '',
    basicUnit: '',
    materialType: '',
    materialSource: 'purchase',
    specialPurchaseType: null,
    materialTypeId: null,
    baseUnitId: null,
    auxiliaryUnitId: null,
    auxiliaryUnit2Id: null,
    attributeGroupId: null,
    attributeValues: {},
    materialGroupId: null,
    brand: '',
    manufacturer: '',
    materialComposition: '',
    placeOfOrigin: '',
    color: '',
    imageUrls: [],
    description: '',
    grossWeight: null,
    netWeight: null,
    length: null,
    width: null,
    thickness: null,
    area: null,
    volume: null,
    effectiveDate: dayjs().format('YYYY-MM-DD'),
    expirationDate: '9999-12-31',
    purchaseUnitId: null,
    purchaserId: null,
    plannerId: null,
    purchaseOrganization: null,
    defaultSupplierId: null,
    overReceiptPercent: null,
    underReceiptPercent: null,
    overPurchaseQuantity: null,
    purchaseFixedLeadDays: null,
    purchasePreprocessDays: null,
    purchasePostprocessDays: null,
    inspectionLeadDays: null,
    batchPolicy: '',
    minBatch: null,
    maxBatch: null,
    salesUnitId: null,
    salespersonId: null,
    salesOrganization: '',
    shippingLeadDays: null,
    shippingDelayDays: null,
    overDeliveryPercent: null,
    underDeliveryPercent: null,
    inventoryUnitId: null,
    storageLocationId: null,
    custodianId: null,
    abcClassification: null,
    allowNegativeInventory: false,
    minimumPackQuantity: null,
    defaultWarehouseId: null,
    minStockAlertEnabled: false,
    minStock: null,
    safetyStockAlertEnabled: false,
    safetyStock: null,
    reorderPointAlertEnabled: false,
    reorderPoint: null,
    reorderQuantity: null,
    dailyConsumption: null,
    maxStockAlertEnabled: false,
    maxStock: null,
    outboundRuleId: null,
    batchManagementEnabled: false,
    batchRuleId: null,
    serialManagementEnabled: false,
    serialRuleId: null,
    serialGenerationTiming: null,
    shelfLifeManagementEnabled: false,
    shelfLifeUnitId: null,
    shelfLife: null,
    shelfLifeCalculationDirection: null,
    expiryCalculationMethod: null,
    advancePeriodUnitId: null,
    inboundExpiryLead: null,
    outboundExpiryLead: null,
    expiryAlertEnabled: false,
    expiryAlertDays: null,
    barcodeManagementEnabled: false,
    barcode: '',
    productionUnitId: null,
    mrpType: '',
    dispatcherId: null,
    productionPlannerId: null,
    keyComponent: false,
    inboundWarehouseId: null,
    fixedBatch: null,
    productionFixedLeadDays: null,
    productionPreprocessDays: null,
    selfMadeProductionDays: null,
    productionPostprocessDays: null,
    productionInspectionLeadDays: null,
    schedulingPriority: 50,
    schedulingStrategy: 'inherit',
    planningTimeFenceDays: 0,
    batchRoundingQuantity: null,
    issuingWarehouseId: null,
    materialIssueMethod: null,
    backflushMethod: null,
    overIssueControlMethod: null,
    issueTolerancePercent: null,
    minimumIssueBatch: 1,
    costUnitId: null,
    valuationMethod: 'moving_average',
    currencyCode: 'CNY',
    unitConversions: [],
    status: 'enabled',
    sort: 10
  })
  const formModel = reactive<ArchiveFormModel>(initialForm())
  const tenantId = computed(() => formModel.tenantId)
  const scopedCategories = computed(() =>
    categories.value.filter((item) => item.tenantId === formModel.tenantId)
  )
  const scopedMaterialTypes = computed(() =>
    materialTypes.value.filter((item) => item.tenantId === formModel.tenantId)
  )
  const scopedUnits = computed(() =>
    units.value.filter((item) => item.tenantId === formModel.tenantId)
  )
  const scopedAttributeGroups = computed(() =>
    attributeGroups.value.filter((item) => item.tenantId === formModel.tenantId)
  )
  const scopedCodeRules = computed(() =>
    codeRules.value.filter((item) => item.tenantId === formModel.tenantId)
  )
  const scopedContextOptions = (items: MaterialContextOption[]) =>
    items.filter((item) => item.tenantId === formModel.tenantId)
  const resetEmployeeSelections = (): void => {
    Object.assign(employeeSelections, initialEmployeeSelections())
  }
  const selectedEmployeeIds = (): string[] =>
    [
      formModel.purchaserId,
      formModel.plannerId,
      formModel.salespersonId,
      formModel.custodianId,
      formModel.dispatcherId,
      formModel.productionPlannerId
    ].filter((id): id is string => Boolean(id))
  const loadEmployeeSelections = async (): Promise<void> => {
    const selectedIds = selectedEmployeeIds()
    if (!selectedIds.length) {
      resetEmployeeSelections()
      return
    }
    const pageSize = 200
    const employeeById = new Map<string, EmployeeIntegrationItem>()
    const missingIds = new Set(selectedIds)
    let from = 0
    while (missingIds.size) {
      const result = await fetchEmployeeSelectorList({
        tenantId: formModel.tenantId,
        from,
        to: from + pageSize - 1
      })
      for (const employee of result.data) {
        if (!missingIds.has(employee.id)) continue
        employeeById.set(employee.id, employee)
        missingIds.delete(employee.id)
      }
      if (!result.data.length) break
      from += pageSize
      if (from >= result.total) break
    }
    const getSelection = (id?: string | null): EmployeeIntegrationItem[] => {
      const employee = id ? employeeById.get(id) : undefined
      return employee ? [employee] : []
    }
    Object.assign(employeeSelections, {
      purchaserId: getSelection(formModel.purchaserId),
      plannerId: getSelection(formModel.plannerId),
      salespersonId: getSelection(formModel.salespersonId),
      custodianId: getSelection(formModel.custodianId),
      dispatcherId: getSelection(formModel.dispatcherId),
      productionPlannerId: getSelection(formModel.productionPlannerId)
    })
  }
  function option<T extends { id: string }>(items: T[], label: (item: T) => string) {
    return items.map((item) => ({ label: label(item), value: item.id }))
  }
  const unitOptions = computed(() =>
    option(scopedUnits.value, (item: UnitOfMeasure) => `${item.unitName} · ${item.unitCode}`)
  )
  const categoryTreeUtils = new TreeUtils({ parentKey: 'parentId' })
  const categoryOptions = computed(() =>
    categoryTreeUtils.listToTree<MaterialCategoryOption>(
      scopedCategories.value.map((item) => ({
        id: item.id,
        parentId: item.parentId,
        label: `${item.categoryName} · ${item.categoryCode}`,
        value: item.id,
        sort: item.sort
      })),
      (left, right) => left.sort - right.sort || left.label.localeCompare(right.label, 'zh-CN')
    )
  )
  const typeOptions = computed(() =>
    option(scopedMaterialTypes.value, (item: MaterialType) => `${item.typeName} · ${item.typeCode}`)
  )
  const groupOptions = computed(() =>
    option(
      scopedAttributeGroups.value,
      (item: MaterialAttributeGroup) => `${item.groupName} · ${item.groupCode}`
    )
  )
  const namedOptions = (items: MaterialContextOption[]) =>
    scopedContextOptions(items).map((item) => ({
      label: item.code ? `${item.name} · ${item.code}` : item.name,
      value: item.id
    }))
  const materialGroupSelectOptions = computed(() => namedOptions(materialGroupOptions.value))
  const supplierSelectOptions = computed(() => namedOptions(supplierOptions.value))
  const warehouseSelectOptions = computed(() => namedOptions(warehouseOptions.value))
  const isFinishedMaterial = computed(
    () =>
      scopedMaterialTypes.value.find((item) => item.id === formModel.materialTypeId)?.typeCode ===
      'FERT'
  )
  const finishedReceiptWarehouses = computed(() =>
    scopedContextOptions(warehouseOptions.value).filter(
      (item) => item.warehouseType === 'finished' && (item.businessScopes?.length ?? 0) > 0
    )
  )
  const inboundWarehouseSelectOptions = computed(() => {
    if (!isFinishedMaterial.value) return warehouseSelectOptions.value
    const options = namedOptions(finishedReceiptWarehouses.value)
    const configured = formModel.inboundWarehouseId
      ? warehouseOptions.value.find((item) => item.id === formModel.inboundWarehouseId)
      : undefined
    if (configured && !finishedReceiptWarehouses.value.some((item) => item.id === configured.id)) {
      options.push({ label: `${configured.name} · 原配置不可用于成品入库`, value: configured.id })
    }
    return options
  })
  const outboundRuleSelectOptions = computed(() => namedOptions(outboundRuleOptions.value))
  const batchRuleSelectOptions = computed(() =>
    namedOptions(supplyRuleOptions.value.filter((item) => item.applyBatch))
  )
  const serialRuleSelectOptions = computed(() =>
    namedOptions(supplyRuleOptions.value.filter((item) => item.applySerial))
  )
  const selectedBaseUnit = computed(() =>
    scopedUnits.value.find((item) => item.id === formModel.baseUnitId)
  )
  const activeTabMeta = computed(() => tabMeta[activeTab.value])
  const completion = computed(() => {
    const values = [
      formModel.materialCode,
      formModel.materialName,
      formModel.categoryId,
      formModel.materialTypeId,
      formModel.baseUnitId,
      formModel.specificationModel,
      formModel.attributeGroupId,
      formModel.description,
      formModel.purchaseUnitId,
      formModel.inventoryUnitId,
      formModel.productionUnitId,
      formModel.costUnitId
    ]
    return Math.round((values.filter(Boolean).length / values.length) * 100)
  })
  const selectedAttributeGroup = computed(() =>
    scopedAttributeGroups.value.find((item) => item.id === formModel.attributeGroupId)
  )
  const selectedCategory = computed(() =>
    scopedCategories.value.find((item) => item.id === formModel.categoryId)
  )
  const materialDescription = computed(() =>
    buildMaterialDescription(selectedCategory.value, formModel, selectedAttributeGroup.value)
  )
  const descriptionRuleLabels = computed(() => {
    return (selectedCategory.value?.compositionColumns ?? []).map(
      (column) =>
        getDictMap.value.mdmMaterialCoreAttribute?.find((item) => item.value === column)?.label ??
        column
    )
  })
  const isTabConfigured = (tab: ArchiveTab): boolean => {
    if (tab === 'base') return Boolean(formModel.materialName && formModel.baseUnitId)
    if (tab === 'purchase') return Boolean(formModel.purchaseUnitId || formModel.purchaserId)
    if (tab === 'sales') return Boolean(formModel.salesUnitId || formModel.salespersonId)
    if (tab === 'inventory')
      return Boolean(formModel.inventoryUnitId || formModel.storageLocationId)
    if (tab === 'production') return Boolean(formModel.productionUnitId || formModel.mrpType)
    if (tab === 'finance') return Boolean(formModel.costUnitId || formModel.valuationMethod)
    return formModel.unitConversions.length > 0
  }
  const commonUnitItem = (label: string, key: keyof ArchiveFormModel): FormItem => ({
    label,
    key: String(key),
    type: 'select',
    options: unitOptions.value,
    props: { clearable: true, filterable: true }
  })
  const enhanceFormItems = (items: FormItem[]): FormItem[] =>
    items.map((item) =>
      item.type === 'number'
        ? {
            ...item,
            props: {
              controlsPosition: 'right',
              class: '!w-full',
              placeholder: `请输入${item.label}`,
              ...item.props
            }
          }
        : item
    )
  const rawFormItems = computed<FormItem[]>(() => {
    if (activeTab.value === 'base')
      return [
        { key: 'identity', label: '核心身份', type: 'divider', span: 24 },
        { label: '物料编码', key: 'materialCode', type: 'slot' },
        {
          label: '编码策略',
          key: 'codeRuleId',
          type: 'slot',
          help: '选择规则后在保存事务中自动生成编码；未选择规则时允许手工维护。'
        },
        { label: '旧物料编码', key: 'oldMaterialCode', type: 'input', props: { maxlength: 60 } },
        { label: '图片', key: 'imageUrls', type: 'slot', span: 12 },
        {
          label: '物料名称',
          key: 'materialName',
          type: 'input',
          props: { maxlength: 160, placeholder: '请输入标准物料名称' }
        },
        {
          label: '物料分类',
          key: 'categoryId',
          type: 'treeSelect',
          options: categoryOptions.value,
          props: {
            checkStrictly: true,
            defaultExpandAll: true,
            filterable: true,
            nodeKey: 'id',
            placeholder: '请按层级选择物料分类'
          }
        },
        {
          label: '物料类型',
          key: 'materialTypeId',
          type: 'select',
          options: typeOptions.value,
          props: { filterable: true }
        },
        {
          label: '物料来源',
          key: 'materialSource',
          type: 'select',
          options: getDictMap.value.mdmMaterialSource ?? []
        },
        {
          label: '特殊采购类',
          key: 'specialPurchaseType',
          type: 'select',
          options: getDictMap.value.mdmMaterialSpecialPurchaseType ?? [],
          help: '虚拟件用于 BOM 展开标识；外协件用于区分需外部协作加工的物料。',
          props: { clearable: true, placeholder: '非特殊采购物料' }
        },
        commonUnitItem('基本单位', 'baseUnitId'),
        commonUnitItem('辅助单位', 'auxiliaryUnitId'),
        commonUnitItem('辅助单位(2)', 'auxiliaryUnit2Id'),
        { key: 'characteristics', label: '规格与特征', type: 'divider', span: 24 },
        { label: '规格型号', key: 'specificationModel', type: 'input', props: { maxlength: 160 } },
        { label: '图号', key: 'drawingNo', type: 'input', props: { maxlength: 100 } },
        { label: '品牌', key: 'brand', type: 'input', props: { maxlength: 100 } },
        { label: '制造商', key: 'manufacturer', type: 'input', props: { maxlength: 160 } },
        { label: '材质', key: 'materialComposition', type: 'input', props: { maxlength: 160 } },
        { label: '产地', key: 'placeOfOrigin', type: 'input', props: { maxlength: 120 } },
        { label: '颜色', key: 'color', type: 'input', props: { maxlength: 80 } },
        {
          label: '属性组',
          key: 'attributeGroupId',
          type: 'select',
          options: groupOptions.value,
          props: { clearable: true, filterable: true }
        },
        {
          label: '物料组',
          key: 'materialGroupId',
          type: 'select',
          options: materialGroupSelectOptions.value,
          props: { clearable: true, filterable: true, placeholder: '选择物料组' }
        },
        ...(selectedAttributeGroup.value?.attributes
          .filter((attribute) => attribute.enabled)
          .map<FormItem>((attribute) => ({
            label: attribute.name,
            key: `attributeValues.${attribute.key}`,
            type: attribute.values.length ? 'select' : 'input',
            options: attribute.values.map((value) => ({ label: value, value })),
            props: { clearable: !attribute.required, maxlength: 120 },
            help: attribute.required ? '该属性由当前属性组设为必填' : undefined
          })) ?? []),
        { key: 'auxiliary', label: '辅助信息', type: 'divider', span: 24 },
        {
          label: '毛重',
          key: 'grossWeight',
          type: 'number',
          props: { min: 0, precision: 4, class: '!w-full' }
        },
        {
          label: '净重',
          key: 'netWeight',
          type: 'number',
          props: { min: 0, precision: 4, class: '!w-full' }
        },
        {
          label: '长度',
          key: 'length',
          type: 'number',
          props: { min: 0, precision: 4, class: '!w-full' }
        },
        {
          label: '宽度',
          key: 'width',
          type: 'number',
          props: { min: 0, precision: 4, class: '!w-full' }
        },
        {
          label: '厚度',
          key: 'thickness',
          type: 'number',
          props: { min: 0, precision: 4, class: '!w-full' }
        },
        { label: '面积', key: 'area', type: 'slot', help: '默认按长度 × 宽度计算，也可手工修改。' },
        {
          label: '容积',
          key: 'volume',
          type: 'number',
          props: { min: 0, precision: 4, class: '!w-full' }
        },
        {
          label: '生效日期',
          key: 'effectiveDate',
          type: 'date',
          props: { valueFormat: 'YYYY-MM-DD', class: '!w-full' }
        },
        {
          label: '失效日期',
          key: 'expirationDate',
          type: 'date',
          props: { valueFormat: 'YYYY-MM-DD', class: '!w-full' }
        },
        { key: 'governance', label: '治理信息', type: 'divider', span: 24 },
        {
          label: '状态',
          key: 'status',
          type: 'select',
          options: getDictMap.value.commonEnabledStatus ?? []
        },
        {
          label: '显示顺序',
          key: 'sort',
          type: 'number',
          props: { min: 0, max: 999999, precision: 0, class: '!w-full' }
        },
        {
          label: '物料描述',
          key: 'description',
          type: 'slot',
          span: 24,
          help: '根据物料分类中的“描述组成字段 + 描述连接符”实时生成并保存。'
        }
      ]
    if (activeTab.value === 'purchase')
      return [
        { key: 'purchaseView', label: '采购执行口径', type: 'divider', span: 24 },
        commonUnitItem('采购单位', 'purchaseUnitId'),
        { label: '采购员', key: 'purchaserId', type: 'slot' },
        { label: '计划员', key: 'plannerId', type: 'slot' },
        {
          label: '采购组织',
          key: 'purchaseOrganization',
          type: 'select',
          options: getDictMap.value.mdmMaterialPurchaseOrganization ?? [],
          props: { clearable: true }
        },
        {
          label: '默认供应商',
          key: 'defaultSupplierId',
          type: 'select',
          options: supplierSelectOptions.value,
          props: { clearable: true, filterable: true }
        },
        {
          label: '收货超采比率%',
          key: 'overReceiptPercent',
          type: 'number',
          props: { min: 0, precision: 4, class: '!w-full' }
        },
        {
          label: '收货欠收比率%',
          key: 'underReceiptPercent',
          type: 'number',
          props: { min: 0, precision: 4, class: '!w-full' }
        },
        {
          label: '超采数量',
          key: 'overPurchaseQuantity',
          type: 'number',
          props: { min: 0, precision: 4, class: '!w-full' }
        },
        { key: 'purchaseLead', label: '物料提前期', type: 'divider', span: 24 },
        {
          label: '固定提前期(天)',
          key: 'purchaseFixedLeadDays',
          type: 'number',
          props: { min: 0, precision: 0, class: '!w-full' }
        },
        {
          label: '前处理时间(天)',
          key: 'purchasePreprocessDays',
          type: 'number',
          props: { min: 0, precision: 0, class: '!w-full' }
        },
        {
          label: '后处理时间(天)',
          key: 'purchasePostprocessDays',
          type: 'number',
          props: { min: 0, precision: 0, class: '!w-full' }
        },
        {
          label: '检验提前期(天)',
          key: 'inspectionLeadDays',
          type: 'number',
          props: { min: 0, precision: 0, class: '!w-full' }
        }
      ]
    if (activeTab.value === 'sales')
      return [
        { key: 'salesView', label: '销售执行口径', type: 'divider', span: 24 },
        commonUnitItem('销售单位', 'salesUnitId'),
        { label: '销售员', key: 'salespersonId', type: 'slot' },
        {
          label: '销售组织',
          key: 'salesOrganization',
          type: 'select',
          options: getDictMap.value.mdmMaterialSalesOrganization ?? [],
          props: { clearable: true }
        },
        { key: 'salesLead', label: '物料提前期', type: 'divider', span: 24 },
        {
          label: '发货提前期(天)',
          key: 'shippingLeadDays',
          type: 'number',
          props: { min: 0, precision: 0, class: '!w-full' }
        },
        {
          label: '发货延迟(天)',
          key: 'shippingDelayDays',
          type: 'number',
          props: { min: 0, precision: 0, class: '!w-full' }
        },
        {
          label: '发货超发比率%',
          key: 'overDeliveryPercent',
          type: 'number',
          props: { min: 0, precision: 4, class: '!w-full' }
        },
        {
          label: '发货欠发比率%',
          key: 'underDeliveryPercent',
          type: 'number',
          props: { min: 0, precision: 4, class: '!w-full' }
        }
      ]
    if (activeTab.value === 'inventory')
      return [
        { key: 'inventoryView', label: '库存执行口径', type: 'divider', span: 24 },
        commonUnitItem('库存单位', 'inventoryUnitId'),
        { label: '仓管员', key: 'custodianId', type: 'slot' },
        {
          label: 'ABC分类',
          key: 'abcClassification',
          type: 'select',
          options: getDictMap.value.mdmMaterialAbcClassification ?? [],
          props: { clearable: true }
        },
        { label: '允许负库存', key: 'allowNegativeInventory', type: 'switch' },
        {
          label: '最小包装量',
          key: 'minimumPackQuantity',
          type: 'number',
          props: { min: 0, precision: 4, class: '!w-full' }
        },
        {
          label: '默认仓库',
          key: 'defaultWarehouseId',
          type: 'select',
          options: warehouseSelectOptions.value,
          props: { clearable: true, filterable: true }
        },
        {
          label: '默认仓位',
          key: 'storageLocationId',
          type: 'select',
          options: namedOptions(storageOptions.value),
          props: { clearable: true, filterable: true }
        },
        { key: 'stockMonitor', label: '库存监控', type: 'divider', span: 24 },
        { label: '启用最小库存预警', key: 'minStockAlertEnabled', type: 'switch' },
        {
          label: '最小库存',
          key: 'minStock',
          type: 'number',
          props: {
            min: 0,
            precision: 4,
            class: '!w-full',
            disabled: !formModel.minStockAlertEnabled
          }
        },
        { label: '启用安全库存预警', key: 'safetyStockAlertEnabled', type: 'switch' },
        {
          label: '安全库存',
          key: 'safetyStock',
          type: 'number',
          props: {
            min: 0,
            precision: 4,
            class: '!w-full',
            disabled: !formModel.safetyStockAlertEnabled
          }
        },
        { label: '启用再订货点预警', key: 'reorderPointAlertEnabled', type: 'switch' },
        {
          label: '再订货点',
          key: 'reorderPoint',
          type: 'number',
          props: {
            min: 0,
            precision: 4,
            class: '!w-full',
            disabled: !formModel.reorderPointAlertEnabled
          }
        },
        {
          label: '再订货批量',
          key: 'reorderQuantity',
          type: 'number',
          props: {
            min: 0,
            precision: 4,
            class: '!w-full',
            disabled: !formModel.reorderPointAlertEnabled
          }
        },
        {
          label: '物料消耗量(天)',
          key: 'dailyConsumption',
          type: 'number',
          props: {
            min: 0,
            precision: 4,
            class: '!w-full',
            disabled: !formModel.reorderPointAlertEnabled
          }
        },
        { label: '启用最大库存预警', key: 'maxStockAlertEnabled', type: 'switch' },
        {
          label: '最大库存',
          key: 'maxStock',
          type: 'number',
          props: {
            min: 0,
            precision: 4,
            class: '!w-full',
            disabled: !formModel.maxStockAlertEnabled
          }
        },
        {
          label: '出库规则配置',
          key: 'outboundRuleId',
          type: 'select',
          options: outboundRuleSelectOptions.value,
          props: { clearable: true, filterable: true }
        },
        { key: 'batch', label: '批号', type: 'divider', span: 24 },
        { label: '启用批号管理', key: 'batchManagementEnabled', type: 'switch' },
        {
          label: '批号规则',
          key: 'batchRuleId',
          type: 'select',
          options: batchRuleSelectOptions.value,
          props: { clearable: true, filterable: true, disabled: !formModel.batchManagementEnabled }
        },
        { key: 'serial', label: '序列号', type: 'divider', span: 24 },
        { label: '启用序列号管理', key: 'serialManagementEnabled', type: 'switch' },
        {
          label: '序列号规则',
          key: 'serialRuleId',
          type: 'select',
          options: serialRuleSelectOptions.value,
          props: { clearable: true, filterable: true, disabled: !formModel.serialManagementEnabled }
        },
        {
          label: '序列号生成时点',
          key: 'serialGenerationTiming',
          type: 'select',
          options: getDictMap.value.mdmMaterialSerialGenerationTiming ?? [],
          props: { clearable: true, disabled: !formModel.serialManagementEnabled }
        },
        { key: 'shelfLife', label: '保质期', type: 'divider', span: 24 },
        { label: '保质期管理', key: 'shelfLifeManagementEnabled', type: 'switch' },
        commonUnitItem('保质期单位', 'shelfLifeUnitId'),
        {
          label: '保质期',
          key: 'shelfLife',
          type: 'number',
          props: {
            min: 0,
            precision: 4,
            class: '!w-full',
            disabled: !formModel.shelfLifeManagementEnabled
          }
        },
        {
          label: '计算方向',
          key: 'shelfLifeCalculationDirection',
          type: 'select',
          options: getDictMap.value.mdmMaterialShelfCalculationDirection ?? [],
          props: { clearable: true, disabled: !formModel.shelfLifeManagementEnabled }
        },
        {
          label: '到期日计算方式',
          key: 'expiryCalculationMethod',
          type: 'select',
          options: getDictMap.value.mdmMaterialExpiryCalculationMethod ?? [],
          props: { clearable: true, disabled: !formModel.shelfLifeManagementEnabled }
        },
        commonUnitItem('提前期单位', 'advancePeriodUnitId'),
        {
          label: '入库失效提前期',
          key: 'inboundExpiryLead',
          type: 'number',
          props: {
            min: 0,
            precision: 4,
            class: '!w-full',
            disabled: !formModel.shelfLifeManagementEnabled
          }
        },
        {
          label: '出库失效提前期',
          key: 'outboundExpiryLead',
          type: 'number',
          props: {
            min: 0,
            precision: 4,
            class: '!w-full',
            disabled: !formModel.shelfLifeManagementEnabled
          }
        },
        { label: '启用预警', key: 'expiryAlertEnabled', type: 'switch' },
        {
          label: '预警提前期(天)',
          key: 'expiryAlertDays',
          type: 'number',
          props: { min: 0, precision: 0, class: '!w-full', disabled: !formModel.expiryAlertEnabled }
        },
        { key: 'barcode', label: '条码 / 二维码', type: 'divider', span: 24 },
        { label: '启用条码管理', key: 'barcodeManagementEnabled', type: 'switch' },
        {
          label: '条码',
          key: 'barcode',
          type: 'input',
          props: { maxlength: 160, disabled: !formModel.barcodeManagementEnabled }
        }
      ]
    if (activeTab.value === 'production')
      return [
        { key: 'productionView', label: '生产计划口径', type: 'divider', span: 24 },
        commonUnitItem('生产单位', 'productionUnitId'),
        { label: '调度员', key: 'dispatcherId', type: 'slot' },
        { label: '计划员', key: 'productionPlannerId', type: 'slot' },
        { label: '关键件', key: 'keyComponent', type: 'switch' },
        {
          label: '入库仓库',
          key: 'inboundWarehouseId',
          type: 'select',
          options: inboundWarehouseSelectOptions.value,
          props: { clearable: true, filterable: true }
        },
        {
          label: '批量大小',
          key: 'batchPolicy',
          type: 'select',
          options: getDictMap.value.mdmMaterialBatchPolicy ?? [],
          props: { clearable: true }
        },
        {
          label: '最大批量',
          key: 'maxBatch',
          type: 'number',
          props: { min: 0, precision: 4, class: '!w-full' }
        },
        {
          label: '最小批量',
          key: 'minBatch',
          type: 'number',
          props: { min: 0, precision: 4, class: '!w-full' }
        },
        {
          label: '固定批量',
          key: 'fixedBatch',
          type: 'number',
          props: { min: 0, precision: 4, class: '!w-full' }
        },
        { key: 'scheduling', label: '排产默认值', type: 'divider', span: 24 },
        {
          label: '排产优先级',
          key: 'schedulingPriority',
          type: 'number',
          help: '1 最低、100 最高；创建工单时冻结为工单优先级。',
          props: { min: 1, max: 100, precision: 0, class: '!w-full' }
        },
        {
          label: '排产方向',
          key: 'schedulingStrategy',
          type: 'select',
          help: '继承表示使用所选排产规则的方向。',
          options: getDictMap.value.mdmMaterialSchedulingStrategy ?? []
        },
        {
          label: '计划冻结期(天)',
          key: 'planningTimeFenceDays',
          type: 'number',
          help: '冻结期内已排任务默认不被自动排产覆盖。',
          props: { min: 0, max: 365, precision: 0, class: '!w-full' }
        },
        {
          label: '批量圆整数量',
          key: 'batchRoundingQuantity',
          type: 'number',
          help: '留空表示不圆整；填写后可作为工单数量与排产批次校验依据。',
          props: { min: 0.000001, precision: 6, class: '!w-full' }
        },
        { key: 'productionLead', label: '物料提前期', type: 'divider', span: 24 },
        {
          label: '固定提前期(天)',
          key: 'productionFixedLeadDays',
          type: 'number',
          props: { min: 0, precision: 0, class: '!w-full' }
        },
        {
          label: '前处理时间(天)',
          key: 'productionPreprocessDays',
          type: 'number',
          props: { min: 0, precision: 0, class: '!w-full' }
        },
        {
          label: '自制生产时间(天)',
          key: 'selfMadeProductionDays',
          type: 'number',
          props: { min: 0, precision: 0, class: '!w-full' }
        },
        {
          label: '后处理时间(天)',
          key: 'productionPostprocessDays',
          type: 'number',
          props: { min: 0, precision: 0, class: '!w-full' }
        },
        {
          label: '检验提前期(天)',
          key: 'productionInspectionLeadDays',
          type: 'number',
          props: { min: 0, precision: 0, class: '!w-full' }
        },
        { key: 'issueControl', label: '发料控制', type: 'divider', span: 24 },
        {
          label: '发料仓库',
          key: 'issuingWarehouseId',
          type: 'select',
          options: warehouseSelectOptions.value,
          props: { clearable: true, filterable: true }
        },
        {
          label: '领送料方式',
          key: 'materialIssueMethod',
          type: 'select',
          options: getDictMap.value.mdmMaterialIssueMethod ?? [],
          props: { clearable: true }
        },
        {
          label: '倒冲',
          key: 'backflushMethod',
          type: 'select',
          options: getDictMap.value.mdmMaterialBackflushMethod ?? [],
          props: { clearable: true }
        },
        {
          label: '超发控制方式',
          key: 'overIssueControlMethod',
          type: 'select',
          options: getDictMap.value.mdmMaterialOverIssueControl ?? [],
          props: { clearable: true }
        },
        {
          label: '领料上限允差%',
          key: 'issueTolerancePercent',
          type: 'number',
          props: { min: 0, precision: 4, class: '!w-full' }
        },
        {
          label: '最小发料批量',
          key: 'minimumIssueBatch',
          type: 'number',
          props: { min: 0, precision: 4, class: '!w-full' }
        }
      ]
    if (activeTab.value === 'finance')
      return [
        { key: 'financeView', label: '存货核算口径', type: 'divider', span: 24 },
        commonUnitItem('成本单位', 'costUnitId'),
        {
          label: '计价方法',
          key: 'valuationMethod',
          type: 'select',
          options: getDictMap.value.mdmMaterialValuationMethod ?? []
        },
        {
          label: '币种',
          key: 'currencyCode',
          type: 'select',
          options: getDictMap.value.mdmCurrency ?? []
        }
      ]
    return [
      { key: 'conversionView', label: '单位换算关系', type: 'divider', span: 24 },
      { label: '换算关系', key: 'unitConversions', type: 'slot', span: 24 }
    ]
  })
  const formItems = computed<FormItem[]>(() => enhanceFormItems(rawFormItems.value))
  void Promise.all(
    [
      'mdmMaterialSource',
      'mdmMaterialSpecialPurchaseType',
      'commonEnabledStatus',
      'mdmMaterialMrpType',
      'mdmMaterialValuationMethod',
      'mdmCurrency',
      'mdmMaterialPurchaseOrganization',
      'mdmMaterialSalesOrganization',
      'mdmMaterialAbcClassification',
      'mdmMaterialSerialGenerationTiming',
      'mdmMaterialShelfCalculationDirection',
      'mdmMaterialExpiryCalculationMethod',
      'mdmMaterialBatchPolicy',
      'mdmMaterialIssueMethod',
      'mdmMaterialBackflushMethod',
      'mdmMaterialOverIssueControl',
      'mdmMaterialCoreAttribute',
      'mdmMaterialSchedulingStrategy'
    ].map((code) => userStore.ensureDictLoaded(code))
  )
  const formRules: FormRules<Record<string, unknown>> = {
    materialName: [{ required: true, message: '请输入物料名称', trigger: 'blur' }],
    categoryId: [{ required: true, message: '请选择物料分类', trigger: 'change' }],
    materialTypeId: [{ required: true, message: '请选择物料类型', trigger: 'change' }],
    baseUnitId: [{ required: true, message: '请选择基本单位', trigger: 'change' }]
  }
  const addConversion = (): void => {
    formModel.unitConversions.push({ sourceUnitId: '', sourceFactor: 1, baseFactor: 1, remark: '' })
  }
  const recalculateArea = (): void => {
    formModel.area =
      formModel.length != null && formModel.width != null
        ? Number((formModel.length * formModel.width).toFixed(4))
        : null
  }
  const handleSubmit = async (): Promise<boolean> => {
    try {
      activeTab.value = 'base'
      await nextTick()
      await formRef.value?.validate()
      if (!formModel.codeRuleId && !formModel.materialCode.trim()) {
        activeTab.value = 'base'
        ElMessage.warning('请选择编码策略，或手工输入物料编码')
        return false
      }
      if (formModel.batchManagementEnabled && !formModel.batchRuleId) {
        activeTab.value = 'inventory'
        ElMessage.warning('启用批号管理后，请选择批号规则')
        return false
      }
      if (
        formModel.serialManagementEnabled &&
        (!formModel.serialRuleId || !formModel.serialGenerationTiming)
      ) {
        activeTab.value = 'inventory'
        ElMessage.warning('启用序列号管理后，请选择序列号规则和生成时点')
        return false
      }
      if (
        formModel.shelfLifeManagementEnabled &&
        (!formModel.shelfLifeUnitId ||
          formModel.shelfLife == null ||
          !formModel.shelfLifeCalculationDirection ||
          !formModel.expiryCalculationMethod)
      ) {
        activeTab.value = 'inventory'
        ElMessage.warning('启用保质期管理后，请完整填写保质期单位、保质期和计算规则')
        return false
      }
      const type = materialTypes.value.find((item) => item.id === formModel.materialTypeId)
      const baseUnit = units.value.find((item) => item.id === formModel.baseUnitId)
      if (!type || !baseUnit) return false
      if (
        type.typeCode === 'FERT' &&
        formModel.inboundWarehouseId &&
        !finishedReceiptWarehouses.value.some((item) => item.id === formModel.inboundWarehouseId)
      ) {
        activeTab.value = 'production'
        ElMessage.warning('成品入库仓库必须选择已启用且有业务应用范围的成品仓')
        return false
      }
      formModel.materialType = type.typeCode
      formModel.basicUnit = baseUnit.unitCode
      const payload = buildMaterialArchiveWriteInput(formModel)
      await saveMaterialArchive(payload, formModel.id)
      emit('success')
      return true
    } catch {
      return false
    }
  }
  const handleOpen = async (data: ArchiveDialogOpenData): Promise<void> => {
    Object.assign(formModel, initialForm())
    resetEmployeeSelections()
    activeTab.value = 'base'
    categories.value = data.categories
    materialTypes.value = data.materialTypes
    units.value = data.units
    attributeGroups.value = data.attributeGroups
    codeRules.value = data.codeRules
    storageOptions.value = data.storageOptions
    materialGroupOptions.value = data.materialGroupOptions
    supplierOptions.value = data.supplierOptions
    warehouseOptions.value = data.warehouseOptions
    outboundRuleOptions.value = data.outboundRuleOptions
    supplyRuleOptions.value = data.supplyRuleOptions
    if (data.row) Object.assign(formModel, cloneDeep(data.row))
    formModel.tenantId = data.row?.tenantId || data.tenantId
    if (!data.row && data.presetCategoryId) formModel.categoryId = data.presetCategoryId
    if (data.copy) {
      formModel.id = undefined
      formModel.materialCode = ''
      formModel.materialName = `${formModel.materialName}（副本）`
    }
    if (!formModel.id && !formModel.codeRuleId)
      formModel.codeRuleId = scopedCodeRules.value[0]?.id ?? null
    await dialogRef.value?.handleOpen(data, {
      title: `${data.copy ? '复制' : data.row ? '编辑' : '新增'}物料编码`,
      subtitle: '统一物料身份与各业务域默认视图',
      confirmText: '保存物料',
      contentMaxHeight: '74vh',
      loading: selectedEmployeeIds().length > 0,
      onConfirm: handleSubmit,
      onOpen: async (_openData, api) => {
        try {
          await loadEmployeeSelections()
          formRef.value?.clearValidate()
        } finally {
          api.setLoading(false)
        }
      }
    })
  }
  watch(
    materialDescription,
    (value) => {
      formModel.description = value
    },
    { immediate: true }
  )
  watch(
    () => formModel.tenantId,
    (value, previous) => {
      if (value === previous || !previous) return
      formModel.categoryId = ''
      formModel.materialTypeId = null
      formModel.baseUnitId = null
      formModel.auxiliaryUnitId = null
      formModel.auxiliaryUnit2Id = null
      formModel.attributeGroupId = null
      formModel.codeRuleId = null
      formModel.storageLocationId = null
      formModel.unitConversions = []
      formModel.purchaserId = null
      formModel.plannerId = null
      formModel.salespersonId = null
      formModel.custodianId = null
      formModel.dispatcherId = null
      formModel.productionPlannerId = null
      resetEmployeeSelections()
      formModel.materialGroupId = null
      formModel.defaultSupplierId = null
      formModel.defaultWarehouseId = null
      formModel.inboundWarehouseId = null
      formModel.issuingWarehouseId = null
      formModel.outboundRuleId = null
      formModel.batchRuleId = null
      formModel.serialRuleId = null
    }
  )
  watch(
    () => formModel.baseUnitId,
    (unitId) => {
      if (!unitId) return
      formModel.purchaseUnitId ||= unitId
      formModel.salesUnitId ||= unitId
      formModel.inventoryUnitId ||= unitId
      formModel.productionUnitId ||= unitId
      formModel.costUnitId ||= unitId
    }
  )
  watch(
    () => [formModel.length, formModel.width] as const,
    () => recalculateArea()
  )
  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .material-archive-dialog {
    min-width: 0;

    &__area-field {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--art-space-2);
      align-items: center;
      width: 100%;

      .el-button {
        min-width: 126px;
      }
    }

    :deep(.material-archive-dialog__form .el-input-number) {
      width: 100%;
    }
  }

  .material-archive-dialog__tabs {
    margin-top: -4px;
  }

  .material-archive-dialog__tabs :deep(.el-tabs__header) {
    margin-bottom: 10px;
  }

  .material-archive-dialog__tabs :deep(.el-tabs__content) {
    display: none;
  }

  .material-archive-dialog__tab-label {
    display: inline-flex;
    gap: 6px;
    align-items: center;
  }

  .material-archive-dialog__tab-label i {
    width: 5px;
    height: 5px;
    background: var(--el-color-success);
    border-radius: 50%;
  }

  .material-archive-dialog__panel {
    padding: 16px;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 10px;
  }

  .material-archive-dialog__section-heading {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    justify-content: space-between;
    padding: 1px 2px 14px;
  }

  .material-archive-dialog__section-heading strong,
  .material-archive-dialog__section-heading p {
    display: block;
    margin: 0;
  }

  .material-archive-dialog__section-heading strong {
    position: relative;
    padding-left: 12px;
    font-size: 15px;
  }

  .material-archive-dialog__section-heading strong::before {
    position: absolute;
    top: 2px;
    bottom: 2px;
    left: 0;
    width: 3px;
    content: '';
    background: var(--theme-color);
    border-radius: 2px;
  }

  .material-archive-dialog__section-heading p {
    padding-left: 12px;
    margin-top: 5px;
    font-size: 11px;
    color: var(--el-text-color-secondary);
  }

  .material-archive-dialog__completion {
    display: inline-flex;
    flex: none;
    gap: 8px;
    align-items: baseline;
    padding: 5px 9px;
    background: var(--el-fill-color-lighter);
    border-radius: 8px;
  }

  .material-archive-dialog__completion span {
    font-size: 10px;
    color: var(--el-text-color-secondary);
  }

  .material-archive-dialog__completion strong {
    padding: 0;
    font-variant-numeric: tabular-nums;
    color: var(--theme-color);
  }

  .material-archive-dialog__completion strong::before {
    display: none;
  }

  .material-archive-dialog__notice {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    padding: 10px 12px;
    margin-bottom: 4px;
    background: var(--el-fill-color-lighter);
    border-radius: 8px;
  }

  .material-archive-dialog__notice > span {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    color: var(--theme-color);
    background: color-mix(in srgb, var(--theme-color) 9%, var(--el-bg-color));
    border-radius: 8px;
  }

  .material-archive-dialog__notice p {
    margin: 0;
    font-size: 11px;
    line-height: 1.6;
    color: var(--el-text-color-secondary);
  }

  :deep(.material-archive-dialog__form) {
    padding: 6px 0 0;
  }

  .material-archive-dialog__rule-field {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    width: 100%;
  }

  .material-archive-dialog__description {
    display: grid;
    gap: 8px;
    width: 100%;
  }

  .material-archive-dialog__description :deep(.el-textarea__inner) {
    color: var(--el-text-color-primary);
    background: color-mix(in srgb, var(--theme-color) 4%, var(--default-box-color));
  }

  .material-archive-dialog__description-rule {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    min-height: 28px;
    padding: 6px 8px;
    color: var(--el-text-color-secondary);
    background: var(--art-gray-100);
    border-radius: var(--el-border-radius-base);
  }

  .material-archive-dialog__description-rule > span {
    display: inline-flex;
    gap: 5px;
    align-items: center;
    margin-right: 2px;
    font-size: 11px;
    font-weight: 600;
    color: var(--theme-color);
  }

  .material-archive-dialog__description-rule small {
    font-size: 11px;
  }

  .conversion-builder {
    display: grid;
    gap: 10px;
    width: 100%;
  }

  .conversion-builder__row {
    display: grid;
    grid-template-columns: minmax(160px, 1fr) 150px auto 150px auto minmax(140px, 1fr) auto;
    gap: 8px;
    align-items: center;
    padding: 10px;
    background: var(--el-fill-color-lighter);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--el-border-radius-base);
  }

  .conversion-builder__equals,
  .conversion-builder__base {
    color: var(--el-text-color-secondary);
    white-space: nowrap;
  }

  @media (width <= 820px) {
    .material-archive-dialog__area-field {
      grid-template-columns: 1fr;

      .el-button {
        width: 100%;
      }
    }

    .material-archive-dialog__rule-field,
    .conversion-builder__row {
      grid-template-columns: 1fr;
    }

    .conversion-builder__equals {
      display: none;
    }

    .material-archive-dialog__section-heading {
      flex-direction: column;
      align-items: stretch;
    }

    .material-archive-dialog__completion {
      justify-content: space-between;
    }
  }
</style>

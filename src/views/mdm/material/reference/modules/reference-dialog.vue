<template>
  <ArtDialog ref="dialogRef" size="xl">
    <div class="material-reference-dialog">
      <ArtEntitySummary
        v-if="currentKind === 'attribute-group'"
        class="material-reference-dialog__identity"
        icon="ri:list-settings-line"
        eyebrow="ATTRIBUTE GROUP"
        :title="formModel.groupName || '新属性组'"
        :description="formModel.groupCode || '保存前请填写属性组编码与名称'"
      >
        <template #aside>
          <div class="material-reference-dialog__attribute-metrics" aria-label="属性配置统计">
            <span
              ><strong>{{ formModel.attributes.length }}</strong
              ><small>属性</small></span
            >
            <span
              ><strong>{{ attributeValueCount }}</strong
              ><small>候选值</small></span
            >
          </div>
        </template>
      </ArtEntitySummary>
      <div v-else class="material-reference-dialog__context" role="note">
        <span aria-hidden="true"><ArtSvgIcon :icon="config.icon" /></span>
        <div>
          <strong>{{ config.dialogTitle }}</strong>
          <p>{{ config.dialogDescription }}</p>
        </div>
      </div>

      <ArtForm
        ref="formRef"
        v-model="form.model"
        :items="form.items"
        :rules="form.rules"
        :span="12"
        :gutter="24"
        label-position="top"
        :show-reset="false"
        :show-submit="false"
      >
        <template #attributes>
          <div class="material-reference-dialog__attribute-detail">
            <div class="material-reference-dialog__attribute-toolbar">
              <div>
                <span>{{ attributeSummary }}</span>
                <small>候选值支持回车添加；拖拽手柄或候选值标签可调整描述顺序。</small>
              </div>
              <ElButton
                type="primary"
                plain
                :disabled="formModel.attributes.length >= 50"
                @click="addAttribute"
              >
                <ArtSvgIcon icon="ri:add-line" />新增属性
              </ElButton>
            </div>
            <ArtTable
              class="material-reference-dialog__attribute-table"
              :data="formModel.attributes"
              :columns="attributeColumns"
              row-key="key"
              :pagination="false"
              :show-table-header="false"
              table-layout="fixed"
              height="auto"
              scrollbar-always-on
              empty-height="220px"
              empty-text="尚未添加属性"
              empty-description="点击右上角的“新增属性”，再维护属性名与候选值。"
              aria-label="属性明细"
              @row-drag-end="handleAttributeDragEnd"
              @keydown="handleAttributeReorderKeydown"
            />
          </div>
        </template>

        <template #segments>
          <div class="material-reference-dialog__builder">
            <div
              v-for="(segment, index) in formModel.segments"
              :key="`${index}-${segment.source}`"
              class="material-reference-dialog__builder-row is-segment"
            >
              <ElSelect v-model="segment.source" aria-label="号段来源">
                <ElOption
                  v-for="option in segmentSourceOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </ElSelect>
              <ElInput
                v-if="segment.source === 'fixed'"
                v-model="segment.value"
                maxlength="12"
                placeholder="固定字符"
              />
              <ElSelect
                v-else-if="segment.source === 'date'"
                v-model="segment.format"
                aria-label="日期格式"
              >
                <ElOption
                  v-for="option in materialCodeDateFormatOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </ElSelect>
              <span v-else class="material-reference-dialog__segment-note">
                {{ segmentSourceDescription(segment.source) }}
              </span>
              <div class="material-reference-dialog__row-actions">
                <ArtIconButton
                  icon="ri:arrow-up-line"
                  label="上移号段"
                  :disabled="index === 0"
                  @click="moveItem(formModel.segments, Number(index), -1)"
                />
                <ArtIconButton
                  icon="ri:arrow-down-line"
                  label="下移号段"
                  :disabled="index === formModel.segments.length - 1"
                  @click="moveItem(formModel.segments, Number(index), 1)"
                />
                <ArtIconButton
                  icon="ri:delete-bin-line"
                  label="删除号段"
                  @click="formModel.segments.splice(Number(index), 1)"
                />
              </div>
            </div>
            <ElButton plain :disabled="formModel.segments.length >= 5" @click="addSegment"
              ><ArtSvgIcon icon="ri:add-line" />添加号段</ElButton
            >
            <div class="material-reference-dialog__preview">
              <span>编码预览</span>
              <strong translate="no" :class="{ 'is-overflow': rulePreview.overflow }">
                {{ rulePreview.code }}
              </strong>
              <small v-if="rulePreview.overflow">超出 {{ rulePreview.overflow }} 位</small>
              <small v-else>共 {{ rulePreview.code.length }} 位</small>
            </div>
          </div>
        </template>
      </ArtForm>
    </div>
  </ArtDialog>
</template>

<script setup lang="tsx">
  import {
    ElCheckbox,
    ElInput,
    ElInputTag,
    ElMessage,
    ElSwitch,
    type FormRules
  } from 'element-plus'
  import { cloneDeep, uniqBy } from 'lodash-es'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import type { ColumnOption } from '@/types/component'
  import { useUserStore } from '@/store/modules/user'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import {
    fetchMaterialReferenceOptions,
    saveMaterialReference,
    type MaterialAttributeDefinition,
    type MaterialCodeSegment,
    type MaterialReferenceKind,
    type MaterialReferenceRecord,
    type UnitOfMeasure
  } from '@/api/mdm'
  import { buildMaterialCodePreview } from './material-code-preview'

  interface ReferenceFormModel {
    id?: string
    tenantId: string
    unitCode: string
    unitName: string
    symbol: string
    dimension: string
    decimalPlaces: number
    isBaseUnit: boolean
    baseUnitId: string | null
    conversionFactor: number
    typeCode: string
    typeName: string
    codePrefix: string
    groupCode: string
    groupName: string
    attributes: MaterialAttributeDefinition[]
    textColor: string
    tagType: Api.Common.TagType
    ruleCode: string
    ruleName: string
    strategy: 'material_type' | 'material_category'
    prefix: string
    segments: MaterialCodeSegment[]
    sequenceDigits: number
    codeLength: number
    exampleCode: string
    nextValue: number
    status: 'enabled' | 'disabled'
    sort: number
    remark: string
  }

  export interface ReferenceDialogOpenData {
    kind: MaterialReferenceKind
    row?: MaterialReferenceRecord
    copy?: boolean
    tenantId: string
    tenantOptions: Array<{ label: string; value: string }>
  }
  interface FormExpose {
    validate: () => Promise<boolean>
    clearValidate: () => void
  }

  const emit = defineEmits<{ success: [mode: 'add' | 'edit'] }>()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const dialogRef = ref<ArtDialogExpose<ReferenceDialogOpenData>>()
  const formRef = ref<FormExpose>()
  const currentKind = ref<MaterialReferenceKind>('unit-of-measure')
  const tenantOptions = ref<Array<{ label: string; value: string }>>([])
  const unitOptions = ref<UnitOfMeasure[]>([])
  const initialForm = (): ReferenceFormModel => ({
    id: undefined,
    tenantId: '',
    unitCode: '',
    unitName: '',
    symbol: '',
    dimension: '通用',
    decimalPlaces: 2,
    isBaseUnit: true,
    baseUnitId: null,
    conversionFactor: 1,
    typeCode: '',
    typeName: '',
    codePrefix: '',
    groupCode: '',
    groupName: '',
    attributes: [],
    textColor: '',
    tagType: 'primary',
    ruleCode: '',
    ruleName: '',
    strategy: 'material_type',
    prefix: '',
    segments: [{ source: 'material_type' }, { source: 'fixed', value: '-' }],
    sequenceDigits: 4,
    codeLength: 8,
    exampleCode: '',
    nextValue: 1,
    status: 'enabled',
    sort: 10,
    remark: ''
  })
  const formModel = reactive<ReferenceFormModel>(initialForm())
  const configs = {
    'unit-of-measure': {
      icon: 'ri:ruler-line',
      dialogTitle: '建立统一计量口径',
      dialogDescription: '一个单位只定义一次，换算关系在物料档案中按业务需要维护。'
    },
    'material-type': {
      icon: 'ri:price-tag-3-line',
      dialogTitle: '维护物料类型',
      dialogDescription: '类型承担顶层业务语义，并为物料编码提供稳定前缀。'
    },
    'attribute-group': {
      icon: 'ri:list-settings-line',
      dialogTitle: '配置物料属性组',
      dialogDescription: '用结构化属性和值域替代自由文本，保证检索和编码描述一致。'
    },
    'code-rule': {
      icon: 'ri:barcode-line',
      dialogTitle: '编排物料编码规则',
      dialogDescription: '最多五个语义号段，最后由服务端追加受控流水号。'
    }
  } as const
  const config = computed(() => configs[currentKind.value])
  const baseUnitOptions = computed(() =>
    unitOptions.value
      .filter(
        (unit) =>
          unit.isBaseUnit && unit.id !== formModel.id && unit.dimension === formModel.dimension
      )
      .map((unit) => ({ label: `${unit.unitName} · ${unit.unitCode}`, value: unit.id }))
  )
  const statusOptions = computed(() => getDictMap.value.commonEnabledStatus ?? [])
  const segmentSourceOptions = computed(() => getDictMap.value.mdmMaterialCodeSegmentSource ?? [])
  const materialCodeDateFormatOptions = computed(
    () => getDictMap.value.mdmMaterialCodeDateFormat ?? []
  )
  const tenantItems = (): FormItem[] => [
    {
      label: '目标租户',
      key: 'tenantId',
      type: 'select',
      options: tenantOptions.value,
      props: {
        disabled: Boolean(formModel.id),
        filterable: true,
        placeholder: '请选择本次维护的数据归属租户'
      }
    }
  ]
  const baseItems = (): FormItem[] => [
    {
      label: '启用状态',
      key: 'status',
      type: 'select',
      options: statusOptions.value,
      props: { clearable: false }
    },
    {
      label: '显示顺序',
      key: 'sort',
      type: 'number',
      props: { min: 0, max: 999999, precision: 0, class: '!w-full' }
    },
    {
      label: '备注',
      key: 'remark',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 3, maxlength: 500, showWordLimit: true, resize: 'none' }
    }
  ]
  const form = reactive<{
    model: ReferenceFormModel
    items: ComputedRef<FormItem[]>
    rules: FormRules<ReferenceFormModel>
  }>({
    model: formModel,
    items: computed(() => {
      if (currentKind.value === 'unit-of-measure')
        return [
          ...tenantItems(),
          {
            label: '单位编码',
            key: 'unitCode',
            type: 'input',
            props: { maxlength: 20, placeholder: '如 KG' }
          },
          {
            label: '单位名称',
            key: 'unitName',
            type: 'input',
            props: { maxlength: 60, placeholder: '如 千克' }
          },
          {
            label: '单位符号',
            key: 'symbol',
            type: 'input',
            props: { maxlength: 20, placeholder: '如 kg' }
          },
          {
            label: '计量维度',
            key: 'dimension',
            type: 'input',
            props: { maxlength: 40, placeholder: '质量、长度、数量…' }
          },
          {
            label: '小数位数',
            key: 'decimalPlaces',
            type: 'number',
            props: { min: 0, max: 8, precision: 0, class: '!w-full' }
          },
          {
            label: '维度基准单位',
            key: 'isBaseUnit',
            type: 'switch',
            props: { activeText: '是', inactiveText: '否' }
          },
          {
            label: '换算基准单位',
            key: 'baseUnitId',
            type: 'select',
            options: baseUnitOptions.value,
            props: {
              clearable: true,
              filterable: true,
              disabled: formModel.isBaseUnit,
              placeholder: formModel.isBaseUnit ? '基准单位无需选择' : '选择同维度基准单位'
            }
          },
          {
            label: '基准换算系数',
            key: 'conversionFactor',
            type: 'number',
            props: {
              min: 0.00000001,
              precision: 8,
              class: '!w-full',
              disabled: formModel.isBaseUnit
            }
          },
          ...baseItems()
        ]
      if (currentKind.value === 'material-type')
        return [
          ...tenantItems(),
          {
            label: '类型编码',
            key: 'typeCode',
            type: 'input',
            props: { maxlength: 40, placeholder: '如 RAW' }
          },
          {
            label: '类型名称',
            key: 'typeName',
            type: 'input',
            props: { maxlength: 80, placeholder: '如 原材料' }
          },
          {
            label: '编码前缀',
            key: 'codePrefix',
            type: 'input',
            props: { maxlength: 20, placeholder: '如 RM' }
          },
          {
            label: '标签样式',
            key: 'tagType',
            type: 'tagStyleSelect'
          },
          ...baseItems()
        ]
      if (currentKind.value === 'attribute-group')
        return [
          ...tenantItems(),
          {
            label: '属性组编码',
            key: 'groupCode',
            type: 'input',
            props: { maxlength: 40, placeholder: '如 APPEARANCE' }
          },
          {
            label: '属性组名称',
            key: 'groupName',
            type: 'input',
            props: { maxlength: 80, placeholder: '如 外观属性' }
          },
          { label: '属性明细', key: 'attributes', type: 'slot', span: 24 },
          ...baseItems()
        ]
      return [
        ...tenantItems(),
        {
          label: '规则编码',
          key: 'ruleCode',
          type: 'input',
          props: { maxlength: 40, placeholder: '如 RAW_MATERIAL' }
        },
        {
          label: '规则名称',
          key: 'ruleName',
          type: 'input',
          props: { maxlength: 100, placeholder: '如 原材料编码规则' }
        },
        {
          label: '归类策略',
          key: 'strategy',
          type: 'select',
          options: getDictMap.value.mdmMaterialCodeStrategy ?? [],
          props: { clearable: false, onChange: applyStrategyPreset }
        },
        {
          label: '固定字段',
          key: 'prefix',
          type: 'input',
          props: { maxlength: 20, placeholder: '兼容历史规则，通常留空' },
          help: '推荐在号段配置中使用“固定字符”；编码位数不足时，系统会在最后一个固定字符前补 0。'
        },
        {
          label: '流水位数',
          key: 'sequenceDigits',
          type: 'number',
          props: { min: 2, max: 12, precision: 0, class: '!w-full' }
        },
        {
          label: '编码总长度',
          key: 'codeLength',
          type: 'number',
          props: { min: 4, max: 60, precision: 0, class: '!w-full' }
        },
        { label: '号段配置', key: 'segments', type: 'slot', span: 24 },
        ...baseItems()
      ]
    }),
    rules: {
      tenantId: [{ required: true, message: '请选择目标租户', trigger: 'change' }],
      unitCode: [{ required: true, message: '请输入单位编码', trigger: 'blur' }],
      unitName: [{ required: true, message: '请输入单位名称', trigger: 'blur' }],
      baseUnitId: [
        {
          validator: (_rule, value, callback) =>
            formModel.isBaseUnit || value
              ? callback()
              : callback(new Error('请选择同维度基准单位')),
          trigger: 'change'
        }
      ],
      typeCode: [{ required: true, message: '请输入类型编码', trigger: 'blur' }],
      typeName: [{ required: true, message: '请输入类型名称', trigger: 'blur' }],
      groupCode: [{ required: true, message: '请输入属性组编码', trigger: 'blur' }],
      groupName: [{ required: true, message: '请输入属性组名称', trigger: 'blur' }],
      attributes: [
        {
          validator: (_rule, value, callback) => {
            const attributes = value as MaterialAttributeDefinition[]
            if (attributes.some((item) => !item.name.trim())) {
              callback(new Error('请完善所有属性名'))
              return
            }
            const normalizedNames = attributes.map((item) => item.name.trim().toLowerCase())
            if (new Set(normalizedNames).size !== normalizedNames.length) {
              callback(new Error('属性名不能重复'))
              return
            }
            callback()
          },
          trigger: 'change'
        }
      ],
      ruleCode: [{ required: true, message: '请输入规则编码', trigger: 'blur' }],
      ruleName: [{ required: true, message: '请输入规则名称', trigger: 'blur' }]
    }
  })
  void Promise.all(
    [
      'commonEnabledStatus',
      'mdmMaterialCodeStrategy',
      'mdmMaterialCodeSegmentSource',
      'mdmMaterialCodeDateFormat'
    ].map((code) => userStore.ensureDictLoaded(code))
  )
  const rulePreview = computed(() =>
    buildMaterialCodePreview({
      fixedField: form.model.prefix,
      segments: form.model.segments,
      sequenceDigits: form.model.sequenceDigits,
      codeLength: form.model.codeLength,
      sequenceValue: form.model.nextValue,
      materialTypePrefix: 'R',
      materialCategoryPrefix: 'R101'
    })
  )
  const attributeValueCount = computed(() =>
    form.model.attributes.reduce((total, attribute) => total + attribute.values.length, 0)
  )
  const attributeSummary = computed(() =>
    form.model.attributes.length
      ? `共 ${form.model.attributes.length} 个属性、${attributeValueCount.value} 个候选值`
      : '从第一项属性开始建立结构化值域'
  )
  const attributeColumns: ColumnOption<MaterialAttributeDefinition>[] = [
    {
      prop: 'order',
      label: '顺序',
      width: 100,
      draggable: true,
      showOverflowTooltip: false,
      formatter: (row) => (
        <span class="inline-grid size-7 place-items-center rounded-full bg-[var(--el-color-primary-light-9)] text-xs text-[var(--theme-color)] tabular-nums">
          {formModel.attributes.indexOf(row) + 1}
        </span>
      )
    },
    {
      prop: 'name',
      label: '属性名',
      minWidth: 205,
      showOverflowTooltip: false,
      formatter: (row) => (
        <ElInput
          v-model={row.name}
          maxlength={40}
          placeholder="如 颜色"
          aria-label={`第 ${formModel.attributes.indexOf(row) + 1} 项属性名`}
          class="w-full!"
        />
      )
    },
    {
      prop: 'values',
      label: '候选值',
      minWidth: 500,
      showOverflowTooltip: false,
      formatter: (row) => (
        <ElInputTag
          v-model={row.values}
          max={100}
          maxlength={120}
          draggable
          placeholder="输入候选值，按回车添加"
          aria-label={`为${row.name || '当前属性'}添加候选值`}
          class="w-full!"
          onChange={() => normalizeAttributeValues(row)}
        />
      )
    },
    {
      prop: 'settings',
      label: '配置',
      width: 145,
      showOverflowTooltip: false,
      formatter: (row) => (
        <div class="flex min-h-9 items-center justify-between gap-2">
          <ElCheckbox v-model={row.required}>必填</ElCheckbox>
          <ElSwitch
            v-model={row.enabled}
            inlinePrompt
            activeText="启"
            inactiveText="停"
            aria-label={`${row.name || '当前属性'}启用状态`}
          />
        </div>
      )
    },
    {
      prop: 'operation',
      label: '操作',
      width: 66,
      fixed: 'right',
      showOverflowTooltip: false,
      formatter: (row) => (
        <ArtButtonTable
          type="delete"
          permission="MdmMaterialAttributeGroup:Edit"
          label="删除属性"
          onClick={() => removeAttribute(formModel.attributes.indexOf(row))}
        />
      )
    }
  ]
  const handleAttributeDragEnd = (payload: { oldIndex?: number; newIndex?: number }): void => {
    const { oldIndex, newIndex } = payload
    if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return
    const [attribute] = formModel.attributes.splice(oldIndex, 1)
    if (attribute) formModel.attributes.splice(newIndex, 0, attribute)
  }
  const handleAttributeReorderKeydown = (event: KeyboardEvent): void => {
    if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return
    const target = event.target
    if (!(target instanceof Element)) return
    const key = target.closest<HTMLElement>('.art-table__drag-handle')?.dataset.rowKey
    const index = formModel.attributes.findIndex((attribute) => attribute.key === key)
    if (index < 0) return
    event.preventDefault()
    moveItem(formModel.attributes, index, event.key === 'ArrowUp' ? -1 : 1)
  }
  function moveItem<T>(items: T[], index: number, offset: number): void {
    const target = index + offset
    if (target < 0 || target >= items.length) return
    ;[items[index], items[target]] = [items[target], items[index]]
  }
  const addAttribute = (): void => {
    const key = crypto.randomUUID()
    form.model.attributes.push({
      key,
      name: '',
      values: [],
      required: false,
      enabled: true
    })
  }
  const normalizeAttributeValues = (attribute: MaterialAttributeDefinition): void => {
    const normalized = attribute.values.map((value) => value.trim()).filter(Boolean)
    if (normalized.length > 100) {
      ElMessage.warning('单个属性最多维护 100 个属性值')
      normalized.length = 100
    }
    const unique = uniqBy(normalized, (value) => value.toLowerCase())
    if (unique.length !== normalized.length) {
      ElMessage.warning('该属性值已存在')
    }
    attribute.values = unique
  }
  const removeAttribute = (index: number): void => {
    if (index < 0) return
    form.model.attributes.splice(index, 1)
  }
  const addSegment = (): void => {
    if (form.model.segments.length < 5) form.model.segments.push({ source: 'fixed', value: '' })
  }
  const segmentSourceDescription = (source: MaterialCodeSegment['source']): string =>
    source === 'material_type' ? '读取所选物料类型的“编码前缀”' : '读取所选物料分类的“编码前缀”'
  function applyStrategyPreset(strategy: ReferenceFormModel['strategy']): void {
    form.model.prefix = ''
    form.model.segments = [{ source: strategy }, { source: 'fixed', value: '-' }]
    form.model.sequenceDigits = 4
    form.model.codeLength = strategy === 'material_type' ? 8 : 10
  }
  const payloadForKind = (): Partial<MaterialReferenceRecord> => {
    const shared = {
      tenantId: form.model.tenantId,
      status: form.model.status,
      sort: Number(form.model.sort),
      remark: form.model.remark.trim()
    }
    if (currentKind.value === 'unit-of-measure')
      return {
        ...shared,
        unitCode: form.model.unitCode.trim().toUpperCase(),
        unitName: form.model.unitName.trim(),
        symbol: normalizeNullableText(form.model.symbol),
        dimension: form.model.dimension.trim(),
        decimalPlaces: form.model.decimalPlaces,
        isBaseUnit: form.model.isBaseUnit,
        baseUnitId: form.model.isBaseUnit ? null : form.model.baseUnitId,
        conversionFactor: form.model.isBaseUnit ? 1 : form.model.conversionFactor
      }
    if (currentKind.value === 'material-type')
      return {
        ...shared,
        typeCode: form.model.typeCode.trim().toUpperCase(),
        typeName: form.model.typeName.trim(),
        codePrefix: form.model.codePrefix.trim().toUpperCase(),
        textColor: form.model.textColor,
        tagType: form.model.tagType
      }
    if (currentKind.value === 'attribute-group')
      return {
        ...shared,
        groupCode: form.model.groupCode.trim().toUpperCase(),
        groupName: form.model.groupName.trim(),
        attributes: form.model.attributes
          .filter((item) => item.name.trim())
          .map((item) => ({ ...item, name: item.name.trim() })),
        textColor: form.model.textColor,
        tagType: form.model.tagType
      }
    return {
      ...shared,
      ruleCode: form.model.ruleCode.trim().toUpperCase(),
      ruleName: form.model.ruleName.trim(),
      strategy: form.model.strategy,
      prefix: form.model.prefix.trim().toUpperCase(),
      segments: form.model.segments,
      sequenceDigits: form.model.sequenceDigits,
      codeLength: form.model.codeLength,
      nextValue: form.model.nextValue,
      exampleCode: rulePreview.value.code
    }
  }
  const handleSubmit = async (): Promise<boolean> => {
    try {
      await formRef.value?.validate()
      if (currentKind.value === 'code-rule' && rulePreview.value.overflow) {
        ElMessage.warning(`编码预览超出总长度 ${rulePreview.value.overflow} 位，请调整号段或总长度`)
        return false
      }
      await saveMaterialReference(currentKind.value, payloadForKind(), form.model.id)
      emit('success', form.model.id ? 'edit' : 'add')
      return true
    } catch {
      return false
    }
  }
  const handleOpen = async (data: ReferenceDialogOpenData): Promise<void> => {
    Object.assign(form.model, initialForm())
    currentKind.value = data.kind
    tenantOptions.value = data.tenantOptions
    form.model.tenantId = data.row?.tenantId || data.tenantId
    unitOptions.value = []
    if (data.row) Object.assign(form.model, cloneDeep(data.row))
    if (data.copy) {
      form.model.id = undefined
      form.model.nextValue = 1
    }
    const entityLabel = config.value.dialogTitle.replace(/^维护|建立|配置|编排/, '')
    await dialogRef.value?.handleOpen(data, {
      title: `${data.copy ? '复制' : data.row ? '编辑' : '新增'}${entityLabel}`,
      subtitle: config.value.dialogDescription,
      size:
        currentKind.value === 'material-type'
          ? 'md'
          : currentKind.value === 'unit-of-measure'
            ? 'lg'
            : 'xl',
      confirmText: data.copy ? '复制并新增' : data.row ? '保存更改' : `创建${entityLabel}`,
      contentMaxHeight:
        currentKind.value === 'material-type'
          ? 'min(62vh, calc(100vh - 220px))'
          : 'min(72vh, calc(100vh - 200px))',
      loading: data.kind === 'unit-of-measure' && Boolean(form.model.tenantId),
      loadingText: '正在加载计量单位…',
      onConfirm: handleSubmit,
      onOpen: async (_openData, api) => {
        formRef.value?.clearValidate()
        try {
          if (data.kind === 'unit-of-measure' && form.model.tenantId)
            unitOptions.value = await fetchMaterialReferenceOptions<UnitOfMeasure>(
              'unit-of-measure',
              form.model.tenantId
            )
        } catch {
          ElMessage.warning('计量单位加载失败，请关闭弹窗后重试')
        } finally {
          api.setLoading(false)
        }
      }
    })
  }
  watch(
    () => form.model.tenantId,
    async (value, previous) => {
      if (value === previous || currentKind.value !== 'unit-of-measure') return
      unitOptions.value = value
        ? await fetchMaterialReferenceOptions<UnitOfMeasure>('unit-of-measure', value)
        : []
      if (!unitOptions.value.some((unit) => unit.id === form.model.baseUnitId)) {
        form.model.baseUnitId = null
      }
    }
  )
  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .material-reference-dialog {
    &__identity {
      margin-bottom: var(--art-space-4);
    }

    &__attribute-metrics {
      display: flex;
      gap: var(--art-space-4);
      align-items: center;

      span {
        display: grid;
        grid-template-columns: auto auto;
        gap: 4px;
        align-items: baseline;
      }

      strong {
        font-size: 18px;
        font-variant-numeric: tabular-nums;
        color: var(--theme-color);
      }

      small {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }

    &__context {
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr);
      gap: 12px;
      align-items: center;
      padding: 12px 14px;
      margin-bottom: 18px;
      background: color-mix(in srgb, var(--theme-color) 7%, var(--default-box-color));
      border-left: 3px solid var(--theme-color);
      border-radius: var(--el-border-radius-base);

      > span {
        display: grid;
        place-items: center;
        width: 42px;
        height: 42px;
        color: var(--theme-color);
        background: var(--default-box-color);
        border-radius: var(--el-border-radius-base);
      }

      span {
        font-size: 13px;
        font-weight: 600;
        color: var(--el-text-color-regular);
      }

      p {
        margin: 3px 0 0;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    &__builder {
      display: grid;
      gap: 10px;
      width: 100%;
    }

    &__attribute-detail {
      display: grid;
      gap: 12px;
      width: 100%;
    }

    &__attribute-toolbar {
      display: flex;
      gap: 16px;
      align-items: center;
      justify-content: space-between;

      > div {
        display: grid;
        gap: 3px;
      }

      strong {
        color: var(--el-text-color-primary);
      }

      small {
        color: var(--el-text-color-secondary);
      }
    }

    &__attribute-table {
      min-width: 0;
      height: auto !important;

      :deep(.el-table) {
        height: auto;
        margin-top: 0;
      }

      :deep(.el-table__body td.el-table__cell) {
        padding: 12px 0;
        vertical-align: top;
      }

      :deep(.el-table__body-wrapper .el-scrollbar__bar.is-horizontal) {
        top: 0;
        bottom: auto;
      }

      :deep(.art-table__cell-content) {
        display: flex;
        align-items: center;
        width: 100%;
        min-width: 0;
        max-width: 100%;
        white-space: normal;
      }

      :deep(.art-table__cell-value) {
        display: block;
        flex: 1;
        width: 100%;
        min-width: 0;
        overflow: visible;
        white-space: normal;
      }
    }

    &__row-actions {
      display: flex;
      gap: 4px;
      align-items: center;
    }

    &__builder-row {
      display: grid;
      grid-template-columns: minmax(140px, 0.7fr) minmax(220px, 1.4fr) auto auto auto;
      gap: 10px;
      align-items: center;
      padding: 10px;
      background: var(--art-gray-100);
      border-radius: var(--el-border-radius-base);

      &.is-segment {
        grid-template-columns: 180px minmax(180px, 1fr) auto;
      }
    }

    &__segment-note {
      color: var(--el-text-color-secondary);
    }

    &__preview {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 14px;
      align-items: center;
      padding: 12px 14px;
      color: var(--el-text-color-secondary);
      background: color-mix(in srgb, var(--theme-color) 6%, var(--default-box-color));
      border-radius: var(--el-border-radius-base);

      strong {
        color: var(--theme-color);
        letter-spacing: 0.08em;

        &.is-overflow {
          color: var(--el-color-danger);
        }
      }

      small {
        font-variant-numeric: tabular-nums;
        color: var(--el-text-color-secondary);
      }
    }

    @media (width <= 760px) {
      &__attribute-toolbar {
        flex-direction: column;
        align-items: stretch;

        .el-button {
          align-self: flex-start;
        }
      }

      &__builder-row,
      &__builder-row.is-segment {
        grid-template-columns: 1fr;
      }

      &__row-actions {
        justify-content: flex-end;
      }
    }
  }
</style>

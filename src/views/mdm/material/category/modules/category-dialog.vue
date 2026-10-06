<template>
  <ArtDialog ref="dialogRef" size="xl">
    <div class="material-category-dialog">
      <div class="material-category-dialog__notice">
        <span><ArtSvgIcon icon="ri:node-tree" /></span>
        <div
          ><strong>分类决定物料归属与默认业务策略</strong
          ><p>采购、收货、批次和计价默认值可在物料档案中覆盖。</p></div
        >
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
      >
        <template #purchaser>
          <ArtEmployeeSelect
            :model-value="formModel.purchaserId ?? undefined"
            :tenant-id="tenantId"
            placeholder="选择默认采购员"
            @update:model-value="formModel.purchaserId = $event ?? null"
          />
        </template>
      </ArtForm>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import type { FormRules } from 'element-plus'
  import { cloneDeep } from 'lodash-es'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import TreeUtils from '@/utils/tree'
  import {
    saveMaterialCategory,
    type MaterialCategory,
    type MaterialType,
    type MaterialContextOption
  } from '@/api/mdm'
  import { buildMaterialCategoryWriteInput } from './category-payload'

  export interface CategoryDialogOpenData {
    row?: MaterialCategory
    categories: MaterialCategory[]
    materialTypes: MaterialType[]
    sites: MaterialContextOption[]
    tenantId: string
    tenantOptions: Array<{ label: string; value: string }>
    parentId?: string
    copy?: boolean
  }
  interface FormExpose {
    validate: () => Promise<boolean>
    clearValidate: () => void
  }
  interface CategoryTreeOption {
    id: string
    parentId?: string | null
    label: string
    value: string
    sort: number
    children?: CategoryTreeOption[]
  }

  const emit = defineEmits<{ success: [] }>()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const dialogRef = ref<ArtDialogExpose<CategoryDialogOpenData>>()
  const formRef = ref<FormExpose>()
  const tenantOptions = ref<Array<{ label: string; value: string }>>([])
  const sourceCategories = ref<MaterialCategory[]>([])
  const sourceMaterialTypes = ref<MaterialType[]>([])
  const sourceSites = ref<MaterialContextOption[]>([])
  const categoryTreeUtils = new TreeUtils({ parentKey: 'parentId' })
  const typeOptions = ref<Array<{ label: string; value: string }>>([])
  const siteOptions = ref<Array<{ label: string; value: string }>>([])
  const initialForm = (): MaterialCategory => ({
    id: '',
    tenantId: '',
    parentId: null,
    categoryCode: '',
    codePrefix: '',
    categoryName: '',
    materialTypeId: null,
    printName: '',
    compositionColumns: ['material_name', 'specification_model'],
    compositionSeparator: ' / ',
    overPurchasePercent: 0,
    overPurchaseQuantity: 0,
    maxReceiptQuantity: null,
    autoReceive: false,
    purchaserId: null,
    purchaseOrganization: '',
    requiresInspection: false,
    createDeliveryNotice: false,
    defaultSiteId: null,
    overReceiptPercent: 0,
    overReceiptQuantity: 0,
    batchManaged: false,
    valuationMethod: 'moving_average',
    description: '',
    status: 'enabled',
    sort: 10
  })
  const formModel = reactive<MaterialCategory>(initialForm())
  const tenantId = computed(() => formModel.tenantId)
  const categoryOptions = computed<CategoryTreeOption[]>(() => {
    const scoped = sourceCategories.value.filter((item) => item.tenantId === formModel.tenantId)
    const sourceTree = categoryTreeUtils.listToTree(scoped)
    const blockedIds = new Set(
      formModel.id
        ? categoryTreeUtils.getDescendants(sourceTree, formModel.id, true).map((item) => item.id)
        : []
    )
    return categoryTreeUtils.listToTree<CategoryTreeOption>(
      scoped
        .filter((item) => !blockedIds.has(item.id))
        .map((item) => ({
          id: item.id,
          parentId: item.parentId,
          label: `${item.categoryName} · ${item.categoryCode}`,
          value: item.id,
          sort: item.sort
        })),
      (left, right) => left.sort - right.sort || left.label.localeCompare(right.label, 'zh-CN')
    )
  })
  const formItems = computed<FormItem[]>(() => [
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
    },
    { label: '分类身份', key: 'identity', type: 'divider', span: 24 },
    {
      label: '上级分类',
      key: 'parentId',
      type: 'treeSelect',
      options: categoryOptions.value,
      props: {
        clearable: true,
        filterable: true,
        checkStrictly: true,
        defaultExpandAll: true,
        nodeKey: 'id',
        placeholder: '顶级分类（不选择上级）'
      }
    },
    {
      label: '物料类型',
      key: 'materialTypeId',
      type: 'select',
      options: typeOptions.value,
      props: { clearable: true, filterable: true }
    },
    {
      label: '分类编码',
      key: 'categoryCode',
      type: 'input',
      props: { maxlength: 40, placeholder: '如 RAW-METAL' }
    },
    {
      label: '编码前缀',
      key: 'codePrefix',
      type: 'input',
      help: '默认跟随分类编码；手动修改后将保留自定义值。',
      props: { maxlength: 40, placeholder: '默认取分类编码' }
    },
    {
      label: '分类名称',
      key: 'categoryName',
      type: 'input',
      props: { maxlength: 100, placeholder: '如 金属原材料' }
    },
    { label: '打印名称', key: 'printName', type: 'input', props: { maxlength: 100 } },
    { label: '描述规则', key: 'descriptionRule', type: 'divider', span: 24 },
    {
      label: '描述连接符',
      key: 'compositionSeparator',
      type: 'input',
      props: { maxlength: 10, placeholder: ' / ' }
    },
    {
      label: '描述组成字段',
      key: 'compositionColumns',
      type: 'select',
      span: 24,
      options: getDictMap.value.mdmMaterialCoreAttribute ?? [],
      help: '物料档案将按所选字段顺序与连接符实时生成“物料描述”。',
      props: { multiple: true, clearable: true, filterable: true }
    },
    { label: '采购与收货策略', key: 'purchasePolicy', type: 'divider', span: 24 },
    {
      label: '超采购比例（%）',
      key: 'overPurchasePercent',
      type: 'number',
      props: { min: 0, max: 100, precision: 2, class: '!w-full' }
    },
    {
      label: '超采购数量',
      key: 'overPurchaseQuantity',
      type: 'number',
      props: { min: 0, precision: 4, class: '!w-full' }
    },
    {
      label: '最大收货数量',
      key: 'maxReceiptQuantity',
      type: 'number',
      props: { min: 0, precision: 4, class: '!w-full' }
    },
    { label: '默认采购员', key: 'purchaserId', type: 'slot' },
    { label: '采购组织', key: 'purchaseOrganization', type: 'input', props: { maxlength: 100 } },
    {
      label: '默认场所',
      key: 'defaultSiteId',
      type: 'select',
      options: siteOptions.value,
      props: { clearable: true, filterable: true }
    },
    {
      label: '超收比例（%）',
      key: 'overReceiptPercent',
      type: 'number',
      props: { min: 0, max: 100, precision: 2, class: '!w-full' }
    },
    {
      label: '超收数量',
      key: 'overReceiptQuantity',
      type: 'number',
      props: { min: 0, precision: 4, class: '!w-full' }
    },
    {
      label: '计价方法',
      key: 'valuationMethod',
      type: 'select',
      options: getDictMap.value.mdmMaterialValuationMethod ?? []
    },
    { label: '自动收货', key: 'autoReceive', type: 'switch' },
    { label: '需要检验', key: 'requiresInspection', type: 'switch' },
    { label: '生成送货通知', key: 'createDeliveryNotice', type: 'switch' },
    { label: '批次管理', key: 'batchManaged', type: 'switch' },
    { label: '治理信息', key: 'governance', type: 'divider', span: 24 },
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
      label: '分类说明',
      key: 'description',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 3, maxlength: 500, showWordLimit: true, resize: 'none' }
    }
  ])
  void Promise.all(
    ['mdmMaterialValuationMethod', 'commonEnabledStatus', 'mdmMaterialCoreAttribute'].map((code) =>
      userStore.ensureDictLoaded(code)
    )
  )
  const formRules: FormRules<Record<string, unknown>> = {
    tenantId: [{ required: true, message: '请选择目标租户', trigger: 'change' }],
    categoryCode: [{ required: true, message: '请输入分类编码', trigger: 'blur' }],
    categoryName: [{ required: true, message: '请输入分类名称', trigger: 'blur' }]
  }
  const syncTenantOptions = (): void => {
    typeOptions.value = sourceMaterialTypes.value
      .filter((item) => item.tenantId === formModel.tenantId)
      .map((item) => ({ label: `${item.typeName} · ${item.typeCode}`, value: item.id }))
    siteOptions.value = sourceSites.value
      .filter((item) => item.tenantId === formModel.tenantId)
      .map((item) => ({ label: item.name, value: item.id }))
  }
  const handleSubmit = async (): Promise<boolean> => {
    try {
      await formRef.value?.validate()
      await saveMaterialCategory(
        buildMaterialCategoryWriteInput(formModel),
        formModel.id || undefined
      )
      emit('success')
      return true
    } catch {
      return false
    }
  }
  const handleOpen = async (data: CategoryDialogOpenData): Promise<void> => {
    Object.assign(formModel, initialForm())
    tenantOptions.value = data.tenantOptions
    sourceCategories.value = data.categories
    sourceMaterialTypes.value = data.materialTypes
    sourceSites.value = data.sites
    if (data.row) Object.assign(formModel, cloneDeep(data.row))
    formModel.tenantId = data.row?.tenantId || data.tenantId
    if (!data.row && data.parentId) formModel.parentId = data.parentId
    if (data.copy) {
      const originalCode = formModel.categoryCode
      formModel.id = ''
      formModel.categoryCode = `${formModel.categoryCode}-COPY`
      if (formModel.codePrefix === originalCode) formModel.codePrefix = formModel.categoryCode
      formModel.categoryName = `${formModel.categoryName}（副本）`
    }
    syncTenantOptions()
    await dialogRef.value?.handleOpen(data, {
      title: `${data.copy ? '复制' : data.row ? '编辑' : '新增'}物料分类`,
      subtitle: '统一维护分类语义、采购收货容差与批次计价默认策略',
      confirmText: '保存分类',
      contentMaxHeight: '72vh',
      onConfirm: handleSubmit,
      onOpen: () => formRef.value?.clearValidate()
    })
  }
  watch(
    () => formModel.categoryCode,
    (value, previous) => {
      if (!formModel.codePrefix || formModel.codePrefix === previous) {
        formModel.codePrefix = value
      }
    }
  )
  watch(
    () => formModel.tenantId,
    (value, previous) => {
      if (value === previous) return
      syncTenantOptions()
      if (!previous) return
      if (
        !sourceCategories.value.some(
          (item) => item.tenantId === value && item.id === formModel.parentId
        )
      ) {
        formModel.parentId = null
      }
      if (!typeOptions.value.some((item) => item.value === formModel.materialTypeId)) {
        formModel.materialTypeId = null
      }
      if (!siteOptions.value.some((item) => item.value === formModel.defaultSiteId)) {
        formModel.defaultSiteId = null
      }
      formModel.purchaserId = null
    }
  )
  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .material-category-dialog__notice {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    padding: 12px 14px;
    margin-bottom: 18px;
    background: color-mix(in srgb, var(--theme-color) 7%, var(--el-bg-color));
    border-left: 3px solid var(--theme-color);
    border-radius: var(--el-border-radius-base);
  }

  .material-category-dialog__notice > span {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    color: var(--theme-color);
    background: var(--el-bg-color);
    border-radius: 10px;
  }

  .material-category-dialog__notice p {
    margin: 3px 0 0;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
</style>

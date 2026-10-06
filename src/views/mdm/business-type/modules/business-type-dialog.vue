<template>
  <ArtDialog ref="dialogRef" size="xl">
    <div class="business-type-dialog">
      <ArtEntitySummary
        :icon="modeIcon"
        eyebrow="BUSINESS TYPE"
        :title="summaryTitle"
        :description="summaryDescription"
      >
        <template #aside>
          <ElTag
            :type="form.data.tagStyle || 'primary'"
            effect="light"
            round
            :style="tagPreviewStyle"
          >
            {{ form.data.businessTypeName || '类型预览' }}
          </ElTag>
        </template>
      </ArtEntitySummary>

      <ArtForm
        ref="formRef"
        v-model="form.data"
        :items="form.items"
        :rules="form.rules"
        :span="12"
        :gutter="20"
        label-position="top"
        label-width="auto"
        :show-reset="false"
        :show-submit="false"
        :validate-on-rule-change="false"
        scroll-to-error
      >
        <template #textColor>
          <div class="business-type-dialog__color-field">
            <ElColorPicker
              v-model="form.data.textColor"
              :predefine="presetColors"
              aria-label="选择业务类型文字颜色"
            />
            <span>{{ form.data.textColor || '跟随标签默认颜色' }}</span>
          </div>
        </template>
      </ArtForm>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import type { CSSProperties, ComputedRef, UnwrapNestedRefs } from 'vue'
  import { ElMessage, type FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, {
    type FormItem,
    type FormItemApiParams,
    type FormItemOption
  } from '@/components/core/forms/art-form/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import { useTenantScopeFormPolicy } from '@/hooks/core/useTenantScopeFormPolicy'
  import { useUserStore } from '@/store/modules/user'
  import TreeUtils from '@/utils/tree'
  import type {
    BusinessTypeDocumentReference,
    BusinessTypeMenuNode,
    BusinessTypeRecord
  } from '@/api/mdm'
  import {
    copyBusinessType,
    createBusinessType,
    fetchBusinessTypeDocumentOptions,
    fetchBusinessTypeOptions,
    fetchNextBusinessTypeSort,
    updateBusinessType
  } from '@/api/mdm'
  import {
    buildBusinessTypeInput,
    buildBusinessTypeUpdateInput,
    createBusinessTypeCopyModel,
    createBusinessTypeFormModel,
    type BusinessTypeFormModel
  } from './business-type-model'

  type DialogMode = 'add' | 'copy' | 'edit'

  interface SelectableMenuNode extends BusinessTypeMenuNode {
    disabled?: boolean
    children?: SelectableMenuNode[]
  }

  export interface BusinessTypeDialogOpenData {
    mode: DialogMode
    record?: BusinessTypeRecord
    selectedMenuIds?: string[]
    menuTree: BusinessTypeMenuNode[]
    tenantOptions: Array<{ label: string; value: string }>
    effectiveTenantId?: string | null
  }

  interface FormExpose {
    validate: () => Promise<boolean | void>
    clearValidate: () => void
    reloadOptions: (key: string) => Promise<void>
  }

  interface FormGroup {
    data: BusinessTypeFormModel
    mode: DialogMode
    menuTree: SelectableMenuNode[]
    selectedMenuIds?: string[]
    tenantOptions: Array<{ label: string; value: string }>
    documentTypes: BusinessTypeDocumentReference[]
    items: ComputedRef<FormItem[]>
    rules: ComputedRef<FormRules<BusinessTypeFormModel>>
  }

  const emit = defineEmits<{ success: [mode: 'add' | 'edit'] }>()
  const dialogRef = ref<ArtDialogExpose<BusinessTypeDialogOpenData>>()
  const formRef = ref<FormExpose>()
  const treeUtils = new TreeUtils({ idKey: 'id', parentKey: 'parentId', childrenKey: 'children' })
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const { shouldExposeTenantField } = useTenantScopeFormPolicy()
  const presetColors = ['#409EFF', '#67C23A', '#E6A23C', '#F56C6C', '#909399']

  const booleanOptions = computed(() =>
    (getDictMap.value.commonBoolean ?? []).map((item) => ({
      label: item.label,
      value: String(item.value) === 'true' || String(item.value) === '1'
    }))
  )

  const form: UnwrapNestedRefs<FormGroup> = reactive<FormGroup>({
    data: createBusinessTypeFormModel(),
    mode: 'add',
    menuTree: [],
    selectedMenuIds: undefined,
    tenantOptions: [],
    documentTypes: [],
    items: computed<FormItem[]>(() => {
      const tenantItems: FormItem[] = shouldExposeTenantField.value
        ? [
            { label: '数据归属', key: 'tenantSection', type: 'divider', span: 24 },
            {
              label: '所属租户',
              key: 'tenantId',
              type: 'select',
              span: 24,
              options: form.tenantOptions,
              props: {
                filterable: true,
                disabled: form.mode !== 'add',
                placeholder: '请选择本条业务类型所属租户',
                onChange: handleTenantChange
              },
              description:
                form.mode === 'add'
                  ? '在全部租户工作区新增时，必须明确数据归属。'
                  : '编辑或复制时沿用原记录租户，避免跨租户复制主数据。'
            }
          ]
        : []

      return [
        ...tenantItems,
        { label: '归属与类型标识', key: 'identitySection', type: 'divider', span: 24 },
        {
          label: '所属单据类型',
          key: 'documentTypeId',
          type: 'select',
          span: 12,
          api: (params) => fetchBusinessTypeDocumentOptions(normalizeOptionQuery(params)),
          immediate: false,
          beforeFetch: () => ({
            tenantId: form.data.tenantId,
            menuIds: form.selectedMenuIds,
            enabled: form.mode === 'edit' ? undefined : true
          }),
          resultField: 'data',
          labelField: 'documentTypeName',
          valueField: 'id',
          labelFn: (option: FormItemOption) =>
            `${option.documentTypeName ?? ''} · ${option.documentTypeCode ?? ''}`,
          afterFetch: (result: unknown) => {
            const response = result as { data?: BusinessTypeDocumentReference[] }
            form.documentTypes = response.data ?? []
            return result
          },
          props: {
            clearable: true,
            filterable: true,
            disabled: !form.data.tenantId,
            placeholder: '请选择单据类型',
            onChange: handleDocumentTypeChange
          },
          description: '仅显示当前功能范围和租户内可用的单据类型。'
        },
        {
          label: '所属菜单功能',
          key: 'menuId',
          type: 'treeSelect',
          span: 12,
          options: form.menuTree,
          props: {
            disabled: true,
            checkStrictly: true,
            placeholder: '选择单据类型后自动带入',
            props: {
              label: (node: SelectableMenuNode) =>
                String(node.meta?.title || node.name || '未命名菜单'),
              value: 'id'
            }
          },
          description: '由所属单据类型自动带入，确保业务口径一致。'
        },
        {
          label: '业务类型编号',
          key: 'businessTypeCode',
          type: 'input',
          span: 12,
          props: {
            maxlength: 64,
            clearable: true,
            placeholder: '例如：OUTSOURCE_RECEIPT_RETURN'
          },
          description: '租户内唯一，保存时自动转换为大写。'
        },
        {
          label: '业务类型名称',
          key: 'businessTypeName',
          type: 'input',
          span: 12,
          props: { maxlength: 100, clearable: true, placeholder: '请输入业务可识别的类型名称' }
        },
        { label: '业务规则', key: 'ruleSection', type: 'divider', span: 24 },
        {
          label: '默认业务类型',
          key: 'isDefault',
          type: 'segment',
          span: 8,
          options: booleanOptions.value,
          props: { onChange: handleDefaultChange },
          description: '同一单据类型只能设置一个默认项。'
        },
        {
          label: '源业务类型',
          key: 'sourceBusinessTypeId',
          type: 'select',
          span: 16,
          api: (params) => fetchBusinessTypeOptions(normalizeOptionQuery(params)),
          immediate: false,
          beforeFetch: () => ({
            tenantId: form.data.tenantId,
            excludeId: form.data.id,
            enabled: true
          }),
          resultField: 'data',
          labelField: 'businessTypeName',
          valueField: 'id',
          labelFn: (option: FormItemOption) =>
            `${option.businessTypeName ?? ''} · ${option.businessTypeCode ?? ''}`,
          props: {
            clearable: true,
            filterable: true,
            disabled: !form.data.tenantId,
            placeholder: '可选，默认为空'
          },
          description: '用于退货、冲销等需要追溯原业务口径的场景。'
        },
        {
          label: '库存方向',
          key: 'inventoryDirection',
          type: 'select',
          span: 8,
          options: getDictMap.value.mdmBusinessInventoryDirection ?? [],
          props: { clearable: true, placeholder: '默认为空' }
        },
        {
          label: '货主类型',
          key: 'ownerType',
          type: 'select',
          span: 8,
          options: getDictMap.value.mdmBusinessOwnerType ?? [],
          props: { clearable: true, placeholder: '请选择货主类型' }
        },
        {
          label: '存货核算标志',
          key: 'inventoryAccounting',
          type: 'segment',
          span: 8,
          options: booleanOptions.value,
          description: '默认为否，启用后纳入存货核算。'
        },
        { label: '显示、排序与状态', key: 'presentationSection', type: 'divider', span: 24 },
        {
          label: '排序',
          key: 'sortOrder',
          type: 'number',
          span: 8,
          props: {
            min: 0,
            max: 999999,
            step: 10,
            controlsPosition: 'right',
            style: { width: '100%' }
          },
          description: '默认从 10 开始，按单据类型每次增加 10。'
        },
        {
          label: '状态',
          key: 'enabled',
          type: 'switch',
          span: 8,
          props: {
            inlinePrompt: true,
            activeText: '启用',
            inactiveText: '禁用',
            onChange: handleEnabledChange
          },
          description: '禁用后不再提供给新业务单据选择。'
        },
        {
          label: '标签样式',
          key: 'tagStyle',
          type: 'tagStyleSelect',
          span: 8,
          props: { clearable: true, placeholder: '请选择标签样式' }
        },
        { label: '文字颜色', key: 'textColor', type: 'input', span: 12 },
        { label: '补充说明', key: 'remarkSection', type: 'divider', span: 24 },
        {
          label: '备注',
          key: 'remark',
          type: 'input',
          span: 24,
          props: {
            type: 'textarea',
            rows: 3,
            maxlength: 500,
            showWordLimit: true,
            placeholder: '说明该业务类型的适用范围或维护约定'
          }
        }
      ]
    }),
    rules: computed<FormRules<BusinessTypeFormModel>>(() => ({
      tenantId: [
        { required: shouldExposeTenantField.value, message: '请选择所属租户', trigger: 'change' }
      ],
      documentTypeId: [{ required: true, message: '请选择所属单据类型', trigger: 'change' }],
      menuId: [{ required: true, message: '请先选择所属单据类型', trigger: 'change' }],
      businessTypeCode: [
        { required: true, message: '请输入业务类型编号', trigger: 'blur' },
        {
          pattern: /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/,
          message: '编号仅支持字母、数字、下划线和短横线，并需以字母或数字开头',
          trigger: 'blur'
        }
      ],
      businessTypeName: [{ required: true, message: '请输入业务类型名称', trigger: 'blur' }],
      sortOrder: [{ required: true, message: '请输入排序值', trigger: 'blur' }],
      textColor: [
        {
          pattern: /^$|^#[0-9A-Fa-f]{6}$/,
          message: '文字颜色必须是 6 位十六进制颜色值',
          trigger: 'change'
        }
      ]
    }))
  })

  const summaryTitle = computed(() => form.data.businessTypeName || '新业务类型')
  const selectedDocumentType = computed(() =>
    form.documentTypes.find((item) => item.id === form.data.documentTypeId)
  )
  const summaryDescription = computed(() => {
    const code = form.data.businessTypeCode || '编号待填写'
    return selectedDocumentType.value
      ? `${code} · ${selectedDocumentType.value.documentTypeName}`
      : code
  })
  const modeIcon = computed(() =>
    form.mode === 'copy'
      ? 'ri:file-copy-line'
      : form.mode === 'edit'
        ? 'ri:edit-line'
        : 'ri:add-line'
  )
  const tagPreviewStyle = computed<CSSProperties>(() => ({
    color: form.data.textColor || undefined
  }))

  const buildMenuTree = (menuTree: BusinessTypeMenuNode[]): SelectableMenuNode[] =>
    treeUtils.mapTree(menuTree, (menu) => ({ ...menu })) as SelectableMenuNode[]

  const normalizeOptionQuery = (params: FormItemApiParams) => {
    const source = params ?? {}
    return {
      tenantId: typeof source.tenantId === 'string' ? source.tenantId : undefined,
      menuIds: Array.isArray(source.menuIds)
        ? source.menuIds.filter((item): item is string => typeof item === 'string')
        : undefined,
      excludeId: typeof source.excludeId === 'string' ? source.excludeId : undefined,
      enabled: typeof source.enabled === 'boolean' ? source.enabled : undefined
    }
  }

  const refreshSuggestedSort = async (): Promise<void> => {
    if (form.mode === 'edit' || !form.data.documentTypeId || !form.data.tenantId) return
    form.data.sortOrder = await fetchNextBusinessTypeSort(
      form.data.documentTypeId,
      form.data.tenantId
    )
  }

  const reloadReferenceOptions = async (): Promise<void> => {
    if (!form.data.tenantId) return
    await Promise.all([
      formRef.value?.reloadOptions('documentTypeId'),
      formRef.value?.reloadOptions('sourceBusinessTypeId')
    ])
  }

  const handleTenantChange = (): void => {
    Object.assign(form.data, {
      documentTypeId: '',
      menuId: '',
      sourceBusinessTypeId: null,
      sortOrder: 10
    })
    form.documentTypes = []
    void reloadReferenceOptions()
  }

  const handleDocumentTypeChange = (documentTypeId?: string): void => {
    const selected = form.documentTypes.find((item) => item.id === documentTypeId)
    Object.assign(form.data, {
      documentTypeId: documentTypeId ?? '',
      menuId: selected?.menuId ?? '',
      sourceBusinessTypeId: null
    })
    void refreshSuggestedSort()
  }

  const handleDefaultChange = (isDefault: boolean): void => {
    if (isDefault) form.data.enabled = true
  }

  const handleEnabledChange = (enabled: boolean): void => {
    if (enabled || !form.data.isDefault) return
    form.data.enabled = true
    ElMessage.warning('默认业务类型必须保持启用，请先取消默认或设置其他默认项')
  }

  const initializeForm = (data: BusinessTypeDialogOpenData): void => {
    form.mode = data.mode
    form.menuTree = buildMenuTree(data.menuTree)
    form.selectedMenuIds = data.selectedMenuIds
    form.tenantOptions = data.tenantOptions
    form.documentTypes = data.record?.documentType ? [data.record.documentType] : []

    if (data.mode === 'edit' && data.record) {
      form.data = createBusinessTypeFormModel({
        ...data.record,
        menuId: data.record.documentType?.menuId ?? ''
      })
      return
    }
    if (data.mode === 'copy' && data.record) {
      form.data = createBusinessTypeCopyModel(data.record)
      return
    }
    form.data = createBusinessTypeFormModel({ tenantId: data.effectiveTenantId ?? undefined })
  }

  const handleSubmit = async (): Promise<boolean> => {
    try {
      await formRef.value?.validate()
    } catch {
      return false
    }
    try {
      if (form.mode === 'edit' && form.data.id) {
        await updateBusinessType(form.data.id, buildBusinessTypeUpdateInput(form.data))
        emit('success', 'edit')
      } else if (form.mode === 'copy' && form.data.sourceId) {
        await copyBusinessType(form.data.sourceId, buildBusinessTypeUpdateInput(form.data))
        emit('success', 'add')
      } else {
        await createBusinessType(buildBusinessTypeInput(form.data, shouldExposeTenantField.value))
        emit('success', 'add')
      }
      return true
    } catch {
      return false
    }
  }

  const handleOpen = async (data: BusinessTypeDialogOpenData): Promise<void> => {
    initializeForm(data)
    const titleMap: Record<DialogMode, string> = {
      add: '新增业务类型',
      copy: '复制业务类型',
      edit: '编辑业务类型'
    }
    const confirmMap: Record<DialogMode, string> = {
      add: '创建业务类型',
      copy: '创建副本',
      edit: '保存更改'
    }

    await dialogRef.value?.handleOpen(data, {
      title: titleMap[data.mode],
      subtitle:
        data.mode === 'copy'
          ? '已继承原记录的业务与显示配置，请重新填写唯一编号。'
          : '维护单据归属、业务口径、库存规则与展示方式。',
      confirmText: confirmMap[data.mode],
      contentMaxHeight: '76vh',
      loading: true,
      onOpen: async (_openData, api) => {
        try {
          await Promise.all([
            userStore.ensureDictLoaded('commonBoolean'),
            userStore.ensureDictLoaded('mdmBusinessInventoryDirection'),
            userStore.ensureDictLoaded('mdmBusinessOwnerType')
          ])
          await reloadReferenceOptions()
          const documentType = form.documentTypes.find(
            (item) => item.id === form.data.documentTypeId
          )
          if (documentType) form.data.menuId = documentType.menuId
          await refreshSuggestedSort()
          await nextTick()
          formRef.value?.clearValidate()
        } finally {
          api.setLoading(false)
        }
      },
      onConfirm: handleSubmit
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .business-type-dialog {
    display: grid;
    gap: var(--art-space-4);

    :deep(.art-form) {
      padding: 0 !important;
    }

    &__color-field {
      display: flex;
      gap: var(--art-space-3);
      align-items: center;
      min-height: 32px;

      span {
        overflow: hidden;
        text-overflow: ellipsis;
        font-family: var(--art-font-family-mono, Consolas, monospace);
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }
    }
  }
</style>

<template>
  <ArtDialog ref="dialogRef" size="lg">
    <div class="grid gap-4">
      <ArtEntitySummary
        icon="ri:price-tag-3-line"
        eyebrow="COMPONENT TYPE"
        :title="model.componentTypeName || '新增组件类型'"
        :description="model.componentTypeCode || '定义可供 BOM 组件引用的稳定类型'"
        compact
      >
        <template #aside>
          <ElTag
            :type="model.tagStyle || 'primary'"
            :style="{ color: model.textColor || undefined }"
          >
            {{ model.componentTypeName || '标签预览' }}
          </ElTag>
        </template>
      </ArtEntitySummary>
      <ArtForm
        ref="formRef"
        v-model="model"
        :items="items"
        :rules="rules"
        :span="12"
        :gutter="20"
        label-position="top"
        :show-submit="false"
        :show-reset="false"
      >
        <template #textColor>
          <div class="flex items-center gap-3">
            <ElColorPicker v-model="model.textColor" aria-label="组件类型文字颜色" />
            <span class="text-sm text-gray-500">{{ model.textColor || '跟随标签样式' }}</span>
          </div>
        </template>
      </ArtForm>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { cloneDeep } from 'lodash-es'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import { normalizeNonNullableText } from '@/utils/form/normalize'
  import {
    saveComponentType,
    type ComponentIndustryGroup,
    type ComponentTypeInput,
    type ComponentTypeRecord
  } from '@/api/mdm'

  export interface ComponentTypeDialogOpenData {
    row?: ComponentTypeRecord
    tenantId: string
    tenantOptions: Array<{ label: string; value: string }>
    groups: ComponentIndustryGroup[]
    groupId?: string
  }

  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<ComponentTypeDialogOpenData>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const createModel = (): ComponentTypeInput => ({
    id: undefined,
    tenantId: '',
    groupId: '',
    componentTypeCode: '',
    componentTypeName: '',
    sortOrder: 10,
    enabled: true,
    textColor: '',
    tagStyle: 'primary',
    remark: ''
  })
  const model = reactive(createModel())
  const context = reactive({
    tenantOptions: [] as ComponentTypeDialogOpenData['tenantOptions'],
    groups: [] as ComponentIndustryGroup[]
  })
  const items = computed<FormItem[]>(() => [
    { key: 'identity', label: '类型标识', type: 'divider', span: 24 },
    {
      key: 'tenantId',
      label: '所属租户',
      type: 'select',
      span: 24,
      hidden: context.tenantOptions.length <= 1 && Boolean(model.tenantId),
      options: context.tenantOptions,
      props: { disabled: Boolean(model.id), filterable: true }
    },
    {
      key: 'componentTypeCode',
      label: '组件类型编码',
      type: 'input',
      props: { maxlength: 40, placeholder: '如 OUTER_PANEL' }
    },
    {
      key: 'componentTypeName',
      label: '组件类型',
      type: 'input',
      props: { maxlength: 80, placeholder: '如 外板' }
    },
    {
      key: 'groupId',
      label: '行业分组',
      type: 'treeSelect',
      span: 24,
      options: context.groups
        .filter((group) => group.tenantId === model.tenantId && group.enabled)
        .map((group) => ({
          label: `${group.name}（${group.code}）`,
          value: group.id,
          parentId: group.parentId
        })),
      props: { checkStrictly: true, filterable: true, placeholder: '请选择行业分组' }
    },
    { key: 'display', label: '展示与状态', type: 'divider', span: 24 },
    {
      key: 'sortOrder',
      label: '排序',
      type: 'number',
      props: { min: 0, max: 999999, precision: 0, class: 'w-full!' }
    },
    {
      key: 'enabled',
      label: '状态',
      type: 'switch',
      props: { activeText: '启用', inactiveText: '禁用' }
    },
    { key: 'tagStyle', label: '标签样式', type: 'tagStyleSelect' },
    { key: 'textColor', label: '文字颜色', type: 'slot' },
    {
      key: 'remark',
      label: '备注',
      type: 'textarea',
      span: 24,
      props: { rows: 3, maxlength: 500, showWordLimit: true }
    }
  ])
  const rules = {
    tenantId: [{ required: true, message: '请选择所属租户', trigger: 'change' }],
    groupId: [{ required: true, message: '请选择行业分组', trigger: 'change' }],
    componentTypeCode: [
      { required: true, message: '请输入组件类型编码', trigger: 'blur' },
      { pattern: /^[A-Za-z][A-Za-z0-9_-]{0,39}$/, message: '编码格式不正确', trigger: 'blur' }
    ],
    componentTypeName: [{ required: true, message: '请输入组件类型', trigger: 'blur' }],
    textColor: [
      { pattern: /^$|^#[0-9A-Fa-f]{6}$/, message: '请输入 6 位颜色值', trigger: 'change' }
    ]
  }

  const submit = async (): Promise<boolean> => {
    try {
      await formRef.value?.validate()
      await saveComponentType({
        ...model,
        componentTypeCode: model.componentTypeCode.trim().toUpperCase(),
        componentTypeName: normalizeNonNullableText(model.componentTypeName),
        remark: normalizeNonNullableText(model.remark),
        textColor: model.textColor.toUpperCase()
      })
      emit('success')
      return true
    } catch {
      return false
    }
  }
  const handleOpen = async (data: ComponentTypeDialogOpenData): Promise<void> => {
    Object.assign(
      model,
      createModel(),
      data.row
        ? cloneDeep(data.row)
        : {
            tenantId: data.tenantId,
            groupId: data.groupId || ''
          }
    )
    context.tenantOptions = data.tenantOptions
    context.groups = data.groups
    await dialogRef.value?.handleOpen(data, {
      title: data.row ? '编辑组件类型' : '新增组件类型',
      confirmText: data.row ? '保存更改' : '创建组件类型',
      contentMaxHeight: '72vh',
      onOpen: () => formRef.value?.clearValidate(),
      onConfirm: submit
    })
  }
  watch(
    () => model.tenantId,
    (tenantId) => {
      if (
        !context.groups.some((group) => group.id === model.groupId && group.tenantId === tenantId)
      )
        model.groupId = ''
    }
  )
  defineExpose({ handleOpen })
</script>

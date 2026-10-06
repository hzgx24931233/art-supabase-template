<template>
  <ArtDialog ref="dialogRef" size="md">
    <div class="bom-group-dialog">
      <ArtEntitySummary
        icon="ri:folder-settings-line"
        eyebrow="BOM GROUP"
        :title="form.model.name || dialogTitle"
        :description="summaryDescription"
        compact
      >
        <template #aside>
          <ArtDictDisplay
            dict-code="commonBoolean"
            :value="String(form.model.enabled)"
            display="tag"
          />
        </template>
      </ArtEntitySummary>

      <ArtForm
        ref="formRef"
        v-model="form.model"
        :items="formItems"
        :rules="formRules"
        :span="12"
        :gutter="20"
        label-position="top"
        :show-reset="false"
        :show-submit="false"
      />
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { cloneDeep } from 'lodash-es'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import { saveBomGroup, type BomGroup, type BomGroupInput } from '@/api/mdm'

  export interface BomGroupDialogOpenData {
    tenantId: string
    tenantOptions: Array<{ label: string; value: string }>
    groups: BomGroup[]
    row?: BomGroup
    parent?: BomGroup
  }

  const emit = defineEmits<{ success: [id: string, mode: 'add' | 'edit'] }>()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const dialogRef = ref<ArtDialogExpose<BomGroupDialogOpenData>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const initialModel = (): BomGroupInput => ({
    id: undefined,
    tenantId: '',
    parentId: null,
    code: '',
    name: '',
    sort: 10,
    enabled: true,
    remark: ''
  })
  const form = reactive({
    model: initialModel(),
    groups: [] as BomGroup[],
    tenantOptions: [] as Array<{ label: string; value: string }>
  })
  const dialogTitle = computed(() =>
    form.model.id ? '编辑 BOM 分组' : form.model.parentId ? '新增下级分组' : '新增 BOM 分组'
  )
  const summaryDescription = computed(() => {
    const parent = form.groups.find((group) => group.id === form.model.parentId)
    if (parent) return `上级分组：${parent.name} · ${parent.code}`
    return form.model.code ? `分组编码：${form.model.code}` : '一次维护编码、名称与层级关系。'
  })
  const booleanOptions = computed(() =>
    (getDictMap.value.commonBoolean ?? []).map((item) => ({
      label: item.label || item.value,
      value: item.value === 'true' || item.value === '1'
    }))
  )
  const formItems = computed<FormItem[]>(() => [
    { key: 'hierarchy', label: '分组层级', type: 'divider', span: 24 },
    {
      key: 'tenantId',
      label: '所属租户',
      type: 'select',
      span: 24,
      options: form.tenantOptions,
      hidden: form.tenantOptions.length <= 1 && Boolean(form.model.tenantId),
      props: {
        disabled: Boolean(form.model.id || form.model.parentId),
        filterable: true,
        placeholder: '请选择 BOM 分组归属租户'
      }
    },
    {
      key: 'parentId',
      label: '上级分组',
      type: 'treeSelect',
      span: 24,
      options: form.groups
        .filter((group) => group.id !== form.model.id && group.tenantId === form.model.tenantId)
        .map((group) => ({
          label: `${group.name}（${group.code}）`,
          value: group.id,
          parentId: group.parentId
        })),
      props: { clearable: true, checkStrictly: true, placeholder: '不选择则为顶级分组' }
    },
    { key: 'identity', label: '分组信息', type: 'divider', span: 24 },
    {
      key: 'code',
      label: '分组编码',
      type: 'input',
      props: { maxlength: 40, placeholder: '如 PRODUCT_BOM' },
      help: '以字母开头，仅支持字母、数字、下划线和短横线。'
    },
    {
      key: 'name',
      label: '分组名称',
      type: 'input',
      props: { maxlength: 80, placeholder: '如 标准产品 BOM' }
    },
    {
      key: 'sort',
      label: '显示顺序',
      type: 'number',
      props: { min: 0, max: 999999, precision: 0, class: '!w-full' }
    },
    {
      key: 'enabled',
      label: '启用状态',
      type: 'segment',
      options: booleanOptions.value
    },
    {
      key: 'remark',
      label: '备注',
      type: 'textarea',
      span: 24,
      props: { rows: 3, maxlength: 500, showWordLimit: true, resize: 'none' }
    }
  ])
  const formRules = {
    tenantId: [{ required: true, message: '请选择所属租户', trigger: 'change' }],
    code: [
      { required: true, message: '请输入分组编码', trigger: 'blur' },
      {
        pattern: /^[A-Za-z][A-Za-z0-9_-]{0,39}$/,
        message: '编码须以字母开头，且只能包含字母、数字、下划线和短横线',
        trigger: 'blur'
      }
    ],
    name: [{ required: true, message: '请输入分组名称', trigger: 'blur' }]
  }

  void userStore.ensureDictLoaded('commonBoolean')

  const submit = async (): Promise<boolean> => {
    try {
      await formRef.value?.validate()
      const mode = form.model.id ? 'edit' : 'add'
      const id = await saveBomGroup({
        ...form.model,
        parentId: form.model.parentId || null,
        code: form.model.code.trim().toUpperCase(),
        name: form.model.name.trim(),
        sort: Number(form.model.sort),
        remark: normalizeNullableText(form.model.remark)
      })
      emit('success', id || form.model.id || '', mode)
      return true
    } catch {
      return false
    }
  }

  const handleOpen = async (data: BomGroupDialogOpenData): Promise<void> => {
    form.groups = cloneDeep(data.groups)
    form.tenantOptions = data.tenantOptions
    form.model = data.row
      ? {
          ...initialModel(),
          ...cloneDeep(data.row),
          remark: data.row.remark || ''
        }
      : {
          ...initialModel(),
          tenantId: data.parent?.tenantId || data.tenantId,
          parentId: data.parent?.id || null
        }
    await dialogRef.value?.handleOpen(data, {
      title: dialogTitle.value,
      subtitle: data.row
        ? `当前分组：${data.row.name} · ${data.row.code}`
        : summaryDescription.value,
      confirmText: data.row ? '保存更改' : '创建分组',
      contentMaxHeight: 'min(70vh, calc(100vh - 190px))',
      onOpen: () => formRef.value?.clearValidate(),
      onConfirm: submit
    })
  }

  watch(
    () => form.model.tenantId,
    (tenantId) => {
      if (!form.model.parentId) return
      const parent = form.groups.find((group) => group.id === form.model.parentId)
      if (parent?.tenantId !== tenantId) form.model.parentId = null
    }
  )

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .bom-group-dialog {
    display: grid;
    gap: var(--art-space-3);
  }
</style>

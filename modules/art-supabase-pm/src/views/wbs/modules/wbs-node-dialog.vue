<template>
  <ArtDialog ref="dialogRef" confirm-on-close>
    <ArtForm
      ref="formRef"
      v-model="form"
      :items="formItems"
      :rules="rules"
      :span="24"
      label-position="top"
      :show-reset="false"
      :show-submit="false"
    />
  </ArtDialog>
</template>

<script setup lang="ts">
  import { reactive, ref } from 'vue'
  import type { FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import type { WbsNode } from '@pm/types/wbs'

  export interface WbsNodeDialogOpenData {
    mode: 'create' | 'edit'
    node: WbsNode
  }

  const props = defineProps<{
    onSubmit: (node: WbsNode) => Promise<boolean>
  }>()

  interface WbsNodeDialogExpose {
    handleOpen: (data: WbsNodeDialogOpenData) => Promise<void>
  }

  const dialogRef = ref<ArtDialogExpose<WbsNode>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const form = reactive<WbsNode>({
    id: '',
    version_id: '',
    parent_id: null,
    wbs_code: '',
    custom_code: null,
    name: '',
    description: null,
    deliverable_summary: null,
    quantity: null,
    unit: null,
    planned_quantity: null,
    budget_cost: null,
    responsible_department: null,
    responsible_person: null,
    quality_standard: null,
    is_milestone: false,
    status: 'active',
    sort_order: 0,
    metadata: {}
  })

  const formItems: FormItem[] = [
    { label: '工作名称', key: 'name', type: 'input', props: { maxlength: 160 } },
    { label: '工作内容描述', key: 'description', type: 'textarea', props: { rows: 3 } },
    { label: '交付物摘要', key: 'deliverable_summary', type: 'textarea', props: { rows: 2 } },
    { label: '工程量', key: 'quantity', type: 'number', props: { min: 0 } },
    { label: '计量单位', key: 'unit', type: 'input', props: { maxlength: 30 } },
    { label: '计划工程量', key: 'planned_quantity', type: 'number', props: { min: 0 } },
    { label: '预算成本', key: 'budget_cost', type: 'number', props: { min: 0, precision: 2 } },
    { label: '责任部门', key: 'responsible_department', type: 'input', props: { maxlength: 80 } },
    { label: '责任人', key: 'responsible_person', type: 'input', props: { maxlength: 80 } },
    { label: '质量标准', key: 'quality_standard', type: 'textarea', props: { rows: 2 } },
    {
      label: '里程碑',
      key: 'is_milestone',
      type: 'switch',
      props: { activeText: '是', inactiveText: '否' }
    }
  ]

  const rules: FormRules<WbsNode> = {
    name: [{ required: true, message: '请输入工作名称', trigger: 'blur' }]
  }

  const handleOpen = async (data: WbsNodeDialogOpenData): Promise<void> => {
    Object.assign(form, data.node)
    formRef.value?.clearValidate()
    await dialogRef.value?.handleOpen(form, {
      title: data.mode === 'edit' ? '编辑 WBS 节点' : '新增 WBS 节点',
      subtitle:
        data.mode === 'edit'
          ? '更新工作包属性，保存后同步到当前草稿版本。'
          : '填写工作包信息，保存后加入当前草稿版本。',
      titleIcon: 'ri:node-tree',
      size: 'md',
      confirmText: data.mode === 'edit' ? '保存节点' : '新增节点',
      dialogProps: { appendToBody: true, closeOnClickModal: false },
      onConfirm: async (current) => {
        await formRef.value?.validate()
        return props.onSubmit({ ...current })
      }
    })
  }

  defineExpose<WbsNodeDialogExpose>({ handleOpen })
</script>

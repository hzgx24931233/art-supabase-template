<template>
  <ArtDialog ref="dialogRef" size="lg" confirm-on-close>
    <ArtForm
      ref="formRef"
      v-model="form.data"
      :items="form.items"
      :rules="form.rules"
      :span="12"
      :gutter="24"
      label-position="top"
      :show-reset="false"
      :show-submit="false"
    />
  </ArtDialog>
</template>

<script setup lang="ts">
  import { cloneDeep } from 'lodash-es'
  import type { FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm from '@/components/core/forms/art-form/index.vue'
  import type { FormItem } from '@/components/core/forms/art-form/index.vue'
  import {
    fetchSupplyChainDocumentReferences,
    resolveSupplyChainDocumentDefinition,
    saveSupplyChainDocument,
    type SupplyChainDocumentInput,
    type SupplyChainDocumentKind,
    type SupplyChainDocumentRecord,
    type SupplyChainDocumentReferences
  } from '@/api/mdm/supply-chain-document'
  import type { SupplyChainDocumentPageConfig } from './document-config'

  interface DocumentDialogOpenData {
    kind: SupplyChainDocumentKind
    config: SupplyChainDocumentPageConfig
    row?: SupplyChainDocumentRecord
    readonly?: boolean
  }

  interface DocumentFormModel {
    id?: string
    documentNo?: string | null
    status?: string | null
    documentDate: string | null
    deliveryDate: string | null
    documentTypeId: string | null
    projectId: string | null
    partyId: string | null
    currency: string | null
    subtotal: number | null
    taxAmount: number | null
    totalAmount: number | null
    remark: string | null
  }

  const emit = defineEmits<{ success: [] }>()

  const dialogRef = ref<ArtDialogExpose<DocumentDialogOpenData>>()
  const formRef = ref<{ validate: () => Promise<unknown>; clearValidate: () => void }>()
  const references = ref<SupplyChainDocumentReferences>({
    projects: [],
    suppliers: [],
    customers: [],
    documentTypes: []
  })
  const definition = ref(resolveSupplyChainDocumentDefinition('purchase-contract'))
  const pageConfig = ref<SupplyChainDocumentPageConfig | null>(null)
  const readonly = ref(false)

  const createInitialForm = (): DocumentFormModel => ({
    id: undefined,
    documentNo: null,
    status: null,
    documentDate: null,
    deliveryDate: null,
    documentTypeId: null,
    projectId: null,
    partyId: null,
    currency: 'CNY',
    subtotal: 0,
    taxAmount: 0,
    totalAmount: 0,
    remark: null
  })

  const form = reactive({
    data: createInitialForm(),
    items: computed<FormItem[]>(() => {
      const items: FormItem[] = [
        {
          key: 'documentNo',
          label: '单据编号',
          span: 12,
          props: { readonly: true, placeholder: '保存后由编号规则生成' },
          help: '由编号规则在首次保存时生成，不可手工修改。'
        },
        {
          key: 'status',
          label: '单据状态',
          span: 12,
          props: { readonly: true },
          help: '状态流转通过审批流程处理，本页只做登记。'
        },
        {
          key: 'documentDate',
          label: '单据日期',
          type: 'date',
          span: 8,
          placeholder: '请选择单据日期',
          props: { valueFormat: 'YYYY-MM-DD', clearable: false }
        },
        {
          key: 'deliveryDate',
          label: '交付日期',
          type: 'date',
          span: 8,
          props: { valueFormat: 'YYYY-MM-DD' }
        },
        {
          key: 'documentTypeId',
          label: '单据类型',
          type: 'select',
          span: 8,
          props: { clearable: true, filterable: true },
          options: references.value.documentTypes.map((item) => ({
            label: `${item.name} · ${item.code}`,
            value: item.id
          }))
        },
        {
          key: 'projectId',
          label: '关联项目',
          type: 'select',
          span: 12,
          props: { clearable: true, filterable: true },
          options: references.value.projects.map((item) => ({
            label: `${item.name} · ${item.code}`,
            value: item.id
          }))
        },
        {
          key: 'partyId',
          label: definition.value.party === 'supplier' ? '供应商' : '客户',
          type: 'select',
          span: 12,
          props: { clearable: true, filterable: true },
          options: (definition.value.party === 'supplier'
            ? references.value.suppliers
            : references.value.customers
          ).map((item) => ({ label: `${item.name} · ${item.code}`, value: item.id }))
        },
        {
          key: 'currency',
          label: '币种',
          span: 8,
          hidden: definition.value.table !== 'scm_sales_document',
          props: { maxlength: 10 }
        },
        {
          key: 'subtotal',
          label: '未税金额',
          type: 'number',
          span: 8,
          props: { controlsPosition: 'right', class: '!w-full', onChange: recalculateTotal }
        },
        {
          key: 'taxAmount',
          label: '税额',
          type: 'number',
          span: 8,
          props: { controlsPosition: 'right', class: '!w-full', onChange: recalculateTotal }
        },
        {
          key: 'totalAmount',
          label: '价税合计',
          type: 'number',
          span: 12,
          props: { controlsPosition: 'right', class: '!w-full' },
          help: '默认等于未税金额与税额之和，可手工调整。'
        },
        {
          key: 'remark',
          label: '备注',
          type: 'textarea',
          span: 24,
          props: { maxlength: 500, rows: 3, showWordLimit: true }
        }
      ]
      return items
    }),
    rules: computed<FormRules>(() => ({
      documentDate: [{ required: true, message: '请选择单据日期', trigger: 'change' }],
      partyId:
        definition.value.party === 'customer'
          ? [{ required: true, message: '请选择客户', trigger: 'change' }]
          : []
    }))
  })

  function recalculateTotal(): void {
    form.data.totalAmount = Number(form.data.subtotal ?? 0) + Number(form.data.taxAmount ?? 0)
  }

  function buildPayload(): SupplyChainDocumentInput {
    const partyKey = definition.value.party === 'supplier' ? 'supplierId' : 'customerId'
    const payload: SupplyChainDocumentInput = {
      documentDate: form.data.documentDate || null,
      deliveryDate: form.data.deliveryDate || null,
      projectId: form.data.projectId || null,
      documentTypeId: form.data.documentTypeId || null,
      subtotal: form.data.subtotal ?? 0,
      taxAmount: form.data.taxAmount ?? 0,
      totalAmount: form.data.totalAmount ?? 0,
      remark: form.data.remark || null,
      [partyKey]: form.data.partyId || null
    }
    if (definition.value.table === 'scm_sales_document') {
      payload.currency = form.data.currency || 'CNY'
    }
    return payload
  }

  const handleSubmit = async (): Promise<boolean> => {
    try {
      await formRef.value?.validate()
    } catch {
      return false
    }
    const result = await saveSupplyChainDocument(
      definition.value.kind,
      buildPayload(),
      form.data.id
    ).catch(() => null)
    if (!result) return false
    emit('success')
    return true
  }

  const handleOpen = async (data: DocumentDialogOpenData): Promise<void> => {
    definition.value = resolveSupplyChainDocumentDefinition(data.kind)
    pageConfig.value = data.config
    readonly.value = !!data.readonly
    Object.assign(form.data, createInitialForm())
    if (data.row) Object.assign(form.data, cloneDeep(data.row), { partyId: null })
    if (data.row) {
      form.data.partyId =
        String(
          (definition.value.party === 'supplier' ? data.row.supplierId : data.row.customerId) || ''
        ) || null
    }

    await dialogRef.value?.handleOpen(data, {
      title: data.readonly ? `${data.config.title}详情` : `新增${data.config.title}`,
      subtitle: data.row?.documentNo ? `当前单据：${data.row.documentNo}` : data.config.description,
      showFooter: !data.readonly,
      confirmText: '保存',
      contentMaxHeight: '72vh',
      loading: true,
      onOpen: async (_openData, api) => {
        try {
          references.value = await fetchSupplyChainDocumentReferences()
          if (!form.data.documentDate) {
            form.data.documentDate = new Date().toISOString().slice(0, 10)
          }
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

<template>
  <ArtDialog ref="dialogRef" size="md">
    <ElAlert
      title="生产组织用于人员、工作中心与工厂日历的业务范围。可关联系统部门，也可独立维护生产层级。"
      type="info"
      show-icon
      :closable="false"
    />
    <ArtForm
      ref="formRef"
      v-model="form.model"
      :items="items"
      :rules="form.rules"
      :span="12"
      :show-reset="false"
      :show-submit="false"
    />
  </ArtDialog>
</template>
<script setup lang="ts">
  import { ref, reactive, computed } from 'vue'
  import { cloneDeep, pick } from 'lodash-es'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import { fetchGetEnableOrganizationTree } from '@/api/system-manage'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import {
    saveProductionDepartment,
    type ProductionDepartment,
    type ProductionDepartmentInput
  } from '@/api/mdm'
  import { createDepartment, departmentOptions, productionTree } from './production-model'
  interface OpenData {
    row?: ProductionDepartment
    parentId?: string
    departments: ProductionDepartment[]
  }
  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<OpenData>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const user = useUserStore()
  const tenantScopeStore = useTenantScopeStore()
  const { effectiveTenantId, tenantOptions } = storeToRefs(tenantScopeStore)
  const form = reactive({
    model: createDepartment(),
    id: undefined as string | undefined,
    departments: [] as ProductionDepartment[],
    rules: {
      tenantId: [{ required: true, message: '请选择所属租户', trigger: 'change' }],
      name: [{ required: true, message: '请输入部门名称', trigger: 'blur' }],
      code: [{ required: true, message: '请输入部门编码', trigger: 'blur' }]
    }
  })
  const sourceOrganizations = ref<Api.SystemManage.OrganizationListItem[]>([])
  const parentOptions = computed(() => {
    const scopedDepartments = form.departments.filter(
      (department) => department.tenantId === form.model.tenantId
    )
    const tree = productionTree.listToTree(scopedDepartments)
    const excluded = form.id
      ? productionTree.getDescendants(tree, form.id, true).map((d) => d.id)
      : []
    return departmentOptions(scopedDepartments.filter((d) => !excluded.includes(d.id)))
  })
  const items = computed<FormItem[]>(() => [
    { key: 'source', label: '组织映射', type: 'divider', span: 24 },
    {
      key: 'tenantId',
      label: '所属租户',
      type: 'select',
      span: 24,
      options: tenantOptions.value.map((tenant) => ({
        label: `${tenant.tenantName}（${tenant.tenantCode}）`,
        value: tenant.id
      })),
      props: {
        disabled: !!form.id || !!form.model.parentId,
        filterable: true,
        placeholder: '请选择本次新增数据所属的租户',
        onChange: handleTenantChange
      },
      help: '“全部租户”下仍可新增；这里用于明确本条数据实际归属的业务租户。'
    },
    {
      key: 'organizationId',
      label: '系统部门',
      type: 'treeSelect',
      span: 24,
      api: fetchGetEnableOrganizationTree,
      immediate: false,
      beforeFetch: () => ({ tenantId: form.model.tenantId }),
      resultField: 'data',
      labelField: 'organizationName',
      valueField: 'id',
      afterFetch: (result) => {
        const response = result as { data?: Api.SystemManage.OrganizationListItem[] }
        sourceOrganizations.value = response.data ?? []
        return result
      },
      props: {
        disabled: !form.model.tenantId,
        checkStrictly: true,
        filterable: true,
        clearable: true,
        onChange: selectOrganization
      },
      help: '可选择系统部门带入名称和编码，也可以直接填写下方字段。'
    },
    { key: 'basic', label: '基本资料', type: 'divider', span: 24 },
    {
      key: 'name',
      label: '部门名称',
      type: 'input',
      props: { maxlength: 120, placeholder: '例如：总装一线' }
    },
    {
      key: 'code',
      label: '部门编码',
      type: 'input',
      props: { maxlength: 80, placeholder: '例如：ASSY-01' }
    },
    { key: 'hierarchy', label: '层级与归属', type: 'divider', span: 24 },
    {
      key: 'parentId',
      label: '上级部门',
      type: 'treeSelect',
      options: parentOptions.value,
      props: { checkStrictly: true, filterable: true, clearable: true }
    },
    {
      key: 'factory',
      label: '所属工厂',
      type: 'input',
      props: { placeholder: '输入工厂名称' }
    },
    {
      key: 'kind',
      label: '类型',
      type: 'select',
      options: user.getDictMap.mdmProductionDepartmentKind ?? [],
      props: { allowCreate: true, filterable: true }
    },
    { key: 'sort', label: '排序', type: 'number', props: { min: 0, precision: 0 } },
    { key: 'supplement', label: '补充说明', type: 'divider', span: 24 },
    {
      key: 'remark',
      label: '备注',
      type: 'textarea',
      span: 24,
      props: { rows: 3, maxlength: 1000, showWordLimit: true }
    }
  ])
  function handleTenantChange() {
    Object.assign(form.model, { organizationId: null, parentId: null })
    sourceOrganizations.value = []
    void formRef.value?.reloadOptions('organizationId')
  }
  function selectOrganization(id: string | undefined) {
    if (!id) {
      form.model.organizationId = null
      return
    }
    const row = productionTree.findNode(sourceOrganizations.value, id)
    if (row) Object.assign(form.model, { name: row.organizationName, code: row.organizationCode })
  }
  async function handleOpen(data: OpenData) {
    Object.assign(form, { id: data.row?.id, departments: data.departments })
    const parentTenantId = data.parentId
      ? data.departments.find((department) => department.id === data.parentId)?.tenantId
      : undefined
    form.model = data.row
      ? (cloneDeep(pick(data.row, Object.keys(createDepartment()))) as ProductionDepartmentInput)
      : {
          ...createDepartment(),
          tenantId: parentTenantId || effectiveTenantId.value || '',
          parentId: data.parentId || null
        }
    await dialogRef.value?.handleOpen(data, {
      title: data.row ? '编辑部门 / 产线' : '新增部门 / 产线',
      subtitle: data.row ? `正在维护：${data.row.name}` : '建立新的生产组织节点',
      confirmText: data.row ? '保存更改' : '创建部门',
      contentMaxHeight: '68vh',
      loading: true,
      loadingText: '正在加载组织选项…',
      onOpen: async (_openData, api) => {
        try {
          await tenantScopeStore.loadTenantOptions()
          if (form.model.tenantId) await formRef.value?.reloadOptions('organizationId')
        } catch {
          ElMessage.warning('组织选项加载失败，请关闭弹窗后重试')
        } finally {
          api.setLoading(false)
        }
      },
      onConfirm: async () => {
        try {
          await formRef.value?.validate()
          const payload: ProductionDepartmentInput = {
            ...form.model,
            name: form.model.name.trim(),
            code: form.model.code.trim(),
            organizationId: form.model.organizationId || null,
            parentId: form.model.parentId || null,
            textColor: form.model.textColor || ''
          }
          await saveProductionDepartment(payload, form.id)
          emit('success')
        } catch {
          return false
        }
      }
    })
  }
  defineExpose({ handleOpen })
</script>

<template>
  <ArtDialog ref="dialogRef" size="lg">
    <ElAlert
      v-if="!form.sourceError"
      title="优先从员工花名册选择人员，系统会自动带入可访问的身份资料；未建档人员也可直接录入。"
      type="info"
      :closable="false"
      show-icon
    />
    <ElAlert
      v-if="form.sourceError"
      :title="form.sourceError"
      type="error"
      :closable="false"
      show-icon
    />
    <ArtForm
      ref="formRef"
      v-model="form.model"
      :items="items"
      :rules="form.rules"
      :span="12"
      :show-reset="false"
      :show-submit="false"
    >
      <template #employeeId>
        <ArtEmployeeSelect
          :model-value="form.model.employeeId || undefined"
          :selected-data="selection"
          :tenant-id="form.model.tenantId"
          :api-fn="fetchProductionEmployeeOptions"
          :disabled="form.sourceLoading"
          @confirm="selectEmployee"
          @clear="clearEmployee"
        />
      </template>
    </ArtForm>
  </ArtDialog>
</template>
<script setup lang="ts">
  import { ref, reactive, computed } from 'vue'
  import { cloneDeep, pick } from 'lodash-es'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import type { EmployeeIntegrationItem } from '@/api/integration/employees'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import {
    fetchProductionEmployeeReference,
    fetchProductionEmployeeOptions,
    saveProductionPerson,
    type ProductionPerson,
    type ProductionPersonInput,
    type ProductionDepartment
  } from '@/api/mdm'
  import { createPerson, departmentOptions } from './production-model'
  interface OpenData {
    row?: ProductionPerson
    departmentId?: string
    departments: ProductionDepartment[]
  }
  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<OpenData>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const selection = ref<EmployeeIntegrationItem[]>([])
  const user = useUserStore()
  const tenantScopeStore = useTenantScopeStore()
  const { effectiveTenantId, tenantOptions } = storeToRefs(tenantScopeStore)
  let requestVersion = 0
  const form = reactive({
    model: createPerson(),
    id: undefined as string | undefined,
    departments: [] as ProductionDepartment[],
    sourceLoading: false,
    sourceError: '',
    rules: {
      tenantId: [{ required: true, message: '请选择所属租户', trigger: 'change' }],
      name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
      employeeNo: [{ required: true, message: '请输入工号', trigger: 'blur' }],
      barcode: [{ required: true, message: '请输入条码', trigger: 'blur' }],
      departmentId: [{ required: true, message: '请选择所属部门', trigger: 'change' }],
      workType: [{ required: true, message: '请选择工作类型', trigger: 'change' }]
    }
  })
  const scopedDepartments = computed(() =>
    form.departments.filter((department) => department.tenantId === form.model.tenantId)
  )
  const items = computed<FormItem[]>(() => [
    { key: 'source', label: '身份来源', type: 'divider', span: 24 },
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
        disabled: !!form.id || !!form.model.departmentId,
        filterable: true,
        placeholder: '请选择本次新增数据所属的租户',
        onChange: handleTenantChange
      },
      help: '“全部租户”下仍可新增；人员、员工档案和生产部门必须属于同一租户。'
    },
    {
      key: 'employeeId',
      label: '员工花名册',
      span: 24,
      help: '选择后按当前数据权限带入员工资料，也支持直接录入。'
    },
    { key: 'identity', label: '生产身份', type: 'divider', span: 24 },
    {
      key: 'name',
      label: '姓名',
      type: 'input',
      props: { maxlength: 120, placeholder: '输入人员姓名' }
    },
    {
      key: 'employeeNo',
      label: '工号',
      type: 'input',
      props: { maxlength: 80, onChange: defaultBarcode }
    },
    { key: 'barcode', label: '条码', type: 'input', help: '默认等于工号，可按生产条码规则调整。' },
    { key: 'phone', label: '手机号', type: 'input', props: { maxlength: 30 } },
    { key: 'organization', label: '组织与岗位', type: 'divider', span: 24 },
    {
      key: 'departmentId',
      label: '所属部门',
      type: 'treeSelect',
      options: departmentOptions(scopedDepartments.value),
      props: { checkStrictly: true, filterable: true }
    },
    {
      key: 'workType',
      label: '工作类型',
      type: 'select',
      options: user.getDictMap.mdmProductionWorkType ?? []
    },
    { key: 'jobTitle', label: '职位', type: 'input' },
    { key: 'trade', label: '工种', type: 'input' },
    {
      key: 'gender',
      label: '性别',
      type: 'select',
      options: user.getDictMap.sex ?? [],
      props: { clearable: true }
    },
    {
      key: 'hireDate',
      label: '入职日期',
      type: 'date',
      props: { valueFormat: 'YYYY-MM-DD', clearable: true }
    },
    { key: 'scope', label: '权限与补充', type: 'divider', span: 24 },
    {
      key: 'permissionDepartmentIds',
      label: '权限部门',
      type: 'treeSelect',
      span: 24,
      options: departmentOptions(scopedDepartments.value),
      props: { multiple: true, showCheckbox: true, checkStrictly: true, filterable: true },
      help: '记录生产业务可用部门范围，不替代系统角色授权。'
    },
    {
      key: 'remark',
      label: '备注',
      type: 'textarea',
      span: 24,
      props: { rows: 2, maxlength: 1000 }
    }
  ])
  function handleTenantChange() {
    clearEmployee()
    Object.assign(form.model, { departmentId: '', permissionDepartmentIds: [] })
  }
  function defaultBarcode() {
    if (!form.model.barcode) form.model.barcode = form.model.employeeNo
  }
  function clearEmployee() {
    requestVersion++
    form.model.employeeId = null
    selection.value = []
    form.sourceLoading = false
    form.sourceError = ''
  }
  async function selectEmployee(id: string | undefined, rows: EmployeeIntegrationItem[]) {
    if (!id) return
    const version = ++requestVersion
    form.sourceLoading = true
    form.sourceError = ''
    try {
      const employee = await fetchProductionEmployeeReference(id)
      if (version !== requestVersion) return
      if (form.model.tenantId && employee.tenantId !== form.model.tenantId) {
        ElMessage.warning('员工档案与当前所属租户不一致，请选择同一租户的员工')
        clearEmployee()
        return
      }
      if (!form.model.tenantId) form.model.tenantId = employee.tenantId
      selection.value = rows
      const patch: Partial<ProductionPersonInput> = {
        employeeId: id,
        name: employee.employeeName,
        employeeNo: employee.employeeNo,
        barcode: employee.employeeNo,
        phone: employee.phone || '',
        avatarUrl: employee.avatarUrl || '',
        jobTitle: employee.jobTitle || '',
        gender: employee.gender || '',
        hireDate: employee.hireDate,
        workType: ['intern', '实习生'].includes(employee.employmentType)
          ? 'intern'
          : ['temporary', '临时工'].includes(employee.employmentType)
            ? 'temporary'
            : 'regular'
      }
      Object.assign(form.model, patch)
    } catch {
      if (version === requestVersion) form.sourceError = '员工资料带入失败，请重新选择或手动填写。'
    } finally {
      if (version === requestVersion) form.sourceLoading = false
    }
  }
  async function handleOpen(data: OpenData) {
    requestVersion++
    Object.assign(form, {
      id: data.row?.id,
      departments: data.departments,
      sourceLoading: false,
      sourceError: ''
    })
    const departmentTenantId = data.departmentId
      ? data.departments.find((department) => department.id === data.departmentId)?.tenantId
      : undefined
    form.model = data.row
      ? (cloneDeep(pick(data.row, Object.keys(createPerson()))) as ProductionPersonInput)
      : {
          ...createPerson(),
          tenantId: departmentTenantId || effectiveTenantId.value || '',
          departmentId: data.departmentId || ''
        }
    selection.value = data.row?.employeeId
      ? [
          {
            id: data.row.employeeId,
            tenantId: data.row.tenantId,
            employeeNo: data.row.employeeNo,
            employeeName: data.row.name,
            employmentStatus: 'active',
            phone: data.row.phone
          }
        ]
      : []
    await dialogRef.value?.handleOpen(data, {
      title: data.row ? '编辑生产人员' : '新增生产人员',
      subtitle: data.row
        ? `正在维护：${data.row.name} · ${data.row.employeeNo}`
        : '建立人员生产身份与组织关系',
      confirmText: data.row ? '保存更改' : '创建人员',
      contentMaxHeight: '70vh',
      loading: true,
      loadingText: '正在加载租户选项…',
      onOpen: async (_openData, api) => {
        try {
          await tenantScopeStore.loadTenantOptions()
        } catch {
          ElMessage.warning('租户选项加载失败，请关闭弹窗后重试')
        } finally {
          api.setLoading(false)
        }
      },
      onConfirm: async () => {
        if (form.sourceLoading) return false
        try {
          defaultBarcode()
          await formRef.value?.validate()
          const payload: ProductionPersonInput = {
            ...form.model,
            name: form.model.name.trim(),
            employeeNo: form.model.employeeNo.trim(),
            barcode: form.model.barcode.trim(),
            employeeId: form.model.employeeId || null,
            hireDate: form.model.hireDate || null,
            textColor: form.model.textColor || ''
          }
          await saveProductionPerson(payload, form.id)
          emit('success')
        } catch {
          return false
        }
      },
      onClose: () => {
        requestVersion++
      }
    })
  }
  defineExpose({ handleOpen })
</script>

<template>
  <ArtDialog ref="dialogRef" size="lg">
    <div class="personnel-center-dialog">
      <ElAlert v-if="form.error" :title="form.error" type="error" show-icon :closable="false" />
      <ElAlert
        :title="`工作中心范围：${form.scopeLabel}`"
        description="常用项将显示在作业端“工作台 / 常用”中，可随时回来调整。"
        type="info"
        show-icon
        :closable="false"
      />
      <ArtForm
        ref="formRef"
        v-model="form.model"
        :items="formItems"
        :rules="rules"
        :show-submit="false"
        :show-reset="false"
        :span="24"
        label-position="top"
      >
        <template #personnelId>
          <ArtEmployeeSelect
            v-model="form.model.personnelId"
            v-model:selected-data="form.people"
            :api-fn="fetchPeople"
            :disabled="form.mode === 'edit'"
            :clearable="form.mode === 'add'"
            :display-fields="['organization', 'jobTitle', 'phone']"
            title="选择生产人员"
            :subtitle="personnelSubtitle"
            search-placeholder="姓名 / 工号 / 手机号"
            @confirm="handlePersonnelConfirm"
          />
        </template>
        <template #workCenterIds>
          <ArtTableMultipleSelect
            :model-value="form.model.workCenterIds"
            :selected-data="form.centers"
            :api-fn="fetchCenters"
            :columns="centerColumns"
            row-key="id"
            label-key="name"
            description-key="code"
            title="选择常用工作中心"
            :subtitle="`当前可选范围：${form.scopeLabel}`"
            search-placeholder="工作中心编号 / 名称"
            placeholder="选择一个或多个常用工作中心"
            empty-text="当前范围暂无工作中心"
            empty-description="请调整左侧部门/产线范围，或先在工作中心菜单完成配置。"
            :max-tag-count="3"
            @update:model-value="updateCenterIds"
            @update:selected-data="updateCenters"
          />
        </template>
      </ArtForm>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { computed, reactive, ref } from 'vue'
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtTableMultipleSelect from '@/components/core/forms/art-data-select/table-multiple.vue'
  import type {
    DataSelectColumn,
    DataSelectFetchParams,
    DataSelectModelValue,
    DataSelectRecord
  } from '@/components/core/forms/art-data-select/types'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import type { EmployeeIntegrationItem } from '@/api/integration/employees'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import { storeToRefs } from 'pinia'
  import {
    fetchUnconfiguredPersonnelSelector,
    fetchWorkCenters,
    savePersonnelCommonWorkCenters,
    type CommonWorkCenter,
    type PersonnelWorkCenterConfig,
    type ProductionDepartment
  } from '@/api/mdm'
  import { departmentOptions } from '../../modules/production-model'
  import { employeeDepartmentId, personnelDepartmentScopeIds } from './configuration-policy'

  interface OpenData {
    mode: 'add' | 'edit'
    row?: PersonnelWorkCenterConfig
    departmentId?: string
    departments: ProductionDepartment[]
    departmentIds?: string[]
    scopeLabel: string
  }

  interface FormModel {
    personnelId?: string
    departmentId: string
    workCenterIds: string[]
  }

  const emit = defineEmits<{ success: [] }>()
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const dialogRef = ref<ArtDialogExpose<OpenData>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const form = reactive({
    mode: 'add' as OpenData['mode'],
    model: { personnelId: undefined, departmentId: '', workCenterIds: [] } as FormModel,
    people: [] as EmployeeIntegrationItem[],
    centers: [] as CommonWorkCenter[],
    departments: [] as ProductionDepartment[],
    departmentIds: undefined as string[] | undefined,
    scopeLabel: '全部部门与产线',
    error: ''
  })
  const selectedDepartment = computed(() =>
    form.departments.find((department) => department.id === form.model.departmentId)
  )
  const personnelSubtitle = computed(() =>
    selectedDepartment.value
      ? `仅显示“${selectedDepartment.value.name}”及下级尚未配置的启用人员`
      : '仅显示尚未配置常用工作中心的启用人员'
  )
  const formItems = computed<FormItem[]>(() => [
    {
      key: 'departmentId',
      label: '所属部门',
      type: 'treeSelect',
      options: departmentOptions(form.departments),
      props: {
        checkStrictly: true,
        filterable: true,
        clearable: false,
        placeholder: '请选择所属部门'
      },
      help: '默认跟随左侧部门；选择员工后会校准为其当前所属部门，也可手动改选。'
    },
    {
      key: 'personnelId',
      label: '员工',
      help: '人员来自“人员配置”，已有常用项的人员请从列表使用编辑。'
    },
    {
      key: 'workCenterIds',
      label: '常用工作中心',
      help: '支持多选；保存后作业员可在工作台快速找到这些工作中心。'
    }
  ])
  const rules = {
    departmentId: [{ required: true, message: '请选择所属部门', trigger: 'change' }],
    personnelId: [{ required: true, message: '请选择员工', trigger: 'change' }],
    workCenterIds: [
      {
        type: 'array',
        required: true,
        min: 1,
        message: '请至少选择一个工作中心',
        trigger: 'change'
      }
    ]
  }
  const centerColumns: DataSelectColumn[] = [
    { prop: 'code', label: '工作中心', minWidth: 150 },
    { prop: 'name', label: '名称', minWidth: 170 },
    { prop: 'departmentName', label: '所属产线', minWidth: 150 }
  ]

  const fetchPeople = (params: Parameters<typeof fetchUnconfiguredPersonnelSelector>[0]) =>
    fetchUnconfiguredPersonnelSelector(
      params,
      personnelDepartmentScopeIds(form.departments, form.model.departmentId)
    )

  async function fetchCenters(params: DataSelectFetchParams) {
    const targetTenantId =
      form.people[0]?.tenantId || selectedDepartment.value?.tenantId || effectiveTenantId.value
    const result = await fetchWorkCenters({
      tenantId: targetTenantId || '',
      keyword: params.keyword,
      departmentIds: form.departmentIds,
      current: params.page,
      size: params.pageSize
    })
    return {
      data: result.data.map((center): CommonWorkCenter => ({
        id: center.id,
        code: center.code,
        name: center.name,
        departmentId: center.departmentId,
        departmentName: center.department?.name || '未分配产线'
      })),
      total: result.total
    }
  }

  function updateCenterIds(value: DataSelectModelValue) {
    form.model.workCenterIds = Array.isArray(value) ? value.map(String) : []
    form.error = ''
  }

  function updateCenters(rows: DataSelectRecord[]) {
    form.centers = rows.map((row): CommonWorkCenter => ({
      id: String(row.id),
      code: String(row.code ?? ''),
      name: String(row.name ?? ''),
      departmentId: String(row.departmentId ?? ''),
      departmentName: String(row.departmentName ?? '')
    }))
  }

  function handlePersonnelConfirm(_id: string | undefined, rows: EmployeeIntegrationItem[]) {
    form.model.departmentId = employeeDepartmentId(rows[0], form.model.departmentId)
    form.error = ''
  }

  function toEmployee(row: PersonnelWorkCenterConfig): EmployeeIntegrationItem {
    return {
      id: row.id,
      tenantId: row.tenantId,
      organizationId: row.departmentId,
      employeeName: row.name,
      employeeNo: row.employeeNo,
      phone: row.phone,
      avatarUrl: row.avatarUrl,
      jobTitle: row.jobTitle,
      employmentStatus: 'active',
      organization: {
        id: row.department.id,
        organizationCode: row.department.code,
        organizationName: row.department.name
      }
    }
  }

  async function handleOpen(data: OpenData) {
    Object.assign(form, {
      mode: data.mode,
      model: {
        personnelId: data.row?.id,
        departmentId: data.row?.departmentId || data.departmentId || '',
        workCenterIds: data.row?.commonWorkCenters.map((center) => center.id) ?? []
      },
      people: data.row ? [toEmployee(data.row)] : [],
      centers: data.row?.commonWorkCenters ?? [],
      departments: data.departments,
      departmentIds: data.departmentIds,
      scopeLabel: data.scopeLabel,
      error: ''
    })
    await dialogRef.value?.handleOpen(data, {
      title: data.mode === 'edit' ? `编辑常用工作中心 · ${data.row?.name}` : '新增常用配置',
      subtitle: '为生产人员设置作业端优先展示的工作中心',
      confirmText: '保存配置',
      contentMaxHeight: '66vh',
      onConfirm: async () => {
        try {
          await formRef.value?.validate()
          if (!form.model.personnelId) return false
          await savePersonnelCommonWorkCenters({
            personnelId: form.model.personnelId,
            departmentId: form.model.departmentId,
            workCenterIds: form.model.workCenterIds
          })
          emit('success')
          return true
        } catch {
          return false
        }
      }
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .personnel-center-dialog {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }
</style>

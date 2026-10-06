<template>
  <ArtDialog ref="dialogRef" size="xl">
    <div class="operational-master-dialog">
      <ArtEntitySummary
        class="operational-master-dialog__context"
        :icon="config.icon"
        :eyebrow="config.eyebrow"
        :title="entityTitle"
        :description="entityDescription"
      >
        <template #aside>
          <ArtDictDisplay
            dict-code="commonBoolean"
            :value="String(form.model.enabled)"
            display="tag"
          />
        </template>
      </ArtEntitySummary>

      <MasterDetail
        v-if="form.readonly"
        :config="config"
        :record="form.model"
        :groups="form.groups"
        :references="form.references"
        :tenant-options="form.tenantOptions"
      />

      <div v-else class="operational-master-dialog__form-panel">
        <ArtForm
          ref="formRef"
          v-model="form.model"
          :items="formItems"
          :rules="formRules"
          :span="config.formSpan ?? 12"
          :gutter="24"
          label-position="top"
          :show-reset="false"
          :show-submit="false"
        >
          <template #ownerId>
            <ArtEmployeeSelect
              :model-value="form.model.ownerId ?? undefined"
              :selected-data="employeeSelection(form.model.ownerId)"
              :tenant-id="form.model.tenantId"
              placeholder="选择项目负责人"
              @update:model-value="form.model.ownerId = $event ?? null"
            />
          </template>
          <template #salespersonId>
            <ArtEmployeeSelect
              :model-value="form.model.salespersonId ?? undefined"
              :selected-data="employeeSelection(form.model.salespersonId)"
              :tenant-id="form.model.tenantId"
              placeholder="选择销售员"
              @update:model-value="form.model.salespersonId = $event ?? null"
            />
          </template>
          <template #addressPicker>
            <ArtAddressPicker
              v-model:region-path="addressRegionPath"
              v-model:address-detail="addressDetailModel"
              :region-api="fetchRegionOptions"
              label-width="0"
              region-label="省 / 市 / 区"
              detail-label="详细地址"
              :show-coordinate-hint="false"
            />
          </template>
          <template #responsiblePersonId>
            <ArtTableSingleSelect
              :model-value="form.model.responsiblePersonId ?? undefined"
              :selected-data="personnelSelection"
              :api-fn="fetchPersonnelOptions"
              :columns="[
                { prop: 'name', label: '人员姓名', minWidth: 150 },
                { prop: 'code', label: '人员编号', minWidth: 150 }
              ]"
              row-key="id"
              label-key="name"
              description-key="code"
              title="选择生产人员"
              subtitle="从当前租户已维护的生产人员中选择工位负责人"
              search-placeholder="搜索姓名或人员编号"
              placeholder="选择工位负责人"
              empty-text="暂无可选生产人员"
              empty-description="请先在生产主数据中维护生产人员。"
              @update:model-value="form.model.responsiblePersonId = String($event || '') || null"
            />
          </template>
        </ArtForm>
      </div>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { h, nextTick } from 'vue'
  import { cloneDeep } from 'lodash-es'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtAddressPicker from '@/components/core/forms/art-address-picker/index.vue'
  import ArtTableSingleSelect from '@/components/core/forms/art-data-select/table-single.vue'
  import type {
    DataSelectFetchParams,
    DataSelectRecord
  } from '@/components/core/forms/art-data-select/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import type { EmployeeIntegrationItem } from '@/api/integration/employees'
  import { fetchRegionOptions } from '@/api/region-options'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import { useTenantScopeFormPolicy } from '@/hooks/core/useTenantScopeFormPolicy'
  import { useUserStore } from '@/store/modules/user'
  import { validateEmail, validatePhone, validateTelPhone } from '@/utils/form/validator'
  import TreeUtils from '@/utils/tree'
  import type {
    MasterGroup,
    OperationalMasterInput,
    OperationalMasterRecord,
    OperationalMasterReferences
  } from '@/api/mdm'
  import { fetchOperationalMasterReferences, saveOperationalMaster } from '@/api/mdm'
  import type {
    MasterFieldConfig,
    MasterFormSectionConfig,
    OperationalMasterConfig
  } from './master-config'
  import MasterDetail from './master-detail.vue'
  import { buildOperationalMasterWriteInput } from './master-payload'

  export interface MasterDialogOpenData {
    config: OperationalMasterConfig
    tenantId: string
    tenantOptions: Array<{ label: string; value: string }>
    groups: MasterGroup[]
    initialGroupId?: string
    row?: OperationalMasterRecord
    copy?: boolean
    readonly?: boolean
  }

  const emit = defineEmits<{ success: [mode: 'add' | 'edit'] }>()
  const userStore = useUserStore()
  const { shouldExposeTenantField } = useTenantScopeFormPolicy()
  const { getDictMap } = storeToRefs(userStore)
  const referenceTree = new TreeUtils({ parentKey: 'parentId' })
  const dialogRef = ref<ArtDialogExpose<MasterDialogOpenData>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const emptyReferences = (): OperationalMasterReferences => ({
    customers: [],
    employees: [],
    departments: [],
    workCenters: [],
    personnel: [],
    units: [],
    menus: []
  })
  const form = reactive({
    model: {} as OperationalMasterRecord,
    config: undefined as OperationalMasterConfig | undefined,
    groups: [] as MasterGroup[],
    references: emptyReferences(),
    tenantOptions: [] as Array<{ label: string; value: string }>,
    readonly: false,
    copy: false
  })
  const addressRegionPath = ref<string[]>([])
  const addressDetailModel = computed({
    get: () => form.model.addressDetail || '',
    set: (value: string) => (form.model.addressDetail = value)
  })
  const config = computed(() => form.config as OperationalMasterConfig)
  const dialogHeading = computed(() =>
    form.readonly
      ? `${config.value.title}详情`
      : form.copy
        ? `复制${config.value.title}`
        : form.model.id
          ? `编辑${config.value.title}`
          : `新增${config.value.title}`
  )
  const entityTitle = computed(() => {
    const name = String(form.model[config.value.nameKey] || '').trim()
    return name || `新${config.value.title}主档`
  })
  const entityDescription = computed(() => {
    const code = String(form.model[config.value.codeKey] || '').trim()
    if (code) return `业务编码：${code}`
    return form.copy ? '正在创建副本，请确认识别信息与业务范围。' : config.value.description
  })

  const dictionaryOptions = (code: string): Array<{ label: string; value: unknown }> =>
    (getDictMap.value[code] ?? []).map((item) => ({
      label: item.label || item.value,
      value: code === 'commonBoolean' ? item.value === 'true' || item.value === '1' : item.value
    }))

  const referenceOptions = (field: MasterFieldConfig) => {
    if (!field.reference) return []
    if (field.reference === 'workCenters') {
      if (!form.model.tenantId || !form.model.departmentId) return []
      return form.references.workCenters
        .filter(
          (item) =>
            item.tenantId === form.model.tenantId && item.departmentId === form.model.departmentId
        )
        .map((item) => ({ label: `${item.name} · ${item.code}`, value: item.id }))
    }
    return form.references[field.reference].map((item) => ({
      label: `${item.name} · ${item.code}`,
      value: item.id
    }))
  }

  const groupOptions = computed(() =>
    referenceTree.listToTree(
      form.groups
        .filter((group) => group.tenantId === form.model.tenantId)
        .map((group) => ({
          id: group.id,
          parentId: group.parentId,
          label: `${group.name} · ${group.code}`,
          value: group.id
        }))
    )
  )

  const departmentOptions = computed(() =>
    referenceTree.listToTree(
      form.references.departments
        .filter((item) => item.tenantId === form.model.tenantId)
        .map((item) => ({
          id: item.id,
          parentId: item.parentId,
          label: `${item.name} · ${item.code}`,
          value: item.id
        }))
    )
  )

  const workCenterOptions = computed(() => {
    if (!form.model.tenantId || !form.model.departmentId) return []
    return form.references.workCenters
      .filter(
        (item) =>
          item.tenantId === form.model.tenantId && item.departmentId === form.model.departmentId
      )
      .map((item) => ({ label: `${item.name} · ${item.code}`, value: item.id }))
  })

  const employeeSelection = (id?: string | null): EmployeeIntegrationItem[] => {
    const item = form.references.employees.find((employee) => employee.id === id)
    return item
      ? [
          {
            id: item.id,
            tenantId: item.tenantId,
            employeeNo: item.code,
            employeeName: item.name,
            employmentStatus: 'active'
          }
        ]
      : []
  }

  const personnelSelection = computed<DataSelectRecord[]>(() =>
    form.references.personnel.filter((item) => item.id === form.model.responsiblePersonId)
  )

  async function fetchPersonnelOptions(params: DataSelectFetchParams) {
    const keyword = params.keyword.trim().toLocaleLowerCase()
    const rows = form.references.personnel.filter((item) =>
      keyword ? `${item.name} ${item.code}`.toLocaleLowerCase().includes(keyword) : true
    )
    const from = Math.max((params.page - 1) * params.pageSize, 0)
    return { data: rows.slice(from, from + params.pageSize), total: rows.length }
  }

  function createSectionDivider(section: MasterFormSectionConfig): FormItem {
    return {
      key: `section-${section.key}`,
      label: () =>
        h('span', { class: 'operational-master-dialog__section-heading' }, [
          h('strong', section.title),
          h('small', section.description)
        ]),
      type: 'divider',
      span: 24,
      props: { accessibleLabel: section.title }
    }
  }

  function createFieldItems(field: MasterFieldConfig): FormItem[] {
    if (field.key === 'addressDetail' && ['customer', 'project'].includes(config.value.kind)) {
      return []
    }
    if (field.key === 'region' && ['customer', 'project'].includes(config.value.kind)) {
      return [{ key: 'addressPicker', label: '', type: 'input', span: 24, labelWidth: 0 }]
    }
    const isGroup = field.key === 'groupId'
    const isSelectable = ['select', 'treeSelect'].includes(String(field.type))
    const options = field.dictCode
      ? dictionaryOptions(field.dictCode)
      : isGroup
        ? groupOptions.value
        : field.reference === 'departments'
          ? departmentOptions.value
          : field.reference === 'workCenters' && config.value.kind === 'operation'
            ? workCenterOptions.value
            : referenceOptions(field)
    const isOperationWorkCenter =
      config.value.kind === 'operation' && field.reference === 'workCenters'
    return [
      {
        key: String(field.key),
        label: field.label,
        type: field.type ?? 'input',
        span: field.span ?? config.value.formSpan ?? 12,
        options,
        props: {
          clearable: isSelectable && !field.required,
          filterable: isSelectable,
          multiple: field.multiple,
          maxlength: field.maxlength ?? (field.type === 'textarea' ? 1000 : 160),
          rows: field.type === 'textarea' ? 3 : undefined,
          resize: field.type === 'textarea' ? 'none' : undefined,
          showWordLimit: field.type === 'textarea',
          controlsPosition: field.type === 'number' ? 'right' : undefined,
          placeholder:
            isOperationWorkCenter && !form.model.departmentId
              ? '请先选择车间 / 产线'
              : field.placeholder || `${isSelectable ? '请选择' : '请输入'}${field.label}`,
          disabled: isOperationWorkCenter && !form.model.departmentId,
          checkStrictly: field.type === 'treeSelect' ? true : undefined,
          defaultExpandAll: field.type === 'treeSelect' ? true : undefined,
          onChange:
            config.value.kind === 'operation' && field.key === 'departmentId'
              ? handleOperationDepartmentChange
              : undefined,
          readonly: field.systemGenerated,
          class: field.type === 'number' ? '!w-full' : undefined
        },
        help: field.systemGenerated
          ? '由系统按 PJ + 年月 + 3 位流水号生成，每月从 001 重新开始。'
          : isGroup && !groupOptions.value.length
            ? `暂无${config.value.groupTitle || '业务分组'}，可先在左侧分组区新增。`
            : isOperationWorkCenter
              ? !form.model.departmentId
                ? '选择车间 / 产线后，仅显示该范围内的工作中心。'
                : workCenterOptions.value.length
                  ? '仅显示所选车间 / 产线下的工作中心。'
                  : '当前车间 / 产线暂无可选工作中心。'
              : undefined
      }
    ]
  }

  function handleOperationDepartmentChange(): void {
    if (!Array.isArray(form.model.workCenterIds)) return
    const availableIds = new Set(workCenterOptions.value.map((item) => item.value))
    form.model.workCenterIds = form.model.workCenterIds.filter((id) => availableIds.has(id))
  }

  const formItems = computed<FormItem[]>(() => {
    const tenantItems: FormItem[] = shouldExposeTenantField.value
      ? [
          {
            key: 'section-scope',
            label: () =>
              h('span', { class: 'operational-master-dialog__section-heading' }, [
                h('strong', '数据归属'),
                h('small', '选择本条主数据所属租户，保存后不可变更。')
              ]),
            type: 'divider',
            span: 24
          },
          {
            key: 'tenantId',
            label: '所属租户',
            type: 'select',
            span: 24,
            options: form.tenantOptions,
            props: {
              disabled: form.readonly || (!!form.model.id && !form.copy),
              filterable: true,
              placeholder: '请选择本条主数据所属租户',
              onChange: reloadReferences
            },
            help: '在“全部租户”工作区新增时必须明确业务数据归属。'
          }
        ]
      : []

    const sectionItems = config.value.formSections.flatMap((section) => {
      const fieldItems = section.fieldKeys.flatMap((fieldKey) => {
        const field = config.value.fields.find((item) => item.key === fieldKey)
        return field ? createFieldItems(field) : []
      })

      return [createSectionDivider(section), ...fieldItems]
    })

    return [...tenantItems, ...sectionItems]
  })

  const formRules = computed(() => {
    const rules: Record<string, Array<Record<string, unknown>>> = {
      tenantId: [{ required: true, message: '请选择所属租户', trigger: 'change' }]
    }
    for (const field of config.value.fields.filter((item) => item.required)) {
      rules[String(field.key)] = [
        {
          required: true,
          message: `请${field.type === 'select' || field.type === 'treeSelect' ? '选择' : '输入'}${field.label}`,
          trigger: field.type === 'select' || field.type === 'treeSelect' ? 'change' : 'blur'
        }
      ]
    }
    for (const field of config.value.fields.filter((item) => item.validation)) {
      const validator = (_rule: unknown, value: unknown, callback: (error?: Error) => void) => {
        const text = String(value ?? '').trim()
        if (!text) return callback()
        if (field.validation === 'email' && !validateEmail(text)) {
          return callback(new Error('请输入正确的邮箱地址'))
        }
        if (field.validation === 'phone' && !validatePhone(text) && !validateTelPhone(text)) {
          return callback(new Error('请输入正确的手机号或座机号'))
        }
        return callback()
      }
      rules[String(field.key)] = [
        ...(rules[String(field.key)] ?? []),
        { validator, trigger: 'blur' }
      ]
    }
    return rules
  })

  function createModel(data: MasterDialogOpenData): OperationalMasterRecord {
    const model: OperationalMasterRecord = {
      id: '',
      tenantId: data.row?.tenantId || data.tenantId,
      enabled: true,
      remark: ''
    }
    for (const field of data.config.fields) {
      if (field.multiple) model[field.key] = [] as never
      else if (field.key === 'isDefault' || field.key === 'participatesScheduling') {
        model[field.key] = false as never
      } else if (field.key === 'price') model[field.key] = 0 as never
      else if (!(field.key in model)) model[field.key] = null as never
    }
    if (data.row) Object.assign(model, cloneDeep(data.row))
    else if (data.config.kind === 'operation' && data.initialGroupId) {
      model.groupId = data.initialGroupId
    }
    if (data.copy) {
      model.id = ''
      for (const field of data.config.fields.filter((item) => item.systemGenerated)) {
        model[field.key] = null as never
      }
    }
    return model
  }

  async function reloadReferences(): Promise<void> {
    form.references = await fetchOperationalMasterReferences(form.model.tenantId)
    if (form.model.groupId && !form.groups.some((group) => group.id === form.model.groupId)) {
      form.model.groupId = null
    }
    if (
      config.value.kind === 'operation' &&
      form.model.departmentId &&
      !form.references.departments.some((item) => item.id === form.model.departmentId)
    ) {
      form.model.departmentId = null
    }
    if (config.value.kind === 'operation') handleOperationDepartmentChange()
  }

  function normalizePayload(): OperationalMasterInput {
    return buildOperationalMasterWriteInput(form.model, {
      kind: config.value.kind,
      fieldKeys: config.value.fields.map((field) => field.key),
      regionPath: addressRegionPath.value
    })
  }

  const handleOpen = async (data: MasterDialogOpenData): Promise<void> => {
    form.config = data.config
    form.groups = data.groups
    form.tenantOptions = data.tenantOptions
    form.readonly = !!data.readonly
    form.copy = !!data.copy
    form.model = createModel(data)
    addressRegionPath.value = String(form.model.region || '')
      .split('/')
      .filter(Boolean)
    await dialogRef.value?.handleOpen(data, {
      title: dialogHeading.value,
      subtitle: data.row
        ? `当前记录：${String(data.row[data.config.nameKey] || '未命名')}`
        : data.config.description,
      showFooter: !data.readonly,
      confirmText: data.row && !data.copy ? '保存更改' : `创建${data.config.title}`,
      contentMaxHeight: '72vh',
      loading: true,
      onOpen: async (_openData, api) => {
        try {
          await Promise.all(
            data.config.fields
              .map((field) => field.dictCode)
              .filter((code): code is string => !!code)
              .map((code) => userStore.ensureDictLoaded(code))
          )
          await reloadReferences()
          await nextTick()
          formRef.value?.resetCollapsedSections()
          formRef.value?.clearValidate()
        } finally {
          api.setLoading(false)
        }
      },
      onConfirm: async () => {
        try {
          await formRef.value?.validate()
          await saveOperationalMaster(
            data.config.kind,
            normalizePayload(),
            data.row && !data.copy ? data.row.id : undefined
          )
          emit('success', data.row && !data.copy ? 'edit' : 'add')
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
  .operational-master-dialog {
    display: grid;
    gap: var(--art-space-4);

    &__context {
      min-width: 0;
    }

    &__form-panel {
      min-width: 0;
      padding-bottom: var(--art-space-2);
      background: color-mix(
        in srgb,
        var(--el-fill-color-extra-light) 45%,
        var(--default-box-color)
      );
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--art-control-radius);
    }

    :deep(.operational-master-dialog__section-heading) {
      display: inline-flex;
      gap: var(--art-space-2);
      align-items: baseline;
      min-width: 0;

      strong {
        flex: none;
        font: inherit;
      }

      small {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 11px;
        font-weight: 400;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }
    }

    @media (width <= 720px) {
      &__form-panel {
        padding-bottom: var(--art-space-1);
      }

      :deep(.operational-master-dialog__section-heading small) {
        display: none;
      }
    }
  }
</style>

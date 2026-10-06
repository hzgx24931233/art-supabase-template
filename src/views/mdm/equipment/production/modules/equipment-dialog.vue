<template>
  <ArtDialog ref="dialogRef" size="xl">
    <div class="equipment-dialog">
      <div class="equipment-dialog__identity">
        <span aria-hidden="true"><ArtSvgIcon icon="ri:tools-line" /></span>
        <div>
          <small>PRODUCTION EQUIPMENT</small>
          <strong>{{ form.equipmentName || '新生产设备' }}</strong>
          <p>{{ form.equipmentCode || '保存时自动生成企业设备编码' }}</p>
        </div>
        <div class="equipment-dialog__status">
          <ArtDictDisplay dict-code="commonEnabledStatus" :value="form.status" display="tag" />
        </div>
      </div>

      <ElTabs v-model="activeTab" class="equipment-dialog__tabs">
        <ElTabPane v-for="tab in tabs" :key="tab.name" :name="tab.name">
          <template #label>
            <span class="equipment-dialog__tab-label">
              <ArtSvgIcon :icon="tab.icon" />{{ tab.label }}
            </span>
          </template>
        </ElTabPane>
      </ElTabs>

      <section class="equipment-dialog__panel" :aria-labelledby="`equipment-tab-${activeTab}`">
        <header>
          <div>
            <span><ArtSvgIcon :icon="activeTabMeta.icon" /></span>
            <div>
              <strong :id="`equipment-tab-${activeTab}`">{{ activeTabMeta.title }}</strong>
              <small>{{ activeTabMeta.description }}</small>
            </div>
          </div>
          <span>{{ activeTabMeta.hint }}</span>
        </header>
        <ArtForm
          ref="formRef"
          v-model="form"
          :items="formItems"
          :rules="rules"
          :span="12"
          :gutter="24"
          label-position="top"
          :show-reset="false"
          :show-submit="false"
          root-class="equipment-dialog__form"
        >
          <template #photoUrl>
            <ArtUploadImage
              v-model="form.photoUrl"
              :resource-tenant-id="form.tenantId"
              title="上传设备图片"
              :limit="1"
              :size="104"
              tip="支持上传或从资源库选择 1 张设备主图"
            />
          </template>
          <template #responsibleEmployeeId>
            <ArtEmployeeSelect
              :model-value="form.responsibleEmployeeId ?? undefined"
              :tenant-id="form.tenantId"
              :selected-data="selectedEmployee"
              placeholder="选择设备管理员"
              @update:model-value="form.responsibleEmployeeId = $event ?? null"
            />
          </template>
        </ArtForm>
      </section>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import type { FormRules } from 'element-plus'
  import { cloneDeep, pick } from 'lodash-es'
  import TreeUtils from '@/utils/tree'
  import type { EmployeeIntegrationItem } from '@/api/integration/employees'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtUploadImage from '@/components/core/forms/art-upload-image/index.vue'
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import {
    saveProductionEquipment,
    type EquipmentReference,
    type ProductionEquipment,
    type ProductionEquipmentInput,
    type ProductionEquipmentReferences
  } from '@/api/mdm'

  type EquipmentTab = 'identity' | 'assignment' | 'technical' | 'connection' | 'governance'
  export interface EquipmentDialogOpenData {
    row?: ProductionEquipment
    copy?: boolean
    targetTenantId?: string
    tenantOptions: Array<{ label: string; value: string }>
    references: ProductionEquipmentReferences
  }

  interface EquipmentForm extends ProductionEquipmentInput {
    id?: string
  }

  interface EquipmentTreeOption {
    id: string
    parentId?: string | null
    label: string
    value: string
    children?: EquipmentTreeOption[]
  }

  const emit = defineEmits<{ success: [] }>()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const dialogRef = ref<ArtDialogExpose<EquipmentDialogOpenData>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const activeTab = ref<EquipmentTab>('identity')
  const references = ref<ProductionEquipmentReferences>({
    categories: [],
    departments: [],
    locations: [],
    workCenters: [],
    suppliers: []
  })
  const tenantOptions = ref<Array<{ label: string; value: string }>>([])
  const editingRow = shallowRef<ProductionEquipment>()
  const referenceTree = new TreeUtils({ parentKey: 'parentId' })

  const tabs = [
    { name: 'identity', label: '基础资料', icon: 'ri:fingerprint-line' },
    { name: 'assignment', label: '生产归属', icon: 'ri:node-tree' },
    { name: 'technical', label: '技术信息', icon: 'ri:settings-5-line' },
    { name: 'connection', label: '设备接入', icon: 'ri:radar-line' },
    { name: 'governance', label: '治理设置', icon: 'ri:shield-check-line' }
  ] as const
  const tabMeta: Record<
    EquipmentTab,
    { title: string; description: string; hint: string; icon: string }
  > = {
    identity: {
      title: '设备基础资料',
      description: '维护统一编码、名称、分类与启用状态。',
      hint: '名称与分类为必填项',
      icon: 'ri:fingerprint-line'
    },
    assignment: {
      title: '生产归属',
      description: '明确设备所在组织、工作中心和现场责任人。',
      hint: '部门 / 产线为必填项',
      icon: 'ri:node-tree'
    },
    technical: {
      title: '技术信息',
      description: '补充品牌型号、制造信息与资产识别信息。',
      hint: '用于设备档案与追溯',
      icon: 'ri:settings-5-line'
    },
    connection: {
      title: '现场接入',
      description: '维护三色灯、安灯与利用率采集基线。',
      hint: '用于 PMIS 和现场采集',
      icon: 'ri:radar-line'
    },
    governance: {
      title: '治理设置',
      description: '配置运行状态、显示顺序与设备概要。',
      hint: '统一主数据展示口径',
      icon: 'ri:shield-check-line'
    }
  }
  const activeTabMeta = computed(() => tabMeta[activeTab.value])

  const initialForm = (): EquipmentForm => ({
    id: undefined,
    tenantId: '',
    categoryId: '',
    productionDepartmentId: '',
    locationId: null,
    workCenterId: null,
    responsibleEmployeeId: null,
    supplierId: null,
    equipmentCode: '',
    equipmentName: '',
    photoUrl: '',
    equipmentBrand: '',
    model: '',
    manufacturer: '',
    factoryNo: '',
    fixedAssetNo: '',
    manufactureDate: null,
    installationDate: null,
    acceptanceDate: null,
    enableDate: null,
    trafficLightCardNo: '',
    andonBoxNo: '',
    pulseIntervalSeconds: 60,
    standardUtilization: null,
    syncWorkCenter: false,
    operationStatus: 'normal',
    status: 'enabled',
    remark: '',
    sort: 10
  })
  const form = reactive<EquipmentForm>(initialForm())

  const inTenant = (items: EquipmentReference[]): EquipmentReference[] =>
    form.tenantId ? items.filter((item) => item.tenantId === form.tenantId) : []
  const options = (items: EquipmentReference[]) =>
    inTenant(items).map((item) => ({ label: `${item.name} · ${item.code}`, value: item.id }))
  const treeOptions = (items: EquipmentReference[]): EquipmentTreeOption[] =>
    referenceTree.listToTree(
      inTenant(items).map((item) => ({
        id: item.id,
        parentId: item.parentId,
        label: `${item.name} · ${item.code}`,
        value: item.id
      }))
    )
  const categoryOptions = computed(() => treeOptions(references.value.categories))
  const departmentOptions = computed(() => treeOptions(references.value.departments))
  const locationOptions = computed(() => treeOptions(references.value.locations))
  const workCenterOptions = computed(() =>
    inTenant(references.value.workCenters)
      .filter((item) => item.departmentId === form.productionDepartmentId)
      .map((item) => ({ label: `${item.code} · ${item.name}`, value: item.id }))
  )
  const selectedEmployee = computed<EmployeeIntegrationItem[]>(() => {
    if (!editingRow.value?.responsibleEmployeeId || !editingRow.value.responsibleName) return []
    return [
      {
        id: editingRow.value.responsibleEmployeeId,
        tenantId: editingRow.value.tenantId,
        employeeNo: '',
        employeeName: editingRow.value.responsibleName,
        employmentStatus: 'active'
      }
    ]
  })

  const formItems = computed<FormItem[]>(() => {
    if (activeTab.value === 'identity')
      return [
        ...(tenantOptions.value.length > 1
          ? [
              {
                label: '目标租户',
                key: 'tenantId',
                type: 'select',
                options: tenantOptions.value,
                props: { disabled: Boolean(form.id), filterable: true }
              } as FormItem
            ]
          : []),
        {
          label: '设备编号',
          key: 'equipmentCode',
          type: 'input',
          help: '可留空，由企业编码规则自动生成。',
          props: { maxlength: 60, placeholder: '留空自动生成', disabled: Boolean(form.id) }
        },
        { label: '设备名称', key: 'equipmentName', type: 'input', props: { maxlength: 120 } },
        {
          label: '设备图片',
          key: 'photoUrl',
          type: 'slot',
          span: 24,
          help: '用于设备列表识别与档案首屏展示。'
        },
        {
          label: '设备分类',
          key: 'categoryId',
          type: 'treeSelect',
          options: categoryOptions.value,
          props: { checkStrictly: true, filterable: true, defaultExpandAll: true }
        },
        {
          label: '启用状态',
          key: 'status',
          type: 'select',
          options: getDictMap.value.commonEnabledStatus ?? []
        }
      ]
    if (activeTab.value === 'assignment')
      return [
        {
          label: '部门 / 产线',
          key: 'productionDepartmentId',
          type: 'treeSelect',
          options: departmentOptions.value,
          props: { checkStrictly: true, filterable: true, defaultExpandAll: true }
        },
        {
          label: '工作中心',
          key: 'workCenterId',
          type: 'select',
          options: workCenterOptions.value,
          props: {
            clearable: true,
            filterable: true,
            disabled: form.syncWorkCenter,
            placeholder: form.syncWorkCenter ? '保存后自动回填设备编号' : '选择已有工作中心'
          },
          help: form.syncWorkCenter
            ? '新建设备保存后，将自动回填同编码工作中心。'
            : '仅显示所选部门 / 产线下的工作中心。'
        },
        {
          label: '放置地点',
          key: 'locationId',
          type: 'treeSelect',
          options: locationOptions.value,
          props: {
            clearable: true,
            checkStrictly: true,
            filterable: true,
            defaultExpandAll: true
          }
        },
        { label: '设备管理员', key: 'responsibleEmployeeId', type: 'slot' },
        {
          label: '供应商',
          key: 'supplierId',
          type: 'select',
          options: options(references.value.suppliers),
          props: { clearable: true, filterable: true }
        },
        {
          label: '同步更新工作中心',
          key: 'syncWorkCenter',
          type: 'switch',
          props: {
            disabled: Boolean(form.id),
            activeText: '自动生成',
            inactiveText: '手动选择'
          },
          help: form.id
            ? '同步生成策略仅在新建设备时设置，已有设备保留当前工作中心关系。'
            : '开启后保存设备时同步创建同编号、同名称、同所属产线的工作中心。'
        }
      ]
    if (activeTab.value === 'technical')
      return [
        { label: '设备品牌', key: 'equipmentBrand', type: 'input', props: { maxlength: 100 } },
        { label: '设备型号', key: 'model', type: 'input', props: { maxlength: 120 } },
        { label: '制造商', key: 'manufacturer', type: 'input', props: { maxlength: 160 } },
        { label: '出厂序列号', key: 'factoryNo', type: 'input', props: { maxlength: 120 } },
        { label: '固定资产编码', key: 'fixedAssetNo', type: 'input', props: { maxlength: 100 } },
        {
          label: '出厂日期',
          key: 'manufactureDate',
          type: 'date',
          props: { valueFormat: 'YYYY-MM-DD' }
        },
        {
          label: '安装日期',
          key: 'installationDate',
          type: 'date',
          props: { valueFormat: 'YYYY-MM-DD' }
        },
        {
          label: '安装验收日期',
          key: 'acceptanceDate',
          type: 'date',
          props: { valueFormat: 'YYYY-MM-DD' }
        },
        { label: '启用日期', key: 'enableDate', type: 'date', props: { valueFormat: 'YYYY-MM-DD' } }
      ]
    if (activeTab.value === 'connection')
      return [
        {
          label: '智能三色灯卡号',
          key: 'trafficLightCardNo',
          type: 'input',
          props: { maxlength: 100 }
        },
        { label: '安灯盒子', key: 'andonBoxNo', type: 'input', props: { maxlength: 100 } },
        {
          label: '脉冲间隔（秒）',
          key: 'pulseIntervalSeconds',
          type: 'number',
          props: { min: 1, max: 86400, precision: 0, class: '!w-full' }
        },
        {
          label: '标准利用率（%）',
          key: 'standardUtilization',
          type: 'number',
          props: { min: 0, max: 100, precision: 2, class: '!w-full' }
        }
      ]
    return [
      {
        label: '运行状态',
        key: 'operationStatus',
        type: 'select',
        options: getDictMap.value.mdmEquipmentOperationStatus ?? []
      },
      {
        label: '显示顺序',
        key: 'sort',
        type: 'number',
        props: { min: 0, max: 999999, precision: 0, class: '!w-full' }
      },
      {
        label: '设备概要',
        key: 'remark',
        type: 'input',
        span: 24,
        props: { type: 'textarea', rows: 4, maxlength: 1000, showWordLimit: true, resize: 'none' }
      }
    ]
  })
  void Promise.all(
    ['commonEnabledStatus', 'mdmEquipmentOperationStatus'].map((code) =>
      userStore.ensureDictLoaded(code)
    )
  )

  const rules: FormRules<Record<string, unknown>> = {
    tenantId: [{ required: true, message: '请选择目标租户', trigger: 'change' }],
    equipmentName: [{ required: true, message: '请输入设备名称', trigger: 'blur' }],
    categoryId: [{ required: true, message: '请选择设备分类', trigger: 'change' }],
    productionDepartmentId: [{ required: true, message: '请选择部门或产线', trigger: 'change' }]
  }

  const equipmentInputKeys = [
    'tenantId',
    'categoryId',
    'productionDepartmentId',
    'locationId',
    'workCenterId',
    'responsibleEmployeeId',
    'supplierId',
    'equipmentCode',
    'equipmentName',
    'photoUrl',
    'equipmentBrand',
    'model',
    'manufacturer',
    'factoryNo',
    'fixedAssetNo',
    'manufactureDate',
    'installationDate',
    'acceptanceDate',
    'enableDate',
    'trafficLightCardNo',
    'andonBoxNo',
    'pulseIntervalSeconds',
    'standardUtilization',
    'syncWorkCenter',
    'operationStatus',
    'status',
    'remark',
    'sort'
  ] as const satisfies readonly (keyof ProductionEquipmentInput)[]

  const buildWriteInput = (): ProductionEquipmentInput => cloneDeep(pick(form, equipmentInputKeys))

  const handleSubmit = async (): Promise<boolean> => {
    try {
      activeTab.value = 'identity'
      await nextTick()
      await formRef.value?.validate()
      if (!form.productionDepartmentId) {
        activeTab.value = 'assignment'
        await nextTick()
        await formRef.value?.validate()
        return false
      }
      await saveProductionEquipment(buildWriteInput(), form.id)
      emit('success')
      return true
    } catch {
      return false
    }
  }

  const handleOpen = async (data: EquipmentDialogOpenData): Promise<void> => {
    Object.assign(form, initialForm())
    references.value = data.references
    tenantOptions.value = data.tenantOptions
    editingRow.value = data.row
    activeTab.value = 'identity'
    if (data.row) Object.assign(form, cloneDeep(data.row))
    else
      form.tenantId =
        data.targetTenantId || (data.tenantOptions.length === 1 ? data.tenantOptions[0].value : '')
    if (data.copy) {
      form.id = undefined
      form.equipmentCode = ''
      form.equipmentName = `${form.equipmentName}（副本）`
    }
    await dialogRef.value?.handleOpen(data, {
      title: `${data.copy ? '复制' : data.row ? '编辑' : '新增'}生产设备`,
      subtitle: '统一生产归属、技术身份与现场接入信息',
      confirmText: '保存设备',
      contentMaxHeight: '74vh',
      onConfirm: handleSubmit,
      onOpen: () => formRef.value?.clearValidate()
    })
  }

  watch(
    () => form.productionDepartmentId,
    () => {
      if (!workCenterOptions.value.some((item) => item.value === form.workCenterId))
        form.workCenterId = null
    }
  )
  watch(
    () => form.syncWorkCenter,
    (enabled) => {
      if (enabled && !form.id) form.workCenterId = null
    }
  )
  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .equipment-dialog {
    display: grid;
    gap: var(--art-space-3);
    min-width: 0;

    &__identity {
      display: grid;
      grid-template-columns: 48px minmax(0, 1fr) auto;
      gap: var(--art-space-3);
      align-items: center;
      padding: var(--art-space-3) var(--art-space-4);
      background: color-mix(in srgb, var(--theme-color) 7%, var(--el-bg-color));
      border: 1px solid color-mix(in srgb, var(--theme-color) 15%, var(--el-border-color-lighter));
      border-radius: var(--el-border-radius-base);

      > span:first-child {
        display: grid;
        place-items: center;
        width: 48px;
        height: 48px;
        font-size: 21px;
        color: var(--theme-color);
        background: var(--el-bg-color);
        border-radius: var(--el-border-radius-base);
      }

      > div:nth-child(2) {
        min-width: 0;

        small,
        strong,
        p {
          display: block;
          margin: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        small {
          font-size: 9px;
          font-weight: 700;
          color: var(--theme-color);
          letter-spacing: 0.1em;
        }

        strong {
          margin-top: 2px;
          font-size: 15px;
        }

        p {
          margin-top: 2px;
          font-family: var(--art-font-family-mono, Consolas, monospace);
          font-size: 11px;
          color: var(--el-text-color-secondary);
        }
      }
    }

    &__status {
      display: inline-flex;
      align-items: center;
      justify-content: flex-end;
      min-width: 48px;

      :deep(.el-tag) {
        width: auto;
        height: 24px;
        padding: 0 9px;
        font-size: 12px;
        line-height: 22px;
      }
    }

    &__tabs {
      min-width: 0;

      :deep(.el-tabs__content) {
        display: none;
      }

      :deep(.el-tabs__header) {
        margin: 0;
      }

      :deep(.el-tabs__nav-wrap) {
        padding-inline: var(--art-space-2);
      }
    }

    &__tab-label {
      display: inline-flex;
      gap: var(--art-space-2);
      align-items: center;
    }

    &__panel {
      min-width: 0;
      padding: var(--art-space-4);
      background: color-mix(in srgb, var(--el-fill-color-light) 45%, var(--el-bg-color));
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--el-border-radius-base);

      > header {
        display: flex;
        gap: var(--art-space-4);
        align-items: flex-start;
        justify-content: space-between;
        padding-bottom: var(--art-space-3);
        margin-bottom: var(--art-space-4);
        border-bottom: 1px solid var(--el-border-color-lighter);

        > div {
          display: flex;
          gap: var(--art-space-3);
          align-items: center;
          min-width: 0;

          > span {
            display: grid;
            flex: none;
            place-items: center;
            width: 34px;
            height: 34px;
            color: var(--theme-color);
            background: color-mix(in srgb, var(--theme-color) 9%, var(--el-bg-color));
            border-radius: var(--el-border-radius-base);
          }

          strong,
          small {
            display: block;
          }

          strong {
            font-size: var(--art-font-size-section-title);
          }

          small {
            margin-top: 2px;
            font-size: 11px;
            color: var(--el-text-color-secondary);
          }
        }

        > span {
          flex: none;
          padding-top: 3px;
          font-size: 11px;
          color: var(--el-text-color-secondary);
        }
      }

      :deep(.equipment-dialog__form) {
        padding-top: 0;
      }
    }
  }

  @media (width <= 620px) {
    .equipment-dialog__identity {
      grid-template-columns: 42px minmax(0, 1fr);

      > span:first-child {
        width: 42px;
        height: 42px;
      }
    }

    .equipment-dialog__status {
      grid-column: 1 / -1;
      justify-self: start;
    }

    .equipment-dialog__panel {
      padding: var(--art-space-3);

      > header > span {
        display: none;
      }
    }
  }
</style>

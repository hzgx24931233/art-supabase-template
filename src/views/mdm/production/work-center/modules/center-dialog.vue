<template>
  <ArtDialog
    ref="dialogRef"
    size="xl"
    show-fullscreen-button
    @fullscreen-change="dialogFullscreen = $event"
  >
    <div class="center-dialog" :class="{ 'is-fullscreen': dialogFullscreen }">
      <ElAlert v-if="form.error" :title="form.error" type="error" :closable="false" show-icon />
      <ElTabs v-model="form.tab" stretch>
        <ElTabPane label="基本资料" name="基本资料">
          <ArtSectionCard
            title="工作中心资料"
            subtitle="维护生产资源身份、所属组织与默认人员安排。"
            preserve-content-structure
          >
            <ArtDescriptions
              v-if="form.readonly"
              :data="basicDisplay"
              :items="basicDescriptions"
              :columns="2"
            />
            <ArtForm
              v-else
              ref="formRef"
              v-model="form.model"
              :items="basicItems"
              :rules="rules"
              :span="12"
              label-position="top"
              :show-reset="false"
              :show-submit="false"
            >
              <template #mainCenterId
                ><ArtTableSingleSelect
                  :model-value="form.model.mainCenterId || undefined"
                  @update:model-value="
                    form.model.mainCenterId = $event == null ? null : String($event)
                  "
                  :selected-data="form.mainSelection"
                  :api-fn="fetchCenters"
                  :columns="[
                    { prop: 'code', label: '工作中心', minWidth: 150 },
                    { prop: 'name', label: '名称', minWidth: 160 }
                  ]"
                  label-key="code"
                  placeholder="本工作中心（默认）"
                  :disabled-key="disabledCenter"
              /></template>
              <template #operationControlCodeId
                ><ArtTableSingleSelect
                  :model-value="form.model.operationControlCodeId || undefined"
                  @update:model-value="
                    form.model.operationControlCodeId = $event == null ? null : String($event)
                  "
                  :selected-data="form.controlCodeSelection"
                  :api-fn="fetchControlCodes"
                  :columns="[
                    { prop: 'code', label: '控制码', minWidth: 140 },
                    { prop: 'name', label: '名称', minWidth: 220 }
                  ]"
                  label-key="name"
                  title="选择工序控制码"
                  subtitle="来源：工艺主数据 · 工序控制码"
                  search-placeholder="控制码 / 名称"
                  placeholder="请选择工序控制码"
                  :disabled="!referenceTenantId"
              /></template>
              <template #personIds
                ><ArtEmployeeSelect
                  multiple
                  v-model:model-values="form.model.personIds"
                  v-model:selected-data="form.people"
                  :api-fn="fetchProductionPersonSelector"
                  :display-fields="['jobTitle', 'employmentStatus']"
                  title="选择生产人员"
                  subtitle="从人员配置选择参与生产的人员"
                  search-placeholder="姓名 / 工号"
              /></template>
            </ArtForm>
          </ArtSectionCard>
        </ElTabPane>
        <ElTabPane label="活动信息" name="活动信息" lazy>
          <ArtSectionCard
            title="活动信息"
            subtitle="维护工作中心的标准活动、计量基数与计划 / 汇报公式。"
            preserve-content-structure
          >
            <ActivityEditor
              ref="activityEditorRef"
              v-model="form.activities"
              :formulas="form.activityFormulas"
              :fullscreen="dialogFullscreen"
              :readonly="form.readonly"
            />
          </ArtSectionCard>
        </ElTabPane>
        <ElTabPane v-for="section in sections" :key="section" :label="section" :name="section" lazy>
          <ArtSectionCard
            :title="section"
            :subtitle="sectionMeta[section].description"
            preserve-content-structure
          >
            <template v-if="section === '自动化' && !form.readonly" #actions>
              <ElButton type="primary" @click="configureAutomation">
                <template #icon><ArtSvgIcon icon="ri:settings-3-line" /></template>
                配置自动化
              </ElButton>
            </template>
            <div class="center-dialog__policy-intro">
              <span aria-hidden="true"><ArtSvgIcon :icon="sectionMeta[section].icon" /></span>
              <p>{{ sectionMeta[section].hint }}</p>
            </div>
            <PolicyEditor
              v-model="form.model.policy"
              :section="section"
              :readonly="form.readonly || section === '自动化'"
            />
          </ArtSectionCard>
        </ElTabPane>
      </ElTabs>
    </div>
  </ArtDialog>
  <ArtDialog ref="automationDialog" size="md">
    <ElAlert
      title="设置班次触发的自动报工与自动开始规则；应用后仍需保存工作中心才会生效。"
      type="info"
      :closable="false"
      show-icon
    />
    <PolicyEditor v-model="automationPolicy" section="自动化" />
  </ArtDialog>
</template>
<script setup lang="ts">
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import ArtTableSingleSelect from '@/components/core/forms/art-data-select/table-single.vue'
  import { ref, reactive, computed, watch } from 'vue'
  import { cloneDeep, pick } from 'lodash-es'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import type {
    DataSelectFetchParams,
    DataSelectRecord
  } from '@/components/core/forms/art-data-select/types'
  import type { EmployeeIntegrationItem } from '@/api/integration/employees'
  import { useUserStore } from '@/store/modules/user'
  import {
    saveWorkCenter,
    fetchWorkCenterActivities,
    fetchWorkCenterReferenceOptions,
    fetchAvailableMainCenters,
    fetchCenterDefaults,
    fetchProductionPersonSelector,
    fetchCenterPeople,
    type WorkCenter,
    type WorkCenterInput,
    type WorkCenterActivityInput,
    type WorkCenterReference,
    type ProductionDepartment
  } from '@/api/mdm'
  import { departmentOptions } from '../../modules/production-model'
  import {
    centerPolicyDictionaryCodes,
    createCenterPolicy,
    createWorkCenter
  } from './center-policy'
  import PolicyEditor from './policy-editor.vue'
  import ActivityEditor from './activity-editor.vue'
  interface OpenData {
    row?: WorkCenter
    mode: 'add' | 'edit' | 'copy' | 'view'
    departments: ProductionDepartment[]
    departmentId?: string
  }
  const emit = defineEmits<{ success: [] }>()
  const user = useUserStore()
  const dialogRef = ref<ArtDialogExpose<OpenData>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const activityEditorRef = ref<InstanceType<typeof ActivityEditor>>()
  const automationDialog = ref<ArtDialogExpose>()
  const automationPolicy = ref(createCenterPolicy())
  const dialogFullscreen = ref(false)
  async function configureAutomation() {
    automationPolicy.value = cloneDeep(form.model.policy)
    await automationDialog.value?.handleOpen(undefined, {
      title: '自动化配置',
      subtitle: '集中维护由班次时间触发的工作中心动作',
      confirmText: '应用配置',
      contentMaxHeight: '60vh',
      onConfirm: () => {
        form.model.policy = cloneDeep(automationPolicy.value)
      }
    })
  }
  const form = reactive({
    model: createWorkCenter(),
    mode: 'add' as OpenData['mode'],
    id: undefined as string | undefined,
    readonly: false,
    tab: '基本资料',
    error: '',
    departments: [] as ProductionDepartment[],
    people: [] as EmployeeIntegrationItem[],
    mainSelection: [] as { id: string; code: string; name: string }[],
    controlCodeSelection: [] as WorkCenterReference[],
    activityFormulas: [] as WorkCenterReference[],
    activities: [] as WorkCenterActivityInput[]
  })
  const defaultsLoadedFor = ref('')
  const sections = ['报工规则', '生产控制', '人员与排程', '自动化'] as const
  const sectionMeta = {
    报工规则: {
      icon: 'ri:file-list-3-line',
      description: '控制报工方式、数量校验、时限与批次处理。',
      hint: '这些规则决定现场人员如何提交产量、批次以及超时数据。'
    },
    生产控制: {
      icon: 'ri:settings-5-line',
      description: '定义投料、检验、完工与异常场景的执行策略。',
      hint: '配置将作为该工作中心执行生产任务时的默认控制条件。'
    },
    人员与排程: {
      icon: 'ri:team-line',
      description: '约束人员参与方式、排程与跨班次处理。',
      hint: '人员名单仍在基本资料中维护，此处只设置参与生产与排程的规则。'
    },
    自动化: {
      icon: 'ri:flashlight-line',
      description: '根据班次开始或结束自动触发报工与开始动作。',
      hint: '自动化采用独立编辑，避免在查看策略时误改触发条件。'
    }
  } as const
  const editorDictionaryCodes = [
    'mdmCenter_personnelMode',
    ...centerPolicyDictionaryCodes,
    'mdmWorkCenterActivityName',
    'mdmActivityType',
    'mdmWorkCenterMaintenanceRule',
    'mdmActivityUnit',
    'mdmWorkCenterCapacityMode',
    'mdmWorkCenterOperationUnit',
    'commonBoolean'
  ]
  const rules = {
    code: [{ required: true, message: '请输入工作中心编号', trigger: 'blur' }],
    name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
    departmentId: [{ required: true, message: '请选择所属产线', trigger: 'change' }]
  }
  const basicItems = computed<FormItem[]>(() => [
    { key: 'code', label: '工作中心', type: 'input', props: { maxlength: 80 } },
    { key: 'name', label: '名称', type: 'input', props: { maxlength: 120 } },
    {
      key: 'departmentId',
      label: '所属产线',
      type: 'treeSelect',
      options: departmentOptions(form.departments),
      props: { checkStrictly: true, filterable: true }
    },
    {
      key: 'mainCenterId',
      label: '主工序位',
      help: '默认以本工作中心为核心；多设备产线可选择未被其他中心绑定的工作中心。'
    },
    {
      key: 'operationControlCodeId',
      label: '工序控制码',
      help: '来源于工艺主数据中的工序控制码。'
    },
    {
      key: 'personnelMode',
      label: '人员安排',
      type: 'select',
      options: user.getDictMap.mdmCenter_personnelMode ?? []
    },
    {
      key: 'headcount',
      label: '指定人数',
      type: 'number',
      hidden: form.model.personnelMode !== '指定人数',
      props: { min: 1, max: 10000, precision: 0 }
    },
    {
      key: 'personIds',
      label: '指定人员',
      span: 24,
      hidden: form.model.personnelMode !== '指定人员'
    },
    { key: 'capacity', label: '产能与排程', type: 'divider', span: 24 },
    {
      key: 'capacityMode',
      label: '产能模式',
      type: 'select',
      options: user.getDictMap.mdmWorkCenterCapacityMode ?? [],
      help: '有限产能会避让同一工作中心已有排程。'
    },
    {
      key: 'dailyCapacityMinutes',
      label: '日可用分钟',
      type: 'number',
      props: { min: 1, max: 1440, precision: 0 }
    },
    {
      key: 'efficiencyPercent',
      label: '效率(%)',
      type: 'number',
      props: { min: 1, max: 200, precision: 2 }
    },
    {
      key: 'utilizationPercent',
      label: '利用率(%)',
      type: 'number',
      props: { min: 1, max: 100, precision: 2 }
    },
    {
      key: 'parallelCapacity',
      label: '并行台数',
      type: 'number',
      props: { min: 1, max: 999, precision: 0 }
    },
    {
      key: 'queueMinutes',
      label: '默认排队时长(分钟)',
      type: 'number',
      props: { min: 0, precision: 2 }
    },
    { key: 'sort', label: '排序', type: 'number', props: { min: 0, precision: 0 } },
    {
      key: 'remark',
      label: '备注',
      type: 'textarea',
      span: 24,
      props: { rows: 2, maxlength: 1000 }
    }
  ])
  const basicDescriptions = [
    { key: 'code', label: '工作中心' },
    { key: 'name', label: '名称' },
    { key: 'department', label: '所属产线' },
    { key: 'operationControlCode', label: '工序控制码' },
    { key: 'main', label: '主工序位' },
    { key: 'staff', label: '人员安排' },
    { key: 'capacity', label: '标准产能' },
    { key: 'remark', label: '备注' }
  ].map((item) => ({ ...item, field: item.key }))
  const basicDisplay = computed(() => ({
    ...form.model,
    department: form.departments.find((d) => d.id === form.model.departmentId)?.name,
    operationControlCode:
      form.controlCodeSelection[0]?.name && form.controlCodeSelection[0]?.code
        ? `${form.controlCodeSelection[0].name} · ${form.controlCodeSelection[0].code}`
        : '—',
    main: form.mainSelection[0]?.code || form.model.code,
    staff:
      form.model.personnelMode === '指定人数'
        ? `指定人数 ${form.model.headcount} 人`
        : form.people.map((p) => `${p.employeeName} · ${p.employeeNo}`).join('、'),
    capacity:
      `${form.model.capacityMode === 'finite' ? '有限' : '无限'} · ` +
      `${form.model.dailyCapacityMinutes} 分钟/日 · ${form.model.parallelCapacity} 台并行`
  }))
  const disabledCenter = (r: DataSelectRecord) => r.id === form.id
  const fetchCenters = (p: DataSelectFetchParams) =>
    fetchAvailableMainCenters(p.keyword, p.page, p.pageSize, form.id)
  const referenceTenantId = computed(
    () =>
      form.departments.find((department) => department.id === form.model.departmentId)?.tenantId ||
      ''
  )
  const fetchControlCodes = (p: DataSelectFetchParams) =>
    fetchWorkCenterReferenceOptions(
      'control_code',
      referenceTenantId.value,
      p.keyword,
      p.page,
      p.pageSize,
      form.id
    )
  async function loadActivityFormulas() {
    if (!referenceTenantId.value) {
      form.activityFormulas = []
      return
    }
    const result = await fetchWorkCenterReferenceOptions(
      'activity_formula',
      referenceTenantId.value,
      '',
      1,
      1000,
      form.id
    )
    form.activityFormulas = result.data
  }
  async function handleOpen(data: OpenData) {
    dialogFullscreen.value = false
    Object.assign(form, {
      mode: data.mode,
      model: data.row
        ? (cloneDeep(pick(data.row, Object.keys(createWorkCenter()))) as WorkCenterInput)
        : createWorkCenter(),
      id: data.mode === 'edit' ? data.row?.id : undefined,
      readonly: data.mode === 'view',
      tab: '基本资料',
      error: '',
      departments: data.departments,
      people: [],
      mainSelection: data.row?.mainCenter ? [data.row.mainCenter] : [],
      controlCodeSelection: data.row?.operationControlCode ? [data.row.operationControlCode] : [],
      activityFormulas: [],
      activities: []
    })
    if (data.mode === 'copy') {
      Object.assign(form.model, { code: '', name: '', mainCenterId: null })
      form.mainSelection = []
    }
    if (!data.row) form.model.departmentId = data.departmentId || ''
    defaultsLoadedFor.value = referenceTenantId.value
    await dialogRef.value?.handleOpen(data, {
      title: {
        add: '新增工作中心',
        edit: '编辑工作中心',
        copy: '复制工作中心',
        view: '工作中心详情'
      }[data.mode],
      subtitle: form.readonly
        ? '查看生产资源资料和各环节执行策略'
        : '按页签维护基础资料、活动、报工、生产、排程与自动化规则',
      confirmText: '保存工作中心',
      cancelText: form.readonly ? '关闭' : '取消',
      showConfirmButton: !form.readonly,
      contentMaxHeight: '68vh',
      loading: true,
      onOpen: async (_data, api) => {
        try {
          await Promise.all(editorDictionaryCodes.map((code) => user.ensureDictLoaded(code)))
          const [defaults, people, activities] = await Promise.all([
            data.mode === 'add'
              ? referenceTenantId.value
                ? fetchCenterDefaults(referenceTenantId.value)
                : Promise.resolve(null)
              : Promise.resolve(null),
            form.model.personIds.length
              ? fetchCenterPeople(form.model.personIds)
              : Promise.resolve([]),
            data.row ? fetchWorkCenterActivities(data.row.id) : Promise.resolve([])
          ])
          if (defaults) form.model.policy = cloneDeep(defaults)
          form.people = people
          form.activities = activities.map((activity, index) => ({
            ...pick(activity, [
              'activityName',
              'activityType',
              'maintenanceRule',
              'baseQuantity',
              'activityUnit',
              'planFormulaId',
              'reportFormulaId',
              'backflush',
              'remark',
              'sort'
            ]),
            sort: index
          })) as WorkCenterActivityInput[]
          await loadActivityFormulas()
        } catch {
          form.error = '配置加载失败，请关闭后重试'
        } finally {
          api.setLoading(false)
        }
      },
      onConfirm: async () => {
        if (form.error) return false
        if (form.model.personnelMode === '指定人员' && !form.model.personIds.length) {
          form.error = '请至少选择一名生产人员'
          form.tab = '基本资料'
          return false
        }
        try {
          await formRef.value?.validate()
          const activityValidation = await activityEditorRef.value?.validate()
          if (activityValidation?.valid === false) {
            form.tab = '活动信息'
            return false
          }
          const payload: WorkCenterInput = {
            ...cloneDeep(form.model),
            code: form.model.code.trim(),
            name: form.model.name.trim(),
            mainCenterId: form.model.mainCenterId || null,
            personIds: form.model.personnelMode === '指定人员' ? form.model.personIds : []
          }
          const activities = form.activities.map((activity, index) => ({
            ...cloneDeep(activity),
            remark: activity.remark.trim(),
            sort: index
          }))
          await saveWorkCenter(payload, activities, form.id)
          emit('success')
        } catch {
          return false
        }
      }
    })
  }
  watch(
    () => form.model.personIds,
    () => {
      if (form.error === '请至少选择一名生产人员') form.error = ''
    },
    { deep: true }
  )
  watch(referenceTenantId, (tenantId, previousTenantId) => {
    if (!tenantId || tenantId === previousTenantId) return
    if (previousTenantId) {
      form.model.operationControlCodeId = null
      form.controlCodeSelection = []
      form.activities.forEach((activity) => {
        activity.planFormulaId = null
        activity.reportFormulaId = null
      })
    }
    void loadActivityFormulas().catch(() => {
      form.error = '活动公式加载失败，请重试'
    })
    if (form.mode === 'add' && tenantId !== defaultsLoadedFor.value) {
      defaultsLoadedFor.value = tenantId
      void fetchCenterDefaults(tenantId)
        .then((defaults) => {
          if (referenceTenantId.value === tenantId)
            form.model.policy = cloneDeep(defaults || createCenterPolicy())
        })
        .catch(() => {
          form.error = '工作中心默认配置加载失败，请重试'
        })
    }
  })
  defineExpose({ handleOpen })
</script>
<style scoped lang="scss">
  .center-dialog {
    display: grid;
    gap: var(--art-space-3);
    min-width: 0;

    &.is-fullscreen {
      min-height: calc(100vh - 144px);
    }

    :deep(.el-tabs__header) {
      margin-bottom: 16px;
    }

    :deep(.art-section-card__body) {
      min-height: 0;
    }

    &__policy-intro {
      display: flex;
      gap: 10px;
      align-items: center;
      padding: 10px 12px;
      margin-bottom: 16px;
      color: var(--el-text-color-secondary);
      background: var(--el-fill-color-light);
      border-radius: var(--el-border-radius-base);

      > span {
        display: grid;
        flex: none;
        place-items: center;
        width: 32px;
        height: 32px;
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 10%, var(--el-bg-color));
        border-radius: var(--el-border-radius-base);
      }

      p {
        margin: 0;
        font-size: 13px;
        line-height: 1.6;
      }
    }
  }
</style>

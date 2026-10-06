<template>
  <ArtDialog ref="dialogRef" size="xl">
    <div class="shift-schedule-dialog">
      <div class="shift-schedule-dialog__scope">
        <span aria-hidden="true"><ArtSvgIcon icon="ri:node-tree" /></span>
        <div>
          <small>排班范围</small>
          <strong>{{ state.departmentName }}</strong>
          <p>{{ state.departmentCode || '当前部门 / 产线' }}</p>
        </div>
      </div>

      <template v-if="state.mode === 'view'">
        <ArtDescriptions :data="detailData" :items="detailItems" :columns="2" border />
        <ArtSectionCard
          title="班组人员"
          :subtitle="`共 ${form.members.length} 人，人员来源于 MDM 人员配置。`"
          preserve-content-structure
        >
          <div class="shift-schedule-dialog__members">
            <div v-for="member in form.members" :key="String(member.id)">
              <span aria-hidden="true"><ArtSvgIcon icon="ri:user-3-line" /></span>
              <span>
                <strong>{{ member.employeeName }}</strong>
                <small
                  >{{ member.employeeNo
                  }}{{ member.jobTitle ? ` · ${member.jobTitle}` : '' }}</small
                >
              </span>
            </div>
          </div>
        </ArtSectionCard>
      </template>

      <ArtForm
        v-else
        ref="formRef"
        v-model="form.model"
        :items="formItems"
        :rules="rules"
        :show-submit="false"
        :show-reset="false"
        :span="12"
        label-position="top"
      >
        <template #patternId>
          <ElSelect
            v-model="form.model.patternId"
            placeholder="请选择工厂日历中的轮班模式"
            :loading="state.patternLoading"
            class="w-full!"
            @change="handlePatternChange"
          >
            <ElOption
              v-for="pattern in state.patterns"
              :key="pattern.id"
              :value="pattern.id"
              :label="pattern.name"
            >
              <div class="shift-schedule-dialog__pattern-option">
                <i :style="{ background: pattern.color }" />
                <span>{{ pattern.name }}</span>
                <small>{{ pattern.shifts.length }} 个班次</small>
              </div>
            </ElOption>
          </ElSelect>
        </template>
        <template #shiftIndex>
          <ElSelect
            v-model="form.model.shiftIndex"
            placeholder="请先选择轮班模式"
            :disabled="!selectedPattern"
            class="w-full!"
          >
            <ElOption
              v-for="(shift, index) in selectedPattern?.shifts || []"
              :key="`${index}-${shift.name}`"
              :value="index + 1"
              :label="shift.name"
            >
              <div class="shift-schedule-dialog__shift-option">
                <span>{{ shift.name }}</span>
                <small>{{ shift.startTime }} — {{ shift.endTime }}</small>
              </div>
            </ElOption>
          </ElSelect>
        </template>
        <template #personnelIds>
          <ArtTableMultipleSelect
            :model-value="form.model.personnelIds"
            :selected-data="form.members"
            :api-fn="fetchPeople"
            :columns="personnelColumns"
            row-key="id"
            label-key="employeeName"
            description-key="employeeNo"
            title="添加班组人员"
            :subtitle="`仅显示“${state.departmentName}”及下级组织中的启用人员配置`"
            search-placeholder="姓名 / 工号 / 岗位"
            placeholder="添加人员"
            empty-text="当前范围暂无可选人员"
            empty-description="请先在“人员配置”中维护人员，或调整左侧部门 / 产线。"
            :max-tag-count="4"
            @update:model-value="updatePersonnelIds"
            @update:selected-data="updateMembers"
          />
        </template>
      </ArtForm>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { computed, reactive, ref } from 'vue'
  import dayjs from 'dayjs'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtTableMultipleSelect from '@/components/core/forms/art-data-select/table-multiple.vue'
  import type {
    DataSelectColumn,
    DataSelectFetchParams,
    DataSelectModelValue,
    DataSelectRecord
  } from '@/components/core/forms/art-data-select/types'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import { useUserStore } from '@/store/modules/user'
  import {
    fetchShiftSchedulePatterns,
    fetchShiftSchedulePersonnel,
    saveShiftSchedule,
    type ProductionDepartment,
    type ShiftPattern,
    type ShiftScheduleDateMode,
    type ShiftScheduleRecord
  } from '@/api/mdm'
  import {
    ALL_SHIFT_WEEKDAYS,
    SHIFT_WEEKDAY_OPTIONS,
    shiftScheduleParticipationText
  } from '../../modules/shift-schedule-policy'

  interface OpenData {
    mode: 'add' | 'edit' | 'view'
    department: ProductionDepartment
    row?: ShiftScheduleRecord
    initialDate?: string
  }

  interface FormModel {
    patternId?: string
    shiftIndex?: number
    dateMode: ShiftScheduleDateMode
    startDate: string
    dateRange: string[]
    weekdays: number[]
    includeStatutoryHolidays: boolean
    personnelIds: string[]
    note: string
  }

  const emit = defineEmits<{ success: [] }>()
  const userStore = useUserStore()
  void userStore.ensureDictLoaded('mdmShiftScheduleDateMode')
  const dialogRef = ref<ArtDialogExpose<OpenData>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const state = reactive({
    mode: 'add' as OpenData['mode'],
    departmentId: '',
    departmentName: '',
    departmentCode: '',
    patterns: [] as ShiftPattern[],
    patternLoading: false,
    rowId: undefined as string | undefined
  })
  const form = reactive({
    model: createInitialModel(),
    members: [] as DataSelectRecord[]
  })

  function createInitialModel(): FormModel {
    return {
      patternId: undefined,
      shiftIndex: undefined,
      dateMode: 'single',
      startDate: dayjs().format('YYYY-MM-DD'),
      dateRange: [],
      weekdays: [...ALL_SHIFT_WEEKDAYS],
      includeStatutoryHolidays: false,
      personnelIds: [],
      note: ''
    }
  }

  const selectedPattern = computed(() =>
    state.patterns.find((pattern) => pattern.id === form.model.patternId)
  )
  const selectedShift = computed(() =>
    form.model.shiftIndex ? selectedPattern.value?.shifts[form.model.shiftIndex - 1] : undefined
  )
  const effectiveDateText = computed(() => {
    if (form.model.dateMode === 'single') return form.model.startDate || '—'
    if (form.model.dateMode === 'ongoing') return `${form.model.startDate || '—'} 起长期有效`
    return form.model.dateRange.length === 2
      ? `${form.model.dateRange[0]} 至 ${form.model.dateRange[1]}`
      : '—'
  })
  const detailData = computed(() => ({
    department: state.departmentName,
    pattern: selectedPattern.value?.name || '—',
    shift: selectedShift.value
      ? `${selectedShift.value.name} · ${selectedShift.value.startTime}—${selectedShift.value.endTime}`
      : '—',
    effectiveDate: effectiveDateText.value,
    participation: shiftScheduleParticipationText(form.model),
    holidayPolicy: form.model.includeStatutoryHolidays ? '参与排班' : '不参与排班',
    memberCount: `${form.members.length} 人`,
    note: form.model.note || '—'
  }))
  const detailItems: ArtDescriptionItem[] = [
    { key: 'department', field: 'department', label: '部门 / 产线' },
    { key: 'pattern', field: 'pattern', label: '轮班模式' },
    { key: 'shift', field: 'shift', label: '班次' },
    { key: 'effectiveDate', field: 'effectiveDate', label: '排班日期' },
    { key: 'participation', field: 'participation', label: '参与星期' },
    { key: 'holidayPolicy', field: 'holidayPolicy', label: '法定假日' },
    { key: 'memberCount', field: 'memberCount', label: '班组人数' },
    { key: 'note', field: 'note', label: '备注' }
  ]
  const formItems = computed<FormItem[]>(() => [
    {
      key: 'source',
      label: '班次安排',
      type: 'divider',
      span: 24,
      description: '轮班模式与班次均来自当前部门 / 产线的工厂日历。'
    },
    { key: 'patternId', label: '轮班模式', help: '数据来源：工厂日历 · 轮班模式' },
    { key: 'shiftIndex', label: '班次', help: '选择该轮班模式中的具体班次' },
    {
      key: 'date',
      label: '排班日期',
      type: 'divider',
      span: 24,
      description: '三种时间维度互斥，长期有效的排班可随时编辑或删除。'
    },
    {
      key: 'dateMode',
      label: '有效方式',
      type: 'segment',
      span: 24,
      options: userStore.getDictMap.mdmShiftScheduleDateMode ?? []
    },
    {
      key: 'startDate',
      label: '日期',
      type: 'date',
      span: 24,
      hidden: (model) => model.dateMode === 'range',
      props: { type: 'date', valueFormat: 'YYYY-MM-DD', placeholder: '选择日期' }
    },
    {
      key: 'dateRange',
      label: '有效期间',
      type: 'date',
      span: 24,
      hidden: (model) => model.dateMode !== 'range',
      props: {
        type: 'daterange',
        valueFormat: 'YYYY-MM-DD',
        startPlaceholder: '开始日期',
        endPlaceholder: '结束日期'
      }
    },
    {
      key: 'includeStatutoryHolidays',
      label: '法定假日',
      type: 'checkbox',
      span: 24,
      slots: { default: () => '法定假日参与排班' },
      help: '勾选后，所选星期遇到法定假日仍安排该班次；不勾选则自动排除。'
    },
    {
      key: 'weekdays',
      label: '参与星期',
      type: 'checkboxGroup',
      span: 24,
      options: SHIFT_WEEKDAY_OPTIONS.map((option) => ({ ...option })),
      help: '只在勾选的星期生成排班；未勾选的星期不会出现在排班日历和工厂日历。'
    },
    {
      key: 'people',
      label: '班组人员',
      type: 'divider',
      span: 24,
      description: '支持跨分页多选；仅保存人员配置 ID，不复制人员隐私资料。'
    },
    { key: 'personnelIds', label: '添加人员', span: 24 },
    {
      key: 'note',
      label: '备注',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 3, maxlength: 300, showWordLimit: true }
    }
  ])
  const rules = {
    patternId: [{ required: true, message: '请选择轮班模式', trigger: 'change' }],
    shiftIndex: [{ required: true, message: '请选择班次', trigger: 'change' }],
    startDate: [
      {
        validator: (_rule: unknown, value: string) =>
          form.model.dateMode === 'range' || Boolean(value),
        message: '请选择排班日期',
        trigger: 'change'
      }
    ],
    dateRange: [
      {
        validator: (_rule: unknown, value: string[]) =>
          form.model.dateMode !== 'range' || value?.length === 2,
        message: '请选择完整的有效期间',
        trigger: 'change'
      }
    ],
    weekdays: [
      {
        type: 'array',
        required: true,
        min: 1,
        message: '请至少选择一个参与排班的星期',
        trigger: 'change'
      }
    ],
    personnelIds: [
      {
        type: 'array',
        required: true,
        min: 1,
        message: '请至少添加一名班组人员',
        trigger: 'change'
      }
    ]
  }
  const personnelColumns: DataSelectColumn[] = [
    { prop: 'employeeNo', label: '工号', minWidth: 120 },
    { prop: 'employeeName', label: '姓名', minWidth: 120 },
    {
      prop: 'organization',
      label: '部门 / 产线',
      minWidth: 160,
      formatter: (row) => String(row.organizationName || '—')
    },
    { prop: 'jobTitle', label: '岗位', minWidth: 130 }
  ]

  async function fetchPeople(params: DataSelectFetchParams) {
    return fetchShiftSchedulePersonnel(state.departmentId, {
      keyword: params.keyword,
      from: (params.page - 1) * params.pageSize,
      to: params.page * params.pageSize - 1
    })
  }

  function handlePatternChange(): void {
    form.model.shiftIndex = selectedPattern.value?.shifts.length === 1 ? 1 : undefined
  }

  function updatePersonnelIds(value: DataSelectModelValue): void {
    form.model.personnelIds = Array.isArray(value) ? value.map(String) : []
  }

  function updateMembers(rows: DataSelectRecord[]): void {
    form.members = rows
  }

  function populate(data: OpenData): void {
    const row = data.row
    Object.assign(state, {
      mode: data.mode,
      departmentId: data.department.id,
      departmentName: data.department.name,
      departmentCode: data.department.code,
      rowId: row?.id
    })
    const model = createInitialModel()
    if (data.initialDate) model.startDate = data.initialDate
    if (row) {
      Object.assign(model, {
        patternId: row.patternId,
        shiftIndex: row.shiftIndex,
        dateMode: row.dateMode,
        startDate: row.startDate,
        dateRange: row.endDate ? [row.startDate, row.endDate] : [],
        weekdays: row.weekdays?.length ? [...row.weekdays] : [...ALL_SHIFT_WEEKDAYS],
        includeStatutoryHolidays: row.includeStatutoryHolidays !== false,
        personnelIds: row.members.map((member) => member.id),
        note: row.note
      })
    }
    form.model = model
    form.members = (row?.members || []).map((member) => ({
      ...member,
      organizationName: member.organization?.organizationName || state.departmentName
    }))
  }

  async function loadPatterns(): Promise<void> {
    state.patternLoading = true
    try {
      state.patterns = await fetchShiftSchedulePatterns(state.departmentId)
    } finally {
      state.patternLoading = false
    }
  }

  async function handleSubmit(): Promise<boolean> {
    try {
      await formRef.value?.validate()
      if (!form.model.patternId || !form.model.shiftIndex) return false
      const startDate =
        form.model.dateMode === 'range' ? form.model.dateRange[0] : form.model.startDate
      const endDate =
        form.model.dateMode === 'single'
          ? startDate
          : form.model.dateMode === 'range'
            ? form.model.dateRange[1]
            : null
      await saveShiftSchedule(
        {
          departmentId: state.departmentId,
          patternId: form.model.patternId,
          shiftIndex: form.model.shiftIndex,
          dateMode: form.model.dateMode,
          startDate,
          endDate,
          weekdays: form.model.weekdays,
          includeStatutoryHolidays: form.model.includeStatutoryHolidays,
          note: form.model.note.trim(),
          personnelIds: form.model.personnelIds
        },
        state.rowId
      )
      emit('success')
      return true
    } catch {
      return false
    }
  }

  async function handleOpen(data: OpenData): Promise<void> {
    populate(data)
    await dialogRef.value?.handleOpen(data, {
      title: data.mode === 'add' ? '新增排班' : data.mode === 'edit' ? '编辑排班' : '排班详情',
      subtitle:
        data.mode === 'view' ? '查看班次、有效期与班组人员' : '按轮班模式安排班次与班组人员',
      confirmText: data.mode === 'edit' ? '保存更改' : '创建排班',
      cancelText: data.mode === 'view' ? '关闭' : '取消',
      showConfirmButton: data.mode !== 'view',
      contentMaxHeight: '74vh',
      loading: true,
      onOpen: async (_openData, api) => {
        try {
          await loadPatterns()
        } finally {
          api.setLoading(false)
        }
      },
      onConfirm: handleSubmit
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .shift-schedule-dialog {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;

    &__scope {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr);
      gap: 12px;
      align-items: center;
      padding: 12px 16px;
      background: color-mix(in srgb, var(--theme-color) 7%, var(--art-gray-100));
      border-radius: var(--art-surface-radius);

      > span {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        font-size: 20px;
        color: var(--theme-color);
        background: var(--default-box-color);
        border-radius: var(--art-control-radius);
      }

      div,
      span {
        min-width: 0;
      }

      small,
      strong,
      p {
        display: block;
        margin: 0;
      }

      small,
      p {
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }

      strong {
        margin-block: 2px;
        font-size: 15px;
        color: var(--el-text-color-primary);
      }
    }

    &__pattern-option,
    &__shift-option {
      display: flex;
      gap: 8px;
      align-items: center;

      i {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }

      small {
        margin-left: auto;
        color: var(--el-text-color-secondary);
      }
    }

    &__members {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;

      > div {
        display: grid;
        grid-template-columns: 36px minmax(0, 1fr);
        gap: 10px;
        align-items: center;
        min-width: 0;
        padding: 10px 12px;
        background: var(--art-gray-100);
        border-radius: var(--art-control-radius);

        > span:first-child {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          color: var(--theme-color);
          background: var(--default-box-color);
          border-radius: var(--el-border-radius-base);
        }

        > span:last-child,
        strong,
        small {
          display: block;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        small {
          margin-top: 2px;
          color: var(--el-text-color-secondary);
        }
      }
    }

    :deep(.el-segmented) {
      max-width: 100%;
    }

    @media (width <= 767px) {
      &__members {
        grid-template-columns: 1fr;
      }
    }
  }
</style>

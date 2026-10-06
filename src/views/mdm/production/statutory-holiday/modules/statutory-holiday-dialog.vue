<template>
  <ArtDialog ref="dialogRef" size="md">
    <div class="holiday-dialog">
      <ArtEntitySummary spaced>
        <template #icon><ArtSvgIcon icon="ri:calendar-event-line" /></template>
        <strong>组织假期日历</strong>
        <p>同一安排会同步显示在月历与明细列表中，日期区间包含开始日和结束日。</p>
      </ArtEntitySummary>

      <ArtForm
        ref="formRef"
        v-model="form.model"
        :items="form.items"
        :rules="form.rules"
        :span="12"
        :gutter="24"
        label-position="top"
        :show-reset="false"
        :show-submit="false"
      >
        <template #organizationId>
          <ElTreeSelect
            v-model="form.model.organizationId"
            class="holiday-dialog__full-control"
            :data="organizationTree"
            :props="organizationTreeProps"
            node-key="id"
            value-key="id"
            check-strictly
            filterable
            clearable
            default-expand-all
            placeholder="请选择公司或组织"
          />
        </template>
      </ArtForm>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { computed, reactive, ref, shallowRef, nextTick, type ComputedRef } from 'vue'
  import { storeToRefs } from 'pinia'
  import dayjs from 'dayjs'
  import type { FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, {
    type FormItem,
    type FormItemOption
  } from '@/components/core/forms/art-form/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import {
    saveStatutoryHoliday,
    type StatutoryHoliday,
    type StatutoryHolidaySavePayload
  } from '@/api/mdm'

  type Organization = Api.SystemManage.OrganizationListItem

  export interface StatutoryHolidayDialogOpenData {
    organizations: Organization[]
    row?: StatutoryHoliday
    selectedDate?: string
    defaultOrganizationId?: string
  }

  interface HolidayForm {
    id?: string
    organizationId: string
    holidayType: string
    startDate: string
    endDate: string
    remark: string
  }

  interface FormExpose {
    validate: () => Promise<boolean>
    clearValidate: () => void
  }

  const emit = defineEmits<{ success: [type: 'add' | 'edit'] }>()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const dialogRef = ref<ArtDialogExpose<StatutoryHolidayDialogOpenData>>()
  const formRef = ref<FormExpose>()
  const organizationTree = shallowRef<Organization[]>([])
  const organizationTreeProps = { children: 'children', label: 'organizationName', value: 'id' }

  const initialForm = (date = dayjs().format('YYYY-MM-DD')): HolidayForm => ({
    id: undefined,
    organizationId: '',
    holidayType: '',
    startDate: date,
    endDate: date,
    remark: ''
  })

  const holidayTypeOptions = computed<FormItemOption[]>(() =>
    (getDictMap.value.smisHolidayType ?? []).map((item) => ({
      label: item.label || item.name,
      value: item.value
    }))
  )

  const validateDateRange = (
    _rule: unknown,
    _value: string,
    callback: (error?: Error) => void
  ): void => {
    if (dayjs(form.model.endDate).isBefore(dayjs(form.model.startDate), 'day')) {
      return callback(new Error('结束日期不能早于开始日期'))
    }
    callback()
  }

  const form = reactive<{
    model: HolidayForm
    items: ComputedRef<FormItem[]>
    rules: FormRules<HolidayForm>
  }>({
    model: initialForm(),
    items: computed(() => [
      { label: '公司/组织', key: 'organizationId', type: 'text', span: 24 },
      {
        label: '假期类型',
        key: 'holidayType',
        type: 'select',
        options: holidayTypeOptions.value,
        props: { filterable: true, clearable: true, placeholder: '请选择假期类型' }
      },
      {
        label: '开始日期',
        key: 'startDate',
        type: 'date',
        props: {
          type: 'date',
          valueFormat: 'YYYY-MM-DD',
          format: 'YYYY-MM-DD',
          clearable: false,
          class: '!w-full'
        }
      },
      {
        label: '结束日期',
        key: 'endDate',
        type: 'date',
        props: {
          type: 'date',
          valueFormat: 'YYYY-MM-DD',
          format: 'YYYY-MM-DD',
          clearable: false,
          class: '!w-full',
          disabledDate: (date: Date) => dayjs(date).isBefore(dayjs(form.model.startDate), 'day')
        }
      },
      {
        label: '备注',
        key: 'remark',
        type: 'input',
        span: 24,
        props: {
          type: 'textarea',
          rows: 3,
          maxlength: 500,
          showWordLimit: true,
          resize: 'none',
          placeholder: '可填写放假范围、值班说明或调休安排'
        }
      }
    ]),
    rules: {
      organizationId: [{ required: true, message: '请选择公司或组织', trigger: 'change' }],
      holidayType: [{ required: true, message: '请选择假期类型', trigger: 'change' }],
      startDate: [{ required: true, message: '请选择开始日期', trigger: 'change' }],
      endDate: [
        { required: true, message: '请选择结束日期', trigger: 'change' },
        { validator: validateDateRange, trigger: 'change' }
      ],
      remark: [{ max: 500, message: '备注不能超过 500 个字符', trigger: 'blur' }]
    }
  })

  const resetForm = async (date?: string): Promise<void> => {
    Object.assign(form.model, initialForm(date))
    await nextTick()
    formRef.value?.clearValidate()
  }

  const handleSubmit = async (): Promise<boolean> => {
    try {
      await formRef.value?.validate()
      const payload: StatutoryHolidaySavePayload = {
        id: form.model.id,
        organizationId: form.model.organizationId,
        holidayType: form.model.holidayType,
        startDate: form.model.startDate,
        endDate: form.model.endDate,
        remark: form.model.remark.trim()
      }
      await saveStatutoryHoliday(payload)
      emit('success', form.model.id ? 'edit' : 'add')
      return true
    } catch {
      return false
    }
  }

  const handleOpen = async (data: StatutoryHolidayDialogOpenData): Promise<void> => {
    await resetForm(data.selectedDate)
    organizationTree.value = data.organizations
    if (data.row) {
      Object.assign(form.model, {
        id: data.row.id,
        organizationId: data.row.organizationId,
        holidayType: data.row.holidayType,
        startDate: data.row.startDate,
        endDate: data.row.endDate,
        remark: data.row.remark || ''
      })
    } else if (data.defaultOrganizationId) {
      form.model.organizationId = data.defaultOrganizationId
    }
    await dialogRef.value?.handleOpen(data, {
      title: data.row ? '编辑节假日安排' : '新增节假日安排',
      subtitle: '选择公司/组织、假期类型与日期区间',
      confirmText: '保存安排',
      onOpen: async (_openData, api) => {
        api.setLoading(true)
        try {
          await userStore.ensureDictLoaded('smisHolidayType')
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
  .holiday-dialog {
    &__full-control {
      width: 100%;
    }
  }
</style>

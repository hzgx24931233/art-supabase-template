<template>
  <ArtDialog ref="dialogRef" size="lg">
    <div class="center-personnel">
      <ArtDescriptions
        :data="center || {}"
        :items="[
          { key: 'code', field: 'code', label: '工作中心' },
          { key: 'name', field: 'name', label: '名称' }
        ]"
        :columns="2"
      />
      <ArtSectionCard
        title="指定人员"
        subtitle="配置默认参与人员，临时变动通过下方时段管理。"
        :loading="state.loading"
        :error="state.error"
        retryable
        @retry="load"
      >
        <ArtEmployeeSelect
          multiple
          v-model:model-values="state.personIds"
          v-model:selected-data="state.people"
          :api-fn="fetchProductionPersonSelector"
          :display-fields="['jobTitle', 'employmentStatus']"
          title="选择生产人员"
          subtitle="仅显示姓名、工号等排人所需信息，不读取人员隐私档案"
          search-placeholder="姓名 / 工号"
        />
        <template #actions
          ><ElButton v-auth="'MdmWorkCenter:Personnel'" :loading="state.saving" @click="savePeople"
            ><template #icon><ArtSvgIcon icon="ri:save-3-line" /></template>保存指定人员</ElButton
          ></template
        >
      </ArtSectionCard>
      <ArtSectionCard
        title="人员临时调整"
        subtitle="在派工前设置生效时间；结束后恢复默认人员安排。"
        :loading="state.loading"
        :error="state.error"
        retryable
        @retry="load"
      >
        <template #actions
          ><ElButton v-auth="'MdmWorkCenter:Personnel'" type="primary" @click="openAdjustment"
            ><template #icon><ArtSvgIcon icon="ri:add-line" /></template>添加临时调整</ElButton
          ></template
        >
        <ArtTable
          :data="state.rows"
          :columns="columns"
          :height="260"
          :show-pagination="false"
          empty-text="暂无临时调整"
        />
      </ArtSectionCard>
    </div>
  </ArtDialog>
  <ArtDialog ref="adjustmentDialog" size="md"
    ><ArtForm
      ref="formRef"
      v-model="form"
      :items="items"
      :rules="rules"
      :show-submit="false"
      :show-reset="false"
      :span="24"
      ><template #personId
        ><ArtEmployeeSelect
          v-model="form.personId"
          :api-fn="fetchProductionPersonSelector"
          :display-fields="['jobTitle', 'employmentStatus']"
          title="选择生产人员"
          search-placeholder="姓名 / 工号"
          subtitle="从当前租户的人员配置中选择" /></template></ArtForm
    ><ElAlert v-if="formError" :title="formError" type="error" :closable="false"
  /></ArtDialog>
</template>
<script setup lang="tsx">
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  const { confirmAction } = useArtFeedback()
  import { computed, ref, reactive, shallowRef } from 'vue'
  import { ElMessage } from 'element-plus'
  import { formatWithDayjs } from '@/utils/time'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import type { ColumnOption } from '@/types'
  import type { EmployeeIntegrationItem } from '@/api/integration/employees'
  import {
    fetchCenterPeople,
    fetchCenterAdjustments,
    saveCenterAdjustment,
    deleteCenterAdjustment,
    setCenterPeople,
    fetchProductionPersonSelector,
    type WorkCenter,
    type CenterAdjustment
  } from '@/api/mdm'
  const emit = defineEmits<{ success: [] }>()
  const userStore = useUserStore()
  void userStore.ensureDictLoaded('mdmWorkCenterPersonnelAdjustmentKind')
  const dialogRef = ref<ArtDialogExpose>()
  const adjustmentDialog = ref<ArtDialogExpose>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const center = shallowRef<WorkCenter>()
  const formError = ref('')
  const state = reactive({
    loading: false,
    error: '',
    saving: false,
    personIds: [] as string[],
    people: [] as EmployeeIntegrationItem[],
    rows: [] as CenterAdjustment[]
  })
  const form = reactive({
    personId: undefined as string | undefined,
    kind: '短期加入',
    range: [] as string[]
  })
  const items = computed<FormItem[]>(() => [
    { key: 'personId', label: '人员' },
    {
      key: 'kind',
      label: '临时调整',
      type: 'radio',
      options: userStore.getDictMap.mdmWorkCenterPersonnelAdjustmentKind ?? []
    },
    {
      key: 'range',
      label: '期间',
      type: 'date',
      props: {
        type: 'datetimerange',
        valueFormat: 'YYYY-MM-DDTHH:mm:ssZ',
        startPlaceholder: '开始时间',
        endPlaceholder: '结束时间'
      }
    }
  ])
  const rules = {
    personId: [{ required: true, message: '请选择人员', trigger: 'change' }],
    range: [{ required: true, message: '请选择开始和结束时间', trigger: 'change' }]
  }
  const columns: ColumnOption<CenterAdjustment>[] = [
    {
      prop: 'person',
      label: '人员',
      minWidth: 190,
      formatter: (r) =>
        r.person ? (
          <BusinessTableIdentityCell primary={r.person.name} secondary={r.person.employeeNo} />
        ) : (
          '—'
        )
    },
    { prop: 'kind', label: '临时调整', width: 110 },
    {
      prop: 'startTime',
      label: '开始时间',
      minWidth: 170,
      formatter: (row) => formatWithDayjs(row.startTime)
    },
    {
      prop: 'endTime',
      label: '结束时间',
      minWidth: 170,
      formatter: (row) => formatWithDayjs(row.endTime)
    },
    {
      prop: 'operation',
      label: '操作',
      width: 70,
      fixed: 'right',
      formatter: (r) => (
        <div>
          <ArtButtonTable
            type="delete"
            permission="MdmWorkCenter:Personnel"
            onClick={() => void remove(r)}
          />
        </div>
      )
    }
  ]
  async function load() {
    if (!center.value) return
    state.loading = true
    state.error = ''
    try {
      const [people, rows] = await Promise.all([
        fetchCenterPeople(state.personIds),
        fetchCenterAdjustments(center.value.id)
      ])
      Object.assign(state, { people, rows })
    } catch {
      state.error = '人员安排加载失败，请重试'
    } finally {
      state.loading = false
    }
  }
  async function savePeople() {
    if (!center.value || !state.personIds.length) {
      ElMessage.warning('请至少选择一名生产人员')
      return
    }
    state.saving = true
    try {
      await setCenterPeople(center.value.id, state.personIds)
      emit('success')
    } catch {
      /* API owns feedback. */
    } finally {
      state.saving = false
    }
  }
  async function remove(row: CenterAdjustment) {
    try {
      await confirmAction('确认删除该临时调整？', '删除调整', { type: 'warning' })
      await deleteCenterAdjustment(row.id)
      await load()
    } catch {
      /* API owns feedback. */
    }
  }
  async function openAdjustment() {
    Object.assign(form, { personId: undefined, kind: '短期加入', range: [] })
    formError.value = ''
    await adjustmentDialog.value?.handleOpen(undefined, {
      title: '添加临时调整',
      confirmText: '保存调整',
      onConfirm: async () => {
        try {
          await formRef.value?.validate()
          if (!center.value || !form.personId) return false
          if (
            form.range.length !== 2 ||
            new Date(form.range[1]).getTime() <= new Date(form.range[0]).getTime()
          ) {
            formError.value = '结束时间必须晚于开始时间'
            return false
          }
          await saveCenterAdjustment({
            workCenterId: center.value.id,
            personId: form.personId,
            kind: form.kind,
            startTime: form.range[0],
            endTime: form.range[1]
          })
          await load()
          emit('success')
        } catch {
          return false
        }
      }
    })
  }
  async function handleOpen(row: WorkCenter) {
    center.value = row
    state.personIds = [...row.personIds]
    await dialogRef.value?.handleOpen(undefined, {
      title: '工作中心人员安排',
      showConfirmButton: false,
      cancelText: '关闭',
      onOpen: load
    })
  }
  defineExpose({ handleOpen })
</script>
<style scoped lang="scss">
  .center-personnel {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }
</style>

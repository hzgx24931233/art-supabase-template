<template>
  <ArtDialog ref="dialogRef" size="lg"
    ><ArtSectionCard
      title="设备列表"
      :subtitle="center ? `${center.code} · ${center.name}` : ''"
      :loading="state.loading"
      :error="state.error"
      retryable
      @retry="load"
      ><template #actions
        ><ElButton v-auth="'MdmWorkCenter:Devices'" type="primary" @click="openDevice()"
          ><template #icon><ArtSvgIcon icon="ri:add-line" /></template>添加设备</ElButton
        ></template
      ><ArtTable
        :data="state.rows"
        :columns="columns"
        :height="300"
        :show-pagination="false"
        empty-text="暂无设备"
        empty-description="添加设备并选择主设备，用于工作中心的生产执行。" /></ArtSectionCard
  ></ArtDialog>
  <ArtDialog ref="editDialog" size="md"
    ><div class="center-device-editor">
      <div v-if="editingRow" class="center-device-editor__identity">
        <span aria-hidden="true"><ArtSvgIcon icon="ri:cpu-line" /></span>
        <div>
          <strong>{{ editingRow.equipment?.equipmentName || '未命名设备' }}</strong>
          <small>{{ editingRow.equipment?.equipmentCode || '无设备编号' }}</small>
        </div>
      </div>
      <ArtForm
        ref="formRef"
        v-model="form"
        :items="items"
        :rules="rules"
        :span="24"
        :show-reset="false"
        :show-submit="false"
        ><template #equipmentIds
          ><ArtTableMultipleSelect
            :model-value="form.equipmentIds"
            :selected-data="selection"
            :api-fn="fetchEquipment"
            :columns="[
              { prop: 'equipmentCode', label: '设备编号', minWidth: 140 },
              { prop: 'equipmentName', label: '设备名称', minWidth: 180 }
            ]"
            row-key="id"
            label-key="equipmentName"
            description-key="equipmentCode"
            title="选择设备"
            subtitle="可一次勾选多台尚未关联工作中心的设备"
            search-placeholder="设备编号 / 设备名称"
            placeholder="选择一个或多个设备"
            empty-text="暂无可关联设备"
            empty-description="设备可能已被其他工作中心关联，请调整搜索条件。"
            :max-tag-count="3"
            @update:model-value="updateEquipmentIds"
            @update:selected-data="updateSelection" /></template
      ></ArtForm>
    </div>
    ></ArtDialog
  >
</template>
<script setup lang="tsx">
  import ArtTableMultipleSelect from '@/components/core/forms/art-data-select/table-multiple.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  const { confirmAction } = useArtFeedback()
  import { computed, ref, reactive, shallowRef } from 'vue'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import type { ColumnOption } from '@/types'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import type {
    DataSelectFetchParams,
    DataSelectModelValue,
    DataSelectRecord
  } from '@/components/core/forms/art-data-select/types'
  import {
    fetchCenterDevices,
    saveCenterDevice,
    addCenterDevices,
    deleteCenterDevice,
    fetchWorkCenterReferenceOptions,
    type WorkCenter,
    type CenterDevice
  } from '@/api/mdm'
  const dialogRef = ref<ArtDialogExpose>()
  const editDialog = ref<ArtDialogExpose>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const center = shallowRef<WorkCenter>()
  const editingRow = shallowRef<CenterDevice>()
  const selection = ref<{ id: string; equipmentCode: string; equipmentName: string }[]>([])
  const state = reactive({ rows: [] as CenterDevice[], loading: false, error: '' })
  const userStore = useUserStore()
  void userStore.ensureDictLoaded('mdmWorkCenterEquipmentPoint')
  const form = reactive({ equipmentIds: [] as string[], isMain: false, point: '无' })
  const items = computed<FormItem[]>(() => [
    { key: 'equipmentIds', label: '设备', hidden: Boolean(editingRow.value) },
    {
      key: 'isMain',
      label: editingRow.value ? '主设备' : '首台作为主设备',
      type: 'switch',
      help: editingRow.value
        ? '每个工作中心最多设置一台主设备。'
        : '开启后，将本次选择的第一台设备设为主设备，其余设备保持普通设备。',
      props: { disabled: hasOtherMain.value }
    },
    {
      key: 'point',
      label: '投入 / 产出点',
      type: 'select',
      options: userStore.getDictMap.mdmWorkCenterEquipmentPoint ?? []
    }
  ])
  const rules = {
    equipmentIds: [
      { type: 'array', required: true, min: 1, message: '请至少选择一台设备', trigger: 'change' }
    ]
  }
  const hasOtherMain = computed(() =>
    state.rows.some((row) => row.isMain && row.id !== editingRow.value?.id)
  )
  const fetchEquipment = async (p: DataSelectFetchParams) => {
    const result = await fetchWorkCenterReferenceOptions(
      'equipment',
      center.value?.tenantId || '',
      p.keyword,
      p.page,
      p.pageSize,
      center.value?.id
    )
    return {
      data: result.data.map((row) => ({
        id: row.id,
        equipmentCode: row.code,
        equipmentName: row.name
      })),
      total: result.total
    }
  }
  const columns: ColumnOption<CenterDevice>[] = [
    {
      prop: 'equipmentCode',
      label: '设备编号',
      minWidth: 160,
      formatter: (r) => r.equipment?.equipmentCode || '—'
    },
    {
      prop: 'equipmentName',
      label: '设备名称',
      minWidth: 180,
      formatter: (r) => r.equipment?.equipmentName || '—'
    },
    { prop: 'isMain', label: '主设备', width: 100, formatter: (r) => (r.isMain ? '是' : '否') },
    { prop: 'point', label: '投入 / 产出点', width: 130 },
    {
      prop: 'operation',
      label: '操作',
      width: 100,
      formatter: (r) => (
        <BusinessTableRowActions>
          <ArtButtonTable
            type="edit"
            permission="MdmWorkCenter:Devices"
            onClick={() => void openDevice(r)}
          />
          <ArtButtonTable
            type="delete"
            permission="MdmWorkCenter:Devices"
            onClick={() => void remove(r)}
          />
        </BusinessTableRowActions>
      )
    }
  ]
  async function load() {
    if (!center.value) return
    state.loading = true
    state.error = ''
    try {
      state.rows = await fetchCenterDevices(center.value.id)
    } catch {
      state.error = '设备加载失败，请重试'
    } finally {
      state.loading = false
    }
  }
  async function remove(row: CenterDevice) {
    try {
      await confirmAction('确认从工作中心移除该设备？', '移除设备', { type: 'warning' })
      await deleteCenterDevice(row.id)
      await load()
    } catch {
      /* API owns feedback. */
    }
  }
  async function openDevice(row?: CenterDevice) {
    editingRow.value = row
    Object.assign(form, {
      equipmentIds: row ? [row.equipmentId] : [],
      isMain: row?.isMain ?? !state.rows.length,
      point: row?.point || '无'
    })
    selection.value = row?.equipment ? [row.equipment] : []
    await editDialog.value?.handleOpen(undefined, {
      title: row ? '编辑设备' : '关联设备',
      subtitle: row ? '调整设备在当前工作中心中的用途' : '批量选择设备并设置统一投入 / 产出点',
      confirmText: row ? '保存更改' : '关联设备',
      onConfirm: async () => {
        try {
          await formRef.value?.validate()
          if (!center.value) return false
          if (row) {
            await saveCenterDevice(
              {
                workCenterId: center.value.id,
                equipmentId: row.equipmentId,
                isMain: form.isMain,
                point: form.point
              },
              row.id
            )
          } else {
            await addCenterDevices({
              workCenterId: center.value.id,
              equipmentIds: form.equipmentIds,
              mainEquipmentId: form.isMain ? form.equipmentIds[0] || null : null,
              point: form.point
            })
          }
          await load()
        } catch {
          return false
        }
      }
    })
  }
  function updateEquipmentIds(value: DataSelectModelValue) {
    form.equipmentIds = Array.isArray(value) ? value.map(String) : []
  }
  function updateSelection(rows: DataSelectRecord[]) {
    selection.value = rows.map((row) => ({
      id: String(row.id),
      equipmentCode: String(row.equipmentCode ?? ''),
      equipmentName: String(row.equipmentName ?? '')
    }))
  }
  async function handleOpen(row: WorkCenter) {
    center.value = row
    await dialogRef.value?.handleOpen(undefined, {
      title: '工作中心设备',
      showConfirmButton: false,
      cancelText: '关闭',
      onOpen: load
    })
  }
  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .center-device-editor {
    display: grid;
    gap: var(--art-space-4);
    min-width: 0;

    &__identity {
      display: flex;
      gap: var(--art-space-3);
      align-items: center;
      padding: var(--art-space-3);
      background: var(--el-fill-color-light);
      border-radius: var(--el-border-radius-base);

      > span {
        display: grid;
        flex: none;
        place-items: center;
        width: 36px;
        height: 36px;
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 10%, var(--el-bg-color));
        border-radius: var(--el-border-radius-base);
      }

      div {
        display: grid;
        gap: 2px;
        min-width: 0;
      }

      strong,
      small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      small {
        color: var(--el-text-color-secondary);
      }
    }
  }
</style>

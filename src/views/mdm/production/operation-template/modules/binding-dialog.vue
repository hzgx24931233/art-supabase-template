<template>
  <ArtDialog ref="dialogRef" size="md">
    <div class="template-binding-dialog">
      <ElAlert
        :title="`将为 ${ids.length} 个工艺工序绑定同一模板，原绑定会被替换。`"
        description="模板后续更新时，关联工序会继续使用该模板的最新任务与记分规则。"
        type="info"
        :closable="false"
        show-icon
      />
      <ArtForm
        v-model="form"
        :items="[{ key: 'templateId', label: '作业模板', span: 24 }]"
        :show-reset="false"
        :show-submit="false"
        label-position="top"
      >
        <template #templateId>
          <ArtTableSingleSelect
            v-model="form.templateId"
            :api-fn="fetchChoices"
            :columns="[
              { prop: 'name', label: '作业模板', minWidth: 180 },
              { prop: 'totalScore', label: '总记分', width: 100 }
            ]"
            label-key="name"
            title="选择作业模板"
            placeholder="请选择启用的模板"
          />
        </template>
      </ArtForm>
    </div>
  </ArtDialog>
</template>
<script setup lang="ts">
  import ArtTableSingleSelect from '@/components/core/forms/art-data-select/table-single.vue'
  import { ref, reactive } from 'vue'
  import { ElMessage } from 'element-plus'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import type { DataSelectFetchParams } from '@/components/core/forms/art-data-select/types'
  import { useUserStore } from '@/store/modules/user'
  import { fetchOperationTemplates, bindOperationTemplate } from '@/api/mdm'
  const emit = defineEmits<{ success: [] }>()
  const user = useUserStore()
  const dialogRef = ref<ArtDialogExpose>()
  const ids = ref<string[]>([])
  const form = reactive({ templateId: undefined as string | undefined })
  const fetchChoices = (p: DataSelectFetchParams) =>
    fetchOperationTemplates({
      tenantId: user.info.tenantId || '',
      keyword: p.keyword,
      current: p.page,
      size: p.pageSize,
      enabled: true
    })
  async function handleOpen(selectedIds: string[]) {
    ids.value = selectedIds
    form.templateId = undefined
    await dialogRef.value?.handleOpen(undefined, {
      title: '绑定作业模板',
      subtitle: '选择一个启用模板并应用到当前工艺工序',
      confirmText: '绑定',
      contentMaxHeight: '56vh',
      onConfirm: async () => {
        if (!form.templateId) {
          ElMessage.warning('请选择作业模板')
          return false
        }
        try {
          await bindOperationTemplate(ids.value, form.templateId)
          ElMessage.success({ message: '操作成功', duration: 1500 })
          emit('success')
        } catch {
          return false
        }
      }
    })
  }
  defineExpose({ handleOpen })
</script>
<style scoped lang="scss">
  .template-binding-dialog {
    display: grid;
    gap: 16px;
  }
</style>

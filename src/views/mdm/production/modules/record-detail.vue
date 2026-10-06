<template>
  <ArtDialog ref="dialogRef" size="md">
    <div class="production-record-detail">
      <ArtDescriptions :data="record" :items="items" :columns="2" />
    </div>
  </ArtDialog>
</template>
<script setup lang="ts">
  import { h, ref } from 'vue'
  import { ElImage } from 'element-plus'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  const dialogRef = ref<ArtDialogExpose>()
  const record = ref<Record<string, unknown>>({})
  const items = ref<ArtDescriptionItem[]>([])

  const renderAvatar: ArtDescriptionItem['render'] = (value, data) => {
    const src = typeof value === 'string' ? value.trim() : ''
    if (!src) return h('span', { class: 'production-record-detail__avatar-empty' }, '未上传头像')

    return h(ElImage, {
      alt: `${String(data.name || '人员')}头像`,
      class: 'production-record-detail__avatar',
      fit: 'cover',
      previewSrcList: [src],
      previewTeleported: true,
      src
    })
  }

  async function handleOpen(
    title: string,
    data: Record<string, unknown>,
    labels: Record<string, string>
  ) {
    record.value = data
    items.value = Object.entries(labels).map(([key, label]) => ({
      key,
      field: key,
      label: key === 'avatarUrl' ? '头像' : label,
      dictCode: (
        {
          workType: 'mdmProductionWorkType',
          gender: 'sex',
          tagType: 'mdmProductionTagStyle'
        } as Record<string, string>
      )[key],
      render: key === 'avatarUrl' ? renderAvatar : undefined,
      span: ['avatarUrl', 'remark'].includes(key) ? 2 : 1
    }))
    await dialogRef.value?.handleOpen(undefined, {
      title,
      showFooter: false
    })
  }
  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .production-record-detail {
    :deep(.production-record-detail__avatar) {
      width: 88px;
      height: 88px;
      border: 1px solid var(--el-border-color-lighter);
      border-radius: 50%;
    }

    :deep(.production-record-detail__avatar-empty) {
      color: var(--el-text-color-secondary);
    }
  }
</style>

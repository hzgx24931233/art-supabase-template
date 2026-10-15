<template>
  <ArtDialog ref="dialogRef" size="sm" confirm-on-close>
    <div class="user-role-dialog">
      <section class="user-role-dialog__context">
        <ElAvatar :size="42" :src="userContext?.avatar || undefined">
          {{ userAvatarFallback }}
        </ElAvatar>
        <div>
          <strong>{{ userContext?.nickName || userContext?.userName || '未选择用户' }}</strong>
          <p>{{ userContext?.userEmail || '暂无登录邮箱' }}</p>
        </div>
        <ElTag type="primary" effect="light" round>已选 {{ selectedRoleCount }} 项</ElTag>
      </section>

      <ElAlert
        class="user-role-dialog__notice"
        title="保存后，新角色权限将在用户下次刷新菜单或重新登录时生效。"
        type="info"
        :closable="false"
        show-icon
      />

      <ArtForm
        ref="formRef"
        v-model="formData"
        :items="formItems"
        :rules="rules"
        :span="24"
        :gutter="20"
        label-width="96px"
        :show-reset="false"
        :show-submit="false"
      />
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { cloneDeep } from 'lodash-es'
  import { ElMessage, type FormRules } from 'element-plus'
  import { assignUserRoles, fetchGetEnableRoleList } from '@/api/system-manage'

  type UserListItem = Api.SystemManage.UserListItem
  type UserRoleFormData = Pick<UserListItem, 'userRoles' | 'id'>

  interface Emits {
    (e: 'success'): void
  }

  const emit = defineEmits<Emits>()
  const dialogRef = ref<ArtDialogExpose<UserListItem>>()
  const formRef = ref()
  const rules: FormRules = {}

  const createInitialForm = (): UserRoleFormData => ({
    userRoles: []
  })

  const formData = ref<UserRoleFormData>(createInitialForm())
  const userContext = shallowRef<UserListItem>()
  const selectedRoleCount = computed(() => formData.value.userRoles?.length ?? 0)
  const userAvatarFallback = computed(() => {
    const displayName = (userContext.value?.nickName || userContext.value?.userName || '').trim()
    return displayName.slice(0, 1).toUpperCase() || 'U'
  })

  const formItems = computed<FormItem[]>(() => [
    {
      label: '已分配角色',
      key: 'userRoles',
      type: 'select',
      api: fetchGetEnableRoleList,
      resultField: 'data',
      labelField: 'roleName',
      valueField: 'roleCode',
      props: {
        multiple: true,
        filterable: true,
        collapseTags: true,
        collapseTagsTooltip: true,
        maxCollapseTags: 3,
        placeholder: '请选择角色'
      },
      description: '支持多选；请仅分配与当前岗位职责直接相关的角色。'
    }
  ])

  const resetForm = async (): Promise<void> => {
    formData.value = cloneDeep(createInitialForm())
    userContext.value = undefined
    await nextTick()
    formRef.value?.ref?.value?.clearValidate()
  }

  const handleSubmit = async (): Promise<boolean> => {
    try {
      await formRef.value?.validate()
    } catch {
      return false
    }

    try {
      if (!formData.value.id) {
        ElMessage.warning('用户信息缺失，请关闭后重新打开')
        return false
      }
      await assignUserRoles({
        id: formData.value.id,
        userRoles: [...(formData.value.userRoles ?? [])]
      })
      emit('success')
      return true
    } catch {
      return false
    }
  }

  const handleOpen = async (data: UserListItem): Promise<void> => {
    await resetForm()
    userContext.value = data
    const { id, userRoles } = data
    formData.value = {
      id,
      userRoles
    }
    await dialogRef.value?.handleOpen(data, {
      title: '分配用户角色',
      contentMaxHeight: '60vh',
      skipConfirmWhenPristine: true,
      onConfirm: handleSubmit,
      onReset: () => {
        void resetForm()
      }
    })
  }

  defineExpose({
    handleOpen,
    handleSubmit,
    handleClose: () => dialogRef.value?.handleClose()
  })
</script>

<style scoped lang="scss">
  .user-role-dialog {
    display: grid;
    gap: 16px;
    min-width: 0;

    &__context {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
      padding: 14px 16px;
      background: var(--el-color-primary-light-9);
      border: 1px solid var(--el-color-primary-light-8);
      border-radius: var(--custom-radius);

      :deep(.el-avatar) {
        font-weight: 700;
        color: var(--el-color-primary);
        background: var(--el-bg-color);
        border: 1px solid var(--el-color-primary-light-7);
      }

      > div {
        min-width: 0;
      }

      strong,
      p {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      strong {
        margin-bottom: 3px;
        font-size: 14px;
        color: var(--el-text-color-primary);
      }

      p {
        margin: 0;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    &__notice {
      align-items: flex-start;

      :deep(.el-alert__content) {
        min-width: 0;
      }

      :deep(.el-alert__title) {
        line-height: 1.6;
      }
    }

    @media (width <= 640px) {
      &__context {
        grid-template-columns: auto minmax(0, 1fr);

        > :deep(.el-tag) {
          grid-column: 2;
          justify-self: start;
        }
      }
    }
  }
</style>

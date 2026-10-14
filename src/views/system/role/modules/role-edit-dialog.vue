<template>
  <ArtDialog ref="dialogRef" size="md" confirm-on-close>
    <div class="role-edit-dialog">
      <section class="role-edit-dialog__context">
        <div class="role-edit-dialog__context-icon" aria-hidden="true">
          <ArtSvgIcon :icon="dialogType === 'add' ? 'ri:user-add-line' : 'ri:shield-user-line'" />
        </div>
        <div>
          <strong>{{ contextTitle }}</strong>
          <p>{{ contextDescription }}</p>
        </div>
        <ElTag
          :type="isSystemBuiltinRole ? 'warning' : dialogType === 'add' ? 'success' : 'primary'"
          effect="light"
          round
        >
          {{ isSystemBuiltinRole ? '系统内置' : dialogType === 'add' ? '新增角色' : '编辑模式' }}
        </ElTag>
      </section>

      <ElAlert
        v-if="isSystemBuiltinRole"
        class="role-edit-dialog__notice"
        title="该角色承担系统级职责，角色编码与启用状态受保护，仅允许调整名称和描述。"
        type="warning"
        :closable="false"
        show-icon
      />

      <ArtForm
        ref="formRef"
        v-model="form"
        :items="formItems"
        :rules="rules"
        :span="12"
        :gutter="20"
        label-width="100px"
        :show-reset="false"
        :show-submit="false"
      />
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import type { FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import { addRole, editRole, fetchGetEnableOrganizationTree } from '@/api/system-manage'
  import { uniqueValidator } from '@/utils/form/validator'
  import { isBuiltinRole } from './role-builtin'

  type RoleListItem = Api.SystemManage.RoleListItem
  type DialogType = 'add' | 'edit'

  interface RoleEditDialogOpenData {
    type: DialogType
    roleData?: RoleListItem
  }

  interface ArtFormExpose {
    validate: () => Promise<boolean>
    clearValidate: () => void
    validateField: (prop: string) => void
    reloadOptions: (key?: string) => Promise<void>
  }

  interface Emits {
    (e: 'success'): void
  }

  const emit = defineEmits<Emits>()
  const dialogRef = ref<ArtDialogExpose<RoleEditDialogOpenData>>()
  const formRef = ref<ArtFormExpose>()
  const dialogType = ref<DialogType>('add')

  // Built-in identity belongs to the record that was opened, so typing a reserved role code into
  // the form cannot lock or unlock the editor by itself.
  const openedRole = ref<RoleListItem | null>(null)

  const isSystemBuiltinRole = computed(() =>
    openedRole.value ? isBuiltinRole(openedRole.value) : false
  )
  const contextTitle = computed(() =>
    dialogType.value === 'add' ? '创建新的职责角色' : '调整角色定义与可用状态'
  )
  const contextDescription = computed(() =>
    dialogType.value === 'add'
      ? '角色编码用于权限关联，建议采用稳定、清晰的职责命名。'
      : '角色定义会影响关联用户的权限识别，保存前请确认职责边界。'
  )

  const createInitialForm = (): RoleListItem => ({
    id: undefined,
    organizationId: null,
    roleName: '',
    roleCode: '',
    builtinType: null,
    description: '',
    enabled: true,
    createBy: undefined
  })

  const form = reactive<RoleListItem>(createInitialForm())

  const rules = computed<FormRules>(() => ({
    roleName: [
      { required: true, message: '请输入角色名称', trigger: 'change' },
      { min: 2, max: 20, message: '长度在 2 到 20 个字符', trigger: 'change' }
    ],
    roleCode: [
      { required: true, message: '请输入角色编码', trigger: 'change' },
      { min: 2, max: 50, message: '长度在 2 到 50 个字符', trigger: 'change' },
      {
        validator: uniqueValidator({
          table: 'sys_role',
          field: 'role_code',
          getExcludeId: (): string | undefined => form.id,
          message: '角色编码已存在'
        }),
        trigger: 'change'
      }
    ],
    description: [{ required: true, message: '请输入角色描述', trigger: 'change' }]
  }))

  const formItems = computed<FormItem[]>(() => [
    {
      label: '角色定义',
      key: 'identitySection',
      type: 'divider',
      span: 24
    },
    {
      label: '角色名称',
      key: 'roleName',
      type: 'input',
      props: {
        placeholder: '如：财务审核员'
      },
      description: '建议使用能够直接体现职责范围的名称。'
    },
    {
      label: '适用组织',
      key: 'organizationId',
      type: 'treeSelect',
      span: 24,
      api: fetchGetEnableOrganizationTree,
      immediate: false,
      resultField: 'data',
      labelField: 'organizationName',
      valueField: 'id',
      labelFn: (item) => `${item.organizationName}（${item.organizationCode}）`,
      childrenField: 'children',
      props: {
        disabled: isSystemBuiltinRole.value,
        clearable: true,
        checkStrictly: true,
        defaultExpandAll: true,
        renderAfterExpand: false,
        placeholder: '请选择角色主要适用组织'
      },
      description: isSystemBuiltinRole.value
        ? '系统内置角色固定归入根组织。'
        : '用于组织治理与职责审计，不改变角色菜单权限的独立配置。'
    },
    {
      label: '角色编码',
      key: 'roleCode',
      type: 'input',
      props: {
        disabled: isSystemBuiltinRole.value,
        placeholder: '如：R_FINANCE_AUDITOR'
      },
      help: '建议使用大写字母、数字与下划线，保存后应谨慎修改。'
    },
    {
      label: '描述',
      key: 'description',
      type: 'input',
      span: 24,
      props: {
        type: 'textarea',
        rows: 3,
        maxlength: 300,
        showWordLimit: true,
        placeholder: '说明该角色的职责边界和适用成员'
      },
      description: '清晰的职责说明有助于后续权限审计。'
    },
    {
      label: '状态控制',
      key: 'statusSection',
      type: 'divider',
      span: 24
    },
    {
      label: '启用',
      key: 'enabled',
      type: 'switch',
      props: {
        disabled: isSystemBuiltinRole.value
      },
      span: 24,
      description: isSystemBuiltinRole.value
        ? '系统内置角色始终保持启用。'
        : '停用后请同步检查已关联用户的访问安排。'
    }
  ])

  const resetForm = async (): Promise<void> => {
    openedRole.value = null
    Object.assign(form, createInitialForm())
    await nextTick()
    formRef.value?.clearValidate()
  }

  const initializeForm = async (data: RoleEditDialogOpenData): Promise<void> => {
    await resetForm()
    dialogType.value = data.type
    openedRole.value = data.roleData ?? null

    if (data.roleData) {
      const {
        id,
        organizationId,
        roleName,
        roleCode,
        builtinType,
        description,
        enabled,
        createBy
      } = data.roleData
      Object.assign(form, {
        id,
        organizationId,
        roleName,
        roleCode,
        builtinType,
        description,
        enabled,
        createBy
      })
    }
  }

  const buildRolePayload = (): Omit<RoleListItem, 'id'> => {
    const payload = { ...toRaw(form) }
    delete payload.id
    delete payload.builtinType

    if (isSystemBuiltinRole.value) {
      payload.enabled = true
    }

    return payload
  }

  const handleSubmit = async (): Promise<boolean> => {
    if (!formRef.value) return false

    try {
      await formRef.value.validate()
    } catch {
      return false
    }

    try {
      const payload = buildRolePayload()

      if (dialogType.value === 'add') {
        await addRole(payload)
      } else {
        await editRole({ ...payload, id: form.id })
      }
      emit('success')
      return true
    } catch {
      return false
    }
  }

  const handleOpen = async (data: RoleEditDialogOpenData): Promise<void> => {
    await initializeForm(data)
    await dialogRef.value?.handleOpen(data, {
      title: data.type === 'add' ? '新增角色' : '编辑角色',
      contentMaxHeight: '68vh',
      loading: true,
      onOpen: async (_openData, api) => {
        try {
          await initializeForm(data)
          await formRef.value?.reloadOptions('organizationId')
        } finally {
          api.setLoading(false)
        }
      },
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
  .role-edit-dialog {
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

      > div:nth-child(2) {
        min-width: 0;
      }

      strong {
        display: block;
        margin-bottom: 3px;
        font-size: 14px;
        color: var(--el-text-color-primary);
      }

      p {
        margin: 0;
        font-size: 12px;
        line-height: 1.6;
        color: var(--el-text-color-secondary);
        overflow-wrap: anywhere;
      }
    }

    &__context-icon {
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      color: var(--el-color-primary);
      background: var(--el-bg-color);
      border-radius: var(--el-border-radius-base);

      :deep(svg) {
        width: 19px;
        height: 19px;
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

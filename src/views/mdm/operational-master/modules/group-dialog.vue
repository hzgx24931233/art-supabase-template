<template>
  <ArtDialog ref="dialogRef" size="sm">
    <div class="master-group-dialog">
      <ArtEntitySummary
        :icon="groupIcon"
        eyebrow="MASTER DATA GROUP"
        :title="form.model.name || dialogTitle"
        :description="groupDescription"
        compact
      >
        <template #aside>
          <ArtDictDisplay
            dict-code="commonBoolean"
            :value="String(form.model.enabled)"
            display="tag"
          />
        </template>
      </ArtEntitySummary>

      <ArtForm
        ref="formRef"
        v-model="form.model"
        :items="items"
        :rules="form.rules"
        :span="12"
        :gutter="20"
        label-position="top"
        :show-reset="false"
        :show-submit="false"
      />
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { cloneDeep } from 'lodash-es'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import type { MasterGroup, MasterGroupDomain } from '@/api/mdm'
  import { saveMasterGroup } from '@/api/mdm'
  import { buildMasterGroupWriteInput, type MasterGroupFormModel } from './group-payload'

  export interface GroupDialogOpenData {
    domain: MasterGroupDomain
    tenantId: string
    tenantOptions: Array<{ label: string; value: string }>
    groups: MasterGroup[]
    row?: MasterGroup
    parent?: MasterGroup
  }

  const emit = defineEmits<{ success: [] }>()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const { isPlatformScope } = storeToRefs(useTenantScopeStore())
  const dialogRef = ref<ArtDialogExpose<GroupDialogOpenData>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const initialModel = (): MasterGroupFormModel => ({
    tenantId: '',
    domain: 'customer',
    parentId: null,
    code: '',
    name: '',
    sort: 10,
    enabled: true,
    remark: ''
  })
  const form = reactive({
    id: undefined as string | undefined,
    model: initialModel(),
    groups: [] as MasterGroup[],
    tenantOptions: [] as Array<{ label: string; value: string }>,
    rules: {
      tenantId: [{ required: true, message: '请选择所属租户', trigger: 'change' }],
      code: [{ required: true, message: '请输入分组编码', trigger: 'blur' }],
      name: [{ required: true, message: '请输入分组名称', trigger: 'blur' }]
    }
  })
  const domainCopy: Record<MasterGroupDomain, { title: string; icon: string }> = {
    customer: { title: '客户分组', icon: 'ri:building-2-line' },
    material: { title: '物料分组', icon: 'ri:archive-drawer-line' },
    supplier: { title: '供应商分组', icon: 'ri:store-2-line' },
    project: { title: '项目分组', icon: 'ri:briefcase-4-line' },
    operation: { title: '工序分组', icon: 'ri:git-commit-line' },
    'process-route': { title: '路线分组', icon: 'ri:route-line' }
  }
  const groupIcon = computed(() => domainCopy[form.model.domain].icon)
  const groupTypeTitle = computed(() => domainCopy[form.model.domain].title)
  const dialogTitle = computed(() =>
    form.id
      ? `编辑${groupTypeTitle.value}`
      : form.model.parentId
        ? '新增下级分组'
        : `新增${groupTypeTitle.value}`
  )
  const groupDescription = computed(() => {
    const parent = form.groups.find((row) => row.id === form.model.parentId)
    return parent
      ? `上级分组：${parent.name} · ${parent.code}`
      : `建立${groupTypeTitle.value}层级，便于主档筛选与归类。`
  })
  const booleanOptions = computed(() =>
    (getDictMap.value.commonBoolean ?? []).map((item) => ({
      label: item.label || item.value,
      value: item.value === 'true' || item.value === '1'
    }))
  )
  const items = computed<FormItem[]>(() => [
    { key: 'hierarchy', label: '分组层级', type: 'divider', span: 24 },
    {
      key: 'tenantId',
      label: '所属租户',
      type: 'select',
      span: 24,
      options: form.tenantOptions,
      props: { disabled: !!form.id || !!form.model.parentId, filterable: true }
    },
    {
      key: 'parentId',
      label: '上级分组',
      type: 'treeSelect',
      span: 24,
      options: form.groups
        .filter((row) => row.id !== form.id && row.tenantId === form.model.tenantId)
        .map((row) => ({
          label: `${row.name}（${row.code}）`,
          value: row.id,
          parentId: row.parentId
        }))
    },
    { key: 'identity', label: '分组信息', type: 'divider', span: 24 },
    { key: 'code', label: '分组编码', type: 'input', props: { maxlength: 60 } },
    { key: 'name', label: '分组名称', type: 'input', props: { maxlength: 100 } },
    {
      key: 'sort',
      label: '排序',
      type: 'number',
      props: { min: 0, precision: 0, controlsPosition: 'right', class: '!w-full' }
    },
    {
      key: 'enabled',
      label: '启用状态',
      type: 'segment',
      options: booleanOptions.value
    },
    {
      key: 'remark',
      label: '备注',
      type: 'textarea',
      span: 24,
      props: { rows: 3, maxlength: 500, showWordLimit: true, resize: 'none' }
    }
  ])
  void userStore.ensureDictLoaded('commonBoolean')

  const handleOpen = async (data: GroupDialogOpenData): Promise<void> => {
    form.id = data.row?.id
    form.groups = data.groups
    form.tenantOptions = data.tenantOptions
    form.model = data.row
      ? cloneDeep(data.row)
      : {
          ...initialModel(),
          domain: data.domain,
          tenantId: data.parent?.tenantId || data.tenantId,
          parentId: data.parent?.id || null
        }
    await dialogRef.value?.handleOpen(data, {
      title: dialogTitle.value,
      subtitle: data.row ? `当前分组：${data.row.name} · ${data.row.code}` : groupDescription.value,
      confirmText: data.row ? '保存更改' : '创建分组',
      onOpen: () => formRef.value?.clearValidate(),
      onConfirm: async () => {
        try {
          await formRef.value?.validate()
          await saveMasterGroup(
            buildMasterGroupWriteInput(form.model, {
              editing: Boolean(form.id),
              isPlatformScope: isPlatformScope.value
            }),
            form.id
          )
          emit('success')
          return true
        } catch {
          return false
        }
      }
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .master-group-dialog {
    display: grid;
    gap: var(--art-space-3);
  }
</style>

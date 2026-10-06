<template>
  <ArtDialog ref="dialogRef" size="xl">
    <div class="template-editor">
      <ArtDescriptions
        v-if="form.readonly"
        :data="form.model"
        :items="[
          { key: 'name', field: 'name', label: '作业模板' },
          { key: 'sort', field: 'sort', label: '排序' }
        ]"
        :columns="2"
      />
      <ArtForm
        v-else
        ref="formRef"
        v-model="form.model"
        :items="formItems"
        :rules="rules"
        :span="12"
        :show-reset="false"
        :show-submit="false"
      />
      <ArtSectionCard
        class="template-editor__tasks"
        title="作业任务"
        :subtitle="`${form.model.items.length} 个任务项；按实际作业顺序维护检查或录入要求。`"
        preserve-content-structure
      >
        <template #actions>
          <ElButton
            v-if="!form.readonly"
            type="primary"
            plain
            :disabled="form.model.items.length >= 200"
            @click="form.model.items.push(createTask())"
          >
            <template #icon><ArtSvgIcon icon="ri:add-line" /></template>
            添加任务项
          </ElButton>
        </template>
        <div class="template-editor__summary">
          <span><ArtSvgIcon icon="ri:list-check-3" />完成每个任务项后累计模板分数</span>
          <strong
            >总记分 <b>{{ total }}</b></strong
          >
        </div>
        <ElAlert v-if="form.error" :title="form.error" type="error" :closable="false" show-icon />
        <ArtTable
          ref="taskTableRef"
          :data="form.model.items"
          :columns="columns"
          :show-pagination="false"
          max-height="360"
          empty-text="暂无作业任务"
          empty-description="点击“添加任务项”开始配置作业要求。"
        />
      </ArtSectionCard>
    </div>
  </ArtDialog>
</template>
<script setup lang="tsx">
  import { ref, reactive, computed } from 'vue'
  import { cloneDeep } from 'lodash-es'
  import { ElInput, ElInputNumber, ElOption, ElSelect } from 'element-plus'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import type { ArtTableExpose } from '@/components/core/tables/art-table/index.vue'
  import type { ColumnOption } from '@/types'
  import { useUserStore } from '@/store/modules/user'
  import { saveOperationTemplate, type OperationTemplate, type OperationTask } from '@/api/mdm'
  import { createTemplate, createTask, templatePayload, templateScore } from './template-model'
  interface OpenData {
    row?: OperationTemplate
    mode: 'add' | 'edit' | 'copy' | 'view'
  }
  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<OpenData>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const taskTableRef = ref<ArtTableExpose>()
  const user = useUserStore()
  const form = reactive({ model: createTemplate(), readonly: false, error: '' })
  const total = computed(() => templateScore(form.model.items))
  const inputOptions = computed(() => user.getDictMap.mdmCenter_inputMode ?? [])
  const rules = { name: [{ required: true, message: '请输入作业模板名称', trigger: 'blur' }] }
  const formItems: FormItem[] = [
    { key: 'basic', label: '模板信息', type: 'divider', span: 24 },
    {
      key: 'name',
      label: '作业模板',
      type: 'input',
      props: { maxlength: 120, placeholder: '例如：总装质量检查' }
    },
    { key: 'sort', label: '显示顺序', type: 'number', props: { min: 0, precision: 0 } }
  ]
  const taskIndex = (row: OperationTask) => form.model.items.indexOf(row)
  const columns = computed<ColumnOption<OperationTask>[]>(() => [
    { type: 'index', label: '#', width: 48, align: 'center' },
    {
      prop: 'inputMode',
      label: '输入方式',
      width: 110,
      formatter: (row) =>
        form.readonly ? (
          <span>{row.inputMode}</span>
        ) : (
          <ElSelect v-model={row.inputMode} class="w-full!" aria-label="输入方式">
            {inputOptions.value.map((option) => (
              <ElOption
                key={String(option.value)}
                label={String(option.label)}
                value={option.value}
              />
            ))}
          </ElSelect>
        )
    },
    {
      prop: 'category',
      label: '任务分类',
      required: true,
      minWidth: 125,
      formatter: (row) =>
        form.readonly ? (
          <span>{row.category}</span>
        ) : (
          <ElInput
            v-model={row.category}
            aria-label="任务分类"
            placeholder="任务分类"
            maxlength={120}
          />
        )
    },
    {
      prop: 'name',
      label: '任务项名称',
      required: true,
      minWidth: 160,
      formatter: (row) =>
        form.readonly ? (
          <span>{row.name}</span>
        ) : (
          <ElInput
            v-model={row.name}
            aria-label="任务项名称"
            placeholder="任务项名称"
            maxlength={120}
          />
        )
    },
    {
      prop: 'requirement',
      label: '要求',
      minWidth: 200,
      formatter: (row) =>
        form.readonly ? (
          <span>{row.requirement || '—'}</span>
        ) : (
          <ElInput
            v-model={row.requirement}
            aria-label="要求"
            placeholder="作业要求"
            maxlength={500}
          />
        )
    },
    {
      prop: 'choices',
      label: '选择项',
      rules: {
        validator: ({ value, row }) =>
          row.inputMode !== '选择' ||
          (Array.isArray(value) && value.some((item) => String(item).trim())),
        message: ({ rowIndex }) => `第 ${rowIndex + 1} 行选择任务请至少添加一个选择项`
      },
      minWidth: 150,
      formatter: (row) =>
        form.readonly ? (
          <span>{row.choices.join('、') || '—'}</span>
        ) : (
          <ElSelect
            v-model={row.choices}
            class="w-full!"
            disabled={row.inputMode !== '选择'}
            multiple
            filterable
            allowCreate
            defaultFirstOption
            aria-label="可选内容"
            placeholder="输入选项并回车"
          />
        )
    },
    {
      prop: 'score',
      label: '分数',
      rules: {
        validator: ({ value }) => {
          const score = Number(value)
          return Number.isFinite(score) && score >= 0 && score <= 100000
        },
        message: ({ rowIndex }) => `第 ${rowIndex + 1} 行分数需在 0 至 100000 之间`
      },
      width: 95,
      align: 'center',
      formatter: (row) =>
        form.readonly ? (
          <span>{row.score}</span>
        ) : (
          <ElInputNumber
            v-model={row.score}
            class="w-full!"
            min={0}
            max={100000}
            precision={2}
            controls={false}
            aria-label="分数"
          />
        )
    },
    ...(!form.readonly
      ? [
          {
            prop: 'operation',
            label: '操作',
            width: 96,
            align: 'center',
            fixed: 'right' as const,
            formatter: (row: OperationTask) => {
              const index = taskIndex(row)
              return (
                <div class="flex flex-nowrap items-center justify-center gap-2 whitespace-nowrap">
                  <ArtIconButton
                    icon="ri:file-copy-line"
                    label={`复制任务项 ${index + 1}`}
                    onClick={() => copyTask(index)}
                  />
                  <ArtIconButton
                    icon="ri:delete-bin-6-line"
                    label={`删除任务项 ${index + 1}`}
                    class="text-[var(--el-color-danger)]!"
                    onClick={() => form.model.items.splice(index, 1)}
                  />
                </div>
              )
            }
          }
        ]
      : [])
  ])
  function copyTask(index: number) {
    if (form.model.items.length < 200)
      form.model.items.splice(index + 1, 0, cloneDeep(form.model.items[index]))
  }
  async function handleOpen(data: OpenData) {
    Object.assign(form, {
      model: data.row ? templatePayload(data.row) : createTemplate(),
      readonly: data.mode === 'view',
      error: ''
    })
    if (data.mode === 'copy') {
      form.model.name = ''
      form.model.enabled = true
    }
    await dialogRef.value?.handleOpen(data, {
      title: {
        add: '新增作业模板',
        edit: '编辑作业模板',
        copy: '复制作业模板',
        view: '作业模板详情'
      }[data.mode],
      subtitle: form.readonly
        ? '查看模板任务与记分规则'
        : '维护可复用的作业任务、填写方式与记分规则',
      confirmText: data.mode === 'edit' ? '保存更改' : '创建模板',
      cancelText: form.readonly ? '关闭' : '取消',
      showConfirmButton: !form.readonly,
      contentMaxHeight: '72vh',
      loading: true,
      loadingText: '正在加载填写方式…',
      onOpen: async (_openData, api) => {
        try {
          await user.ensureDictLoaded('mdmCenter_inputMode')
        } catch {
          ElMessage.warning('填写方式加载失败，请关闭弹窗后重试')
        } finally {
          api.setLoading(false)
        }
      },
      onConfirm: async () => {
        form.error =
          !form.model.items.length || form.model.items.length > 200
            ? '请添加 1 至 200 个任务项'
            : ''
        if (form.error) return false
        const tableValidation = await taskTableRef.value?.validate()
        if (tableValidation?.valid === false) {
          form.error = tableValidation.firstError?.message || '请完整填写作业任务'
          return false
        }
        try {
          await formRef.value?.validate()
          await saveOperationTemplate(
            templatePayload(form.model),
            data.mode === 'edit' ? data.row?.id : undefined
          )
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
  .template-editor {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;

    &__summary {
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
    }

    &__summary {
      padding: 10px 12px;
      margin-bottom: 12px;
      color: var(--el-text-color-secondary);
      background: var(--el-fill-color-light);
      border-radius: var(--el-border-radius-base);

      span {
        display: inline-flex;
        gap: 6px;
        align-items: center;
        font-size: 12px;
      }
    }

    &__summary strong {
      display: inline-flex;
      flex: none;
      gap: 12px;
      align-items: baseline;
      margin-left: auto;
      color: var(--el-text-color-regular);

      b {
        font-size: 24px;
        line-height: 1;
        color: var(--theme-color);
      }
    }

    :deep(.el-input-number) {
      width: 100%;
    }

    :deep(.art-table__cell-value) {
      display: block;
      width: 100%;
    }

    :deep(.art-table__cell-content) {
      width: 100%;
    }

    :deep(.el-select) {
      width: 100%;
    }
  }
</style>

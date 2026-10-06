<template>
  <ArtDialog ref="dialogRef" size="xl">
    <div class="esop-document-dialog">
      <ArtEntitySummary
        class="esop-document-dialog__identity"
        icon="ri:file-shield-2-line"
        eyebrow="CONTROLLED WORK INSTRUCTION"
        :title="form.documentName || '新 ESOP 文档'"
        :description="form.documentCode || '保存前请完成文档编号与受控附件'"
      >
        <template #aside>
          <ArtDictDisplay dict-code="commonEnabledStatus" :value="form.status" display="tag" />
        </template>
      </ArtEntitySummary>

      <ElTabs v-model="activeTab" class="esop-document-dialog__tabs">
        <ElTabPane name="document">
          <template #label>
            <span class="esop-document-dialog__tab-label">
              <ArtSvgIcon icon="ri:file-text-line" />文档信息
            </span>
          </template>
        </ElTabPane>
        <ElTabPane name="scope">
          <template #label>
            <span class="esop-document-dialog__tab-label">
              <ArtSvgIcon icon="ri:git-branch-line" />适用范围
              <span v-if="scopeCount" class="esop-document-dialog__tab-count">{{
                scopeCount
              }}</span>
            </span>
          </template>
        </ElTabPane>
      </ElTabs>

      <section class="esop-document-dialog__panel">
        <div class="esop-document-dialog__section-heading">
          <div>
            <strong>{{ activeTab === 'document' ? '受控文件资料' : '产品与工艺关联' }}</strong>
            <p>
              {{
                activeTab === 'document'
                  ? '维护唯一编号、当前版本与可追溯附件。'
                  : '定义生产任务调用该 ESOP 的业务边界。'
              }}
            </p>
          </div>
          <span>{{
            activeTab === 'document' ? '必填项完整后可保存' : `已关联 ${scopeCount} 项`
          }}</span>
        </div>

        <ArtForm
          v-show="activeTab === 'document'"
          ref="formRef"
          v-model="form"
          :items="documentItems"
          :rules="rules"
          :span="12"
          :gutter="24"
          label-position="top"
          :show-reset="false"
          :show-submit="false"
        >
          <template #categoryId>
            <div class="esop-document-dialog__category-field">
              <ElTreeSelect
                v-model="form.categoryId"
                :data="scopedCategories"
                :props="treeProps"
                node-key="id"
                value-key="id"
                check-strictly
                default-expand-all
                filterable
                :disabled="!form.tenantId"
                empty-text="当前租户尚未建立分类"
                class="w-full"
                :placeholder="form.tenantId ? '请选择启用的文档分类' : '请先选择目标租户'"
              />
              <p v-if="form.tenantId && !scopedCategories.length" role="status">
                <ArtSvgIcon
                  icon="ri:information-line"
                />当前租户暂无分类，请先关闭弹窗并在左侧新建。
              </p>
            </div>
          </template>
          <template #attachmentUrl>
            <ArtUploadFile
              v-model="form.attachmentUrl"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,image/*"
              title="选择 ESOP 附件"
              tip="推荐 PDF；支持常见文档、表格、演示稿与图片，单个文件不超过 20 MB"
              :disabled="!form.tenantId"
              :resource-tenant-id="form.tenantId"
              :file-name="form.attachmentName"
              @resource-change="handleAttachmentChange"
            />
          </template>
        </ArtForm>

        <ArtForm
          v-show="activeTab === 'scope'"
          v-model="form"
          :items="scopeItems"
          :span="24"
          label-position="top"
          :show-reset="false"
          :show-submit="false"
        >
          <template #materialIds>
            <ElSelect
              v-model="form.materialIds"
              multiple
              filterable
              collapse-tags
              collapse-tags-tooltip
              clearable
              placeholder="选择适用产品或物料"
              class="w-full"
            >
              <ElOption
                v-for="item in scopedReferences.materials"
                :key="item.id"
                :value="item.id"
                :label="`${item.materialCode} · ${item.materialName}`"
              />
            </ElSelect>
          </template>
          <template #routeIds>
            <ElSelect
              v-model="form.routeIds"
              multiple
              filterable
              collapse-tags
              collapse-tags-tooltip
              clearable
              placeholder="选择适用工艺路线"
              class="w-full"
            >
              <ElOption
                v-for="item in scopedReferences.routes"
                :key="item.id"
                :value="item.id"
                :label="`${item.materialCode} · ${item.name}`"
              />
            </ElSelect>
          </template>
        </ArtForm>
        <div v-if="activeTab === 'scope'" class="esop-document-dialog__scope-note">
          <span><ArtSvgIcon icon="ri:information-line" /></span>
          <p>产品关联适合跨路线通用指导书；工艺路线关联适合特定加工过程。两者可同时维护。</p>
        </div>
      </section>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import dayjs from 'dayjs'
  import { ElMessage } from 'element-plus'
  import type { FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtUploadFile from '@/components/core/forms/art-upload-file/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import TreeUtils from '@/utils/tree'
  import {
    saveEsopDocument,
    type EsopCategory,
    type EsopDocument,
    type EsopDocumentInput,
    type EsopReferenceOptions
  } from '@/api/mdm'

  export type EsopDocumentDialogMode = 'add' | 'copy' | 'edit'
  export interface EsopDocumentDialogOpenData {
    mode: EsopDocumentDialogMode
    row?: EsopDocument
    categoryId?: string
    categories: EsopCategory[]
    references: EsopReferenceOptions
    tenantId: string
    tenantOptions: Array<{ label: string; value: string }>
  }
  interface FormExpose {
    validate: () => Promise<boolean>
    clearValidate: () => void
  }

  const emit = defineEmits<{ success: [] }>()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const dialogRef = ref<ArtDialogExpose<EsopDocumentDialogOpenData>>()
  const formRef = ref<FormExpose>()
  const activeTab = ref<'document' | 'scope'>('document')
  const categories = shallowRef<EsopCategory[]>([])
  const references = shallowRef<EsopReferenceOptions>({ materials: [], routes: [] })
  const tenantOptions = ref<Array<{ label: string; value: string }>>([])
  const treeProps = { label: 'categoryName', children: 'children', disabled: 'disabled' }
  const categoryTreeUtils = new TreeUtils({
    idKey: 'id',
    parentKey: 'parentId',
    childrenKey: 'children',
    deepClone: false
  })
  const initial = (): EsopDocumentInput => ({
    tenantId: '',
    categoryId: '',
    documentCode: '',
    documentName: '',
    versionNo: 'V1.0',
    attachmentUrl: '',
    attachmentName: '',
    attachmentType: '',
    attachmentSize: undefined,
    description: '',
    effectiveDate: dayjs().format('YYYY-MM-DD'),
    status: 'enabled',
    materialIds: [],
    routeIds: []
  })
  const form = reactive<EsopDocumentInput>(initial())
  const scopedCategories = computed(() =>
    categoryTreeUtils.mapTree(
      categoryTreeUtils.listToTree(
        categoryTreeUtils
          .treeToList(categories.value)
          .filter((node) => node.tenantId === form.tenantId)
      ),
      (node) => ({ ...node, disabled: node.status !== 'enabled' })
    )
  )
  const scopedReferences = computed<EsopReferenceOptions>(() => ({
    materials: references.value.materials.filter((item) => item.tenantId === form.tenantId),
    routes: references.value.routes.filter((item) => item.tenantId === form.tenantId)
  }))
  const scopeCount = computed(() => form.materialIds.length + form.routeIds.length)
  const documentItems = computed<FormItem[]>(() => [
    {
      label: '目标租户',
      key: 'tenantId',
      type: 'select',
      span: 24,
      options: tenantOptions.value,
      props: {
        disabled: Boolean(form.id),
        filterable: true,
        placeholder: '请选择本次维护的数据归属租户'
      }
    },
    {
      label: '文档编号',
      key: 'documentCode',
      type: 'input',
      span: 12,
      props: { maxlength: 60, placeholder: '如 ESOP-ASM-001' }
    },
    {
      label: '文档名称',
      key: 'documentName',
      type: 'input',
      span: 12,
      props: { maxlength: 160, placeholder: '请输入标准作业指导书名称' }
    },
    { label: '文档分类', key: 'categoryId', type: 'text', span: 10 },
    {
      label: '版本号',
      key: 'versionNo',
      type: 'input',
      span: 4,
      props: { maxlength: 30, placeholder: 'V1.0' }
    },
    {
      label: '生效日期',
      key: 'effectiveDate',
      type: 'date',
      span: 6,
      props: { valueFormat: 'YYYY-MM-DD', class: '!w-full', clearable: true }
    },
    {
      label: '状态',
      key: 'status',
      type: 'select',
      span: 4,
      options: getDictMap.value.commonEnabledStatus ?? [],
      props: { placeholder: '请选择状态' }
    },
    { label: '受控附件', key: 'attachmentUrl', type: 'text', span: 24 },
    {
      label: '文档说明',
      key: 'description',
      type: 'textarea',
      span: 24,
      props: { rows: 3, maxlength: 1000, showWordLimit: true, resize: 'none' }
    }
  ])
  void userStore.ensureDictLoaded('commonEnabledStatus')
  const scopeItems: FormItem[] = [
    { label: '适用产品 / 物料', key: 'materialIds', type: 'text', span: 24 },
    { label: '适用工艺路线', key: 'routeIds', type: 'text', span: 24 }
  ]
  const rules: FormRules<EsopDocumentInput> = {
    tenantId: [{ required: true, message: '请选择目标租户', trigger: 'change' }],
    documentCode: [
      { required: true, message: '请输入文档编号', trigger: 'blur' },
      {
        pattern: /^[A-Z0-9][A-Z0-9._-]{1,59}$/,
        message: '请输入 2–60 位大写字母、数字、点、横线或下划线',
        trigger: 'blur'
      }
    ],
    documentName: [{ required: true, message: '请输入文档名称', trigger: 'blur' }],
    categoryId: [{ required: true, message: '请选择文档分类', trigger: 'change' }],
    versionNo: [{ required: true, message: '请输入版本号', trigger: 'blur' }],
    attachmentUrl: [{ required: true, message: '请上传 ESOP 附件', trigger: 'change' }]
  }
  const handleAttachmentChange = (resources: Api.DataCenter.Resources.ResourceListItem[]): void => {
    const resource = resources[0]
    if (!resource) return
    if (resource.tenantId !== form.tenantId) {
      form.attachmentUrl = ''
      form.attachmentName = ''
      form.attachmentType = ''
      form.attachmentSize = undefined
      ElMessage.warning('附件不属于当前目标租户，请重新选择')
      return
    }
    form.attachmentUrl = resource.url ?? ''
    form.attachmentName =
      resource.originName || decodeURIComponent(resource.url?.split('/').pop() || 'ESOP附件')
    form.attachmentType = resource.suffix || resource.mimeType || ''
    form.attachmentSize = resource.sizeByte
    if (!form.documentName) form.documentName = form.attachmentName.replace(/\.[^.]+$/, '')
  }
  const submit = async (): Promise<boolean> => {
    try {
      activeTab.value = 'document'
      await nextTick()
      await formRef.value?.validate()
      await saveEsopDocument({
        ...form,
        documentCode: form.documentCode.trim().toUpperCase(),
        documentName: form.documentName.trim(),
        attachmentName:
          form.attachmentName ||
          decodeURIComponent(form.attachmentUrl.split('/').pop() || 'ESOP附件')
      })
      emit('success')
      return true
    } catch {
      return false
    }
  }
  const handleOpen = async (data: EsopDocumentDialogOpenData): Promise<void> => {
    Object.assign(form, initial())
    activeTab.value = 'document'
    categories.value = data.categories
    references.value = data.references
    tenantOptions.value = data.tenantOptions
    form.tenantId = data.row?.tenantId || data.tenantId
    form.categoryId = data.categoryId || ''
    if (data.row) {
      Object.assign(form, {
        id: data.mode === 'edit' ? data.row.id : undefined,
        tenantId: data.row.tenantId,
        categoryId: data.row.categoryId,
        documentCode: data.mode === 'copy' ? '' : data.row.documentCode,
        documentName:
          data.mode === 'copy' ? `${data.row.documentName}（副本）` : data.row.documentName,
        versionNo: data.row.versionNo,
        attachmentUrl: data.row.attachmentUrl,
        attachmentName: data.row.attachmentName,
        attachmentType: data.row.attachmentType || '',
        attachmentSize: data.row.attachmentSize ?? undefined,
        description: data.row.description || '',
        effectiveDate: data.row.effectiveDate || '',
        status: data.mode === 'copy' ? 'enabled' : data.row.status,
        materialIds: data.row.bindings.flatMap((item) =>
          item.targetType === 'material' && item.materialId ? [item.materialId] : []
        ),
        routeIds: data.row.bindings.flatMap((item) =>
          item.targetType === 'process_route' && item.processRouteId ? [item.processRouteId] : []
        )
      })
    }
    await nextTick()
    formRef.value?.clearValidate()
    await dialogRef.value?.handleOpen(data, {
      title: data.mode === 'copy' ? '复制 ESOP' : data.mode === 'edit' ? '编辑 ESOP' : '新增 ESOP',
      subtitle: '维护受控文档、版本与产品工艺适用范围',
      confirmText: data.mode === 'copy' ? '复制并新增' : '保存 ESOP',
      contentMaxHeight: 'calc(100vh - 150px)',
      onConfirm: submit
    })
  }
  watch(
    () => form.tenantId,
    (value, previous) => {
      if (value === previous || !previous) return
      form.categoryId = ''
      form.materialIds = []
      form.routeIds = []
      form.attachmentUrl = ''
      form.attachmentName = ''
      form.attachmentType = ''
      form.attachmentSize = undefined
    }
  )
  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .esop-document-dialog {
    display: grid;
    gap: 0;

    &__identity {
      margin-bottom: var(--art-space-2);
    }

    &__tabs {
      :deep(.el-tabs__header) {
        margin: 0;
      }

      :deep(.el-tabs__nav-wrap::after) {
        height: 1px;
        background: var(--el-border-color-lighter);
      }

      :deep(.el-tabs__item) {
        min-width: 108px;
        height: 38px;
        padding: 0 var(--art-space-4);
      }
    }

    &__tab-label {
      display: inline-flex;
      gap: var(--art-space-2);
      align-items: center;
      white-space: nowrap;
    }

    &__tab-count {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 20px;
      padding: 0 6px;
      font-size: 10px;
      font-variant-numeric: tabular-nums;
      line-height: 1;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 10%, transparent);
      border-radius: 999px;
    }

    &__panel {
      min-height: 360px;
      padding: var(--art-space-4);
      background: color-mix(in srgb, var(--el-fill-color-extra-light) 45%, var(--el-bg-color));
      border: 1px solid var(--el-border-color-lighter);
      border-top: 0;
      border-radius: 0 0 var(--el-border-radius-base) var(--el-border-radius-base);
    }

    &__section-heading {
      display: flex;
      gap: var(--art-space-3);
      align-items: center;
      justify-content: space-between;
      padding-bottom: var(--art-space-3);
      margin-bottom: var(--art-space-2);
      border-bottom: 1px solid var(--el-border-color-extra-light);

      strong,
      p {
        display: block;
        margin: 0;
      }

      p,
      > span {
        margin-top: 3px;
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      > span {
        flex: none;
        padding: 4px 8px;
        background: var(--el-fill-color-lighter);
        border-radius: 999px;
      }
    }

    &__category-field {
      display: grid;
      gap: var(--art-space-1);

      p {
        display: flex;
        gap: var(--art-space-1);
        align-items: center;
        margin: 0;
        font-size: 11px;
        line-height: 18px;
        color: var(--el-color-warning);
      }
    }

    &__scope-note {
      display: flex;
      gap: var(--art-space-2);
      align-items: flex-start;
      padding: var(--art-space-3) var(--art-space-4);
      color: var(--el-text-color-secondary);
      background: color-mix(in srgb, var(--el-color-info) 7%, var(--el-bg-color));
      border: 1px solid color-mix(in srgb, var(--el-color-info) 14%, transparent);
      border-radius: var(--el-border-radius-base);

      > span {
        flex: none;
        color: var(--el-color-info);
      }

      p {
        margin: 0;
        font-size: 12px;
        line-height: 20px;
      }
    }

    @media (width <= 720px) {
      &__section-heading {
        align-items: flex-start;

        > span {
          display: none;
        }
      }

      &__panel {
        padding: var(--art-space-3);
      }
    }
  }
</style>

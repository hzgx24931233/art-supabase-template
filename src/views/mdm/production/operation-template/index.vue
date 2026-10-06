<template>
  <div class="template-workspace business-workspace-page art-full-height">
    <ProductionWorkspaceHeader
      title="作业模板"
      description="将作业要求整理为可执行的任务清单，统一评分标准，并绑定到产品工艺工序。"
      icon="ri:file-list-3-line"
      capability="标准作业配置"
      :metrics="workspaceMetrics"
      ><template #actions><BusinessTableWorkspaceActions :table="activeTable" /></template
    ></ProductionWorkspaceHeader>
    <div class="template-workspace__body">
      <ArtTableQuery
        v-if="table.tab === 'templates'"
        ref="templateTable"
        v-model="table.search"
        :api-fn="fetchTemplates"
        :search-items="searchItems"
        :columns-factory="templateColumns"
        :header-actions="headerActions"
        header-actions-placement="workspace"
        :selection-actions="selectionActions"
        :enable-cache="false"
        :search-bar-props="{ span: 8, labelWidth: 82, showExpand: false }"
        :on-success="handleTemplateSuccess"
        focusable
        focus-scope-selector=".template-workspace__body"
        :table-props="{
          rowKey: 'id',
          tableLayout: 'fixed',
          emptyText: '暂无作业模板',
          emptyDescription: '新增模板，添加任务项后即可绑定到工艺路线。'
        }"
      >
        <template #table-header-top>
          <div class="template-workspace__view-switch">
            <ElSegmented v-model="table.tab" :options="viewOptions" aria-label="作业模板视图" />
          </div>
        </template>
      </ArtTableQuery>
      <ArtTableQuery
        v-else
        ref="bindingTable"
        v-model="table.bindingSearch"
        :api-fn="fetchBindings"
        :search-items="bindingSearchItems"
        :columns-factory="bindingColumns"
        :header-actions="bindingHeaderActions"
        header-actions-placement="workspace"
        :selection-actions="bindingActions"
        :enable-cache="false"
        :search-bar-props="{ span: 8, labelWidth: 82, showExpand: false }"
        :on-success="handleBindingSuccess"
        focusable
        focus-scope-selector=".template-workspace__body"
        :table-props="{
          rowKey: 'id',
          tableLayout: 'fixed',
          emptyText: '暂无工艺工序',
          emptyDescription: '请先在工艺路线中维护产品和工序明细。'
        }"
      >
        <template #table-header-top>
          <div class="template-workspace__view-switch">
            <ElSegmented v-model="table.tab" :options="viewOptions" aria-label="作业模板视图" />
          </div>
        </template>
      </ArtTableQuery>
    </div>
    <TemplateDialog ref="templateDialog" @success="refresh" /><BindingDialog
      ref="bindingDialog"
      @success="refresh"
    /><RecordDetail ref="detail" />
  </div>
</template>
<script setup lang="tsx">
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'

  const commonEnabledDisabledStatusOptions = useDictionaryOptions(
    'commonEnabledDisabledStatus',
    (value) => value === 'enabled'
  )
  const mdmOperationTemplateBindingStatusOptions = useDictionaryOptions(
    'mdmOperationTemplateBindingStatus',
    (value) => value === 'true'
  )
  const { confirmAction } = useArtFeedback()
  import { ref, reactive, computed } from 'vue'
  import { ElButton, ElTag, ElMessage } from 'element-plus'
  import type { ColumnOption } from '@/types'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction,
    ArtTableQueryProps
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtButtonMore from '@/components/core/forms/art-button-more/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import type { BusinessWorkspaceMetric } from '@/components/business/business-workspace-header/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import { useAuth } from '@/hooks/core/useAuth'
  import { exportExcel } from '@/utils/file'
  import { formatWithDayjs } from '@/utils/time'
  import {
    fetchOperationTemplates,
    deleteOperationTemplates,
    setOperationTemplatesEnabled,
    fetchProcessSteps,
    bindOperationTemplate,
    type OperationTemplate,
    type ProcessStep,
    type WorkspaceQuery
  } from '@/api/mdm'
  import TemplateDialog from './modules/template-dialog.vue'
  import BindingDialog from './modules/binding-dialog.vue'
  import RecordDetail from '../modules/record-detail.vue'
  import ProductionWorkspaceHeader from '../modules/production-workspace-header.vue'
  defineOptions({ name: 'MdmOperationTemplate' })
  const user = useUserStore()
  const { hasAuth } = useAuth()
  const templateTable = ref<ArtTableQueryExpose>()
  const bindingTable = ref<ArtTableQueryExpose>()
  const templateDialog = ref<InstanceType<typeof TemplateDialog>>()
  const bindingDialog = ref<InstanceType<typeof BindingDialog>>()
  const detail = ref<InstanceType<typeof RecordDetail>>()
  const table = reactive({
    tab: 'templates',
    search: { keyword: '', enabled: undefined as boolean | undefined },
    bindingSearch: { keyword: '', bound: undefined as boolean | undefined }
  })
  const overview = reactive({
    templateTotal: 0,
    templateRows: [] as OperationTemplate[],
    bindingTotal: 0,
    bindingRows: [] as ProcessStep[]
  })
  const viewOptions = [
    { label: '作业模板', value: 'templates' },
    { label: '工序绑定', value: 'bindings' }
  ]
  const activeTable = computed(() =>
    table.tab === 'templates' ? templateTable.value : bindingTable.value
  )
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() =>
    table.tab === 'templates'
      ? [
          {
            label: '模板总数',
            value: overview.templateTotal,
            description: '当前查询范围内的标准作业',
            icon: 'ri:file-list-3-line'
          },
          {
            label: '本页启用',
            value: overview.templateRows.filter((row) => row.enabled).length,
            description: '可继续绑定到工艺工序',
            icon: 'ri:checkbox-circle-line',
            tone: 'success'
          },
          {
            label: '本页任务项',
            value: overview.templateRows.reduce((total, row) => total + row.items.length, 0),
            description: '当前页模板包含的作业要求',
            icon: 'ri:list-check-3'
          }
        ]
      : [
          {
            label: '工序总数',
            value: overview.bindingTotal,
            description: '当前查询范围内的产品工序',
            icon: 'ri:route-line'
          },
          {
            label: '本页已绑定',
            value: overview.bindingRows.filter((row) => row.templateId).length,
            description: '已关联标准作业模板',
            icon: 'ri:link',
            tone: 'success'
          },
          {
            label: '本页待绑定',
            value: overview.bindingRows.filter((row) => !row.templateId).length,
            description: '尚未关联作业模板',
            icon: 'ri:link-unlink',
            tone: 'warning'
          }
        ]
  )
  const searchItems: SearchFormItem[] = [
    {
      key: 'keyword',
      label: '作业模板',
      type: 'input',
      props: { placeholder: '搜索模板名称', clearable: true }
    },
    {
      key: 'enabled',
      label: '状态',
      type: 'select',
      props: {
        clearable: true,
        options: commonEnabledDisabledStatusOptions
      }
    }
  ]
  const bindingSearchItems: SearchFormItem[] = [
    {
      key: 'keyword',
      label: '工序',
      type: 'input',
      props: { placeholder: '工序编号 / 名称', clearable: true }
    },
    {
      key: 'bound',
      label: '绑定状态',
      type: 'select',
      props: {
        clearable: true,
        options: mdmOperationTemplateBindingStatusOptions
      }
    }
  ]
  const fetchTemplates = (p: WorkspaceQuery, o?: { signal?: AbortSignal }) =>
    fetchOperationTemplates({ ...p, tenantId: user.info.tenantId || '' }, o)
  const fetchBindings = (p: WorkspaceQuery & { bound?: boolean }, o?: { signal?: AbortSignal }) =>
    fetchProcessSteps({ ...p, tenantId: user.info.tenantId || '' }, o)
  const refresh = () => activeTable.value?.refreshData()
  const handleTemplateSuccess: ArtTableQueryProps['onSuccess'] = (rows, response) => {
    overview.templateRows = rows as OperationTemplate[]
    overview.templateTotal = Number(response.total ?? rows.length)
  }
  const handleBindingSuccess: ArtTableQueryProps['onSuccess'] = (rows, response) => {
    overview.bindingRows = rows as ProcessStep[]
    overview.bindingTotal = Number(response.total ?? rows.length)
  }
  const open = (mode: 'add' | 'copy' | 'edit' | 'view', row?: OperationTemplate) =>
    void templateDialog.value?.handleOpen({ mode, row })
  async function remove(row: OperationTemplate) {
    try {
      await confirmAction(`删除“${row.name}”？已绑定的模板需先解绑。`, '删除模板', {
        type: 'warning'
      })
      await deleteOperationTemplates([row.id])
      await refresh()
    } catch {
      /* API owns errors; cancellation keeps the record. */
    }
  }
  async function toggle(row: OperationTemplate) {
    try {
      await setOperationTemplatesEnabled([row.id], !row.enabled)
      await refresh()
    } catch {
      /* API owns errors. */
    }
  }
  async function unbind(ids: string[]) {
    try {
      await confirmAction(`确认解除 ${ids.length} 个工序的模板绑定？`, '解除绑定', {
        type: 'warning'
      })
      await bindOperationTemplate(ids, null)
      ElMessage.success({ message: '操作成功', duration: 1500 })
      await refresh()
    } catch {
      /* API owns errors. */
    }
  }
  const templateColumns = (): ColumnOption<OperationTemplate>[] => [
    { type: 'selection', width: 48 },
    {
      prop: 'name',
      label: '作业模板',
      minWidth: 230,
      fixed: 'left',
      formatter: (r) => (
        <div class="template-workspace__identity">
          <span aria-hidden="true">
            <ArtSvgIcon icon="ri:file-list-3-line" />
          </span>
          <span>
            <ElButton
              link
              type="primary"
              disabled={!hasAuth('MdmOperationTemplate:View')}
              onClick={() => open('view', r)}
            >
              {r.name}
            </ElButton>
            <small>{r.items.length} 个任务项</small>
          </span>
        </div>
      )
    },
    { prop: 'totalScore', label: '总记分', width: 100 },
    {
      prop: 'createTime',
      label: '创建时间',
      minWidth: 170,
      formatter: (row) => formatWithDayjs(row.createTime)
    },
    {
      prop: 'updateTime',
      label: '修改时间',
      minWidth: 170,
      formatter: (row) => formatWithDayjs(row.updateTime)
    },
    {
      prop: 'enabled',
      label: '状态',
      width: 90,
      formatter: (r) => (
        <ElTag type={r.enabled ? 'success' : 'info'}>{r.enabled ? '启用' : '禁用'}</ElTag>
      )
    },
    {
      prop: 'operation',
      label: '操作',
      width: 164,
      fixed: 'right',
      formatter: (r) => (
        <div class="template-workspace__actions">
          <ArtButtonTable
            type="view"
            permission="MdmOperationTemplate:View"
            onClick={() => open('view', r)}
          />
          <ArtButtonTable
            type="edit"
            permission="MdmOperationTemplate:Edit"
            onClick={() => open('edit', r)}
          />
          <ArtButtonMore
            list={[
              {
                key: 'copy',
                label: '复制',
                icon: 'ri:file-copy-line',
                auth: 'MdmOperationTemplate:Copy'
              },
              {
                key: 'delete',
                label: '删除',
                icon: 'ri:delete-bin-6-line',
                color: 'var(--el-color-danger)',
                auth: 'MdmOperationTemplate:Delete'
              },
              {
                key: 'toggle',
                label: r.enabled ? '禁用' : '启用',
                icon: r.enabled ? 'ri:forbid-line' : 'ri:checkbox-circle-line',
                auth: r.enabled ? 'MdmOperationTemplate:Disable' : 'MdmOperationTemplate:Enable'
              }
            ]}
            onClick={(item) =>
              item.key === 'copy'
                ? open('copy', r)
                : item.key === 'delete'
                  ? void remove(r)
                  : void toggle(r)
            }
          />
        </div>
      )
    }
  ]
  const bindingLabels = {
    productCode: '产品编码',
    productName: '产品名称',
    spec: '规格型号',
    route: '路线名称',
    code: '工序编号',
    name: '工序名称',
    workCenter: '工作中心',
    template: '作业模板'
  }
  const bindingDisplay = (r: ProcessStep) => ({
    productCode: r.route?.material?.materialCode,
    productName: r.route?.material?.materialName,
    spec: r.route?.material?.specificationModel,
    route: r.route?.name,
    code: r.code,
    name: r.name,
    workCenter: r.workCenter ? `${r.workCenter.name}（${r.workCenter.code}）` : undefined,
    template: r.template?.name
  })
  const bindingColumns = (): ColumnOption<ProcessStep>[] => [
    { type: 'selection', width: 48 },
    {
      prop: 'product',
      label: '产品',
      minWidth: 240,
      fixed: 'left',
      link: {
        permission: 'MdmOperationTemplate:View',
        onClick: (row) =>
          void detail.value?.handleOpen('绑定详情', bindingDisplay(row), bindingLabels)
      },
      formatter: (r) => (
        <div class="template-workspace__stack">
          <strong title={r.route?.material?.materialName || ''}>
            {r.route?.material?.materialName || '产品待关联'}
          </strong>
          <small>
            {[r.route?.material?.materialCode, r.route?.material?.specificationModel]
              .filter(Boolean)
              .join(' · ') || '—'}
          </small>
        </div>
      )
    },
    {
      prop: 'route',
      label: '工艺路线',
      minWidth: 160,
      formatter: (r) => r.route?.name || '—'
    },
    {
      prop: 'process',
      label: '工序',
      minWidth: 190,
      formatter: (r) => (
        <div class="template-workspace__stack">
          <strong title={r.name}>{r.name}</strong>
          <small>{r.code}</small>
        </div>
      )
    },
    {
      prop: 'workCenter',
      label: '工作中心',
      minWidth: 170,
      formatter: (r) => bindingDisplay(r).workCenter || '—'
    },
    {
      prop: 'template',
      label: '作业模板',
      minWidth: 170,
      formatter: (r) => r.template?.name || '未绑定'
    },
    {
      prop: 'operation',
      label: '操作',
      width: 174,
      fixed: 'right',
      formatter: (r) => (
        <div class="template-workspace__actions">
          <ArtButtonTable
            type="view"
            permission="MdmOperationTemplate:View"
            onClick={() =>
              void detail.value?.handleOpen('绑定详情', bindingDisplay(r), bindingLabels)
            }
          />
          {hasAuth('MdmOperationTemplate:Bind') && (
            <ElButton
              link
              type="primary"
              onClick={() => void bindingDialog.value?.handleOpen([r.id])}
            >
              绑定
            </ElButton>
          )}
          {hasAuth('MdmOperationTemplate:Unbind') && (
            <ElButton link disabled={!r.templateId} onClick={() => void unbind([r.id])}>
              解绑
            </ElButton>
          )}
        </div>
      )
    }
  ]
  async function exportTemplates() {
    const rows: OperationTemplate[] = []
    for (let current = 1; current <= 10; current++) {
      const r = await fetchTemplates({ ...table.search, tenantId: '', current, size: 1000 })
      if (r.total > 10000) {
        ElMessage.warning('请缩小筛选范围至 10000 条以内')
        return
      }
      rows.push(...r.data)
      if (rows.length >= r.total) break
    }
    await exportExcel({
      data: rows.map((r) => ({ ...r, status: r.enabled ? '启用' : '禁用' })),
      columns: [
        { key: 'name', title: '作业模板' },
        { key: 'totalScore', title: '总记分' },
        { key: 'createTime', title: '创建时间' },
        { key: 'createBy', title: '创建人' },
        { key: 'updateTime', title: '修改时间' },
        { key: 'sort', title: '排序' },
        { key: 'textColor', title: '文字颜色' },
        { key: 'tagType', title: '标签样式' },
        { key: 'status', title: '状态' }
      ],
      filename: '作业模板'
    })
  }
  async function exportBindings() {
    const rows: ProcessStep[] = []
    for (let current = 1; current <= 10; current++) {
      const r = await fetchBindings({ ...table.bindingSearch, tenantId: '', current, size: 1000 })
      if (r.total > 10000) {
        ElMessage.warning('请缩小筛选范围至 10000 条以内')
        return
      }
      rows.push(...r.data)
      if (rows.length >= r.total) break
    }
    await exportExcel({
      data: rows.map(bindingDisplay),
      columns: Object.entries(bindingLabels).map(([key, title]) => ({ key, title })),
      filename: '作业模板绑定'
    })
  }
  const headerActions: ArtTableQueryHeaderAction[] = [
    {
      type: 'add',
      label: '新增模板',
      permission: 'MdmOperationTemplate:Add',
      onClick: () => open('add')
    },
    { type: 'export', permission: 'MdmOperationTemplate:Export', onClick: exportTemplates }
  ]
  const selectionActions: ArtTableQueryHeaderAction[] = [
    {
      type: 'delete',
      permission: 'MdmOperationTemplate:Delete',
      onClick: async (c) => {
        await deleteOperationTemplates(c.selectedRows.map((r) => String(r.id)))
        await refresh()
      }
    },
    {
      key: 'enable',
      label: '启用',
      permission: 'MdmOperationTemplate:Enable',
      selectionRequired: true,
      onClick: async (c) => {
        await setOperationTemplatesEnabled(
          c.selectedRows.map((r) => String(r.id)),
          true
        )
        await refresh()
      }
    },
    {
      key: 'disable',
      label: '禁用',
      permission: 'MdmOperationTemplate:Disable',
      confirm: true,
      selectionRequired: true,
      onClick: async (c) => {
        await setOperationTemplatesEnabled(
          c.selectedRows.map((r) => String(r.id)),
          false
        )
        await refresh()
      }
    }
  ]
  const bindingHeaderActions: ArtTableQueryHeaderAction[] = [
    { type: 'export', permission: 'MdmOperationTemplate:Export', onClick: exportBindings }
  ]
  const bindingActions: ArtTableQueryHeaderAction[] = [
    {
      key: 'bind',
      label: '批量绑定',
      permission: 'MdmOperationTemplate:Bind',
      selectionRequired: true,
      onClick: (c) => void bindingDialog.value?.handleOpen(c.selectedRows.map((r) => String(r.id)))
    },
    {
      key: 'unbind',
      label: '批量解绑',
      permission: 'MdmOperationTemplate:Unbind',
      selectionRequired: true,
      onClick: (c) => unbind(c.selectedRows.map((r) => String(r.id)))
    }
  ]
</script>
<style scoped lang="scss">
  .template-workspace {
    gap: 12px;
    min-width: 0;

    &__body {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 12px;
      min-width: 0;
      min-height: 0;
    }

    &__body > .art-table-query {
      flex: 1;
      min-height: 0;
    }

    &__view-switch {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
    }

    :deep(.template-workspace__identity) {
      display: grid;
      grid-template-columns: 36px minmax(0, 1fr);
      gap: 10px;
      align-items: center;
      min-width: 0;

      > span:first-child {
        display: grid;
        place-items: center;
        width: 36px;
        height: 36px;
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 9%, var(--el-bg-color));
        border-radius: var(--el-border-radius-base);
      }
    }

    :deep(.template-workspace__identity > span:last-child),
    :deep(.template-workspace__stack),
    :deep(.template-workspace__identity strong),
    :deep(.template-workspace__identity small),
    :deep(.template-workspace__stack strong),
    :deep(.template-workspace__stack small) {
      display: block;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    :deep(.template-workspace__identity small),
    :deep(.template-workspace__stack small) {
      margin-top: 2px;
      font-size: 11px;
      color: var(--el-text-color-secondary);
    }

    :deep(.el-segmented) {
      --el-segmented-item-selected-color: var(--el-color-white);
      --el-segmented-item-selected-bg-color: var(--theme-color);
    }
  }
</style>

<template>
  <ArtPermissionGuard permission="PmProjectOrg:View">
    <div class="project-org-page">
      <BusinessWorkspaceHeader
        eyebrow="PROJECT ORGANIZATION & RESPONSIBILITIES"
        title="项目部组织架构"
        description="维护内部项目部、外部参建单位、岗位与人员责任边界，并以审批基线支撑任务分派。"
        icon="ri:organization-chart"
        :tags="tags"
        :metrics="metrics"
      >
        <template #actions>
          <ElSelect
            v-model="state.projectId"
            class="project-org-page__project-select"
            placeholder="选择项目"
            @change="handleProjectChange"
          >
            <ElOption
              v-for="project in state.projects"
              :key="project.id"
              :label="`${project.projectName} · ${project.projectCode}`"
              :value="project.id"
            />
          </ElSelect>
          <ElSelect
            v-model="state.versionId"
            class="project-org-page__version-select"
            placeholder="选择组织版本"
            :disabled="!state.versions.length"
            @change="loadWorkspace"
          >
            <ElOption
              v-for="version in state.versions"
              :key="version.id"
              :label="`V${version.version_no} · ${versionStatusLabel(version.status)}`"
              :value="version.id"
            />
          </ElSelect>
          <ElButton
            v-auth="'PmProjectOrg:ManageVersion'"
            type="primary"
            :disabled="!state.projectId"
            @click="createDraft"
          >
            <ArtSvgIcon icon="ri:add-line" /> 新建版本
          </ElButton>
          <ElButton
            v-auth="'PmProjectOrg:Export'"
            :disabled="!state.workspace.nodes.length"
            @click="exportImage"
          >
            <ArtSvgIcon icon="ri:image-line" /> 导出图片
          </ElButton>
          <ElButton
            v-auth="'PmProjectOrg:Export'"
            :disabled="!state.workspace.assignments.length"
            @click="exportRoster"
          >
            <ArtSvgIcon icon="ri:file-excel-2-line" /> 花名册 Excel
          </ElButton>
          <ElButton
            v-auth="'PmProjectOrg:Export'"
            :disabled="!canGenerateHandbook"
            @click="generateHandbook"
          >
            <ArtSvgIcon icon="ri:file-word-2-line" /> 生成组织手册
          </ElButton>
        </template>
      </BusinessWorkspaceHeader>

      <ElAlert
        v-if="!state.loading && !state.error && !state.projects.length"
        class="project-org-page__project-empty-alert"
        title="当前账号具备项目部组织编辑权限，但系统暂无项目主数据"
        description="请先在“项目主数据”创建或启用项目，返回后即可新建组织版本并维护节点。"
        type="info"
        show-icon
        :closable="false"
      />

      <div class="project-org-page__toolbar">
        <div class="project-org-page__version-summary">
          <span
            class="project-org-page__status-dot"
            :class="`is-${state.workspace.version?.status ?? 'empty'}`"
          />
          <div
            ><strong>{{ state.workspace.version?.title || '尚未建立项目部组织版本' }}</strong
            ><small>{{ versionLabel }} · {{ selectedProjectName }}</small></div
          >
        </div>
        <div class="project-org-page__toolbar-actions">
          <ElButton v-auth="'PmProjectOrg:ManageNode'" :disabled="!editable" @click="addNode"
            >新增组织节点</ElButton
          >
          <ElButton
            v-auth="'PmProjectOrg:Submit'"
            type="warning"
            :disabled="!canSubmit"
            @click="submitVersion"
            >提交审批</ElButton
          >
          <ElButton
            v-auth="'PmProjectOrg:Approve'"
            type="success"
            :disabled="!canApprove"
            @click="approveVersion"
            >审批通过</ElButton
          >
        </div>
      </div>

      <div class="project-org-page__content">
        <ArtSectionCard
          title="组织与参建单位"
          subtitle="按内部项目部 / 外部参建单位分组"
          class="project-org-page__directory"
          :loading="state.loading"
          :error="state.error"
          :empty="!state.loading && !state.error && !state.workspace.nodes.length"
          empty-title="暂无组织节点"
          empty-description="创建版本后添加项目部、参建单位、部门或岗位节点。"
          @retry="loadWorkspace"
        >
          <ElScrollbar>
            <div class="project-org-page__tree">
              <button
                v-for="node in rootNodes"
                :key="node.id"
                type="button"
                class="project-org-page__tree-item"
                :class="{ 'is-selected': state.selectedNode?.id === node.id }"
                @click="selectNode(node)"
              >
                <span class="project-org-page__tree-icon"
                  ><ArtSvgIcon :icon="nodeIcon(node.node_type)"
                /></span>
                <span
                  ><strong>{{ node.node_name }}</strong
                  ><small
                    >{{ nodeTypeLabel(node.node_type) }} ·
                    {{ node.group_type === 'internal' ? '内部项目部' : '外部参建单位' }}</small
                  ></span
                >
                <b>{{ childCount(node.id) }}</b>
              </button>
            </div>
          </ElScrollbar>
        </ArtSectionCard>

        <ArtSectionCard
          title="架构画布"
          subtitle="拖拽节点调整布局，点击保存节点后写入版本快照"
          class="project-org-page__canvas-card"
          :loading="state.loading"
          :error="state.error"
          :empty="!state.workspace.version"
          empty-title="请先选择项目版本"
          empty-description="选择项目后创建一个项目部组织架构草稿。"
          @retry="loadWorkspace"
        >
          <VueFlow
            v-if="state.workspace.version"
            v-model:nodes="flowNodes"
            v-model:edges="flowEdges"
            class="project-org-page__canvas"
            fit-view-on-init
            :nodes-draggable="editable"
            @node-click="handleFlowNodeClick"
            @nodes-change="syncLayout"
          >
            <Background pattern-color="var(--el-border-color-lighter)" :gap="24" />
            <Controls />
            <MiniMap pannable zoomable />
          </VueFlow>
        </ArtSectionCard>

        <ArtSectionCard
          title="节点详情"
          subtitle="岗位、人员与单位信息"
          class="project-org-page__detail-card"
          :empty="!state.selectedNode"
          empty-title="选择一个组织节点"
          empty-description="在左侧目录或画布中选择节点后查看详情。"
        >
          <div v-if="state.selectedNode" class="project-org-page__detail">
            <div class="project-org-page__detail-heading"
              ><span class="project-org-page__detail-icon"
                ><ArtSvgIcon :icon="nodeIcon(state.selectedNode.node_type)" /></span
              ><div
                ><strong>{{ state.selectedNode.node_name }}</strong
                ><small>{{ nodeTypeLabel(state.selectedNode.node_type) }}</small></div
              ></div
            >
            <ArtForm
              v-model="state.selectedNode"
              :items="nodeFormItems"
              :span="24"
              label-position="top"
              :show-reset="false"
              :show-submit="false"
              :disabled="!editable"
            />
            <ElButton
              v-auth="'PmProjectOrg:ManageNode'"
              type="primary"
              :disabled="!editable"
              @click="saveNode"
              >保存节点</ElButton
            >
            <div class="project-org-page__detail-stats"
              ><span
                ><b>{{ state.workspace.positions.length }}</b> 个岗位</span
              ><span
                ><b>{{ state.workspace.assignments.length }}</b> 位人员</span
              ><span
                ><b>{{ expiringCertificateCount }}</b> 个证件预警</span
              ></div
            >
            <div class="project-org-page__attachments">
              <div class="project-org-page__attachments-heading">
                <div
                  ><strong>项目部组织架构图与 CAD</strong
                  ><small>上传后绑定当前草稿版本，审批基线会保留附件引用。</small></div
                >
                <span>{{ state.workspace.artifacts.length }} 个附件</span>
              </div>
              <div v-if="state.handbook" class="project-org-page__handbook-links">
                <span>组织手册已生成：</span>
                <a
                  v-if="state.handbook.wordUrl"
                  v-auth="'PmProjectOrg:Export'"
                  :href="state.handbook.wordUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  下载 Word
                </a>
                <a
                  v-if="state.handbook.pdfUrl"
                  v-auth="'PmProjectOrg:Export'"
                  :href="state.handbook.pdfUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  下载 PDF
                </a>
              </div>
              <ArtUploadFile
                v-auth="'PmProjectOrg:UploadArtifact'"
                accept=".dwg,.dxf,.png,.jpg,.jpeg,.webp,.pdf"
                title="上传图纸或图片"
                tip="支持 CAD、PDF 和常见图片格式，单个文件不超过 20 MB"
                @upload-success="handleArtifactUploaded"
              />
            </div>
          </div>
        </ArtSectionCard>
      </div>

      <ArtDialog ref="nodeDialogRef" confirm-on-close>
        <ArtForm
          ref="nodeFormRef"
          v-model="nodeDraft"
          :items="nodeCreateFormItems"
          :rules="nodeCreateRules"
          :span="24"
          label-position="top"
          :show-reset="false"
          :show-submit="false"
        />
      </ArtDialog>

      <ArtDrawer ref="drawerRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="ts">
  import { computed, nextTick, onMounted, reactive, ref } from 'vue'
  import {
    ElAlert,
    ElButton,
    ElMessage,
    ElOption,
    ElSelect,
    ElScrollbar,
    type FormRules
  } from 'element-plus'
  import { Background } from '@vue-flow/background'
  import { Controls } from '@vue-flow/controls'
  import { MiniMap } from '@vue-flow/minimap'
  import { VueFlow, type Edge, type Node, type NodeMouseEvent } from '@vue-flow/core'
  import '@vue-flow/core/dist/style.css'
  import '@vue-flow/core/dist/theme-default.css'
  import '@vue-flow/controls/dist/style.css'
  import '@vue-flow/minimap/dist/style.css'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtUploadFile from '@/components/core/forms/art-upload-file/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric,
    type BusinessWorkspaceTag
  } from '@/components/business/business-workspace-header/index.vue'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { downloadBlob, exportExcel } from '@/utils/file'
  import { normalizeNonNullableText } from '@/utils/form/normalize'
  import { toPng } from 'html-to-image'
  import {
    createProjectOrgVersion,
    createProjectOrgArtifact,
    fetchProjectOrgWorkspace,
    generateProjectOrgHandbook,
    listProjectOptions,
    listProjectOrgVersions,
    saveProjectOrgNode,
    saveProjectOrgNodes,
    toProjectOrgError,
    transitionProjectOrg,
    type ProjectOption,
    type ProjectOrgVersionOption
  } from '@pm/api/project-organization'
  import type { ProjectOrgNode, ProjectOrgWorkspace } from '@pm/types/project-organization'
  import { buildProjectOrgEdges, countExpiringCertificates } from './project-organization-model'

  defineOptions({ name: 'PmProjectOrganization' })

  // Keep the full page permission surface explicit so role management and the permission audit stay aligned.
  const declaredPermissionCodes = [
    'PmProjectOrg:ManagePosition',
    'PmProjectOrg:ManagePerson',
    'PmProjectOrg:ManageParticipant',
    'PmProjectOrg:UploadArtifact',
    'PmProjectOrg:LinkBusiness'
  ] as const
  void declaredPermissionCodes

  interface ViewState {
    projects: ProjectOption[]
    versions: ProjectOrgVersionOption[]
    projectId: string
    versionId: string
    workspace: ProjectOrgWorkspace
    selectedNode: ProjectOrgNode | null
    handbook: { wordUrl: string; pdfUrl: string; projectId: string; versionId: string } | null
    loading: boolean
    error: Error | null
  }
  const { confirmAction } = useArtFeedback()
  const state = reactive<ViewState>({
    projects: [],
    versions: [],
    projectId: '',
    versionId: '',
    workspace: {
      version: null,
      nodes: [],
      positions: [],
      assignments: [],
      participants: [],
      artifacts: []
    },
    selectedNode: null,
    handbook: null,
    loading: false,
    error: null
  })
  const flowNodes = ref<Node[]>([])
  const flowEdges = ref<Edge[]>([])
  let workspaceRequestId = 0
  const drawerRef = ref<ArtDrawerExpose>()
  const nodeDialogRef = ref<ArtDialogExpose<NodeCreateDraft>>()
  const nodeFormRef = ref<InstanceType<typeof ArtForm>>()
  interface NodeCreateDraft {
    parent_id: string | null
    node_type: ProjectOrgNode['node_type']
    group_type: ProjectOrgNode['group_type']
    node_name: string
    node_code: string
  }
  const nodeDraft = reactive<NodeCreateDraft>({
    parent_id: null,
    node_type: 'department',
    group_type: 'internal',
    node_name: '',
    node_code: ''
  })
  const tags: BusinessWorkspaceTag[] = [
    { label: '版本基线', type: 'primary', effect: 'plain' },
    { label: '岗位责任', type: 'success', effect: 'light' },
    { label: '参建单位', type: 'warning', effect: 'light' }
  ]
  const metrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '当前版本',
      value: state.workspace.version ? `V${state.workspace.version.version_no}` : '--',
      description: versionLabel.value,
      icon: 'ri:git-branch-line'
    },
    {
      label: '组织节点',
      value: state.workspace.nodes.length,
      description: '单位、部门、岗位与人员',
      icon: 'ri:node-tree',
      tone: 'info'
    },
    {
      label: '岗位 / 人员',
      value: `${state.workspace.positions.length} / ${state.workspace.assignments.length}`,
      description: '一人可多岗',
      icon: 'ri:team-line',
      tone: 'success'
    },
    {
      label: '证件预警',
      value: expiringCertificateCount.value,
      description: '90 天内到期',
      icon: 'ri:alarm-warning-line',
      tone: expiringCertificateCount.value ? 'danger' : 'success'
    }
  ])
  const selectedProjectName = computed(
    () =>
      state.projects.find((project) => project.id === state.projectId)?.projectName || '未选择项目'
  )
  const versionLabel = computed(
    () =>
      ({
        draft: '草稿',
        submitted: '审批中',
        approved: '已批准',
        rejected: '已退回',
        cancelled: '已取消',
        superseded: '历史版本'
      })[state.workspace.version?.status ?? 'draft'] ?? '未建立'
  )
  const versionStatusLabel = (status: ProjectOrgVersionOption['status']) =>
    ({
      draft: '草稿',
      submitted: '审批中',
      approved: '已批准',
      rejected: '已退回',
      cancelled: '已取消',
      superseded: '历史版本'
    })[status]
  const editable = computed(() => state.workspace.version?.status === 'draft')
  const canSubmit = computed(() => Boolean(editable.value && state.workspace.version))
  const canApprove = computed(() => state.workspace.version?.status === 'submitted')
  const canGenerateHandbook = computed(() => state.workspace.version?.status === 'approved')
  const rootNodes = computed(() => state.workspace.nodes.filter((node) => !node.parent_id))
  const nodeFormItems = computed<FormItem[]>(() => [
    { label: '节点名称', key: 'node_name', type: 'input', props: { maxlength: 120 } },
    { label: '节点编码', key: 'node_code', type: 'input', props: { maxlength: 80 } },
    {
      label: '分组',
      key: 'group_type',
      type: 'radio',
      options: [
        { label: '内部项目部', value: 'internal' },
        { label: '外部参建单位', value: 'external' }
      ]
    }
  ])
  const nodeCreateFormItems = computed<FormItem[]>(() => [
    {
      label: '上级节点',
      key: 'parent_id',
      type: 'select',
      props: {
        clearable: true,
        filterable: true,
        placeholder: '不选择则创建为根节点',
        options: state.workspace.nodes.map((node) => ({
          label: `${node.node_name} · ${nodeTypeLabel(node.node_type)}`,
          value: node.id
        }))
      }
    },
    {
      label: '节点类型',
      key: 'node_type',
      type: 'select',
      props: {
        clearable: false,
        options: [
          { label: '参建单位', value: 'unit' },
          { label: '部门', value: 'department' },
          { label: '岗位', value: 'position' },
          { label: '人员', value: 'person' }
        ]
      }
    },
    {
      label: '归属分组',
      key: 'group_type',
      type: 'radio',
      options: [
        { label: '内部项目部', value: 'internal' },
        { label: '外部参建单位', value: 'external' }
      ]
    },
    {
      label: '自定义节点名称',
      key: 'node_name',
      type: 'input',
      props: {
        maxlength: 120,
        showWordLimit: true,
        placeholder: '例如：技术质量部、项目经理'
      }
    },
    {
      label: '节点编码',
      key: 'node_code',
      type: 'input',
      props: { maxlength: 80, placeholder: '选填，用于后续关联岗位或人员' }
    }
  ])
  const nodeCreateRules: FormRules<NodeCreateDraft> = {
    node_type: [{ required: true, message: '请选择节点类型', trigger: 'change' }],
    group_type: [{ required: true, message: '请选择归属分组', trigger: 'change' }],
    node_name: [{ required: true, message: '请输入自定义节点名称', trigger: 'blur' }]
  }
  const expiringCertificateCount = computed(() =>
    countExpiringCertificates(state.workspace.assignments)
  )

  const nodeIcon = (type: ProjectOrgNode['node_type']) =>
    ({
      unit: 'ri:building-4-line',
      department: 'ri:team-line',
      position: 'ri:briefcase-4-line',
      person: 'ri:user-3-line'
    })[type]
  const nodeTypeLabel = (type: ProjectOrgNode['node_type']) =>
    ({ unit: '参建单位', department: '部门', position: '岗位', person: '人员' })[type]
  const childCount = (id: string) =>
    state.workspace.nodes.filter((node) => node.parent_id === id).length
  const toFlow = () => {
    const nextNodes = state.workspace.nodes.map((node, index) => ({
      id: node.id,
      position: {
        x: node.layout?.x ?? (index % 4) * 220,
        y: node.layout?.y ?? Math.floor(index / 4) * 110
      },
      data: { label: node.node_name },
      type: 'default'
    }))
    const nextEdges = buildProjectOrgEdges(state.workspace.nodes)
    // Clear old edges before replacing nodes; Vue Flow validates each reactive
    // update and otherwise briefly sees edges pointing at the previous version.
    flowEdges.value = []
    flowNodes.value = nextNodes
    void nextTick(() => {
      flowEdges.value = nextEdges
    })
  }
  const loadWorkspace = async () => {
    if (!state.projectId) return
    const requestId = ++workspaceRequestId
    state.loading = true
    state.error = null
    try {
      const workspace = await fetchProjectOrgWorkspace(
        state.projectId,
        state.versionId || undefined
      )
      if (requestId !== workspaceRequestId) return
      state.workspace = workspace
      if (state.handbook && state.handbook.versionId !== state.workspace.version?.id) {
        state.handbook = null
      }
      state.selectedNode = state.workspace.nodes[0] ?? null
      toFlow()
    } catch (error) {
      state.error = toProjectOrgError(error)
    } finally {
      state.loading = false
    }
  }
  const loadVersions = async () => {
    if (!state.projectId) {
      state.versions = []
      state.versionId = ''
      return
    }
    state.versions = await listProjectOrgVersions(state.projectId)
    state.versionId = state.versions[0]?.id ?? ''
  }
  const handleProjectChange = async () => {
    try {
      state.handbook = null
      await loadVersions()
      await loadWorkspace()
    } catch (error) {
      state.error = toProjectOrgError(error)
    }
  }
  const loadProjects = async () => {
    try {
      state.projects = await listProjectOptions()
      state.projectId = state.projects[0]?.id ?? ''
      await loadVersions()
      await loadWorkspace()
    } catch (error) {
      state.error = toProjectOrgError(error)
    }
  }
  const createDraft = async () => {
    if (!state.projectId) return
    const result = await createProjectOrgVersion(
      state.projectId,
      `${selectedProjectName.value}项目部组织架构`
    )
    if ('existing' in result && result.existing) {
      ElMessage.info('当前项目已有草稿或审批中的组织版本，请先完成当前版本流程')
      state.versionId = result.data?.id ?? state.versionId
      await loadWorkspace()
      return
    }
    if (result.data) {
      await loadVersions()
      state.versionId = result.data.id
      await loadWorkspace()
    }
  }
  const addNode = async () => {
    if (!state.workspace.version) return
    Object.assign(nodeDraft, {
      parent_id: state.selectedNode?.id ?? null,
      node_type: 'department',
      group_type: 'internal',
      node_name: '',
      node_code: ''
    })
    nodeFormRef.value?.clearValidate()
    await nodeDialogRef.value?.handleOpen(nodeDraft, {
      title: '新增组织节点',
      subtitle: '选择节点类型并填写名称，可挂在当前选中节点下',
      size: 'sm',
      confirmText: '创建节点',
      onConfirm: createNode,
      dialogProps: { appendToBody: true, closeOnClickModal: false }
    })
  }
  const createNode = async (draft: NodeCreateDraft): Promise<boolean> => {
    if (!state.workspace.version) return false
    try {
      await nodeFormRef.value?.validate()
      const result = await saveProjectOrgNode({
        version_id: state.workspace.version.id,
        parent_id: draft.parent_id,
        node_type: draft.node_type,
        group_type: draft.group_type,
        node_name: normalizeNonNullableText(draft.node_name),
        node_code: normalizeNonNullableText(draft.node_code) || null,
        sort_order: state.workspace.nodes.length
      })
      if (!result.data) return false
      await loadWorkspace()
      state.selectedNode = state.workspace.nodes.find((node) => node.id === result.data?.id) ?? null
      return true
    } catch {
      ElMessage.error('组织节点创建失败，请检查填写内容后重试')
      return false
    }
  }
  const selectNode = (node: ProjectOrgNode) => {
    state.selectedNode = node
  }
  const handleFlowNodeClick = ({ node }: NodeMouseEvent) => {
    const selected = state.workspace.nodes.find((item) => item.id === node.id)
    if (selected) state.selectedNode = selected
  }
  const syncLayout = () => {
    flowNodes.value.forEach((flowNode) => {
      const node = state.workspace.nodes.find((item) => item.id === flowNode.id)
      if (node) node.layout = { x: flowNode.position.x, y: flowNode.position.y }
    })
  }
  const saveNode = async () => {
    if (!state.selectedNode || !editable.value) return
    if (state.workspace.nodes.length) {
      await saveProjectOrgNodes(
        state.workspace.nodes.map((node) => ({
          id: node.id,
          version_id: state.workspace.version!.id,
          parent_id: node.parent_id,
          node_type: node.node_type,
          group_type: node.group_type,
          node_code: node.node_code,
          node_name: node.node_name,
          sort_order: node.sort_order,
          layout: node.layout,
          metadata: node.metadata
        }))
      )
    }
    await loadWorkspace()
  }
  const handleArtifactUploaded = async (resource: Api.DataCenter.Resources.ResourceListItem) => {
    const version = state.workspace.version
    if (!version || !state.projectId || !resource.id) return
    const suffix = (resource.suffix || resource.originName?.split('.').pop() || '').toLowerCase()
    const artifactType: 'cad' | 'image' | 'pdf' = ['dwg', 'dxf'].includes(suffix)
      ? 'cad'
      : suffix === 'pdf'
        ? 'pdf'
        : 'image'
    await createProjectOrgArtifact({
      projectId: state.projectId,
      versionId: version.id,
      artifactType,
      attachmentId: String(resource.id)
    })
    await loadWorkspace()
  }
  const submitVersion = async () => {
    if (!state.workspace.version) return
    await transitionProjectOrg(state.workspace.version.id, 'submit')
    await loadWorkspace()
  }
  const approveVersion = async () => {
    if (!state.workspace.version) return
    await confirmAction('审批通过后将生成不可变基线，是否继续？', '审批项目部组织版本', {
      confirmButtonText: '审批通过'
    })
    await transitionProjectOrg(state.workspace.version.id, 'approve')
    await loadWorkspace()
  }
  const exportImage = async () => {
    const canvas = document.querySelector<HTMLElement>('.project-org-page__canvas')
    if (!canvas) return
    const dataUrl = await toPng(canvas, { pixelRatio: 2, backgroundColor: 'transparent' })
    const response = await fetch(dataUrl)
    downloadBlob(await response.blob(), `${selectedProjectName.value}-项目部组织架构.png`)
  }
  const exportRoster = async () => {
    await exportExcel({
      filename: `${selectedProjectName.value}-人员花名册`,
      columns: [
        { title: '姓名', key: 'person_name' },
        { title: '所属单位', key: 'unit_name' },
        { title: '进场日期', key: 'entry_date' },
        { title: '退场日期', key: 'exit_date' },
        { title: '证件有效期', key: 'certificate_expires_on' }
      ],
      data: state.workspace.assignments
    })
  }
  const generateHandbook = async () => {
    const version = state.workspace.version
    if (!version || !state.projectId || !canGenerateHandbook.value) return
    const result = await generateProjectOrgHandbook(state.projectId, version.id)
    if (result.data) {
      state.handbook = {
        ...result.data,
        projectId: state.projectId,
        versionId: version.id
      }
    }
    await loadWorkspace()
  }
  onMounted(loadProjects)
</script>

<style scoped lang="scss">
  .project-org-page {
    display: flex;
    flex-direction: column;
    gap: var(--art-space-3);
    min-width: 0;
    height: 100%;
    padding: var(--art-space-4);
    overflow: hidden;
    background: var(--art-bg-color);
  }
  .project-org-page__project-select {
    width: 260px;
  }
  .project-org-page__version-select {
    width: 190px;
  }
  .project-org-page__project-empty-alert {
    flex: none;
  }
  .project-org-page__toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: var(--art-space-3);
    align-items: center;
    justify-content: space-between;
    padding: var(--art-space-3) var(--art-space-4);
    background: var(--default-box-color);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--el-border-radius-base);
  }
  .project-org-page__version-summary,
  .project-org-page__toolbar-actions,
  .project-org-page__detail-heading {
    display: flex;
    gap: var(--art-space-3);
    align-items: center;
    min-width: 0;
  }
  .project-org-page__version-summary div,
  .project-org-page__detail-heading div {
    display: grid;
    min-width: 0;
  }
  .project-org-page__version-summary strong,
  .project-org-page__detail-heading strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .project-org-page__version-summary small,
  .project-org-page__detail-heading small {
    color: var(--el-text-color-secondary);
  }
  .project-org-page__status-dot {
    width: 10px;
    height: 10px;
    background: var(--el-color-info);
    border-radius: 50%;
  }
  .project-org-page__status-dot.is-draft {
    background: var(--el-color-warning);
  }
  .project-org-page__status-dot.is-submitted {
    background: var(--el-color-primary);
  }
  .project-org-page__status-dot.is-approved {
    background: var(--el-color-success);
  }
  .project-org-page__content {
    display: grid;
    flex: 1;
    grid-template-columns: minmax(220px, 0.85fr) minmax(420px, 1.8fr) minmax(260px, 0.95fr);
    gap: var(--art-space-3);
    min-height: 0;
  }
  .project-org-page__directory,
  .project-org-page__canvas-card,
  .project-org-page__detail-card {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  .project-org-page__tree {
    display: grid;
    gap: var(--art-space-2);
  }
  .project-org-page__tree-item {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr) 24px;
    gap: var(--art-space-2);
    align-items: center;
    width: 100%;
    padding: var(--art-space-3);
    color: inherit;
    text-align: left;
    cursor: pointer;
    background: var(--art-gray-100);
    border: 1px solid transparent;
    border-radius: var(--el-border-radius-base);
    transition:
      background-color var(--art-motion-duration-fast) ease,
      border-color var(--art-motion-duration-fast) ease;
  }
  .project-org-page__tree-item:hover,
  .project-org-page__tree-item.is-selected {
    background: color-mix(in srgb, var(--theme-color) 9%, var(--default-box-color));
    border-color: color-mix(in srgb, var(--theme-color) 30%, transparent);
  }
  .project-org-page__tree-icon,
  .project-org-page__detail-icon {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    color: var(--theme-color);
    background: color-mix(in srgb, var(--theme-color) 10%, var(--default-box-color));
    border-radius: var(--el-border-radius-base);
  }
  .project-org-page__tree-item > span:nth-child(2) {
    display: grid;
    min-width: 0;
  }
  .project-org-page__tree-item strong,
  .project-org-page__tree-item small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .project-org-page__tree-item small {
    color: var(--el-text-color-secondary);
  }
  .project-org-page__tree-item b {
    color: var(--el-text-color-secondary);
  }
  .project-org-page__canvas {
    height: 100%;
    min-height: 480px;
    background: var(--default-box-color);
  }
  .project-org-page__detail {
    display: grid;
    gap: var(--art-space-4);
  }
  .project-org-page__detail-heading {
    padding-bottom: var(--art-space-3);
    border-bottom: 1px solid var(--el-border-color-lighter);
  }
  .project-org-page__detail-icon {
    width: 40px;
    height: 40px;
    font-size: 20px;
  }
  .project-org-page__detail-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--art-space-2);
    padding-top: var(--art-space-3);
    border-top: 1px solid var(--el-border-color-lighter);
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }
  .project-org-page__detail-stats b {
    display: block;
    color: var(--el-text-color-primary);
    font-size: 18px;
  }
  .project-org-page__attachments {
    display: grid;
    gap: var(--art-space-2);
    padding-top: var(--art-space-3);
    border-top: 1px solid var(--el-border-color-lighter);
  }
  .project-org-page__attachments-heading {
    display: flex;
    gap: var(--art-space-2);
    align-items: flex-start;
    justify-content: space-between;
  }
  .project-org-page__attachments-heading div {
    display: grid;
    min-width: 0;
  }
  .project-org-page__attachments-heading small,
  .project-org-page__attachments-heading > span {
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }
  .project-org-page__handbook-links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--art-space-2);
    align-items: center;
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }
  .project-org-page__handbook-links a {
    color: var(--theme-color);
    text-decoration: none;
  }
  .project-org-page__handbook-links a:hover,
  .project-org-page__handbook-links a:focus-visible {
    text-decoration: underline;
  }
  @media (width <= 1180px) {
    .project-org-page__content {
      grid-template-columns: minmax(220px, 0.75fr) minmax(400px, 1.5fr);
    }
    .project-org-page__detail-card {
      grid-column: 1 / -1;
    }
  }
  @media (width <= 760px) {
    .project-org-page {
      padding: var(--art-space-3);
      overflow: auto;
    }
    .project-org-page__project-select {
      width: 100%;
    }
    .project-org-page__version-select {
      width: 100%;
    }
    .project-org-page__content {
      display: flex;
      flex-direction: column;
    }
    .project-org-page__directory,
    .project-org-page__canvas-card,
    .project-org-page__detail-card {
      flex: 0 0 360px;
    }
    .project-org-page__canvas {
      min-height: 360px;
    }
  }
</style>

import { useSupabase } from '@/hooks'
import { createFriendlySupabaseError } from '@/utils/supabase'
import type {
  ProjectOrgAssignment,
  ProjectOrgNode,
  ProjectOrgParticipant,
  ProjectOrgPosition,
  ProjectOrgVersion,
  ProjectOrgWorkspace
} from '../types/project-organization'

const { supabase, responseHandle } = useSupabase()

export interface ProjectOption {
  id: string
  projectCode: string
  projectName: string
}

export interface ProjectOrgVersionOption {
  id: string
  version_no: number
  status: ProjectOrgVersion['status']
  title: string
}

export async function listProjectOptions(): Promise<ProjectOption[]> {
  const result = await responseHandle<
    Array<{ id: string; project_code: string; project_name: string }>
  >(
    () =>
      supabase
        .from('mdm_project')
        .select('id, project_code, project_name')
        .eq('enabled', true)
        .order('project_name')
        .limit(200),
    { showErrorMessage: true, breakReturn: true, convertToCamel: false }
  )
  return (result.data ?? []).map((row) => ({
    id: row.id,
    projectCode: row.project_code,
    projectName: row.project_name
  }))
}

export async function fetchProjectOrgWorkspace(projectId: string, versionId?: string) {
  const result = await responseHandle<ProjectOrgWorkspace | null>(
    () =>
      supabase.rpc('pm_list_project_org', {
        p_project_id: projectId,
        p_version_id: versionId ?? null
      }),
    { showErrorMessage: true, breakReturn: true, convertToCamel: false }
  )
  return (
    result.data ?? {
      version: null,
      nodes: [],
      positions: [],
      assignments: [],
      participants: [],
      artifacts: []
    }
  )
}

export async function listProjectOrgVersions(
  projectId: string
): Promise<ProjectOrgVersionOption[]> {
  const result = await responseHandle<ProjectOrgVersionOption[]>(
    () =>
      supabase
        .from('pm_project_org_version')
        .select('id, version_no, status, title')
        .eq('project_id', projectId)
        .order('version_no', { ascending: false }),
    { showErrorMessage: true, breakReturn: true, convertToCamel: false }
  )
  return result.data ?? []
}

export async function createProjectOrgVersion(projectId: string, title: string) {
  const active = await responseHandle<ProjectOrgVersion | null>(
    () =>
      supabase
        .from('pm_project_org_version')
        .select('*')
        .eq('project_id', projectId)
        .in('status', ['draft', 'submitted'])
        .order('version_no', { ascending: false })
        .limit(1)
        .maybeSingle(),
    { showErrorMessage: true, breakReturn: true, convertToCamel: false }
  )
  if (active.data) return { ...active, existing: true as const }

  const latest = await responseHandle<{ version_no: number } | null>(
    () =>
      supabase
        .from('pm_project_org_version')
        .select('version_no')
        .eq('project_id', projectId)
        .order('version_no', { ascending: false })
        .limit(1)
        .maybeSingle(),
    { showErrorMessage: true, breakReturn: true, convertToCamel: false }
  )
  const nextVersion = (latest.data?.version_no ?? 0) + 1
  return await responseHandle<ProjectOrgVersion>(
    () =>
      supabase
        .from('pm_project_org_version')
        .insert({ project_id: projectId, version_no: nextVersion, title })
        .select()
        .single(),
    {
      showMessage: true,
      breakReturn: true,
      message: '项目组织草稿已创建',
      convertToCamel: false
    }
  )
}

export async function saveProjectOrgNode(
  node: Partial<ProjectOrgNode> & { version_id: string; node_name: string }
) {
  return await responseHandle<ProjectOrgNode>(
    () => supabase.from('pm_project_org_node').upsert(node).select().single(),
    { showMessage: true, breakReturn: true, message: '组织节点已保存', convertToCamel: false }
  )
}

export async function saveProjectOrgNodes(
  nodes: Array<Partial<ProjectOrgNode> & { version_id: string; node_name: string }>
) {
  return await responseHandle<ProjectOrgNode[]>(
    () => supabase.from('pm_project_org_node').upsert(nodes).select(),
    {
      showMessage: true,
      breakReturn: true,
      message: '组织节点及画布布局已保存',
      convertToCamel: false
    }
  )
}

export async function saveProjectOrgPosition(
  position: Partial<ProjectOrgPosition> & {
    project_id: string
    version_id: string
    position_name: string
    position_code: string
  }
) {
  return await responseHandle<ProjectOrgPosition>(
    () => supabase.from('pm_project_position').upsert(position).select().single(),
    { showMessage: true, breakReturn: true, message: '项目岗位已保存', convertToCamel: false }
  )
}

export async function saveProjectOrgParticipant(
  participant: Partial<ProjectOrgParticipant> & {
    project_id: string
    unit_name: string
    participant_type: ProjectOrgParticipant['participant_type']
  }
) {
  return await responseHandle<ProjectOrgParticipant>(
    () => supabase.from('pm_project_participant').upsert(participant).select().single(),
    { showMessage: true, breakReturn: true, message: '参建单位已保存', convertToCamel: false }
  )
}

export async function saveProjectOrgAssignment(
  assignment: Partial<ProjectOrgAssignment> & {
    project_id: string
    version_id: string
    position_id: string
    person_name: string
  }
) {
  return await responseHandle<ProjectOrgAssignment>(
    () => supabase.from('pm_project_person_assignment').upsert(assignment).select().single(),
    { showMessage: true, breakReturn: true, message: '项目人员已保存', convertToCamel: false }
  )
}

export async function createProjectOrgArtifact(params: {
  projectId: string
  versionId: string
  artifactType: 'org_chart' | 'cad' | 'image' | 'pdf'
  attachmentId: string
}) {
  return await responseHandle(
    () =>
      supabase
        .from('pm_project_org_artifact')
        .insert({
          project_id: params.projectId,
          version_id: params.versionId,
          artifact_type: params.artifactType,
          attachment_id: params.attachmentId,
          generation_status: 'ready'
        })
        .select()
        .single(),
    {
      showMessage: true,
      breakReturn: true,
      message: '组织架构附件已关联当前版本',
      convertToCamel: false
    }
  )
}

export async function transitionProjectOrg(
  versionId: string,
  action: 'submit' | 'approve' | 'reject' | 'cancel',
  note?: string
) {
  return await responseHandle<ProjectOrgVersion>(
    () =>
      supabase.rpc('pm_transition_project_org', {
        p_version_id: versionId,
        p_action: action,
        p_note: note ?? null
      }),
    {
      showMessage: true,
      breakReturn: true,
      message: action === 'submit' ? '项目组织版本已提交审批' : '项目组织版本状态已更新',
      convertToCamel: false
    }
  )
}

export async function fetchProjectOrgResponsibleOptions(projectId: string, versionId?: string) {
  return await responseHandle<
    Array<{
      assignment_id: string
      position_id: string
      person_name: string
      position_name: string
      unit_name: string | null
      status: string
      certificate_expires_on: string | null
    }>
  >(
    () =>
      supabase.rpc('pm_project_org_responsible_options', {
        p_project_id: projectId,
        p_version_id: versionId ?? null
      }),
    { showErrorMessage: true, breakReturn: true, convertToCamel: false }
  )
}

export async function linkProjectOrgResponsible(params: {
  projectId: string
  versionId: string
  businessType: 'wbs' | 'risk' | 'special_plan'
  businessId: string
  responsibilityType: 'owner' | 'author' | 'reviewer' | 'executor'
  assignmentId?: string
  positionId?: string
  notify?: boolean
}) {
  return await responseHandle<string>(
    () =>
      supabase.rpc('pm_link_project_org_responsible', {
        p_project_id: params.projectId,
        p_version_id: params.versionId,
        p_business_type: params.businessType,
        p_business_id: params.businessId,
        p_responsibility_type: params.responsibilityType,
        p_assignment_id: params.assignmentId ?? null,
        p_position_id: params.positionId ?? null,
        p_notify: params.notify ?? true
      }),
    { showMessage: true, breakReturn: true, message: '责任人关联已保存，相关人员将收到通知' }
  )
}

export async function generateProjectOrgHandbook(projectId: string, versionId: string) {
  return await responseHandle<{
    artifacts: Array<{ id: string; artifact_type: string; attachment_id: string }>
    wordUrl: string
    pdfUrl: string
  }>(
    () =>
      supabase.functions.invoke('pm-project-org-handbook', {
        body: { projectId, versionId }
      }),
    { showMessage: true, breakReturn: true, message: '项目组织 Word/PDF 手册已生成' }
  )
}

export function toProjectOrgError(error: unknown): Error {
  return createFriendlySupabaseError(error, '项目组织数据加载失败，请稍后重试')
}

import { useSupabase } from '@/hooks'
import { createFriendlySupabaseError } from '@/utils/supabase'
import type {
  WbsBusinessLink,
  WbsNode,
  WbsScopeBoundary,
  WbsTemplate,
  WbsVersion,
  WbsWorkspace
} from '@pm/types/wbs'

const { supabase, responseHandle } = useSupabase()

export interface WbsProjectOption {
  id: string
  projectCode: string
  projectName: string
}
export interface WbsVersionOption {
  id: string
  version_no: number
  status: WbsVersion['status']
  title: string
}

export async function listWbsProjects(): Promise<WbsProjectOption[]> {
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

export async function listWbsVersions(projectId: string): Promise<WbsVersionOption[]> {
  const result = await responseHandle<WbsVersionOption[]>(
    () =>
      supabase
        .from('pm_wbs_version')
        .select('id,version_no,status,title')
        .eq('project_id', projectId)
        .order('version_no', { ascending: false }),
    { showErrorMessage: true, breakReturn: true, convertToCamel: false }
  )
  return result.data ?? []
}

export async function fetchWbsWorkspace(
  projectId: string,
  versionId?: string
): Promise<WbsWorkspace> {
  const result = await responseHandle<WbsWorkspace | null>(
    () =>
      supabase.rpc('pm_list_wbs_workspace', {
        p_project_id: projectId,
        p_version_id: versionId ?? null
      }),
    { showErrorMessage: true, breakReturn: true, convertToCamel: false }
  )
  return result.data ?? { version: null, nodes: [], deliverables: [], boundaries: [], links: [] }
}

export async function createWbsVersion(projectId: string, title: string, changeNote?: string) {
  return responseHandle<WbsVersion>(
    () =>
      supabase.rpc('pm_create_wbs_version', {
        p_project_id: projectId,
        p_title: title,
        p_change_note: changeNote ?? null
      }),
    { showMessage: true, breakReturn: true, message: 'WBS 草稿已创建', convertToCamel: false }
  )
}

export async function saveWbsNodes(
  nodes: Array<Partial<WbsNode> & { version_id: string; name: string }>
) {
  return responseHandle<WbsNode[]>(() => supabase.rpc('pm_save_wbs_nodes', { p_nodes: nodes }), {
    showMessage: true,
    breakReturn: true,
    message: 'WBS 节点已保存',
    convertToCamel: false
  })
}

export async function listWbsTemplates(): Promise<WbsTemplate[]> {
  const result = await responseHandle<WbsTemplate[]>(
    () =>
      supabase
        .from('pm_wbs_template')
        .select('id,name,category,description,node_count')
        .eq('enabled', true)
        .order('category')
        .order('name'),
    { showErrorMessage: true, breakReturn: true, convertToCamel: false }
  )
  return result.data ?? []
}

export async function copyWbsTemplate(projectId: string, versionId: string, templateId: string) {
  return responseHandle(
    () =>
      supabase.rpc('pm_copy_wbs_template', {
        p_project_id: projectId,
        p_version_id: versionId,
        p_template_id: templateId
      }),
    { showMessage: true, breakReturn: true, message: 'WBS 模板已复制', convertToCamel: false }
  )
}

export async function saveWbsBoundary(
  boundary: Partial<WbsScopeBoundary> & {
    version_id: string
    boundary_type: WbsScopeBoundary['boundary_type']
    content: string
  }
) {
  return responseHandle<WbsScopeBoundary>(
    () => supabase.from('pm_wbs_scope_boundary').upsert(boundary).select().single(),
    { showMessage: true, breakReturn: true, message: '范围边界已保存', convertToCamel: false }
  )
}

export async function transitionWbs(
  versionId: string,
  action: 'submit' | 'approve' | 'reject' | 'cancel',
  note?: string
) {
  return responseHandle<WbsVersion>(
    () =>
      supabase.rpc('pm_transition_wbs', {
        p_version_id: versionId,
        p_action: action,
        p_note: note ?? null
      }),
    {
      showMessage: true,
      breakReturn: true,
      message: action === 'submit' ? 'WBS 已提交审批' : 'WBS 版本状态已更新',
      convertToCamel: false
    }
  )
}

export async function linkWbsBusiness(
  params: Omit<WbsBusinessLink, 'id' | 'business_label' | 'status'>
) {
  return responseHandle(
    () =>
      supabase.rpc('pm_link_wbs_business', {
        p_wbs_node_id: params.wbs_node_id,
        p_business_type: params.business_type,
        p_business_id: params.business_id,
        p_link_role: params.link_role
      }),
    { showMessage: true, breakReturn: true, message: 'WBS 业务关联已保存' }
  )
}

export function toWbsError(error: unknown): Error {
  return createFriendlySupabaseError(error, 'WBS 数据加载失败，请稍后重试')
}

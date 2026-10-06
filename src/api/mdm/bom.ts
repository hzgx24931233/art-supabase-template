import { useSupabase } from '@/hooks'
import { buildOrIlikeFilter } from '@/utils/supabase/search'
import { fetchAllRangePages } from '@/utils/supabase/pagination'
import type { MasterDataDeleteDependencyDetail } from '@/api/master-data-delete'
import { keyBy, uniq } from 'lodash-es'
import { buildBomWritePayload } from './bom-write-payload'
import type {
  BomGroup,
  BomGroupInput,
  BomInput,
  BomProcessRouteOption,
  BomProcessRouteStepOption,
  BomQuery,
  BomRecord,
  BomStatus,
  BomStructureNode
} from './bom.types'

export * from './bom.types'

const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()
const readOptions = {
  breakReturn: true,
  showErrorMessage: false,
  errorMessage: 'BOM 数据加载失败，请重试'
}
const writeOptions = {
  breakReturn: true,
  showErrorMessage: true,
  showMessage: true,
  requireAffected: false,
  message: '保存成功',
  errorMessage: 'BOM 操作失败，请检查数据后重试'
}

export async function fetchBoms(params: BomQuery, options?: { signal?: AbortSignal }) {
  let materialIds: string[] = []
  if (params.keyword) {
    let materialQuery = supabase
      .from('mdm_material')
      .select('id')
      .or(
        buildOrIlikeFilter(
          ['material_code', 'material_name', 'specification_model', 'drawing_no', 'description'],
          params.keyword
        )
      )
      .limit(200)
    if (params.tenantId) materialQuery = materialQuery.eq('tenant_id', params.tenantId)
    const { data } = await responseHandle<Array<{ id: string }>>(() => materialQuery, readOptions)
    materialIds = (data ?? []).map((row) => row.id)
  }
  let query = supabase
    .from('mdm_bom')
    .select(
      '*,group:mdm_master_group!mdm_bom_group_fkey(id,code,name),material:mdm_material!mdm_bom_material_fkey(id,tenant_id,material_code,material_name,specification_model,drawing_no,description,material_source,special_purchase_type,base_unit_id,production_unit_id,default_warehouse_id,material_issue_method,backflush_method,over_issue_control_method,baseUnit:mdm_unit_of_measure!mdm_material_base_unit_fkey(id,unit_code,unit_name,symbol),productionUnit:mdm_unit_of_measure!mdm_material_production_unit_id_fkey(id,unit_code,unit_name,symbol),defaultWarehouse:mdm_warehouse!mdm_material_default_warehouse_fkey(id,warehouse_code,warehouse_name)),processRoute:mdm_process_route!mdm_bom_process_route_fkey(id,tenant_id,material_id,code,name,version,is_default,enabled),baseUnit:mdm_unit_of_measure!mdm_bom_unit_fkey(id,unit_code,unit_name,symbol),items:mdm_bom_item(id,tenant_id,bom_id,component_material_id,component_type_id,sequence_no,quantity,unit_id,scrap_rate,mrp_enabled,default_issue_warehouse_id,issue_method,backflush_method,over_issue_control_method,project_text,position_no,process_route_step_id,operation_name,effective_from,effective_to,remark,componentType:mdm_component_type!mdm_bom_item_component_type_fk(id,component_type_code,component_type_name,tag_style,text_color),component:mdm_material!mdm_bom_item_material_fkey(id,tenant_id,material_code,material_name,specification_model,drawing_no,description,material_source,special_purchase_type,base_unit_id,auxiliary_unit_id,auxiliary_unit_2_id,unit_conversions,production_unit_id,default_warehouse_id,material_issue_method,backflush_method,over_issue_control_method,baseUnit:mdm_unit_of_measure!mdm_material_base_unit_fkey(id,unit_code,unit_name,symbol),productionUnit:mdm_unit_of_measure!mdm_material_production_unit_id_fkey(id,unit_code,unit_name,symbol),defaultWarehouse:mdm_warehouse!mdm_material_default_warehouse_fkey(id,warehouse_code,warehouse_name)),processRouteStep:mdm_process_route_step!mdm_bom_item_process_route_step_fkey(id,tenant_id,route_id,code,name,sort,work_center_id,work_center_ids,workCenter:mdm_work_center!mdm_process_route_step_tenant_id_work_center_id_fkey(id,code,name),sequence:mdm_process_route_sequence!mdm_process_route_step_sequence_fk(id,sequence_no,sequence_type)),unit:mdm_unit_of_measure!mdm_bom_item_unit_fkey(id,unit_code,unit_name,symbol),defaultIssueWarehouse:mdm_warehouse!mdm_bom_item_default_issue_warehouse_fkey(id,warehouse_code,warehouse_name))',
      { count: 'exact' }
    )
    .order('sort')
    .order('update_time', { ascending: false })
  if (params.tenantId) query = query.eq('tenant_id', params.tenantId)
  if (params.id) query = query.eq('id', params.id)
  if (params.keyword) {
    const baseFilter = buildOrIlikeFilter(['bom_code', 'version', 'description'], params.keyword)
    query = query.or(
      materialIds.length ? `${baseFilter},material_id.in.(${materialIds.join(',')})` : baseFilter
    )
  }
  if (params.materialId) query = query.eq('material_id', params.materialId)
  if (params.groupIds?.length) query = query.in('group_id', params.groupIds)
  if (params.purpose) query = query.eq('purpose', params.purpose)
  if (params.status) query = query.eq('status', params.status)
  query = query.range((params.current - 1) * params.size, params.current * params.size - 1)
  const { data, total } = await responseHandle<BomRecord[]>(
    () => (options?.signal ? query.abortSignal(options.signal) : query),
    readOptions
  )
  const projectIds = uniq((data ?? []).flatMap((row) => (row.projectId ? [row.projectId] : [])))
  const { data: projects } = projectIds.length
    ? await responseHandle<Array<{ id: string; projectCode: string; projectName: string }>>(
        () =>
          supabase.from('mdm_project').select('id,project_code,project_name').in('id', projectIds),
        readOptions
      )
    : { data: [] }
  const projectsById = new Map((projects ?? []).map((project) => [project.id, project]))
  const rows = (data ?? []).map((row) => ({
    ...row,
    project: row.projectId ? (projectsById.get(row.projectId) ?? null) : null,
    items: [...(row.items ?? [])].sort((a, b) => a.sequenceNo - b.sequenceNo)
  }))
  return { data: rows, total: total ?? 0, current: params.current, size: params.size }
}

export async function fetchBomGroups(tenantId?: string | null): Promise<BomGroup[]> {
  let query = supabase
    .from('mdm_master_group')
    .select('id,tenant_id,code,name,parent_id,sort,enabled,remark')
    .eq('domain', 'bom')
    .order('sort')
  if (tenantId) query = query.eq('tenant_id', tenantId)
  const { data } = await responseHandle<BomGroup[]>(() => query, readOptions)
  return data ?? []
}

export async function saveBomGroup(payload: BomGroupInput): Promise<string> {
  const { id, ...input } = payload
  const { data } = await responseHandle<string>(
    () =>
      supabase.rpc('mdm_save_bom_group_secure', {
        p_id: id || null,
        p_payload: keysToSnakeDeep(input)
      }),
    { ...writeOptions, message: 'BOM 分组已保存' }
  )
  return data ?? ''
}

export async function deleteBomGroup(id: string): Promise<void> {
  await responseHandle(() => supabase.rpc('mdm_delete_bom_group_secure', { p_id: id }), {
    ...writeOptions,
    message: 'BOM 分组已删除'
  })
}

export async function saveBom(payload: BomInput): Promise<string> {
  const writePayload = buildBomWritePayload(payload)
  const header = keysToSnakeDeep(writePayload.header)
  const items = keysToSnakeDeep(writePayload.items)
  const { data } = await responseHandle<string>(
    () => supabase.rpc('mdm_save_bom_with_assignments', { p_header: header, p_items: items }),
    writeOptions
  )
  return data ?? ''
}

export async function fetchBomProcessRoutes(
  tenantId: string,
  materialId: string
): Promise<BomProcessRouteOption[]> {
  const { data } = await responseHandle<BomProcessRouteOption[]>(
    () =>
      supabase
        .from('mdm_process_route')
        .select('id,tenant_id,material_id,code,name,version,is_default,enabled')
        .eq('tenant_id', tenantId)
        .eq('material_id', materialId)
        .eq('enabled', true)
        .order('is_default', { ascending: false })
        .order('update_time', { ascending: false }),
    readOptions
  )
  return data ?? []
}

export async function fetchBomProcessRouteSteps(
  tenantId: string,
  routeId: string
): Promise<BomProcessRouteStepOption[]> {
  const { data } = await responseHandle<BomProcessRouteStepOption[]>(
    () =>
      supabase
        .from('mdm_process_route_step')
        .select(
          'id,tenant_id,route_id,code,name,sort,work_center_id,work_center_ids,workCenter:mdm_work_center!mdm_process_route_step_tenant_id_work_center_id_fkey(id,code,name),sequence:mdm_process_route_sequence!mdm_process_route_step_sequence_fk(id,sequence_no,sequence_type)'
        )
        .eq('tenant_id', tenantId)
        .eq('route_id', routeId)
        .order('sort')
        .order('code'),
    readOptions
  )
  return data ?? []
}

export async function transitionBom(id: string, status: BomStatus): Promise<void> {
  await responseHandle(
    () => supabase.rpc('mdm_transition_bom', { p_bom_id: id, p_target_status: status }),
    { ...writeOptions, message: 'BOM 状态已更新' }
  )
}

interface BomAccessoryDependency {
  id: string
  bomId: string
  sourceName: string
  projectName: string
  drawingName: string
  status: string
  createTime: string
}

/** Follow the same inbound reference checked by mdm_delete_bom; reads retain table RLS. */
export async function fetchBomDeleteDependencies(
  ids: string[]
): Promise<MasterDataDeleteDependencyDetail[]> {
  if (!ids.length) return []
  const { data, error } = await fetchAllRangePages<BomAccessoryDependency>(({ from, to }) =>
    responseHandle<BomAccessoryDependency[]>(
      () =>
        supabase
          .from('mdm_accessory_processing_list')
          .select('id,bom_id,source_name,project_name,drawing_name,status,create_time')
          .in('bom_id', uniq(ids))
          .order('id')
          .range(from, to),
      { ...readOptions, errorMessage: 'BOM 引用检查失败，请重试' }
    )
  )
  if (error || !data) throw new Error('BOM 引用检查失败，请重试', { cause: error })
  const statuses: Record<string, string> = {
    draft: '草稿',
    materials_ready: '物料已生成',
    bom_ready: 'BOM 已生成',
    generated: '工单已生成'
  }
  return data.map((row) => ({
    resourceId: row.bomId,
    dependencyCode: 'bom_accessory_processing_list',
    recordId: row.id,
    targetId: row.id,
    recordNo: row.drawingName || row.sourceName || '配件加工清单',
    recordSummary: [row.projectName, row.sourceName].filter(Boolean).join(' · '),
    recordStatus: statuses[row.status] || '待核对',
    createdAt: row.createTime,
    cleanupAllowed: false
  }))
}

export async function deleteBom(
  id: string,
  options?: { showErrorMessage?: boolean }
): Promise<void> {
  await responseHandle(() => supabase.rpc('mdm_delete_bom', { p_bom_id: id }), {
    ...writeOptions,
    message: 'BOM 已删除',
    showErrorMessage: options?.showErrorMessage ?? true,
    errorMessage: 'BOM 删除失败，请确认处于设计状态且未被业务引用'
  })
}

export async function deleteBoms(
  ids: string[],
  options?: { showErrorMessage?: boolean }
): Promise<void> {
  await responseHandle<number>(() => supabase.rpc('mdm_delete_boms', { p_bom_ids: ids }), {
    ...writeOptions,
    message: '已删除选中的 BOM',
    showErrorMessage: options?.showErrorMessage ?? true,
    errorMessage: 'BOM 批量删除失败，请确认所选记录仍处于设计状态且未被业务引用'
  })
}

export async function fetchBomStructure(id: string, maxDepth = 8): Promise<BomStructureNode[]> {
  const { data } = await responseHandle<BomStructureNode[]>(
    () => supabase.rpc('mdm_bom_structure_detail', { p_bom_id: id, p_max_depth: maxDepth }),
    readOptions
  )
  const nodes = data ?? []
  const missingDrawingMaterialIds = uniq(
    nodes.filter((node) => node.drawingNo === undefined).map((node) => node.materialId)
  )
  const itemIds = uniq(
    nodes.map((node) => node.bomItemId).filter((id): id is string => Boolean(id))
  )
  const [{ data: materials }, { data: items }] = await Promise.all([
    missingDrawingMaterialIds.length
      ? responseHandle<Array<{ id: string; drawingNo?: string | null }>>(
          () =>
            supabase
              .from('mdm_material')
              .select('id,drawing_no')
              .in('id', missingDrawingMaterialIds),
          readOptions
        )
      : Promise.resolve({ data: [] }),
    itemIds.length
      ? responseHandle<
          Array<{
            id: string
            componentTypeId?: string | null
            componentType?: { componentTypeName: string } | null
          }>
        >(
          () =>
            supabase
              .from('mdm_bom_item')
              .select(
                'id,component_type_id,componentType:mdm_component_type!mdm_bom_item_component_type_fk(component_type_name)'
              )
              .in('id', itemIds),
          readOptions
        )
      : Promise.resolve({ data: [] })
  ])
  const materialById = keyBy(materials ?? [], 'id')
  const itemById = keyBy(items ?? [], 'id')

  return nodes.map((node) => ({
    ...node,
    drawingNo: node.drawingNo ?? materialById[node.materialId]?.drawingNo ?? null,
    componentTypeId: node.bomItemId ? itemById[node.bomItemId]?.componentTypeId : null,
    componentTypeName: node.bomItemId
      ? itemById[node.bomItemId]?.componentType?.componentTypeName
      : null
  }))
}

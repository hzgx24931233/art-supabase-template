import { omit } from 'lodash-es'
import { useSupabase } from '@/hooks'
import { buildOrIlikeFilter } from '@/utils/supabase/search'
import type {
  EsopCategory,
  EsopCategoryInput,
  EsopDocument,
  EsopDocumentInput,
  EsopDocumentQuery,
  EsopReferenceOptions
} from './esop.types'

export * from './esop.types'

const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()
const readOptions = {
  breakReturn: true,
  showErrorMessage: false,
  errorMessage: 'ESOP 数据加载失败，请重试'
}
const writeOptions = {
  breakReturn: true,
  showErrorMessage: true,
  showMessage: true,
  requireAffected: false,
  message: '操作成功',
  errorMessage: '操作失败，请检查数据后重试'
}

export async function fetchEsopCategories(tenantId: string): Promise<EsopCategory[]> {
  let query = supabase.from('mdm_esop_category').select('*')
  if (tenantId) query = query.eq('tenant_id', tenantId)
  const { data } = await responseHandle<EsopCategory[]>(
    () => query.order('sort').order('category_name'),
    readOptions
  )
  return data ?? []
}

export async function fetchEsopDocuments(
  params: EsopDocumentQuery,
  options?: { signal?: AbortSignal }
) {
  let query = supabase
    .from('mdm_esop_document')
    .select(
      '*,category:mdm_esop_category!mdm_esop_document_category_fkey(id,category_code,category_name),bindings:mdm_esop_binding(id,target_type,material_id,process_route_id,material:mdm_material!mdm_esop_binding_material_fkey(id,material_code,material_name,specification_model),processRoute:mdm_process_route!mdm_esop_binding_route_fkey(id,name,material_id,material:mdm_material!mdm_process_route_material_tenant_fkey(id,material_code,material_name,specification_model)))',
      { count: 'exact' }
    )
    .order('upload_time', { ascending: false })
  if (params.tenantId) query = query.eq('tenant_id', params.tenantId)
  if (params.keyword)
    query = query.or(
      buildOrIlikeFilter(['document_code', 'document_name', 'attachment_name'], params.keyword)
    )
  if (params.status) query = query.eq('status', params.status)
  if (params.categoryIds?.length) query = query.in('category_id', params.categoryIds)
  if (params.uploadDateRange?.[0])
    query = query.gte('upload_time', `${params.uploadDateRange[0]}T00:00:00`)
  if (params.uploadDateRange?.[1])
    query = query.lte('upload_time', `${params.uploadDateRange[1]}T23:59:59.999`)
  query = query.range((params.current - 1) * params.size, params.current * params.size - 1)
  const { data, total } = await responseHandle<EsopDocument[]>(
    () => (options?.signal ? query.abortSignal(options.signal) : query),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0, current: params.current, size: params.size }
}

export async function fetchEsopReferenceOptions(tenantId: string): Promise<EsopReferenceOptions> {
  let materialQuery = supabase
    .from('mdm_material')
    .select('id,tenant_id,material_code,material_name,specification_model')
    .eq('status', 'enabled')
  if (tenantId) materialQuery = materialQuery.eq('tenant_id', tenantId)

  let routeQuery = supabase
    .from('mdm_process_route')
    .select('id,tenant_id,name,material_id,material:mdm_material(material_code,material_name)')
  if (tenantId) routeQuery = routeQuery.eq('tenant_id', tenantId)

  const [{ data: materials }, { data: routes }] = await Promise.all([
    responseHandle<EsopReferenceOptions['materials']>(
      () => materialQuery.order('material_code'),
      readOptions
    ),
    responseHandle<
      Array<{
        id: string
        tenantId: string
        name: string
        materialId: string
        material: { materialCode: string; materialName: string } | null
      }>
    >(() => routeQuery.order('name'), readOptions)
  ])
  return {
    materials: materials ?? [],
    routes: (routes ?? []).map((route) => ({
      id: route.id,
      tenantId: route.tenantId,
      name: route.name,
      materialId: route.materialId,
      materialCode: route.material?.materialCode ?? '',
      materialName: route.material?.materialName ?? ''
    }))
  }
}

export async function saveEsopCategory(input: EsopCategoryInput): Promise<void> {
  await responseHandle(
    () => supabase.rpc('mdm_save_esop_category', { p_payload: keysToSnakeDeep(input) }),
    { ...writeOptions, message: input.id ? '分类已更新' : '分类已新增' }
  )
}

export async function deleteEsopCategory(id: string): Promise<void> {
  await responseHandle(() => supabase.rpc('mdm_delete_esop_category', { p_category_id: id }), {
    ...writeOptions,
    message: '分类已删除'
  })
}

export async function saveEsopDocument(input: EsopDocumentInput): Promise<void> {
  const document = keysToSnakeDeep(omit(input, ['materialIds', 'routeIds']))
  await responseHandle(
    () =>
      supabase.rpc('mdm_save_esop_document', {
        p_document: document,
        p_material_ids: input.materialIds,
        p_route_ids: input.routeIds
      }),
    { ...writeOptions, message: input.id ? 'ESOP 已更新' : 'ESOP 已新增' }
  )
}

export async function setEsopDocumentsEnabled(ids: string[], enabled: boolean): Promise<void> {
  await responseHandle(
    () => supabase.rpc('mdm_set_esop_documents_enabled', { p_ids: ids, p_enabled: enabled }),
    { ...writeOptions, message: enabled ? 'ESOP 已启用' : 'ESOP 已停用' }
  )
}

export async function deleteEsopDocuments(ids: string[]): Promise<void> {
  await responseHandle(() => supabase.rpc('mdm_delete_esop_documents', { p_ids: ids }), {
    ...writeOptions,
    message: 'ESOP 已删除'
  })
}

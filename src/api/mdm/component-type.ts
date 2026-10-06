import { useSupabase } from '@/hooks'
import { buildOrIlikeFilter } from '@/utils/supabase/search'
import type {
  ComponentIndustryGroup,
  ComponentIndustryGroupInput,
  ComponentTypeInput,
  ComponentTypeQuery,
  ComponentTypeRecord
} from './component-type.types'

export * from './component-type.types'

const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()
const readOptions = {
  breakReturn: true,
  showErrorMessage: false,
  errorMessage: '组件类型加载失败，请重试'
}
const writeOptions = {
  breakReturn: true,
  showErrorMessage: true,
  requireAffected: true,
  showMessage: true,
  message: '组件类型已保存',
  errorMessage: '组件类型保存失败，请检查编码、行业分组和当前权限'
}

export async function fetchComponentIndustryGroups(tenantId?: string | null) {
  let query = supabase
    .from('mdm_master_group')
    .select('id,tenant_id,parent_id,code,name,sort,enabled,remark')
    .eq('domain', 'component-type')
    .order('sort')
    .order('code')
  if (tenantId) query = query.eq('tenant_id', tenantId)
  const { data } = await responseHandle<ComponentIndustryGroup[]>(() => query, readOptions)
  return data ?? []
}

export async function saveComponentIndustryGroup(input: ComponentIndustryGroupInput) {
  const { data } = await responseHandle<string>(
    () =>
      supabase.rpc('mdm_save_component_industry_group', {
        p_id: input.id || null,
        p_payload: keysToSnakeDeep(input)
      }),
    { ...writeOptions, requireAffected: false, message: '行业分组已保存' }
  )
  return data ?? ''
}

export async function deleteComponentIndustryGroup(id: string) {
  await responseHandle(() => supabase.rpc('mdm_delete_component_industry_group', { p_id: id }), {
    ...writeOptions,
    requireAffected: false,
    message: '行业分组已删除'
  })
}

export async function fetchComponentTypes(
  params: ComponentTypeQuery,
  options?: { signal?: AbortSignal }
) {
  let query = supabase
    .from('mdm_component_type')
    .select('*,group:mdm_master_group!mdm_component_type_group_fk(id,code,name)', {
      count: 'exact'
    })
    .order('sort_order')
    .order('component_type_code')
  if (params.tenantId) query = query.eq('tenant_id', params.tenantId)
  if (params.keyword?.trim())
    query = query.or(
      buildOrIlikeFilter(
        ['component_type_code', 'component_type_name', 'remark'],
        params.keyword.trim()
      )
    )
  if (params.groupIds?.length) query = query.in('group_id', params.groupIds)
  if (params.enabled === true || params.enabled === false)
    query = query.eq('enabled', params.enabled)
  query = query.range((params.current - 1) * params.size, params.current * params.size - 1)
  const { data, total } = await responseHandle<ComponentTypeRecord[]>(
    () => (options?.signal ? query.abortSignal(options.signal) : query),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function fetchComponentTypeOptions(tenantId?: string | null) {
  let query = supabase
    .from('mdm_component_type')
    .select(
      'id,tenant_id,group_id,component_type_code,component_type_name,sort_order,enabled,text_color,tag_style,remark'
    )
    .order('sort_order')
  if (tenantId) query = query.eq('tenant_id', tenantId)
  const { data } = await responseHandle<ComponentTypeRecord[]>(() => query, readOptions)
  return data ?? []
}

export async function saveComponentType(input: ComponentTypeInput) {
  const { id, ...values } = input
  const payload = keysToSnakeDeep(values)
  await responseHandle(
    () =>
      id
        ? supabase.from('mdm_component_type').update(payload).eq('id', id).select('id')
        : supabase.from('mdm_component_type').insert(payload).select('id'),
    writeOptions
  )
}

export async function deleteComponentType(id: string) {
  await responseHandle(
    () => supabase.from('mdm_component_type').delete().eq('id', id).select('id'),
    {
      ...writeOptions,
      message: '组件类型已删除'
    }
  )
}

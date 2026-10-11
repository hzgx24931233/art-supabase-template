import { useSupabase } from '@/hooks'
import { WRITE_PERMISSION_DENIED_MESSAGE } from '@/hooks/core/useSupabase'
import { normalizeNullableText } from '@/utils/form/normalize'
import { applyFilters, fetchAllRangePages } from '@/utils/supabase'
import { buildOrIlikeFilter } from '@/utils/supabase/search'
import TreeUtils from '@/utils/tree'
import type {
  BusinessTypeDocumentReference,
  BusinessTypeExportQuery,
  BusinessTypeExportRecord,
  BusinessTypeMenuNode,
  BusinessTypeOptionQuery,
  BusinessTypeQuery,
  BusinessTypeRecord,
  BusinessTypeSourceReference,
  BusinessTypeStats,
  BusinessTypeUpdateInput,
  BusinessTypeWriteInput
} from './business-type.types'

export * from './business-type.types'

const { supabase, keysToSnakeDeep, responseHandle } = useSupabase()
const treeUtils = new TreeUtils({ idKey: 'id', parentKey: 'parentId', childrenKey: 'children' })

const readOptions = {
  breakReturn: true,
  showErrorMessage: true,
  errorMessage: '业务类型加载失败，请稍后重试'
}

const writeOptions = {
  breakReturn: true,
  showErrorMessage: true,
  showMessage: true,
  requireAffected: true,
  noAffectedMessage: WRITE_PERMISSION_DENIED_MESSAGE,
  errorMessage: '保存失败，请检查类型编号、单据归属和当前权限'
}

const businessTypeSelect = `
  *,
  documentType:mdm_document_type!mdm_business_type_document_type_fkey!inner(
    id, menu_id, document_type_code, document_type_name, enabled
  )
`

async function attachSourceBusinessTypes(
  rows: BusinessTypeRecord[],
  signal?: AbortSignal
): Promise<BusinessTypeRecord[]> {
  const sourceIds = [
    ...new Set(
      rows
        .map((row) => row.sourceBusinessTypeId)
        .filter((id): id is string => typeof id === 'string' && Boolean(id))
    )
  ]
  if (!sourceIds.length) return rows

  const query = supabase
    .from('mdm_business_type')
    .select('id,business_type_code,business_type_name,enabled')
    .in('id', sourceIds)
  const { data } = await responseHandle<BusinessTypeSourceReference[]>(
    () => (signal ? query.abortSignal(signal) : query),
    { ...readOptions, showErrorMessage: false }
  )
  const sourceById = new Map((data ?? []).map((source) => [source.id, source]))

  return rows.map((row) => ({
    ...row,
    sourceBusinessType: row.sourceBusinessTypeId
      ? (sourceById.get(row.sourceBusinessTypeId) ?? null)
      : null
  }))
}

export async function fetchBusinessTypeList(
  params: BusinessTypeQuery,
  options?: { signal?: AbortSignal }
) {
  const { current, size, keyword = '', menuIds, documentTypeId, enabled, isDefault } = params
  let query = supabase
    .from('mdm_business_type')
    .select(businessTypeSelect, { count: 'exact' })
    .order('sort_order', { ascending: true })
    .order('business_type_name', { ascending: true })
    .range((current - 1) * size, current * size - 1)

  query = applyFilters(
    query,
    [
      { col: 'document_type_id', op: 'eq', val: documentTypeId },
      { col: 'enabled', op: 'eq', val: enabled },
      { col: 'is_default', op: 'eq', val: isDefault }
    ],
    { skipEmpty: true, camelToSnake: false }
  )

  if (menuIds?.length) query = query.in('documentType.menu_id', menuIds)
  if (keyword.trim()) {
    query = query.or(
      buildOrIlikeFilter(['business_type_code', 'business_type_name', 'remark'], keyword.trim())
    )
  }

  const { data, total } = await responseHandle<BusinessTypeRecord[]>(
    () => (options?.signal ? query.abortSignal(options.signal) : query),
    readOptions
  )
  return {
    data: await attachSourceBusinessTypes(data ?? [], options?.signal),
    total: total ?? 0,
    current,
    size
  }
}

export async function fetchBusinessTypeStats(): Promise<BusinessTypeStats> {
  const { data } = await fetchAllRangePages<BusinessTypeRecord>(
    ({ from, to }) => {
      const query = supabase
        .from('mdm_business_type')
        .select(
          `id,document_type_id,enabled,is_default,update_time,
          documentType:mdm_document_type!mdm_business_type_document_type_fkey!inner(menu_id)`
        )
        .order('id')
        .range(from, to)
      return responseHandle<BusinessTypeRecord[]>(() => query, {
        ...readOptions,
        showErrorMessage: false
      })
    },
    { pageSize: 500 }
  )

  const rows = data ?? []
  const menuCounts = rows.reduce<Record<string, number>>((counts, row) => {
    const menuId = row.documentType?.menuId
    if (menuId) counts[menuId] = (counts[menuId] ?? 0) + 1
    return counts
  }, {})

  return {
    total: rows.length,
    enabled: rows.filter((row) => row.enabled).length,
    defaults: rows.filter((row) => row.isDefault).length,
    menuCount: Object.keys(menuCounts).length,
    documentTypeCount: new Set(rows.map((row) => row.documentTypeId)).size,
    menuCounts,
    lastUpdateTime: rows
      .map((row) => row.updateTime ?? '')
      .filter(Boolean)
      .sort()
      .at(-1)
  }
}

export async function fetchBusinessTypeMenuTree(): Promise<BusinessTypeMenuNode[]> {
  const { data } = await fetchAllRangePages<BusinessTypeMenuNode>(
    ({ from, to }) =>
      responseHandle<BusinessTypeMenuNode[]>(
        () =>
          supabase
            .from('sys_menu')
            .select('id,parent_id,name,path,component,type,app_code,sort,meta')
            .in('type', ['folder', 'menu'])
            .order('app_code', { ascending: true })
            .order('sort', { ascending: true })
            .range(from, to),
        { ...readOptions, showErrorMessage: false }
      ),
    { pageSize: 500 }
  )
  return treeUtils.listToTree((data ?? []).filter((menu) => menu.meta?.isEnable !== false))
}

export async function fetchBusinessTypeDocumentOptions(
  params: BusinessTypeOptionQuery
): Promise<{ data: BusinessTypeDocumentReference[] }> {
  const { data } = await fetchAllRangePages<BusinessTypeDocumentReference>(
    ({ from, to }) => {
      let query = supabase
        .from('mdm_document_type')
        .select('id,menu_id,document_type_code,document_type_name,enabled')
        .order('sort_order')
        .order('document_type_name')
        .range(from, to)
      if (params.menuIds?.length) query = query.in('menu_id', params.menuIds)
      if (typeof params.enabled === 'boolean') query = query.eq('enabled', params.enabled)
      return responseHandle<BusinessTypeDocumentReference[]>(() => query, {
        ...readOptions,
        showErrorMessage: false
      })
    },
    { pageSize: 500 }
  )
  return { data: data ?? [] }
}

export async function fetchBusinessTypeOptions(
  params: BusinessTypeOptionQuery
): Promise<{ data: BusinessTypeRecord[] }> {
  const { data } = await fetchAllRangePages<BusinessTypeRecord>(
    ({ from, to }) => {
      let query = supabase
        .from('mdm_business_type')
        .select('id,business_type_code,business_type_name,document_type_id,enabled')
        .order('sort_order')
        .order('business_type_name')
        .range(from, to)
      if (params.documentTypeId) query = query.eq('document_type_id', params.documentTypeId)
      if (params.excludeId) query = query.neq('id', params.excludeId)
      if (typeof params.enabled === 'boolean') query = query.eq('enabled', params.enabled)
      return responseHandle<BusinessTypeRecord[]>(() => query, {
        ...readOptions,
        showErrorMessage: false
      })
    },
    { pageSize: 500 }
  )
  return { data: data ?? [] }
}

export async function fetchNextBusinessTypeSort(documentTypeId: string) {
  const query = supabase
    .from('mdm_business_type')
    .select('sort_order')
    .eq('document_type_id', documentTypeId)
    .order('sort_order', { ascending: false })
    .limit(1)
  const { data } = await responseHandle<Array<{ sortOrder: number }>>(() => query, {
    ...readOptions,
    showErrorMessage: false
  })
  return Math.max(10, (data?.[0]?.sortOrder ?? 0) + 10)
}

export async function createBusinessType(input: BusinessTypeWriteInput) {
  return await responseHandle(
    () =>
      supabase
        .from('mdm_business_type')
        .insert(keysToSnakeDeep(input), { count: 'exact' })
        .select('id'),
    { ...writeOptions, message: '业务类型已创建' }
  )
}

export async function updateBusinessType(id: string, input: BusinessTypeUpdateInput) {
  return await responseHandle(
    () =>
      supabase
        .from('mdm_business_type')
        .update(keysToSnakeDeep(input), { count: 'exact' })
        .eq('id', id)
        .select('id'),
    { ...writeOptions, message: '业务类型已更新' }
  )
}

export async function copyBusinessType(sourceId: string, input: BusinessTypeUpdateInput) {
  return await responseHandle<string>(
    () =>
      supabase.rpc('copy_mdm_business_type', {
        p_source_id: sourceId,
        p_document_type_id: input.documentTypeId,
        p_business_type_code: input.businessTypeCode,
        p_business_type_name: input.businessTypeName,
        p_is_default: input.isDefault,
        p_source_business_type_id: input.sourceBusinessTypeId,
        p_inventory_direction: input.inventoryDirection,
        p_owner_type: input.ownerType,
        p_inventory_accounting: input.inventoryAccounting,
        p_remark: input.remark,
        p_sort_order: input.sortOrder,
        p_text_color: input.textColor,
        p_tag_style: input.tagStyle,
        p_enabled: input.enabled
      }),
    { ...writeOptions, message: '业务类型副本已创建' }
  )
}

export async function deleteBusinessTypes(ids: string[]) {
  return await responseHandle(
    () => supabase.from('mdm_business_type').delete({ count: 'exact' }).in('id', ids).select('id'),
    {
      ...writeOptions,
      message: ids.length > 1 ? `已删除 ${ids.length} 条业务类型` : '业务类型已删除',
      errorMessage: '删除失败，请先解除源业务类型或业务单据引用'
    }
  )
}

export async function exportBusinessTypes(
  params: BusinessTypeExportQuery
): Promise<BusinessTypeExportRecord[]> {
  const { data } = await responseHandle<BusinessTypeExportRecord[]>(
    () =>
      supabase.rpc('export_mdm_business_types', {
        p_menu_ids: params.menuIds?.length ? params.menuIds : null,
        p_document_type_id: params.documentTypeId || null,
        p_keyword: normalizeNullableText(params.keyword),
        p_enabled: params.enabled ?? null,
        p_is_default: params.isDefault ?? null,
        p_limit: params.limit ?? 10000
      }),
    { ...readOptions, errorMessage: '导出数据加载失败，请检查当前权限后重试' }
  )
  return data ?? []
}

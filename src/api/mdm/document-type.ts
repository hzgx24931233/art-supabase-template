import { useSupabase } from '@/hooks'
import { WRITE_PERMISSION_DENIED_MESSAGE } from '@/hooks/core/useSupabase'
import { applyFilters, fetchAllRangePages } from '@/utils/supabase'
import { buildOrIlikeFilter } from '@/utils/supabase/search'
import { normalizeNullableText } from '@/utils/form/normalize'
import TreeUtils from '@/utils/tree'
import type {
  DocumentTypeExportQuery,
  DocumentTypeExportRecord,
  DocumentTypeMenuNode,
  DocumentTypeQuery,
  DocumentTypeRecord,
  DocumentTypeStats,
  DocumentTypeUpdateInput,
  DocumentTypeWriteInput
} from './document-type.types'

export * from './document-type.types'

const { supabase, keysToSnakeDeep, responseHandle } = useSupabase()
const treeUtils = new TreeUtils({ idKey: 'id', parentKey: 'parentId', childrenKey: 'children' })

const readOptions = {
  breakReturn: true,
  showErrorMessage: true,
  errorMessage: '单据类型加载失败，请稍后重试'
}

const writeOptions = {
  breakReturn: true,
  showErrorMessage: true,
  showMessage: true,
  requireAffected: true,
  noAffectedMessage: WRITE_PERMISSION_DENIED_MESSAGE,
  errorMessage: '保存失败，请检查类型编号、菜单归属和当前权限'
}

const documentTypeSelect = `
  *,
  tenant:sys_tenant!mdm_document_type_tenant_id_fkey(tenant_code, tenant_name)
`

function toDocumentTypeRow(input: DocumentTypeWriteInput | DocumentTypeUpdateInput) {
  const { extensionFields, ...header } = input
  return { ...keysToSnakeDeep(header), extension_fields: extensionFields }
}

export async function fetchDocumentTypeList(
  params: DocumentTypeQuery,
  options?: { signal?: AbortSignal }
) {
  const { current, size, keyword = '', tenantId, menuIds, enabled, isDefault } = params
  let query = supabase
    .from('mdm_document_type')
    .select(documentTypeSelect, { count: 'exact' })
    .order('sort_order', { ascending: true })
    .order('document_type_name', { ascending: true })
    .range((current - 1) * size, current * size - 1)

  query = applyFilters(
    query,
    [
      { col: 'tenant_id', op: 'eq', val: tenantId },
      { col: 'enabled', op: 'eq', val: enabled },
      { col: 'is_default', op: 'eq', val: isDefault }
    ],
    { skipEmpty: true, camelToSnake: false }
  )

  if (menuIds?.length) query = query.in('menu_id', menuIds)
  if (keyword.trim()) {
    query = query.or(
      buildOrIlikeFilter(['document_type_code', 'document_type_name', 'remark'], keyword.trim())
    )
  }

  const { data, total } = await responseHandle<DocumentTypeRecord[]>(
    () => (options?.signal ? query.abortSignal(options.signal) : query),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0, current, size }
}

export async function fetchDocumentTypeStats(tenantId?: string | null): Promise<DocumentTypeStats> {
  let query = supabase
    .from('mdm_document_type')
    .select('id,tenant_id,menu_id,enabled,is_default,update_time')
  if (tenantId) query = query.eq('tenant_id', tenantId)

  const { data } = await responseHandle<DocumentTypeRecord[]>(() => query, readOptions)
  const rows = data ?? []
  const menuCounts = rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.menuId] = (counts[row.menuId] ?? 0) + 1
    return counts
  }, {})

  return {
    total: rows.length,
    enabled: rows.filter((row) => row.enabled).length,
    defaults: rows.filter((row) => row.isDefault).length,
    menuCount: Object.keys(menuCounts).length,
    tenantCount: new Set(rows.map((row) => row.tenantId)).size,
    menuCounts,
    lastUpdateTime: rows
      .map((row) => row.updateTime ?? '')
      .filter(Boolean)
      .sort()
      .at(-1)
  }
}

export async function fetchDocumentTypeMenuTree(): Promise<DocumentTypeMenuNode[]> {
  const { data } = await fetchAllRangePages<DocumentTypeMenuNode>(
    ({ from, to }) =>
      responseHandle<DocumentTypeMenuNode[]>(
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

export async function fetchNextDocumentTypeSort(menuId: string, tenantId?: string | null) {
  let query = supabase
    .from('mdm_document_type')
    .select('sort_order')
    .eq('menu_id', menuId)
    .order('sort_order', { ascending: false })
    .limit(1)
  if (tenantId) query = query.eq('tenant_id', tenantId)
  const { data } = await responseHandle<Array<{ sortOrder: number }>>(() => query, {
    ...readOptions,
    showErrorMessage: false
  })
  return Math.max(10, (data?.[0]?.sortOrder ?? 0) + 10)
}

export async function createDocumentType(input: DocumentTypeWriteInput) {
  return await responseHandle(
    () =>
      supabase
        .from('mdm_document_type')
        .insert(toDocumentTypeRow(input), { count: 'exact' })
        .select('id'),
    { ...writeOptions, message: '单据类型已创建' }
  )
}

export async function updateDocumentType(id: string, input: DocumentTypeUpdateInput) {
  return await responseHandle(
    () =>
      supabase
        .from('mdm_document_type')
        .update(toDocumentTypeRow(input), { count: 'exact' })
        .eq('id', id)
        .select('id'),
    { ...writeOptions, message: '单据类型已更新' }
  )
}

export async function copyDocumentType(sourceId: string, input: DocumentTypeUpdateInput) {
  return await responseHandle<string>(
    () =>
      supabase.rpc('copy_mdm_document_type', {
        p_source_id: sourceId,
        p_menu_id: input.menuId,
        p_document_type_code: input.documentTypeCode,
        p_document_type_name: input.documentTypeName,
        p_is_default: input.isDefault,
        p_remark: input.remark,
        p_sort_order: input.sortOrder,
        p_text_color: input.textColor,
        p_tag_style: input.tagStyle,
        p_enabled: input.enabled,
        p_extension_fields: input.extensionFields
      }),
    { ...writeOptions, message: '单据类型副本已创建' }
  )
}

export async function deleteDocumentTypes(ids: string[]) {
  return await responseHandle(
    () => supabase.from('mdm_document_type').delete({ count: 'exact' }).in('id', ids).select('id'),
    {
      ...writeOptions,
      message: ids.length > 1 ? `已删除 ${ids.length} 条单据类型` : '单据类型已删除',
      errorMessage: '删除失败，请先解除业务单据对该类型的引用'
    }
  )
}

export async function exportDocumentTypes(
  params: DocumentTypeExportQuery
): Promise<DocumentTypeExportRecord[]> {
  const { data } = await responseHandle<DocumentTypeExportRecord[]>(
    () =>
      supabase.rpc('export_mdm_document_types', {
        p_tenant_id: params.tenantId ?? null,
        p_menu_ids: params.menuIds?.length ? params.menuIds : null,
        p_keyword: normalizeNullableText(params.keyword),
        p_enabled: params.enabled ?? null,
        p_is_default: params.isDefault ?? null,
        p_limit: params.limit ?? 10000
      }),
    { ...readOptions, errorMessage: '导出数据加载失败，请检查当前权限后重试' }
  )
  return data ?? []
}

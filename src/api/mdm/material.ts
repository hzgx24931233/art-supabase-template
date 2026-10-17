import { omit } from 'lodash-es'
import { useSupabase } from '@/hooks'
import { buildOrIlikeFilter } from '@/utils/supabase/search'
import type {
  MaterialArchive,
  MaterialArchiveInput,
  MaterialAttributeGroup,
  MaterialCategory,
  MaterialCategoryInput,
  MaterialReferenceKind,
  MaterialReferenceQuery,
  MaterialReferenceRecord
} from './material.types'
import { alignMaterialArchiveDatabaseKeys } from './material-write-payload'

export * from './material.types'

const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()
const readOptions = {
  breakReturn: true,
  showErrorMessage: false,
  errorMessage: '物料主数据加载失败，请重试'
}
const writeOptions = {
  breakReturn: true,
  showErrorMessage: true,
  showMessage: true,
  requireAffected: true,
  message: '保存成功',
  errorMessage: '操作失败，请检查数据后重试'
}

const referenceTables = {
  'unit-of-measure': 'mdm_unit_of_measure',
  'material-type': 'mdm_material_type',
  'attribute-group': 'mdm_material_attribute_group',
  'code-rule': 'mdm_material_code_rule'
} as const

const referenceSearchFields: Record<MaterialReferenceKind, string[]> = {
  'unit-of-measure': ['unit_code', 'unit_name', 'symbol', 'dimension'],
  'material-type': ['type_code', 'type_name', 'code_prefix'],
  'attribute-group': ['group_code', 'group_name'],
  'code-rule': ['rule_code', 'rule_name', 'prefix']
}

interface MaterialAttributeValueRow {
  id: string
  attributeId: string
  attributeValue: string
  sort: number
}

interface MaterialAttributeRow {
  id: string
  groupId: string
  attributeKey: string
  attributeName: string
  required: boolean
  enabled: boolean
  sort: number
  values: MaterialAttributeValueRow[]
}

type MaterialAttributeGroupRow = Omit<MaterialAttributeGroup, 'attributes'> & {
  attributes: MaterialAttributeRow[]
}

async function fetchMaterialAttributeGroups(params?: MaterialReferenceQuery) {
  let query = supabase
    .from('mdm_material_attribute_group')
    .select('*', params ? { count: 'exact' } : undefined)
    .order('sort')
    .order('group_code')
  if (params?.keyword)
    query = query.or(buildOrIlikeFilter(['group_code', 'group_name'], params.keyword))
  if (params?.status) query = query.eq('status', params.status)
  if (params)
    query = query.range((params.current - 1) * params.size, params.current * params.size - 1)

  const { data: groups, total } = await responseHandle<MaterialAttributeGroup[]>(
    () => query,
    readOptions
  )
  const groupIds = (groups ?? []).map((group) => group.id)
  if (!groupIds.length) return { data: [], total: total ?? 0 }

  const [{ data: attributes }, { data: values }] = await Promise.all([
    responseHandle<MaterialAttributeRow[]>(
      () =>
        supabase.from('mdm_material_attribute').select('*').in('group_id', groupIds).order('sort'),
      readOptions
    ),
    responseHandle<MaterialAttributeValueRow[]>(
      () => supabase.from('mdm_material_attribute_value').select('*').order('sort'),
      readOptions
    )
  ])
  const valuesByAttribute = new Map<string, MaterialAttributeValueRow[]>()
  ;(values ?? []).forEach((value) => {
    const list = valuesByAttribute.get(value.attributeId) ?? []
    list.push(value)
    valuesByAttribute.set(value.attributeId, list)
  })
  const attributesByGroup = new Map<string, MaterialAttributeRow[]>()
  ;(attributes ?? []).forEach((attribute) => {
    const list = attributesByGroup.get(attribute.groupId) ?? []
    list.push({ ...attribute, values: valuesByAttribute.get(attribute.id) ?? [] })
    attributesByGroup.set(attribute.groupId, list)
  })
  return {
    data: (groups ?? []).map((group) =>
      normalizeAttributeGroup({ ...group, attributes: attributesByGroup.get(group.id) ?? [] })
    ),
    total: total ?? 0
  }
}

function normalizeAttributeGroup(record: MaterialAttributeGroupRow): MaterialAttributeGroup {
  return {
    ...record,
    attributes: (record.attributes ?? [])
      .toSorted((left, right) => left.sort - right.sort)
      .map((attribute) => ({
        key: attribute.attributeKey,
        name: attribute.attributeName,
        required: attribute.required,
        enabled: attribute.enabled,
        values: (attribute.values ?? [])
          .toSorted((left, right) => left.sort - right.sort)
          .map((item) => item.attributeValue)
      }))
  }
}

export async function fetchMaterialReferences<T extends MaterialReferenceRecord>(
  kind: MaterialReferenceKind,
  params: MaterialReferenceQuery,
  options?: { signal?: AbortSignal }
) {
  if (kind === 'attribute-group') {
    const result = await fetchMaterialAttributeGroups(params)
    return { ...result, current: params.current, size: params.size } as {
      data: T[]
      total: number
      current: number
      size: number
    }
  }
  const referenceKind = kind as Exclude<MaterialReferenceKind, 'attribute-group'>
  const table = referenceTables[referenceKind]
  let query = supabase
    .from(table)
    .select('*', { count: 'exact' })
    .order('sort')
    .order(
      referenceKind === 'unit-of-measure'
        ? 'unit_code'
        : referenceKind === 'material-type'
          ? 'type_code'
          : 'rule_code'
    )
  if (params.keyword)
    query = query.or(buildOrIlikeFilter(referenceSearchFields[referenceKind], params.keyword))
  if (params.status) query = query.eq('status', params.status)
  query = query.range((params.current - 1) * params.size, params.current * params.size - 1)
  const { data, total } = await responseHandle<Array<T | MaterialAttributeGroupRow>>(
    () => (options?.signal ? query.abortSignal(options.signal) : query),
    readOptions
  )
  const records = (data ?? []) as T[]
  return { data: records, total: total ?? 0, current: params.current, size: params.size }
}

export async function fetchMaterialReferenceOptions<T extends MaterialReferenceRecord>(
  kind: MaterialReferenceKind
) {
  if (kind === 'attribute-group') {
    const result = await fetchMaterialAttributeGroups()
    return result.data as T[]
  }
  const referenceKind = kind as Exclude<MaterialReferenceKind, 'attribute-group'>
  const table = referenceTables[referenceKind]
  const { data } = await responseHandle<Array<T | MaterialAttributeGroupRow>>(
    () => supabase.from(table).select('*').eq('status', 'enabled').order('sort'),
    readOptions
  )
  return (data ?? []) as T[]
}

export async function saveMaterialReference(
  kind: MaterialReferenceKind,
  payload: Partial<MaterialReferenceRecord>,
  id?: string
) {
  const table = referenceTables[kind]
  const data = keysToSnakeDeep(
    omit(payload, ['id', 'createBy', 'createTime', 'updateBy', 'updateTime'])
  )
  if (kind === 'attribute-group') {
    await responseHandle(
      () =>
        supabase.rpc('mdm_save_material_attribute_group', {
          p_payload: data,
          p_id: id ?? null
        }),
      { ...writeOptions, requireAffected: false }
    )
    return
  }
  if (kind === 'code-rule') {
    await responseHandle(
      () =>
        supabase.rpc('mdm_save_material_code_rule_secure', {
          p_id: id ?? null,
          p_payload: data
        }),
      { ...writeOptions, requireAffected: false }
    )
    return
  }
  await responseHandle(
    () =>
      id
        ? supabase.from(table).update(data, { count: 'exact' }).eq('id', id).select('id')
        : supabase.from(table).insert(data, { count: 'exact' }).select('id'),
    writeOptions
  )
}

export async function deleteMaterialReferences(kind: MaterialReferenceKind, ids: string[]) {
  await responseHandle(
    () =>
      supabase.from(referenceTables[kind]).delete({ count: 'exact' }).in('id', ids).select('id'),
    { ...writeOptions, message: '删除成功', errorMessage: '删除失败，请先解除关联数据' }
  )
}

export async function setMaterialReferencesEnabled(
  kind: MaterialReferenceKind,
  ids: string[],
  enabled: boolean
) {
  if (kind === 'code-rule' && enabled) {
    const id = ids[0]
    if (!id) return
    await responseHandle(() => supabase.rpc('mdm_switch_material_code_rule_secure', { p_id: id }), {
      ...writeOptions,
      requireAffected: false,
      message: '已切换启用规则'
    })
    return
  }
  await responseHandle(
    () =>
      supabase
        .from(referenceTables[kind])
        .update({ status: enabled ? 'enabled' : 'disabled' }, { count: 'exact' })
        .in('id', ids)
        .select('id'),
    { ...writeOptions, message: enabled ? '已启用' : '已停用' }
  )
}

export async function fetchMaterialCategories(): Promise<MaterialCategory[]> {
  const { data } = await responseHandle<MaterialCategory[]>(
    () => supabase.from('mdm_material_category').select('*').order('sort').order('category_name'),
    readOptions
  )
  return data ?? []
}

export async function saveMaterialCategory(payload: MaterialCategoryInput, id?: string) {
  const data = keysToSnakeDeep(payload)
  await responseHandle(
    () =>
      id
        ? supabase
            .from('mdm_material_category')
            .update(data, { count: 'exact' })
            .eq('id', id)
            .select('id')
        : supabase.from('mdm_material_category').insert(data, { count: 'exact' }).select('id'),
    writeOptions
  )
}

export async function deleteMaterialCategories(ids: string[]) {
  await responseHandle(
    () =>
      supabase.from('mdm_material_category').delete({ count: 'exact' }).in('id', ids).select('id'),
    {
      ...writeOptions,
      message: '物料分类已删除',
      errorMessage: '删除失败，请先移除下级分类或关联物料'
    }
  )
}

export async function setMaterialCategoriesEnabled(ids: string[], enabled: boolean) {
  await responseHandle(
    () =>
      supabase
        .from('mdm_material_category')
        .update({ status: enabled ? 'enabled' : 'disabled' }, { count: 'exact' })
        .in('id', ids)
        .select('id'),
    { ...writeOptions, message: enabled ? '分类已启用' : '分类已停用' }
  )
}

export interface MaterialArchiveQuery {
  current: number
  size: number
  keyword?: string
  categoryId?: string
  categoryIds?: string[]
  status?: 'enabled' | 'disabled'
  materialTypeId?: string
}

export async function fetchMaterialArchives(
  params: MaterialArchiveQuery,
  options?: { signal?: AbortSignal }
) {
  let query = supabase
    .from('mdm_material')
    .select('*', { count: 'exact' })
    .order('sort')
    .order('material_code')
  if (params.keyword)
    query = query.or(
      buildOrIlikeFilter(
        ['material_code', 'material_name', 'specification_model', 'drawing_no', 'description'],
        params.keyword
      )
    )
  if (params.categoryIds?.length) query = query.in('category_id', params.categoryIds)
  else if (params.categoryId) query = query.eq('category_id', params.categoryId)
  if (params.materialTypeId) query = query.eq('material_type_id', params.materialTypeId)
  if (params.status) query = query.eq('status', params.status)
  query = query.range((params.current - 1) * params.size, params.current * params.size - 1)
  const { data, total } = await responseHandle<MaterialArchive[]>(
    () => (options?.signal ? query.abortSignal(options.signal) : query),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0, current: params.current, size: params.size }
}

export async function saveMaterialArchive(payload: MaterialArchiveInput, id?: string) {
  const databasePayload = alignMaterialArchiveDatabaseKeys(keysToSnakeDeep({ ...payload }))
  await responseHandle(
    () =>
      supabase.rpc('mdm_save_material_secure', {
        p_id: id ?? null,
        p_payload: databasePayload
      }),
    { ...writeOptions, message: id ? '物料编码已更新' : '物料编码已创建' }
  )
}

export async function deleteMaterialArchives(ids: string[]) {
  await responseHandle(
    () => supabase.from('mdm_material').delete({ count: 'exact' }).in('id', ids).select('id'),
    {
      ...writeOptions,
      message: '物料档案已删除',
      errorMessage: '删除失败，物料可能已被业务单据引用'
    }
  )
}

export async function setMaterialArchivesEnabled(ids: string[], enabled: boolean) {
  await responseHandle(
    () =>
      supabase
        .from('mdm_material')
        .update({ status: enabled ? 'enabled' : 'disabled' }, { count: 'exact' })
        .in('id', ids)
        .select('id'),
    { ...writeOptions, message: enabled ? '物料已启用' : '物料已停用' }
  )
}

export async function generateMaterialCode(params: {
  ruleId: string
  materialTypeId?: string
  categoryId?: string
}) {
  const { data } = await responseHandle<string>(
    () =>
      supabase.rpc('mdm_generate_material_code', {
        p_rule_id: params.ruleId,
        p_material_type_id: params.materialTypeId ?? null,
        p_category_id: params.categoryId ?? null
      }),
    { ...writeOptions, showMessage: false, message: '' }
  )
  return data ?? ''
}

export interface MaterialContextOption {
  id: string
  code?: string
  name: string
  applyBatch?: boolean
  applySerial?: boolean
  warehouseType?: string
  businessScopes?: string[]
}

export async function fetchMaterialGroupOptions() {
  const { data } = await responseHandle<Array<{ id: string; code: string; name: string }>>(
    () =>
      supabase
        .from('mdm_master_group')
        .select('id,code,name')
        .eq('domain', 'material')
        .eq('enabled', true)
        .order('sort')
        .order('code'),
    readOptions
  )
  return (data ?? []).map((item) => ({ ...item }))
}

export async function fetchMaterialSupplierOptions() {
  const { data } = await responseHandle<
    Array<{ id: string; supplierCode: string; supplierName: string }>
  >(
    () =>
      supabase.from('mdm_supplier').select('id,supplier_code,supplier_name').order('supplier_code'),
    readOptions
  )
  return (data ?? []).map((item) => ({
    id: item.id,
    code: item.supplierCode,
    name: item.supplierName
  }))
}

export async function fetchMaterialWarehouseOptions() {
  const { data } = await responseHandle<
    Array<{
      id: string
      warehouseCode: string
      warehouseName: string
      warehouseType: string
      businessScopes: string[]
    }>
  >(
    () =>
      supabase
        .from('mdm_warehouse')
        .select('id,warehouse_code,warehouse_name,warehouse_type,business_scopes')
        .eq('status', 'enabled')
        .order('warehouse_code'),
    readOptions
  )
  return (data ?? []).map((item) => ({
    id: item.id,
    code: item.warehouseCode,
    name: item.warehouseName,
    warehouseType: item.warehouseType,
    businessScopes: item.businessScopes
  }))
}

export async function fetchMaterialOutboundRuleOptions() {
  const { data } = await responseHandle<Array<{ id: string; ruleCode: string; ruleName: string }>>(
    () =>
      supabase
        .from('mdm_outbound_rule')
        .select('id,rule_code,rule_name')
        .eq('status', 'enabled')
        .order('rule_code'),
    readOptions
  )
  return (data ?? []).map((item) => ({
    id: item.id,
    code: item.ruleCode,
    name: item.ruleName
  }))
}

export async function fetchMaterialSupplyRuleOptions() {
  const { data } = await responseHandle<
    Array<{
      id: string
      ruleCode: string
      ruleName: string
      applyBatch: boolean
      applySerial: boolean
    }>
  >(
    () =>
      supabase
        .from('mdm_supply_chain_code_rule')
        .select('id,rule_code,rule_name,apply_batch,apply_serial')
        .eq('status', 'enabled')
        .order('rule_code'),
    readOptions
  )
  return (data ?? []).map((item) => ({
    id: item.id,
    code: item.ruleCode,
    name: item.ruleName,
    applyBatch: item.applyBatch,
    applySerial: item.applySerial
  }))
}

export async function fetchMaterialSiteOptions(): Promise<MaterialContextOption[]> {
  const { data } = await responseHandle<Array<{ id: string; siteName: string }>>(
    () => supabase.from('mdm_site').select('id,site_name').order('sort'),
    readOptions
  )
  return (data ?? []).map((item) => ({
    id: item.id,
    name: item.siteName
  }))
}

export async function fetchMaterialStorageOptions(): Promise<MaterialContextOption[]> {
  const { data } = await responseHandle<
    Array<{ id: string; locationCode: string; locationName: string }>
  >(
    () =>
      supabase
        .from('mdm_storage_location')
        .select('id,location_code,location_name')
        .eq('status', 'enabled')
        .order('location_code'),
    readOptions
  )
  return (data ?? []).map((item) => ({
    id: item.id,
    code: item.locationCode,
    name: item.locationName
  }))
}

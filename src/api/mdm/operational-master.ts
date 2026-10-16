import { useSupabase } from '@/hooks'
export { fetchMasterGroups } from '@/api/master-groups'
import { buildOrIlikeFilter } from '@/utils/supabase/search'
import type {
  ActivityFormulaParameter,
  ActivityFormulaParameterInput,
  ActivityFormulaPurpose,
  MasterGroupInput,
  MasterReferenceOption,
  OperationalMasterInput,
  OperationalMasterKind,
  OperationalMasterQuery,
  OperationalMasterRecord,
  OperationalMasterReferences
} from './operational-master.types'

export * from './operational-master.types'

interface ResourceDefinition {
  table: string
  codeColumn: string
  nameColumn: string
  keywordColumns: string[]
  /**
   * 列表启用状态过滤口径。缺省按布尔列 enabled 过滤；
   * 显式 null 表示该表没有启用状态维度（如车辆档案由审核状态与运营状态承载）。
   */
  enabledFilter?: { column: string; trueValue: unknown; falseValue: unknown } | null
}

const defaultEnabledFilter = { column: 'enabled', trueValue: true, falseValue: false }

const resources: Record<OperationalMasterKind, ResourceDefinition> = {
  customer: {
    table: 'mdm_customer',
    codeColumn: 'customer_code',
    nameColumn: 'customer_name',
    keywordColumns: [
      'customer_code',
      'customer_name',
      'contact_name',
      'contact_phone',
      'contact_department',
      'contact_position',
      'contact_email',
      'contact_qq',
      'invoice_title'
    ]
  },
  project: {
    table: 'mdm_project',
    codeColumn: 'project_code',
    nameColumn: 'project_name',
    keywordColumns: ['project_code', 'project_name', 'contact_name', 'contact_phone', 'region']
  },
  'activity-formula': {
    table: 'mdm_activity_formula',
    codeColumn: 'code',
    nameColumn: 'name',
    keywordColumns: ['code', 'name', 'purpose', 'description']
  },
  'operation-control-code': {
    table: 'mdm_operation_control_code',
    codeColumn: 'control_code',
    nameColumn: 'control_code_name',
    keywordColumns: ['control_code', 'control_code_name', 'remark']
  },
  operation: {
    table: 'mdm_operation',
    codeColumn: 'code',
    nameColumn: 'name',
    keywordColumns: ['code', 'name', 'mnemonic', 'remark']
  },
  workstation: {
    table: 'mdm_workstation',
    codeColumn: 'workstation_code',
    nameColumn: 'workstation_name',
    keywordColumns: ['workstation_code', 'workstation_name', 'andon_sim_no', 'remark']
  },
  cargo: {
    table: 'mdm_cargo',
    codeColumn: 'cargo_code',
    nameColumn: 'cargo_name',
    keywordColumns: ['cargo_code', 'cargo_name', 'spec_model', 'unit', 'remark']
  },
  carrier: {
    table: 'mdm_carrier',
    codeColumn: 'carrier_code',
    nameColumn: 'company_name',
    keywordColumns: [
      'carrier_code',
      'company_name',
      'carrier_type',
      'legal_representative',
      'contact_name',
      'contact_phone',
      'remark'
    ]
  },
  station: {
    table: 'mdm_station',
    codeColumn: 'station_code',
    nameColumn: 'station_name',
    keywordColumns: ['station_code', 'station_name', 'station_type', 'manager_name', 'remark']
  },
  vehicle: {
    table: 'mdm_vehicle',
    codeColumn: 'plate_no',
    nameColumn: 'plate_no',
    keywordColumns: [
      'plate_no',
      'self_no',
      'vin',
      'company_name',
      'brand_model',
      'driver_one_name'
    ],
    enabledFilter: null
  },
  part: {
    table: 'mdm_part',
    codeColumn: 'part_code',
    nameColumn: 'part_name',
    keywordColumns: [
      'part_code',
      'part_name',
      'brand',
      'model',
      'manufacturer',
      'supplier_contact'
    ],
    enabledFilter: { column: 'status', trueValue: '1', falseValue: '2' }
  },
  'part-category': {
    table: 'mdm_part_category',
    codeColumn: 'category_code',
    nameColumn: 'category_name',
    keywordColumns: ['category_code', 'category_name', 'remark'],
    enabledFilter: { column: 'status', trueValue: '1', falseValue: '2' }
  }
}

/** 列表页是否需要渲染启用状态筛选：车辆档案等由运营状态与审核状态承载，不提供该维度。 */
export function supportsOperationalMasterEnabledFilter(kind: OperationalMasterKind): boolean {
  const definition = resources[kind]
  return (
    (definition.enabledFilter === undefined ? defaultEnabledFilter : definition.enabledFilter) !==
    null
  )
}

const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()
const readOptions = {
  breakReturn: true,
  showErrorMessage: true,
  errorMessage: '主数据加载失败，请重试'
}
const writeOptions = {
  breakReturn: true,
  showErrorMessage: true,
  requireAffected: true,
  showMessage: true,
  message: '保存成功',
  errorMessage: '保存失败，请检查编码、关联数据和当前权限'
}

export async function fetchOperationalMaster(
  kind: OperationalMasterKind,
  params: OperationalMasterQuery,
  options?: { signal?: AbortSignal }
) {
  const definition = resources[kind]
  let query = supabase
    .from(definition.table)
    .select('*', { count: 'exact' })
    .order('update_time', { ascending: false })
    .range((params.current - 1) * params.size, params.current * params.size - 1)

  if (params.groupIds?.length) query = query.in('group_id', params.groupIds)
  else if (params.groupId) query = query.eq('group_id', params.groupId)
  const enabledFilter =
    definition.enabledFilter === undefined ? defaultEnabledFilter : definition.enabledFilter
  if (typeof params.enabled === 'boolean' && enabledFilter) {
    query = query.eq(
      enabledFilter.column,
      params.enabled ? enabledFilter.trueValue : enabledFilter.falseValue
    )
  }
  if (params.keyword?.trim()) {
    query = query.or(buildOrIlikeFilter(definition.keywordColumns, params.keyword.trim()))
  }

  const { data, total } = await responseHandle<OperationalMasterRecord[]>(
    () => (options?.signal ? query.abortSignal(options.signal) : query),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0, current: params.current, size: params.size }
}

export async function saveOperationalMaster(
  kind: OperationalMasterKind,
  input: OperationalMasterInput,
  id?: string
) {
  const definition = resources[kind]
  const payload = keysToSnakeDeep(input)
  const { data } = await responseHandle<Array<{ id: string }>>(
    () =>
      id
        ? supabase
            .from(definition.table)
            .update(payload, { count: 'exact' })
            .eq('id', id)
            .select('id')
        : supabase.from(definition.table).insert(payload, { count: 'exact' }).select('id'),
    writeOptions
  )
  return data?.[0]?.id ?? ''
}

export async function importOperationalMasters(
  kind: OperationalMasterKind,
  rows: OperationalMasterInput[]
) {
  const definition = resources[kind]
  await responseHandle(
    () =>
      supabase
        .from(definition.table)
        .insert(keysToSnakeDeep(rows), { count: 'exact' })
        .select('id'),
    { ...writeOptions, message: `已导入 ${rows.length} 条主数据` }
  )
}

export async function deleteOperationalMasters(kind: OperationalMasterKind, ids: string[]) {
  const definition = resources[kind]
  await responseHandle(
    () => supabase.from(definition.table).delete({ count: 'exact' }).in('id', ids).select('id'),
    { ...writeOptions, message: '删除成功', errorMessage: '删除失败，请先解除业务引用' }
  )
}

export async function fetchActivityFormulaParameters(
  purpose: ActivityFormulaPurpose
): Promise<ActivityFormulaParameter[]> {
  const { data } = await responseHandle<ActivityFormulaParameter[]>(
    () =>
      supabase
        .from('mdm_activity_formula_parameter')
        .select('*')
        .eq('purpose', purpose)
        .order('sort')
        .order('code'),
    { ...readOptions, errorMessage: '公式参数加载失败，请重试' }
  )
  return data ?? []
}

export async function saveActivityFormulaParameter(
  input: ActivityFormulaParameterInput,
  id?: string
) {
  const payload = keysToSnakeDeep(input)
  await responseHandle(
    () =>
      id
        ? supabase
            .from('mdm_activity_formula_parameter')
            .update(payload, { count: 'exact' })
            .eq('id', id)
            .select('id')
        : supabase
            .from('mdm_activity_formula_parameter')
            .insert(payload, { count: 'exact' })
            .select('id'),
    { ...writeOptions, message: id ? '参数已更新' : '参数已创建', errorMessage: '公式参数保存失败' }
  )
}

export async function deleteActivityFormulaParameter(id: string) {
  await responseHandle(
    () =>
      supabase
        .from('mdm_activity_formula_parameter')
        .delete({ count: 'exact' })
        .eq('id', id)
        .select('id'),
    { ...writeOptions, message: '参数已删除', errorMessage: '参数含有下级节点，无法删除' }
  )
}

export async function saveMasterGroup(input: MasterGroupInput, id?: string) {
  const payload = keysToSnakeDeep(input)
  await responseHandle(
    () =>
      id
        ? supabase
            .from('mdm_master_group')
            .update(payload, { count: 'exact' })
            .eq('id', id)
            .select('id')
        : supabase.from('mdm_master_group').insert(payload, { count: 'exact' }).select('id'),
    writeOptions
  )
}

export async function deleteMasterGroup(id: string) {
  await responseHandle(
    () => supabase.from('mdm_master_group').delete({ count: 'exact' }).eq('id', id).select('id'),
    { ...writeOptions, message: '分组已删除', errorMessage: '分组仍有下级或主数据引用，无法删除' }
  )
}

async function fetchReference(table: string, columns: string): Promise<MasterReferenceOption[]> {
  const query = supabase.from(table).select(columns)
  const { data } = await responseHandle<MasterReferenceOption[]>(() => query, {
    ...readOptions,
    showErrorMessage: false
  })
  return data ?? []
}

async function fetchMenuReferences(): Promise<MasterReferenceOption[]> {
  const { data } = await responseHandle<Array<{ id: string; name: string; meta: unknown }>>(
    () =>
      supabase
        .from('sys_menu')
        .select('id,name,meta')
        .in('type', ['folder', 'menu'])
        .order('app_code')
        .order('sort'),
    { ...readOptions, showErrorMessage: false }
  )
  return (data ?? []).map((item) => {
    const meta =
      item.meta && typeof item.meta === 'object' && !Array.isArray(item.meta)
        ? (item.meta as Record<string, unknown>)
        : {}
    return {
      id: item.id,
      code: item.name,
      name: typeof meta.title === 'string' ? meta.title : item.name
    }
  })
}

export async function fetchOperationalMasterReferences(): Promise<OperationalMasterReferences> {
  const [
    customers,
    employees,
    departments,
    workCenters,
    personnel,
    units,
    menus,
    suppliers,
    partCategories
  ] = await Promise.all([
    fetchReference('mdm_customer', 'id,code:customer_code,name:customer_name'),
    fetchReference('mdm_employee', 'id,code:employee_no,name:employee_name'),
    fetchReference('mdm_production_department', 'id,parent_id,code,name'),
    fetchReference('mdm_work_center', 'id,department_id,code,name'),
    fetchReference('mdm_production_personnel', 'id,code:employee_no,name'),
    fetchReference('mdm_unit_of_measure', 'id,code:unit_code,name:unit_name'),
    fetchMenuReferences(),
    fetchReference('mdm_supplier', 'id,code:supplier_code,name:supplier_name'),
    fetchReference('mdm_part_category', 'id,parent_id,code:category_code,name:category_name')
  ])
  return {
    customers,
    employees,
    departments,
    workCenters,
    personnel,
    units,
    menus,
    suppliers,
    partCategories
  }
}

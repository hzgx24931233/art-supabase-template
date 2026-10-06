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
}

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
  }
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

  if (params.tenantId) query = query.eq('tenant_id', params.tenantId)
  if (params.groupIds?.length) query = query.in('group_id', params.groupIds)
  else if (params.groupId) query = query.eq('group_id', params.groupId)
  if (typeof params.enabled === 'boolean') query = query.eq('enabled', params.enabled)
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
  tenantId: string,
  purpose: ActivityFormulaPurpose
): Promise<ActivityFormulaParameter[]> {
  const { data } = await responseHandle<ActivityFormulaParameter[]>(
    () =>
      supabase
        .from('mdm_activity_formula_parameter')
        .select('*')
        .eq('tenant_id', tenantId)
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

async function fetchReference(
  table: string,
  columns: string,
  tenantId?: string
): Promise<MasterReferenceOption[]> {
  let query = supabase.from(table).select(columns)
  if (tenantId) query = query.eq('tenant_id', tenantId)
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
      name: typeof meta.title === 'string' ? meta.title : item.name,
      tenantId: ''
    }
  })
}

export async function fetchOperationalMasterReferences(
  tenantId?: string
): Promise<OperationalMasterReferences> {
  const [customers, employees, departments, workCenters, personnel, units, menus] =
    await Promise.all([
      fetchReference(
        'mdm_customer',
        'id,tenant_id,code:customer_code,name:customer_name',
        tenantId
      ),
      fetchReference('mdm_employee', 'id,tenant_id,code:employee_no,name:employee_name', tenantId),
      fetchReference('mdm_production_department', 'id,tenant_id,parent_id,code,name', tenantId),
      fetchReference('mdm_work_center', 'id,tenant_id,department_id,code,name', tenantId),
      fetchReference('mdm_production_personnel', 'id,tenant_id,code:employee_no,name', tenantId),
      fetchReference('mdm_unit_of_measure', 'id,tenant_id,code:unit_code,name:unit_name', tenantId),
      fetchMenuReferences()
    ])
  return { customers, employees, departments, workCenters, personnel, units, menus }
}

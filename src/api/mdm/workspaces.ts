import { useSupabase } from '@/hooks'
import { normalizeNullableText } from '@/utils/form/normalize'
import { buildOrIlikeFilter } from '@/utils/supabase/search'
import { fetchAllRangePages } from '@/utils/supabase/pagination'
import { keyBy, uniq } from 'lodash-es'
import type {
  EmployeeSelectorContractParams,
  EmployeeIntegrationItem
} from '@/api/integration/employees'
import type {
  WorkspaceQuery,
  OperationTemplate,
  OperationTemplateInput,
  WorkCenter,
  WorkCenterInput,
  WorkCenterActivity,
  WorkCenterActivityInput,
  WorkCenterReference,
  CenterAdjustment,
  CenterAdjustmentInput,
  CenterDevice,
  CenterDeviceInput,
  ProcessRoute,
  ProcessRouteInput,
  ProcessRouteMaterialOption,
  ProcessSequence,
  ProcessSequenceInput,
  ProcessStep,
  ProcessStepInput,
  ProcessRouteReferences,
  CenterPolicy,
  PersonnelCommonWorkCenterInput,
  PersonnelWorkCenterConfig,
  PersonnelWorkCenterQuery,
  Workstation,
  WorkstationInput,
  WorkstationQuery,
  WorkstationScope,
  WorkstationScopeCenter
} from './workspaces.types'
import type { ProductionDepartment, ProductionPerson } from './production.types'
export * from './workspaces.types'
const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()
const read = {
  breakReturn: true,
  showErrorMessage: false,
  errorMessage: '生产配置加载失败，请重试'
}
const write = {
  breakReturn: true,
  showErrorMessage: true,
  requireAffected: true,
  showMessage: true,
  message: '操作成功',
  errorMessage: '操作失败，请检查数据后重试'
}
type WorkCenterRow = Omit<WorkCenter, 'department' | 'mainCenter'>
type WorkCenterDepartment = NonNullable<WorkCenter['department']>
type MainCenterReference = NonNullable<WorkCenter['mainCenter']>
type CenterPersonReference = Pick<
  ProductionPerson,
  'id' | 'tenantId' | 'name' | 'employeeNo' | 'jobTitle' | 'enabled'
>

/** One tenant-safe projection for selection, edit display, imports and adjustments. */
async function fetchCenterPersonReferences(filter: { ids?: string[]; employeeNos?: string[] }) {
  if (!filter.ids?.length && !filter.employeeNos?.length) return []
  const { data } = await fetchAllRangePages<CenterPersonReference>(({ from, to }) => {
    let query = supabase.rpc('mdm_work_center_people').select('*').order('id')
    if (filter.ids) query = query.in('id', filter.ids)
    if (filter.employeeNos) query = query.in('employee_no', filter.employeeNos).eq('enabled', true)
    return responseHandle<CenterPersonReference[]>(() => query.range(from, to), read)
  })
  return data ?? []
}

function toCenterEmployee(row: CenterPersonReference): EmployeeIntegrationItem {
  return {
    id: row.id,
    tenantId: row.tenantId,
    employeeName: row.name,
    employeeNo: row.employeeNo,
    employmentStatus: row.enabled ? 'active' : 'inactive',
    jobTitle: row.jobTitle
  }
}
export async function fetchOperationTemplates(
  p: WorkspaceQuery,
  options?: { signal?: AbortSignal }
) {
  let q = supabase
    .from('mdm_operation_template')
    .select('*', { count: 'exact' })
    .eq('tenant_id', p.tenantId)
    .order('sort')
    .order('create_time', { ascending: false })
  if (p.keyword) q = q.or(buildOrIlikeFilter(['name'], p.keyword))
  if (typeof p.enabled === 'boolean') q = q.eq('enabled', p.enabled)
  q = q.range((p.current - 1) * p.size, p.current * p.size - 1)
  const { data, total } = await responseHandle<OperationTemplate[]>(
    () => (options?.signal ? q.abortSignal(options.signal) : q),
    read
  )
  return { data: data ?? [], total: total ?? 0, current: p.current, size: p.size }
}
export async function saveOperationTemplate(input: OperationTemplateInput, id?: string) {
  const { items, ...fields } = input
  const payload = { ...keysToSnakeDeep(fields), items }
  await responseHandle(
    () =>
      id
        ? supabase.from('mdm_operation_template').update(payload).eq('id', id).select('id')
        : supabase.from('mdm_operation_template').insert(payload).select('id'),
    write
  )
}
export async function deleteOperationTemplates(ids: string[]) {
  await responseHandle(
    () => supabase.from('mdm_operation_template').delete().in('id', ids).select('id'),
    { ...write, errorMessage: '删除失败，请先解除工艺路线绑定' }
  )
}
export async function setOperationTemplatesEnabled(ids: string[], enabled: boolean) {
  await responseHandle(
    () => supabase.from('mdm_operation_template').update({ enabled }).in('id', ids).select('id'),
    write
  )
}
export async function fetchWorkCenters(p: WorkspaceQuery, options?: { signal?: AbortSignal }) {
  let q = supabase
    .from('mdm_work_center')
    .select(
      '*,operationControlCode:mdm_operation_control_code!mdm_work_center_operation_control_code_fk(id,code:control_code,name:control_code_name)',
      { count: 'exact' }
    )
    .order('sort')
    .order('code')
  if (p.tenantId) q = q.eq('tenant_id', p.tenantId)
  if (p.keyword) q = q.or(buildOrIlikeFilter(['code', 'name'], p.keyword))
  if (p.departmentIds) q = q.in('department_id', p.departmentIds)
  q = q.range((p.current - 1) * p.size, p.current * p.size - 1)
  const { data, total } = await responseHandle<WorkCenterRow[]>(
    () => (options?.signal ? q.abortSignal(options.signal) : q),
    read
  )
  const rows = data ?? []
  const departmentIds = uniq(rows.map((row) => row.departmentId).filter(Boolean))
  const mainCenterIds = uniq(
    rows.map((row) => row.mainCenterId).filter((id): id is string => Boolean(id))
  )
  const [departmentResult, mainCenterResult] = await Promise.all([
    departmentIds.length
      ? responseHandle<WorkCenterDepartment[]>(() => {
          let query = supabase
            .from('mdm_production_department')
            .select('id,name,code')
            .in('id', departmentIds)
          if (p.tenantId) query = query.eq('tenant_id', p.tenantId)
          return options?.signal ? query.abortSignal(options.signal) : query
        }, read)
      : Promise.resolve({ data: [] as WorkCenterDepartment[] }),
    mainCenterIds.length
      ? responseHandle<MainCenterReference[]>(() => {
          let query = supabase
            .from('mdm_work_center')
            .select('id,code,name')
            .in('id', mainCenterIds)
          if (p.tenantId) query = query.eq('tenant_id', p.tenantId)
          return options?.signal ? query.abortSignal(options.signal) : query
        }, read)
      : Promise.resolve({ data: [] as MainCenterReference[] })
  ])
  const departments = keyBy(departmentResult.data ?? [], 'id')
  const mainCenters = keyBy(mainCenterResult.data ?? [], 'id')
  return {
    data: rows.map((row) => ({
      ...row,
      operationControlCode: row.operationControlCode
        ? {
            id: row.operationControlCode.id,
            code: row.operationControlCode.code,
            name: row.operationControlCode.name
          }
        : null,
      department: departments[row.departmentId] ?? null,
      mainCenter: row.mainCenterId ? (mainCenters[row.mainCenterId] ?? null) : null
    })),
    total: total ?? 0,
    current: p.current,
    size: p.size
  }
}
export async function saveWorkCenter(
  input: WorkCenterInput,
  activities: WorkCenterActivityInput[],
  id?: string
) {
  const { policy, ...fields } = input

  const { data } = await responseHandle<string>(
    () =>
      supabase.rpc('mdm_save_work_center_with_activities', {
        p_center_id: id || null,
        p_center: { ...keysToSnakeDeep(fields), policy },
        p_activities: keysToSnakeDeep(activities)
      }),
    { ...write, requireAffected: false, message: id ? '工作中心已更新' : '工作中心已创建' }
  )
  return data
}

export async function fetchWorkCenterActivities(centerId: string) {
  const { data } = await responseHandle<WorkCenterActivity[]>(
    () => supabase.rpc('mdm_work_center_activities', { p_center_id: centerId }),
    read
  )
  return data ?? []
}

export async function fetchWorkCenterReferenceOptions(
  kind: 'control_code' | 'activity_formula' | 'equipment',
  tenantId: string,
  keyword: string,
  current: number,
  size: number,
  centerId?: string
) {
  const { data } = await responseHandle<{ records: WorkCenterReference[]; total: number }>(
    () =>
      supabase.rpc('mdm_work_center_reference_options', {
        p_kind: kind,
        p_tenant_id: tenantId || null,
        p_keyword: keyword,
        p_from: (current - 1) * size,
        p_to: current * size - 1,
        p_center_id: centerId || null
      }),
    read
  )
  return { data: data?.records ?? [], total: data?.total ?? 0 }
}
export async function fetchAvailableMainCenters(
  keyword: string,
  current: number,
  size: number,
  centerId?: string
) {
  const { data } = await responseHandle<{
    records: Pick<WorkCenter, 'id' | 'code' | 'name'>[]
    total: number
  }>(
    () =>
      supabase.rpc('mdm_available_main_centers', {
        p_center_id: centerId ?? null,
        p_keyword: keyword,
        p_from: (current - 1) * size,
        p_to: current * size - 1
      }),
    read
  )
  return { data: data?.records ?? [], total: data?.total ?? 0 }
}
export async function fetchCenterImportReferences(
  codes: string[],
  employeeNos: string[],
  tenantId: string
) {
  const [centers, people] = await Promise.all([
    codes.length
      ? responseHandle<Pick<WorkCenter, 'id' | 'code'>[]>(
          () =>
            supabase
              .from('mdm_work_center')
              .select('id,code')
              .eq('tenant_id', tenantId)
              .in('code', codes),
          read
        )
      : Promise.resolve({ data: [] }),
    fetchCenterPersonReferences({ employeeNos })
  ])
  return {
    centers: centers.data ?? [],
    people: people.filter((person) => person.tenantId === tenantId)
  }
}
export async function importWorkCenters(inputs: Array<WorkCenterInput & { tenantId: string }>) {
  await responseHandle(
    () =>
      supabase
        .from('mdm_work_center')
        .insert(inputs.map(({ policy, ...fields }) => ({ ...keysToSnakeDeep(fields), policy })))
        .select('id'),
    write
  )
}
export async function deleteWorkCenters(ids: string[]) {
  await responseHandle(() => supabase.from('mdm_work_center').delete().in('id', ids).select('id'), {
    ...write,
    errorMessage: '删除失败，请先解除主工序位和工艺路线关联'
  })
}

export async function fetchWorkstationScope(tenantId?: string | null): Promise<WorkstationScope> {
  const [departmentResult, centerResult] = await Promise.all([
    fetchAllRangePages<ProductionDepartment>(({ from, to }) => {
      let query = supabase.from('mdm_production_department').select('*').order('sort').order('code')
      if (tenantId) query = query.eq('tenant_id', tenantId)
      return responseHandle<ProductionDepartment[]>(() => query.range(from, to), read)
    }),
    fetchAllRangePages<WorkstationScopeCenter>(({ from, to }) => {
      let query = supabase
        .from('mdm_work_center')
        .select('id,tenant_id,department_id,code,name,sort')
        .order('sort')
        .order('code')
      if (tenantId) query = query.eq('tenant_id', tenantId)
      return responseHandle<WorkstationScopeCenter[]>(() => query.range(from, to), read)
    })
  ])
  return {
    departments: departmentResult.data ?? [],
    workCenters: centerResult.data ?? []
  }
}

export async function fetchWorkstations(
  params: WorkstationQuery,
  options?: { signal?: AbortSignal }
) {
  const { current, size, tenantId, workCenterId, keyword, enabled } = params
  if (!workCenterId) return { data: [], total: 0, current, size }

  let query = supabase
    .from('mdm_workstation')
    .select(
      `*,
      department:mdm_production_department!mdm_workstation_department_fk(id,tenant_id,code,name),
      workCenter:mdm_work_center!mdm_workstation_center_fk(id,tenant_id,code,name),
      responsiblePerson:mdm_production_personnel!mdm_workstation_person_fk(id,tenant_id,name,employee_no,job_title,enabled)`,
      { count: 'exact' }
    )
    .eq('work_center_id', workCenterId)
    .order('workstation_code')
    .range((current - 1) * size, current * size - 1)

  if (tenantId) query = query.eq('tenant_id', tenantId)
  if (typeof enabled === 'boolean') query = query.eq('enabled', enabled)
  if (keyword?.trim()) {
    query = query.or(
      buildOrIlikeFilter(['workstation_code', 'workstation_name', 'andon_sim_no'], keyword.trim())
    )
  }

  const { data, total } = await responseHandle<Workstation[]>(
    () => (options?.signal ? query.abortSignal(options.signal) : query),
    read
  )
  return { data: data ?? [], total: total ?? 0, current, size }
}

export async function saveWorkstation(input: WorkstationInput, id?: string) {
  const payload = keysToSnakeDeep(input)
  await responseHandle(
    () =>
      id
        ? supabase
            .from('mdm_workstation')
            .update(payload, { count: 'exact' })
            .eq('id', id)
            .select('id')
        : supabase.from('mdm_workstation').insert(payload, { count: 'exact' }).select('id'),
    { ...write, message: id ? '工位信息已更新' : '工位已创建' }
  )
}

export async function deleteWorkstations(ids: string[]) {
  await responseHandle(
    () => supabase.from('mdm_workstation').delete({ count: 'exact' }).in('id', ids).select('id'),
    { ...write, message: '工位已删除', errorMessage: '删除失败，请先解除工位的业务引用' }
  )
}
export async function fetchCenterAdjustments(centerId: string) {
  const { data } = await responseHandle<Omit<CenterAdjustment, 'person'>[]>(
    () =>
      supabase
        .from('mdm_work_center_adjustment')
        .select('*')
        .eq('work_center_id', centerId)
        .order('start_time', { ascending: false }),
    read
  )
  const rows = data ?? []
  const people = keyBy(
    await fetchCenterPersonReferences({ ids: uniq(rows.map((row) => row.personId)) }),
    'id'
  )
  return rows.map((row): CenterAdjustment => ({ ...row, person: people[row.personId] ?? null }))
}
export async function saveCenterAdjustment(input: CenterAdjustmentInput) {
  await responseHandle(
    () => supabase.from('mdm_work_center_adjustment').insert(keysToSnakeDeep(input)).select('id'),
    write
  )
}
export async function deleteCenterAdjustment(id: string) {
  await responseHandle(
    () => supabase.from('mdm_work_center_adjustment').delete().eq('id', id).select('id'),
    write
  )
}
export async function setCenterPeople(id: string, personIds: string[]) {
  await responseHandle(
    () =>
      supabase.from('mdm_work_center').update({ person_ids: personIds }).eq('id', id).select('id'),
    write
  )
}
export async function fetchCenterDevices(id: string) {
  const { data } = await responseHandle<{ records: CenterDevice[]; total: number }>(
    () => supabase.rpc('mdm_production_reference_list', { p_kind: 'devices', p_center_id: id }),
    read
  )
  return data?.records ?? []
}

export async function saveCenterDevice(input: CenterDeviceInput, id?: string) {
  await responseHandle(
    () =>
      id
        ? supabase
            .from('mdm_work_center_device')
            .update(keysToSnakeDeep(input))
            .eq('id', id)
            .select('id')
        : supabase.from('mdm_work_center_device').insert(keysToSnakeDeep(input)).select('id'),
    write
  )
}
export async function addCenterDevices(input: {
  workCenterId: string
  equipmentIds: string[]
  mainEquipmentId: string | null
  point: string
}) {
  await responseHandle(
    () =>
      supabase.rpc('mdm_add_work_center_devices', {
        p_work_center_id: input.workCenterId,
        p_equipment_ids: uniq(input.equipmentIds),
        p_main_equipment_id: input.mainEquipmentId,
        p_point: input.point
      }),
    { ...write, requireAffected: false, message: '设备已关联' }
  )
}
export async function deleteCenterDevice(id: string) {
  await responseHandle(
    () => supabase.from('mdm_work_center_device').delete().eq('id', id).select('id'),
    write
  )
}
export async function fetchProductionPersonSelector(p: EmployeeSelectorContractParams = {}) {
  const { from = 0, to = 9 } = p
  let query = supabase
    .rpc('mdm_work_center_people', {}, { count: 'exact' })
    .select('*')
    .eq('enabled', true)
    .order('employee_no')
    .order('id')
  if (p.tenantId) query = query.eq('tenant_id', p.tenantId)
  if (p.keyword) query = query.or(buildOrIlikeFilter(['name', 'employee_no'], p.keyword))
  const { data, total, error } = await responseHandle<CenterPersonReference[]>(
    () => query.range(Math.max(0, from), Math.max(from, to, 0)),
    read
  )
  return {
    data: (data ?? []).map(toCenterEmployee),
    total: total ?? 0,
    error,
    fieldAccess: { contactDetails: false, identityDetails: false }
  }
}
export async function fetchCenterPeople(ids: string[]): Promise<EmployeeIntegrationItem[]> {
  return (await fetchCenterPersonReferences({ ids })).map(toCenterEmployee)
}
export async function fetchPersonnelWorkCenterConfigs(
  params: PersonnelWorkCenterQuery,
  options?: { signal?: AbortSignal }
) {
  const { current, size, keyword, departmentIds, onlyUnconfigured } = params
  const query = supabase.rpc('mdm_list_personnel_common_work_centers', {
    p_department_ids: departmentIds?.length ? departmentIds : null,
    p_keyword: normalizeNullableText(keyword),
    p_only_unconfigured: onlyUnconfigured ?? false,
    p_from: (current - 1) * size,
    p_to: current * size - 1
  })
  const { data } = await responseHandle<{
    records: PersonnelWorkCenterConfig[]
    total: number
  }>(() => (options?.signal ? query.abortSignal(options.signal) : query), read)
  return {
    data: data?.records ?? [],
    total: data?.total ?? 0,
    current,
    size
  }
}
export async function fetchUnconfiguredPersonnelSelector(
  params: EmployeeSelectorContractParams = {},
  departmentIds?: string[]
) {
  const { from = 0, to = 9 } = params
  const result = await fetchPersonnelWorkCenterConfigs({
    tenantId: params.tenantId || '',
    keyword: params.keyword,
    departmentIds,
    onlyUnconfigured: true,
    current: Math.floor(Math.max(from, 0) / Math.max(to - from + 1, 1)) + 1,
    size: Math.max(to - from + 1, 1)
  })
  return {
    data: result.data.map((person): EmployeeIntegrationItem => ({
      id: person.id,
      tenantId: person.tenantId,
      organizationId: person.departmentId,
      employeeName: person.name,
      employeeNo: person.employeeNo,
      phone: person.phone,
      avatarUrl: person.avatarUrl,
      jobTitle: person.jobTitle,
      employmentStatus: 'active',
      organization: {
        id: person.department.id,
        organizationCode: person.department.code,
        organizationName: person.department.name
      }
    })),
    total: result.total,
    error: undefined,
    fieldAccess: { contactDetails: true, identityDetails: false }
  }
}
export async function savePersonnelCommonWorkCenters(input: PersonnelCommonWorkCenterInput) {
  await responseHandle<number>(
    () =>
      supabase.rpc('mdm_save_personnel_common_work_centers', {
        p_personnel_id: input.personnelId,
        p_department_id: input.departmentId,
        p_work_center_ids: uniq(input.workCenterIds)
      }),
    { ...write, requireAffected: false, message: '常用工作中心已保存' }
  )
}
export async function deletePersonnelCommonWorkCenters(personnelIds: string[]) {
  await responseHandle<number>(
    () =>
      supabase.rpc('mdm_delete_personnel_common_work_centers', {
        p_personnel_ids: uniq(personnelIds)
      }),
    { ...write, requireAffected: false, message: '常用工作中心配置已删除' }
  )
}
export async function fetchProductionReferences(
  kind: 'material' | 'equipment',
  _tenantId: string,
  keyword: string,
  current: number,
  size: number
) {
  const { data } = await responseHandle<{ records: Record<string, unknown>[]; total: number }>(
    () =>
      supabase.rpc('mdm_production_reference_options', {
        p_kind: kind,
        p_keyword: keyword,
        p_from: (current - 1) * size,
        p_to: current * size - 1
      }),
    read
  )
  return { data: data?.records ?? [], total: data?.total ?? 0 }
}

export async function fetchProcessRouteMaterialOptions(params: {
  tenantId?: string
  keyword: string
  categoryId?: string
  current: number
  size: number
}) {
  const { data } = await responseHandle<{
    records: ProcessRouteMaterialOption[]
    total: number
  }>(
    () =>
      supabase.rpc('mdm_process_route_material_options', {
        p_tenant_id: normalizeNullableText(params.tenantId),
        p_keyword: params.keyword,
        p_category_id: normalizeNullableText(params.categoryId),
        p_from: (params.current - 1) * params.size,
        p_to: params.current * params.size - 1
      }),
    read
  )
  return { data: data?.records ?? [], total: data?.total ?? 0 }
}

export async function fetchProcessRoutes(p: WorkspaceQuery, options?: { signal?: AbortSignal }) {
  let query = supabase
    .from('mdm_process_route')
    .select(
      `*,material:mdm_material!mdm_process_route_material_tenant_fkey(id,category_id,material_code,material_name,specification_model,drawing_no,material_composition,brand,material_type,material_source,special_purchase_type,production_unit_id,category:mdm_material_category(id,category_code,category_name),materialTypeRef:mdm_material_type(id,type_code,type_name)),group:mdm_master_group!mdm_process_route_group_fk(id,code,name),productionUnit:mdm_unit_of_measure!mdm_process_route_production_unit_fk(id,unit_code,unit_name,symbol),department:mdm_production_department!mdm_process_route_department_fk(id,code,name)`,
      { count: 'exact' }
    )
    .order('is_default', { ascending: false })
    .order('update_time', { ascending: false })
    .range((p.current - 1) * p.size, p.current * p.size - 1)
  if (p.tenantId) query = query.eq('tenant_id', p.tenantId)
  if (p.groupIds?.length) query = query.in('group_id', p.groupIds)
  else if (p.groupId) query = query.eq('group_id', p.groupId)
  if (typeof p.enabled === 'boolean') query = query.eq('enabled', p.enabled)
  if (p.keyword)
    query = query.or(buildOrIlikeFilter(['code', 'name', 'version', 'path'], p.keyword))
  const { data, total } = await responseHandle<ProcessRoute[]>(
    () => (options?.signal ? query.abortSignal(options.signal) : query),
    read
  )
  return { data: data ?? [], total: total ?? 0, current: p.current, size: p.size }
}

export async function fetchProcessRoutePath(routeId: string, tenantId?: string) {
  let query = supabase
    .from('mdm_process_route_step')
    .select('name')
    .eq('route_id', routeId)
    .order('sort')
    .order('code')
    .limit(1000)
  if (tenantId) query = query.eq('tenant_id', tenantId)
  const { data } = await responseHandle<Array<{ name: string }>>(() => query, read)
  return (data ?? [])
    .map((step) => step.name.trim())
    .filter(Boolean)
    .join('→')
}

export async function saveProcessRoute(input: ProcessRouteInput, id?: string) {
  await responseHandle(
    () =>
      id
        ? supabase
            .from('mdm_process_route')
            .update(keysToSnakeDeep(input))
            .eq('id', id)
            .select('id')
        : supabase.from('mdm_process_route').insert(keysToSnakeDeep(input)).select('id'),
    write
  )
}
export async function saveProcessRoutes(inputs: ProcessRouteInput[]) {
  await responseHandle(
    () =>
      supabase
        .from('mdm_process_route')
        .insert(inputs.map((input) => keysToSnakeDeep(input)))
        .select('id'),
    { ...write, message: `已创建 ${inputs.length} 条工艺路线` }
  )
}
export async function deleteProcessRoute(id: string) {
  await responseHandle(
    () => supabase.from('mdm_process_route').delete().eq('id', id).select('id'),
    write
  )
}
export async function importProcessRoutes(inputs: ProcessRouteInput[]) {
  await responseHandle(
    () =>
      supabase
        .from('mdm_process_route')
        .insert(inputs.map((input) => keysToSnakeDeep(input)))
        .select('id'),
    { ...write, message: `已导入 ${inputs.length} 条工艺路线` }
  )
}
export async function copyProcessRoute(id: string, name: string) {
  const { data } = await responseHandle<string>(
    () => supabase.rpc('mdm_copy_process_route', { p_id: id, p_name: name }),
    { ...write, message: '工艺路线及全部配置已复制' }
  )
  return data
}
export async function fetchProcessSequences(routeId: string) {
  const { data } = await responseHandle<ProcessSequence[]>(
    () =>
      supabase
        .from('mdm_process_route_sequence')
        .select('*')
        .eq('route_id', routeId)
        .order('sequence_no'),
    read
  )
  return data ?? []
}
export async function saveProcessSequence(input: ProcessSequenceInput, id?: string) {
  const { data } = await responseHandle<{ id: string }[]>(
    () =>
      id
        ? supabase
            .from('mdm_process_route_sequence')
            .update(keysToSnakeDeep(input))
            .eq('id', id)
            .select('id')
        : supabase.from('mdm_process_route_sequence').insert(keysToSnakeDeep(input)).select('id'),
    write
  )
  return data?.[0]?.id
}
export async function deleteProcessSequence(id: string) {
  await responseHandle(
    () => supabase.from('mdm_process_route_sequence').delete().eq('id', id).select('id'),
    { ...write, errorMessage: '删除失败，请先移除该序列下的工序' }
  )
}
export async function fetchProcessSteps(
  p: WorkspaceQuery & {
    routeId?: string
    sequenceId?: string
    workCenterId?: string
    bound?: boolean
  },
  options?: { signal?: AbortSignal }
) {
  let query = supabase
    .from('mdm_process_route_step')
    .select(
      `*,route:mdm_process_route!mdm_process_route_step_tenant_id_route_id_fkey(*,material:mdm_material!mdm_process_route_material_tenant_fkey(id,material_code,material_name)),template:mdm_operation_template!mdm_process_route_step_tenant_id_template_id_fkey(id,name,total_score),workCenter:mdm_work_center!mdm_process_route_step_tenant_id_work_center_id_fkey(id,code,name),sequence:mdm_process_route_sequence!mdm_process_route_step_sequence_fk(id,sequence_no,sequence_type,remark),operation:mdm_operation!mdm_process_route_step_operation_fk(id,code,name),controlCode:mdm_operation_control_code!mdm_process_route_step_control_code_fk(id,control_code,control_code_name),unit:mdm_unit_of_measure!mdm_process_route_step_unit_fk(id,unit_code,unit_name,symbol),department:mdm_production_department!mdm_process_route_step_department_fk(id,code,name)`,
      { count: 'exact' }
    )
    .order('sort')
    .order('code')
    .range((p.current - 1) * p.size, p.current * p.size - 1)
  if (p.tenantId) query = query.eq('tenant_id', p.tenantId)
  if (p.routeId) query = query.eq('route_id', p.routeId)
  if (p.sequenceId) query = query.eq('sequence_id', p.sequenceId)
  if (p.workCenterId) query = query.contains('work_center_ids', [p.workCenterId])
  if (typeof p.bound === 'boolean')
    query = p.bound ? query.not('template_id', 'is', null) : query.is('template_id', null)
  if (p.keyword) query = query.or(buildOrIlikeFilter(['code', 'name', 'description'], p.keyword))
  const { data, total } = await responseHandle<ProcessStep[]>(
    () => (options?.signal ? query.abortSignal(options.signal) : query),
    read
  )
  const rows = data ?? []
  if (!rows.length) return { data: rows, total: total ?? 0, current: p.current, size: p.size }
  const { data: assignments } = await responseHandle<Array<{ processRouteStepId: string }>>(
    () =>
      supabase
        .from('mdm_bom_item')
        .select('process_route_step_id')
        .in(
          'process_route_step_id',
          rows.map((row) => row.id)
        )
        .limit(10000),
    read
  )
  const assignmentCounts = new Map<string, number>()
  for (const assignment of assignments ?? []) {
    assignmentCounts.set(
      assignment.processRouteStepId,
      (assignmentCounts.get(assignment.processRouteStepId) ?? 0) + 1
    )
  }
  return {
    data: rows.map((row) => ({
      ...row,
      componentAssignmentCount: assignmentCounts.get(row.id) ?? 0
    })),
    total: total ?? 0,
    current: p.current,
    size: p.size
  }
}

export async function saveProcessStep(input: ProcessStepInput, id?: string) {
  await responseHandle(
    () =>
      id
        ? supabase
            .from('mdm_process_route_step')
            .update(keysToSnakeDeep(input))
            .eq('id', id)
            .select('id')
        : supabase.from('mdm_process_route_step').insert(keysToSnakeDeep(input)).select('id'),
    write
  )
}
export async function saveProcessSteps(inputs: ProcessStepInput[]) {
  await responseHandle(
    () =>
      supabase
        .from('mdm_process_route_step')
        .insert(inputs.map((input) => keysToSnakeDeep(input)))
        .select('id'),
    { ...write, message: `已新增 ${inputs.length} 道工序` }
  )
}
export async function deleteProcessStep(id: string) {
  await responseHandle(
    () => supabase.from('mdm_process_route_step').delete().eq('id', id).select('id'),
    { ...write, errorMessage: '删除失败，请先将 BOM 组件改分配到其他工序' }
  )
}
export async function deleteProcessSteps(ids: string[]) {
  await responseHandle(
    () => supabase.from('mdm_process_route_step').delete().in('id', ids).select('id'),
    { ...write, message: `已删除 ${ids.length} 道工序` }
  )
}
export async function fetchProcessRouteReferences(tenantId?: string) {
  const { data } = await responseHandle<ProcessRouteReferences>(
    () => supabase.rpc('mdm_process_route_references', { p_tenant_id: tenantId || null }),
    read
  )
  return (
    data ?? {
      groups: [],
      operations: [],
      controlCodes: [],
      units: [],
      departments: [],
      workCenters: [],
      activityFormulas: [],
      suppliers: [],
      esopDocuments: []
    }
  )
}
export async function bindOperationTemplate(ids: string[], templateId: string | null) {
  await responseHandle(
    () => supabase.rpc('mdm_bind_operation_template', { p_ids: ids, p_template_id: templateId }),
    { ...write, requireAffected: false, showMessage: false }
  )
}
export async function updateCenterProcesses(id: string) {
  const { data } = await responseHandle<number>(
    () => supabase.rpc('mdm_update_center_processes', { p_center_id: id }),
    { ...write, requireAffected: false, showMessage: false }
  )
  return data ?? 0
}
export async function fetchCenterDefaults(tenantId: string) {
  const { data } = await responseHandle<{ policy: CenterPolicy }>(
    () =>
      supabase
        .from('mdm_work_center_defaults')
        .select('policy')
        .eq('tenant_id', tenantId)
        .maybeSingle(),
    read
  )
  return data?.policy
}
export async function saveCenterDefaults(policy: CenterPolicy, tenantId: string) {
  await responseHandle(
    () =>
      supabase
        .from('mdm_work_center_defaults')
        .upsert({ tenant_id: tenantId, policy }, { onConflict: 'tenant_id' })
        .select('id'),
    write
  )
}

import type { EmployeeSelectorContractParams } from '@/api/integration/employees'
import { useSupabase } from '@/hooks'
import { normalizeNullableText } from '@/utils/form/normalize'
import type { ProductionDepartment, ShiftPattern } from './production.types'

export type ShiftScheduleDateMode = 'single' | 'ongoing' | 'range'

export interface ShiftScheduleMember {
  id: string
  tenantId: string
  departmentId: string
  employeeName: string
  employeeNo: string
  phone?: string | null
  jobTitle?: string | null
  avatarUrl?: string | null
  employmentStatus: string
  organization?: {
    id: string
    organizationCode: string
    organizationName: string
  } | null
}

export interface ShiftScheduleRecord {
  id: string
  tenantId: string
  departmentId: string
  patternId: string
  patternName: string
  patternColor: string
  shiftIndex: number
  shiftName: string
  shiftStartTime: string
  shiftEndTime: string
  dateMode: ShiftScheduleDateMode
  startDate: string
  endDate: string | null
  weekdays: number[]
  includeStatutoryHolidays: boolean
  note: string
  memberCount: number
  members: ShiftScheduleMember[]
  createTime: string
  updateTime: string
}

export interface ShiftScheduleQuery {
  departmentId: string
  startDate: string
  endDate: string
}

export interface ShiftScheduleSavePayload {
  departmentId: string
  patternId: string
  shiftIndex: number
  dateMode: ShiftScheduleDateMode
  startDate: string
  endDate: string | null
  weekdays: number[]
  includeStatutoryHolidays: boolean
  note: string
  personnelIds: string[]
}

export interface MyShiftProfile {
  personnelId: string
  employeeId: string
  employeeName: string
  employeeNo: string
  jobTitle: string | null
  avatarUrl: string | null
  departmentId: string
  departmentName: string
  departmentCode: string
  factory: string | null
}

export interface MyShiftScheduleRecord {
  id: string
  departmentId: string
  departmentName: string
  departmentCode: string
  factory: string | null
  patternName: string
  patternColor: string
  shiftName: string
  shiftStartTime: string
  shiftEndTime: string
  dateMode: ShiftScheduleDateMode
  startDate: string
  endDate: string | null
  weekdays: number[]
  includeStatutoryHolidays: boolean
  note: string
}

export interface MyShiftScheduleResponse {
  profiles: MyShiftProfile[]
  schedules: MyShiftScheduleRecord[]
  holidayDates: string[]
}

interface ShiftSchedulePersonnelPayload {
  records?: ShiftScheduleMember[]
  total?: number
}

const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()

const readOptions = {
  breakReturn: true,
  showErrorMessage: false,
  errorMessage: '排班数据加载失败，请重试'
}

const writeOptions = {
  breakReturn: true,
  showErrorMessage: true,
  showMessage: true,
  requireAffected: false,
  errorMessage: '排班操作失败，请检查日期、班次和人员后重试'
}

export async function fetchShiftSchedules(
  params: ShiftScheduleQuery
): Promise<ShiftScheduleRecord[]> {
  const { data } = await responseHandle<ShiftScheduleRecord[]>(
    () =>
      supabase.rpc('mdm_list_shift_schedules_secure', {
        p_department_id: params.departmentId,
        p_start_date: params.startDate,
        p_end_date: params.endDate
      }),
    readOptions
  )
  return data ?? []
}

export async function fetchMyShiftSchedule(
  startDate: string,
  endDate: string
): Promise<MyShiftScheduleResponse> {
  const { data } = await responseHandle<MyShiftScheduleResponse>(
    () =>
      supabase.rpc('mdm_get_my_shift_schedule_secure', {
        p_start_date: startDate,
        p_end_date: endDate
      }),
    { ...readOptions, errorMessage: '我的排班加载失败，请重试' }
  )
  return {
    profiles: data?.profiles ?? [],
    schedules: data?.schedules ?? [],
    holidayDates: data?.holidayDates ?? []
  }
}

export async function fetchShiftScheduleHolidayDates(
  departmentId: string,
  startDate: string,
  endDate: string
): Promise<string[]> {
  const { data } = await responseHandle<string[]>(
    () =>
      supabase.rpc('mdm_list_shift_schedule_holiday_dates_secure', {
        p_department_id: departmentId,
        p_start_date: startDate,
        p_end_date: endDate
      }),
    readOptions
  )
  return data ?? []
}

export async function fetchShiftScheduleDepartments(): Promise<ProductionDepartment[]> {
  const { data } = await responseHandle<ProductionDepartment[]>(
    () => supabase.rpc('mdm_list_shift_schedule_departments_secure'),
    readOptions
  )
  return data ?? []
}

export async function fetchShiftSchedulePatterns(departmentId: string): Promise<ShiftPattern[]> {
  const { data } = await responseHandle<ShiftPattern[]>(
    () =>
      supabase.rpc('mdm_list_shift_schedule_patterns_secure', {
        p_department_id: departmentId
      }),
    readOptions
  )
  return data ?? []
}

export async function fetchShiftSchedulePersonnel(
  departmentId: string,
  params: EmployeeSelectorContractParams = {}
) {
  const from = Math.max(params.from ?? 0, 0)
  const to = Math.max(params.to ?? from + 9, from)
  const { data, error } = await responseHandle<ShiftSchedulePersonnelPayload>(
    () =>
      supabase.rpc('mdm_list_shift_schedule_people_secure', {
        p_department_id: departmentId,
        p_from: from,
        p_to: to,
        p_keyword: normalizeNullableText(params.keyword)
      }),
    readOptions
  )
  return {
    data: data?.records ?? [],
    total: data?.total ?? 0,
    error
  }
}

export async function saveShiftSchedule(
  payload: ShiftScheduleSavePayload,
  id?: string
): Promise<void> {
  const { personnelIds, ...schedule } = payload
  await responseHandle(
    () =>
      supabase.rpc('mdm_save_shift_schedule_secure', {
        p_id: id ?? null,
        p_payload: keysToSnakeDeep(schedule),
        p_personnel_ids: personnelIds
      }),
    { ...writeOptions, message: id ? '排班已更新' : '排班已新增' }
  )
}

export async function deleteShiftSchedule(id: string): Promise<void> {
  await responseHandle(() => supabase.rpc('mdm_delete_shift_schedule_secure', { p_id: id }), {
    ...writeOptions,
    message: '排班已删除'
  })
}

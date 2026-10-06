import type { EmployeeIntegrationItem } from '@/api/integration/employees'
export type ProductionTag = 'primary' | 'success' | 'warning' | 'danger' | 'info'
export interface ProductionDepartmentInput {
  tenantId: string
  organizationId: string | null
  parentId: string | null
  name: string
  code: string
  factory: string
  kind: string
  sort: number
  textColor: string
  tagType: ProductionTag
  enabled: boolean
  remark: string
}
export interface ProductionDepartment extends ProductionDepartmentInput {
  id: string
  tenantId: string
}
export interface ProductionDepartmentTreeNode extends ProductionDepartment {
  children: ProductionDepartmentTreeNode[]
}
export interface ProductionPersonInput {
  tenantId: string
  departmentId: string
  employeeId: string | null
  name: string
  employeeNo: string
  barcode: string
  phone: string
  workType: string
  jobTitle: string
  trade: string
  gender: string
  hireDate: string | null
  avatarUrl: string
  permissionDepartmentIds: string[]
  sort: number
  textColor: string
  tagType: ProductionTag
  enabled: boolean
  remark: string
}
export interface ProductionPerson extends ProductionPersonInput {
  id: string
  tenantId: string
  department: { id: string; name: string; code: string } | null
}
export interface ProductionPeopleQuery {
  tenantId?: string | null
  departmentIds?: string[]
  keyword?: string
  phone?: string
  enabled?: boolean
  current: number
  size: number
}
export interface ShiftBreak {
  startTime: string
  endTime: string
}
export interface ProductionShift extends ShiftBreak {
  name: string
  breaks: ShiftBreak[]
  handoverAuto: boolean
  handoverMinutes: number
  restMinutes?: number
  workMinutes?: number
}
export interface ShiftPatternInput {
  departmentId: string
  name: string
  description: string
  sort: number
  color: string
  shifts: ProductionShift[]
}
export interface ShiftPattern extends ShiftPatternInput {
  id: string
  tenantId: string
}
export interface ProductionCalendarDay {
  id: string
  departmentId: string
  workDate: string
  patternId: string
}
export type ProductionCalendarDayType =
  'rest_day' | 'statutory_holiday' | 'work_day' | 'half_work_day'
export interface ProductionCalendarDaySetting {
  id?: string
  departmentId: string
  workDate: string
  dayType: ProductionCalendarDayType
  source: 'manual' | 'statutory_holiday'
  holidayId?: string | null
  holidayName?: string | null
}
export interface CalendarReminder {
  id?: string
  departmentId: string
  enabled: boolean
  leadDays: number
}
export interface StatutoryHolidayOrganizationSummary {
  id: string
  organizationCode: string
  organizationName: string
  organizationType?: string
}
export interface StatutoryHoliday {
  id?: string
  organizationId: string
  holidayType: string
  startDate: string
  endDate: string
  remark?: string | null
  organization: StatutoryHolidayOrganizationSummary
  createTime?: string
  updateTime?: string
}
export interface StatutoryHolidaySearchParams {
  organizationId?: string
  holidayType?: string
  year?: number | string
  from?: number
  to?: number
}
export interface StatutoryHolidaySavePayload {
  id?: string
  organizationId: string
  holidayType: string
  startDate: string
  endDate: string
  remark?: string
}
export interface ProductionEmployeeReference extends EmployeeIntegrationItem {
  id: string
  employeeName: string
  employeeNo: string
  phone: string | null
  avatarUrl: string | null
  jobTitle: string | null
  employmentType: string
  gender: string | null
  hireDate: string | null
}

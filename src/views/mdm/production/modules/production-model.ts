import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import TreeUtils from '@/utils/tree'
import type {
  ProductionDepartment,
  ProductionDepartmentInput,
  ProductionPersonInput,
  ProductionShift,
  ShiftBreak
} from '@/api/mdm'

dayjs.extend(utc)
export const productionToday = () => dayjs().utcOffset(480).format('YYYY-MM-DD')
export const productionTree = new TreeUtils({ parentKey: 'parentId' })
export const createDepartment = (): ProductionDepartmentInput => ({
  tenantId: '',
  organizationId: null,
  parentId: null,
  name: '',
  code: '',
  factory: '',
  kind: '部门',
  sort: 0,
  textColor: '',
  tagType: 'info',
  enabled: true,
  remark: ''
})
export const createPerson = (): ProductionPersonInput => ({
  tenantId: '',
  departmentId: '',
  employeeId: null,
  name: '',
  employeeNo: '',
  barcode: '',
  phone: '',
  workType: 'regular',
  jobTitle: '',
  trade: '',
  gender: '',
  hireDate: null,
  avatarUrl: '',
  permissionDepartmentIds: [],
  sort: 0,
  textColor: '',
  tagType: 'info',
  enabled: true,
  remark: ''
})
export const departmentOptions = (departments: ProductionDepartment[]) =>
  productionTree.listToTree(
    departments.map((d) => ({
      id: d.id,
      parentId: d.parentId,
      label: `${d.name} · ${d.code}`,
      value: d.id
    }))
  )
export const minuteOfDay = (time: string): number => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('请选择有效的开始和结束时间')
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}
export function shiftDuration(shift: ShiftBreak): number {
  const start = minuteOfDay(shift.startTime)
  const end = minuteOfDay(shift.endTime)
  if (start === end) throw new Error('班次开始和结束时间不能相同')
  return (end - start + 1440) % 1440
}
export function calculateBreaks(shift: ShiftBreak, breaks: ShiftBreak[]): number {
  const start = minuteOfDay(shift.startTime)
  const end = start + shiftDuration(shift)
  let previousEnd = start
  let total = 0
  for (const item of breaks) {
    const from = start + ((minuteOfDay(item.startTime) - start + 1440) % 1440)
    const to = start + ((minuteOfDay(item.endTime) - start + 1440) % 1440)
    if (to <= from || from < previousEnd || to > end)
      throw new Error('休息时段需按时间排序，不能重叠且必须在班次内')
    total += to - from
    previousEnd = to
  }
  if (total >= end - start) throw new Error('休息总时长不能占满整个班次')
  return total
}
export function calculateShifts(shifts: ProductionShift[]): ProductionShift[] {
  if (!shifts.length || shifts.length > 12) throw new Error('轮班模式需包含 1 至 12 个班次')
  return shifts.map((shift, index) => {
    if (!shift.name.trim()) throw new Error('请填写每个班次的名称')
    const duration = shiftDuration(shift)
    const restMinutes = calculateBreaks(shift, shift.breaks)
    const start = minuteOfDay(shift.startTime)
    const nextStart = minuteOfDay(shifts[(index + 1) % shifts.length].startTime)
    const distance = (nextStart - start + 1440) % 1440 || 1440
    const handoverMinutes = shift.handoverAuto
      ? Math.max(0, duration - distance)
      : shift.handoverMinutes
    if (!Number.isInteger(handoverMinutes) || handoverMinutes < 0 || handoverMinutes > duration)
      throw new Error('交班时长必须在班次时长范围内')
    return {
      ...shift,
      name: shift.name.trim(),
      restMinutes,
      workMinutes: duration - restMinutes,
      handoverMinutes
    }
  })
}
export function datesInRange(start: string, end: string, weekdays: number[]): string[] {
  if (
    typeof start !== 'string' ||
    typeof end !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(end)
  )
    throw new Error('请选择完整的开始和结束日期')
  const from = dayjs(start)
  const to = dayjs(end)
  if (
    !from.isValid() ||
    !to.isValid() ||
    from.format('YYYY-MM-DD') !== start ||
    to.format('YYYY-MM-DD') !== end ||
    to.isBefore(from) ||
    to.diff(from, 'day') > 3659
  )
    throw new Error('请选择有效日期范围，最多可设置 3660 天')
  if (start <= productionToday()) throw new Error('只能设置明天及以后的生产日历')
  const dates: string[] = []
  for (let date = from; !date.isAfter(to, 'day'); date = date.add(1, 'day')) {
    if (weekdays.includes(date.day())) dates.push(date.format('YYYY-MM-DD'))
  }
  if (!dates.length) throw new Error('当前日期范围内没有符合星期条件的日期')
  return dates
}

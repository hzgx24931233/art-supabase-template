import dayjs from 'dayjs'
import type { ShiftScheduleRecord } from '@/api/mdm'

export const SHIFT_WEEKDAY_OPTIONS = [
  { label: '周一', value: 1 },
  { label: '周二', value: 2 },
  { label: '周三', value: 3 },
  { label: '周四', value: 4 },
  { label: '周五', value: 5 },
  { label: '周六', value: 6 },
  { label: '周日', value: 0 }
] as const

export const ALL_SHIFT_WEEKDAYS = SHIFT_WEEKDAY_OPTIONS.map(({ value }) => value)

type ShiftScheduleParticipation = Pick<ShiftScheduleRecord, 'startDate' | 'endDate'> &
  Partial<Pick<ShiftScheduleRecord, 'weekdays' | 'includeStatutoryHolidays'>>

export function isShiftScheduleActiveOnDate(
  schedule: ShiftScheduleParticipation,
  date: string,
  statutoryHolidayDates?: ReadonlySet<string>
): boolean {
  if (date < schedule.startDate || (schedule.endDate && date > schedule.endDate)) return false

  const weekdays = schedule.weekdays?.length ? schedule.weekdays : ALL_SHIFT_WEEKDAYS
  if (!weekdays.includes(dayjs(date).day())) return false

  return schedule.includeStatutoryHolidays !== false || !statutoryHolidayDates?.has(date)
}

export function shiftScheduleParticipationText(
  schedule: Partial<Pick<ShiftScheduleRecord, 'weekdays' | 'includeStatutoryHolidays'>>
): string {
  const weekdays = schedule.weekdays?.length ? schedule.weekdays : ALL_SHIFT_WEEKDAYS
  const labels = SHIFT_WEEKDAY_OPTIONS.filter(({ value }) => weekdays.includes(value)).map(
    ({ label }) => label
  )
  return `${labels.join('、')} · 法定假日${schedule.includeStatutoryHolidays === false ? '不排班' : '排班'}`
}

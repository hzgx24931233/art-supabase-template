import type { ProductionShift, ShiftBreak } from './production.types'

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const time = (value: unknown): value is string =>
  typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
const minutes = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 1440
const rest = (value: unknown): value is ShiftBreak =>
  record(value) && time(value.startTime) && time(value.endTime)
const shift = (value: unknown): value is ProductionShift =>
  record(value) &&
  typeof value.name === 'string' &&
  !!value.name.trim() &&
  time(value.startTime) &&
  time(value.endTime) &&
  Array.isArray(value.breaks) &&
  value.breaks.length <= 20 &&
  value.breaks.every(rest) &&
  typeof value.handoverAuto === 'boolean' &&
  minutes(value.handoverMinutes) &&
  minutes(value.restMinutes) &&
  minutes(value.workMinutes)

/** Database JSON is validated at the API boundary before components consume it. */
export function parseProductionShifts(value: unknown): ProductionShift[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12 || !value.every(shift)) {
    throw new Error('轮班模式数据不完整，请检查班次配置后重试')
  }
  return value
}

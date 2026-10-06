import type { ProductionCalendarDayType } from '@/api/mdm'

export const calendarDayTypes: Array<{
  value: ProductionCalendarDayType
  label: string
  description: string
  color: string
  icon: string
}> = [
  {
    value: 'rest_day',
    label: '休息日',
    description: '全日休息',
    color: 'var(--el-color-warning)',
    icon: 'ri:cup-line'
  },
  {
    value: 'statutory_holiday',
    label: '节假日',
    description: '法定或企业假日',
    color: 'var(--el-color-success)',
    icon: 'ri:plane-line'
  },
  {
    value: 'work_day',
    label: '工作日',
    description: '正常生产',
    color: 'var(--theme-color)',
    icon: 'ri:briefcase-4-line'
  },
  {
    value: 'half_work_day',
    label: '半工作日',
    description: '半天生产',
    color: 'var(--el-color-primary)',
    icon: 'ri:time-line'
  }
]

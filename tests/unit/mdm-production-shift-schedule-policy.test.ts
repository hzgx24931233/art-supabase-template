import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ALL_SHIFT_WEEKDAYS,
  isShiftScheduleActiveOnDate,
  shiftScheduleParticipationText
} from '@/views/mdm/production/modules/shift-schedule-policy'

const baseSchedule = {
  startDate: '2026-10-01',
  endDate: '2026-10-31',
  weekdays: [1, 2, 3, 4, 5],
  includeStatutoryHolidays: false
}

test('未勾选的周末不参与排班', () => {
  assert.equal(isShiftScheduleActiveOnDate(baseSchedule, '2026-10-09'), true)
  assert.equal(isShiftScheduleActiveOnDate(baseSchedule, '2026-10-10'), false)
  assert.equal(isShiftScheduleActiveOnDate(baseSchedule, '2026-10-11'), false)
})

test('法定假日开关在星期规则之后生效', () => {
  const holidayDates = new Set(['2026-10-09'])
  assert.equal(isShiftScheduleActiveOnDate(baseSchedule, '2026-10-09', holidayDates), false)
  assert.equal(
    isShiftScheduleActiveOnDate(
      { ...baseSchedule, includeStatutoryHolidays: true },
      '2026-10-09',
      holidayDates
    ),
    true
  )
})

test('旧记录缺少参与字段时保持原有全周且节假日排班行为', () => {
  const legacySchedule = {
    startDate: '2026-10-01',
    endDate: null,
    weekdays: undefined,
    includeStatutoryHolidays: undefined
  }
  assert.deepEqual(ALL_SHIFT_WEEKDAYS, [1, 2, 3, 4, 5, 6, 0])
  assert.equal(
    isShiftScheduleActiveOnDate(legacySchedule, '2026-10-11', new Set(['2026-10-11'])),
    true
  )
  assert.equal(
    shiftScheduleParticipationText({ weekdays: undefined, includeStatutoryHolidays: undefined }),
    '周一、周二、周三、周四、周五、周六、周日 · 法定假日排班'
  )
})

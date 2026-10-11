import assert from 'node:assert/strict'
import test from 'node:test'
import { createCenterPolicy } from '@/views/mdm/production/work-center/modules/center-policy'
import { parseCenterImport } from '@/views/mdm/production/work-center/modules/center-transfer'

test('work center import resolves the department code and requires an existing department', () => {
  const rows = parseCenterImport([{ 工作中心: 'WC-1', 名称: '工作中心一', 所属产线编码: 'LINE' }], {
    departments: [{ id: 'department-1', code: 'LINE' }],
    centers: [],
    people: [],
    defaults: createCenterPolicy()
  })
  assert.equal(rows[0].code, 'WC-1')
  assert.equal(rows[0].name, '工作中心一')
  assert.equal(rows[0].departmentId, 'department-1')
  assert.throws(
    () =>
      parseCenterImport([{ 工作中心: 'WC-1', 名称: '工作中心一', 所属产线编码: 'LINE' }], {
        departments: [],
        centers: [],
        people: [],
        defaults: createCenterPolicy()
      }),
    /正确的所属产线编码/
  )
})

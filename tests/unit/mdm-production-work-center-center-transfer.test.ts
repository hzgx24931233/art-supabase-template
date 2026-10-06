import assert from 'node:assert/strict'
import test from 'node:test'
import { createCenterPolicy } from '@/views/mdm/production/work-center/modules/center-policy'
import { parseCenterImport } from '@/views/mdm/production/work-center/modules/center-transfer'

test('work center import binds the selected tenant despite duplicate department codes', () => {
  const rows = parseCenterImport(
    [{ 工作中心: 'WC-1', 名称: '工作中心一', 所属产线编码: 'LINE' }],
    {
      departments: [
        { id: 'other-department', code: 'LINE', tenantId: 'other-tenant' },
        { id: 'target-department', code: 'LINE', tenantId: 'target-tenant' }
      ],
      centers: [],
      people: [],
      defaults: createCenterPolicy()
    },
    'target-tenant'
  )
  assert.equal(rows[0].tenantId, 'target-tenant')
  assert.equal(rows[0].departmentId, 'target-department')
  assert.throws(
    () =>
      parseCenterImport(
        [{ 工作中心: 'WC-1', 名称: '工作中心一', 所属产线编码: 'LINE' }],
        { departments: [], centers: [], people: [], defaults: createCenterPolicy() },
        ''
      ),
    /目标租户/
  )
})

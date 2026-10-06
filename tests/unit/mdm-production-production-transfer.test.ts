import assert from 'node:assert/strict'
import test from 'node:test'
import type { ProductionDepartment } from '@/api/mdm'
import { createDepartment } from '@/views/mdm/production/modules/production-model'
import {
  parseDepartmentImport,
  parsePeopleImport
} from '@/views/mdm/production/modules/production-transfer'

const department = (id: string, tenantId: string, code: string): ProductionDepartment => ({
  ...createDepartment(),
  id,
  tenantId,
  code
})

test('department import binds rows and duplicate parent codes to the selected tenant', () => {
  const rows = parseDepartmentImport(
    [{ 部门名称: '二线', 部门编码: 'LINE-2', 上级部门编码: 'FACTORY' }],
    [
      department('other-parent', 'other-tenant', 'FACTORY'),
      department('target-parent', 'target-tenant', 'FACTORY')
    ],
    'target-tenant'
  )
  assert.equal(rows[0].tenantId, 'target-tenant')
  assert.equal(rows[0].parentId, 'target-parent')
})

test('person import resolves department and permission codes only within the target tenant', () => {
  const departments = [
    department('other-department', 'other-tenant', 'LINE'),
    department('target-department', 'target-tenant', 'LINE')
  ]
  const rows = parsePeopleImport(
    [{ 部门编码: 'LINE', 姓名: '测试员工', 工号: 'EMP-1', 权限部门编码: 'LINE' }],
    departments,
    '',
    'target-tenant'
  )
  assert.equal(rows[0].tenantId, 'target-tenant')
  assert.equal(rows[0].departmentId, 'target-department')
  assert.deepEqual(rows[0].permissionDepartmentIds, ['target-department'])
  assert.throws(
    () =>
      parsePeopleImport(
        [{ 姓名: '测试员工', 工号: 'EMP-1' }],
        departments,
        'other-department',
        'target-tenant'
      ),
    /目标租户内/
  )
})

test('production imports reject an ambiguous target tenant', () => {
  assert.throws(
    () => parseDepartmentImport([{ 部门名称: '二线', 部门编码: 'LINE-2' }], [], ''),
    /目标租户/
  )
  assert.throws(
    () => parsePeopleImport([{ 姓名: '测试员工', 工号: 'EMP-1' }], [], '', ''),
    /目标租户/
  )
})

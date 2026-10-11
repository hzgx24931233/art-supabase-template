import assert from 'node:assert/strict'
import test from 'node:test'
import type { ProductionDepartment } from '@/api/mdm'
import { createDepartment } from '@/views/mdm/production/modules/production-model'
import {
  parseDepartmentImport,
  parsePeopleImport
} from '@/views/mdm/production/modules/production-transfer'

const department = (id: string, code: string): ProductionDepartment => ({
  ...createDepartment(),
  id,
  code
})

test('department import binds rows to the resolved parent department code', () => {
  const rows = parseDepartmentImport(
    [{ 部门名称: '二线', 部门编码: 'LINE-2', 上级部门编码: 'FACTORY', 状态: '启用' }],
    [department('parent-1', 'FACTORY')]
  )
  assert.equal(rows[0].name, '二线')
  assert.equal(rows[0].code, 'LINE-2')
  assert.equal(rows[0].enabled, true)
  assert.equal(rows[0].parentId, 'parent-1')
  assert.throws(
    () =>
      parseDepartmentImport(
        [{ 部门名称: '二线', 部门编码: 'LINE-2', 上级部门编码: 'MISSING' }],
        [department('parent-1', 'FACTORY')]
      ),
    /上级部门编码不存在/
  )
})

test('person import resolves department and permission codes by department code', () => {
  const departments = [department('department-1', 'LINE'), department('department-2', 'PACK')]
  const rows = parsePeopleImport(
    [
      {
        部门编码: 'LINE',
        姓名: '测试员工',
        工号: 'EMP-1',
        权限部门编码: 'LINE,PACK'
      }
    ],
    departments,
    ''
  )
  assert.equal(rows[0].departmentId, 'department-1')
  assert.equal(rows[0].name, '测试员工')
  assert.equal(rows[0].employeeNo, 'EMP-1')
  assert.deepEqual(rows[0].permissionDepartmentIds, ['department-1', 'department-2'])

  const fallbackRows = parsePeopleImport(
    [{ 姓名: '测试员工', 工号: 'EMP-1' }],
    departments,
    'department-2'
  )
  assert.equal(fallbackRows[0].departmentId, 'department-2')

  assert.throws(
    () =>
      parsePeopleImport([{ 姓名: '测试员工', 工号: 'EMP-1' }], departments, 'missing-department'),
    /请选择所属部门或填写已有部门编码/
  )
  assert.throws(
    () =>
      parsePeopleImport(
        [{ 部门编码: 'LINE', 姓名: '测试员工', 工号: 'EMP-1', 权限部门编码: 'MISSING' }],
        departments,
        ''
      ),
    /权限部门编码不存在/
  )
})

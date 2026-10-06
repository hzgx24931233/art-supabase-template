import assert from 'node:assert/strict'
import test from 'node:test'
import type { EmployeeIntegrationItem } from '@/api/integration/employees'
import type { ProductionDepartment } from '@/api/mdm'
import {
  employeeDepartmentId,
  personnelDepartmentScopeIds
} from '@/views/mdm/production/personnel-work-center/modules/configuration-policy'

const departments = [
  { id: 'root', parentId: null, name: '生产部' },
  { id: 'line-a', parentId: 'root', name: '装配线' },
  { id: 'line-b', parentId: 'root', name: '包装线' },
  { id: 'station', parentId: 'line-a', name: '装配一组' }
] as ProductionDepartment[]

test('uses the selected department and descendants for the employee selector', () => {
  assert.deepEqual(personnelDepartmentScopeIds(departments, 'line-a'), ['line-a', 'station'])
  assert.equal(personnelDepartmentScopeIds(departments, undefined), undefined)
})

test('uses the selected employee department while preserving the left-tree fallback', () => {
  const employee = {
    id: 'person-1',
    tenantId: 'tenant-1',
    organizationId: 'line-b',
    employeeName: '王师傅',
    employeeNo: 'EMP001',
    employmentStatus: 'active'
  } as EmployeeIntegrationItem

  assert.equal(employeeDepartmentId(employee, 'root'), 'line-b')
  assert.equal(employeeDepartmentId(undefined, 'root'), 'root')
})

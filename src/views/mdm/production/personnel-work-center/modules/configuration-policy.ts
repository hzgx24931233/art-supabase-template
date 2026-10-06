import TreeUtils from '@/utils/tree'
import type { EmployeeIntegrationItem } from '@/api/integration/employees'
import type { ProductionDepartment } from '@/api/mdm'

const tree = new TreeUtils({ parentKey: 'parentId' })

export function personnelDepartmentScopeIds(
  departments: ProductionDepartment[],
  departmentId?: string
): string[] | undefined {
  if (!departmentId) return undefined
  const departmentTree = tree.listToTree(departments)
  return tree
    .getDescendants(departmentTree, departmentId, true)
    .map((department) => String(department.id))
}

export function employeeDepartmentId(
  employee: EmployeeIntegrationItem | undefined,
  fallbackDepartmentId: string
): string {
  return employee?.organizationId || employee?.organization?.id || fallbackDepartmentId
}

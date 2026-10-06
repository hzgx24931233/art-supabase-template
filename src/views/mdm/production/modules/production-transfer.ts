import { exportExcel } from '@/utils/file'
import type {
  ProductionDepartment,
  ProductionPerson,
  ProductionDepartmentInput,
  ProductionPersonInput
} from '@/api/mdm'
import { createDepartment, createPerson } from './production-model'

export const departmentLabels = {
  name: '部门名称',
  code: '部门编码',
  parentCode: '上级部门编码',
  factory: '所属工厂',
  kind: '类型',
  sort: '排序',
  textColor: '文字颜色',
  tagType: '标签样式',
  enabledText: '状态',
  remark: '备注'
}
export const personLabels = {
  departmentCode: '部门编码',
  name: '姓名',
  employeeNo: '工号',
  barcode: '条码',
  phone: '手机号',
  workType: '工作类型',
  trade: '工种',
  jobTitle: '职位',
  gender: '性别',
  hireDate: '入职日期',
  avatarUrl: '头像地址',
  permissionDepartmentCodes: '权限部门编码',
  sort: '排序',
  textColor: '文字颜色',
  tagType: '标签样式',
  enabledText: '状态',
  remark: '备注'
}
const cell = (row: Record<string, unknown>, label: string) => String(row[label] ?? '').trim()
function required(row: Record<string, unknown>, label: string, index: number) {
  const value = cell(row, label)
  if (!value) throw new Error(`第 ${index + 2} 行：请填写${label}`)
  return value
}
function presentation(row: Record<string, unknown>, index: number) {
  const sort = Number(cell(row, '排序') || 0)
  const textColor = cell(row, '文字颜色')
  const tagType = cell(row, '标签样式') || 'info'
  const status = cell(row, '状态') || '启用'
  if (!Number.isInteger(sort) || sort < 0) throw new Error(`第 ${index + 2} 行：排序必须是非负整数`)
  if (textColor && !/^#[0-9a-f]{6}$/i.test(textColor))
    throw new Error(`第 ${index + 2} 行：文字颜色应为 #RRGGBB 格式`)
  if (!['启用', '禁用'].includes(status)) throw new Error(`第 ${index + 2} 行：状态应为启用或禁用`)
  if (
    tagType !== 'info' &&
    tagType !== 'primary' &&
    tagType !== 'success' &&
    tagType !== 'warning' &&
    tagType !== 'danger'
  )
    throw new Error(`第 ${index + 2} 行：标签样式无效`)
  return {
    sort,
    textColor,
    tagType,
    enabled: status === '启用',
    remark: cell(row, '备注')
  } as const
}
function checkRows(rows: Record<string, unknown>[]) {
  if (!rows.length || rows.length > 1000) throw new Error('每次导入需包含 1 至 1000 行数据')
}
export function parseDepartmentImport(
  rows: Record<string, unknown>[],
  departments: ProductionDepartment[],
  tenantId: string
): ProductionDepartmentInput[] {
  checkRows(rows)
  if (!tenantId) throw new Error('请先选择目标租户再导入')
  return rows.map((row, index) => {
    const parentCode = cell(row, '上级部门编码')
    const parent = departments.find((d) => d.tenantId === tenantId && d.code === parentCode)
    if (parentCode && !parent)
      throw new Error(`第 ${index + 2} 行：上级部门编码不存在，请先导入上级部门`)
    return {
      ...createDepartment(),
      ...presentation(row, index),
      tenantId,
      name: required(row, '部门名称', index),
      code: required(row, '部门编码', index),
      factory: cell(row, '所属工厂'),
      kind: cell(row, '类型') || '部门',
      parentId: parent?.id ?? null
    }
  })
}
export function parsePeopleImport(
  rows: Record<string, unknown>[],
  departments: ProductionDepartment[],
  defaultDepartmentId: string,
  tenantId: string
): ProductionPersonInput[] {
  checkRows(rows)
  if (!tenantId) throw new Error('请先选择目标租户再导入')
  return rows.map((row, index) => {
    const departmentCode = cell(row, '部门编码')
    const departmentId = departmentCode
      ? departments.find((d) => d.tenantId === tenantId && d.code === departmentCode)?.id
      : defaultDepartmentId
    if (!departmentId || !departments.some((d) => d.tenantId === tenantId && d.id === departmentId))
      throw new Error(`第 ${index + 2} 行：请选择目标租户内的所属部门或填写已有部门编码`)
    const employeeNo = required(row, '工号', index)
    const workLabel = cell(row, '工作类型') || '正式工'
    const workType = (
      {
        正式工: 'regular',
        临时工: 'temporary',
        实习生: 'intern',
        regular: 'regular',
        temporary: 'temporary',
        intern: 'intern'
      } as Record<string, string>
    )[workLabel]
    if (!workType) throw new Error(`第 ${index + 2} 行：工作类型应为正式工、临时工或实习生`)
    const hireDate = cell(row, '入职日期')
    if (hireDate && !/^\d{4}-\d{2}-\d{2}$/.test(hireDate))
      throw new Error(`第 ${index + 2} 行：入职日期应为 YYYY-MM-DD 格式`)
    const codes = cell(row, '权限部门编码').split(/[，,]/).filter(Boolean)
    const permissionDepartmentIds = codes.map((code) => {
      const department = departments.find((d) => d.tenantId === tenantId && d.code === code.trim())
      if (!department) throw new Error(`第 ${index + 2} 行：权限部门编码不存在`)
      return department.id
    })
    return {
      ...createPerson(),
      ...presentation(row, index),
      tenantId,
      departmentId,
      employeeNo,
      name: required(row, '姓名', index),
      barcode: cell(row, '条码') || employeeNo,
      phone: cell(row, '手机号'),
      workType,
      trade: cell(row, '工种'),
      jobTitle: cell(row, '职位'),
      gender: cell(row, '性别'),
      hireDate: hireDate || null,
      avatarUrl: cell(row, '头像地址'),
      permissionDepartmentIds
    }
  })
}
export async function exportDepartments(
  departments: ProductionDepartment[],
  tenantNames?: Record<string, string>
) {
  const data = departments.map((row) => ({
    ...row,
    tenantName: tenantNames?.[row.tenantId] || row.tenantId,
    parentCode: departments.find((d) => d.id === row.parentId)?.code || '',
    enabledText: row.enabled ? '启用' : '禁用'
  }))
  await exportExcel({
    data,
    columns: [
      ...(tenantNames ? [{ key: 'tenantName', title: '所属租户' }] : []),
      ...Object.entries(departmentLabels).map(([key, title]) => ({ key, title }))
    ],
    filename: '生产部门'
  })
}
export async function exportPeople(
  people: ProductionPerson[],
  departments: ProductionDepartment[],
  tenantNames?: Record<string, string>
) {
  const data = people.map((row) => ({
    ...row,
    tenantName: tenantNames?.[row.tenantId] || row.tenantId,
    departmentCode: row.department?.code || '',
    permissionDepartmentCodes: row.permissionDepartmentIds
      .map((id) => departments.find((d) => d.id === id)?.code || '')
      .filter(Boolean)
      .join(','),
    enabledText: row.enabled ? '启用' : '禁用'
  }))
  await exportExcel({
    data,
    columns: [
      ...(tenantNames ? [{ key: 'tenantName', title: '所属租户' }] : []),
      ...Object.entries(personLabels).map(([key, title]) => ({ key, title }))
    ],
    filename: '生产人员配置'
  })
}

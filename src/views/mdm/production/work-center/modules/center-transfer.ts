import type { CenterPolicy, WorkCenterInput } from '@/api/mdm'
import { centerPolicyFields, createWorkCenter } from './center-policy'

export const centerPolicyColumns = [
  ...centerPolicyFields.map(({ key, label }) => ({ key, title: label })),
  { key: 'operationLimit', title: '操作时限' },
  { key: 'operationUnit', title: '时限单位' },
  { key: 'customLimit', title: '自定义限额（%）' },
  { key: 'groupTag', title: '组标签' },
  { key: 'reportTime', title: '自定义报工时间' }
]
export const splitStaffNumbers = (value: unknown): string[] =>
  String(value ?? '')
    .split(/[；;,，\n]/)
    .map((s) => s.trim())
    .filter(Boolean)

interface ImportReferences {
  departments: { id: string; code: string; tenantId: string }[]
  centers: { id: string; code: string }[]
  people: { id: string; employeeNo: string }[]
  defaults: CenterPolicy
}
export function parseCenterImport(
  rows: Record<string, unknown>[],
  refs: ImportReferences,
  tenantId: string
): Array<WorkCenterInput & { tenantId: string }> {
  if (!tenantId) throw new Error('请先选择目标租户再导入')
  return rows.map((row, index) => {
    const fail = (message: string): never => {
      throw new Error(`第 ${index + 2} 行：${message}`)
    }
    const text = (key: string) => String(row[key] ?? '').trim()
    const code = text('工作中心'),
      name = text('名称')
    const department = refs.departments.find(
      (d) => d.tenantId === tenantId && d.code === text('所属产线编码')
    )
    if (!code || !name || !department) return fail('请填写工作中心、名称和正确的所属产线编码')
    const personnelMode = text('人员安排') || '指定人数'
    if (personnelMode !== '指定人数' && personnelMode !== '指定人员')
      return fail('人员安排应为指定人数或指定人员')
    const headcount = Number(text('人数') || 1),
      sort = Number(text('排序') || 0)
    if (
      !Number.isInteger(headcount) ||
      headcount < 1 ||
      headcount > 10000 ||
      !Number.isInteger(sort) ||
      sort < 0
    )
      return fail('人数或排序不符合要求')
    const mainCode = text('主工序位')
    const mainCenterId =
      !mainCode || mainCode === code ? null : refs.centers.find((c) => c.code === mainCode)?.id
    if (mainCenterId === undefined) return fail('主工序位必须为已存在的工作中心编号')
    const personIds =
      personnelMode === '指定人员'
        ? [...new Set(splitStaffNumbers(row['人员工号']))].map(
            (no) =>
              refs.people.find((p) => p.employeeNo === no)?.id ??
              fail(`人员工号 ${no} 不存在或已禁用`)
          )
        : []
    if (personnelMode === '指定人员' && !personIds.length)
      return fail('指定人员时必须填写人员工号，多人用分号分隔')
    const policy = structuredClone(refs.defaults)
    for (const field of centerPolicyFields) {
      const value = text(field.label)
      if (!value) continue
      const values = field.multiple ? splitStaffNumbers(value) : [value]
      if (
        values.some((v) => !field.values.includes(v)) ||
        (field.multiple && values.length > 1 && values.includes(field.values[0]))
      )
        return fail(`${field.label}选项无效`)
      policy[field.key] = field.multiple ? values : value
    }
    for (const field of centerPolicyColumns.filter(
      (c) => !centerPolicyFields.some((f) => f.key === c.key)
    )) {
      const value = text(field.title)
      if (!value) continue
      if (typeof policy[field.key] === 'number') {
        const number = Number(value)
        const minimum = field.key === 'customLimit' ? 1 : 0
        const maximum = field.key === 'operationLimit' ? 86400 : 10000
        if (!Number.isInteger(number) || number < minimum || number > maximum)
          return fail(`${field.title}数值无效`)
        policy[field.key] = number
      } else policy[field.key] = value
    }
    if (!['秒', '分钟'].includes(String(policy.operationUnit))) return fail('时限单位应为秒或分钟')
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(policy.reportTime)))
      return fail('自定义报工时间应为 HH:mm')
    return {
      ...createWorkCenter(),
      tenantId: department.tenantId,
      code,
      name,
      departmentId: department.id,
      mainCenterId,
      personnelMode,
      headcount,
      personIds,
      policy,
      sort,
      remark: text('备注')
    }
  })
}

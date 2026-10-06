import type { ActivityFormulaParameter, ActivityFormulaToken } from '@/api/mdm'

export interface ActivityFormulaParameterTreeNode extends ActivityFormulaParameter {
  children?: ActivityFormulaParameterTreeNode[]
  label?: string
}

export function buildActivityFormulaParameterTree(
  rows: ActivityFormulaParameter[]
): ActivityFormulaParameterTreeNode[] {
  const nodes = new Map(
    rows.map((row) => [
      row.id,
      { ...row, label: row.name, children: [] } as ActivityFormulaParameterTreeNode
    ])
  )
  const roots: ActivityFormulaParameterTreeNode[] = []
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined
    if (parent) parent.children?.push(node)
    else roots.push(node)
  }
  return roots
}

export const operatorOptions = [
  { label: '加', symbol: '+', value: '+' },
  { label: '减', symbol: '−', value: '-' },
  { label: '乘', symbol: '×', value: '*' },
  { label: '除', symbol: '÷', value: '/' },
  { label: '左括号', symbol: '(', value: '(' },
  { label: '右括号', symbol: ')', value: ')' }
] as const

export const functionOptions = [
  { label: '四舍五入', value: 'ROUND' },
  { label: '向上取整', value: 'CEIL' },
  { label: '向下取整', value: 'FLOOR' }
] as const

const purposeLabels: Record<string, string> = {
  report_preparation: '汇报 · 准备活动',
  report_processing: '汇报 · 加工活动',
  report_other_1: '汇报 · 其他活动一',
  report_other_2: '汇报 · 其他活动二',
  plan_preparation: '计划 · 准备活动',
  plan_processing: '计划 · 加工活动',
  plan_other_1: '计划 · 其他活动一',
  plan_other_2: '计划 · 其他活动二',
  preparation: '准备活动',
  processing: '加工活动',
  other: '其他活动'
}

export function activityFormulaPurposeLabel(value: string, fallback = ''): string {
  return purposeLabels[value] || fallback || `历史用途（${value}）`
}

export function expressionOf(tokens: ActivityFormulaToken[]): string {
  return tokens
    .map((token) => (token.type === 'function' ? `${token.value} (` : token.value))
    .join(' ')
}

export function translationOf(tokens: ActivityFormulaToken[]): string {
  return tokens
    .map((token) => {
      if (token.type === 'operator')
        return operatorOptions.find((item) => item.value === token.value)?.symbol ?? token.label
      if (token.type === 'function') return `${token.label}（`
      return token.label
    })
    .join(' ')
}

export function validateFormula(tokens: ActivityFormulaToken[]): string | null {
  if (!tokens.length) return '请至少添加一个参数或常量'
  let balance = 0
  let expectsOperand = true
  for (const token of tokens) {
    if (token.type === 'function') {
      if (!expectsOperand) return '函数前缺少运算符'
      balance += 1
      expectsOperand = true
      continue
    }
    if (token.type !== 'operator') {
      if (!expectsOperand) return '两个参数之间缺少运算符'
      expectsOperand = false
      continue
    }
    if (token.value === '(') {
      if (!expectsOperand) return '左括号前缺少运算符'
      balance += 1
      continue
    }
    if (token.value === ')') {
      if (expectsOperand) return '右括号前缺少参数'
      balance -= 1
      if (balance < 0) return '右括号缺少对应的左括号'
      expectsOperand = false
      continue
    }
    if (expectsOperand) return '运算符前缺少参数'
    expectsOperand = true
  }
  if (balance !== 0) return '请补全公式括号'
  if (expectsOperand) return '公式末尾缺少参数'
  return null
}

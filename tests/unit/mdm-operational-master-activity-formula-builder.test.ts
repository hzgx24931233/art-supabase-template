import assert from 'node:assert/strict'
import test from 'node:test'
import type { ActivityFormulaToken } from '@/api/mdm'
import {
  expressionOf,
  translationOf,
  validateFormula
} from '@/views/mdm/operational-master/modules/activity-formula-builder'

const tokens: ActivityFormulaToken[] = [
  { type: 'parameter', value: 'base_qty', label: '基本批量', parameterId: 'p1' },
  { type: 'operator', value: '*', label: '乘' },
  { type: 'parameter', value: 'process_qty', label: '工序数量', parameterId: 'p2' }
]

test('renders machine expression and readable translation', () => {
  assert.equal(expressionOf(tokens), 'base_qty * process_qty')
  assert.equal(translationOf(tokens), '基本批量 × 工序数量')
})

test('rejects unbalanced parentheses', () => {
  assert.equal(
    validateFormula([...tokens, { type: 'operator', value: ')', label: '右括号' }]),
    '右括号缺少对应的左括号'
  )
})

test('renders function calls and rejects consecutive operands', () => {
  const functionTokens: ActivityFormulaToken[] = [
    { type: 'function', value: 'ROUND', label: '四舍五入' },
    ...tokens,
    { type: 'operator', value: ')', label: '右括号' }
  ]
  assert.equal(expressionOf(functionTokens), 'ROUND ( base_qty * process_qty )')
  assert.equal(validateFormula(functionTokens), null)
  assert.equal(validateFormula([tokens[0], tokens[2]]), '两个参数之间缺少运算符')
})

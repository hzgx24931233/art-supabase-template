import assert from 'node:assert/strict'
import test from 'node:test'
import type { OperationalMasterRecord } from '@/api/mdm'
import { buildActivityFormulaWriteInput } from '@/views/mdm/operational-master/modules/activity-formula-payload'

const model = (): OperationalMasterRecord => ({
  id: '22222222-2222-4222-8222-222222222222',
  tenantId: '11111111-1111-4111-8111-111111111111',
  code: ' LPS ',
  name: ' 良品数标准工时 ',
  purpose: 'report_preparation',
  activityType: 'machine',
  activityTypes: ['machine'],
  isDefault: false,
  formulaExpression: '3 + 4',
  formulaTranslation: '3 + 4',
  formulaTokens: [
    { type: 'number', value: '3', label: '3' },
    { type: 'operator', value: '+', label: '加' },
    { type: 'number', value: '4', label: '4' }
  ],
  planExpression: '3 + 4',
  reportExpression: '3 + 4',
  description: null,
  enabled: true,
  remark: null
})

test('activity formula payload never writes null to non-nullable text columns', () => {
  const payload = buildActivityFormulaWriteInput(model(), '3 + 4', '3 + 4')

  assert.equal(payload.code, 'LPS')
  assert.equal(payload.name, '良品数标准工时')
  assert.equal(payload.description, '')
  assert.equal(payload.remark, '')
})

test('activity formula payload trims non-empty description and remark', () => {
  const payload = buildActivityFormulaWriteInput(
    { ...model(), description: ' 计算良品数 ', remark: ' 启用中 ' },
    '3 + 4',
    '3 + 4'
  )

  assert.equal(payload.description, '计算良品数')
  assert.equal(payload.remark, '启用中')
})

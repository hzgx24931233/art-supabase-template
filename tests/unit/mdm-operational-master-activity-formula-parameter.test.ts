import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildActivityFormulaParameterWriteInput,
  type ActivityFormulaParameterFormModel
} from '@/views/mdm/operational-master/modules/activity-formula-parameter'

const baseModel = (): ActivityFormulaParameterFormModel => ({
  tenantId: '11111111-1111-4111-8111-111111111111',
  purpose: 'plan_preparation',
  parentId: null,
  nodeType: 'group',
  code: ' GROUP_01 ',
  name: ' 基本准活 ',
  activityUnit: 'minute',
  relatedField: 'should_be_cleared',
  sort: 0,
  enabled: true,
  remark: ' 说明 '
})

test('group parameter payload clears fields forbidden by the database constraint', () => {
  const payload = buildActivityFormulaParameterWriteInput(baseModel())

  assert.equal(payload.code, 'GROUP_01')
  assert.equal(payload.name, '基本准活')
  assert.equal(payload.activityUnit, null)
  assert.equal(payload.relatedField, '')
  assert.equal(payload.remark, '说明')
})

test('parameter payload preserves valid unit and normalized related field', () => {
  const payload = buildActivityFormulaParameterWriteInput({
    ...baseModel(),
    nodeType: 'parameter',
    activityUnit: 'minute',
    relatedField: ' process.qty '
  })

  assert.equal(payload.activityUnit, 'minute')
  assert.equal(payload.relatedField, 'process.qty')
})

test('parameter payload rejects a missing formula purpose before database submission', () => {
  assert.throws(
    () => buildActivityFormulaParameterWriteInput({ ...baseModel(), purpose: null }),
    /请先选择公式用途/
  )
})

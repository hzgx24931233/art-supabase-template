import assert from 'node:assert/strict'
import test from 'node:test'
import { computed, reactive, ref } from 'vue'
import {
  cloneModelValue,
  isModelDirty,
  shouldSkipPristineSubmit,
  updateFormFieldValue,
  type FormRecord
} from '../../src/components/core/forms/art-form/model-utils'

test('更新普通字段时保留无关附件数组的引用', () => {
  const attachments = ['https://example.com/first.png', 'https://example.com/second.png']
  const form: FormRecord = {
    payeeName: '原收款人',
    basisUrls: attachments
  }

  const result = updateFormFieldValue(form, 'payeeName', '新收款人')

  assert.equal(result, form)
  assert.equal(result.payeeName, '新收款人')
  assert.equal(result.basisUrls, attachments)
})

test('支持嵌套字段更新和清除', () => {
  const form: FormRecord = {
    contact: { name: '张三', phone: '13800000000' }
  }

  updateFormFieldValue(form, 'contact.name', '李四')
  assert.deepEqual(form.contact, { name: '李四', phone: '13800000000' })

  updateFormFieldValue(form, 'contact.phone', undefined)
  assert.deepEqual(form.contact, { name: '李四' })
})

test('与基线一致时不判定为修改', () => {
  const model = { name: '张三', amount: 120, lines: [{ code: 'A', quantity: 2 }] }
  const baseline = cloneModelValue(model)

  assert.equal(isModelDirty(model, baseline), false)
  assert.deepEqual(baseline.lines, [{ code: 'A', quantity: 2 }])
})

test('仅显式开启且表单 pristine 时跳过提交', () => {
  assert.equal(shouldSkipPristineSubmit(true, false), true)
  assert.equal(shouldSkipPristineSubmit(true, true), false)
  assert.equal(shouldSkipPristineSubmit(false, false), false)
})

test('重新采集基线后恢复 pristine 跳过状态', () => {
  const model: FormRecord = { name: '张三', lines: [{ code: 'A', quantity: 1 }] }
  let baseline = cloneModelValue(model)

  model.lines[0].quantity = 2
  assert.equal(shouldSkipPristineSubmit(true, isModelDirty(model, baseline)), false)

  baseline = cloneModelValue(model)
  assert.equal(shouldSkipPristineSubmit(true, isModelDirty(model, baseline)), true)
})

test('识别字段、嵌套结构与数组变化', () => {
  const model: FormRecord = {
    name: '张三',
    contact: { phone: '13800000000' },
    lines: [{ code: 'A', quantity: 2 }]
  }
  const baseline = cloneModelValue(model)

  model.name = '李四'
  assert.equal(isModelDirty(model, baseline), true)

  model.name = '张三'
  assert.equal(isModelDirty(model, baseline), false)

  model.contact.phone = '13900000000'
  assert.equal(isModelDirty(model, baseline), true)

  model.contact.phone = '13800000000'
  model.lines.push({ code: 'B', quantity: 1 })
  assert.equal(isModelDirty(model, baseline), true)
})

test('新增字段与置空字符串都视为修改', () => {
  const model: FormRecord = { remark: '说明' }
  const baseline = cloneModelValue(model)

  model.extra = '新增'
  assert.equal(isModelDirty(model, baseline), true)

  delete model.extra
  assert.equal(isModelDirty(model, baseline), false)

  model.remark = ''
  assert.equal(isModelDirty(model, baseline), true)
})

test('响应式模型的字段变化会驱动 isDirty computed 重新计算', async () => {
  const model = reactive<FormRecord>({ name: '张三', contact: { phone: '13800000000' } })
  const baseline = ref(cloneModelValue(model))
  const dirty = computed(() => isModelDirty(model, baseline.value))

  assert.equal(dirty.value, false)

  model.name = '李四'
  assert.equal(dirty.value, true)

  model.name = '张三'
  assert.equal(dirty.value, false)

  model.contact.phone = '13900000000'
  assert.equal(dirty.value, true)

  baseline.value = cloneModelValue(model)
  assert.equal(dirty.value, false)

  model.newField = 'x'
  assert.equal(dirty.value, true)
})

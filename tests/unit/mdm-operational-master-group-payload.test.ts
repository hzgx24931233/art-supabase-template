import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildMasterGroupWriteInput,
  type MasterGroupFormModel
} from '@/views/mdm/operational-master/modules/group-payload'

const model: MasterGroupFormModel = {
  domain: 'customer',
  parentId: null,
  code: ' huawei ',
  name: ' 华为 ',
  sort: 10,
  enabled: true,
  remark: ' 重点客户 '
}

test('create payload normalizes text and keeps only the writable fields', () => {
  const payload = buildMasterGroupWriteInput(model)

  assert.equal(payload.code, 'HUAWEI')
  assert.equal(payload.name, '华为')
  assert.equal(payload.remark, '重点客户')
  assert.deepEqual(payload, {
    domain: 'customer',
    parentId: null,
    code: 'HUAWEI',
    name: '华为',
    sort: 10,
    enabled: true,
    remark: '重点客户'
  })
})

test('root group converts an empty tree selection to a null parent UUID', () => {
  const payload = buildMasterGroupWriteInput({ ...model, parentId: '' })

  assert.equal(payload.parentId, null)
})

test('editing strips tree-only and read-only fields from a selected group node', () => {
  const selectedTreeNode = {
    ...model,
    id: '0b37f11a-439c-4d9a-988b-6ecbb1d60235',
    createTime: '2026-09-11T00:00:00.000Z',
    updateTime: '2026-09-11T00:00:00.000Z',
    children: [{ ...model, id: 'c6fa9764-fdb0-43e0-a7c8-b075f8f49133' }]
  }

  const payload = buildMasterGroupWriteInput(selectedTreeNode)

  assert.deepEqual(payload, {
    domain: 'customer',
    parentId: null,
    code: 'HUAWEI',
    name: '华为',
    sort: 10,
    enabled: true,
    remark: '重点客户'
  })
})

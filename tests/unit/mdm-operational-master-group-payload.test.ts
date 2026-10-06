import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildMasterGroupWriteInput,
  type MasterGroupFormModel
} from '@/views/mdm/operational-master/modules/group-payload'

const model: MasterGroupFormModel = {
  tenantId: '3d3e7b51-0177-4467-92b8-97cad3c93474',
  domain: 'customer',
  parentId: null,
  code: ' huawei ',
  name: ' 华为 ',
  sort: 10,
  enabled: true,
  remark: ' 重点客户 '
}

test('ordinary tenant create omits tenantId so the database derives it from the session', () => {
  const payload = buildMasterGroupWriteInput(
    { ...model, tenantId: '' },
    {
      editing: false,
      isPlatformScope: false
    }
  )

  assert.equal('tenantId' in payload, false)
  assert.equal(payload.code, 'HUAWEI')
  assert.equal(payload.name, '华为')
  assert.equal(payload.remark, '重点客户')
})

test('root group converts an empty tree selection to a null parent UUID', () => {
  const payload = buildMasterGroupWriteInput(
    { ...model, parentId: '' },
    {
      editing: false,
      isPlatformScope: false
    }
  )

  assert.equal(payload.parentId, null)
})

test('platform-super create preserves the explicit target tenant', () => {
  const payload = buildMasterGroupWriteInput(model, {
    editing: false,
    isPlatformScope: true
  })

  assert.equal(payload.tenantId, model.tenantId)
})

test('editing never allows tenant ownership to move', () => {
  const payload = buildMasterGroupWriteInput(model, {
    editing: true,
    isPlatformScope: true
  })

  assert.equal('tenantId' in payload, false)
})

test('editing strips tree-only and read-only fields from a selected group node', () => {
  const selectedTreeNode = {
    ...model,
    id: '0b37f11a-439c-4d9a-988b-6ecbb1d60235',
    createTime: '2026-09-11T00:00:00.000Z',
    updateTime: '2026-09-11T00:00:00.000Z',
    children: [{ ...model, id: 'c6fa9764-fdb0-43e0-a7c8-b075f8f49133' }]
  }

  const payload = buildMasterGroupWriteInput(selectedTreeNode, {
    editing: true,
    isPlatformScope: true
  })

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

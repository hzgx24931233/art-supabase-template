import assert from 'node:assert/strict'
import test from 'node:test'
import type { OperationalMasterRecord } from '@/api/mdm'
import { buildOperationalMasterWriteInput } from '@/views/mdm/operational-master/modules/master-payload'

const customerModel: OperationalMasterRecord & { addressPicker: string } = {
  id: '',
  tenantId: '11111111-1111-4111-8111-111111111111',
  customerCode: ' DEMO_CUSTOMER ',
  customerName: ' 示例客户 ',
  groupId: '22222222-2222-4222-8222-222222222222',
  industry: 'technology',
  customerLevel: 'key',
  contactName: '',
  contactPhone: '',
  contactDepartment: ' 销售部 ',
  contactPosition: ' 客户经理 ',
  contactEmail: ' sales@example.com ',
  contactQq: ' 12345678 ',
  invoiceTitle: ' 示例客户有限公司 ',
  taxNo: ' 91340000TEST000001 ',
  bankName: ' 示例银行 ',
  bankAccount: ' 6222000000000000 ',
  region: '',
  addressDetail: ' 示例客户测试地址 ',
  addressPicker: '',
  enabled: true,
  remark: ''
}

const customerFieldKeys: Array<keyof OperationalMasterRecord> = [
  'customerCode',
  'customerName',
  'groupId',
  'industry',
  'customerLevel',
  'contactName',
  'contactPhone',
  'contactDepartment',
  'contactPosition',
  'contactEmail',
  'contactQq',
  'invoiceTitle',
  'taxNo',
  'bankName',
  'bankAccount',
  'region',
  'addressDetail',
  'enabled',
  'remark'
]

const operationFieldKeys: Array<keyof OperationalMasterRecord> = [
  'code',
  'name',
  'mnemonic',
  'groupId',
  'pricingType',
  'departmentId',
  'workCenterIds',
  'price',
  'pricingUnitId',
  'source',
  'processingDefectReasons',
  'materialDefectReasons',
  'enabled',
  'remark'
]

test('customer write payload excludes the address picker UI field', () => {
  const payload = buildOperationalMasterWriteInput(customerModel, {
    kind: 'customer',
    fieldKeys: customerFieldKeys,
    regionPath: ['安徽省', '滁州市', '琅琊区']
  })

  assert.equal('addressPicker' in payload, false)
  assert.equal(payload.region, '安徽省/滁州市/琅琊区')
  assert.equal(payload.addressDetail, '示例客户测试地址')
  assert.equal(payload.contactDepartment, '销售部')
  assert.equal(payload.invoiceTitle, '示例客户有限公司')
})

test('write payload only contains configured persistent fields', () => {
  const modelWithReadState = {
    ...customerModel,
    createTime: '2026-09-10T00:00:00.000Z',
    updateTime: '2026-09-10T00:00:00.000Z',
    joinedDisplayName: '临时展示值'
  }
  const payload = buildOperationalMasterWriteInput(modelWithReadState, {
    kind: 'customer',
    fieldKeys: customerFieldKeys,
    regionPath: []
  })

  assert.equal('id' in payload, false)
  assert.equal('createTime' in payload, false)
  assert.equal('updateTime' in payload, false)
  assert.equal('joinedDisplayName' in payload, false)
  assert.equal(payload.region, null)
  assert.equal(payload.customerCode, 'DEMO_CUSTOMER')
})

test('operation write payload converts blank optional UUID fields to null', () => {
  const pricingUnitId = '33333333-3333-4333-8333-333333333333'
  const payload = buildOperationalMasterWriteInput(
    {
      id: '',
      tenantId: '11111111-1111-4111-8111-111111111111',
      code: ' dddd ',
      name: ' 示例工序 ',
      mnemonic: '',
      groupId: '',
      pricingType: '',
      departmentId: '   ',
      workCenterIds: [],
      price: 0,
      pricingUnitId: ` ${pricingUnitId} `,
      source: 'manual',
      processingDefectReasons: ['production', 'inspection'],
      materialDefectReasons: ['oxidation'],
      enabled: true,
      remark: ''
    },
    {
      kind: 'operation',
      fieldKeys: operationFieldKeys,
      regionPath: []
    }
  )

  assert.equal(payload.groupId, null)
  assert.equal(payload.departmentId, null)
  assert.equal(payload.pricingUnitId, pricingUnitId)
  assert.deepEqual(payload.workCenterIds, [])
  assert.equal(payload.pricingType, '')
  assert.equal(payload.code, 'dddd')
})

test('new project payload leaves the monthly project code to the database', () => {
  const payload = buildOperationalMasterWriteInput(
    {
      id: '',
      tenantId: '11111111-1111-4111-8111-111111111111',
      projectCode: 'SHOULD_NOT_BE_WRITTEN',
      projectName: ' 月度编号测试项目 ',
      customerId: '22222222-2222-4222-8222-222222222222',
      contactName: ' 项目联系人 ',
      contactPhone: ' 13800138000 ',
      enabled: true,
      remark: ''
    },
    {
      kind: 'project',
      fieldKeys: [
        'projectCode',
        'projectName',
        'customerId',
        'contactName',
        'contactPhone',
        'enabled',
        'remark'
      ],
      regionPath: []
    }
  )

  assert.equal('projectCode' in payload, false)
  assert.equal(payload.projectName, '月度编号测试项目')
  assert.equal(payload.contactPhone, '13800138000')
})

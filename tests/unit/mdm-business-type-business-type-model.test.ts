import assert from 'node:assert/strict'
import test from 'node:test'
import type { BusinessTypeRecord } from '@/api/mdm'
import {
  buildBusinessTypeInput,
  createBusinessTypeCopyModel,
  createBusinessTypeFormModel
} from '@/views/mdm/business-type/modules/business-type-model'

const source: BusinessTypeRecord = {
  id: 'source-id',
  tenantId: 'tenant-id',
  documentTypeId: 'document-type-id',
  businessTypeCode: 'OUTSOURCE_RETURN',
  businessTypeName: '委外入库退回',
  isDefault: false,
  sourceBusinessTypeId: 'origin-id',
  inventoryDirection: 'return',
  ownerType: 'self',
  inventoryAccounting: false,
  remark: '退回业务',
  sortOrder: 20,
  textColor: '#409EFF',
  tagStyle: 'primary',
  enabled: true,
  documentType: {
    id: 'document-type-id',
    tenantId: 'tenant-id',
    menuId: 'menu-id',
    documentTypeCode: 'OUTSOURCE_RECEIPT',
    documentTypeName: '委外入库单',
    enabled: true
  }
}

test('copy model keeps business rules but clears unique code and default state', () => {
  const copy = createBusinessTypeCopyModel(source)
  assert.equal(copy.sourceId, source.id)
  assert.equal(copy.menuId, 'menu-id')
  assert.equal(copy.businessTypeCode, '')
  assert.equal(copy.businessTypeName, '委外入库退回（副本）')
  assert.equal(copy.isDefault, false)
  assert.equal(copy.sortOrder, 30)
})

test('write payload normalizes nullable and non-nullable fields', () => {
  const model = createBusinessTypeFormModel({
    tenantId: 'tenant-id',
    documentTypeId: 'document-type-id',
    businessTypeCode: '  sale_return  ',
    businessTypeName: '  销售退货  ',
    sourceBusinessTypeId: '',
    inventoryDirection: '',
    ownerType: 'customer',
    remark: '  客户退货  ',
    textColor: '#409eff'
  })
  const payload = buildBusinessTypeInput(model, true)
  assert.equal(payload.businessTypeCode, 'SALE_RETURN')
  assert.equal(payload.businessTypeName, '销售退货')
  assert.equal(payload.sourceBusinessTypeId, null)
  assert.equal(payload.inventoryDirection, null)
  assert.equal(payload.ownerType, 'customer')
  assert.equal(payload.remark, '客户退货')
  assert.equal(payload.textColor, '#409EFF')
})

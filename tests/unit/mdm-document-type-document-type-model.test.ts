import assert from 'node:assert/strict'
import test from 'node:test'
import type { DocumentTypeRecord } from '@/api/mdm'
import {
  buildDocumentTypeInput,
  createDocumentTypeCopyModel,
  createDocumentTypeFormModel
} from '@/views/mdm/document-type/modules/document-type-model'

const source: DocumentTypeRecord = {
  id: 'source-id',
  tenantId: 'tenant-id',
  menuId: 'menu-id',
  documentTypeCode: 'ORDER',
  documentTypeName: '运输订单',
  isDefault: true,
  remark: '业务主单',
  sortOrder: 20,
  textColor: '#409eff',
  tagStyle: 'primary',
  enabled: true,
  extensionFields: [],
  packingEnabled: false,
  packingThicknessFieldKey: null,
  allowedIssueWarehouseTypes: ['raw_material', 'outsourced']
}

test('copy model keeps presentation but clears the unique code and default state', () => {
  const copy = createDocumentTypeCopyModel(source)

  assert.equal(copy.sourceId, source.id)
  assert.equal(copy.tenantId, source.tenantId)
  assert.equal(copy.documentTypeCode, '')
  assert.equal(copy.documentTypeName, '运输订单（副本）')
  assert.equal(copy.isDefault, false)
  assert.equal(copy.sortOrder, 30)
  assert.deepEqual(copy.allowedIssueWarehouseTypes, source.allowedIssueWarehouseTypes)
})

test('write payload normalizes text and only includes tenant when required', () => {
  const model = createDocumentTypeFormModel({
    tenantId: 'tenant-id',
    menuId: 'menu-id',
    documentTypeCode: '  order_return  ',
    documentTypeName: '  退货单  ',
    remark: '  退货业务  ',
    textColor: '#409eff'
  })

  const tenantPayload = buildDocumentTypeInput(model, true)
  const ordinaryPayload = buildDocumentTypeInput(model, false)

  assert.equal(tenantPayload.documentTypeCode, 'ORDER_RETURN')
  assert.equal(tenantPayload.documentTypeName, '退货单')
  assert.equal(tenantPayload.remark, '退货业务')
  assert.equal(tenantPayload.textColor, '#409EFF')
  assert.equal(tenantPayload.tenantId, 'tenant-id')
  assert.equal('tenantId' in ordinaryPayload, false)
  assert.deepEqual(tenantPayload.allowedIssueWarehouseTypes, ['raw_material'])
})

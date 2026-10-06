import assert from 'node:assert/strict'
import test from 'node:test'
import type { MaterialCategory } from '@/api/mdm'
import { buildMaterialCategoryWriteInput } from '@/views/mdm/material/category/modules/category-payload'

const categoryModel: MaterialCategory & { remark: string; temporaryLabel: string } = {
  id: '',
  tenantId: '11111111-1111-4111-8111-111111111111',
  parentId: null,
  categoryCode: ' FERT ',
  codePrefix: '  FG ',
  categoryName: ' 产成品 ',
  materialTypeId: null,
  printName: ' 成品 ',
  compositionColumns: ['material_name', 'specification_model'],
  compositionSeparator: ' / ',
  overPurchasePercent: 0,
  overPurchaseQuantity: 0,
  maxReceiptQuantity: null,
  autoReceive: false,
  purchaserId: null,
  purchaseOrganization: '',
  requiresInspection: false,
  createDeliveryNotice: false,
  defaultSiteId: null,
  overReceiptPercent: 0,
  overReceiptQuantity: 0,
  batchManaged: false,
  valuationMethod: 'moving_average',
  description: ' 默认分类 ',
  status: 'enabled',
  sort: 10,
  remark: '',
  temporaryLabel: '只用于界面展示'
}

test('material category write payload contains only database-owned fields', () => {
  const payload = buildMaterialCategoryWriteInput(categoryModel)

  assert.equal('id' in payload, false)
  assert.equal('remark' in payload, false)
  assert.equal('temporaryLabel' in payload, false)
  assert.equal(payload.categoryCode, 'FERT')
  assert.equal(payload.codePrefix, 'FG')
  assert.equal(payload.categoryName, '产成品')
  assert.equal(payload.printName, '成品')
  assert.equal(payload.purchaseOrganization, null)
  assert.equal(payload.description, '默认分类')
  assert.deepEqual(payload.compositionColumns, ['material_name', 'specification_model'])
})

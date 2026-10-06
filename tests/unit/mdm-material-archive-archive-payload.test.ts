import assert from 'node:assert/strict'
import test from 'node:test'
import type { MaterialArchive } from '@/api/mdm'
import { buildMaterialArchiveWriteInput } from '@/views/mdm/material/archive/modules/archive-payload'

const archiveModel: MaterialArchive = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  categoryId: '33333333-3333-4333-8333-333333333333',
  category: {
    id: '33333333-3333-4333-8333-333333333333',
    categoryCode: 'FG',
    categoryName: '产成品'
  },
  materialCode: 'FG-0001',
  materialName: '安全帽',
  basicUnit: 'PCS',
  baseUnitId: '44444444-4444-4444-8444-444444444444',
  baseUnit: {
    id: '44444444-4444-4444-8444-444444444444',
    unitCode: 'PCS',
    unitName: '件',
    symbol: '件'
  },
  productionUnit: {
    id: '44444444-4444-4444-8444-444444444444',
    unitCode: 'PCS',
    unitName: '件',
    symbol: '件'
  },
  productionUnitId: '44444444-4444-4444-8444-444444444444',
  materialType: 'FG',
  materialSource: 'self_made',
  materialTypeId: '55555555-5555-4555-8555-555555555555',
  materialTypeRef: {
    id: '55555555-5555-4555-8555-555555555555',
    typeCode: 'FG',
    typeName: '产成品'
  },
  attributeValues: {},
  auxiliaryUnitId: '',
  auxiliaryUnit2Id: '   ',
  attributeGroupId: '',
  imageUrls: [],
  materialGroupId: '',
  purchaseOrganization: '',
  batchPolicy: ' ',
  salesOrganization: '',
  serialGenerationTiming: '',
  shelfLifeCalculationDirection: '',
  expiryCalculationMethod: '',
  mrpType: '',
  materialIssueMethod: '',
  backflushMethod: '',
  overIssueControlMethod: '',
  valuationMethod: '',
  defaultWarehouseId: '66666666-6666-4666-8666-666666666666',
  defaultWarehouse: {
    id: '66666666-6666-4666-8666-666666666666',
    warehouseCode: 'WH-01',
    warehouseName: '成品仓'
  },
  allowNegativeInventory: false,
  minStockAlertEnabled: false,
  safetyStockAlertEnabled: false,
  reorderPointAlertEnabled: false,
  maxStockAlertEnabled: false,
  batchManagementEnabled: false,
  serialManagementEnabled: false,
  shelfLifeManagementEnabled: false,
  expiryAlertEnabled: false,
  barcodeManagementEnabled: false,
  keyComponent: false,
  schedulingPriority: 50,
  schedulingStrategy: 'inherit',
  planningTimeFenceDays: 0,
  currencyCode: 'CNY',
  unitConversions: [],
  status: 'enabled',
  sort: 10,
  createBy: 'operator@example.com',
  createTime: '2026-09-11T00:00:00Z',
  updateBy: 'operator@example.com',
  updateTime: '2026-09-11T00:00:00Z'
}

test('material archive edit payload excludes read-only joined and audit fields', () => {
  const payload = buildMaterialArchiveWriteInput(archiveModel)

  for (const key of [
    'id',
    'category',
    'materialTypeRef',
    'baseUnit',
    'productionUnit',
    'defaultWarehouse',
    'createBy',
    'createTime',
    'updateBy',
    'updateTime'
  ]) {
    assert.equal(key in payload, false, `${key} must not be submitted`)
  }
  assert.equal(payload.materialCode, 'FG-0001')
  assert.equal(payload.productionUnitId, '44444444-4444-4444-8444-444444444444')
  assert.equal(payload.defaultWarehouseId, '66666666-6666-4666-8666-666666666666')
  assert.equal(payload.auxiliaryUnitId, null)
  assert.equal(payload.auxiliaryUnit2Id, null)
  assert.equal(payload.attributeGroupId, null)
  assert.equal(payload.materialGroupId, null)
  assert.equal(payload.purchaseOrganization, null)
  assert.equal(payload.batchPolicy, null)
  assert.equal(payload.salesOrganization, null)
  assert.equal(payload.serialGenerationTiming, null)
  assert.equal(payload.shelfLifeCalculationDirection, null)
  assert.equal(payload.expiryCalculationMethod, null)
  assert.equal(payload.mrpType, null)
  assert.equal(payload.materialIssueMethod, null)
  assert.equal(payload.backflushMethod, null)
  assert.equal(payload.overIssueControlMethod, null)
  assert.equal(payload.valuationMethod, null)
})

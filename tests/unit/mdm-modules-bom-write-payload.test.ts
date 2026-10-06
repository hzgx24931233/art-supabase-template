import assert from 'node:assert/strict'
import test from 'node:test'
import type { BomInput } from '@/api/mdm/bom.types'
import { buildBomWritePayload } from '@/api/mdm/bom-write-payload'

test('BOM write payload excludes joined records and audit-only fields', () => {
  const payload = {
    id: 'bom-1',
    tenantId: 'tenant-1',
    bomCode: 'BOM-0001',
    materialId: 'material-1',
    processRouteId: 'route-1',
    groupId: 'group-1',
    version: 'V1.0',
    purpose: 'production',
    baseQuantity: 1,
    baseUnitId: 'unit-1',
    effectiveFrom: null,
    effectiveTo: null,
    description: '',
    sort: 10,
    status: 'design',
    createBy: 'user@example.com',
    material: { id: 'material-1' },
    items: [
      {
        id: 'item-1',
        component: { id: 'component-1' },
        componentMaterialId: 'component-1',
        sequenceNo: 10,
        quantity: 2,
        unitId: 'unit-2',
        scrapRate: 0,
        mrpEnabled: true,
        defaultIssueWarehouseId: null,
        issueMethod: 'production_pick',
        backflushMethod: 'none',
        overIssueControlMethod: null,
        projectText: null,
        positionNo: null,
        processRouteStepId: 'step-10',
        operationName: null,
        effectiveFrom: null,
        effectiveTo: null,
        remark: null
      }
    ]
  } as unknown as BomInput

  const result = buildBomWritePayload(payload)

  assert.deepEqual(Object.keys(result.header), [
    'id',
    'tenantId',
    'bomCode',
    'materialId',
    'processRouteId',
    'groupId',
    'version',
    'purpose',
    'baseQuantity',
    'baseUnitId',
    'effectiveFrom',
    'effectiveTo',
    'description',
    'sort'
  ])
  assert.equal('status' in result.header, false)
  assert.equal('material' in result.header, false)
  assert.equal('id' in result.items[0], false)
  assert.equal('component' in result.items[0], false)
  assert.equal(result.items[0].processRouteStepId, 'step-10')
})

import assert from 'node:assert/strict'
import test from 'node:test'
import type { BomInput, MaterialArchive } from '@/api/mdm'
import {
  assignBomComponentsToStep,
  mergeBomComponentSelection,
  removeBomComponentSelection
} from '@/views/mdm/bom/maintenance/modules/bom-component-selection'

const material = (id: string): MaterialArchive =>
  ({
    id,
    tenantId: 'tenant-1',
    materialCode: id.toUpperCase(),
    materialName: id,
    baseUnitId: 'unit-1'
  }) as MaterialArchive

const component = (id: string, sequenceNo = 10): BomInput['items'][number] => ({
  componentMaterialId: id,
  sequenceNo,
  quantity: 2,
  unitId: 'unit-1',
  scrapRate: 0,
  mrpEnabled: true,
  defaultIssueWarehouseId: null,
  issueMethod: 'production_pick',
  backflushMethod: 'none',
  overIssueControlMethod: null,
  projectText: '',
  positionNo: '',
  processRouteStepId: null,
  operationName: '',
  effectiveFrom: '2026-09-12',
  effectiveTo: '9999-12-31',
  remark: ''
})

test('new BOM components default to the first route operation', () => {
  const result = mergeBomComponentSelection(
    [],
    [],
    [material('component-a')],
    'parent',
    '2026-09-12',
    { id: 'step-10', name: '首道装配' }
  )

  assert.equal(result.items[0].processRouteStepId, 'step-10')
  assert.equal(result.items[0].operationName, '首道装配')
})

test('BOM selection preserves edited rows and appends only new components', () => {
  const result = mergeBomComponentSelection(
    [component('component-a')],
    [material('component-a')],
    [material('component-a'), material('component-b')],
    'parent',
    '2026-09-12'
  )

  assert.equal(result.items.length, 2)
  assert.equal(result.items[0].quantity, 2)
  assert.deepEqual(
    {
      componentMaterialId: result.items[1].componentMaterialId,
      sequenceNo: result.items[1].sequenceNo,
      quantity: result.items[1].quantity
    },
    { componentMaterialId: 'component-b', sequenceNo: 20, quantity: 1 }
  )
})

test('BOM selection never adds the parent material as its own component', () => {
  const result = mergeBomComponentSelection(
    [component('component-a')],
    [material('component-a')],
    [material('parent'), material('component-b')],
    'parent',
    '2026-09-12'
  )

  assert.deepEqual(
    result.items.map((item) => item.componentMaterialId),
    ['component-a', 'component-b']
  )
  assert.equal(
    result.materials.some((item) => item.id === 'parent'),
    false
  )
})

test('BOM selection removes the row and selected-state material together', () => {
  const result = removeBomComponentSelection(
    [component('component-a'), component('component-b', 20)],
    [material('component-a'), material('component-b')],
    'component-a'
  )

  assert.deepEqual(
    result.items.map((item) => item.componentMaterialId),
    ['component-b']
  )
  assert.deepEqual(
    result.materials.map((item) => item.id),
    ['component-b']
  )
})

test('batch assignment updates only the selected BOM components', () => {
  const result = assignBomComponentsToStep(
    [component('component-a'), component('component-b', 20), component('component-c', 30)],
    ['component-a', 'component-c'],
    { id: 'step-20', name: '总装' }
  )

  assert.deepEqual(
    result.map((item) => ({
      id: item.componentMaterialId,
      stepId: item.processRouteStepId,
      operationName: item.operationName
    })),
    [
      { id: 'component-a', stepId: 'step-20', operationName: '总装' },
      { id: 'component-b', stepId: null, operationName: '' },
      { id: 'component-c', stepId: 'step-20', operationName: '总装' }
    ]
  )
})

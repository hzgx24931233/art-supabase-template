import assert from 'node:assert/strict'
import test from 'node:test'
import { convertBomComponentQuantity } from '@/views/mdm/bom/maintenance/modules/bom-unit-conversion'

const material = {
  baseUnitId: 'kg',
  unitConversions: [
    { sourceUnitId: 'm', sourceFactor: 1, baseFactor: 50.397 },
    { sourceUnitId: 't', sourceFactor: 1, baseFactor: 1000 }
  ]
}

test('BOM component quantity follows material unit conversion in both directions', () => {
  assert.equal(convertBomComponentQuantity(50.397, 'kg', 'm', material), 1)
  assert.equal(convertBomComponentQuantity(1, 'm', 'kg', material), 50.397)
  assert.equal(convertBomComponentQuantity(1, 't', 'kg', material), 1000)
})

test('BOM component quantity remains editable when a unit has no conversion', () => {
  assert.equal(convertBomComponentQuantity(2, 'kg', 'unknown', material), null)
})

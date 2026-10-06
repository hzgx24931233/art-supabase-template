import assert from 'node:assert/strict'
import test from 'node:test'
import { alignMaterialArchiveDatabaseKeys } from '@/api/mdm/material-write-payload'

test('material archive payload uses the exact second auxiliary unit column name', () => {
  const payload = alignMaterialArchiveDatabaseKeys({
    material_code: 'PPE-HELMET-001',
    auxiliary_unit2_id: null
  })

  assert.equal('auxiliary_unit2_id' in payload, false)
  assert.equal(payload.auxiliary_unit_2_id, null)
  assert.equal(payload.material_code, 'PPE-HELMET-001')
})

test('material archive payload leaves already aligned keys unchanged', () => {
  const payload = {
    material_code: 'PPE-HELMET-001',
    auxiliary_unit_2_id: '11111111-1111-4111-8111-111111111111'
  }

  assert.equal(alignMaterialArchiveDatabaseKeys(payload), payload)
})

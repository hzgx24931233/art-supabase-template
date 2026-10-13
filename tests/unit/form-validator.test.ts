import assert from 'node:assert/strict'
import test from 'node:test'
import { validateUuid } from '../../src/utils/form/uuid'

test('accepts database primary keys regardless of version and variant bits', () => {
  assert.equal(validateUuid('f90109a0-7116-4758-aaec-a3609fa3a8c9'), true)
  assert.equal(validateUuid('00000000-0000-0000-0000-000000000000'), true)
  assert.equal(validateUuid('0191f0f4-7d5b-7c3a-9f21-6e0b6f9f2c11'), true)
  assert.equal(validateUuid('F90109A0-7116-4758-AAEC-A3609FA3A8C9'), true)
  assert.equal(validateUuid('  f90109a0-7116-4758-aaec-a3609fa3a8c9  '), true)
})

test('rejects values that PostgREST would fail to bind as uuid', () => {
  assert.equal(validateUuid(''), false)
  assert.equal(validateUuid('   '), false)
  assert.equal(validateUuid(undefined as unknown as string), false)
  assert.equal(validateUuid(null as unknown as string), false)
})

test('rejects the literal route pattern leaked from an optional-path menu', () => {
  assert.equal(validateUuid(':id'), false)
  assert.equal(validateUuid(':id?'), false)
  assert.equal(validateUuid('undefined'), false)
  assert.equal(validateUuid('new'), false)
})

test('rejects truncated or extra-length uuid shapes', () => {
  assert.equal(validateUuid('f90109a0-7116-4758-aaec-a3609fa3a8c'), false)
  assert.equal(validateUuid('f90109a0-7116-4758-aaec-a3609fa3a8c9a'), false)
  assert.equal(validateUuid('f90109a07116-4758-aaec-a3609fa3a8c9'), false)
  assert.equal(validateUuid('f90109a0-7116-4758-aaec-a3609fa3a8cg'), false)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { useRowActionLoading } from '../../src/hooks/core/useRowActionLoading'

test('row action loading isolates concurrent records and blocks conflicts on one row', () => {
  const state = useRowActionLoading()

  assert.equal(state.start('row-1', 'submit'), true)
  assert.equal(state.isActive('row-1', 'submit'), true)
  assert.equal(state.isRowActive('row-1'), true)
  assert.equal(state.start('row-1', 'approve'), false)
  assert.equal(state.start('row-2', 'submit'), true)
  assert.equal(state.isRowActive('row-2'), true)

  state.stop('row-1', 'submit')
  assert.equal(state.isRowActive('row-1'), false)
  assert.equal(state.isRowActive('row-2'), true)

  state.stop('row-2', 'submit')
  assert.equal(state.activeKeys.value.size, 0)
})

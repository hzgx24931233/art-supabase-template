import assert from 'node:assert/strict'
import test from 'node:test'
import {
  extractAiEdgeBearerToken,
  isActiveAiEdgeAppUser
} from '../../supabase/functions/_shared/ai-edge-user-context-policy'

test('extracts bearer tokens without surrounding whitespace', () => {
  assert.equal(extractAiEdgeBearerToken('Bearer valid-token '), 'valid-token')
  assert.equal(extractAiEdgeBearerToken('bearer valid-token'), 'valid-token')
  assert.equal(extractAiEdgeBearerToken('raw-token'), 'raw-token')
})

test('rejects malformed or inactive application users', () => {
  assert.equal(isActiveAiEdgeAppUser(null), false)
  assert.equal(isActiveAiEdgeAppUser('user@example.com'), false)
  assert.equal(isActiveAiEdgeAppUser(['user@example.com']), false)
  assert.equal(isActiveAiEdgeAppUser({}), false)
  assert.equal(isActiveAiEdgeAppUser({ user_email: 42, status: '1' }), false)
  assert.equal(isActiveAiEdgeAppUser({ user_email: 'user@example.com', status: '0' }), false)
})

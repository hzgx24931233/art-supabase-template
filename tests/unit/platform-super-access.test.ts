import assert from 'node:assert/strict'
import test from 'node:test'
import { hasPlatformSuperAccess } from '../../src/utils/platform-super-access'

const protectedProfile = {
  status: '1',
  userRoles: ['R_SUPER', 'R_ADMIN']
}

test('server-confirmed platform super keeps platform controls', () => {
  assert.equal(hasPlatformSuperAccess({ ...protectedProfile, platformSuper: true }), true)
})

test('role labels do not grant access without server confirmation', () => {
  assert.equal(hasPlatformSuperAccess(protectedProfile), false)
  assert.equal(hasPlatformSuperAccess({ ...protectedProfile, platformSuper: false }), false)
})

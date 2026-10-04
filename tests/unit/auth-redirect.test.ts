import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isAbsoluteApplicationRedirect,
  resolveSafePostLoginRedirect
} from '../../src/utils/auth-redirect'

const platformOrigin = 'https://example.github.io'

test('accepts platform routes and same-origin child application URLs', () => {
  assert.equal(resolveSafePostLoginRedirect('/dashboard', platformOrigin), '/dashboard')
  assert.equal(
    resolveSafePostLoginRedirect(
      'https://example.github.io/art-supabase-fms/#/fms',
      platformOrigin
    ),
    'https://example.github.io/art-supabase-fms/#/fms'
  )
})

test('rejects protocol-relative and cross-origin redirects', () => {
  assert.equal(resolveSafePostLoginRedirect('//evil.example/path', platformOrigin), undefined)
  assert.equal(
    resolveSafePostLoginRedirect('https://evil.example/art-supabase-fms/', platformOrigin),
    undefined
  )
  assert.equal(resolveSafePostLoginRedirect('javascript:alert(1)', platformOrigin), undefined)
})

test('identifies full application redirects', () => {
  assert.equal(isAbsoluteApplicationRedirect('/dashboard'), false)
  assert.equal(isAbsoluteApplicationRedirect('https://example.github.io/app/'), true)
})

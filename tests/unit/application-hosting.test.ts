import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resolveApplicationBaseUrl,
  resolveApplicationCode,
  resolveHostedApplicationCodes
} from '../../src/config/application'

// 模板登记的应用只有 platform 与 fms；新增模块时这里的用例也要同步。
test('platform host aggregates every application granted to the current user', () => {
  assert.deepEqual(resolveHostedApplicationCodes('platform', [{ code: 'fms' }]), [
    'platform',
    'fms'
  ])
})

test('standalone application only requests its own menu contract', () => {
  assert.deepEqual(resolveHostedApplicationCodes('fms', [{ code: 'platform' }]), ['fms'])
})

test('each deployment resolves only its own application identity', () => {
  assert.equal(resolveApplicationCode('platform'), 'platform')
  assert.equal(resolveApplicationCode('FMS'), 'fms')
  assert.equal(resolveApplicationCode('unknown'), 'platform')
})

test('independent deployments navigate through the configured application base URL', () => {
  const target = resolveApplicationBaseUrl('fms', 'https://fms.example.com/', {
    hostname: 'platform.example.com',
    origin: 'https://platform.example.com'
  })

  assert.equal(target.toString(), 'https://fms.example.com/')
})

test('GitHub Pages deployments retain the application-specific deployment path', () => {
  const target = resolveApplicationBaseUrl('fms', 'https://fms.example.com/', {
    hostname: 'example.github.io',
    origin: 'https://example.github.io'
  })

  assert.equal(target.toString(), 'https://example.github.io/art-supabase-fms/')
})

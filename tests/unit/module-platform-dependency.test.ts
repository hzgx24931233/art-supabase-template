import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import test from 'node:test'
import {
  classifyPlatformDependency,
  platformPackageDirectory,
  platformPackageFileName,
  resolveLocalPlatformPackage
} from '../../scripts/module-platform-dependency'

const moduleRoot = resolve('modules', 'art-supabase-hr')

test('缺少声明时按不依赖平台处理', () => {
  assert.deepEqual(classifyPlatformDependency(undefined), { kind: 'none' })
  assert.deepEqual(classifyPlatformDependency(''), { kind: 'none' })
  assert.deepEqual(classifyPlatformDependency('   '), { kind: 'none' })
})

test('file: 交付包按本地包处理并保留原始声明', () => {
  const reference = 'file:..\\..\\packages\\art-supabase-pro-1.0.0.tgz'
  assert.deepEqual(classifyPlatformDependency(reference), {
    kind: 'local-package',
    reference
  })
  assert.deepEqual(classifyPlatformDependency(`  ${reference}  `), {
    kind: 'local-package',
    reference
  })
  assert.deepEqual(classifyPlatformDependency('FILE:./platform.tgz'), {
    kind: 'local-package',
    reference: 'FILE:./platform.tgz'
  })
})

test('归档地址按锁定提交处理', () => {
  const reference =
    'https://github.com/hzgx24931233/art-supabase-template/archive/4ddc8b20a5f2b1c9a8e7d6c5b4a39281706f5e4d.tar.gz'
  assert.deepEqual(classifyPlatformDependency(reference), {
    kind: 'commit-archive',
    reference
  })
})

test('file: 声明解析为相对子仓根目录的绝对路径', () => {
  assert.equal(
    resolveLocalPlatformPackage('file:..\\..\\packages\\art-supabase-pro-1.0.0.tgz', moduleRoot),
    join(resolve('packages'), 'art-supabase-pro-1.0.0.tgz')
  )
  assert.equal(
    resolveLocalPlatformPackage('file:../../packages/art-supabase-pro-1.0.0.tgz', moduleRoot),
    join(resolve('packages'), 'art-supabase-pro-1.0.0.tgz')
  )
  assert.equal(
    resolveLocalPlatformPackage('file:./local.tgz', moduleRoot),
    join(moduleRoot, 'local.tgz')
  )
})

test('file: 声明支持绝对路径', () => {
  const absolute = resolve('packages', 'art-supabase-pro-1.0.0.tgz')

  assert.equal(resolveLocalPlatformPackage(`file:${absolute}`, moduleRoot), absolute)
})

test('交付包文件名与 pnpm pack 命名一致', () => {
  assert.equal(platformPackageFileName('art-supabase-pro', '1.0.0'), 'art-supabase-pro-1.0.0.tgz')
  assert.equal(
    platformPackageFileName('@scope/art-supabase-pro', '2.1.3'),
    'scope-art-supabase-pro-2.1.3.tgz'
  )
  assert.equal(platformPackageDirectory, 'packages')
})

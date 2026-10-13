import assert from 'node:assert/strict'
import test from 'node:test'
import {
  type PnpmInvocationEnvironment,
  resolvePnpmInvocation
} from '../../scripts/pnpm-invocation'

const nodeExecPath = 'C:\\Program Files\\nodejs\\node.exe'

function environment(overrides: Partial<PnpmInvocationEnvironment>): PnpmInvocationEnvironment {
  return {
    execPath: nodeExecPath,
    platform: 'win32',
    comSpec: 'C:\\Windows\\system32\\cmd.exe',
    ...overrides
  }
}

test('pnpm 的 JS 入口交给 node 执行', () => {
  const invocation = resolvePnpmInvocation(
    ['run', 'check'],
    environment({
      npmExecPath: 'C:\\Users\\dev\\AppData\\Local\\pnpm\\bin\\pnpm.cjs'
    })
  )

  assert.equal(invocation.command, nodeExecPath)
  assert.deepEqual(invocation.args, [
    'C:\\Users\\dev\\AppData\\Local\\pnpm\\bin\\pnpm.cjs',
    'run',
    'check'
  ])
})

test('standalone 的 pnpm.exe 直接执行，不再交给 node', () => {
  const standalonePath =
    'C:\\Users\\dev\\AppData\\Local\\pnpm\\package-manager-store\\v11\\links\\@pnpm\\exe\\11.9.0\\node_modules\\@pnpm\\exe\\pnpm.exe'

  const invocation = resolvePnpmInvocation(
    ['run', 'check'],
    environment({
      npmExecPath: standalonePath
    })
  )

  assert.equal(invocation.command, standalonePath)
  assert.deepEqual(invocation.args, ['run', 'check'])
})

test('可执行文件后缀大小写不敏感', () => {
  const invocation = resolvePnpmInvocation(
    [],
    environment({
      npmExecPath: 'C:\\tools\\PNPM.EXE'
    })
  )

  assert.equal(invocation.command, 'C:\\tools\\PNPM.EXE')
})

test('Windows 批处理入口经命令解释器执行，并沿用该入口路径', () => {
  const invocation = resolvePnpmInvocation(
    ['install'],
    environment({
      npmExecPath: 'C:\\tools\\pnpm.CMD'
    })
  )

  assert.equal(invocation.command, 'C:\\Windows\\system32\\cmd.exe')
  assert.deepEqual(invocation.args, ['/d', '/s', '/c', 'C:\\tools\\pnpm.CMD', 'install'])
})

test('缺少 ComSpec 时回落到 cmd.exe', () => {
  const invocation = resolvePnpmInvocation(
    [],
    environment({
      npmExecPath: 'C:\\tools\\pnpm.exe',
      comSpec: undefined
    })
  )

  assert.equal(invocation.command, 'C:\\tools\\pnpm.exe')

  const batInvocation = resolvePnpmInvocation(
    [],
    environment({
      npmExecPath: 'C:\\tools\\pnpm.bat',
      comSpec: undefined
    })
  )

  assert.equal(batInvocation.command, 'cmd.exe')
})

test('npm 自己拉起脚本时仍使用项目锁定的 pnpm', () => {
  const invocation = resolvePnpmInvocation(
    ['run', 'build'],
    environment({
      npmExecPath: 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js'
    })
  )

  assert.equal(invocation.command, 'C:\\Windows\\system32\\cmd.exe')
  assert.deepEqual(invocation.args, ['/d', '/s', '/c', 'pnpm.cmd', 'run', 'build'])
})

test('缺少入口路径时按平台回落', () => {
  const windows = resolvePnpmInvocation(['check'], environment({ npmExecPath: undefined }))
  assert.equal(windows.command, 'C:\\Windows\\system32\\cmd.exe')
  assert.deepEqual(windows.args, ['/d', '/s', '/c', 'pnpm.cmd', 'check'])

  const linux = resolvePnpmInvocation(
    ['check'],
    environment({
      npmExecPath: undefined,
      platform: 'linux',
      comSpec: undefined
    })
  )
  assert.equal(linux.command, 'pnpm')
  assert.deepEqual(linux.args, ['check'])
})

test('非 JS 的 POSIX pnpm 入口按名称回落，不交给 node', () => {
  const invocation = resolvePnpmInvocation(
    ['run', 'check'],
    environment({
      npmExecPath: '/usr/local/bin/pnpm',
      platform: 'linux',
      comSpec: undefined
    })
  )

  assert.equal(invocation.command, 'pnpm')
  assert.deepEqual(invocation.args, ['run', 'check'])
})

test('POSIX 下的 JS 入口同样交给 node 执行', () => {
  const invocation = resolvePnpmInvocation(
    ['run', 'check'],
    environment({
      npmExecPath: '/usr/local/lib/node_modules/pnpm/bin/pnpm.cjs',
      platform: 'linux',
      comSpec: undefined,
      execPath: '/usr/local/bin/node'
    })
  )

  assert.equal(invocation.command, '/usr/local/bin/node')
  assert.deepEqual(invocation.args, [
    '/usr/local/lib/node_modules/pnpm/bin/pnpm.cjs',
    'run',
    'check'
  ])
})

test('参数原样透传，不会被改写', () => {
  const args = [
    '--config.overrides.art-supabase-pro=file:../../../packages/art-supabase-pro-1.0.0.tgz',
    'run',
    'check'
  ]
  const invocation = resolvePnpmInvocation(
    args,
    environment({
      npmExecPath: 'C:\\tools\\pnpm.exe'
    })
  )

  assert.deepEqual(invocation.args, args)
})

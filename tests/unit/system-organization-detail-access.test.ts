import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const systemManageSource = readFileSync(
  new URL('../../src/api/system-manage.ts', import.meta.url),
  'utf8'
)

/**
 * 组织治理详情曾用 `leader:sys_user(...)` 这类不带外键约束名的嵌入读取。
 * mdm_organization 与 sys_user 之间新增了第二条外键路径后，PostgREST 会以 PGRST201
 * 拒绝这种歧义嵌入；该错误码没有业务化文案，界面只会显示「操作未完成，请稍后重试」，
 * 因此必须保持通过带权限校验的 RPC 读取。
 */
test('organization detail reads through the permission-checked RPC', () => {
  assert.match(
    systemManageSource,
    /export async function fetchGetOrganizationDetail[\s\S]*?supabase\.rpc\(['"]get_organization_detail_secure['"]/
  )
})

test('system manage API keeps foreign-key hints on sys_user embeds', () => {
  // `sys_user!constraint_name(...)` 是显式约束写法，只有省略约束名时才会触发歧义嵌入。
  assert.doesNotMatch(systemManageSource, /:\s*sys_user\s*\(/)
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

/**
 * 仅凭邮箱调用 check_user_status 会让任何未认证请求都能探测某账号是否停用、
 * 是否分配角色。准入判断必须始终基于登录会话，且会话校验要先于账号查询。
 */
test('check_user_status resolves the account from an authenticated session only', () => {
  const source = readFileSync(
    new URL('../../supabase/functions/check_user_status/index.ts', import.meta.url),
    'utf8'
  )

  assert.doesNotMatch(source, /user_email/)
  assert.doesNotMatch(source, /body\??\.email/)
  assert.match(source, /authorization\?\.match\(\/\^Bearer/)
  assert.match(source, /admin\.auth\.getUser\(accessToken\)/)
  assert.match(source, /\.eq\('auth_user_id', authData\.user\.id\)/)

  const sessionCheckIndex = source.indexOf('admin.auth.getUser(accessToken)')
  const accountQueryIndex = source.indexOf(".from('sys_user')")
  assert.ok(sessionCheckIndex >= 0 && sessionCheckIndex < accountQueryIndex)
})

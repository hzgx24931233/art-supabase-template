import assert from 'node:assert/strict'
import test from 'node:test'
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js'
import {
  createFriendlySupabaseFunctionError,
  formatSupabaseAuthErrorMessage,
  getFriendlySupabaseErrorMessage,
  isSupabaseRequestAbortFailure,
  isSupabaseSessionFailure,
  normalizeSupabaseFunctionError
} from '../../src/utils/supabase'

class AuthApiErrorFixture extends Error {
  code = 'invalid_credentials'
  status = 400
}

test('converts AuthApiError class instances into a friendly login message', () => {
  const error = new AuthApiErrorFixture('Invalid login credentials')

  assert.equal(getFriendlySupabaseErrorMessage(error), '邮箱或密码错误，请重新输入')
})

test('uses stable Supabase and Postgres error codes before technical messages', () => {
  assert.equal(
    getFriendlySupabaseErrorMessage({ code: '23505', message: 'duplicate key value' }),
    '相同数据已存在，请勿重复提交'
  )
  assert.equal(
    getFriendlySupabaseErrorMessage({ code: '42501', message: 'permission denied' }),
    '当前账号没有此操作权限'
  )
  assert.equal(
    getFriendlySupabaseErrorMessage({ code: '23503', message: 'foreign key violation' }),
    '该数据正在被其他业务使用，暂时不能修改或删除'
  )
})

test('maps PostgREST schema cache failures to recognizable configuration messages', () => {
  // 结构类错误（缺失/歧义关联、缺失表）说明请求与服务端结构不一致，必须区别于“稍后重试”，
  // 否则同类回归在界面上完全不可见。
  assert.equal(
    getFriendlySupabaseErrorMessage({
      code: 'PGRST200',
      message: "Could not find a relationship between 'mdm_organization' and 'sys_user'"
    }),
    '数据关联关系缺失或已变更，请联系管理员'
  )
  assert.equal(
    getFriendlySupabaseErrorMessage({
      code: 'PGRST201',
      message: 'An ambiguous embedding request was made.'
    }),
    '数据关联关系不唯一，请联系管理员'
  )
  assert.equal(
    getFriendlySupabaseErrorMessage({
      code: 'PGRST203',
      message: 'Could not choose the best candidate function'
    }),
    '服务接口定义不唯一，请联系管理员'
  )
  assert.equal(
    getFriendlySupabaseErrorMessage({
      code: 'PGRST205',
      message: "Could not find the table 'mdm_organization' in the schema cache"
    }),
    '数据表不存在或未同步，请联系管理员'
  )
})

test('maps PostgREST request and JWT configuration failures to actionable messages', () => {
  assert.equal(
    getFriendlySupabaseErrorMessage({
      code: 'PGRST101',
      message: 'Only GET and POST verbs allowed'
    }),
    '服务接口请求方式不正确，请联系管理员'
  )
  assert.equal(
    getFriendlySupabaseErrorMessage({
      code: 'PGRST103',
      message: 'Requested range not satisfiable'
    }),
    '分页范围不正确，请刷新后重试'
  )
  assert.equal(
    getFriendlySupabaseErrorMessage({ code: 'PGRST300', message: 'JWT secret missing' }),
    '服务配置异常，请联系管理员'
  )
  assert.equal(
    getFriendlySupabaseErrorMessage({ code: 'PGRST302', message: 'Anonymous access is disabled' }),
    '请先登录后再操作'
  )
  assert.equal(
    getFriendlySupabaseErrorMessage({
      code: 'PGRST303',
      message: 'JWT claims validation or parsing failed'
    }),
    '登录状态已失效，请重新登录'
  )
})

test('treats an unparsable JWT claim as a session failure even without a status', () => {
  const invalidClaims = {
    code: 'PGRST303',
    message: 'JWT claims validation or parsing failed'
  }

  assert.equal(isSupabaseSessionFailure(invalidClaims), true)
})

test('falls back to the caller message for unknown error codes', () => {
  assert.equal(getFriendlySupabaseErrorMessage({ code: 'PGRST999' }), '操作未完成，请稍后重试')
  assert.equal(
    getFriendlySupabaseErrorMessage({ code: 'PGRST999' }, '删除失败，请稍后重试'),
    '删除失败，请稍后重试'
  )
})

test('distinguishes an expired PostgREST session from a real permission denial', () => {
  const expiredSessionError = {
    code: '42501',
    message: 'Authentication required',
    status: 401
  }
  const permissionError = {
    code: '42501',
    message: 'permission denied for table wiki_article'
  }

  assert.equal(isSupabaseSessionFailure(expiredSessionError), true)
  assert.equal(getFriendlySupabaseErrorMessage(expiredSessionError), '登录状态已失效，请重新登录')
  assert.equal(isSupabaseSessionFailure(permissionError), false)
  assert.equal(getFriendlySupabaseErrorMessage(permissionError), '当前账号没有此操作权限')
})

test('recognizes a nested 401 response from Supabase functions', () => {
  const error = {
    context: new Response(null, { status: 401 })
  }

  assert.equal(isSupabaseSessionFailure(error), true)
})

test('recognizes Supabase AbortSignal responses without confusing database cancellations', () => {
  const requestAbort = {
    code: '',
    message: 'AbortError: This operation was aborted',
    details: 'AbortError: This operation was aborted',
    hint: 'Request was aborted (timeout or manual cancellation)'
  }
  const statementTimeout = {
    code: '57014',
    message: 'canceling statement due to statement timeout'
  }

  assert.equal(isSupabaseRequestAbortFailure(requestAbort), true)
  assert.equal(
    isSupabaseRequestAbortFailure(new DOMException('The user aborted a request.', 'AbortError')),
    true
  )
  assert.equal(isSupabaseRequestAbortFailure(statementTimeout), false)
})

test('parses serialized errors without exposing JSON to the user', () => {
  const error = JSON.stringify({
    name: 'AuthApiError',
    message: 'Invalid login credentials',
    status: 400,
    code: 'invalid_credentials'
  })

  assert.equal(getFriendlySupabaseErrorMessage(error), '邮箱或密码错误，请重新输入')
})

test('preserves an existing Chinese business error', () => {
  assert.equal(
    getFriendlySupabaseErrorMessage({ message: '该车辆已关联运单，暂时不能删除' }),
    '该车辆已关联运单，暂时不能删除'
  )
})

test('shows a safe business reason for a Postgres check violation', () => {
  assert.equal(
    getFriendlySupabaseErrorMessage({ code: '23514', message: '第 2 行单位换算关系不完整' }),
    '第 2 行单位换算关系不完整'
  )
  assert.equal(
    getFriendlySupabaseErrorMessage({ code: '23514', message: 'check constraint violation' }),
    '提交内容不符合业务规则，请检查后重试'
  )
})

test('hides unknown English implementation details behind the caller fallback', () => {
  assert.equal(
    getFriendlySupabaseErrorMessage(
      new Error('Unexpected internal provider response'),
      '登录失败，请稍后重试'
    ),
    '登录失败，请稍后重试'
  )
})

test('converts common network failures into actionable guidance', () => {
  assert.equal(
    getFriendlySupabaseErrorMessage(new TypeError('Failed to fetch')),
    '网络连接异常，请检查网络后重试'
  )
})

test('keeps the existing friendly messages for Supabase Auth error classes', () => {
  assert.equal(
    getFriendlySupabaseErrorMessage(new AuthApiError('User is banned', 400, 'user_banned')),
    '账号已被禁用，请联系管理员'
  )
  assert.equal(
    getFriendlySupabaseErrorMessage(new AuthRetryableFetchError('fetch failed', 503)),
    '认证服务连接失败，请检查网络后重试'
  )
  assert.equal(
    formatSupabaseAuthErrorMessage({ code: 'future_auth_error' }),
    '认证服务暂时不可用，请稍后重试'
  )
})

test('normalizes an Edge Function response body before creating the user message', async () => {
  const rawError = {
    name: 'FunctionsHttpError',
    message: 'Edge Function returned a non-2xx status code',
    context: new Response(
      JSON.stringify({ code: 'BUSINESS_BLOCKED', message: '当前记录不允许提交' }),
      {
        status: 409,
        headers: { 'content-type': 'application/json' }
      }
    )
  }

  const normalized = await normalizeSupabaseFunctionError(rawError)

  assert.equal(getFriendlySupabaseErrorMessage(normalized), '当前记录不允许提交')
})

test('creates one friendly Edge Function error with the response as its cause', async () => {
  const rawError = {
    context: new Response(
      JSON.stringify({ code: 'BUSINESS_BLOCKED', message: '当前记录不允许提交' }),
      {
        status: 409,
        headers: { 'content-type': 'application/json' }
      }
    )
  }

  const error = await createFriendlySupabaseFunctionError(rawError, '操作失败，请稍后重试')

  assert.equal(error.message, '当前记录不允许提交')
  assert.ok(error.cause)
})

test('does not expose long or technical Chinese provider details', () => {
  assert.equal(
    getFriendlySupabaseErrorMessage(
      { message: 'Supabase SQLSTATE 42P01：relation sys_user 不存在，select * from sys_user' },
      '数据加载失败，请稍后重试'
    ),
    '数据加载失败，请稍后重试'
  )
})

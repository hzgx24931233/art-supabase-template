import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })

Deno.serve(async (request: Request) => {
  try {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

    const body = await request.json().catch(() => null)
    const cleanupUnprovisioned = body?.cleanupUnprovisioned === true

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server not configured' }, 500)

    // 准入判断只依据已建立的登录会话：不接受只带邮箱的匿名查询，
    // 否则任何未认证调用者都能据此探测账号是否停用、是否分配角色。
    const authorization = request.headers.get('authorization')
    const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
    if (!accessToken) return json({ code: 'no_authorization', error: '请重新登录后再试' }, 401)

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    const { data: authData, error: authError } = await admin.auth.getUser(accessToken)
    if (authError || !authData.user) {
      return json({ code: 'bad_jwt', error: '登录状态已失效，请重新登录' }, 401)
    }

    const { data: user, error: userError } = await admin
      .from('sys_user')
      .select('status,deleted_at,user_roles')
      .eq('auth_user_id', authData.user.id)
      .maybeSingle()

    if (userError) return json({ code: 'access_check_failed', error: '账号准入检查失败' }, 500)
    if (!user) {
      if (cleanupUnprovisioned) {
        await admin.auth.admin.deleteUser(authData.user.id).catch(() => undefined)
      }
      return json(
        {
          allowed: false,
          code: 'user_not_provisioned',
          error: '当前身份尚未绑定系统账号，请先使用已有账号登录并完成绑定'
        },
        403
      )
    }
    if (user.deleted_at) {
      return json(
        { allowed: false, code: 'user_deactivated', error: '账号已注销，请联系管理员' },
        403
      )
    }
    if (['0', '2'].includes(String(user.status))) {
      return json({ allowed: false, code: 'user_banned', error: '账号已被停用，请联系管理员' }, 403)
    }

    const roleCodes = Array.isArray(user.user_roles)
      ? user.user_roles.filter((role): role is string => typeof role === 'string' && role.length > 0)
      : []
    const { data: roles, error: roleError } = roleCodes.length
      ? await admin
          .from('sys_role')
          .select('role_code,enabled')
          .eq('enabled', true)
          .in('role_code', roleCodes)
      : { data: [], error: null }

    if (!roleCodes.length) {
      return json(
        { allowed: false, code: 'role_not_assigned', error: '当前账号尚未分配角色，请联系管理员' },
        403
      )
    }

    if (roleError) return json({ code: 'access_check_failed', error: '角色准入检查失败' }, 500)

    const hasActiveRole = Boolean(roles?.length)
    if (!hasActiveRole) {
      return json(
        { allowed: false, code: 'role_inactive', error: '当前账号没有可用角色，请联系管理员' },
        403
      )
    }

    return json({ allowed: true })
  } catch (error) {
    console.error('check_user_status failed', error)
    return json({ code: 'unexpected_failure', error: '账号准入检查失败，请稍后重试' }, 500)
  }
})

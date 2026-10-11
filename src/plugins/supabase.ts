import { createClient } from '@supabase/supabase-js'
import { isSupabaseApi } from '@/config/api-provider'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'http://localhost'
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY || 'java-api-provider'

if (isSupabaseApi && (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_KEY)) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_KEY')
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // OAuth 与密码找回使用查询参数中的一次性授权码，避免 implicit token fragment
    // 和 Vue Hash 路由同时占用 `#`，造成回调后无法恢复 Supabase 会话。
    detectSessionInUrl: true,
    flowType: 'pkce'
  }
})

import fs from 'node:fs'

/**
 * 端到端测试账号必须由环境变量提供；登录页不再内置任何演示账号。
 * 冒烟与视觉用例还需要一个可用的 Supabase 项目（见 README 的 e2e 前置条件）。
 */
export function readDemoCredentials(): { email: string; password: string } {
  const email = process.env.E2E_EMAIL
  const password = process.env.E2E_PASSWORD

  if (!email || !password) {
    throw new Error('请通过 E2E_EMAIL 和 E2E_PASSWORD 提供端到端测试账号')
  }
  return { email, password }
}

/** 从 .env 的 Supabase 地址推导 Session Storage 键名，避免把项目 ref 写死在用例里。 */
export function readSupabaseAuthTokenStorageKey(): string {
  if (process.env.E2E_SUPABASE_AUTH_TOKEN_KEY) return process.env.E2E_SUPABASE_AUTH_TOKEN_KEY

  const envSource = fs.readFileSync('.env', 'utf8')
  const projectRef = envSource.match(/VITE_SUPABASE_URL=https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
  if (!projectRef) {
    throw new Error('无法从 .env 的 VITE_SUPABASE_URL 解析项目 ref，请先完成 Supabase 配置')
  }
  return `sb-${projectRef}-auth-token`
}

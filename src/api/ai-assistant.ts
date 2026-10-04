import { createFriendlySupabaseFunctionError } from '@/utils/supabase/error'

/**
 * Edge Function 调用的统一错误提示。项目助手、项目管理器等 AI 能力共用这里的实现，
 * 避免各调用点各自拼装错误文案。
 */
export async function normalizeFunctionError(error: unknown): Promise<Error> {
  return await createFriendlySupabaseFunctionError(error, 'AI 助手暂时不可用，请稍后重试')
}

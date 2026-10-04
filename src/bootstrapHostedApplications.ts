import type { Component } from 'vue'
import { registerApplicationViewModules } from '@/router/core/ComponentLoader'

type HostedRouteComponentModule = { default: Component }
type HostedIntegrationModule = {
  registerFmsRecognitionIntegration?: () => void
}

function registerHostedApplication(
  applicationCode: string,
  sourceRoot: string,
  sourceModules: Record<string, () => Promise<HostedRouteComponentModule>>
): void {
  registerApplicationViewModules(applicationCode, sourceRoot, sourceModules)
}

// 模块的识别器是可选集成。子仓未初始化时 glob 为空，平台仍可独立启动和构建。
const fmsIntegrationModules = import.meta.glob<HostedIntegrationModule>(
  '../modules/art-supabase-fms/src/integrations/index.ts',
  { eager: true }
)
Object.values(fmsIntegrationModules).forEach((module) => {
  module.registerFmsRecognitionIntegration?.()
})

/**
 * 新增业务模块时在这里注册视图目录，并同步
 * scripts/hosted-module-dependencies.ts、src/config/application.ts 与 tsconfig.json。
 */
registerHostedApplication(
  'fms',
  '../modules/art-supabase-fms/src/views',
  import.meta.glob<HostedRouteComponentModule>([
    '../modules/art-supabase-fms/src/views/**/*.vue',
    '!../modules/art-supabase-fms/src/views/**/modules/**/*.vue',
    '!../modules/art-supabase-fms/src/views/**/components/**/*.vue'
  ])
)

/**
 * Business modules are independent repositories with their own lockfiles. The platform host loads
 * any locally available module source directly, so these shared dependencies must resolve from the
 * host root. Keeping the policy in one module prevents duplicated Vue contexts, Pinia stores,
 * Element Plus injection state and transport clients in the integrated application.
 */
export const hostedModuleSharedDependencies = [
  '@element-plus/icons-vue',
  '@iconify/vue',
  '@supabase/supabase-js',
  '@vueuse/core',
  'dayjs',
  'element-plus',
  'lodash-es',
  'pinia',
  'vue',
  'vue-i18n',
  'vue-router'
] as const

/**
 * 业务模块的源码别名。新增模块时在这里登记别名与源码目录，并同步四处配置：
 * `tsconfig.json` 的 paths/include、`src/bootstrapHostedApplications.ts` 的视图注册、
 * `src/config/application.ts` 的应用档案、`.gitmodules` 的子仓声明。
 */
export const hostedApplicationSourceDirectories = {
  '@fms': 'modules/art-supabase-fms/src',
  '@hr': 'modules/art-supabase-hr/src'
} as const

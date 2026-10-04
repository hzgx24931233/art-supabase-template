import { AUTH_CHANNEL_PRESETS } from '@/utils/supabase/auth-channels'

/**
 * 站点配置的出厂默认值：仅在没有数据库配置时兜底，登录后可到「系统管理 → 网站配置」覆盖。
 * 派生项目请把这里的占位文案换成自己的品牌信息，并填入自己的 Turnstile 站点密钥。
 */
export const WEBSITE_CONFIG_DEFAULTS: Api.SystemManage.WebsiteConfigItem = {
  siteName: '程 管 家',
  siteShortName: '程 管 家',
  siteDescription: '企业级中后台程 管 家',
  logoUrl: '',
  faviconUrl: '',
  wordmarkImageEnabled: false,
  wordmarkLightUrl: '',
  wordmarkDarkUrl: '',
  watermarkEnabled: true,
  watermarkContentType: 'username',
  watermarkCustomText: '',
  loginTitle: '欢迎使用程 管 家',
  loginSubtitle: '面向企业应用的中后台平台，内置多租户、权限与业务流程能力',
  loginDescription: '面向企业应用的中后台平台，内置多租户、权限与业务流程能力',
  defaultLanguage: 'zh',
  captchaEnabled: false,
  captchaType: 'turnstile',
  turnstileSiteKey: '',
  turnstileSize: 'normal',
  turnstileTheme: 'auto',
  captchaMaxAttempts: 0,
  captchaLockMinutes: 10,
  registerEnabled: true,
  authChannels: AUTH_CHANNEL_PRESETS.map((channel) => ({ ...channel })),
  maintenanceEnabled: false,
  maintenanceMessage: '维护模式开启时建议填写，例如：系统今晚 23:00-24:00 升级维护',
  seoTitle: '程 管 家',
  seoKeywords: '后台管理系统,企业程 管 家,运营后台',
  seoDescription: '企业级中后台程 管 家',
  contactEmail: '',
  contactPhone: '',
  contactAddress: '',
  copyrightText: '© 程 管 家',
  icpRecord: '',
  policeRecord: '',
  enabled: true
}

export const createWebsiteConfigDefaults = (): Api.SystemManage.WebsiteConfigItem => ({
  ...WEBSITE_CONFIG_DEFAULTS,
  authChannels: WEBSITE_CONFIG_DEFAULTS.authChannels.map((channel) => ({ ...channel }))
})

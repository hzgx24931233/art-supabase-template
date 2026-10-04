/**
 * 快速入口配置
 * 包含：应用列表、快速链接等配置
 */
import type { FastEnterConfig } from '@/types/config'

const fastEnterConfig: FastEnterConfig = {
  // 显示条件（屏幕宽度）
  minWidth: 1200,
  // 应用列表
  applications: [
    {
      name: 'AI 运营中心',
      description: 'AI 调用、质量与反馈运营视图',
      icon: 'ri:sparkling-line',
      iconColor: '#377dff',
      enabled: true,
      order: 1,
      routeName: 'AiOperations'
    }
    // 需要外链入口时在这里补充，并先在 utils/constants/links.ts 配置地址：
    // { name: '官方文档', description: '使用指南与开发文档', icon: 'ri:bill-line', order: 2, link: WEB_LINKS.DOCS }
  ],
  // 快速链接
  quickLinks: [
    {
      name: '登录',
      enabled: true,
      order: 1,
      routeName: 'Login'
    },
    {
      name: '注册',
      enabled: true,
      order: 2,
      routeName: 'Register'
    },
    {
      name: '忘记密码',
      enabled: true,
      order: 3,
      routeName: 'ForgetPassword'
    },
    {
      name: '个人中心',
      enabled: true,
      order: 4,
      routeName: 'UserCenter'
    }
  ]
}

export default Object.freeze(fastEnterConfig)

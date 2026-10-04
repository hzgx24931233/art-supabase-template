import { AppRouteRecord } from '@/types/router'
import { SYSTEM_PARAM_DEFAULTS } from '@/config/system-param-defaults'

/**
 * 平台运营视图的静态路由。派生项目可以在这里换成自己的首页，
 * 或继续把页面按数据库菜单挂到 /dashboard 下。
 */
export const dashboardRoutes: AppRouteRecord = {
  name: 'Dashboard',
  path: '/dashboard',
  component: '/index/index',
  meta: {
    title: 'menus.dashboard.title',
    icon: 'ri:pie-chart-line',
    roles: [SYSTEM_PARAM_DEFAULTS.SUPER_ROLE_CODE, 'R_ADMIN']
  },
  children: [
    {
      path: 'ai-operations',
      name: 'AiOperations',
      component: '/dashboard/ai-operations',
      meta: {
        title: 'menus.dashboard.aiOperations',
        keepAlive: false,
        fixedTab: true
      }
    }
  ]
}

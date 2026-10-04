export interface UpgradeLog {
  version: string // 版本号
  title: string // 更新标题
  date: string // 更新日期
  detail?: string[] // 更新内容
  requireReLogin?: boolean // 是否需要重新登录
  remark?: string // 备注
}

/**
 * 版本升级日志：与 VITE_VERSION / StorageConfig.CURRENT_VERSION 配合，
 * 版本号变化时向在线用户推送本次变更内容，可选要求重新登录。
 *
 * 派生项目按自己的发版节奏维护这个列表，例如：
 *   { version: 'v1.1.0', title: '新增xx管理', date: '2026-01-01', detail: ['...'] }
 */
export const upgradeLogList: readonly UpgradeLog[] = []

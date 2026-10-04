interface RecordReferenceMeta {
  label: string
  routeName?: string
}

/**
 * 删除引用校验的展示元数据：把服务端返回的引用表映射为业务名称与可跳转的路由名。
 *
 * 这里只影响删除阻断弹窗的展示；引用是否成立始终以服务端校验为准。
 * 新增业务表时登记一条映射，例如：
 *   finance_invoice: { label: '发票', routeName: 'FinanceInvoiceManagement' }
 */
const recordReferences: Record<string, RecordReferenceMeta> = {}

export function getRecordReferenceMeta(table: string): RecordReferenceMeta {
  return recordReferences[table] ?? { label: '关联业务记录' }
}

const statuses: Record<string, string> = {
  draft: '草稿',
  design: '设计',
  changing: '变更中',
  review: '待审核',
  effective: '已生效',
  archived: '已归档',
  void: '已作废',
  enabled: '启用',
  disabled: '停用',
  submitted: '已提交',
  approved: '已审核',
  completed: '已完成',
  cancelled: '已取消',
  pending: '待处理',
  active: '有效',
  materials_ready: '物料已生成',
  bom_ready: 'BOM 已生成',
  generated: '工单已生成'
}

export function formatReferenceStatus(status?: string | null): string {
  return status ? (statuses[status] ?? (/\p{Script=Han}/u.test(status) ? status : '待核对')) : ''
}

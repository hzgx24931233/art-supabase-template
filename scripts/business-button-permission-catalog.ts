export interface BusinessButtonDefinition {
  action: string
  title: string
  code?: string
}

export interface BusinessMenuButtonCatalogEntry {
  menuName: string
  buttons: BusinessButtonDefinition[]
}

const button = (action: string, title: string, code?: string): BusinessButtonDefinition => ({
  action,
  title,
  code
})

const crud = (
  options: {
    view?: boolean
    import?: boolean
    export?: boolean
  } = {}
): BusinessButtonDefinition[] => [
  ...(options.view ? [button('View', '查看')] : []),
  button('Add', '新增'),
  button('Edit', '编辑'),
  button('Delete', '删除'),
  ...(options.import ? [button('Import', '导入')] : []),
  ...(options.export ? [button('Export', '导出')] : [])
]

export const businessButtonPermissionCatalog: BusinessMenuButtonCatalogEntry[] = [
  {
    menuName: 'FinanceExceptionCenter',
    buttons: [button('View', '查看财务异常', 'FinanceExceptionCenter:View')]
  },
  {
    menuName: 'FinanceAccountSet',
    buttons: [
      button('View', '查看会计期间'),
      button('Add', '新增账套'),
      button('Edit', '编辑账套'),
      button('Active', '启用账套'),
      button('Suspended', '停用账套'),
      button('Archived', '归档账套'),
      button('ManagePeriod', '维护会计期间')
    ]
  },
  {
    menuName: 'FinanceAccountingSubject',
    buttons: [
      button('Initialize', '初始化核算基础'),
      button('Add', '新增科目'),
      button('Edit', '编辑科目'),
      button('Toggle', '启停科目')
    ]
  },
  {
    menuName: 'FinanceAccountingAuxiliary',
    buttons: [
      button('AddType', '新增维度'),
      button('EditType', '编辑维度'),
      button('DeleteType', '删除维度'),
      button('Sync', '同步主数据'),
      button('Add', '新增核算项目'),
      button('Edit', '编辑核算项目'),
      button('Toggle', '启停核算项目')
    ]
  },
  {
    menuName: 'FinanceAccountingCurrency',
    buttons: [
      button('AddCurrency', '新增外币'),
      button('EditCurrency', '编辑币种'),
      button('Toggle', '启停币种'),
      button('Add', '新增汇率'),
      button('Edit', '编辑汇率')
    ]
  },
  {
    menuName: 'FinanceOpeningBalance',
    buttons: [
      button('Add', '录入余额'),
      button('Edit', '编辑余额'),
      button('Delete', '删除余额'),
      button('Confirm', '确认并锁定'),
      button('Reopen', '反确认')
    ]
  },
  {
    menuName: 'FinanceVoucherCenter',
    buttons: [
      button('View', '查看'),
      button('Add', '新增凭证'),
      button('Edit', '编辑凭证'),
      button('Export', '导出'),
      button('Submit', '提交'),
      button('Approve', '审核通过'),
      button('Reject', '驳回'),
      button('Post', '过账'),
      button('Void', '作废'),
      button('Reverse', '冲销')
    ]
  },
  { menuName: 'FinanceVoucherTemplate', buttons: crud() },
  {
    menuName: 'FinanceAutoPosting',
    buttons: [
      button('Add', '新增规则'),
      button('Edit', '编辑规则'),
      button('Delete', '删除规则'),
      button('ProcessPending', '批量处理待办'),
      button('Retry', '重试事件'),
      button('View', '查看事件')
    ]
  },
  {
    menuName: 'FinanceFinancialReports',
    buttons: [
      button('ViewConfig', '查看取数口径'),
      button('EditConfig', '维护取数口径'),
      button('Export', '导出')
    ]
  },
  {
    menuName: 'FinanceLedgerCenter',
    buttons: [button('View', '查看账簿'), button('Export', '导出')]
  },
  {
    menuName: 'FinanceFixedAsset',
    buttons: [
      button('Add', '新增资产'),
      button('Edit', '编辑资产'),
      button('Delete', '删除资产'),
      button('ManageCategory', '维护资产类别'),
      button('Activate', '确认转固'),
      button('Suspend', '暂停折旧'),
      button('Resume', '恢复使用'),
      button('Dispose', '资产处置'),
      button('Depreciation', '折旧管理')
    ]
  },
  {
    menuName: 'FinanceAssetPayable',
    buttons: [button('View', '查看'), button('Add', '下推生成'), button('Approve', '审核应付')]
  },
  {
    menuName: 'FinanceCommercialBill',
    buttons: [
      button('View', '查看'),
      button('Add', '新增票据'),
      button('Edit', '编辑票据'),
      button('Delete', '删除票据'),
      button('Receive', '确认收票'),
      button('Issue', '确认出票'),
      button('Endorse', '背书转让'),
      button('Discount', '票据贴现'),
      button('Settle', '到期结算'),
      button('Cancel', '取消票据')
    ]
  },
  {
    menuName: 'FinancePayroll',
    buttons: [
      button('View', '查看'),
      button('Add', '新增批次'),
      button('Edit', '编辑批次'),
      button('Calculate', '计算薪资'),
      button('Approve', '审批并计提'),
      button('Pay', '确认发放'),
      button('Cancel', '取消批次')
    ]
  },
  {
    menuName: 'FinanceTaxManagement',
    buttons: [
      button('View', '查看'),
      button('Add', '新增税务期间'),
      button('Edit', '编辑税务期间'),
      button('Calculate', '计算税额'),
      button('Review', '复核税额'),
      button('File', '确认申报'),
      button('Pay', '确认缴税'),
      button('Cancel', '取消期间')
    ]
  },
  {
    menuName: 'FinancePeriodClose',
    buttons: [
      button('View', '查看'),
      button('Add', '发起关账'),
      button('Carryforward', '生成损益结转凭证'),
      button('Recheck', '重新检查'),
      button('Close', '确认结账'),
      button('Cancel', '取消关账'),
      button('Reopen', '反结账')
    ]
  },
  { menuName: 'FinanceFundAccount', buttons: crud() },
  {
    menuName: 'FinanceCashForecast',
    buttons: [button('View', '查看资金预测')]
  },
  {
    menuName: 'FinanceReceivableAging',
    buttons: [button('View', '查看应收账龄')]
  },
  {
    menuName: 'FinanceFundTransfer',
    buttons: [
      button('View', '查看'),
      button('Add', '新增调拨'),
      button('Edit', '编辑调拨'),
      button('Delete', '删除调拨'),
      button('Submit', '提交审批'),
      button('Approve', '审批通过'),
      button('Reject', '驳回'),
      button('Execute', '执行入账'),
      button('Reverse', '冲销调拨')
    ]
  },
  {
    menuName: 'FinanceBankReconciliation',
    buttons: [
      button('Add', '导入银行流水'),
      button('View', '进入对账'),
      button('AutoMatch', '自动匹配'),
      button('Match', '手工匹配'),
      button('Unmatch', '取消匹配'),
      button('Ignore', '忽略流水'),
      button('Complete', '完成对账'),
      button('Void', '作废对账')
    ]
  },
  {
    menuName: 'FinanceCashTransaction',
    buttons: [
      button('Import', 'AI 批量导入流水'),
      button('Add', '登记客户收款'),
      button('CreatePayment', '发起承运商付款申请'),
      button('View', '查看'),
      button('Allocate', '继续核销'),
      button('Void', '作废收付款'),
      button('Export', '导出')
    ]
  },
  {
    menuName: 'FinanceInvoiceManagement',
    buttons: [
      button('View', '查看'),
      button('Add', '登记发票'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Submit', '提交复核'),
      button('Approve', '审核通过'),
      button('Reject', '驳回'),
      button('Void', '作废'),
      button('AiAudit', 'AI 合规审核'),
      button('Export', '导出')
    ]
  },
  {
    menuName: 'FinanceCarrierPaymentApplication',
    buttons: [
      button('View', '查看'),
      button('Add', '新建付款申请'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Submit', '提交审批'),
      button('ViewApproval', '查看审批'),
      button('Execute', '付款登记'),
      button('Cancel', '取消'),
      button('Export', '导出')
    ]
  },
  {
    menuName: 'FinanceWaybillCost',
    buttons: [
      button('View', '查看'),
      button('Add', '新增运单费用'),
      button('Edit', '编辑费用'),
      button('Delete', '删除费用'),
      button('Submit', '提交审核'),
      button('Convert', '转费用报销'),
      button('Pay', '出纳付款'),
      button('AiAudit', 'AI 费用审核'),
      button('OcrLogs', 'OCR 识别记录'),
      button('ApprovalHistory', '审批记录')
    ]
  },
  { menuName: 'FinanceExpenseItem', buttons: [...crud(), button('AddChild', '新增下级')] },
  {
    menuName: 'FinanceWaybillProfit',
    buttons: [button('AiProfitAnalysis', 'AI 利润诊断'), button('Export', '导出')]
  }
]
export const systemButtonPermissionCatalog: BusinessMenuButtonCatalogEntry[] = [
  { menuName: 'Organization', buttons: crud({ view: true }) },
  {
    menuName: 'Menu',
    buttons: [
      button('View', '查看菜单'),
      button('Add', '新增菜单'),
      button('Edit', '编辑菜单'),
      button('Delete', '删除菜单')
    ]
  },
  {
    menuName: 'Tenant',
    buttons: [button('Add', '新增租户'), button('Edit', '编辑租户'), button('Delete', '停用租户')]
  },
  {
    menuName: 'SystemParam',
    buttons: [
      button('Add', '新增参数', 'System:SystemParam:Add'),
      button('Edit', '编辑参数', 'System:SystemParam:Edit'),
      button('Delete', '删除参数', 'System:SystemParam:Delete')
    ]
  },
  {
    menuName: 'DocumentNumberRule',
    buttons: [
      button('Add', '新增编号规则', 'System:DocumentNumberRule:Add'),
      button('Edit', '编辑编号规则', 'System:DocumentNumberRule:Edit')
    ]
  },
  {
    menuName: 'User',
    buttons: [
      button('Add', '新增用户'),
      button('Edit', '编辑用户'),
      button('Delete', '注销用户'),
      button('AssignRole', '分配角色'),
      button('ResetPassword', '初始化密码')
    ]
  },
  {
    menuName: 'Role',
    buttons: [
      button('Add', '新增角色'),
      button('Edit', '编辑角色'),
      button('Delete', '删除角色'),
      button('AssignPermission', '配置菜单权限')
    ]
  },
  {
    menuName: 'WebsiteConfig',
    buttons: [button('Publish', '保存并发布配置'), button('GenerateWordmark', 'AI 生成品牌字图')]
  },
  {
    menuName: 'AiConfiguration',
    buttons: [button('Edit', '编辑 AI 配置')]
  },
  {
    menuName: 'AiPrompt',
    buttons: [
      button('Add', '新建 Prompt 版本'),
      button('Edit', '编辑 Prompt 草稿'),
      button('Publish', '发布或回滚 Prompt'),
      button('Clone', '复制 Prompt 版本'),
      button('Delete', '删除 Prompt 草稿')
    ]
  },
  {
    menuName: 'AiProjectPlanner',
    buttons: [button('ManageWorkflow', '推进建议状态')]
  },
  {
    menuName: 'GeofenceConfig',
    buttons: [button('Edit', '编辑电子围栏')]
  },
  {
    menuName: 'FieldPermission',
    buttons: [button('Manage', '维护字段权限')]
  },
  {
    menuName: 'NotificationReminder',
    buttons: [
      button('View', '查看提醒配置'),
      button('AddRule', '新增提醒规则'),
      button('EditRule', '编辑提醒规则'),
      button('DeleteRule', '删除提醒规则'),
      button('EditChannel', '配置通知渠道'),
      button('TestChannel', '测试通知渠道'),
      button('Dispatch', '立即执行提醒')
    ]
  }
].map((entry) => ({
  ...entry,
  buttons: entry.buttons.map((definition) => ({
    ...definition,
    code: definition.code ?? `System:${entry.menuName}:${definition.action}`
  }))
}))

export const managedButtonPermissionCatalog = [
  ...businessButtonPermissionCatalog,
  ...systemButtonPermissionCatalog
]

export const resolveCatalogPermissionCode = (
  menuName: string,
  definition: BusinessButtonDefinition
): string => definition.code ?? `${menuName}:${definition.action}`

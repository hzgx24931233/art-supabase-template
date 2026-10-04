import {
  financePaths,
  getExpenseReimbursementDetailPath,
  getWaybillCostDetailPath
} from '@/router/business-paths'

export interface WorkflowBusinessContract {
  businessType: string
  label: string
  menuName: string
  domain: 'finance' | 'master_data'
  riskLevel: 'high' | 'medium'
  owner: string
  fields: Api.Workflow.WorkflowContextField[]
  routePath: (businessId: string) => string
}

/**
 * 审批业务登记表：把工作流业务类型映射到菜单、上下文字段与业务详情页。
 * 新增业务时在这里登记一条契约，并同步 workflow-templates.ts 的流程模板。
 */
const contracts: Record<string, WorkflowBusinessContract> = {
  generic: {
    businessType: 'generic',
    label: '通用审批',
    menuName: 'WorkflowWorkbench',
    domain: 'master_data',
    riskLevel: 'medium',
    owner: '平台管理',
    fields: [],
    routePath: () => '/workflow/workbench'
  },
  tms_waybill_cost: {
    businessType: 'tms_waybill_cost',
    label: '运单费用',
    menuName: 'FinanceWaybillCost',
    domain: 'finance',
    riskLevel: 'high',
    owner: '运输财务',
    fields: [
      { key: 'amount', label: '费用金额', valueType: 'number', help: '本次费用金额' },
      { key: 'expenseItemName', label: '费用项目', valueType: 'text' },
      { key: 'payeeName', label: '收款方', valueType: 'text' },
      { key: 'waybillNo', label: '运单号', valueType: 'text' },
      { key: 'occurredOn', label: '发生日期', valueType: 'date' }
    ],
    routePath: getWaybillCostDetailPath
  },
  tms_expense_reimbursement: {
    businessType: 'tms_expense_reimbursement',
    label: '费用报销',
    menuName: 'FinanceExpenseReimbursement',
    domain: 'finance',
    riskLevel: 'high',
    owner: '财务审批',
    fields: [
      { key: 'totalAmount', label: '报销金额', valueType: 'number' },
      { key: 'itemCount', label: '费用笔数', valueType: 'number' },
      { key: 'reimbursementNo', label: '报销单号', valueType: 'text' },
      { key: 'payeeName', label: '收款人', valueType: 'text' },
      { key: 'paymentMethod', label: '付款方式', valueType: 'text' },
      { key: 'plannedPaymentDate', label: '计划付款日期', valueType: 'date' }
    ],
    routePath: getExpenseReimbursementDetailPath
  },
  tms_invoice: {
    businessType: 'tms_invoice',
    label: '发票',
    menuName: 'FinanceInvoiceManagement',
    domain: 'finance',
    riskLevel: 'high',
    owner: '财务',
    fields: [
      { key: 'totalAmount', label: '价税合计', valueType: 'number' },
      { key: 'direction', label: '发票方向', valueType: 'text' },
      { key: 'invoiceType', label: '发票类型', valueType: 'text' },
      { key: 'invoiceNo', label: '发票号码', valueType: 'text' },
      { key: 'taxRate', label: '税率', valueType: 'number' },
      { key: 'counterpartyName', label: '交易对方', valueType: 'text' }
    ],
    routePath: () => financePaths.invoiceManagement
  },
  tms_carrier_payment_application: {
    businessType: 'tms_carrier_payment_application',
    label: '承运商付款申请',
    menuName: 'FinanceCarrierPaymentApplication',
    domain: 'finance',
    riskLevel: 'high',
    owner: '应付结算',
    fields: [
      { key: 'amount', label: '申请付款金额', valueType: 'number' },
      { key: 'applicationNo', label: '付款申请单号', valueType: 'text' },
      { key: 'carrierId', label: '承运商', valueType: 'text', referenceType: 'business' },
      { key: 'carrierName', label: '承运商名称', valueType: 'text' },
      { key: 'plannedPaymentDate', label: '计划付款日期', valueType: 'date' },
      { key: 'statementCount', label: '对账单数量', valueType: 'number' }
    ],
    routePath: () => financePaths.paymentApplication
  },
  tms_carrier_statement: {
    businessType: 'tms_carrier_statement',
    label: '承运商结算',
    menuName: 'FinanceCarrierSettlement',
    domain: 'finance',
    riskLevel: 'high',
    owner: '应付结算',
    fields: [
      { key: 'statementAmount', label: '对账金额', valueType: 'number' },
      { key: 'costCount', label: '费用明细数', valueType: 'number' },
      { key: 'statementNo', label: '对账单号', valueType: 'text' },
      { key: 'carrierId', label: '承运商', valueType: 'text', referenceType: 'business' },
      { key: 'carrierName', label: '承运商名称', valueType: 'text' },
      { key: 'settledAmount', label: '已结算金额', valueType: 'number' }
    ],
    routePath: () => financePaths.carrierSettlement
  },
  tms_customer_statement: {
    businessType: 'tms_customer_statement',
    label: '客户结算',
    menuName: 'FinanceCustomerSettlement',
    domain: 'finance',
    riskLevel: 'high',
    owner: '应收结算',
    fields: [
      { key: 'statementAmount', label: '对账金额', valueType: 'number' },
      { key: 'waybillCount', label: '运单数量', valueType: 'number' },
      { key: 'statementNo', label: '对账单号', valueType: 'text' },
      { key: 'customerId', label: '客户', valueType: 'text', referenceType: 'business' },
      { key: 'customerName', label: '客户名称', valueType: 'text' },
      { key: 'settledAmount', label: '已结算金额', valueType: 'number' }
    ],
    routePath: () => financePaths.customerSettlement
  }
}

export const workflowBusinessContracts = Object.values(contracts).filter(
  (contract) => contract.businessType !== 'generic'
)

export function getWorkflowBusinessContract(businessType: string): WorkflowBusinessContract {
  return contracts[businessType] ?? contracts.generic
}

export function getWorkflowBusinessTypeLabel(businessType?: string | null): string {
  if (!businessType) return '未配置业务类型'
  return contracts[businessType]?.label ?? '未登记审批业务'
}

export function getWorkflowContextFields(
  businessType: string
): Api.Workflow.WorkflowContextField[] {
  return getWorkflowBusinessContract(businessType).fields
}

/**
 * 业务模块的稳定路由常量。
 *
 * 模块页面通过这里的常量互相跳转，路由名与数据库菜单注册保持一致；
 * 平台侧代码（如删除引用校验、识别任务回跳）也复用这些常量，避免硬编码路径。
 */
export const FMS_ROOT_PATH = '/fms'

export const financePaths = {
  workbench: `${FMS_ROOT_PATH}/workbench`,
  settlement: `${FMS_ROOT_PATH}/settlement`,
  customerSettlement: `${FMS_ROOT_PATH}/settlement/customer-settlement`,
  carrierSettlement: `${FMS_ROOT_PATH}/settlement/carrier-settlement`,
  paymentApplication: `${FMS_ROOT_PATH}/settlement/payment-application`,
  cashTransaction: `${FMS_ROOT_PATH}/settlement/cash-transaction`,
  invoiceManagement: `${FMS_ROOT_PATH}/settlement/invoice-management`,
  waybillCost: `${FMS_ROOT_PATH}/settlement/waybill-cost`,
  expenseReimbursement: `${FMS_ROOT_PATH}/settlement/expense-reimbursement`,
  waybillProfit: `${FMS_ROOT_PATH}/settlement/waybill-profit`,
  expenseItem: `${FMS_ROOT_PATH}/settlement/expense-item`,
  accounting: `${FMS_ROOT_PATH}/accounting`,
  accountSet: `${FMS_ROOT_PATH}/accounting/account-set`,
  accountingSubject: `${FMS_ROOT_PATH}/accounting/accounting-subject`,
  accountingAuxiliary: `${FMS_ROOT_PATH}/accounting/accounting-auxiliary`,
  accountingCurrency: `${FMS_ROOT_PATH}/accounting/accounting-currency`,
  openingBalance: `${FMS_ROOT_PATH}/accounting/opening-balance`,
  voucherCenter: `${FMS_ROOT_PATH}/accounting/voucher-center`,
  voucherTemplate: `${FMS_ROOT_PATH}/accounting/voucher-template`,
  autoPosting: `${FMS_ROOT_PATH}/accounting/auto-posting`,
  ledgerCenter: `${FMS_ROOT_PATH}/accounting/ledger-center`,
  financialReports: `${FMS_ROOT_PATH}/accounting/financial-reports`,
  commercialBill: `${FMS_ROOT_PATH}/specialized-accounting/commercial-bill`,
  fixedAsset: `${FMS_ROOT_PATH}/specialized-accounting/fixed-asset`,
  payroll: `${FMS_ROOT_PATH}/specialized-accounting/payroll`,
  taxManagement: `${FMS_ROOT_PATH}/specialized-accounting/tax-management`,
  periodClose: `${FMS_ROOT_PATH}/specialized-accounting/period-close`,
  treasury: `${FMS_ROOT_PATH}/treasury`,
  fundAccount: `${FMS_ROOT_PATH}/treasury/fund-account`,
  fundTransfer: `${FMS_ROOT_PATH}/treasury/fund-transfer`,
  bankReconciliation: `${FMS_ROOT_PATH}/treasury/bank-reconciliation`,
  fundJournal: `${FMS_ROOT_PATH}/treasury/fund-journal`
} as const

export const financeRouteNames = {
  root: 'FinanceCenter',
  workbench: 'FinanceWorkbench',
  accountSet: 'FinanceAccountSet',
  accountingSubject: 'FinanceAccountingSubject',
  accountingAuxiliary: 'FinanceAccountingAuxiliary',
  accountingCurrency: 'FinanceAccountingCurrency',
  openingBalance: 'FinanceOpeningBalance',
  voucherCenter: 'FinanceVoucherCenter',
  voucherTemplate: 'FinanceVoucherTemplate',
  autoPosting: 'FinanceAutoPosting',
  ledgerCenter: 'FinanceLedgerCenter',
  financialReports: 'FinanceFinancialReports',
  commercialBill: 'FinanceCommercialBill',
  fixedAsset: 'FinanceFixedAsset',
  payroll: 'FinancePayroll',
  taxManagement: 'FinanceTaxManagement',
  periodClose: 'FinancePeriodClose',
  fundAccount: 'FinanceFundAccount',
  fundTransfer: 'FinanceFundTransfer',
  bankReconciliation: 'FinanceBankReconciliation',
  fundJournal: 'FinanceFundJournal',
  customerSettlement: 'FinanceCustomerSettlement',
  carrierSettlement: 'FinanceCarrierSettlement',
  paymentApplication: 'FinanceCarrierPaymentApplication',
  cashTransaction: 'FinanceCashTransaction',
  invoiceManagement: 'FinanceInvoiceManagement',
  waybillCost: 'FinanceWaybillCost',
  expenseReimbursement: 'FinanceExpenseReimbursement',
  waybillProfit: 'FinanceWaybillProfit',
  expenseItem: 'FinanceExpenseItem',
  waybillCostDetail: 'FinanceWaybillCostDetail',
  expenseReimbursementDetail: 'FinanceExpenseReimbursementDetail'
} as const

export function getWaybillCostDetailPath(id: string): string {
  return `${financePaths.waybillCost}/detail/${id}`
}

export function getExpenseReimbursementDetailPath(id: string): string {
  return `${financePaths.expenseReimbursement}/detail/${id}`
}

import type { SupplyChainDocumentKind } from '@/api/mdm/supply-chain-document'

export interface SupplyChainDocumentPageConfig {
  kind: SupplyChainDocumentKind
  title: string
  eyebrow: string
  description: string
  icon: string
  /** 单据上的往来单位标签，采购类为供应商、销售类为客户。 */
  partyLabel: string
}

const pageConfigurations: Record<SupplyChainDocumentKind, SupplyChainDocumentPageConfig> = {
  'purchase-contract': {
    kind: 'purchase-contract',
    title: '采购合同',
    eyebrow: 'SUPPLY CHAIN DOCUMENTS',
    description: '登记采购合同类单据台账，单据编号由编号规则「采购合同编号」在保存时生成。',
    icon: 'ri:file-paper-2-line',
    partyLabel: '供应商'
  },
  'purchase-request': {
    kind: 'purchase-request',
    title: '采购申请',
    eyebrow: 'SUPPLY CHAIN DOCUMENTS',
    description: '登记采购申请类单据台账，单据编号由编号规则「采购申请单号」在保存时生成。',
    icon: 'ri:file-list-3-line',
    partyLabel: '供应商'
  },
  'purchase-order': {
    kind: 'purchase-order',
    title: '采购订单',
    eyebrow: 'SUPPLY CHAIN DOCUMENTS',
    description: '登记采购订单类单据台账，单据编号由编号规则「采购订单号」在保存时生成。',
    icon: 'ri:shopping-cart-2-line',
    partyLabel: '供应商'
  },
  'receipt-notice': {
    kind: 'receipt-notice',
    title: '收料通知单',
    eyebrow: 'SUPPLY CHAIN DOCUMENTS',
    description: '登记收料通知类单据台账，收料入库工作区按单据编号关联待处理明细。',
    icon: 'ri:inbox-archive-line',
    partyLabel: '供应商'
  },
  'sales-contract': {
    kind: 'sales-contract',
    title: '销售合同',
    eyebrow: 'SUPPLY CHAIN DOCUMENTS',
    description: '登记销售合同类单据台账，单据编号由编号规则「销售合同编号」在保存时生成。',
    icon: 'ri:file-paper-line',
    partyLabel: '客户'
  },
  'sales-order': {
    kind: 'sales-order',
    title: '销售订单',
    eyebrow: 'SUPPLY CHAIN DOCUMENTS',
    description: '登记销售订单类单据台账，单据编号由编号规则「销售订单号」在保存时生成。',
    icon: 'ri:file-list-2-line',
    partyLabel: '客户'
  },
  'shipping-notice': {
    kind: 'shipping-notice',
    title: '发货通知单',
    eyebrow: 'SUPPLY CHAIN DOCUMENTS',
    description: '登记发货通知类单据台账，单据编号由编号规则「发货通知单号」在保存时生成。',
    icon: 'ri:send-plane-2-line',
    partyLabel: '客户'
  }
}

const defaultKind: SupplyChainDocumentKind = 'purchase-contract'

/** 按路由末段解析单据页面配置，与 sys_menu 叶子菜单路径保持一致。 */
export function resolveSupplyChainDocumentPageConfig(path: string): SupplyChainDocumentPageConfig {
  const key = path.split('/').filter(Boolean).at(-1) as SupplyChainDocumentKind | undefined
  return (key && pageConfigurations[key]) || pageConfigurations[defaultKind]
}

import { useSupabase } from '@/hooks'
import { buildOrIlikeFilter } from '@/utils/supabase/search'

const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()

/** 供应链单据类别：页面按路由末段解析，与 sys_menu 中的叶子菜单路径一一对应。 */
export type SupplyChainDocumentKind =
  | 'purchase-contract'
  | 'purchase-request'
  | 'purchase-order'
  | 'receipt-notice'
  | 'sales-contract'
  | 'sales-order'
  | 'shipping-notice'

export type SupplyChainDocumentParty = 'supplier' | 'customer'

export interface SupplyChainDocumentDefinition {
  kind: SupplyChainDocumentKind
  /** 承载该类别单据的数据表。 */
  table: 'scm_purchase_document' | 'scm_sales_document'
  /** 表内 kind 列取值，服务端编号触发器按该值决定编号规则。 */
  documentKind: string
  /** 页面权限前缀，与服务端 RLS 的权限判定保持一致。 */
  routeName: string
  party: SupplyChainDocumentParty
  title: string
}

export interface SupplyChainDocumentRecord {
  id: string
  kind: string
  documentNo: string
  documentDate?: string | null
  deliveryDate?: string | null
  status: string
  projectId?: string | null
  supplierId?: string | null
  customerId?: string | null
  documentTypeId?: string | null
  currency?: string | null
  subtotal?: number | null
  taxAmount?: number | null
  totalAmount?: number | null
  remark?: string | null
  project?: SupplyChainDocumentPartyRef | null
  supplier?: SupplyChainDocumentPartyRef | null
  customer?: SupplyChainDocumentPartyRef | null
  documentType?: SupplyChainDocumentPartyRef | null
  createdAt?: string
  updatedAt?: string
}

/** 单据上的关联对象在查询里统一别名为 code / name，便于列表与格式化复用。 */
export interface SupplyChainDocumentPartyRef {
  id: string
  code: string
  name: string
}

export interface SupplyChainDocumentQuery {
  current: number
  size: number
  keyword?: string
}

export interface SupplyChainDocumentInput {
  documentDate?: string | null
  deliveryDate?: string | null
  projectId?: string | null
  supplierId?: string | null
  customerId?: string | null
  documentTypeId?: string | null
  currency?: string | null
  subtotal?: number | null
  taxAmount?: number | null
  totalAmount?: number | null
  remark?: string | null
}

export interface SupplyChainDocumentReference {
  id: string
  code: string
  name: string
}

export interface SupplyChainDocumentReferences {
  projects: SupplyChainDocumentReference[]
  suppliers: SupplyChainDocumentReference[]
  customers: SupplyChainDocumentReference[]
  documentTypes: SupplyChainDocumentReference[]
}

const definitions: Record<SupplyChainDocumentKind, SupplyChainDocumentDefinition> = {
  'purchase-contract': {
    kind: 'purchase-contract',
    table: 'scm_purchase_document',
    documentKind: 'purchase_contract',
    routeName: 'MdmPurchaseContract',
    party: 'supplier',
    title: '采购合同'
  },
  'purchase-request': {
    kind: 'purchase-request',
    table: 'scm_purchase_document',
    documentKind: 'purchase_request',
    routeName: 'MdmPurchaseRequest',
    party: 'supplier',
    title: '采购申请'
  },
  'purchase-order': {
    kind: 'purchase-order',
    table: 'scm_purchase_document',
    documentKind: 'purchase_order',
    routeName: 'MdmPurchaseOrder',
    party: 'supplier',
    title: '采购订单'
  },
  'receipt-notice': {
    kind: 'receipt-notice',
    table: 'scm_purchase_document',
    documentKind: 'receipt_notice',
    routeName: 'MdmReceiptNotice',
    party: 'supplier',
    title: '收料通知单'
  },
  'sales-contract': {
    kind: 'sales-contract',
    table: 'scm_sales_document',
    documentKind: 'sales_contract',
    routeName: 'MdmSalesContractDoc',
    party: 'customer',
    title: '销售合同'
  },
  'sales-order': {
    kind: 'sales-order',
    table: 'scm_sales_document',
    documentKind: 'sales_order',
    routeName: 'MdmSalesOrder',
    party: 'customer',
    title: '销售订单'
  },
  'shipping-notice': {
    kind: 'shipping-notice',
    table: 'scm_sales_document',
    documentKind: 'shipping_notice',
    routeName: 'MdmShippingNotice',
    party: 'customer',
    title: '发货通知单'
  }
}

export function resolveSupplyChainDocumentDefinition(
  kind: SupplyChainDocumentKind
): SupplyChainDocumentDefinition {
  return definitions[kind]
}

const documentSelect = `
  id, kind, document_no, document_date, delivery_date, status, project_id, supplier_id,
  document_type_id, subtotal, tax_amount, total_amount, remark, created_at, updated_at,
  project:mdm_project!scm_purchase_document_project_id_fkey(id, code:project_code, name:project_name),
  supplier:mdm_supplier!scm_purchase_document_supplier_id_fkey(
    id, code:supplier_code, name:supplier_name
  ),
  documentType:mdm_document_type!scm_purchase_document_document_type_id_fkey(
    id, code:document_type_code, name:document_type_name
  )
`

const salesDocumentSelect = `
  id, kind, document_no, document_date, delivery_date, status, project_id, customer_id,
  document_type_id, currency, subtotal, tax_amount, total_amount, remark, created_at, updated_at,
  project:mdm_project!scm_sales_document_project_id_fkey(id, code:project_code, name:project_name),
  customer:mdm_customer!scm_sales_document_customer_id_fkey(
    id, code:customer_code, name:customer_name
  ),
  documentType:mdm_document_type!scm_sales_document_document_type_id_fkey(
    id, code:document_type_code, name:document_type_name
  )
`

export async function fetchSupplyChainDocuments(
  kind: SupplyChainDocumentKind,
  params: SupplyChainDocumentQuery,
  options?: { signal?: AbortSignal }
) {
  const definition = resolveSupplyChainDocumentDefinition(kind)
  // 两类单据表列集不同，选择串以 string 传入，响应结构由 SupplyChainDocumentRecord 约束。
  const select: string =
    definition.table === 'scm_sales_document' ? salesDocumentSelect : documentSelect
  let query = supabase
    .from(definition.table)
    .select(select, { count: 'exact' })
    .eq('kind', definition.documentKind)
    .order('updated_at', { ascending: false })
    .range((params.current - 1) * params.size, params.current * params.size - 1)

  const keyword = params.keyword?.trim()
  if (keyword) query = query.or(buildOrIlikeFilter(['document_no', 'remark'], keyword))
  if (options?.signal) query = query.abortSignal(options.signal)

  return await responseHandle<SupplyChainDocumentRecord[]>(() => query, {
    breakReturn: true,
    showErrorMessage: true,
    errorMessage: '单据加载失败，请重试'
  })
}

export async function fetchSupplyChainDocumentReferences(): Promise<SupplyChainDocumentReferences> {
  const fetchOptions = <TRow>(table: string, select: string) =>
    responseHandle<TRow[]>(
      () =>
        supabase.from(table).select(select).order('updated_at', { ascending: false }).limit(500),
      { breakReturn: true, showErrorMessage: false }
    ).then((result) => result.data ?? [])

  const [projects, suppliers, customers, documentTypes] = await Promise.all([
    fetchOptions<SupplyChainDocumentReference>(
      'mdm_project',
      'id,code:project_code,name:project_name'
    ),
    fetchOptions<SupplyChainDocumentReference>(
      'mdm_supplier',
      'id,code:supplier_code,name:supplier_name'
    ),
    fetchOptions<SupplyChainDocumentReference>(
      'mdm_customer',
      'id,code:customer_code,name:customer_name'
    ),
    fetchOptions<SupplyChainDocumentReference>(
      'mdm_document_type',
      'id,code:document_type_code,name:document_type_name'
    )
  ])

  return { projects, suppliers, customers, documentTypes }
}

export async function saveSupplyChainDocument(
  kind: SupplyChainDocumentKind,
  payload: SupplyChainDocumentInput,
  id?: string
) {
  const definition = resolveSupplyChainDocumentDefinition(kind)
  const body = keysToSnakeDeep(payload) as Record<string, unknown>
  if (!id) body.kind = definition.documentKind

  return await responseHandle<Array<{ id: string }>>(
    () =>
      id
        ? supabase.from(definition.table).update(body, { count: 'exact' }).eq('id', id).select('id')
        : supabase.from(definition.table).insert(body, { count: 'exact' }).select('id'),
    {
      breakReturn: true,
      showErrorMessage: true,
      requireAffected: true,
      showMessage: true,
      message: '保存成功',
      errorMessage: '保存失败，请检查单据类型、往来单位与当前权限'
    }
  )
}

export async function deleteSupplyChainDocuments(kind: SupplyChainDocumentKind, ids: string[]) {
  const definition = resolveSupplyChainDocumentDefinition(kind)
  return await responseHandle(
    () => supabase.from(definition.table).delete({ count: 'exact' }).in('id', ids).select('id'),
    {
      breakReturn: true,
      showErrorMessage: true,
      requireAffected: true,
      showMessage: true,
      message: '删除成功',
      errorMessage: '删除失败，请先解除业务引用或确认当前权限'
    }
  )
}

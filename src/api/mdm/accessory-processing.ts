import { useSupabase } from '@/hooks'
import { createFriendlySupabaseFunctionError } from '@/utils/supabase/error'
import { uniqBy } from 'lodash-es'
import {
  type RecordDeleteDependency,
  type MasterDataDeleteDependencyDetail
} from '@/api/master-data-delete'

const { supabase, responseHandle } = useSupabase()
const bucket = 'mdm-accessory-processing'

/**
 * MES 工单联查是否可用。
 *
 * 加工件的「是否已转工单」只能从 MES 的 mes_work_order 反查，而 MES 未必与平台同库部署。
 * 首次联查失败且失败原因指向 mes_work_order 时降级为不带工单的查询，并记住结果，
 * 后续请求不再重复发起必然失败的那一次；页面据此隐藏 MES 相关列与动作。
 */
let mesWorkOrderTrackingAvailable = true

export const isMesWorkOrderTrackingAvailable = (): boolean => mesWorkOrderTrackingAvailable

const MES_WORK_ORDER_EMBED =
  'workOrders:mes_work_order!mes_work_order_accessory_item_tenant_fk(id,workOrderNo:work_order_no,deletedAt:deleted_at)'

const ACCESSORY_ITEM_FIELDS =
  'id,lineNo:line_no,rowNo:row_no,name,widthMm:width_mm,lengthM:length_m,quantity,materialColor:material_color,remark,sketch:sketch_bounds,sketchPath:sketch_path,imageUrls:image_urls,materialId:material_id,materialCode:material_code,specificationModel:specification_model,baseUnitId:base_unit_id,materialTypeId:material_type_id,materialSource:material_source,categoryId:category_id,codeRuleId:code_rule_id,baseUnit:mdm_unit_of_measure!accessory_item_unit_tenant_fk(unitName:unit_name),materialType:mdm_material_type!accessory_item_type_tenant_fk(typeName:type_name),category:mdm_material_category!accessory_item_category_tenant_fk(categoryName:category_name),codeRule:mdm_material_code_rule!accessory_item_code_rule_tenant_fk(ruleName:rule_name),material:mdm_material!mdm_accessory_processing_item_material_id_tenant_id_fkey(materialCode:material_code,description,imageUrls:image_urls,codeRuleId:code_rule_id)'

const buildAccessoryListSelect = (includeMesWorkOrders: boolean): string =>
  'id,tenantId:tenant_id,sourcePath:source_path,sourceName:source_name,drawingName:drawing_name,projectName:project_name,projectId:project_id,bomId:bom_id,customerId:customer_id,categoryId:category_id,status,confidence,warnings,createTime:create_time,project:mdm_project(projectName:project_name),items:mdm_accessory_processing_item(' +
  ACCESSORY_ITEM_FIELDS +
  (includeMesWorkOrders ? `,${MES_WORK_ORDER_EMBED}` : '') +
  '))'

/** 沿 cause 链收集错误文本，用于判断失败是否与 MES 工单联查有关 */
const collectErrorText = (error: unknown): string => {
  const parts: string[] = []
  let current: unknown = error
  for (let depth = 0; depth < 3 && current; depth += 1) {
    if (current instanceof Error) {
      parts.push(current.message)
    } else if (typeof current === 'object') {
      const record = current as Record<string, unknown>
      for (const key of ['code', 'message', 'details', 'hint']) {
        const value = record[key]
        if (typeof value === 'string') parts.push(value)
      }
    }
    current = (current as { cause?: unknown } | null)?.cause
  }
  return parts.join(' ')
}

const isMesWorkOrderUnavailable = (error: unknown): boolean =>
  collectErrorText(error).includes('mes_work_order')

export interface AccessorySketchBounds {
  page: number
  x: number
  y: number
  width: number
  height: number
}

export interface AccessoryProcessingItem {
  id?: string
  lineNo?: number
  rowNo: number
  name: string
  widthMm: number | null
  lengthM: number
  quantity: number
  materialColor: string
  remark: string
  sketch: AccessorySketchBounds | null
  sketchPath?: string | null
  imageUrls?: string[]
  materialId?: string | null
  materialCode?: string | null
  specificationModel?: string | null
  baseUnitId?: string | null
  materialTypeId?: string | null
  materialSource?: 'purchase' | 'self_made' | 'outsourcing'
  categoryId?: string | null
  codeRuleId?: string | null
  baseUnit?: { unitName: string } | null
  materialType?: { typeName: string } | null
  category?: { categoryName: string } | null
  codeRule?: { ruleName: string } | null
  material?: {
    materialCode: string
    description: string | null
    imageUrls: string[]
    codeRuleId: string | null
  } | null
  workOrders?: Array<{ id: string; workOrderNo: string; deletedAt?: string | null }>
}

export interface AccessoryProcessingList {
  id: string
  tenantId: string
  sourcePath: string | null
  sourceName: string
  projectName: string
  drawingName: string
  projectId: string | null
  bomId: string | null
  customerId: string | null
  categoryId: string | null
  status: 'draft' | 'materials_ready' | 'bom_ready' | 'generated'
  confidence: number
  warnings: string[]
  createTime: string
  project?: { projectName: string } | null
  items: AccessoryProcessingItem[]
}

export interface AccessoryOcrResponse {
  rawText: string
  projectName: string
  drawingName: string
  confidence: number
  warnings: string[]
  items: AccessoryProcessingItem[]
  artifactId: string
}

export interface AccessoryRecognitionRecord {
  id: string
  tenantId: string
  createTime: string
  projectName: string
  drawingName: string
  confidence: number
  warnings: string[]
  items: AccessoryProcessingItem[]
  imageUrls: string[]
}

interface RecognitionRow {
  id: string
  tenantId: string
  createTime: string
  proposedPayload: unknown
  metadata: unknown
  confidence: number | null
  warnings: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseRecognitionItem(value: unknown): AccessoryProcessingItem | null {
  if (!isRecord(value)) return null
  if (
    typeof value.rowNo !== 'number' ||
    typeof value.name !== 'string' ||
    typeof value.lengthM !== 'number' ||
    typeof value.quantity !== 'number'
  )
    return null
  const rawSketch = isRecord(value.sketch) ? value.sketch : null
  const sketch: AccessorySketchBounds | null =
    rawSketch &&
    typeof rawSketch.page === 'number' &&
    typeof rawSketch.x === 'number' &&
    typeof rawSketch.y === 'number' &&
    typeof rawSketch.width === 'number' &&
    typeof rawSketch.height === 'number'
      ? {
          page: rawSketch.page,
          x: rawSketch.x,
          y: rawSketch.y,
          width: rawSketch.width,
          height: rawSketch.height
        }
      : null
  return {
    rowNo: value.rowNo,
    name: value.name,
    widthMm: typeof value.widthMm === 'number' ? value.widthMm : null,
    lengthM: value.lengthM,
    quantity: value.quantity,
    materialColor: typeof value.materialColor === 'string' ? value.materialColor : '',
    remark: typeof value.remark === 'string' ? value.remark : '',
    sketch,
    sketchPath: null
  }
}

export async function fetchAccessoryRecognitions(
  tenantId: string | null,
  includeTenantRecords = false
): Promise<AccessoryRecognitionRecord[]> {
  if (includeTenantRecords && !tenantId) return []
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user)
    throw new Error('登录状态已失效，请重新登录', { cause: authError })
  let query = supabase
    .from('ai_artifact_review')
    .select(
      'id,tenantId:tenant_id,createTime:create_time,proposedPayload:proposed_payload,metadata,confidence,warnings'
    )
    .eq('feature', 'accessory_processing_ocr')
    .order('create_time', { ascending: false })
    .limit(50)
  if (!includeTenantRecords) query = query.eq('auth_user_id', authData.user.id)
  if (tenantId) query = query.eq('tenant_id', tenantId)
  const { data } = await responseHandle<RecognitionRow[]>(() => query, {
    breakReturn: true,
    showErrorMessage: false,
    errorMessage: '识别记录加载失败，请重试'
  })
  return (data ?? []).map((row) => {
    const payload = isRecord(row.proposedPayload) ? row.proposedPayload : {}
    const metadata = isRecord(row.metadata) ? row.metadata : {}
    return {
      id: row.id,
      tenantId: row.tenantId,
      createTime: row.createTime,
      projectName: typeof payload.projectName === 'string' ? payload.projectName : '',
      drawingName: typeof payload.drawingName === 'string' ? payload.drawingName : '',
      confidence: typeof row.confidence === 'number' ? row.confidence : 0,
      warnings: Array.isArray(row.warnings)
        ? row.warnings.filter((warning): warning is string => typeof warning === 'string')
        : [],
      items: Array.isArray(payload.items)
        ? payload.items
            .map(parseRecognitionItem)
            .filter((item): item is AccessoryProcessingItem => Boolean(item))
        : [],
      imageUrls: Array.isArray(metadata.imageUrls)
        ? metadata.imageUrls.filter((url): url is string => typeof url === 'string')
        : []
    }
  })
}

export async function restoreAccessoryRecognitionFiles(
  record: AccessoryRecognitionRecord
): Promise<{
  sourcePath: string
  sourceUrl: string
  sketchPaths: (string | null)[]
  sketchUrls: string[]
}> {
  const pageUrl = record.imageUrls[0]
  if (!pageUrl) throw new Error('该识别记录缺少原件索引，请重新上传清单')
  let pathname: string
  try {
    pathname = new URL(pageUrl).pathname
  } catch {
    throw new Error('该识别记录的原件索引无效，请重新上传清单')
  }
  const match =
    /^\/storage\/v1\/object\/sign\/mdm-accessory-processing\/([0-9a-f-]{36})\/([0-9a-f-]{36})\/page\//i.exec(
      pathname
    )
  if (!match || match[1].toLowerCase() !== record.tenantId.toLowerCase()) {
    throw new Error('该识别记录的原件索引无效，请重新上传清单')
  }
  const prefix = `${match[1]}/${match[2]}`
  const [sourceResult, sketchResult] = await Promise.all([
    supabase.storage.from(bucket).list(`${prefix}/source`, { limit: 100 }),
    supabase.storage.from(bucket).list(`${prefix}/sketch`, { limit: 100 })
  ])
  if (sourceResult.error || sketchResult.error) {
    throw new Error('识别原件或草图读取失败，请稍后重试', {
      cause: sourceResult.error || sketchResult.error
    })
  }
  const sourceFile = sourceResult.data?.find((file) => /^[0-9a-f-]{36}-/i.test(file.name))
  const sourcePath = sourceFile ? `${prefix}/source/${sourceFile.name}` : ''
  const sketchPaths = record.items.map((_, index) => {
    const sketchFile = sketchResult.data?.find((file) =>
      new RegExp(`^[0-9a-f-]{36}-sketch-${index + 1}\\.`, 'i').test(file.name)
    )
    return sketchFile ? `${prefix}/sketch/${sketchFile.name}` : null
  })
  const [sourceSigned, ...sketchSigned] = await Promise.all([
    sourcePath ? signAccessoryPath(sourcePath) : Promise.resolve(''),
    ...sketchPaths.map((path) => (path ? signAccessoryPath(path) : Promise.resolve('')))
  ])
  return { sourcePath, sourceUrl: sourceSigned, sketchPaths, sketchUrls: sketchSigned }
}

export interface AccessoryProjectOption {
  id: string
  projectName: string
  projectCode: string
  tenantId: string
  customerId: string | null
}

export interface AccessoryCustomerOption {
  id: string
  customerName: string
}

export async function uploadAccessoryFile(
  tenantId: string,
  groupId: string,
  kind: 'source' | 'page' | 'sketch',
  file: File | Blob,
  filename: string
): Promise<Api.DataCenter.Resources.ResourceListItem[]> {
  const safeName = filename.replace(/[^\w.-]/g, '_').slice(-100)
  const path = `${tenantId}/${groupId}/${kind}/${crypto.randomUUID()}-${safeName}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false
  })
  if (error) throw new Error('文件上传失败，请稍后重试', { cause: error })
  const url = await signAccessoryPath(path)
  return [{ tenantId, originName: filename, storagePath: path, mimeType: file.type, url }]
}

export async function signAccessoryPath(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 600)
  if (error || !data?.signedUrl)
    throw new Error('文件访问地址获取失败，请刷新后重试', { cause: error })
  return data.signedUrl
}

export async function recognizeAccessoryPages(imageUrls: string[]): Promise<AccessoryOcrResponse> {
  const { data, error } = await supabase.functions.invoke<unknown>('ai-accessory-processing-ocr', {
    body: { imageUrls }
  })
  if (error) throw await createFriendlySupabaseFunctionError(error, '加工清单识别失败，请稍后重试')
  if (!data || typeof data !== 'object' || !('items' in data) || !Array.isArray(data.items)) {
    throw new Error('识别结果格式不完整，请重新识别')
  }
  return data as AccessoryOcrResponse
}

export async function fetchAccessoryLists(
  tenantId: string | null,
  listId?: string
): Promise<AccessoryProcessingList[]> {
  const runQuery = async (includeMesWorkOrders: boolean) => {
    let query = supabase
      .from('mdm_accessory_processing_list')
      .select(buildAccessoryListSelect(includeMesWorkOrders))
      .order('create_time', { ascending: false })
      .limit(100)
    if (listId) query = query.eq('id', listId)
    if (tenantId) query = query.eq('tenant_id', tenantId)
    return responseHandle<AccessoryProcessingList[]>(() => query, {
      breakReturn: true,
      showErrorMessage: false,
      errorMessage: '配件加工清单加载失败，请重试'
    })
  }

  let result
  try {
    result = await runQuery(mesWorkOrderTrackingAvailable)
  } catch (cause) {
    // 未接入 MES：降级为不带工单联查，其它失败照旧抛出由页面展示
    if (!mesWorkOrderTrackingAvailable || !isMesWorkOrderUnavailable(cause)) throw cause
    mesWorkOrderTrackingAvailable = false
    result = await runQuery(false)
  }

  return (result.data ?? []).map((list) => ({
    ...list,
    items: [...(list.items ?? [])]
      .sort((a, b) => (a.lineNo ?? 0) - (b.lineNo ?? 0))
      .map((item) => ({
        ...item,
        workOrders: (item.workOrders ?? []).filter((order) => !order.deletedAt)
      }))
  }))
}

export async function fetchAccessoryProjects(tenantId: string): Promise<AccessoryProjectOption[]> {
  const { data } = await responseHandle<AccessoryProjectOption[]>(
    () =>
      supabase
        .from('mdm_project')
        .select(
          'id,tenantId:tenant_id,projectName:project_name,projectCode:project_code,customerId:customer_id'
        )
        .eq('tenant_id', tenantId)
        .order('project_name')
        .limit(300),
    { breakReturn: true, showErrorMessage: false, errorMessage: '项目列表加载失败，请重试' }
  )
  return data ?? []
}

export async function fetchAccessoryCustomers(
  tenantId: string
): Promise<AccessoryCustomerOption[]> {
  const { data } = await responseHandle<AccessoryCustomerOption[]>(
    () =>
      supabase
        .from('mdm_customer')
        .select('id,customerName:customer_name')
        .eq('tenant_id', tenantId)
        .eq('enabled', true)
        .order('customer_name')
        .limit(300),
    { breakReturn: true, showErrorMessage: false, errorMessage: '客户列表加载失败，请重试' }
  )
  return data ?? []
}

export async function saveAccessoryDraft(payload: {
  id?: string
  mode?: 'SaveDraft' | 'Add' | 'Edit' | 'Copy'
  sourceItemId?: string
  tenantId: string
  sourcePath: string | null
  sourceName: string
  projectName: string
  drawingName: string
  projectId: string | null
  customerId: string | null
  categoryId: string | null
  confidence: number
  warnings: string[]
  items: AccessoryProcessingItem[]
}): Promise<string> {
  const { data } = await responseHandle<string>(
    () => supabase.rpc('mdm_save_accessory_processing_draft', { p_payload: payload }),
    {
      breakReturn: true,
      showErrorMessage: false,
      errorMessage: '加工清单保存失败，请检查内容后重试'
    }
  )
  if (!data) throw new Error('加工清单保存失败，请重试')
  return data
}

export interface AccessoryMaterialGenerationConfig {
  projectId: string
  materialTypeId: string
  materialSource: 'purchase' | 'self_made' | 'outsourcing'
  categoryId: string
  codeRuleId: string
  imageUrlsByItem: Record<string, string[]>
}

export async function generateAccessoryMaterials(
  itemIds: string[],
  config: AccessoryMaterialGenerationConfig
): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('mdm_generate_accessory_materials', {
        p_item_ids: itemIds,
        p_config: config
      }),
    {
      breakReturn: true,
      showErrorMessage: false,
      errorMessage: '物料编码生成失败，请检查分类和编码策略后重试'
    }
  )
}

export async function deleteAccessoryItems(
  itemIds: string[],
  mode: 'items' | 'codes'
): Promise<{ processed: number }> {
  const { data } = await responseHandle<{ processed: number }>(
    () =>
      supabase.rpc('mdm_delete_accessory_processing_items', {
        p_item_ids: itemIds,
        p_mode: mode
      }),
    {
      breakReturn: true,
      showErrorMessage: false,
      errorMessage: '批量处理失败，请刷新清单后重试'
    }
  )
  if (!data) throw new Error('批量处理未返回结果，请刷新后重试')
  return data
}

export async function deleteLegacyAccessoryOrderDrafts(orderIds: string[]): Promise<number> {
  const { data } = await responseHandle<number>(
    () =>
      supabase.rpc('mdm_delete_legacy_accessory_order_drafts', {
        p_order_ids: orderIds
      }),
    {
      breakReturn: true,
      showErrorMessage: false,
      errorMessage: '旧版加工工单草稿删除失败，请重新检查关联后重试'
    }
  )
  if (typeof data !== 'number') throw new Error('旧版加工工单草稿删除未返回结果，请重试')
  return data
}

export interface AccessoryDeleteCandidate {
  id: string
  name: string
  materialId?: string | null
}

function toAccessoryDeleteDependency(
  row: RecordDeleteDependency,
  resourceId: string
): MasterDataDeleteDependencyDetail {
  return {
    resourceId,
    dependencyCode: row.sourceTable,
    recordId: row.recordId,
    targetId: row.targetId,
    recordNo:
      row.sourceTable === 'mdm_bom_item' && row.recordSummary
        ? row.recordSummary.split(' · ')[0]
        : row.recordNo,
    recordSummary: row.recordSummary,
    recordStatus: row.recordStatus,
    createdAt: row.createdAt ?? '',
    cleanupAllowed: row.sourceTable === 'mdm_accessory_work_order' && row.recordStatus === 'draft'
  }
}

/** The scoped RPC inspects inbound foreign keys with the delete permission and tenant boundary. */
export async function fetchAccessoryDeleteDependencies(
  candidates: AccessoryDeleteCandidate[],
  mode: 'items' | 'codes'
): Promise<MasterDataDeleteDependencyDetail[]> {
  if (!candidates.length) return []
  const { data, error } = await responseHandle<RecordDeleteDependency[]>(
    () =>
      supabase.rpc('mdm_get_accessory_delete_dependency_details', {
        p_item_ids: candidates.map((item) => item.id),
        p_mode: mode
      }),
    {
      breakReturn: true,
      showErrorMessage: false,
      errorMessage: '加工件关联检查失败，请重试'
    }
  )
  if (error || !data) throw new Error('加工件关联检查失败，请重试', { cause: error })
  return uniqBy(
    data.map((row) => toAccessoryDeleteDependency(row, row.resourceId)),
    (item) => `${item.resourceId}:${item.recordId}`
  )
}

export async function updateAccessoryItem(
  itemId: string,
  payload: AccessoryProcessingItem
): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('mdm_update_accessory_processing_item', {
        p_item_id: itemId,
        p_payload: payload
      }),
    {
      breakReturn: true,
      showErrorMessage: false,
      errorMessage: '加工件保存失败，请检查内容后重试'
    }
  )
}

export interface AccessoryWorkOrderConfig {
  projectId: string
  constructionNo: string
  plannedStartDate: string
  plannedEndDate: string
}

export async function convertAccessoryWorkOrders(
  itemIds: string[],
  config: AccessoryWorkOrderConfig
): Promise<{ created: number; skipped: number }> {
  const { data } = await responseHandle<{ created: number; skipped: number }>(
    () =>
      supabase.rpc('mdm_convert_accessory_work_orders', {
        p_item_ids: itemIds,
        p_config: config
      }),
    {
      breakReturn: true,
      showErrorMessage: false,
      errorMessage: '生产工单生成失败，请检查项目、日期和工单类型后重试'
    }
  )
  return data ?? { created: 0, skipped: 0 }
}

export type AccessoryGenerationStage = 'materials' | 'bom' | 'orders' | 'all'

export async function setAccessoryProjectAssignment(payload: {
  listId: string
  projectId: string | null
  customerId: string | null
  projectName: string
}): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('mdm_set_accessory_processing_project', {
        p_list_id: payload.listId,
        p_project_id: payload.projectId || null,
        p_customer_id: payload.customerId || null,
        p_project_name: payload.projectName
      }),
    {
      breakReturn: true,
      showErrorMessage: false,
      errorMessage: '项目归属保存失败，请检查项目与客户'
    }
  )
}

export async function generateAccessoryStage(
  id: string,
  stage: AccessoryGenerationStage
): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('mdm_generate_accessory_processing_stage', {
        p_list_id: id,
        p_stage: stage
      }),
    {
      breakReturn: true,
      showErrorMessage: false,
      errorMessage: '生成失败，请检查项目、草图和物料信息'
    }
  )
}

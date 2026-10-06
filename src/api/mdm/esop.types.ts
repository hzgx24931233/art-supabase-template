export type EsopStatus = 'enabled' | 'disabled'

export interface EsopAudit {
  id: string
  tenantId: string
  createBy?: string | null
  createTime: string
  updateBy?: string | null
  updateTime: string
}

export interface EsopCategory extends EsopAudit {
  parentId?: string | null
  categoryCode: string
  categoryName: string
  description?: string | null
  status: EsopStatus
  sort: number
  children?: EsopCategory[]
}

export interface EsopMaterialOption {
  id: string
  tenantId: string
  materialCode: string
  materialName: string
  specificationModel?: string | null
}

export interface EsopRouteOption {
  id: string
  tenantId: string
  name: string
  materialId: string
  materialCode: string
  materialName: string
}

export interface EsopBinding {
  id: string
  targetType: 'material' | 'process_route'
  materialId?: string | null
  processRouteId?: string | null
  material?: EsopMaterialOption | null
  processRoute?: {
    id: string
    name: string
    materialId: string
    material?: EsopMaterialOption | null
  } | null
}

export interface EsopDocument extends EsopAudit {
  categoryId: string
  category?: Pick<EsopCategory, 'id' | 'categoryCode' | 'categoryName'> | null
  documentCode: string
  documentName: string
  versionNo: string
  attachmentUrl: string
  attachmentName: string
  attachmentType?: string | null
  attachmentSize?: number | null
  description?: string | null
  effectiveDate?: string | null
  status: EsopStatus
  uploadTime: string
  bindings: EsopBinding[]
}

export interface EsopDocumentQuery {
  current: number
  size: number
  tenantId: string
  keyword?: string
  status?: EsopStatus
  categoryIds?: string[]
  uploadDateRange?: [string, string]
}

export interface EsopCategoryInput {
  id?: string
  tenantId: string
  parentId?: string | null
  categoryCode: string
  categoryName: string
  description?: string | null
  status: EsopStatus
  sort: number
}

export interface EsopDocumentInput {
  id?: string
  tenantId: string
  categoryId: string
  documentCode: string
  documentName: string
  versionNo: string
  attachmentUrl: string
  attachmentName: string
  attachmentType?: string | null
  attachmentSize?: number | null
  description?: string | null
  effectiveDate?: string | null
  status: EsopStatus
  materialIds: string[]
  routeIds: string[]
}

export interface EsopReferenceOptions {
  materials: EsopMaterialOption[]
  routes: EsopRouteOption[]
}

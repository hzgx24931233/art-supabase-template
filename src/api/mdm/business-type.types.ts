import type { AppRouteRecord } from '@/types/router'

export type BusinessTypeTagStyle = '' | 'primary' | 'success' | 'info' | 'warning' | 'danger'

export interface BusinessTypeDocumentReference {
  id: string
  menuId: string
  documentTypeCode: string
  documentTypeName: string
  enabled: boolean
}

export interface BusinessTypeSourceReference {
  id: string
  businessTypeCode: string
  businessTypeName: string
  enabled: boolean
}

export interface BusinessTypeRecord {
  id: string
  documentTypeId: string
  businessTypeCode: string
  businessTypeName: string
  isDefault: boolean
  sourceBusinessTypeId?: string | null
  inventoryDirection?: string | null
  ownerType?: string | null
  inventoryAccounting: boolean
  remark: string
  sortOrder: number
  textColor: string
  tagStyle: BusinessTypeTagStyle
  enabled: boolean
  createBy?: string | null
  createTime?: string
  updateBy?: string | null
  updateTime?: string
  documentType?: BusinessTypeDocumentReference | null
  sourceBusinessType?: BusinessTypeSourceReference | null
}

export interface BusinessTypeWriteInput {
  documentTypeId: string
  businessTypeCode: string
  businessTypeName: string
  isDefault: boolean
  sourceBusinessTypeId: string | null
  inventoryDirection: string | null
  ownerType: string | null
  inventoryAccounting: boolean
  remark: string
  sortOrder: number
  textColor: string
  tagStyle: BusinessTypeTagStyle
  enabled: boolean
}

export type BusinessTypeUpdateInput = BusinessTypeWriteInput

export interface BusinessTypeQuery {
  current: number
  size: number
  keyword?: string
  menuIds?: string[]
  documentTypeId?: string
  enabled?: boolean
  isDefault?: boolean
}

export interface BusinessTypeStats {
  total: number
  enabled: number
  defaults: number
  menuCount: number
  documentTypeCount: number
  menuCounts: Record<string, number>
  lastUpdateTime?: string
}

export interface BusinessTypeMenuNode extends AppRouteRecord {
  id: string
  parentId?: string | null
  type: 'folder' | 'menu'
  component?: string
  appCode?: string
  children?: BusinessTypeMenuNode[]
}

export interface BusinessTypeOptionQuery {
  menuIds?: string[]
  documentTypeId?: string
  excludeId?: string
  enabled?: boolean
}

export interface BusinessTypeExportQuery extends Omit<BusinessTypeQuery, 'current' | 'size'> {
  limit?: number
}

export interface BusinessTypeExportRecord extends BusinessTypeRecord {
  menuId?: string | null
  documentTypeCode?: string | null
  documentTypeName?: string | null
  sourceBusinessTypeCode?: string | null
  sourceBusinessTypeName?: string | null
}

import type { AppRouteRecord } from '@/types/router'
import type { WorkOrderExtensionField } from '@/types/business/work-order-extension'

export type DocumentTypeTagStyle = '' | 'primary' | 'success' | 'info' | 'warning' | 'danger'

export interface DocumentTypeRecord {
  id: string
  menuId: string
  documentTypeCode: string
  documentTypeName: string
  isDefault: boolean
  remark: string
  sortOrder: number
  textColor: string
  tagStyle: DocumentTypeTagStyle
  enabled: boolean
  extensionFields: WorkOrderExtensionField[]
  packingEnabled: boolean
  packingThicknessFieldKey: string | null
  allowedIssueWarehouseTypes: string[]
  createBy?: string | null
  createTime?: string
  updateBy?: string | null
  updateTime?: string
}

export interface DocumentTypeWriteInput {
  menuId: string
  documentTypeCode: string
  documentTypeName: string
  isDefault: boolean
  remark: string
  sortOrder: number
  textColor: string
  tagStyle: DocumentTypeTagStyle
  enabled: boolean
  extensionFields: WorkOrderExtensionField[]
  packingEnabled: boolean
  packingThicknessFieldKey: string | null
  allowedIssueWarehouseTypes: string[]
}

export type DocumentTypeUpdateInput = DocumentTypeWriteInput

export interface DocumentTypeQuery {
  current: number
  size: number
  keyword?: string
  menuIds?: string[]
  enabled?: boolean
  isDefault?: boolean
}

export interface DocumentTypeStats {
  total: number
  enabled: number
  defaults: number
  menuCount: number
  menuCounts: Record<string, number>
  lastUpdateTime?: string
}

export interface DocumentTypeMenuNode extends AppRouteRecord {
  id: string
  parentId?: string | null
  type: 'folder' | 'menu'
  component?: string
  appCode?: string
  children?: DocumentTypeMenuNode[]
}

export interface DocumentTypeExportQuery {
  menuIds?: string[]
  keyword?: string
  enabled?: boolean
  isDefault?: boolean
  limit?: number
}

export type DocumentTypeExportRecord = Omit<
  DocumentTypeRecord,
  'allowedIssueWarehouseTypes' | 'extensionFields'
>

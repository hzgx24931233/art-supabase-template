import type { MaterialArchive, UnitOfMeasure } from './material.types'

export type BomPurpose = 'production' | 'design' | 'process' | 'sales' | 'spare_part'
export type BomStatus = 'design' | 'review' | 'effective' | 'changing' | 'archived' | 'void'

export type BomMaterialReference = Pick<
  MaterialArchive,
  | 'id'
  | 'tenantId'
  | 'materialCode'
  | 'materialName'
  | 'specificationModel'
  | 'drawingNo'
  | 'description'
  | 'materialSource'
  | 'specialPurchaseType'
  | 'baseUnitId'
  | 'auxiliaryUnitId'
  | 'auxiliaryUnit2Id'
  | 'unitConversions'
  | 'productionUnitId'
  | 'defaultWarehouseId'
  | 'materialIssueMethod'
  | 'backflushMethod'
  | 'overIssueControlMethod'
  | 'baseUnit'
  | 'productionUnit'
  | 'defaultWarehouse'
>

export interface BomGroup {
  id: string
  tenantId: string
  code: string
  name: string
  parentId?: string | null
  sort: number
  enabled: boolean
  remark?: string | null
  children?: BomGroup[]
}

export interface BomGroupInput {
  id?: string
  tenantId: string
  parentId?: string | null
  code: string
  name: string
  sort: number
  enabled: boolean
  remark?: string | null
}

export interface BomItem {
  id: string
  tenantId: string
  bomId: string
  componentMaterialId: string
  componentTypeId?: string | null
  componentType?: {
    id: string
    componentTypeCode: string
    componentTypeName: string
    tagStyle: string
    textColor: string
  } | null
  component?: BomMaterialReference | null
  sequenceNo: number
  quantity: number
  unitId: string
  unit?: Pick<UnitOfMeasure, 'id' | 'unitCode' | 'unitName' | 'symbol'> | null
  scrapRate: number
  mrpEnabled: boolean
  defaultIssueWarehouseId?: string | null
  defaultIssueWarehouse?: { id: string; warehouseCode: string; warehouseName: string } | null
  issueMethod: string
  backflushMethod: string
  overIssueControlMethod?: string | null
  projectText?: string | null
  positionNo?: string | null
  processRouteStepId?: string | null
  processRouteStep?: BomProcessRouteStepOption | null
  operationName?: string | null
  effectiveFrom?: string | null
  effectiveTo?: string | null
  remark?: string | null
}

export interface BomRecord {
  id: string
  tenantId: string
  bomCode: string
  projectId?: string | null
  project?: { id: string; projectCode: string; projectName: string } | null
  sourceQuotationId?: string | null
  materialId: string
  material?: BomMaterialReference | null
  processRouteId?: string | null
  processRoute?: BomProcessRouteOption | null
  groupId?: string | null
  group?: Pick<BomGroup, 'id' | 'code' | 'name'> | null
  version: string
  purpose: BomPurpose
  status: BomStatus
  baseQuantity: number
  baseUnitId: string
  baseUnit?: Pick<UnitOfMeasure, 'id' | 'unitCode' | 'unitName' | 'symbol'> | null
  effectiveFrom?: string | null
  effectiveTo?: string | null
  description?: string | null
  sort: number
  createBy?: string | null
  createTime?: string
  updateBy?: string | null
  updateTime?: string
  items: BomItem[]
}

export interface BomQuery {
  current: number
  size: number
  tenantId?: string | null
  id?: string
  keyword?: string
  materialId?: string
  groupIds?: string[]
  purpose?: BomPurpose
  status?: BomStatus
}

export interface BomInput {
  id?: string
  tenantId: string
  bomCode?: string
  materialId: string
  processRouteId?: string | null
  groupId?: string | null
  version: string
  purpose: BomPurpose
  baseQuantity: number
  baseUnitId: string
  effectiveFrom?: string | null
  effectiveTo?: string | null
  description?: string | null
  sort: number
  items: Array<
    Pick<
      BomItem,
      | 'componentMaterialId'
      | 'componentTypeId'
      | 'sequenceNo'
      | 'quantity'
      | 'unitId'
      | 'scrapRate'
      | 'mrpEnabled'
      | 'defaultIssueWarehouseId'
      | 'issueMethod'
      | 'backflushMethod'
      | 'overIssueControlMethod'
      | 'projectText'
      | 'positionNo'
      | 'processRouteStepId'
      | 'operationName'
      | 'effectiveFrom'
      | 'effectiveTo'
      | 'remark'
    >
  >
}

export interface BomProcessRouteOption {
  id: string
  tenantId: string
  materialId: string
  code: string
  name: string
  version: string
  isDefault: boolean
  enabled: boolean
}

export interface BomProcessRouteStepOption {
  id: string
  tenantId: string
  routeId: string
  code: string
  name: string
  sort: number
  workCenterId?: string | null
  workCenterIds?: string[]
  workCenter?: {
    id: string
    code: string
    name: string
  } | null
  sequence?: {
    id: string
    sequenceNo: number
    sequenceType: string
  } | null
}

export interface BomStructureNode {
  nodeId: string
  parentNodeId?: string | null
  bomId: string
  bomCode: string
  bomVersion: string
  bomItemId?: string | null
  componentTypeId?: string | null
  componentTypeName?: string | null
  materialId: string
  materialCode: string
  materialName: string
  specificationModel?: string | null
  drawingNo?: string | null
  materialSource?: string | null
  specialPurchaseType?: BomMaterialReference['specialPurchaseType']
  isVirtual: boolean
  quantity: number
  componentQuantity?: number | null
  unitId?: string | null
  unitCode?: string | null
  unitName: string
  depth: number
  path: string[]
  hasChildren: boolean
  sequenceNo?: number | null
  scrapRate?: number | null
  mrpEnabled?: boolean | null
  defaultIssueWarehouseId?: string | null
  defaultIssueWarehouseCode?: string | null
  defaultIssueWarehouseName?: string | null
  issueMethod?: string | null
  backflushMethod?: string | null
  overIssueControlMethod?: string | null
  projectText?: string | null
  positionNo?: string | null
  processRouteStepId?: string | null
  processSequenceNo?: number | null
  processSequenceType?: string | null
  processRouteStepCode?: string | null
  processRouteStepName?: string | null
  workCenterIds?: string[] | null
  workCenterCode?: string | null
  workCenterName?: string | null
  operationName?: string | null
  effectiveFrom?: string | null
  effectiveTo?: string | null
  remark?: string | null
  children?: BomStructureNode[]
}

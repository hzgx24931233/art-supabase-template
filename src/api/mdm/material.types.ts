export type MdmMaterialStatus = 'enabled' | 'disabled'
export type MaterialSpecialPurchaseType = 'virtual_part' | 'outsourced_part'

export interface MaterialReferenceBase {
  id: string
  tenantId: string
  status: MdmMaterialStatus
  sort: number
  remark?: string | null
  createBy?: string | null
  createTime?: string
  updateBy?: string | null
  updateTime?: string
}

export interface UnitOfMeasure extends MaterialReferenceBase {
  unitCode: string
  unitName: string
  symbol?: string | null
  dimension: string
  decimalPlaces: number
  isBaseUnit: boolean
  baseUnitId?: string | null
  conversionFactor: number
}

export interface MaterialType extends MaterialReferenceBase {
  typeCode: string
  typeName: string
  codePrefix: string
  textColor: string
  tagType: Api.Common.TagType
}

export interface MaterialAttributeDefinition {
  key: string
  name: string
  values: string[]
  required: boolean
  enabled: boolean
}

export interface MaterialAttributeGroup extends MaterialReferenceBase {
  groupCode: string
  groupName: string
  attributes: MaterialAttributeDefinition[]
  textColor: string
  tagType: Api.Common.TagType
}

export type MaterialCodeSegmentSource = 'fixed' | 'material_type' | 'material_category' | 'date'

export interface MaterialCodeSegment {
  source: MaterialCodeSegmentSource
  value?: string
  format?: 'YYYY' | 'YYYYMM' | 'YYYYMMDD'
}

export interface MaterialCodeRule extends MaterialReferenceBase {
  ruleCode: string
  ruleName: string
  strategy: 'material_type' | 'material_category'
  prefix: string
  segments: MaterialCodeSegment[]
  sequenceDigits: number
  codeLength: number
  nextValue: number
  exampleCode: string
}

export type MaterialReferenceRecord =
  UnitOfMeasure | MaterialType | MaterialAttributeGroup | MaterialCodeRule

export type MaterialReferenceKind =
  'unit-of-measure' | 'material-type' | 'attribute-group' | 'code-rule'

export interface MaterialReferenceQuery {
  current: number
  size: number
  tenantId: string
  keyword?: string
  status?: MdmMaterialStatus
}

export interface MaterialCategory extends Omit<MaterialReferenceBase, 'remark'> {
  parentId?: string | null
  categoryCode: string
  codePrefix: string
  categoryName: string
  materialTypeId?: string | null
  materialType?: Pick<MaterialType, 'id' | 'typeCode' | 'typeName'> | null
  printName?: string | null
  compositionColumns: string[]
  compositionSeparator: string
  overPurchasePercent: number
  overPurchaseQuantity: number
  maxReceiptQuantity?: number | null
  autoReceive: boolean
  purchaserId?: string | null
  purchaseOrganization?: string | null
  requiresInspection: boolean
  createDeliveryNotice: boolean
  defaultSiteId?: string | null
  overReceiptPercent: number
  overReceiptQuantity: number
  batchManaged: boolean
  valuationMethod: string
  description?: string | null
  children?: MaterialCategory[]
}

export type MaterialCategoryInput = Omit<
  MaterialCategory,
  'id' | 'materialType' | 'children' | 'createBy' | 'createTime' | 'updateBy' | 'updateTime'
>

export interface MaterialArchive extends Omit<MaterialReferenceBase, 'remark'> {
  categoryId: string
  category?: Pick<MaterialCategory, 'id' | 'categoryCode' | 'categoryName'> | null
  materialCode: string
  codeRuleId?: string | null
  oldMaterialCode?: string | null
  materialName: string
  specificationModel?: string | null
  drawingNo?: string | null
  basicUnit: string
  materialType: string
  materialSource: 'purchase' | 'self_made' | 'outsourcing'
  specialPurchaseType?: MaterialSpecialPurchaseType | null
  materialTypeId?: string | null
  materialTypeRef?: Pick<MaterialType, 'id' | 'typeCode' | 'typeName'> | null
  baseUnitId?: string | null
  baseUnit?: Pick<UnitOfMeasure, 'id' | 'unitCode' | 'unitName' | 'symbol'> | null
  productionUnit?: Pick<UnitOfMeasure, 'id' | 'unitCode' | 'unitName' | 'symbol'> | null
  auxiliaryUnitId?: string | null
  auxiliaryUnit?: Pick<UnitOfMeasure, 'id' | 'unitCode' | 'unitName' | 'symbol'> | null
  auxiliaryUnit2Id?: string | null
  auxiliaryUnit2?: Pick<UnitOfMeasure, 'id' | 'unitCode' | 'unitName' | 'symbol'> | null
  attributeGroupId?: string | null
  attributeGroup?: Pick<MaterialAttributeGroup, 'id' | 'groupCode' | 'groupName'> | null
  attributeValues: Record<string, string>
  materialGroupId?: string | null
  materialGroup?: { id: string; groupCode: string; groupName: string } | null
  brand?: string | null
  manufacturer?: string | null
  materialComposition?: string | null
  placeOfOrigin?: string | null
  color?: string | null
  imageUrls: string[]
  description?: string | null
  grossWeight?: number | null
  netWeight?: number | null
  length?: number | null
  width?: number | null
  thickness?: number | null
  area?: number | null
  volume?: number | null
  effectiveDate?: string | null
  expirationDate?: string | null
  purchaseUnitId?: string | null
  purchaserId?: string | null
  plannerId?: string | null
  purchaseOrganization?: string | null
  defaultSupplierId?: string | null
  overReceiptPercent?: number | null
  underReceiptPercent?: number | null
  overPurchaseQuantity?: number | null
  purchaseFixedLeadDays?: number | null
  purchasePreprocessDays?: number | null
  purchasePostprocessDays?: number | null
  inspectionLeadDays?: number | null
  batchPolicy?: string | null
  minBatch?: number | null
  maxBatch?: number | null
  salesUnitId?: string | null
  salespersonId?: string | null
  salesOrganization?: string | null
  shippingLeadDays?: number | null
  shippingDelayDays?: number | null
  overDeliveryPercent?: number | null
  underDeliveryPercent?: number | null
  inventoryUnitId?: string | null
  storageLocationId?: string | null
  custodianId?: string | null
  abcClassification?: string | null
  allowNegativeInventory: boolean
  minimumPackQuantity?: number | null
  defaultWarehouseId?: string | null
  defaultWarehouse?: { id: string; warehouseCode: string; warehouseName: string } | null
  minStockAlertEnabled: boolean
  minStock?: number | null
  safetyStockAlertEnabled: boolean
  safetyStock?: number | null
  reorderPointAlertEnabled: boolean
  reorderPoint?: number | null
  reorderQuantity?: number | null
  dailyConsumption?: number | null
  maxStockAlertEnabled: boolean
  maxStock?: number | null
  outboundRuleId?: string | null
  batchManagementEnabled: boolean
  batchRuleId?: string | null
  serialManagementEnabled: boolean
  serialRuleId?: string | null
  serialGenerationTiming?: string | null
  shelfLifeManagementEnabled: boolean
  shelfLifeUnitId?: string | null
  shelfLife?: number | null
  shelfLifeCalculationDirection?: string | null
  expiryCalculationMethod?: string | null
  advancePeriodUnitId?: string | null
  inboundExpiryLead?: number | null
  outboundExpiryLead?: number | null
  expiryAlertEnabled: boolean
  expiryAlertDays?: number | null
  barcodeManagementEnabled: boolean
  barcode?: string | null
  productionUnitId?: string | null
  mrpType?: string | null
  dispatcherId?: string | null
  productionPlannerId?: string | null
  keyComponent: boolean
  inboundWarehouseId?: string | null
  fixedBatch?: number | null
  productionFixedLeadDays?: number | null
  productionPreprocessDays?: number | null
  selfMadeProductionDays?: number | null
  productionPostprocessDays?: number | null
  productionInspectionLeadDays?: number | null
  schedulingPriority: number
  schedulingStrategy: 'inherit' | 'forward' | 'backward'
  planningTimeFenceDays: number
  batchRoundingQuantity?: number | null
  issuingWarehouseId?: string | null
  materialIssueMethod?: string | null
  backflushMethod?: string | null
  overIssueControlMethod?: string | null
  issueTolerancePercent?: number | null
  minimumIssueBatch?: number | null
  costUnitId?: string | null
  valuationMethod?: string | null
  currencyCode: string
  unitConversions: Array<{
    sourceUnitId: string
    baseFactor: number
    sourceFactor: number
    remark?: string
  }>
}

export type MaterialArchiveWriteOmitFields = readonly [
  'id',
  'category',
  'materialTypeRef',
  'baseUnit',
  'productionUnit',
  'auxiliaryUnit',
  'auxiliaryUnit2',
  'attributeGroup',
  'materialGroup',
  'defaultWarehouse',
  'createBy',
  'createTime',
  'updateBy',
  'updateTime'
]

export type MaterialArchiveInput = Omit<MaterialArchive, MaterialArchiveWriteOmitFields[number]>

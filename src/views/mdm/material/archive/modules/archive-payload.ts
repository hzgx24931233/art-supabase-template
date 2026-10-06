import { omit } from 'lodash-es'
import type {
  MaterialArchive,
  MaterialArchiveInput,
  MaterialArchiveWriteOmitFields
} from '@/api/mdm'

type MaterialArchiveWriteSource = MaterialArchiveInput & Partial<MaterialArchive>

type NullableMaterialArchiveStringField = {
  [Field in keyof MaterialArchiveInput]-?: Field extends `${string}Id`
    ? null extends MaterialArchiveInput[Field]
      ? Field
      : never
    : null extends MaterialArchiveInput[Field]
      ? NonNullable<MaterialArchiveInput[Field]> extends string
        ? Field
        : never
      : never
}[keyof MaterialArchiveInput]

const materialArchiveWriteOmitFields: MaterialArchiveWriteOmitFields = [
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

const nullableMaterialArchiveStringFields = [
  'codeRuleId',
  'materialTypeId',
  'baseUnitId',
  'auxiliaryUnitId',
  'auxiliaryUnit2Id',
  'attributeGroupId',
  'materialGroupId',
  'purchaseUnitId',
  'purchaserId',
  'plannerId',
  'defaultSupplierId',
  'salesUnitId',
  'salespersonId',
  'inventoryUnitId',
  'storageLocationId',
  'custodianId',
  'defaultWarehouseId',
  'outboundRuleId',
  'batchRuleId',
  'serialRuleId',
  'shelfLifeUnitId',
  'advancePeriodUnitId',
  'productionUnitId',
  'dispatcherId',
  'productionPlannerId',
  'inboundWarehouseId',
  'issuingWarehouseId',
  'costUnitId',
  'purchaseOrganization',
  'specialPurchaseType',
  'batchPolicy',
  'salesOrganization',
  'abcClassification',
  'serialGenerationTiming',
  'shelfLifeCalculationDirection',
  'expiryCalculationMethod',
  'mrpType',
  'materialIssueMethod',
  'backflushMethod',
  'overIssueControlMethod',
  'valuationMethod'
] as const satisfies readonly NullableMaterialArchiveStringField[]

function normalizeBlankMaterialFields(payload: MaterialArchiveInput): MaterialArchiveInput {
  return nullableMaterialArchiveStringFields.reduce<MaterialArchiveInput>((normalized, field) => {
    const value = normalized[field]
    return typeof value === 'string' && !value.trim()
      ? { ...normalized, [field]: null }
      : normalized
  }, payload)
}

/** Keep relation and audit fields returned by archive reads out of the secure write payload. */
export function buildMaterialArchiveWriteInput(
  model: MaterialArchiveWriteSource
): MaterialArchiveInput {
  return normalizeBlankMaterialFields(omit(model, materialArchiveWriteOmitFields))
}

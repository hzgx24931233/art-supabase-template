import { pick } from 'lodash-es'
import { normalizeNonNullableText, normalizeNullableText } from '@/utils/form/normalize'
import type { BusinessTypeRecord, BusinessTypeUpdateInput, BusinessTypeWriteInput } from '@/api/mdm'

export interface BusinessTypeFormModel extends BusinessTypeWriteInput {
  id?: string
  sourceId?: string
  menuId: string
}

export const createBusinessTypeFormModel = (
  patch: Partial<BusinessTypeFormModel> = {}
): BusinessTypeFormModel => ({
  id: undefined,
  sourceId: undefined,
  menuId: '',
  documentTypeId: '',
  businessTypeCode: '',
  businessTypeName: '',
  isDefault: false,
  sourceBusinessTypeId: null,
  inventoryDirection: null,
  ownerType: null,
  inventoryAccounting: false,
  remark: '',
  sortOrder: 10,
  textColor: '',
  tagStyle: 'primary',
  enabled: true,
  ...patch
})

export const createBusinessTypeCopyModel = (source: BusinessTypeRecord): BusinessTypeFormModel =>
  createBusinessTypeFormModel({
    sourceId: source.id,
    menuId: source.documentType?.menuId ?? '',
    documentTypeId: source.documentTypeId,
    businessTypeCode: '',
    businessTypeName: `${source.businessTypeName}（副本）`,
    isDefault: false,
    sourceBusinessTypeId: source.sourceBusinessTypeId ?? null,
    inventoryDirection: source.inventoryDirection ?? null,
    ownerType: source.ownerType ?? null,
    inventoryAccounting: source.inventoryAccounting,
    remark: source.remark,
    sortOrder: source.sortOrder + 10,
    textColor: source.textColor,
    tagStyle: source.tagStyle,
    enabled: source.enabled
  })

export const buildBusinessTypeInput = (model: BusinessTypeFormModel): BusinessTypeWriteInput => {
  const payload = pick(model, [
    'documentTypeId',
    'businessTypeCode',
    'businessTypeName',
    'isDefault',
    'sourceBusinessTypeId',
    'inventoryDirection',
    'ownerType',
    'inventoryAccounting',
    'remark',
    'sortOrder',
    'textColor',
    'tagStyle',
    'enabled'
  ]) as BusinessTypeWriteInput

  payload.businessTypeCode = normalizeNonNullableText(payload.businessTypeCode).toUpperCase()
  payload.businessTypeName = normalizeNonNullableText(payload.businessTypeName)
  payload.sourceBusinessTypeId = normalizeNullableText(payload.sourceBusinessTypeId)
  payload.inventoryDirection = normalizeNullableText(payload.inventoryDirection)
  payload.ownerType = normalizeNullableText(payload.ownerType)
  payload.remark = normalizeNonNullableText(payload.remark)
  payload.textColor = normalizeNonNullableText(payload.textColor).toUpperCase()
  payload.tagStyle = normalizeNonNullableText(
    payload.tagStyle
  ) as BusinessTypeWriteInput['tagStyle']
  return payload
}

export const buildBusinessTypeUpdateInput = (
  model: BusinessTypeFormModel
): BusinessTypeUpdateInput => {
  return buildBusinessTypeInput(model)
}

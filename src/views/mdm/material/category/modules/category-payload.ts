import type { MaterialCategory, MaterialCategoryInput } from '@/api/mdm'
import { normalizeNullableText } from '@/utils/form/normalize'

/**
 * Restrict category writes to columns owned by mdm_material_category. Read-only relations and
 * temporary form properties must not reach PostgREST's mutation payload.
 */
export function buildMaterialCategoryWriteInput(model: MaterialCategory): MaterialCategoryInput {
  return {
    tenantId: model.tenantId,
    parentId: model.parentId || null,
    categoryCode: model.categoryCode.trim(),
    codePrefix: model.codePrefix.trim() || model.categoryCode.trim(),
    categoryName: model.categoryName.trim(),
    materialTypeId: model.materialTypeId || null,
    printName: normalizeNullableText(model.printName),
    compositionColumns: [...model.compositionColumns],
    compositionSeparator: model.compositionSeparator,
    overPurchasePercent: Number(model.overPurchasePercent || 0),
    overPurchaseQuantity: Number(model.overPurchaseQuantity || 0),
    maxReceiptQuantity: model.maxReceiptQuantity ?? null,
    autoReceive: Boolean(model.autoReceive),
    purchaserId: model.purchaserId || null,
    purchaseOrganization: normalizeNullableText(model.purchaseOrganization),
    requiresInspection: Boolean(model.requiresInspection),
    createDeliveryNotice: Boolean(model.createDeliveryNotice),
    defaultSiteId: model.defaultSiteId || null,
    overReceiptPercent: Number(model.overReceiptPercent || 0),
    overReceiptQuantity: Number(model.overReceiptQuantity || 0),
    batchManaged: Boolean(model.batchManaged),
    valuationMethod: model.valuationMethod,
    description: normalizeNullableText(model.description),
    status: model.status,
    sort: Number(model.sort || 0)
  }
}

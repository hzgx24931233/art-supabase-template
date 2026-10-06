import { cloneDeep, pick } from 'lodash-es'
import { normalizeNonNullableText } from '@/utils/form/normalize'
import type {
  OperationalMasterInput,
  OperationalMasterKind,
  OperationalMasterRecord
} from '@/api/mdm'

interface OperationalMasterWriteContext {
  kind: OperationalMasterKind
  fieldKeys: Array<keyof OperationalMasterRecord>
  regionPath: string[]
}

const nullableUuidFieldKeys = new Set<keyof OperationalMasterRecord>([
  'groupId',
  'customerId',
  'menuId',
  'ownerId',
  'salespersonId',
  'timeUnitId',
  'departmentId',
  'pricingUnitId',
  'workCenterId',
  'responsiblePersonId'
])

/**
 * Build a write payload from configured database fields only. ArtForm slots can attach temporary
 * values such as addressPicker to the form model, but those UI-only values must never reach the API.
 */
export function buildOperationalMasterWriteInput(
  model: OperationalMasterRecord,
  context: OperationalMasterWriteContext
): OperationalMasterInput {
  const payload = pick(cloneDeep(model), [
    'tenantId',
    ...context.fieldKeys
  ]) as OperationalMasterInput

  if (['customer', 'project'].includes(context.kind)) {
    payload.region = context.regionPath.filter(Boolean).join('/') || null
  }

  if (context.kind === 'project' && !model.id) {
    delete payload.projectCode
  }

  const payloadRecord = payload as Record<string, unknown>
  for (const fieldKey of context.fieldKeys) {
    const key = String(fieldKey)
    const value = payloadRecord[key]
    if (typeof value !== 'string') continue

    const normalizedValue = normalizeNonNullableText(value)
    payloadRecord[key] =
      nullableUuidFieldKeys.has(fieldKey) && normalizedValue.length === 0 ? null : normalizedValue
  }

  return payload
}

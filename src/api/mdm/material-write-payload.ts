const auxiliaryUnit2LegacyKey = 'auxiliary_unit2_id'
const auxiliaryUnit2DatabaseKey = 'auxiliary_unit_2_id'

/** Align the generic camel-to-snake result with the exact mdm_material column names. */
export function alignMaterialArchiveDatabaseKeys(
  payload: Record<string, unknown>
): Record<string, unknown> {
  if (!Object.hasOwn(payload, auxiliaryUnit2LegacyKey)) return payload

  const { [auxiliaryUnit2LegacyKey]: auxiliaryUnit2Id, ...databasePayload } = payload
  return {
    ...databasePayload,
    [auxiliaryUnit2DatabaseKey]: auxiliaryUnit2Id
  }
}

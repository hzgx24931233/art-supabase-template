import type { MaterialArchive } from '@/api/mdm'

/** Convert a quantity expressed in one material unit to another using its archived conversion rows. */
export function convertBomComponentQuantity(
  quantity: number,
  fromUnitId: string,
  toUnitId: string,
  material: Pick<MaterialArchive, 'baseUnitId' | 'unitConversions'>
): number | null {
  if (fromUnitId === toUnitId) return quantity
  const factor = (unitId: string): number | null => {
    if (unitId === material.baseUnitId) return 1
    const conversion = material.unitConversions?.find((item) => item.sourceUnitId === unitId)
    if (!conversion || conversion.baseFactor <= 0 || conversion.sourceFactor <= 0) return null
    return conversion.baseFactor / conversion.sourceFactor
  }
  const fromFactor = factor(fromUnitId)
  const toFactor = factor(toUnitId)
  if (fromFactor === null || toFactor === null || !Number.isFinite(quantity)) return null
  return Math.round(((quantity * fromFactor) / toFactor) * 1_000_000) / 1_000_000
}

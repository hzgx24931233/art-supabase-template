import type { BomMaterialReference, MaterialArchive } from '@/api/mdm'

export function formatBomMaterialDescription(
  material?: BomMaterialReference | MaterialArchive | null
): string {
  if (!material) return '—'
  return [material.materialName, material.specificationModel, material.drawingNo]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(' · ')
}

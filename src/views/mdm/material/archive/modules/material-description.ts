import type { MaterialAttributeGroup, MaterialCategory } from '@/api/mdm'

export interface MaterialDescriptionSource {
  materialName?: string | null
  specificationModel?: string | null
  drawingNo?: string | null
  brand?: string | null
  manufacturer?: string | null
  materialComposition?: string | null
  placeOfOrigin?: string | null
  color?: string | null
  attributeValues: Record<string, string>
}

const materialFieldReaders: Record<
  Exclude<string, 'attribute_group'>,
  (source: MaterialDescriptionSource) => string | null | undefined
> = {
  material_name: (source) => source.materialName,
  specification_model: (source) => source.specificationModel,
  drawing_no: (source) => source.drawingNo,
  brand: (source) => source.brand,
  manufacturer: (source) => source.manufacturer,
  material_composition: (source) => source.materialComposition,
  place_of_origin: (source) => source.placeOfOrigin,
  color: (source) => source.color
}

export function getMaterialDescriptionParts(
  category: Pick<MaterialCategory, 'compositionColumns'> | null | undefined,
  source: MaterialDescriptionSource,
  attributeGroup?: Pick<MaterialAttributeGroup, 'attributes'> | null
): string[] {
  if (!category) return []
  return category.compositionColumns.flatMap((column) => {
    if (column === 'attribute_group') {
      return (attributeGroup?.attributes ?? [])
        .filter((attribute) => attribute.enabled)
        .map((attribute) => source.attributeValues[attribute.key]?.trim())
        .filter((value): value is string => Boolean(value))
    }
    const value = materialFieldReaders[column]?.(source)?.trim()
    return value ? [value] : []
  })
}

export function buildMaterialDescription(
  category:
    Pick<MaterialCategory, 'compositionColumns' | 'compositionSeparator'> | null | undefined,
  source: MaterialDescriptionSource,
  attributeGroup?: Pick<MaterialAttributeGroup, 'attributes'> | null
): string {
  if (!category) return ''
  return getMaterialDescriptionParts(category, source, attributeGroup).join(
    category.compositionSeparator
  )
}

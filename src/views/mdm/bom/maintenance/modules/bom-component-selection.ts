import type { BomInput, MaterialArchive } from '@/api/mdm'

type BomComponentInput = BomInput['items'][number]

export interface BomComponentSelectionResult {
  items: BomComponentInput[]
  materials: MaterialArchive[]
}

export interface BomComponentAssignmentStep {
  id: string
  name: string
}

const createComponent = (
  material: MaterialArchive,
  sequenceNo: number,
  effectiveFrom: string,
  defaultStep?: { id: string; name: string } | null
): BomComponentInput => ({
  componentMaterialId: material.id,
  sequenceNo,
  quantity: 1,
  unitId: material.baseUnitId || '',
  scrapRate: 0,
  mrpEnabled: true,
  defaultIssueWarehouseId: material.defaultWarehouseId || null,
  issueMethod: material.materialIssueMethod || 'production_pick',
  backflushMethod: material.backflushMethod || 'none',
  overIssueControlMethod: material.overIssueControlMethod || null,
  projectText: '',
  positionNo: '',
  processRouteStepId: defaultStep?.id ?? null,
  operationName: defaultStep?.name ?? '',
  effectiveFrom,
  effectiveTo: '9999-12-31',
  remark: ''
})

export const mergeBomComponentSelection = (
  items: BomComponentInput[],
  knownMaterials: MaterialArchive[],
  selectedMaterials: MaterialArchive[],
  parentMaterialId: string,
  effectiveFrom: string,
  defaultStep?: { id: string; name: string } | null
): BomComponentSelectionResult => {
  const allowedSelections = selectedMaterials.filter((material) => material.id !== parentMaterialId)
  const existingIds = new Set(items.map((item) => item.componentMaterialId))
  const materialMap = new Map(
    [...knownMaterials, ...allowedSelections].map((material) => [material.id, material])
  )
  let sequenceNo =
    Math.ceil(
      items.reduce((maximum, item) => Math.max(maximum, Number(item.sequenceNo) || 0), 0) / 10
    ) * 10
  const additions = allowedSelections
    .filter((material) => !existingIds.has(material.id))
    .map((material) => {
      sequenceNo += 10
      return createComponent(material, sequenceNo, effectiveFrom, defaultStep)
    })
  const mergedItems = [...items, ...additions]
  const mergedIds = new Set(mergedItems.map((item) => item.componentMaterialId))

  return {
    items: mergedItems,
    materials: [...materialMap.values()].filter((material) => mergedIds.has(material.id))
  }
}

export const removeBomComponentSelection = (
  items: BomComponentInput[],
  materials: MaterialArchive[],
  componentMaterialId: string
): BomComponentSelectionResult => ({
  items: items.filter((item) => item.componentMaterialId !== componentMaterialId),
  materials: materials.filter((material) => material.id !== componentMaterialId)
})

export const assignBomComponentsToStep = (
  items: BomComponentInput[],
  componentMaterialIds: string[],
  step: BomComponentAssignmentStep
): BomComponentInput[] => {
  const selectedIds = new Set(componentMaterialIds)
  return items.map((item) =>
    selectedIds.has(item.componentMaterialId)
      ? {
          ...item,
          processRouteStepId: step.id,
          operationName: step.name
        }
      : item
  )
}

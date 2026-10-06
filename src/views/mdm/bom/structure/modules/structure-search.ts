interface BomStructureSearchNode {
  depth: number
  materialCode: string
  materialName: string
  specificationModel?: string | null
  drawingNo?: string | null
}

const normalizeSearchText = (value: unknown): string =>
  String(value ?? '')
    .toLocaleLowerCase()
    .replaceAll(/\s+/g, '')

const getDepthSearchValues = (depth: number): string[] =>
  depth === 0 ? ['0', '根级'] : [String(depth), `第${depth}层`]

export function filterBomStructureNodes<T extends BomStructureSearchNode>(
  nodes: readonly T[],
  keyword: string
): T[] {
  const terms = keyword
    .trim()
    .replaceAll(/第\s*(\d+)\s*层/gi, '第$1层')
    .toLocaleLowerCase()
    .split(/\s+/)
    .map(normalizeSearchText)
    .filter(Boolean)

  if (!terms.length) return nodes.slice()

  return nodes.filter((node) => {
    const searchableValues = [
      ...getDepthSearchValues(node.depth),
      node.materialCode,
      node.materialName,
      node.specificationModel,
      node.drawingNo
    ].map(normalizeSearchText)

    return terms.every((term) => searchableValues.some((value) => value.includes(term)))
  })
}

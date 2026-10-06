interface BomStructureVisibilityNode {
  nodeId: string
  parentNodeId?: string | null
  depth: number
  isVirtual: boolean
}

export const SINGLE_LAYER_FETCH_DEPTH = 2

/**
 * 单层查询保留根节点与全部一级子件，并穿透一级虚拟件展示其二级子件。
 */
export function filterSingleLayerBomNodes<T extends BomStructureVisibilityNode>(
  nodes: readonly T[]
): T[] {
  const virtualFirstLayerIds = new Set(
    nodes.filter((node) => node.depth === 1 && node.isVirtual).map((node) => node.nodeId)
  )

  return nodes.filter(
    (node) =>
      node.depth <= 1 ||
      (node.depth === SINGLE_LAYER_FETCH_DEPTH &&
        Boolean(node.parentNodeId && virtualFirstLayerIds.has(node.parentNodeId)))
  )
}

import type { WbsNode } from '@pm/types/wbs'

export interface WbsTreeNode extends WbsNode {
  children: WbsTreeNode[]
  level: number
}

export function buildWbsTree(nodes: WbsNode[]): WbsTreeNode[] {
  const byId = new Map<string, WbsTreeNode>()
  nodes.forEach((node) => byId.set(node.id, { ...node, children: [], level: 0 }))
  const roots: WbsTreeNode[] = []
  byId.forEach((node) => {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  })
  const assign = (items: WbsTreeNode[], level: number) => {
    items.sort((a, b) => a.sort_order - b.sort_order || a.wbs_code.localeCompare(b.wbs_code))
    items.forEach((item) => {
      item.level = level
      assign(item.children, level + 1)
    })
  }
  assign(roots, 0)
  return roots
}

export function flattenWbsTree(tree: WbsTreeNode[]): WbsTreeNode[] {
  return tree.flatMap((node) => [node, ...flattenWbsTree(node.children)])
}

export function hasWbsCycle(nodes: WbsNode[], nodeId: string, parentId: string | null): boolean {
  const parentMap = new Map(nodes.map((node) => [node.id, node.parent_id]))
  let cursor = parentId
  while (cursor) {
    if (cursor === nodeId) return true
    cursor = parentMap.get(cursor) ?? null
  }
  return false
}

export function nextWbsCode(nodes: WbsNode[], parentId: string | null): string {
  const siblings = nodes.filter((node) => node.parent_id === parentId)
  const prefix = parentId ? nodes.find((node) => node.id === parentId)?.wbs_code : ''
  return `${prefix ? `${prefix}.` : ''}${siblings.length + 1}`
}

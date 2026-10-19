import type { Edge } from '@vue-flow/core'
import type { ProjectOrgAssignment, ProjectOrgNode } from '@pm/types/project-organization'

export function buildProjectOrgEdges(nodes: ProjectOrgNode[]): Edge[] {
  const nodeIds = new Set(nodes.map((node) => node.id))
  return nodes
    .filter((node) => node.parent_id && nodeIds.has(node.parent_id) && node.parent_id !== node.id)
    .map((node) => ({
      id: `${node.parent_id}-${node.id}`,
      source: node.parent_id as string,
      target: node.id
    }))
}

export function countExpiringCertificates(
  assignments: ProjectOrgAssignment[],
  now = Date.now(),
  windowDays = 90
): number {
  const deadline = now + windowDays * 86400000
  return assignments.filter((item) => {
    if (item.status === 'ended' || !item.certificate_expires_on) return false
    const expiresAt = new Date(item.certificate_expires_on).getTime()
    return Number.isFinite(expiresAt) && expiresAt <= deadline
  }).length
}

export type WbsVersionStatus =
  'draft' | 'submitted' | 'approved' | 'rejected' | 'cancelled' | 'superseded'

export type WbsBusinessType =
  'schedule_task' | 'resource_plan' | 'quality_check' | 'site_visa' | 'measurement' | 'actual_cost'

export interface WbsVersion {
  id: string
  project_id: string
  version_no: number
  status: WbsVersionStatus
  title: string
  change_note: string | null
  source_version_id: string | null
  snapshot: Record<string, unknown>
  baseline_at: string | null
  workflow_instance_id: string | null
}

export interface WbsNode {
  id: string
  version_id: string
  parent_id: string | null
  wbs_code: string
  custom_code: string | null
  name: string
  description: string | null
  deliverable_summary: string | null
  quantity: number | null
  unit: string | null
  planned_quantity: number | null
  budget_cost: number | null
  responsible_department: string | null
  responsible_person: string | null
  quality_standard: string | null
  is_milestone: boolean
  status: 'active' | 'disabled' | 'archived'
  sort_order: number
  metadata: Record<string, unknown>
}

export interface WbsDeliverable {
  id: string
  node_id: string
  name: string
  deliverable_type: string | null
  acceptance_criteria: string | null
  responsible_person: string | null
  status: 'planned' | 'in_progress' | 'accepted' | 'cancelled'
  attachment_id: string | null
}

export interface WbsScopeBoundary {
  id: string
  version_id: string
  boundary_type: 'included' | 'excluded'
  content: string
  basis: string | null
  sort_order: number
}

export interface WbsBusinessLink {
  id: string
  wbs_node_id: string
  business_type: WbsBusinessType
  business_id: string
  link_role: string
  status: 'active' | 'ended'
  business_label?: string | null
}

export interface WbsWorkspace {
  version: WbsVersion | null
  nodes: WbsNode[]
  deliverables: WbsDeliverable[]
  boundaries: WbsScopeBoundary[]
  links: WbsBusinessLink[]
}

export interface WbsTemplate {
  id: string
  name: string
  category: string
  description: string | null
  node_count: number
}

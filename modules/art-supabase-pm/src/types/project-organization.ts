export type ProjectOrgVersionStatus =
  'draft' | 'submitted' | 'approved' | 'rejected' | 'cancelled' | 'superseded'

export type ProjectOrgNodeType = 'unit' | 'department' | 'position' | 'person'

export interface ProjectOrgVersion {
  id: string
  project_id: string
  version_no: number
  status: ProjectOrgVersionStatus
  title: string
  change_note: string | null
  snapshot: Record<string, unknown>
  baseline_at: string | null
  submitted_at: string | null
  decided_at: string | null
  decision_note: string | null
}

export interface ProjectOrgNode {
  id: string
  version_id: string
  parent_id: string | null
  node_type: ProjectOrgNodeType
  group_type: 'internal' | 'external'
  node_code: string | null
  node_name: string
  sort_order: number
  layout: { x?: number; y?: number }
  metadata: Record<string, unknown>
}

export interface ProjectOrgPosition {
  id: string
  project_id: string
  version_id: string
  position_code: string
  position_name: string
  responsibilities: string | null
  requirements: string | null
  approval_permissions: string[]
  status: 'draft' | 'active' | 'inactive' | 'ended'
}

export interface ProjectOrgParticipant {
  id: string
  project_id: string
  participant_type: 'owner' | 'general_contractor' | 'supervisor' | 'subcontractor' | 'supplier'
  unit_name: string
  registration_no: string | null
  contact_name: string | null
  contact_phone: string | null
  qualifications: string | null
  service_scope: string | null
  status: 'draft' | 'active' | 'inactive' | 'ended'
}

export interface ProjectOrgAssignment {
  id: string
  project_id: string
  version_id: string
  position_id: string
  employee_id: string | null
  user_id: string | null
  person_name: string
  account_name: string | null
  unit_name: string | null
  phone: string | null
  entry_date: string | null
  exit_date: string | null
  status: 'planned' | 'active' | 'ended'
  certificate_no: string | null
  certificate_type: string | null
  certificate_expires_on: string | null
}

export interface ProjectOrgArtifact {
  id: string
  project_id: string
  version_id: string
  artifact_type: 'org_chart' | 'cad' | 'image' | 'word' | 'pdf' | 'excel'
  attachment_id: string | null
  generation_status: 'pending' | 'ready' | 'failed'
  error_message: string | null
  create_time: string
}

export interface ProjectOrgWorkspace {
  version: ProjectOrgVersion | null
  nodes: ProjectOrgNode[]
  positions: ProjectOrgPosition[]
  assignments: ProjectOrgAssignment[]
  participants: ProjectOrgParticipant[]
  artifacts: ProjectOrgArtifact[]
}

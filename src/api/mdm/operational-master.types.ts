import type { MasterGroupDomain } from '@/api/master-groups'

export type { MasterGroup, MasterGroupDomain } from '@/api/master-groups'

export type OperationalMasterKind =
  | 'customer'
  | 'project'
  | 'activity-formula'
  | 'operation-control-code'
  | 'operation'
  | 'workstation'

export type ActivityFormulaPurpose =
  | 'report_preparation'
  | 'report_processing'
  | 'report_other_1'
  | 'report_other_2'
  | 'plan_preparation'
  | 'plan_processing'
  | 'plan_other_1'
  | 'plan_other_2'

export type ActivityFormulaToken =
  | { type: 'parameter'; value: string; label: string; parameterId: string }
  | { type: 'operator'; value: '+' | '-' | '*' | '/' | '(' | ')'; label: string }
  | { type: 'function'; value: 'ROUND' | 'CEIL' | 'FLOOR'; label: string }
  | { type: 'number'; value: string; label: string }
  | { type: 'literal'; value: string; label: string }

export interface ActivityFormulaParameter {
  id: string
  tenantId: string
  purpose: ActivityFormulaPurpose
  parentId: string | null
  nodeType: 'group' | 'parameter'
  code: string
  name: string
  activityUnit: 'hour' | 'minute' | 'second' | null
  relatedField: string
  sort: number
  enabled: boolean
  remark: string
}

export type ActivityFormulaParameterInput = Omit<ActivityFormulaParameter, 'id'>

export interface MasterGroupInput {
  tenantId?: string
  domain: MasterGroupDomain
  parentId: string | null
  code: string
  name: string
  sort: number
  enabled: boolean
  remark: string
}

export interface OperationalMasterRecord {
  id: string
  tenantId: string
  code?: string
  name?: string
  customerCode?: string
  customerName?: string
  projectCode?: string
  projectName?: string
  controlCode?: string
  controlCodeName?: string
  workstationCode?: string
  workstationName?: string
  groupId?: string | null
  customerId?: string | null
  menuId?: string | null
  industry?: string | null
  customerLevel?: string | null
  region?: string | null
  addressDetail?: string | null
  contactName?: string | null
  contactPhone?: string | null
  contactDepartment?: string | null
  contactPosition?: string | null
  contactEmail?: string | null
  contactQq?: string | null
  invoiceTitle?: string | null
  taxNo?: string | null
  bankName?: string | null
  bankAccount?: string | null
  projectMode?: string | null
  projectStage?: string | null
  projectStatus?: string | null
  ownerId?: string | null
  salespersonId?: string | null
  source?: string | null
  purpose?: string | null
  activityType?: string | null
  activityTypes?: string[]
  isDefault?: boolean
  planExpression?: string | null
  reportExpression?: string | null
  formulaExpression?: string | null
  formulaTranslation?: string | null
  formulaTokens?: ActivityFormulaToken[]
  description?: string | null
  participatesScheduling?: boolean
  processingMode?: string | null
  reportMode?: string | null
  timeUnitId?: string | null
  inspectionMode?: string | null
  sequenceControl?: string | null
  reworkMode?: string | null
  mnemonic?: string | null
  pricingType?: string | null
  departmentId?: string | null
  workCenterIds?: string[]
  price?: number | null
  pricingUnitId?: string | null
  processingDefectReasons?: string[]
  materialDefectReasons?: string[]
  workCenterId?: string | null
  responsiblePersonId?: string | null
  andonSimNo?: string | null
  enabled: boolean
  remark?: string | null
  createTime?: string
  updateTime?: string
}

export type OperationalMasterInput = Omit<
  OperationalMasterRecord,
  'id' | 'createTime' | 'updateTime'
>

export interface OperationalMasterQuery {
  tenantId?: string | null
  current: number
  size: number
  keyword?: string
  groupId?: string
  groupIds?: string[]
  enabled?: boolean
}

export interface MasterReferenceOption {
  id: string
  code: string
  name: string
  tenantId: string
  parentId?: string | null
  departmentId?: string | null
}

export interface OperationalMasterReferences {
  customers: MasterReferenceOption[]
  employees: MasterReferenceOption[]
  departments: MasterReferenceOption[]
  workCenters: MasterReferenceOption[]
  personnel: MasterReferenceOption[]
  units: MasterReferenceOption[]
  menus: MasterReferenceOption[]
}

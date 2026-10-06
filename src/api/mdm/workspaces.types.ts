import type { ProductionDepartment, ProductionTag, ProductionPerson } from './production.types'

export interface WorkspaceAudit {
  id: string
  tenantId: string
  createBy: string
  createTime: string
  updateTime: string
}
export interface WorkspaceQuery {
  tenantId: string
  current: number
  size: number
  keyword?: string
  enabled?: boolean
  departmentIds?: string[]
  groupId?: string
  groupIds?: string[]
}
export interface OperationTask {
  inputMode: string
  category: string
  name: string
  requirement: string
  score: number
  choices: string[]
}
export interface OperationTemplateInput {
  name: string
  items: OperationTask[]
  sort: number
  textColor: string
  tagType: ProductionTag
  enabled: boolean
}
export interface OperationTemplate extends OperationTemplateInput, WorkspaceAudit {
  totalScore: number
}
export type CenterPolicyValue = string | number | boolean | string[]
export type CenterPolicy = Record<string, CenterPolicyValue>
export interface WorkCenterInput {
  code: string
  name: string
  departmentId: string
  operationControlCodeId: string | null
  mainCenterId: string | null
  personnelMode: string
  headcount: number
  personIds: string[]
  capacityMode: 'finite' | 'infinite'
  dailyCapacityMinutes: number
  efficiencyPercent: number
  utilizationPercent: number
  parallelCapacity: number
  queueMinutes: number
  policy: CenterPolicy
  sort: number
  remark: string
}
export interface WorkCenter extends WorkCenterInput, WorkspaceAudit {
  qrToken: string
  department: { id: string; name: string; code: string } | null
  operationControlCode: { id: string; code: string; name: string } | null
  mainCenter: { id: string; code: string; name: string } | null
}
export interface WorkCenterActivityInput {
  activityName: string
  activityType: string
  maintenanceRule: string
  baseQuantity: number
  activityUnit: string
  planFormulaId: string | null
  reportFormulaId: string | null
  backflush: boolean
  remark: string
  sort: number
}
export interface WorkCenterActivity extends WorkCenterActivityInput, WorkspaceAudit {
  workCenterId: string
  planFormula: { id: string; code: string; name: string; expression: string } | null
  reportFormula: { id: string; code: string; name: string; expression: string } | null
}
export interface WorkCenterReference {
  id: string
  code: string
  name: string
  activityType?: string
  planExpression?: string
  reportExpression?: string
}
export interface WorkstationScopeCenter {
  id: string
  tenantId: string
  departmentId: string
  code: string
  name: string
  sort: number
}
export interface WorkstationResponsiblePerson {
  id: string
  tenantId: string
  name: string
  employeeNo: string
  jobTitle: string
  enabled: boolean
}
export interface WorkstationInput {
  tenantId: string
  workstationCode: string
  workstationName: string
  departmentId: string
  workCenterId: string
  responsiblePersonId: string | null
  andonSimNo: string | null
  enabled: boolean
  remark: string
}
export interface Workstation extends WorkstationInput, WorkspaceAudit {
  department: { id: string; tenantId: string; code: string; name: string } | null
  workCenter: { id: string; tenantId: string; code: string; name: string } | null
  responsiblePerson: WorkstationResponsiblePerson | null
}
export interface WorkstationQuery {
  tenantId?: string | null
  workCenterId: string
  keyword?: string
  enabled?: boolean
  current: number
  size: number
}
export interface WorkstationScope {
  departments: ProductionDepartment[]
  workCenters: WorkstationScopeCenter[]
}
export interface CommonWorkCenter {
  id: string
  code: string
  name: string
  departmentId: string
  departmentName: string
}
export interface PersonnelWorkCenterConfig {
  id: string
  tenantId: string
  departmentId: string
  department: { id: string; name: string; code: string }
  name: string
  employeeNo: string
  phone: string
  jobTitle: string
  avatarUrl: string
  commonWorkCenters: CommonWorkCenter[]
}
export interface PersonnelWorkCenterQuery extends WorkspaceQuery {
  onlyUnconfigured?: boolean
}
export interface PersonnelCommonWorkCenterInput {
  personnelId: string
  departmentId: string
  workCenterIds: string[]
}
export interface CenterAdjustmentInput {
  workCenterId: string
  personId: string
  kind: string
  startTime: string
  endTime: string
}
export interface CenterAdjustment extends CenterAdjustmentInput, WorkspaceAudit {
  person: Pick<ProductionPerson, 'id' | 'name' | 'employeeNo'> | null
}
export interface CenterDeviceInput {
  workCenterId: string
  equipmentId: string
  isMain: boolean
  point: string
}
export interface CenterDevice extends CenterDeviceInput, WorkspaceAudit {
  equipment: { id: string; equipmentCode: string; equipmentName: string } | null
}
export interface ProcessRouteInput {
  tenantId: string
  materialId: string
  code: string
  name: string
  routeType: string
  allocationMode: string
  groupId: string | null
  version: string
  batchFrom: number | null
  batchTo: number
  productionUnitId: string | null
  departmentId: string | null
  effectiveDate: string
  expiryDate: string
  isDefault: boolean
  source: string
  customUnitConversion: boolean
  enabled: boolean
  path: string
  remark: string
}
export interface ProcessRouteMaterialOption {
  id: string
  categoryId: string
  materialCode: string
  materialName: string
  specificationModel?: string | null
  drawingNo?: string | null
  materialComposition?: string | null
  brand?: string | null
  materialType: string
  materialSource: string
  specialPurchaseType?: string | null
  productionUnitId?: string | null
  category: { id: string; categoryCode: string; categoryName: string } | null
  materialTypeRef: { id: string; typeCode: string; typeName: string } | null
}
export interface ProcessRoute extends ProcessRouteInput, WorkspaceAudit {
  material: ProcessRouteMaterialOption | null
  group: { id: string; code: string; name: string } | null
  productionUnit: { id: string; unitCode: string; unitName: string; symbol: string } | null
  department: { id: string; code: string; name: string } | null
}
export interface ProcessSequenceInput {
  routeId: string
  sequenceNo: number
  sequenceType: string
  transferInStepId: string | null
  transferOutStepId: string | null
  remark: string
}
export interface ProcessSequence extends ProcessSequenceInput, WorkspaceAudit {
  stepCount?: number
}
export interface ProcessStepActivity {
  sourceWorkCenterId: string | null
  sourceWorkCenterName: string
  name: string
  activityType: string
  maintenanceRule: string
  basicQuantity: number
  activityUnit: string
  planExpression: string
  reportExpression: string
  backflush: boolean
  remark: string
  sort: number
}
export interface ProcessStepInput {
  routeId: string
  sequenceId: string | null
  code: string
  name: string
  operationId: string | null
  description: string
  unitId: string | null
  basicBatch: number
  workCenterId: string | null
  workCenterIds: string[]
  departmentId: string | null
  runOutputQuantity: number
  runProcessingMinutes: number
  runGreenMinutes: number | null
  setupMinutes: number
  operatorCount: number
  machineCount: number
  queueMinutes: number
  transferMinutes: number
  minimumTransferQuantity: number
  overlapEnabled: boolean
  operationMode: string
  controlCodeId: string | null
  processingMode: string
  reportMode: string
  inspectionMode: string
  sequenceControl: string
  reworkMode: string
  needInspection: boolean
  firstInspection: boolean
  firstInspectionControl: string
  isFirst: boolean
  isLast: boolean
  critical: boolean
  unitConversion: Record<string, unknown>
  activities: ProcessStepActivity[]
  outsourcing: Record<string, unknown>
  inspection: Record<string, unknown>
  sopDocuments: Array<Record<string, unknown>>
  sort: number
}
export interface ProcessStep extends ProcessStepInput, WorkspaceAudit {
  templateId: string | null
  route: ProcessRoute | null
  template: { id: string; name: string; totalScore: number } | null
  workCenter: { id: string; code: string; name: string } | null
  sequence: Pick<ProcessSequence, 'id' | 'sequenceNo' | 'sequenceType' | 'remark'> | null
  operation: { id: string; code: string; name: string } | null
  controlCode: { id: string; controlCode: string; controlCodeName: string } | null
  unit: { id: string; unitCode: string; unitName: string; symbol: string } | null
  department: { id: string; code: string; name: string } | null
  configUpdatedAt: string | null
  componentAssignmentCount?: number
}

export interface ProcessRouteReference {
  id: string
  code: string
  name: string
  tenantId?: string
  specification?: string
  unitId?: string | null
  unit?: string
  planExpression?: string
  reportExpression?: string
  activityType?: string | null
  processingMode?: string | null
  reportMode?: string | null
  inspectionMode?: string | null
  sequenceControl?: string | null
  reworkMode?: string | null
  departmentId?: string | null
}

export interface ProcessRouteReferences {
  groups: ProcessRouteReference[]
  operations: ProcessRouteReference[]
  controlCodes: ProcessRouteReference[]
  units: ProcessRouteReference[]
  departments: ProcessRouteReference[]
  workCenters: ProcessRouteReference[]
  activityFormulas: ProcessRouteReference[]
  suppliers: ProcessRouteReference[]
  esopDocuments: ProcessRouteReference[]
}

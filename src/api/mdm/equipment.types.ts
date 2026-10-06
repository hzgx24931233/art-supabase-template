export type EquipmentStatus = 'enabled' | 'disabled'
export type EquipmentOperationStatus = 'normal' | 'maintenance' | 'fault' | 'idle'

export interface EquipmentReference {
  id: string
  tenantId: string
  parentId?: string | null
  departmentId?: string | null
  organizationId?: string | null
  code: string
  name: string
  kind?: string
}

export interface ProductionEquipment {
  id: string
  tenantId: string
  tenantName: string
  equipmentCode: string
  equipmentName: string
  photoUrl?: string | null
  categoryId: string
  categoryName: string
  productionDepartmentId?: string | null
  departmentName?: string | null
  locationId?: string | null
  locationName?: string | null
  workCenterId?: string | null
  workCenterCode?: string | null
  workCenterName?: string | null
  responsibleEmployeeId?: string | null
  responsibleName?: string | null
  supplierId?: string | null
  supplierName?: string | null
  equipmentBrand?: string | null
  model?: string | null
  manufacturer?: string | null
  factoryNo?: string | null
  fixedAssetNo?: string | null
  manufactureDate?: string | null
  installationDate?: string | null
  acceptanceDate?: string | null
  enableDate?: string | null
  trafficLightCardNo?: string | null
  andonBoxNo?: string | null
  pulseIntervalSeconds?: number | null
  standardUtilization?: number | null
  syncWorkCenter: boolean
  operationStatus: EquipmentOperationStatus
  status: EquipmentStatus
  remark?: string | null
  sort: number
  createBy?: string | null
  createTime: string
  updateBy?: string | null
  updateTime: string
}

export interface ProductionEquipmentInput {
  tenantId?: string
  categoryId: string
  productionDepartmentId: string
  locationId?: string | null
  workCenterId?: string | null
  responsibleEmployeeId?: string | null
  supplierId?: string | null
  equipmentCode: string
  equipmentName: string
  photoUrl?: string | null
  equipmentBrand?: string
  model?: string
  manufacturer?: string
  factoryNo?: string
  fixedAssetNo?: string
  manufactureDate?: string | null
  installationDate?: string | null
  acceptanceDate?: string | null
  enableDate?: string | null
  trafficLightCardNo?: string
  andonBoxNo?: string
  pulseIntervalSeconds?: number | null
  standardUtilization?: number | null
  syncWorkCenter: boolean
  operationStatus: EquipmentOperationStatus
  status: EquipmentStatus
  remark?: string
  sort: number
}

export interface ProductionEquipmentQuery {
  current: number
  size: number
  keyword?: string
  categoryId?: string
  departmentId?: string
  locationId?: string
  status?: EquipmentStatus
}

export interface ProductionEquipmentOverview {
  total: number
  enabled: number
  connected: number
  unassigned: number
}

export interface ProductionEquipmentReferences {
  categories: EquipmentReference[]
  departments: EquipmentReference[]
  locations: EquipmentReference[]
  workCenters: EquipmentReference[]
  suppliers: EquipmentReference[]
}

export interface ProductionEquipmentPage {
  data: ProductionEquipment[]
  total: number
  current: number
  size: number
  overview: ProductionEquipmentOverview
  references: ProductionEquipmentReferences
}

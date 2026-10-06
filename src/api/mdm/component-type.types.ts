export type ComponentTypeTagStyle = '' | 'primary' | 'success' | 'info' | 'warning' | 'danger'

export interface ComponentIndustryGroup {
  id: string
  tenantId: string
  parentId: string | null
  code: string
  name: string
  sort: number
  enabled: boolean
  remark: string | null
  children?: ComponentIndustryGroup[]
}

export interface ComponentTypeRecord {
  id: string
  tenantId: string
  groupId: string
  componentTypeCode: string
  componentTypeName: string
  sortOrder: number
  enabled: boolean
  textColor: string
  tagStyle: ComponentTypeTagStyle
  remark: string
  group?: Pick<ComponentIndustryGroup, 'id' | 'code' | 'name'> | null
}

export type ComponentTypeInput = Omit<ComponentTypeRecord, 'id' | 'group'> & { id?: string }
export type ComponentIndustryGroupInput = Omit<ComponentIndustryGroup, 'id' | 'children'> & {
  id?: string
}

export interface ComponentTypeQuery {
  current: number
  size: number
  tenantId?: string | null
  keyword?: string
  groupIds?: string[]
  enabled?: boolean
}

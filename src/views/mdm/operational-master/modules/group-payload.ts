import type { MasterGroupDomain, MasterGroupInput } from '@/api/mdm'

export interface MasterGroupFormModel {
  domain: MasterGroupDomain
  parentId: string | null
  code: string
  name: string
  sort: number
  enabled: boolean
  remark: string
}

export function buildMasterGroupWriteInput(model: MasterGroupFormModel): MasterGroupInput {
  return {
    domain: model.domain,
    parentId: model.parentId || null,
    code: model.code.trim().toUpperCase(),
    name: model.name.trim(),
    sort: model.sort,
    enabled: model.enabled,
    remark: model.remark.trim()
  }
}

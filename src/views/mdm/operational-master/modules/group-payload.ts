import type { MasterGroupDomain, MasterGroupInput } from '@/api/mdm'

export interface MasterGroupFormModel {
  tenantId: string
  domain: MasterGroupDomain
  parentId: string | null
  code: string
  name: string
  sort: number
  enabled: boolean
  remark: string
}

interface MasterGroupWriteContext {
  editing: boolean
  isPlatformScope: boolean
}

/**
 * Ordinary tenant writes derive tenant ownership at the database boundary. Platform-super creates
 * retain their explicit target tenant, while updates stay bound to the existing row's tenant.
 */
export function buildMasterGroupWriteInput(
  model: MasterGroupFormModel,
  context: MasterGroupWriteContext
): MasterGroupInput {
  const payload: MasterGroupInput = {
    domain: model.domain,
    parentId: model.parentId || null,
    code: model.code.trim().toUpperCase(),
    name: model.name.trim(),
    sort: model.sort,
    enabled: model.enabled,
    remark: model.remark.trim()
  }

  if (!context.editing && context.isPlatformScope) {
    payload.tenantId = model.tenantId.trim()
  }

  return payload
}

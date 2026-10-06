import { omit } from 'lodash-es'
import { useSupabase } from '@/hooks'
import { normalizeNullableText } from '@/utils/form/normalize'
import type {
  ProductionEquipmentInput,
  ProductionEquipmentPage,
  ProductionEquipmentQuery
} from './equipment.types'

export * from './equipment.types'

interface EquipmentRpcPayload {
  records?: ProductionEquipmentPage['data']
  total?: number
  overview?: Partial<ProductionEquipmentPage['overview']>
  references?: Partial<ProductionEquipmentPage['references']>
}

const { supabase, keysToSnakeDeep, responseHandle } = useSupabase()

const emptyReferences = (): ProductionEquipmentPage['references'] => ({
  categories: [],
  departments: [],
  locations: [],
  workCenters: [],
  suppliers: []
})

export async function fetchProductionEquipment(params: ProductionEquipmentQuery) {
  const from = (params.current - 1) * params.size
  const { data } = await responseHandle<EquipmentRpcPayload>(
    () =>
      supabase.rpc('mdm_list_production_equipment_v2_secure', {
        p_from: from,
        p_to: from + params.size - 1,
        p_keyword: normalizeNullableText(params.keyword),
        p_category_id: params.categoryId || null,
        p_department_id: params.departmentId || null,
        p_location_id: params.locationId || null,
        p_status: params.status || null
      }),
    { breakReturn: true, showErrorMessage: true, errorMessage: '生产设备加载失败，请重试' }
  )
  const references = emptyReferences()
  return {
    data: data?.records ?? [],
    total: data?.total ?? 0,
    current: params.current,
    size: params.size,
    overview: {
      total: data?.overview?.total ?? 0,
      enabled: data?.overview?.enabled ?? 0,
      connected: data?.overview?.connected ?? 0,
      unassigned: data?.overview?.unassigned ?? 0
    },
    references: { ...references, ...(data?.references ?? {}) }
  } satisfies ProductionEquipmentPage
}

export async function saveProductionEquipment(input: ProductionEquipmentInput, id?: string) {
  await responseHandle(
    () =>
      supabase.rpc('mdm_save_production_equipment_secure', {
        p_id: id ?? null,
        p_payload: keysToSnakeDeep(omit(input, ['id']))
      }),
    {
      breakReturn: true,
      showErrorMessage: true,
      showMessage: true,
      message: id ? '生产设备已更新' : '生产设备已新增',
      errorMessage: '生产设备保存失败，请检查资料后重试'
    }
  )
}

export async function setProductionEquipmentEnabled(ids: string[], enabled: boolean) {
  await responseHandle(
    () =>
      supabase.rpc('mdm_set_production_equipment_enabled_secure', {
        p_ids: ids,
        p_enabled: enabled
      }),
    { breakReturn: true, showMessage: true, message: enabled ? '设备已启用' : '设备已停用' }
  )
}

export async function deleteProductionEquipment(ids: string[]) {
  await responseHandle(
    () => supabase.rpc('mdm_delete_production_equipment_secure', { p_ids: ids }),
    { breakReturn: true, showMessage: true, message: '生产设备已删除' }
  )
}

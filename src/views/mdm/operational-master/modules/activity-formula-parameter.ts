import type { ActivityFormulaParameterInput, ActivityFormulaPurpose } from '@/api/mdm'
import { normalizeNonNullableText } from '@/utils/form/normalize'

export interface ActivityFormulaParameterFormModel extends Omit<
  ActivityFormulaParameterInput,
  'purpose'
> {
  purpose: ActivityFormulaPurpose | null
}

const purposes = new Set<ActivityFormulaPurpose>([
  'report_preparation',
  'report_processing',
  'report_other_1',
  'report_other_2',
  'plan_preparation',
  'plan_processing',
  'plan_other_1',
  'plan_other_2'
])

export function isActivityFormulaPurpose(value: unknown): value is ActivityFormulaPurpose {
  return typeof value === 'string' && purposes.has(value as ActivityFormulaPurpose)
}

export function buildActivityFormulaParameterWriteInput(
  model: ActivityFormulaParameterFormModel
): ActivityFormulaParameterInput {
  if (!isActivityFormulaPurpose(model.purpose)) {
    throw new Error('请先选择公式用途，再维护参数层级')
  }

  const code = normalizeNonNullableText(model.code).toUpperCase()
  if (!/^[A-Z][A-Z0-9_]{0,59}$/.test(code)) {
    throw new Error('节点编码必须以大写字母开头，且只能包含大写字母、数字和下划线')
  }

  const relatedField = normalizeNonNullableText(model.relatedField)
  if (model.nodeType === 'parameter' && !/^[A-Za-z_][A-Za-z0-9_.]{0,119}$/.test(relatedField)) {
    throw new Error('关联字段必须以字母或下划线开头，且只能包含字母、数字、下划线和点')
  }

  return {
    ...model,
    purpose: model.purpose,
    code,
    name: normalizeNonNullableText(model.name),
    activityUnit: model.nodeType === 'group' ? null : model.activityUnit,
    relatedField: model.nodeType === 'group' ? '' : relatedField,
    remark: normalizeNonNullableText(model.remark)
  }
}

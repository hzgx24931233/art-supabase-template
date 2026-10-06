import { cloneDeep } from 'lodash-es'
import { normalizeNonNullableText } from '@/utils/form/normalize'
import type { OperationalMasterInput, OperationalMasterRecord } from '@/api/mdm'

export function buildActivityFormulaWriteInput(
  model: OperationalMasterRecord,
  expression: string,
  translation: string
): OperationalMasterInput {
  return {
    tenantId: model.tenantId,
    code: normalizeNonNullableText(model.code),
    name: normalizeNonNullableText(model.name),
    purpose: model.purpose,
    activityType: model.activityTypes?.[0] ?? '',
    activityTypes: model.activityTypes,
    isDefault: model.isDefault,
    formulaExpression: expression,
    formulaTranslation: translation,
    formulaTokens: cloneDeep(model.formulaTokens),
    planExpression: expression,
    reportExpression: expression,
    description: normalizeNonNullableText(model.description),
    enabled: model.enabled,
    remark: normalizeNonNullableText(model.remark)
  }
}

import { toRaw } from 'vue'
import { cloneDeep, isEqual, set, unset } from 'lodash-es'

// ArtForm accepts business-owned models, including nested arrays and arbitrary records.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FormRecord = Record<string, any>

export interface SanitizeOutputOptions {
  removeEmptyString: boolean
  removeEmptyArray: boolean
  removeEmptyObject: boolean
  removeEmptyRichText: boolean
  keepZero: boolean
  keepFalse: boolean
}

export function cloneModelValue(value: FormRecord | undefined): FormRecord {
  return value ? cloneDeep(toRaw(value)) : {}
}

/**
 * 与基线快照做深比较，判断是否存在未保存修改。
 * 传入响应式模型本身（不要 toRaw），比较过程会读取每个字段，使调用方的 computed 能感知字段变化。
 * 与 lodash 一致：值为 undefined 的键等同于缺失的键。
 */
export function isModelDirty(
  model: FormRecord | undefined,
  baseline: FormRecord | undefined
): boolean {
  return !isEqual(model ?? {}, baseline ?? {})
}

export function updateFormFieldValue(model: FormRecord, path: string, value: unknown): FormRecord {
  if (value === undefined) unset(model, path)
  else set(model, path, value)
  return model
}

function isRichTextEmpty(value: string): boolean {
  if (/<(img|video|audio|iframe|embed|object)\b/i.test(value)) return false

  return (
    value
      .replace(/&nbsp;/gi, '')
      .replace(/<br\s*\/?>/gi, '')
      .replace(/<[^>]*>/g, '')
      .trim() === ''
  )
}

export function sanitizeFormValue(value: unknown, options: SanitizeOutputOptions): unknown {
  if (Array.isArray(value)) {
    const sanitizedArray = value
      .map((item) => sanitizeFormValue(item, options))
      .filter((item) => item !== undefined)
    return sanitizedArray.length === 0 && options.removeEmptyArray ? undefined : sanitizedArray
  }

  if (value && typeof value === 'object') {
    const sanitizedObject = Object.entries(toRaw(value)).reduce<Record<string, unknown>>(
      (result, [key, item]) => {
        const sanitizedItem = sanitizeFormValue(item, options)
        if (sanitizedItem !== undefined) result[key] = sanitizedItem
        return result
      },
      {}
    )
    return Object.keys(sanitizedObject).length === 0 && options.removeEmptyObject
      ? undefined
      : sanitizedObject
  }

  if (typeof value === 'string') {
    if (options.removeEmptyString && value.trim() === '') return undefined
    if (options.removeEmptyRichText && isRichTextEmpty(value)) return undefined
    return value
  }

  if (value === 0) return options.keepZero ? value : undefined
  if (value === false) return options.keepFalse ? value : undefined
  return value ?? undefined
}

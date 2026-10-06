import dayjs, { type Dayjs } from 'dayjs'
import type { MaterialCodeSegment } from '@/api/mdm'

export interface MaterialCodePreviewInput {
  fixedField: string
  segments: MaterialCodeSegment[]
  sequenceDigits: number
  codeLength: number
  sequenceValue?: number
  materialTypePrefix?: string
  materialCategoryPrefix?: string
  date?: Dayjs
}

export interface MaterialCodePreviewResult {
  code: string
  overflow: number
  padding: number
}

const normalize = (value?: string): string =>
  String(value ?? '')
    .trim()
    .toUpperCase()

export function buildMaterialCodePreview(
  input: MaterialCodePreviewInput
): MaterialCodePreviewResult {
  const date = input.date ?? dayjs()
  const segmentValues = input.segments.map((segment) => {
    if (segment.source === 'fixed') return normalize(segment.value)
    if (segment.source === 'material_type') return normalize(input.materialTypePrefix || 'MT')
    if (segment.source === 'material_category')
      return normalize(input.materialCategoryPrefix || 'MC')
    if (segment.format === 'YYYY') return date.format('YYYY')
    if (segment.format === 'YYYYMM') return date.format('YYYYMM')
    return date.format('YYYYMMDD')
  })
  const fixedField = normalize(input.fixedField)
  const sequence = String(Math.max(1, input.sequenceValue ?? 1)).padStart(
    Math.max(2, input.sequenceDigits),
    '0'
  )
  const segmentValue = segmentValues.join('')
  const baseLength = segmentValue.length + fixedField.length + sequence.length
  const padding = Math.max(0, input.codeLength - baseLength)
  const overflow = Math.max(0, baseLength - input.codeLength)
  const fixedSegmentIndex = input.segments.findLastIndex((segment) => segment.source === 'fixed')
  const paddingIndex = fixedSegmentIndex < 0 ? segmentValues.length : fixedSegmentIndex
  const beforePadding = segmentValues.slice(0, paddingIndex).join('')
  const afterPadding = segmentValues.slice(paddingIndex).join('')

  return {
    code: `${beforePadding}${'0'.repeat(padding)}${afterPadding}${fixedField}${sequence}`,
    overflow,
    padding
  }
}

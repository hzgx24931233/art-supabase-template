import { cloneDeep, pick, round, sumBy } from 'lodash-es'
import type { OperationTask, OperationTemplateInput } from '@/api/mdm'
export const createTask = (): OperationTask => ({
  inputMode: '输入',
  category: '',
  name: '',
  requirement: '',
  score: 0,
  choices: []
})
export const templateScore = (items: OperationTask[]): number =>
  round(
    sumBy(items, (item) => Number(item.score) || 0),
    2
  )
export const createTemplate = (): OperationTemplateInput => ({
  name: '',
  items: [createTask()],
  sort: 0,
  textColor: '',
  tagType: 'info',
  enabled: true
})
export function templatePayload(row: OperationTemplateInput): OperationTemplateInput {
  return {
    ...cloneDeep(pick(row, ['name', 'items', 'sort', 'textColor', 'tagType', 'enabled'])),
    name: row.name.trim(),
    textColor: row.textColor || ''
  }
}

/** 供导入、批处理等无 UI 场景复用；可编辑表格页面使用 ArtTable.validate 展示字段错误。 */
export function validateTasks(items: OperationTask[]): string {
  if (!items.length || items.length > 200) return '请添加 1 至 200 个任务项'
  for (const [index, item] of items.entries()) {
    if (!item.category.trim() || !item.name.trim())
      return `第 ${index + 1} 行：请填写任务分类和任务项名称`
    if (!Number.isFinite(item.score) || item.score < 0 || item.score > 100000)
      return `第 ${index + 1} 行：分数需在 0 至 100000 之间`
    if (item.inputMode === '选择' && !item.choices.some((value) => value.trim()))
      return `第 ${index + 1} 行：请添加选择项`
  }
  return ''
}

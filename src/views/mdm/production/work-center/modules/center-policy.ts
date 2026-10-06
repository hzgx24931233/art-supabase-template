import type { CenterPolicy, WorkCenterInput } from '@/api/mdm'

export interface CenterPolicyField {
  key: string
  label: string
  section: '报工规则' | '生产控制' | '人员与排程' | '自动化'
  values: string[]
  multiple?: boolean
  help?: string
}
export const centerPolicyFields: CenterPolicyField[] = [
  {
    key: 'reportMode',
    label: '报工',
    section: '报工规则',
    values: ['手动开始手动结束', '手动开始自动结束', '自动开始手动结束', '非生产工位']
  },
  {
    key: 'deviation',
    label: '当班进度偏差调整',
    section: '报工规则',
    values: ['调整到下一班次', 'PMC调整']
  },
  {
    key: 'materialCheck',
    label: '材料投料校验',
    section: '报工规则',
    values: ['无', '单料单批', '单料多批', '多料多批']
  },
  {
    key: 'timeAllocation',
    label: '工时分配',
    section: '报工规则',
    values: ['分摊', '多重配给'],
    help: '分摊：标准工时按人数分配；多重配给：每人获得完整标准工时。重新派工后生效。'
  },
  {
    key: 'goodDefault',
    label: '报工良品数默认值',
    section: '报工规则',
    values: ['无', '任务数量', '机器计数', '任务数量与机器计数取小值']
  },
  {
    key: 'quantityCheck',
    label: '报工数量检查',
    section: '报工规则',
    values: [
      '不检查',
      '超产提醒',
      '检查',
      '限额100%（仅良品）',
      '限额100%（含不良品）',
      '自定义限额',
      '限额机器计数',
      '限额工单100%（含不良品）'
    ]
  },
  {
    key: 'specialFields',
    label: '报工特殊项',
    section: '报工规则',
    values: ['无', '模具编号', '模穴数', '生产批号', '备注'],
    multiple: true
  },
  { key: 'parallel', label: '并行生产', section: '生产控制', values: ['不允许', '允许'] },
  {
    key: 'progressLimit',
    label: '进度限额',
    section: '生产控制',
    values: ['限额100%', '不限制', '限额120%']
  },
  { key: 'shiftLock', label: '班次锁定', section: '生产控制', values: ['不锁定', '锁定'] },
  { key: 'taskOrder', label: '任务排序(app)', section: '生产控制', values: ['不管控', '管控'] },
  { key: 'autoChangeover', label: '自动换线', section: '生产控制', values: ['否', '是'] },
  {
    key: 'inspectionSave',
    label: '检验保存',
    section: '生产控制',
    values: ['仅全部项完成可保存', '部分项完成可保存']
  },
  {
    key: 'startControl',
    label: '开始加工控制',
    section: '生产控制',
    values: [
      '不控制',
      '必须完成投料',
      '必须首检完成',
      '必须换模完成',
      '单次首检',
      '设备点检控制',
      '每次开工投料'
    ],
    multiple: true
  },
  {
    key: 'reportControl',
    label: '报工控制',
    section: '生产控制',
    values: ['不控制', '首检完成', '巡检控制', '末检控制', '上模完成', '与开工人一致'],
    multiple: true
  },
  { key: 'yellowPause', label: '黄灯暂停', section: '生产控制', values: ['否', '是'] },
  {
    key: 'personAllocation',
    label: '人员分配',
    section: '人员与排程',
    values: ['标准分配', '流水线分配', '按人员数量分配', '按人员报额分配']
  },
  {
    key: 'achievement',
    label: '当班达成率',
    section: '人员与排程',
    values: ['按产能计算', '按计划计算']
  },
  {
    key: 'clearBatch',
    label: '报工后清除原料批号',
    section: '人员与排程',
    values: ['不清除', '清除']
  },
  { key: 'quickJoin', label: '快捷参与', section: '人员与排程', values: ['关闭', '开启'] },
  {
    key: 'planOrder',
    label: '计划排序',
    section: '人员与排程',
    values: ['按分配时间', '按工序交期', '按单号大小']
  },
  {
    key: 'autoReport',
    label: '自动报工',
    section: '自动化',
    values: ['关闭', '班次结束', '自定义时间']
  },
  { key: 'autoStart', label: '自动开始', section: '自动化', values: ['关闭', '班次开始'] }
]
export const centerPolicyDictionaryCodes = centerPolicyFields.map(({ key }) => `mdmCenter_${key}`)

export const createCenterPolicy = (): CenterPolicy => ({
  ...Object.fromEntries(
    centerPolicyFields.map((f) => [f.key, f.multiple ? [f.values[0]] : f.values[0]])
  ),
  operationLimit: 0,
  operationUnit: '秒',
  customLimit: 100,
  groupTag: '',
  reportTime: '18:00'
})
export const createWorkCenter = (): WorkCenterInput => ({
  code: '',
  name: '',
  departmentId: '',
  operationControlCodeId: null,
  mainCenterId: null,
  personnelMode: '指定人数',
  headcount: 1,
  personIds: [],
  capacityMode: 'finite',
  dailyCapacityMinutes: 480,
  efficiencyPercent: 100,
  utilizationPercent: 100,
  parallelCapacity: 1,
  queueMinutes: 0,
  policy: createCenterPolicy(),
  sort: 0,
  remark: ''
})

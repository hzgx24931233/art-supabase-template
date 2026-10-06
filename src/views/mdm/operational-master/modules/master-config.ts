import type { FormItem } from '@/components/core/forms/art-form/index.vue'
import type { MasterGroupDomain, OperationalMasterKind, OperationalMasterRecord } from '@/api/mdm'

export interface MasterFieldConfig {
  key: keyof OperationalMasterRecord
  label: string
  type?: FormItem['type']
  width?: number
  minWidth?: number
  span?: number
  required?: boolean
  dictCode?: string
  reference?: 'customers' | 'departments' | 'workCenters' | 'units' | 'menus'
  multiple?: boolean
  table?: boolean
  exportable?: boolean
  systemGenerated?: boolean
  validation?: 'phone' | 'email'
  maxlength?: number
  placeholder?: string
}

export interface MasterFormSectionConfig {
  key: string
  title: string
  description: string
  fieldKeys: Array<keyof OperationalMasterRecord>
}

export interface OperationalMasterConfig {
  kind: OperationalMasterKind
  routeName: string
  title: string
  description: string
  icon: string
  eyebrow: string
  codeKey: keyof OperationalMasterRecord
  nameKey: keyof OperationalMasterRecord
  groupDomain?: MasterGroupDomain
  groupTitle?: string
  formSections: MasterFormSectionConfig[]
  fields: MasterFieldConfig[]
  formSpan?: number
  importable?: boolean
}

const baseFields: MasterFieldConfig[] = [
  {
    key: 'enabled',
    label: '启用状态',
    type: 'segment',
    dictCode: 'commonBoolean',
    width: 104,
    table: true,
    required: true
  },
  {
    key: 'remark',
    label: '备注',
    type: 'textarea',
    span: 24,
    minWidth: 220,
    table: true,
    placeholder: '补充业务说明，最多 1000 字'
  }
]

const configurations: Record<string, OperationalMasterConfig> = {
  customer: {
    kind: 'customer',
    routeName: 'MdmSalesCustomer',
    title: '客户',
    description: '统一维护客户身份、分组、联系与区域资料，与 TMS 共用同一客户主档。',
    icon: 'ri:building-2-line',
    eyebrow: 'SALES MASTER DATA',
    codeKey: 'customerCode',
    nameKey: 'customerName',
    groupDomain: 'customer',
    groupTitle: '客户分组',
    formSpan: 8,
    formSections: [
      {
        key: 'identity',
        title: '客户识别',
        description: '维护唯一编号、名称以及用于经营分析的分类口径。',
        fieldKeys: ['customerCode', 'customerName', 'groupId', 'industry', 'customerLevel']
      },
      {
        key: 'contact',
        title: '联系人信息',
        description: '统一维护主要联系人的部门、职位和联系方式，供下游业务实时引用。',
        fieldKeys: [
          'contactName',
          'contactPhone',
          'contactDepartment',
          'contactPosition',
          'contactEmail',
          'contactQq'
        ]
      },
      {
        key: 'finance',
        title: '财务信息',
        description: '维护开票与收付款资料，供合同、结算和票据业务使用。',
        fieldKeys: ['invoiceTitle', 'taxNo', 'bankName', 'bankAccount']
      },
      {
        key: 'address',
        title: '业务地址',
        description: '记录客户经营地址，便于订单、运输与现场作业复用。',
        fieldKeys: ['region', 'addressDetail']
      },
      {
        key: 'status',
        title: '状态与说明',
        description: '控制主档是否可被业务选择，并记录必要的维护说明。',
        fieldKeys: ['enabled', 'remark']
      }
    ],
    importable: true,
    fields: [
      { key: 'customerCode', label: '客户编号', required: true, minWidth: 150, table: true },
      { key: 'customerName', label: '客户名称', required: true, minWidth: 220, table: true },
      { key: 'groupId', label: '客户分组', type: 'treeSelect', minWidth: 150, table: true },
      {
        key: 'industry',
        label: '所属行业',
        type: 'select',
        dictCode: 'tmsCustomerIndustry',
        minWidth: 140,
        table: true
      },
      {
        key: 'customerLevel',
        label: '客户等级',
        type: 'select',
        dictCode: 'tmsCustomerLevel',
        minWidth: 120,
        table: true
      },
      { key: 'contactName', label: '姓名', maxlength: 50, minWidth: 120, table: true },
      {
        key: 'contactPhone',
        label: '联系电话',
        validation: 'phone',
        maxlength: 20,
        minWidth: 150,
        table: true
      },
      {
        key: 'contactDepartment',
        label: '部门',
        maxlength: 50,
        exportable: true,
        placeholder: '请输入联系人部门'
      },
      {
        key: 'contactPosition',
        label: '职位',
        maxlength: 50,
        exportable: true,
        placeholder: '请输入联系人职位'
      },
      {
        key: 'contactEmail',
        label: 'E-mail',
        validation: 'email',
        maxlength: 100,
        exportable: true,
        placeholder: '请输入邮箱地址'
      },
      {
        key: 'contactQq',
        label: 'QQ',
        maxlength: 20,
        exportable: true,
        placeholder: '请输入 QQ'
      },
      {
        key: 'invoiceTitle',
        label: '发票抬头',
        maxlength: 100,
        exportable: true
      },
      {
        key: 'taxNo',
        label: '纳税人识别号',
        maxlength: 40,
        exportable: true
      },
      { key: 'bankName', label: '开户行', maxlength: 100, exportable: true },
      {
        key: 'bankAccount',
        label: '银行账号',
        maxlength: 50,
        span: 16,
        exportable: true
      },
      { key: 'region', label: '省市区', span: 12, minWidth: 160, table: true },
      { key: 'addressDetail', label: '详细地址', span: 12, minWidth: 220, table: true },
      ...baseFields
    ]
  },
  project: {
    kind: 'project',
    routeName: 'MdmSalesProject',
    title: '项目',
    description: '围绕客户统一管理项目阶段、负责人、销售协同和交付地址。',
    icon: 'ri:briefcase-4-line',
    eyebrow: 'SALES MASTER DATA',
    codeKey: 'projectCode',
    nameKey: 'projectName',
    groupDomain: 'project',
    groupTitle: '项目分组',
    formSections: [
      {
        key: 'identity',
        title: '项目识别',
        description: '明确项目名称、所属客户与分组，项目编号可由系统自动生成。',
        fieldKeys: ['projectCode', 'projectName', 'customerId', 'groupId']
      },
      {
        key: 'lifecycle',
        title: '阶段与协同',
        description: '维护项目当前阶段、状态、来源和业务协同人员。',
        fieldKeys: [
          'projectMode',
          'projectStage',
          'projectStatus',
          'source',
          'ownerId',
          'salespersonId',
          'contactName',
          'contactPhone'
        ]
      },
      {
        key: 'delivery',
        title: '交付地址',
        description: '记录项目履约地点，供订单、运输与现场作业复用。',
        fieldKeys: ['region', 'addressDetail']
      },
      {
        key: 'status',
        title: '状态与说明',
        description: '控制项目主档是否可用，并补充特殊业务约定。',
        fieldKeys: ['enabled', 'remark']
      }
    ],
    importable: true,
    fields: [
      {
        key: 'projectCode',
        label: '项目编号',
        minWidth: 150,
        table: true,
        systemGenerated: true,
        placeholder: '创建后由系统生成'
      },
      { key: 'projectName', label: '项目名称', required: true, minWidth: 220, table: true },
      {
        key: 'customerId',
        label: '客户',
        type: 'select',
        reference: 'customers',
        required: true,
        minWidth: 190,
        table: true
      },
      { key: 'groupId', label: '项目分组', type: 'treeSelect', minWidth: 150, table: true },
      {
        key: 'projectMode',
        label: '项目模式',
        type: 'select',
        dictCode: 'mdmProjectMode',
        minWidth: 120,
        table: true
      },
      {
        key: 'projectStage',
        label: '项目阶段',
        type: 'select',
        dictCode: 'mdmProjectStage',
        minWidth: 120,
        table: true
      },
      {
        key: 'projectStatus',
        label: '项目状态',
        type: 'select',
        dictCode: 'mdmProjectStatus',
        minWidth: 120,
        table: true
      },
      { key: 'ownerId', label: '负责人', type: 'slot', minWidth: 130, table: true },
      { key: 'salespersonId', label: '销售员', type: 'slot', minWidth: 130, table: true },
      { key: 'contactName', label: '联系人', maxlength: 50, minWidth: 120, table: true },
      {
        key: 'contactPhone',
        label: '联系电话',
        validation: 'phone',
        maxlength: 20,
        minWidth: 150,
        table: true
      },
      { key: 'region', label: '省市区', minWidth: 160, table: true },
      { key: 'addressDetail', label: '详细地址', minWidth: 220, table: true },
      {
        key: 'source',
        label: '项目来源',
        type: 'select',
        dictCode: 'mdmProjectSource',
        minWidth: 130,
        table: true
      },
      ...baseFields
    ]
  },
  'activity-formula': {
    kind: 'activity-formula',
    routeName: 'MdmActivityFormula',
    title: '活动公式',
    description: '通过用途、活动类型和参数化表达式，统一计划与实际汇报活动量的计算口径。',
    icon: 'ri:function-line',
    eyebrow: 'PROCESS MASTER DATA',
    codeKey: 'code',
    nameKey: 'name',
    formSections: [
      {
        key: 'identity',
        title: '公式识别',
        description: '定义公式名称、用途、活动类型以及默认使用策略。',
        fieldKeys: ['code', 'name', 'purpose', 'activityTypes', 'isDefault']
      },
      {
        key: 'expression',
        title: '公式配置',
        description: '由参数、运算符与函数生成机器表达式和业务译文。',
        fieldKeys: ['formulaExpression', 'formulaTranslation', 'description']
      },
      {
        key: 'status',
        title: '状态与说明',
        description: '控制公式是否可被引用，并记录维护说明。',
        fieldKeys: ['enabled', 'remark']
      }
    ],
    fields: [
      { key: 'code', label: '公式编码', required: true, minWidth: 150, table: true },
      { key: 'name', label: '公式名称', required: true, minWidth: 190, table: true },
      {
        key: 'purpose',
        label: '用途',
        type: 'select',
        dictCode: 'mdmFormulaPurpose',
        required: true,
        minWidth: 170,
        table: true
      },
      {
        key: 'activityTypes',
        label: '活动类型',
        type: 'select',
        dictCode: 'mdmActivityType',
        multiple: true,
        required: true,
        minWidth: 120,
        table: true
      },
      {
        key: 'isDefault',
        label: '默认公式',
        type: 'segment',
        dictCode: 'commonBoolean',
        width: 100,
        table: true
      },
      {
        key: 'formulaExpression',
        label: '公式',
        required: true,
        span: 24,
        minWidth: 240,
        table: true,
        placeholder: '通过参数和运算符生成公式'
      },
      {
        key: 'formulaTranslation',
        label: '公式译文',
        systemGenerated: true,
        span: 24,
        minWidth: 240,
        table: true,
        placeholder: '系统根据公式自动生成'
      },
      {
        key: 'description',
        label: '公式说明',
        type: 'textarea',
        span: 24,
        minWidth: 240,
        table: true
      },
      ...baseFields
    ]
  },
  'operation-control-code': {
    kind: 'operation-control-code',
    routeName: 'MdmOperationControlCode',
    title: '工序控制码',
    description: '把排程、加工、汇报、检验和顺序控制规则收敛为可复用控制码。',
    icon: 'ri:code-box-line',
    eyebrow: 'PROCESS MASTER DATA',
    codeKey: 'controlCode',
    nameKey: 'controlCodeName',
    formSections: [
      {
        key: 'identity',
        title: '控制码识别',
        description: '维护可复用控制码，并明确是否进入生产排程。',
        fieldKeys: ['controlCode', 'controlCodeName', 'participatesScheduling']
      },
      {
        key: 'execution',
        title: '执行与汇报规则',
        description: '组合加工、汇报、检验、顺序和返工规则，形成统一执行口径。',
        fieldKeys: [
          'processingMode',
          'reportMode',
          'timeUnitId',
          'inspectionMode',
          'sequenceControl',
          'reworkMode'
        ]
      },
      {
        key: 'status',
        title: '状态与说明',
        description: '控制控制码是否可用，并记录维护说明。',
        fieldKeys: ['enabled', 'remark']
      }
    ],
    fields: [
      { key: 'controlCode', label: '控制码', required: true, minWidth: 140, table: true },
      { key: 'controlCodeName', label: '控制码名称', required: true, minWidth: 190, table: true },
      {
        key: 'participatesScheduling',
        label: '参与排程',
        type: 'segment',
        dictCode: 'commonBoolean',
        width: 110,
        table: true
      },
      {
        key: 'processingMode',
        label: '加工方式',
        type: 'select',
        dictCode: 'mdmProcessingMode',
        minWidth: 150,
        table: true
      },
      {
        key: 'reportMode',
        label: '汇报方式',
        type: 'select',
        dictCode: 'mdmReportMode',
        minWidth: 130,
        table: true
      },
      {
        key: 'timeUnitId',
        label: '工序时间单位',
        type: 'select',
        reference: 'units',
        minWidth: 150,
        table: true
      },
      {
        key: 'inspectionMode',
        label: '检验方式',
        type: 'select',
        dictCode: 'mdmInspectionMode',
        minWidth: 150,
        table: true
      },
      {
        key: 'sequenceControl',
        label: '汇报顺序控制',
        type: 'select',
        dictCode: 'mdmSequenceControl',
        minWidth: 150,
        table: true
      },
      {
        key: 'reworkMode',
        label: '返工方式',
        type: 'select',
        dictCode: 'mdmReworkMode',
        minWidth: 130,
        table: true
      },
      ...baseFields
    ]
  },
  operation: {
    kind: 'operation',
    routeName: 'MdmOperationSet',
    title: '工序集',
    description: '沉淀可复用工序及计价、车间、工作中心和不良原因口径。',
    icon: 'ri:git-commit-line',
    eyebrow: 'PROCESS MASTER DATA',
    codeKey: 'code',
    nameKey: 'name',
    groupDomain: 'operation',
    groupTitle: '工序分组',
    formSections: [
      {
        key: 'identity',
        title: '工序识别',
        description: '维护工序编码、名称、助记信息、业务分组和来源。',
        fieldKeys: ['code', 'name', 'mnemonic', 'groupId', 'source']
      },
      {
        key: 'production',
        title: '生产归属',
        description: '限定工序适用的车间与工作中心，保持生产范围清晰。',
        fieldKeys: ['departmentId', 'workCenterIds']
      },
      {
        key: 'pricing',
        title: '计价规则',
        description: '设置计价类型、标准工价与计价单位。',
        fieldKeys: ['pricingType', 'price', 'pricingUnitId']
      },
      {
        key: 'quality',
        title: '质量原因',
        description: '配置加工与来料不良原因，统一现场反馈口径。',
        fieldKeys: ['processingDefectReasons', 'materialDefectReasons']
      },
      {
        key: 'status',
        title: '状态与说明',
        description: '控制工序是否可被路线引用，并记录维护说明。',
        fieldKeys: ['enabled', 'remark']
      }
    ],
    importable: true,
    fields: [
      { key: 'code', label: '工序编码', required: true, minWidth: 150, table: true },
      { key: 'name', label: '工序名称', required: true, minWidth: 190, table: true },
      { key: 'mnemonic', label: '助记码', minWidth: 120, table: true },
      { key: 'groupId', label: '工序分组', type: 'treeSelect', minWidth: 150, table: true },
      {
        key: 'pricingType',
        label: '计价类型',
        type: 'select',
        dictCode: 'mdmPricingType',
        width: 110,
        table: true
      },
      {
        key: 'departmentId',
        label: '车间 / 产线',
        type: 'treeSelect',
        reference: 'departments',
        minWidth: 170,
        table: true
      },
      {
        key: 'workCenterIds',
        label: '工作中心',
        type: 'select',
        reference: 'workCenters',
        multiple: true,
        minWidth: 180,
        table: true
      },
      { key: 'price', label: '工价', type: 'number', width: 110, table: true },
      {
        key: 'pricingUnitId',
        label: '计价单位',
        type: 'select',
        reference: 'units',
        minWidth: 130,
        table: true
      },
      {
        key: 'source',
        label: '来源',
        type: 'select',
        dictCode: 'mdmMasterSource',
        width: 120,
        table: true
      },
      {
        key: 'processingDefectReasons',
        label: '加工不良原因',
        type: 'select',
        dictCode: 'mdmProcessingDefectReason',
        multiple: true,
        span: 24
      },
      {
        key: 'materialDefectReasons',
        label: '来料不良原因',
        type: 'select',
        dictCode: 'mdmMaterialDefectReason',
        multiple: true,
        span: 24
      },
      ...baseFields
    ]
  },
  workstation: {
    kind: 'workstation',
    routeName: 'MdmWorkstation',
    title: '工位配置',
    description: '按车间与工作中心划分装配工位，维护负责人和安灯设备标识。',
    icon: 'ri:layout-grid-line',
    eyebrow: 'PROCESS MASTER DATA',
    codeKey: 'workstationCode',
    nameKey: 'workstationName',
    formSections: [
      {
        key: 'identity',
        title: '工位识别',
        description: '维护清晰稳定的工位编号与名称。',
        fieldKeys: ['workstationCode', 'workstationName']
      },
      {
        key: 'assignment',
        title: '生产归属与负责人',
        description: '关联车间、工作中心和生产负责人，明确工位责任边界。',
        fieldKeys: ['departmentId', 'workCenterId', 'responsiblePersonId']
      },
      {
        key: 'device',
        title: '设备与状态',
        description: '绑定安灯设备标识，控制工位是否可用于生产配置。',
        fieldKeys: ['andonSimNo', 'enabled', 'remark']
      }
    ],
    fields: [
      { key: 'workstationCode', label: '工位编号', required: true, minWidth: 150, table: true },
      { key: 'workstationName', label: '工位名称', required: true, minWidth: 190, table: true },
      {
        key: 'departmentId',
        label: '车间 / 产线',
        type: 'select',
        reference: 'departments',
        required: true,
        minWidth: 170,
        table: true
      },
      {
        key: 'workCenterId',
        label: '工作中心',
        type: 'select',
        reference: 'workCenters',
        required: true,
        minWidth: 170,
        table: true
      },
      { key: 'responsiblePersonId', label: '工位负责人', type: 'slot', minWidth: 150, table: true },
      { key: 'andonSimNo', label: '安灯盒子 SIM 编号', minWidth: 180, table: true },
      ...baseFields
    ]
  }
}

export function resolveMasterConfig(path: string): OperationalMasterConfig {
  const key = path.split('/').filter(Boolean).at(-1) || 'customer'
  return configurations[key] ?? configurations.customer
}

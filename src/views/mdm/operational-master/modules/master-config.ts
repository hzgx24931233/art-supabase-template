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
  reference?:
    'customers' | 'departments' | 'workCenters' | 'units' | 'menus' | 'suppliers' | 'partCategories'
  multiple?: boolean
  table?: boolean
  exportable?: boolean
  systemGenerated?: boolean
  /** 新建记录的字段初始值；缺省为 null。布尔与非空枚举字段应显式声明以匹配数据库约束。 */
  defaultValue?: unknown
  /** 表单项下方的业务说明；缺省按字段语义生成。 */
  help?: string
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
  },
  cargo: {
    kind: 'cargo',
    routeName: 'MdmLogisticsCargo',
    title: '货物',
    description: '统一维护可运输货物的编码、规格与计费口径，供开单与运单费用复用。',
    icon: 'ri:archive-2-line',
    eyebrow: 'LOGISTICS MASTER DATA',
    codeKey: 'cargoCode',
    nameKey: 'cargoName',
    formSpan: 8,
    formSections: [
      {
        key: 'identity',
        title: '货物识别',
        description: '维护唯一编码、名称与规格，编码由编号规则生成。',
        fieldKeys: ['cargoCode', 'cargoName', 'specModel', 'unit']
      },
      {
        key: 'measure',
        title: '尺寸与重量',
        description: '记录单件体积、重量与货值，用于计费与装载校验。',
        fieldKeys: ['lengthM', 'widthM', 'heightM', 'volumeM3', 'weightKg', 'valueAmount']
      },
      {
        key: 'status',
        title: '状态与说明',
        description: '控制该货物是否可被业务选择，并记录维护说明。',
        fieldKeys: ['enabled', 'remark']
      }
    ],
    importable: true,
    fields: [
      {
        key: 'cargoCode',
        label: '货物编码',
        required: true,
        maxlength: 40,
        minWidth: 150,
        table: true
      },
      {
        key: 'cargoName',
        label: '货物名称',
        required: true,
        maxlength: 100,
        minWidth: 200,
        table: true
      },
      { key: 'specModel', label: '规格型号', maxlength: 100, minWidth: 160, table: true },
      { key: 'unit', label: '计量单位', required: true, maxlength: 20, minWidth: 100, table: true },
      { key: 'lengthM', label: '长（米）', type: 'number', exportable: true },
      { key: 'widthM', label: '宽（米）', type: 'number', exportable: true },
      { key: 'heightM', label: '高（米）', type: 'number', exportable: true },
      { key: 'volumeM3', label: '体积（立方米）', type: 'number', exportable: true },
      { key: 'weightKg', label: '重量（千克）', type: 'number', exportable: true },
      { key: 'valueAmount', label: '货值（元）', type: 'number', exportable: true },
      ...baseFields
    ]
  },
  carrier: {
    kind: 'carrier',
    routeName: 'MdmLogisticsCarrier',
    title: '承运商',
    description: '统一维护承运商资质、联系与结算资料，供运力配置与对账业务引用。',
    icon: 'ri:truck-line',
    eyebrow: 'LOGISTICS MASTER DATA',
    codeKey: 'carrierCode',
    nameKey: 'companyName',
    formSpan: 8,
    formSections: [
      {
        key: 'identity',
        title: '承运商识别',
        description: '维护唯一编码、公司名称、资质与派单渠道。',
        fieldKeys: [
          'carrierCode',
          'companyName',
          'carrierType',
          'legalRepresentative',
          'businessLicenseNo',
          'taxRegistrationNo',
          'dispatchChannel'
        ]
      },
      {
        key: 'contact',
        title: '联系人信息',
        description: '统一维护主要联系人的部门、职位和联系方式。',
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
        description: '维护开票与收付款资料，供对账与付款申请使用。',
        fieldKeys: ['invoiceTitle', 'taxNo', 'bankName', 'bankAccountName', 'bankAccount']
      },
      {
        key: 'address',
        title: '业务地址',
        description: '记录承运商经营地址，便于调度与现场协同。',
        fieldKeys: ['region', 'addressDetail', 'postalCode']
      },
      {
        key: 'capacity',
        title: '运力与合作',
        description: '登记可用运力规模与合同签署情况。',
        fieldKeys: ['driverCount', 'vehicleCount', 'signedContract']
      },
      {
        key: 'status',
        title: '状态与说明',
        description: '控制该承运商是否可被业务选择，并记录维护说明。',
        fieldKeys: ['enabled', 'remark']
      }
    ],
    importable: true,
    fields: [
      {
        key: 'carrierCode',
        label: '承运商编码',
        required: true,
        maxlength: 40,
        minWidth: 150,
        table: true
      },
      {
        key: 'companyName',
        label: '公司名称',
        required: true,
        maxlength: 120,
        minWidth: 220,
        table: true
      },
      {
        key: 'carrierType',
        label: '承运商类型',
        required: true,
        maxlength: 40,
        minWidth: 130,
        table: true
      },
      {
        key: 'dispatchChannel',
        label: '派单渠道',
        type: 'select',
        dictCode: 'mdmLogisticsDispatchChannel',
        required: true,
        minWidth: 120,
        table: true
      },
      { key: 'legalRepresentative', label: '法定代表人', maxlength: 50, exportable: true },
      { key: 'businessLicenseNo', label: '营业执照号', maxlength: 40, exportable: true },
      { key: 'taxRegistrationNo', label: '税务登记号', maxlength: 40, exportable: true },
      { key: 'contactName', label: '姓名', maxlength: 50, minWidth: 120, table: true },
      {
        key: 'contactPhone',
        label: '联系电话',
        validation: 'phone',
        maxlength: 20,
        minWidth: 150,
        table: true
      },
      { key: 'contactDepartment', label: '部门', maxlength: 50, exportable: true },
      { key: 'contactPosition', label: '职位', maxlength: 50, exportable: true },
      {
        key: 'contactEmail',
        label: 'E-mail',
        validation: 'email',
        maxlength: 100,
        exportable: true
      },
      { key: 'contactQq', label: 'QQ', maxlength: 20, exportable: true },
      { key: 'invoiceTitle', label: '发票抬头', maxlength: 100, exportable: true },
      { key: 'taxNo', label: '纳税人识别号', maxlength: 40, exportable: true },
      { key: 'bankName', label: '开户行', maxlength: 100, exportable: true },
      { key: 'bankAccountName', label: '账户名称', maxlength: 100, exportable: true },
      { key: 'bankAccount', label: '银行账号', maxlength: 50, exportable: true },
      { key: 'region', label: '省市区', span: 12, minWidth: 160, table: true },
      { key: 'addressDetail', label: '详细地址', span: 12, minWidth: 220, table: true },
      { key: 'postalCode', label: '邮政编码', maxlength: 10, exportable: true },
      { key: 'driverCount', label: '司机数量', type: 'number', defaultValue: 0, width: 110 },
      { key: 'vehicleCount', label: '车辆数量', type: 'number', defaultValue: 0, width: 110 },
      {
        key: 'signedContract',
        label: '已签合同',
        type: 'segment',
        dictCode: 'commonBoolean',
        defaultValue: false,
        width: 110
      },
      ...baseFields
    ]
  },
  station: {
    kind: 'station',
    routeName: 'MdmLogisticsStation',
    title: '站点',
    description: '维护收发货站点、所属区域与联系人，供开单与调度选择。',
    icon: 'ri:map-pin-2-line',
    eyebrow: 'LOGISTICS MASTER DATA',
    codeKey: 'stationCode',
    nameKey: 'stationName',
    formSpan: 8,
    formSections: [
      {
        key: 'identity',
        title: '站点识别',
        description: '维护唯一编码、名称与站点类型。',
        fieldKeys: ['stationCode', 'stationName', 'stationType']
      },
      {
        key: 'contact',
        title: '联系与区域',
        description: '登记行政区划编码、负责人与联系电话。',
        fieldKeys: ['regionCode', 'managerName', 'contactPhone']
      },
      {
        key: 'status',
        title: '排序与状态',
        description: '控制站点排序、是否可被业务选择，并记录维护说明。',
        fieldKeys: ['sort', 'enabled', 'remark']
      }
    ],
    importable: true,
    fields: [
      {
        key: 'stationCode',
        label: '站点编码',
        required: true,
        maxlength: 40,
        minWidth: 150,
        table: true
      },
      {
        key: 'stationName',
        label: '站点名称',
        required: true,
        maxlength: 100,
        minWidth: 200,
        table: true
      },
      {
        key: 'stationType',
        label: '站点类型',
        required: true,
        maxlength: 40,
        minWidth: 130,
        table: true
      },
      { key: 'regionCode', label: '行政区划编码', maxlength: 20, exportable: true },
      { key: 'managerName', label: '负责人', maxlength: 50, minWidth: 120, table: true },
      {
        key: 'contactPhone',
        label: '联系电话',
        validation: 'phone',
        maxlength: 20,
        minWidth: 140,
        table: true
      },
      { key: 'sort', label: '排序', type: 'number', defaultValue: 0, width: 90, table: true },
      ...baseFields
    ]
  },
  vehicle: {
    kind: 'vehicle',
    routeName: 'MdmLogisticsVehicle',
    title: '车辆',
    description:
      '统一维护车辆档案的识别、证件、运营状态与规格参数，自编号由编号规则生成，审核结论通过审批中心流转。',
    icon: 'ri:bus-2-line',
    eyebrow: 'LOGISTICS MASTER DATA',
    codeKey: 'plateNo',
    nameKey: 'plateNo',
    formSpan: 8,
    formSections: [
      {
        key: 'identity',
        title: '车辆识别',
        description: '车牌、自编号与车辆基本身份信息，自编号由编号规则自动生成。',
        fieldKeys: [
          'plateNo',
          'selfNo',
          'vehicleType',
          'originType',
          'vin',
          'manufacturer',
          'brandModel',
          'vehicleColor',
          'plateColor',
          'transportIndustry',
          'companyName'
        ]
      },
      {
        key: 'license',
        title: '证件与登记',
        description: '登记证件编号与各关键日期，用于年检与合规检查。',
        fieldKeys: [
          'operationCertNo',
          'purchaseCertNo',
          'registrationCertNo',
          'registerDate',
          'issueDate',
          'invoiceDate',
          'startUseDate',
          'serviceYears',
          'inspectionStartDate'
        ]
      },
      {
        key: 'operation',
        title: '运营状态',
        description: '记录运营与购置状态口径，审核结论请在审批中心办理。',
        fieldKeys: [
          'operationStatus',
          'operationStatusChangeDate',
          'purchaseStatus',
          'purchaseStatusChangeDate',
          'vehicleLevel',
          'businessType',
          'isAirConditioned',
          'isNewEnergy',
          'isDoubleDeck'
        ]
      },
      {
        key: 'dimension',
        title: '规格与载重',
        description: '外廓尺寸、质量与载重参数，用于配载与计费校验。',
        fieldKeys: [
          'grossMass',
          'curbWeight',
          'approvedLoadMass',
          'approvedPassengerCount',
          'seatCount',
          'overallLength',
          'overallWidth',
          'overallHeight',
          'platform',
          'frontTrack',
          'rearTrack',
          'wheelbase',
          'axleCount',
          'tireCount',
          'leafSpringCount'
        ]
      },
      {
        key: 'engine',
        title: '动力参数',
        description: '发动机、燃料与排放参数。',
        fieldKeys: [
          'engineNo',
          'engineModel',
          'fuelType',
          'displacement',
          'emissionStandard',
          'enginePower',
          'ratedTorqueSpeed',
          'engineTorque'
        ]
      },
      {
        key: 'driver',
        title: '驾驶人员',
        description: '登记主副驾信息，便于调度联系。',
        fieldKeys: ['driverOneName', 'driverOnePhone', 'driverTwoName', 'driverTwoPhone']
      },
      {
        key: 'warranty',
        title: '保修信息',
        description: '三包与质保的里程与时长口径。',
        fieldKeys: [
          'threeGuaranteeMileage',
          'threeGuaranteeDuration',
          'warrantyMileage',
          'warrantyDuration'
        ]
      },
      {
        key: 'status',
        title: '说明',
        description: '记录车辆档案的维护说明。',
        fieldKeys: ['remark']
      }
    ],
    fields: [
      {
        key: 'plateNo',
        label: '车牌号',
        required: true,
        maxlength: 20,
        minWidth: 130,
        table: true
      },
      {
        key: 'selfNo',
        label: '车辆自编号',
        systemGenerated: true,
        maxlength: 40,
        minWidth: 140,
        table: true,
        help: '由编号规则「车辆自编号」在保存时生成，无需手工填写。'
      },
      {
        key: 'vehicleType',
        label: '车辆类型',
        required: true,
        maxlength: 40,
        minWidth: 130,
        table: true
      },
      { key: 'originType', label: '来源类型', maxlength: 40, exportable: true },
      { key: 'vin', label: '车架号 / VIN', maxlength: 40, minWidth: 170, table: true },
      { key: 'manufacturer', label: '生产厂家', maxlength: 100, exportable: true },
      { key: 'brandModel', label: '品牌型号', maxlength: 60, minWidth: 140, table: true },
      { key: 'vehicleColor', label: '车身颜色', maxlength: 30, exportable: true },
      { key: 'plateColor', label: '号牌颜色', maxlength: 30, exportable: true },
      { key: 'transportIndustry', label: '运输行业', maxlength: 40, exportable: true },
      { key: 'companyName', label: '所属公司', maxlength: 100, minWidth: 160, table: true },
      { key: 'operationCertNo', label: '道路运输证号', maxlength: 60, exportable: true },
      { key: 'purchaseCertNo', label: '购车证号', maxlength: 60, exportable: true },
      { key: 'registrationCertNo', label: '登记证书号', maxlength: 60, exportable: true },
      { key: 'registerDate', label: '注册日期', type: 'date', exportable: true },
      { key: 'issueDate', label: '发证日期', type: 'date', exportable: true },
      { key: 'invoiceDate', label: '开票日期', type: 'date', exportable: true },
      { key: 'startUseDate', label: '启用日期', type: 'date', exportable: true },
      { key: 'serviceYears', label: '使用年限（年）', type: 'number', exportable: true },
      { key: 'inspectionStartDate', label: '年检起始日期', type: 'date', exportable: true },
      {
        key: 'operationStatus',
        label: '运营状态',
        required: true,
        defaultValue: 'operating',
        maxlength: 30,
        minWidth: 120,
        table: true,
        placeholder: '如 operating / idle / maintenance'
      },
      {
        key: 'operationStatusChangeDate',
        label: '运营状态变更日期',
        type: 'date',
        exportable: true
      },
      { key: 'purchaseStatus', label: '购置状态', maxlength: 30, exportable: true },
      {
        key: 'purchaseStatusChangeDate',
        label: '购置状态变更日期',
        type: 'date',
        exportable: true
      },
      { key: 'vehicleLevel', label: '车辆等级', maxlength: 30, exportable: true },
      { key: 'businessType', label: '业务类型', maxlength: 30, exportable: true },
      {
        key: 'isAirConditioned',
        label: '空调',
        type: 'segment',
        dictCode: 'commonBoolean',
        defaultValue: false,
        width: 96
      },
      {
        key: 'isNewEnergy',
        label: '新能源',
        type: 'segment',
        dictCode: 'commonBoolean',
        defaultValue: false,
        width: 96
      },
      {
        key: 'isDoubleDeck',
        label: '双层车',
        type: 'segment',
        dictCode: 'commonBoolean',
        defaultValue: false,
        width: 96
      },
      { key: 'grossMass', label: '总质量（千克）', type: 'number', exportable: true },
      { key: 'curbWeight', label: '整备质量（千克）', type: 'number', exportable: true },
      {
        key: 'approvedLoadMass',
        label: '核定载质量（千克）',
        type: 'number',
        minWidth: 150,
        table: true
      },
      { key: 'approvedPassengerCount', label: '核定载客（人）', type: 'number', exportable: true },
      { key: 'seatCount', label: '座位数', type: 'number', exportable: true },
      { key: 'overallLength', label: '外廓长（毫米）', type: 'number', exportable: true },
      { key: 'overallWidth', label: '外廓宽（毫米）', type: 'number', exportable: true },
      { key: 'overallHeight', label: '外廓高（毫米）', type: 'number', exportable: true },
      { key: 'platform', label: '平台', maxlength: 40, exportable: true },
      { key: 'frontTrack', label: '前轮距（毫米）', type: 'number', exportable: true },
      { key: 'rearTrack', label: '后轮距（毫米）', type: 'number', exportable: true },
      { key: 'wheelbase', label: '轴距（毫米）', type: 'number', exportable: true },
      { key: 'axleCount', label: '轴数', type: 'number', exportable: true },
      { key: 'tireCount', label: '轮胎数', type: 'number', exportable: true },
      { key: 'leafSpringCount', label: '钢板弹簧片数', type: 'number', exportable: true },
      { key: 'engineNo', label: '发动机号', maxlength: 60, exportable: true },
      { key: 'engineModel', label: '发动机型号', maxlength: 60, exportable: true },
      { key: 'fuelType', label: '燃料类型', maxlength: 30, minWidth: 120, table: true },
      { key: 'displacement', label: '排量（升）', type: 'number', exportable: true },
      { key: 'emissionStandard', label: '排放标准', maxlength: 30, exportable: true },
      { key: 'enginePower', label: '发动机功率（千瓦）', type: 'number', exportable: true },
      { key: 'ratedTorqueSpeed', label: '额定扭矩转速', type: 'number', exportable: true },
      { key: 'engineTorque', label: '发动机扭矩（牛·米）', type: 'number', exportable: true },
      { key: 'driverOneName', label: '主驾姓名', maxlength: 30, exportable: true },
      {
        key: 'driverOnePhone',
        label: '主驾电话',
        validation: 'phone',
        maxlength: 20,
        exportable: true
      },
      { key: 'driverTwoName', label: '副驾姓名', maxlength: 30, exportable: true },
      {
        key: 'driverTwoPhone',
        label: '副驾电话',
        validation: 'phone',
        maxlength: 20,
        exportable: true
      },
      { key: 'threeGuaranteeMileage', label: '三包里程（千米）', type: 'number', exportable: true },
      { key: 'threeGuaranteeDuration', label: '三包时长（月）', type: 'number', exportable: true },
      { key: 'warrantyMileage', label: '质保里程（千米）', type: 'number', exportable: true },
      { key: 'warrantyDuration', label: '质保时长（月）', type: 'number', exportable: true },
      {
        key: 'remark',
        label: '备注',
        type: 'textarea',
        span: 24,
        minWidth: 220,
        placeholder: '补充车辆档案说明，最多 1000 字'
      }
    ]
  },
  part: {
    kind: 'part',
    routeName: 'MdmLogisticsPart',
    title: '零部件',
    description: '维护零部件编码、类别、供应来源与质保口径，供维修与库存业务引用。',
    icon: 'ri:settings-3-line',
    eyebrow: 'LOGISTICS MASTER DATA',
    codeKey: 'partCode',
    nameKey: 'partName',
    formSpan: 8,
    formSections: [
      {
        key: 'identity',
        title: '零部件识别',
        description: '维护唯一编码、名称、所属类别与规格。',
        fieldKeys: ['partCode', 'partName', 'categoryId', 'brand', 'model', 'unit']
      },
      {
        key: 'supply',
        title: '供应与制造',
        description: '登记供应商与制造来源，便于采购与更换。',
        fieldKeys: ['supplierId', 'manufacturer', 'supplierContact']
      },
      {
        key: 'warranty',
        title: '质保与寿命',
        description: '登记易耗属性与质保、使用寿命口径。',
        fieldKeys: [
          'isConsumable',
          'warrantyMileage',
          'warrantyDuration',
          'serviceLife',
          'serviceMileage'
        ]
      },
      {
        key: 'status',
        title: '状态与说明',
        description: '控制该零部件是否可被业务选择，并记录维护说明。',
        fieldKeys: ['status', 'remark']
      }
    ],
    importable: true,
    fields: [
      {
        key: 'partCode',
        label: '零部件编码',
        required: true,
        maxlength: 40,
        minWidth: 150,
        table: true
      },
      {
        key: 'partName',
        label: '零部件名称',
        required: true,
        maxlength: 100,
        minWidth: 200,
        table: true
      },
      {
        key: 'categoryId',
        label: '所属类别',
        type: 'treeSelect',
        reference: 'partCategories',
        minWidth: 160,
        table: true
      },
      { key: 'brand', label: '品牌', maxlength: 50, minWidth: 120, table: true },
      { key: 'model', label: '型号', maxlength: 60, minWidth: 140, table: true },
      { key: 'unit', label: '计量单位', required: true, maxlength: 20, minWidth: 100, table: true },
      {
        key: 'supplierId',
        label: '供应商',
        type: 'select',
        reference: 'suppliers',
        minWidth: 180,
        table: true
      },
      { key: 'manufacturer', label: '生产厂家', maxlength: 100, exportable: true },
      { key: 'supplierContact', label: '供应联系人', maxlength: 50, exportable: true },
      {
        key: 'isConsumable',
        label: '易耗件',
        type: 'segment',
        dictCode: 'commonBoolean',
        defaultValue: false,
        width: 96,
        table: true
      },
      { key: 'warrantyMileage', label: '质保里程（千米）', type: 'number', exportable: true },
      { key: 'warrantyDuration', label: '质保时长（月）', type: 'number', exportable: true },
      { key: 'serviceLife', label: '使用时长（月）', type: 'number', exportable: true },
      { key: 'serviceMileage', label: '使用里程（千米）', type: 'number', exportable: true },
      {
        key: 'status',
        label: '状态',
        type: 'select',
        dictCode: 'status',
        required: true,
        defaultValue: '1',
        width: 100,
        table: true
      },
      { key: 'remark', label: '备注', type: 'textarea', span: 24, minWidth: 220 }
    ]
  },
  'part-category': {
    kind: 'part-category',
    routeName: 'MdmLogisticsPartCategory',
    title: '零部件类别',
    description: '维护零部件类别的层级与编码，供零部件归属与分类统计使用。',
    icon: 'ri:node-tree',
    eyebrow: 'LOGISTICS MASTER DATA',
    codeKey: 'categoryCode',
    nameKey: 'categoryName',
    formSpan: 8,
    formSections: [
      {
        key: 'identity',
        title: '类别识别',
        description: '维护上级类别、唯一编码与类别名称。',
        fieldKeys: ['parentId', 'categoryCode', 'categoryName']
      },
      {
        key: 'level',
        title: '层级与排序',
        description: '层级由上级自动推导，排序用于同级展示顺序。',
        fieldKeys: ['categoryLevel', 'sort']
      },
      {
        key: 'status',
        title: '状态与说明',
        description: '控制该类别是否可被业务选择，并记录维护说明。',
        fieldKeys: ['status', 'remark']
      }
    ],
    importable: true,
    fields: [
      {
        key: 'parentId',
        label: '上级类别',
        type: 'treeSelect',
        reference: 'partCategories',
        minWidth: 160,
        table: true
      },
      {
        key: 'categoryCode',
        label: '类别编码',
        required: true,
        maxlength: 40,
        minWidth: 150,
        table: true
      },
      {
        key: 'categoryName',
        label: '类别名称',
        required: true,
        maxlength: 100,
        minWidth: 200,
        table: true
      },
      {
        key: 'categoryLevel',
        label: '层级',
        type: 'number',
        systemGenerated: true,
        width: 90,
        table: true,
        help: '由上级类别自动推导：顶层为 1，下级依次递增。'
      },
      { key: 'sort', label: '排序', type: 'number', defaultValue: 1, width: 90, table: true },
      {
        key: 'status',
        label: '状态',
        type: 'select',
        dictCode: 'status',
        required: true,
        defaultValue: '1',
        width: 100,
        table: true
      },
      { key: 'remark', label: '备注', type: 'textarea', span: 24, minWidth: 220 }
    ]
  }
}

export function resolveMasterConfig(path: string): OperationalMasterConfig {
  const key = path.split('/').filter(Boolean).at(-1) || 'customer'
  return configurations[key] ?? configurations.customer
}

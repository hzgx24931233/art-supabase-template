export interface BusinessButtonDefinition {
  action: string
  title: string
  code?: string
}

export interface BusinessMenuButtonCatalogEntry {
  menuName: string
  buttons: BusinessButtonDefinition[]
}

const button = (action: string, title: string, code?: string): BusinessButtonDefinition => ({
  action,
  title,
  code
})

const crud = (
  options: {
    view?: boolean
    import?: boolean
    export?: boolean
  } = {}
): BusinessButtonDefinition[] => [
  ...(options.view ? [button('View', '查看')] : []),
  button('Add', '新增'),
  button('Edit', '编辑'),
  button('Delete', '删除'),
  ...(options.import ? [button('Import', '导入')] : []),
  ...(options.export ? [button('Export', '导出')] : [])
]

export const businessButtonPermissionCatalog: BusinessMenuButtonCatalogEntry[] = [
  // FMS 页面会跳转到这些 TMS 页面（TMS 不在模板范围内）：只登记页面级查看权限
  ...['TmsCarrier', 'TmsCustomer', 'TmsLoadedWaybillList'].map((menuName) => ({
    menuName,
    buttons: [button('View', '查看')]
  })),
  // 结算类页面共用同一组按钮（源目录里也是用 map 生成，按字面量裁剪时容易漏掉）
  ...['FinanceCarrierSettlement', 'FinanceCustomerSettlement'].map((menuName) => ({
    menuName,
    buttons: [
      button('View', '查看'),
      button('Add', '生成对账单'),
      button('Submit', '提交审核'),
      button('Approve', '审核通过'),
      button('Reject', '驳回'),
      button('Void', '作废'),
      button('Delete', '删除'),
      button('Export', '导出')
    ]
  })),
  {
    menuName: 'HrSkillMatrix',
    buttons: [button('View', '查看技能矩阵', 'Hr:SkillMatrix:View')]
  },
  {
    menuName: 'HrEmployeeRoster',
    buttons: [
      button('View', '查看员工', 'Hr:Employee:View'),
      button('Add', '新增员工', 'Hr:Employee:Add'),
      button('Edit', '编辑员工', 'Hr:Employee:Edit'),
      button('Delete', '删除员工', 'Hr:Employee:Delete')
    ]
  },
  {
    menuName: 'HrOrganizationPosition',
    buttons: [button('View', '查看组织岗位人员', 'Hr:OrganizationPosition:View')]
  },
  {
    menuName: 'HrPosition',
    buttons: [
      button('View', '查看岗位', 'Hr:Position:View'),
      button('Add', '新增岗位', 'Hr:Position:Add'),
      button('Edit', '编辑岗位', 'Hr:Position:Edit'),
      button('Delete', '删除岗位', 'Hr:Position:Delete')
    ]
  },
  {
    menuName: 'HrJobArchitecture',
    buttons: [
      button('JobFamilyView', '查看职族', 'Hr:JobFamily:View'),
      button('JobFamilyAdd', '新增职族', 'Hr:JobFamily:Add'),
      button('JobFamilyEdit', '编辑职族', 'Hr:JobFamily:Edit'),
      button('JobFamilyDelete', '删除职族', 'Hr:JobFamily:Delete'),
      button('GradeView', '查看职级', 'Hr:Grade:View'),
      button('GradeAdd', '新增职级', 'Hr:Grade:Add'),
      button('GradeEdit', '编辑职级', 'Hr:Grade:Edit'),
      button('GradeDelete', '删除职级', 'Hr:Grade:Delete'),
      button('JobProfileView', '查看标准职务', 'Hr:JobProfile:View'),
      button('JobProfileAdd', '新增标准职务', 'Hr:JobProfile:Add'),
      button('JobProfileEdit', '编辑标准职务', 'Hr:JobProfile:Edit'),
      button('JobProfileDelete', '删除标准职务', 'Hr:JobProfile:Delete')
    ]
  },
  {
    menuName: 'HrPersonnelChange',
    buttons: [
      button('View', '查看异动', 'Hr:PersonnelChange:View'),
      button('Add', '新增异动', 'Hr:PersonnelChange:Add'),
      button('Edit', '编辑异动', 'Hr:PersonnelChange:Edit'),
      button('Delete', '删除异动', 'Hr:PersonnelChange:Delete'),
      button('Submit', '提交审批', 'Hr:PersonnelChange:Submit'),
      button('Effect', '生效异动', 'Hr:PersonnelChange:Effect')
    ]
  },
  {
    menuName: 'HrLifecycle',
    buttons: [
      button('View', '查看事项', 'Hr:Lifecycle:View'),
      button('Add', '新增事项', 'Hr:Lifecycle:Add'),
      button('Edit', '编辑事项', 'Hr:Lifecycle:Edit'),
      button('Delete', '删除事项', 'Hr:Lifecycle:Delete'),
      button('Submit', '提交审批', 'Hr:Lifecycle:Submit'),
      button('CompleteTask', '完成任务', 'Hr:Lifecycle:CompleteTask'),
      button('Start', '启动或推进事项', 'Hr:Lifecycle:Start'),
      button('CompleteCase', '办结生命周期事项', 'Hr:Lifecycle:CompleteCase'),
      button('WaiveTask', '豁免生命周期任务', 'Hr:Lifecycle:WaiveTask'),
      button('ManageTemplate', '管理标准任务包', 'Hr:Lifecycle:ManageTemplate')
    ]
  },
  {
    menuName: 'HrCompliance',
    buttons: [
      button('View', '查看合同资质', 'Hr:Compliance:View'),
      button('Add', '新增合同或资质', 'Hr:Compliance:Add'),
      button('Edit', '编辑合同资质', 'Hr:Compliance:Edit'),
      button('Delete', '删除合规草稿', 'Hr:Compliance:Delete'),
      button('ContractRenew', '续签劳动合同', 'Hr:Compliance:Contract:Renew'),
      button('ContractTerminate', '终止劳动合同', 'Hr:Compliance:Contract:Terminate'),
      button('QualificationVerify', '核验员工资质', 'Hr:Compliance:Qualification:Verify'),
      button('QualificationRevoke', '撤销员工资质', 'Hr:Compliance:Qualification:Revoke')
    ]
  },
  {
    menuName: 'HrEmployeeRelations',
    buttons: [
      button('View', '查看员工关系案件', 'Hr:EmployeeRelations:View'),
      button('Add', '新增员工关系案件', 'Hr:EmployeeRelations:Add'),
      button('Edit', '编辑员工关系案件', 'Hr:EmployeeRelations:Edit'),
      button('Delete', '删除员工关系案件草稿', 'Hr:EmployeeRelations:Delete'),
      button('Assign', '分派与分级员工关系案件', 'Hr:EmployeeRelations:Assign'),
      button('Investigate', '调查员工关系案件', 'Hr:EmployeeRelations:Investigate'),
      button('Resolve', '提交员工关系案件解决结论', 'Hr:EmployeeRelations:Resolve'),
      button('Close', '结案或重新开启员工关系案件', 'Hr:EmployeeRelations:Close'),
      button('ActionManage', '管理员工关系处置行动', 'Hr:EmployeeRelations:Action:Manage'),
      button('SensitiveView', '查看员工关系敏感内容', 'Hr:EmployeeRelations:Sensitive:View')
    ]
  },
  {
    menuName: 'HrBenefits',
    buttons: [
      button('View', '查看福利与参保', 'Hr:Benefits:View'),
      button('PlanManage', '管理福利计划', 'Hr:Benefits:Plan:Manage'),
      button('EnrollmentManage', '管理员工参保', 'Hr:Benefits:Enrollment:Manage'),
      button('Approve', '审核员工参保', 'Hr:Benefits:Approve'),
      button('EventManage', '管理福利人生事件', 'Hr:Benefits:Event:Manage'),
      button('AmountView', '查看福利缴费金额', 'Hr:Benefits:Amount:View'),
      button('PayrollExport', '导出福利薪资输入', 'Hr:Benefits:Payroll:Export'),
      button('AmountEdit', '维护福利缴费金额', 'Hr:Benefits:Amount:Edit'),
      button('EvidenceView', '查看福利人生事件附件', 'Hr:Benefits:Evidence:View')
    ]
  },
  {
    menuName: 'HrEmployeeExperience',
    buttons: [
      button('View', '查看员工体验工作台', 'Hr:Experience:View'),
      button('SurveyManage', '管理员工体验调查', 'Hr:Experience:Survey:Manage'),
      button('QuestionManage', '管理员工体验调查题目', 'Hr:Experience:Question:Manage'),
      button('Launch', '发布、开放或关闭员工体验调查', 'Hr:Experience:Launch'),
      button('Respond', '填写匿名员工体验调查', 'Hr:Experience:Respond'),
      button('InsightsView', '查看匿名聚合洞察', 'Hr:Experience:Insights:View'),
      button('CommentsView', '查看匿名开放评论', 'Hr:Experience:Comments:View'),
      button('ActionManage', '管理员工体验改善行动', 'Hr:Experience:Action:Manage'),
      button('ActionClose', '验收员工体验改善行动', 'Hr:Experience:Action:Close')
    ]
  },
  {
    menuName: 'HrPeopleAnalytics',
    buttons: [button('View', '查看人力分析', 'Hr:PeopleAnalytics:View')]
  },
  {
    menuName: 'HrHeadcount',
    buttons: [
      button('View', '查看人力规划与编制', 'Hr:Headcount:View'),
      button('Add', '新增规划或有效编制', 'Hr:Headcount:Add'),
      button('Edit', '编辑规划或有效编制', 'Hr:Headcount:Edit'),
      button('Delete', '删除规划或有效编制', 'Hr:Headcount:Delete'),
      button('Submit', '提交人力规划', 'Hr:Headcount:Submit'),
      button('Approve', '审批人力规划', 'Hr:Headcount:Approve'),
      button('Activate', '启用人力规划', 'Hr:Headcount:Activate'),
      button('Close', '关闭人力规划', 'Hr:Headcount:Close')
    ]
  },
  {
    menuName: 'HrCompensation',
    buttons: [
      button('View', '查看薪酬管理', 'Hr:Compensation:View'),
      button('PolicyAdd', '新增薪酬政策', 'Hr:Compensation:Policy:Add'),
      button('PolicyEdit', '编辑薪酬政策', 'Hr:Compensation:Policy:Edit'),
      button('PolicyDelete', '删除薪酬政策', 'Hr:Compensation:Policy:Delete'),
      button('RecordAdd', '新增员工薪酬', 'Hr:Compensation:Record:Add'),
      button('RecordEdit', '编辑员工薪酬', 'Hr:Compensation:Record:Edit'),
      button('RecordDelete', '删除员工薪酬', 'Hr:Compensation:Record:Delete'),
      button('AmountView', '查看薪酬金额', 'Hr:Compensation:Amount:View'),
      button('AmountEdit', '编辑薪酬金额', 'Hr:Compensation:Amount:Edit'),
      button('Approve', '批准与终止薪酬', 'Hr:Compensation:Approve')
    ]
  },
  {
    menuName: 'HrCompensationReview',
    buttons: [
      button('View', '查看调薪复核', 'Hr:CompensationReview:View'),
      button('CycleManage', '管理调薪周期', 'Hr:CompensationReview:Cycle:Manage'),
      button('BudgetManage', '管理调薪预算', 'Hr:CompensationReview:Budget:Manage'),
      button('Recommend', '提交调薪建议', 'Hr:CompensationReview:Recommend'),
      button('Calibrate', '执行调薪校准', 'Hr:CompensationReview:Calibrate'),
      button('Approve', '批准调薪结果', 'Hr:CompensationReview:Approve'),
      button('Effect', '批量生效调薪', 'Hr:CompensationReview:Effect'),
      button('AmountView', '查看调薪金额', 'Hr:CompensationReview:Amount:View'),
      button('AmountEdit', '编辑调薪金额', 'Hr:CompensationReview:Amount:Edit')
    ]
  },
  {
    menuName: 'HrContingentWorkforce',
    buttons: [
      button('View', '查看外部用工', 'Hr:ContingentWorkforce:View'),
      button('VendorManage', '管理用工供应商', 'Hr:ContingentWorkforce:Vendor:Manage'),
      button('WorkerManage', '管理外部人员', 'Hr:ContingentWorkforce:Worker:Manage'),
      button('EngagementManage', '管理用工任务', 'Hr:ContingentWorkforce:Engagement:Manage'),
      button('ControlManage', '管理准入控制', 'Hr:ContingentWorkforce:Control:Manage'),
      button('Activate', '激活外部用工', 'Hr:ContingentWorkforce:Activate'),
      button('End', '执行外部人员退场', 'Hr:ContingentWorkforce:End'),
      button('PiiView', '查看外部人员联系方式', 'Hr:ContingentWorkforce:PII:View'),
      button('CostView', '查看外部用工成本', 'Hr:ContingentWorkforce:Cost:View'),
      button('CostEdit', '编辑外部用工成本', 'Hr:ContingentWorkforce:Cost:Edit')
    ]
  },
  {
    menuName: 'HrPolicyAcknowledgement',
    buttons: [
      button('View', '查看政策与签收', 'Hr:PolicyAcknowledgement:View'),
      button('PolicyManage', '管理政策草稿', 'Hr:PolicyAcknowledgement:Policy:Manage'),
      button('Publish', '发布与退役政策', 'Hr:PolicyAcknowledgement:Publish'),
      button('ReceiptManage', '管理政策签收', 'Hr:PolicyAcknowledgement:Receipt:Manage'),
      button('EvidenceView', '查看签收凭证', 'Hr:PolicyAcknowledgement:Evidence:View')
    ]
  },
  {
    menuName: 'HrOrganizationDesign',
    buttons: [
      button('View', '查看组织变革方案', 'Hr:OrganizationDesign:View'),
      button('ScenarioManage', '管理组织变革草稿', 'Hr:OrganizationDesign:Scenario:Manage'),
      button('ImpactReview', '提交影响评审', 'Hr:OrganizationDesign:Impact:Review'),
      button('Approve', '审批组织变革方案', 'Hr:OrganizationDesign:Approve'),
      button('Handoff', '移交组织主数据执行', 'Hr:OrganizationDesign:Handoff')
    ]
  },
  {
    menuName: 'HrInternalMobility',
    buttons: [
      button('View', '查看内部人才市场', 'Hr:InternalMobility:View'),
      button('OpportunityManage', '管理内部机会草稿', 'Hr:InternalMobility:Opportunity:Manage'),
      button('Publish', '发布与关闭内部机会', 'Hr:InternalMobility:Publish'),
      button('ApplicationSelf', '提交本人内部申请', 'Hr:InternalMobility:Application:Self'),
      button('ApplicationManage', '评审内部申请', 'Hr:InternalMobility:Application:Manage'),
      button('Convert', '转正式人事异动', 'Hr:InternalMobility:Convert')
    ]
  },
  {
    menuName: 'HrAbsence',
    buttons: [
      button('View', '查看假勤管理', 'Hr:Absence:View'),
      button('PolicyAdd', '新增假别与政策', 'Hr:Absence:Policy:Add'),
      button('PolicyEdit', '编辑假别与政策', 'Hr:Absence:Policy:Edit'),
      button('PolicyDelete', '删除假别与政策', 'Hr:Absence:Policy:Delete'),
      button('BalanceAdjust', '调整休假余额', 'Hr:Absence:Balance:Adjust'),
      button('RequestAdd', '新增休假申请', 'Hr:Absence:Request:Add'),
      button('RequestEdit', '编辑休假申请', 'Hr:Absence:Request:Edit'),
      button('RequestDelete', '删除休假申请', 'Hr:Absence:Request:Delete'),
      button('Submit', '提交与撤销休假', 'Hr:Absence:Submit'),
      button('Approve', '审批休假申请', 'Hr:Absence:Approve'),
      button('ReasonView', '查看休假原因与证明', 'Hr:Absence:Reason:View')
    ]
  },
  {
    menuName: 'HrWorkforceRisk',
    buttons: [button('View', '查看人力风险', 'Hr:WorkforceRisk:View')]
  },
  {
    menuName: 'HrTalentInventory',
    buttons: [button('View', '查看人才盘点', 'Hr:TalentInventory:View')]
  },
  {
    menuName: 'HrSuccession',
    buttons: [
      button('View', '查看继任规划', 'Hr:Succession:View'),
      button('PlanAdd', '新增继任计划', 'Hr:Succession:Plan:Add'),
      button('PlanEdit', '编辑继任计划', 'Hr:Succession:Plan:Edit'),
      button('PlanDelete', '删除继任计划', 'Hr:Succession:Plan:Delete'),
      button('CandidateAdd', '提名继任候选人', 'Hr:Succession:Candidate:Add'),
      button('CandidateEdit', '编辑继任候选人', 'Hr:Succession:Candidate:Edit'),
      button('CandidateDelete', '删除继任候选人', 'Hr:Succession:Candidate:Delete'),
      button('CandidateReview', '评审继任候选人', 'Hr:Succession:Candidate:Review'),
      button('ActionAdd', '新增发展行动', 'Hr:Succession:Action:Add'),
      button('ActionEdit', '编辑发展行动', 'Hr:Succession:Action:Edit'),
      button('ActionDelete', '删除发展行动', 'Hr:Succession:Action:Delete')
    ]
  },
  {
    menuName: 'HrAttendance',
    buttons: [
      button('View', '查看考勤', 'Hr:Attendance:View'),
      button('Add', '新增考勤排班', 'Hr:Attendance:Add'),
      button('Edit', '编辑考勤排班', 'Hr:Attendance:Edit'),
      button('Delete', '删除考勤排班', 'Hr:Attendance:Delete'),
      button('Evaluate', '执行工时核算', 'Hr:Attendance:Evaluate'),
      button('ReviewCorrection', '审核考勤修正', 'Hr:Attendance:ReviewCorrection'),
      button('ClosePeriod', '考勤期间封账', 'Hr:Attendance:ClosePeriod')
    ]
  },
  {
    menuName: 'HrSelfService',
    buttons: [
      button('View', '查看员工申请', 'Hr:SelfService:View'),
      button('Add', '新增员工申请', 'Hr:SelfService:Add'),
      button('Edit', '编辑员工申请', 'Hr:SelfService:Edit'),
      button('Delete', '删除员工申请', 'Hr:SelfService:Delete'),
      button('Submit', '提交员工服务工单', 'Hr:SelfService:Submit'),
      button('Assign', '分派员工服务工单', 'Hr:SelfService:Assign'),
      button('Resolve', '处理员工服务工单', 'Hr:SelfService:Resolve'),
      button('CatalogManage', '管理员工服务目录', 'Hr:SelfService:Catalog:Manage')
    ]
  },
  {
    menuName: 'HrPerformance',
    buttons: [
      button('View', '查看绩效', 'Hr:Performance:View'),
      button('Add', '新增绩效', 'Hr:Performance:Add'),
      button('Edit', '编辑绩效', 'Hr:Performance:Edit'),
      button('Delete', '删除绩效', 'Hr:Performance:Delete'),
      button('Activate', '启动或取消绩效周期', 'Hr:Performance:Activate'),
      button('Review', '提交绩效评价', 'Hr:Performance:Review'),
      button('Calibrate', '维护绩效校准结果', 'Hr:Performance:Calibrate'),
      button('Complete', '定案绩效结果', 'Hr:Performance:Complete')
    ]
  },
  {
    menuName: 'HrTalentDevelopment',
    buttons: [
      button('View', '查看人才发展', 'Hr:Talent:View'),
      button('Add', '新增人才发展记录', 'Hr:Talent:Add'),
      button('Edit', '编辑人才发展记录', 'Hr:Talent:Edit'),
      button('Delete', '删除人才发展记录', 'Hr:Talent:Delete'),
      button('PlanTransition', '推进培养计划', 'Hr:Talent:Plan:Transition'),
      button('CourseAdd', '新增课程', 'Hr:Talent:Course:Add'),
      button('CourseEdit', '编辑课程', 'Hr:Talent:Course:Edit'),
      button('CoursePublish', '发布与停用课程', 'Hr:Talent:Course:Publish'),
      button('CourseCompetency', '维护课程能力映射', 'Hr:Talent:Course:Competency'),
      button('SessionAdd', '新增培训班次', 'Hr:Talent:Session:Add'),
      button('SessionEdit', '编辑培训班次', 'Hr:Talent:Session:Edit'),
      button('SessionTransition', '推进培训班次', 'Hr:Talent:Session:Transition'),
      button('EnrollmentAdd', '安排员工学习', 'Hr:Talent:Enrollment:Add'),
      button('EnrollmentManage', '登记学习结果', 'Hr:Talent:Enrollment:Manage'),
      button('CertificateManage', '管理学习证书', 'Hr:Talent:Certificate:Manage')
    ]
  },
  {
    menuName: 'HrRecruitment',
    buttons: [
      button('View', '查看招聘', 'Hr:Recruitment:View'),
      button('Add', '新增招聘记录', 'Hr:Recruitment:Add'),
      button('Edit', '编辑招聘记录', 'Hr:Recruitment:Edit'),
      button('Delete', '删除招聘记录', 'Hr:Recruitment:Delete'),
      button('Submit', '提交招聘审批', 'Hr:Recruitment:Submit'),
      button('Effect', '启动招聘', 'Hr:Recruitment:Effect'),
      button('CandidateMove', '推进候选人阶段', 'Hr:Recruitment:Candidate:Move'),
      button('SensitiveView', '查看招聘敏感信息', 'Hr:Recruitment:Sensitive:View'),
      button('InterviewAdd', '安排面试', 'Hr:Recruitment:Interview:Add'),
      button('InterviewEdit', '调整或取消面试', 'Hr:Recruitment:Interview:Edit'),
      button('InterviewComplete', '提交面试评价', 'Hr:Recruitment:Interview:Complete'),
      button('OfferAdd', '创建 Offer', 'Hr:Recruitment:Offer:Add'),
      button('OfferEdit', '编辑 Offer', 'Hr:Recruitment:Offer:Edit'),
      button('OfferSubmit', '提交 Offer 审批', 'Hr:Recruitment:Offer:Submit'),
      button('OfferApprove', '审批 Offer', 'Hr:Recruitment:Offer:Approve'),
      button('OfferSend', '发送或撤回 Offer', 'Hr:Recruitment:Offer:Send'),
      button('OfferRespond', '登记 Offer 反馈', 'Hr:Recruitment:Offer:Respond'),
      button('HandoffAdd', '创建入职交接', 'Hr:Recruitment:Handoff:Add'),
      button('HandoffEdit', '编辑入职交接', 'Hr:Recruitment:Handoff:Edit'),
      button('HandoffComplete', '推进入职交接', 'Hr:Recruitment:Handoff:Complete'),
      button('TaskManage', '管理入职任务', 'Hr:Recruitment:Task:Manage')
    ]
  },
  {
    menuName: 'FinanceExceptionCenter',
    buttons: [button('View', '查看财务异常', 'FinanceExceptionCenter:View')]
  },
  {
    menuName: 'FinanceAccountSet',
    buttons: [
      button('View', '查看会计期间'),
      button('Add', '新增账套'),
      button('Edit', '编辑账套'),
      button('Active', '启用账套'),
      button('Suspended', '停用账套'),
      button('Archived', '归档账套'),
      button('ManagePeriod', '维护会计期间')
    ]
  },
  {
    menuName: 'FinanceAccountingSubject',
    buttons: [
      button('Initialize', '初始化核算基础'),
      button('Add', '新增科目'),
      button('Edit', '编辑科目'),
      button('Toggle', '启停科目')
    ]
  },
  {
    menuName: 'FinanceAccountingAuxiliary',
    buttons: [
      button('AddType', '新增维度'),
      button('EditType', '编辑维度'),
      button('DeleteType', '删除维度'),
      button('Sync', '同步主数据'),
      button('Add', '新增核算项目'),
      button('Edit', '编辑核算项目'),
      button('Toggle', '启停核算项目')
    ]
  },
  {
    menuName: 'FinanceAccountingCurrency',
    buttons: [
      button('AddCurrency', '新增外币'),
      button('EditCurrency', '编辑币种'),
      button('Toggle', '启停币种'),
      button('Add', '新增汇率'),
      button('Edit', '编辑汇率')
    ]
  },
  {
    menuName: 'FinanceOpeningBalance',
    buttons: [
      button('Add', '录入余额'),
      button('Edit', '编辑余额'),
      button('Delete', '删除余额'),
      button('Confirm', '确认并锁定'),
      button('Reopen', '反确认')
    ]
  },
  {
    menuName: 'FinanceVoucherCenter',
    buttons: [
      button('View', '查看'),
      button('Add', '新增凭证'),
      button('Edit', '编辑凭证'),
      button('Export', '导出'),
      button('Submit', '提交'),
      button('Approve', '审核通过'),
      button('Reject', '驳回'),
      button('Post', '过账'),
      button('Void', '作废'),
      button('Reverse', '冲销')
    ]
  },
  { menuName: 'FinanceVoucherTemplate', buttons: crud() },
  {
    menuName: 'FinanceAutoPosting',
    buttons: [
      button('Add', '新增规则'),
      button('Edit', '编辑规则'),
      button('Delete', '删除规则'),
      button('ProcessPending', '批量处理待办'),
      button('Retry', '重试事件'),
      button('View', '查看事件')
    ]
  },
  {
    menuName: 'FinanceFinancialReports',
    buttons: [
      button('ViewConfig', '查看取数口径'),
      button('EditConfig', '维护取数口径'),
      button('Export', '导出')
    ]
  },
  {
    menuName: 'FinanceLedgerCenter',
    buttons: [button('View', '查看账簿'), button('Export', '导出')]
  },
  {
    menuName: 'FinanceFixedAsset',
    buttons: [
      button('Add', '新增资产'),
      button('Edit', '编辑资产'),
      button('Delete', '删除资产'),
      button('ManageCategory', '维护资产类别'),
      button('Activate', '确认转固'),
      button('Suspend', '暂停折旧'),
      button('Resume', '恢复使用'),
      button('Dispose', '资产处置'),
      button('Depreciation', '折旧管理')
    ]
  },
  {
    menuName: 'FinanceAssetPayable',
    buttons: [button('View', '查看'), button('Add', '下推生成'), button('Approve', '审核应付')]
  },
  {
    menuName: 'FinanceCommercialBill',
    buttons: [
      button('View', '查看'),
      button('Add', '新增票据'),
      button('Edit', '编辑票据'),
      button('Delete', '删除票据'),
      button('Receive', '确认收票'),
      button('Issue', '确认出票'),
      button('Endorse', '背书转让'),
      button('Discount', '票据贴现'),
      button('Settle', '到期结算'),
      button('Cancel', '取消票据')
    ]
  },
  {
    menuName: 'FinancePayroll',
    buttons: [
      button('View', '查看'),
      button('Add', '新增批次'),
      button('Edit', '编辑批次'),
      button('Calculate', '计算薪资'),
      button('Approve', '审批并计提'),
      button('Pay', '确认发放'),
      button('Cancel', '取消批次')
    ]
  },
  {
    menuName: 'FinanceTaxManagement',
    buttons: [
      button('View', '查看'),
      button('Add', '新增税务期间'),
      button('Edit', '编辑税务期间'),
      button('Calculate', '计算税额'),
      button('Review', '复核税额'),
      button('File', '确认申报'),
      button('Pay', '确认缴税'),
      button('Cancel', '取消期间')
    ]
  },
  {
    menuName: 'FinancePeriodClose',
    buttons: [
      button('View', '查看'),
      button('Add', '发起关账'),
      button('Carryforward', '生成损益结转凭证'),
      button('Recheck', '重新检查'),
      button('Close', '确认结账'),
      button('Cancel', '取消关账'),
      button('Reopen', '反结账')
    ]
  },
  { menuName: 'FinanceFundAccount', buttons: crud() },
  {
    menuName: 'FinanceCashForecast',
    buttons: [button('View', '查看资金预测')]
  },
  {
    menuName: 'FinanceReceivableAging',
    buttons: [button('View', '查看应收账龄')]
  },
  {
    menuName: 'FinanceFundTransfer',
    buttons: [
      button('View', '查看'),
      button('Add', '新增调拨'),
      button('Edit', '编辑调拨'),
      button('Delete', '删除调拨'),
      button('Submit', '提交审批'),
      button('Approve', '审批通过'),
      button('Reject', '驳回'),
      button('Execute', '执行入账'),
      button('Reverse', '冲销调拨')
    ]
  },
  {
    menuName: 'FinanceBankReconciliation',
    buttons: [
      button('Add', '导入银行流水'),
      button('View', '进入对账'),
      button('AutoMatch', '自动匹配'),
      button('Match', '手工匹配'),
      button('Unmatch', '取消匹配'),
      button('Ignore', '忽略流水'),
      button('Complete', '完成对账'),
      button('Void', '作废对账')
    ]
  },
  {
    menuName: 'FinanceCashTransaction',
    buttons: [
      button('Import', 'AI 批量导入流水'),
      button('Add', '登记客户收款'),
      button('CreatePayment', '发起承运商付款申请'),
      button('View', '查看'),
      button('Allocate', '继续核销'),
      button('Void', '作废收付款'),
      button('Export', '导出')
    ]
  },
  {
    menuName: 'FinanceInvoiceManagement',
    buttons: [
      button('View', '查看'),
      button('Add', '登记发票'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Submit', '提交复核'),
      button('Approve', '审核通过'),
      button('Reject', '驳回'),
      button('Void', '作废'),
      button('AiAudit', 'AI 合规审核'),
      button('Export', '导出')
    ]
  },
  {
    menuName: 'FinanceCarrierPaymentApplication',
    buttons: [
      button('View', '查看'),
      button('Add', '新建付款申请'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Submit', '提交审批'),
      button('ViewApproval', '查看审批'),
      button('Execute', '付款登记'),
      button('Cancel', '取消'),
      button('Export', '导出')
    ]
  },
  {
    menuName: 'FinanceWaybillCost',
    buttons: [
      button('View', '查看'),
      button('Add', '新增运单费用'),
      button('Edit', '编辑费用'),
      button('Delete', '删除费用'),
      button('Submit', '提交审核'),
      button('Convert', '转费用报销'),
      button('Pay', '出纳付款'),
      button('AiAudit', 'AI 费用审核'),
      button('OcrLogs', 'OCR 识别记录'),
      button('ApprovalHistory', '审批记录')
    ]
  },
  { menuName: 'FinanceExpenseItem', buttons: [...crud(), button('AddChild', '新增下级')] },
  {
    menuName: 'FinanceWaybillProfit',
    buttons: [button('AiProfitAnalysis', 'AI 利润诊断'), button('Export', '导出')]
  },
  // 主数据（MDM）四块：物料 / 工程 / 销售 / 生产，页面位于 src/views/mdm
  {
    menuName: 'MdmAccessoryProcessing',
    buttons: [
      button('View', '查看'),
      button('Recognize', '识别清单'),
      button('SaveDraft', '保存草稿'),
      button('GenerateMaterial', '生成物料编码'),
      button('GenerateBom', '生成项目 BOM'),
      button('GenerateWorkOrder', '生成生产工单'),
      button('Generate', '生成物料和加工单', 'MdmAccessoryProcessing:Generate'),
      button('Add', '新增配件加工清单'),
      button('Copy', '复制配件加工件'),
      button('Edit', '编辑配件加工件'),
      button('Delete', '删除配件加工件')
    ]
  },
  {
    menuName: 'MdmActivityFormula',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Copy', '复制'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('ManageParameter', '管理公式参数'),
      button('Export', '导出')
    ]
  },
  {
    menuName: 'MdmBomMaintenance',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Copy', '复制'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Export', '导出'),
      button('Submit', '提交审核'),
      button('Approve', '审核'),
      button('Archive', '归档作废'),
      button('ManageGroup', '管理分组')
    ]
  },
  {
    menuName: 'MdmBomStructure',
    buttons: [button('View', '查看')]
  },
  {
    menuName: 'MdmBusinessType',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Copy', '复制'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Export', '导出')
    ]
  },
  {
    menuName: 'MdmComponentType',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('ManageGroup', '管理行业分组')
    ]
  },
  {
    menuName: 'MdmDocumentType',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Copy', '复制'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Export', '导出')
    ]
  },
  {
    menuName: 'MdmEsop',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Copy', '复制'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Import', '导入'),
      button('Export', '导出'),
      button('Enable', '启用'),
      button('Disable', '停用')
    ]
  },
  {
    menuName: 'MdmFactoryCalendar',
    buttons: [
      button('View', '查看'),
      button('Configure', '设置日历'),
      button('AddPattern', '新增轮班模式'),
      button('EditPattern', '编辑轮班模式'),
      button('DeletePattern', '删除轮班模式'),
      button('ReferencePattern', '参考轮班模式'),
      button('Reminder', '设置日历提醒')
    ]
  },
  {
    menuName: 'MdmMaterialArchive',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Copy', '复制'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Export', '导出'),
      button('Enable', '启用'),
      button('Disable', '停用')
    ]
  },
  {
    menuName: 'MdmMaterialAttributeGroup',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Copy', '复制'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Export', '导出'),
      button('Enable', '启用'),
      button('Disable', '停用')
    ]
  },
  {
    menuName: 'MdmMaterialCategory',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Copy', '复制'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Export', '导出'),
      button('Enable', '启用'),
      button('Disable', '停用')
    ]
  },
  {
    menuName: 'MdmMaterialCodeRule',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Copy', '复制'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Export', '导出'),
      button('Enable', '启用'),
      button('Disable', '停用')
    ]
  },
  {
    menuName: 'MdmMaterialType',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Copy', '复制'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Export', '导出'),
      button('Enable', '启用'),
      button('Disable', '停用')
    ]
  },
  {
    menuName: 'MdmOperationControlCode',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Copy', '复制'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Export', '导出')
    ]
  },
  {
    menuName: 'MdmOperationSet',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Copy', '复制'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Import', '导入'),
      button('Export', '导出'),
      button('ManageGroup', '管理分组')
    ]
  },
  {
    menuName: 'MdmOperationTemplate',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Copy', '复制'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Export', '导出'),
      button('Enable', '启用'),
      button('Disable', '禁用'),
      button('Bind', '绑定'),
      button('Unbind', '解绑')
    ]
  },
  {
    menuName: 'MdmPersonnelWorkCenter',
    buttons: [
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Export', '导出'),
      button('View', '查看'),
      button('Add', '新增')
    ]
  },
  {
    menuName: 'MdmProductionDepartment',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Import', '导入'),
      button('Export', '导出'),
      button('Enable', '启用'),
      button('Disable', '禁用')
    ]
  },
  {
    menuName: 'MdmProductionEquipment',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Copy', '复制'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Import', '导入'),
      button('Export', '导出'),
      button('Enable', '启用'),
      button('Disable', '停用')
    ]
  },
  {
    menuName: 'MdmProductionPersonnel',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Import', '导入'),
      button('Export', '导出'),
      button('Enable', '启用'),
      button('Disable', '禁用')
    ]
  },
  {
    menuName: 'MdmSalesCustomer',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Copy', '复制'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Import', '导入'),
      button('Export', '导出'),
      button('ManageGroup', '管理分组')
    ]
  },
  {
    menuName: 'MdmSalesProject',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Copy', '复制'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Import', '导入'),
      button('Export', '导出'),
      button('ManageGroup', '管理分组')
    ]
  },
  {
    menuName: 'MdmShiftScheduling',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Edit', '编辑'),
      button('Delete', '删除')
    ]
  },
  {
    menuName: 'MdmStatutoryHoliday',
    buttons: [
      button('View', '查看法定节假日'),
      button('Add', '新增法定节假日'),
      button('Edit', '编辑法定节假日'),
      button('Delete', '删除法定节假日'),
      button('Import', '导入法定节假日'),
      button('Export', '导出法定节假日')
    ]
  },
  {
    menuName: 'MdmUnitOfMeasure',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Copy', '复制'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Export', '导出'),
      button('Enable', '启用'),
      button('Disable', '停用')
    ]
  },
  {
    menuName: 'MdmWorkCenter',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Copy', '复制'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Import', '导入'),
      button('Export', '导出'),
      button('ExportQr', '导出二维码'),
      button('Configure', '设置'),
      button('Personnel', '人员安排'),
      button('Devices', '配置设备'),
      button('UpdateProcess', '更新产品工艺')
    ]
  },
  {
    menuName: 'MdmWorkstation',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Copy', '复制'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Export', '导出')
    ]
  }
]
export const systemButtonPermissionCatalog: BusinessMenuButtonCatalogEntry[] = [
  { menuName: 'Organization', buttons: crud({ view: true }) },
  {
    menuName: 'Menu',
    buttons: [
      button('View', '查看菜单'),
      button('Add', '新增菜单'),
      button('Edit', '编辑菜单'),
      button('Delete', '删除菜单')
    ]
  },
  {
    menuName: 'Tenant',
    buttons: [button('Add', '新增租户'), button('Edit', '编辑租户'), button('Delete', '停用租户')]
  },
  {
    menuName: 'SystemParam',
    buttons: [
      button('Add', '新增参数', 'System:SystemParam:Add'),
      button('Edit', '编辑参数', 'System:SystemParam:Edit'),
      button('Delete', '删除参数', 'System:SystemParam:Delete')
    ]
  },
  {
    menuName: 'DocumentNumberRule',
    buttons: [
      button('Add', '新增编号规则', 'System:DocumentNumberRule:Add'),
      button('Edit', '编辑编号规则', 'System:DocumentNumberRule:Edit')
    ]
  },
  {
    menuName: 'User',
    buttons: [
      button('Add', '新增用户'),
      button('Edit', '编辑用户'),
      button('Delete', '注销用户'),
      button('AssignRole', '分配角色'),
      button('ResetPassword', '初始化密码')
    ]
  },
  {
    menuName: 'Role',
    buttons: [
      button('Add', '新增角色'),
      button('Edit', '编辑角色'),
      button('Delete', '删除角色'),
      button('AssignPermission', '配置菜单权限')
    ]
  },
  {
    menuName: 'WebsiteConfig',
    buttons: [button('Publish', '保存并发布配置'), button('GenerateWordmark', 'AI 生成品牌字图')]
  },
  {
    menuName: 'AiConfiguration',
    buttons: [button('Edit', '编辑 AI 配置')]
  },
  {
    menuName: 'AiPrompt',
    buttons: [
      button('Add', '新建 Prompt 版本'),
      button('Edit', '编辑 Prompt 草稿'),
      button('Publish', '发布或回滚 Prompt'),
      button('Clone', '复制 Prompt 版本'),
      button('Delete', '删除 Prompt 草稿')
    ]
  },
  {
    menuName: 'AiProjectPlanner',
    buttons: [button('ManageWorkflow', '推进建议状态')]
  },
  {
    menuName: 'GeofenceConfig',
    buttons: [button('Edit', '编辑电子围栏')]
  },
  {
    menuName: 'FieldPermission',
    buttons: [button('Manage', '维护字段权限')]
  },
  {
    menuName: 'NotificationReminder',
    buttons: [
      button('View', '查看提醒配置'),
      button('AddRule', '新增提醒规则'),
      button('EditRule', '编辑提醒规则'),
      button('DeleteRule', '删除提醒规则'),
      button('EditChannel', '配置通知渠道'),
      button('TestChannel', '测试通知渠道'),
      button('Dispatch', '立即执行提醒')
    ]
  }
].map((entry) => ({
  ...entry,
  buttons: entry.buttons.map((definition) => ({
    ...definition,
    code: definition.code ?? `System:${entry.menuName}:${definition.action}`
  }))
}))

export const managedButtonPermissionCatalog = [
  ...businessButtonPermissionCatalog,
  ...systemButtonPermissionCatalog
]

export const resolveCatalogPermissionCode = (
  menuName: string,
  definition: BusinessButtonDefinition
): string => definition.code ?? `${menuName}:${definition.action}`

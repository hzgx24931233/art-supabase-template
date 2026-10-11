declare namespace Api {
  namespace NotificationReminder {
    type ChannelCode = 'in_app' | 'email' | 'sms' | 'dingtalk' | 'wecom'
    type ModuleCode = 'system' | 'fms'
    type RecipientStrategy = 'owner_then_roles'
    type TestStatus = 'pending' | 'delivered' | 'failed'

    interface Scenario {
      id: string
      scenarioCode: string
      scenarioName: string
      moduleCode: ModuleCode
      description?: string | null
      routePath: string
    }

    interface Rule {
      id?: string
      scenarioId: string
      scenarioCode?: string
      scenarioName?: string
      moduleCode?: ModuleCode
      ruleName: string
      leadDays: number
      repeatEveryDays?: number | null
      sendHour: number
      recipientStrategy: RecipientStrategy
      recipientRoleCodes: string[]
      channels: ChannelCode[]
      enabled: boolean
      updateTime?: string
      updateBy?: string | null
    }

    interface ChannelConfig {
      id: string
      channelCode: ChannelCode
      providerCode: string
      enabled: boolean
      config: Record<string, unknown>
      secretConfigured: boolean
      lastTestAt?: string | null
      lastTestStatus?: TestStatus | null
      lastError?: string | null
      updateTime?: string
    }

    interface WorkspaceSummary {
      activeSubjectCount: number
      dueWithin30Days: number
      enabledRuleCount: number
      enabledChannelCount: number
      pendingDeliveryCount: number
      failedDeliveryCount: number
    }

    interface Workspace {
      scenarios: Scenario[]
      rules: Rule[]
      channels: ChannelConfig[]
      summary: WorkspaceSummary
    }

    interface SaveChannelPayload {
      channelCode: ChannelCode
      providerCode: string
      enabled: boolean
      config: Record<string, unknown>
      secret?: Record<string, unknown> | null
    }

    interface DispatchResult {
      createdEventCount?: number
      createdDeliveryCount?: number
      deliveredInAppCount?: number
      updatedEventCount?: number
      claimedCount?: number
      deliveredCount?: number
      failedCount?: number
    }
  }
}

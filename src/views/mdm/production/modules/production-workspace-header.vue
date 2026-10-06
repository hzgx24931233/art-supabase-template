<template>
  <BusinessWorkspaceHeader
    eyebrow="PRODUCTION MASTER DATA"
    :title="title"
    :description="description"
    :icon="icon"
    :density="density"
    :tags="[
      { label: '生产主数据', type: 'primary', effect: 'plain' },
      { label: capability, type: 'success', effect: 'light' },
      { label: '租户级配置', type: 'info', effect: 'plain' }
    ]"
    :metrics="metrics"
  >
    <template v-if="$slots.actions" #actions><slot name="actions" /></template>
  </BusinessWorkspaceHeader>
</template>

<script setup lang="ts">
  import './production-workspace.scss'

  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric
  } from '@/components/business/business-workspace-header/index.vue'

  defineOptions({ name: 'ProductionWorkspaceHeader' })

  withDefaults(
    defineProps<{
      title: string
      description: string
      icon: string
      capability: string
      metrics?: BusinessWorkspaceMetric[]
      density?: 'default' | 'compact'
    }>(),
    {
      metrics: () => [],
      density: 'default'
    }
  )
</script>

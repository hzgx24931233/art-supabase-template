<template>
  <ArtDialog ref="dialogRef" size="lg">
    <div class="center-defaults-dialog">
      <ElAlert
        title="默认值仅用于后续新增的工作中心；已有工作中心继续保留当前配置。"
        type="info"
        :closable="false"
        show-icon
      />
      <ElAlert v-if="error" :title="error" type="error" :closable="false" show-icon />
      <ElTabs v-model="activeSection" stretch>
        <ElTabPane v-for="section in sections" :key="section" :label="section" :name="section" lazy>
          <ArtSectionCard
            :title="section"
            :subtitle="sectionDescriptions[section]"
            preserve-content-structure
          >
            <PolicyEditor v-model="policy" :section="section" />
          </ArtSectionCard>
        </ElTabPane>
      </ElTabs>
    </div>
  </ArtDialog>
</template>
<script setup lang="ts">
  import { ref } from 'vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import { useUserStore } from '@/store/modules/user'
  import { fetchCenterDefaults, saveCenterDefaults } from '@/api/mdm'
  import { centerPolicyDictionaryCodes, createCenterPolicy } from './center-policy'
  import PolicyEditor from './policy-editor.vue'
  const dialogRef = ref<ArtDialogExpose>()
  const policy = ref(createCenterPolicy())
  const error = ref('')
  const activeSection = ref<(typeof sections)[number]>('报工规则')
  const user = useUserStore()
  const sections = ['报工规则', '生产控制', '人员与排程', '自动化'] as const
  const sectionDescriptions = {
    报工规则: '新增工作中心默认采用的报工方式、数量校验与操作时限。',
    生产控制: '新增工作中心默认采用的投料、检验和完工控制策略。',
    人员与排程: '新增工作中心默认采用的人员参与和排程处理规则。',
    自动化: '新增工作中心默认采用的班次触发与自动报工规则。'
  } as const
  async function handleOpen(tenantId: string) {
    policy.value = createCenterPolicy()
    error.value = ''
    activeSection.value = '报工规则'
    await dialogRef.value?.handleOpen(undefined, {
      title: '工作中心常用配置',
      subtitle: '按业务环节维护新增工作中心的默认执行策略',
      confirmText: '保存默认配置',
      contentMaxHeight: '68vh',
      loading: true,
      onOpen: async (_d, api) => {
        try {
          const [defaults] = await Promise.all([
            fetchCenterDefaults(tenantId),
            Promise.all(centerPolicyDictionaryCodes.map((code) => user.ensureDictLoaded(code)))
          ])
          policy.value = defaults || createCenterPolicy()
        } catch {
          error.value = '默认配置加载失败，请关闭后重试'
        } finally {
          api.setLoading(false)
        }
      },
      onConfirm: async () => {
        if (error.value) return false
        try {
          await saveCenterDefaults(policy.value, tenantId)
        } catch {
          return false
        }
      }
    })
  }
  defineExpose({ handleOpen })
</script>
<style scoped lang="scss">
  .center-defaults-dialog {
    display: grid;
    gap: 12px;
    min-width: 0;

    :deep(.el-tabs__header) {
      margin-bottom: 16px;
    }
  }
</style>

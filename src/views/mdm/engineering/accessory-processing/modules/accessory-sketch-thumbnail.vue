<template>
  <div
    class="flex h-14 w-16 items-center justify-center overflow-hidden rounded border border-[var(--el-border-color-lighter)] bg-[var(--default-box-color)]"
  >
    <ElImage
      v-if="url"
      :src="url"
      :preview-src-list="[url]"
      :preview-teleported="true"
      :z-index="10000"
      :alt="alt"
      fit="contain"
      class="h-full w-full"
    />
    <span v-else class="px-1 text-center text-xs text-gray-500 dark:text-gray-400">{{
      path ? (loading ? '加载中' : '暂无预览') : '待补草图'
    }}</span>
  </div>
</template>

<script setup lang="ts">
  import { ref, watch } from 'vue'
  import { signAccessoryPath } from '@/api/mdm'

  const props = defineProps<{ path: string | null | undefined; alt: string }>()
  const url = ref('')
  const loading = ref(false)

  watch(
    () => props.path,
    async (path, _, onCleanup) => {
      url.value = ''
      if (!path) return
      let active = true
      onCleanup(() => {
        active = false
      })
      loading.value = true
      try {
        const signedUrl = await signAccessoryPath(path)
        if (active) url.value = signedUrl
      } catch {
        if (active) url.value = ''
      } finally {
        if (active) loading.value = false
      }
    },
    { immediate: true }
  )
</script>

import { fetchDocumentNumberRulesByKeys } from '@/api/document-number'

export function useDocumentNumberRule(ruleKey: string) {
  const rule = shallowRef<Api.SystemManage.DocumentNumberRuleItem>()
  const loading = ref(false)
  const hasLoaded = ref(false)
  const loadError = shallowRef<unknown>()
  let requestSequence = 0

  const loadRule = async (): Promise<void> => {
    hasLoaded.value = true
    const requestId = ++requestSequence
    rule.value = undefined
    loadError.value = undefined
    loading.value = true
    try {
      const { data, error } = await fetchDocumentNumberRulesByKeys([ruleKey])
      if (requestId !== requestSequence) return
      if (error) {
        loadError.value = error
        return
      }
      rule.value = data?.[0]
    } catch (error) {
      if (requestId === requestSequence) loadError.value = error
    } finally {
      if (requestId === requestSequence) loading.value = false
    }
  }

  const automatic = computed(() => rule.value?.autoEnabled === true)
  const description = computed(() => {
    if (loading.value || !hasLoaded.value) return '编号规则加载中'
    if (loadError.value) return '编号规则读取失败，请稍后重试。'
    if (!rule.value) return '尚未配置编号规则。'
    if (!rule.value.autoEnabled) return '当前规则为手工填写，保存时会校验编号唯一性。'
    return `保存时自动生成，示例：${rule.value.preview || rule.value.template}`
  })

  const inputProps = (isEdit: boolean, placeholder: string, lockOnEdit = false) => ({
    disabled:
      loading.value ||
      Boolean(loadError.value) ||
      (isEdit && lockOnEdit) ||
      (!isEdit && automatic.value),
    placeholder: !isEdit && automatic.value ? rule.value?.preview || '保存后自动生成' : placeholder
  })

  const manualRequired = (isEdit: boolean): boolean =>
    !isEdit && Boolean(rule.value && !rule.value.autoEnabled && rule.value.manualRequired)

  return { rule, loading, automatic, description, inputProps, manualRequired, loadRule }
}

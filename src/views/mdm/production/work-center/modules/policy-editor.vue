<template>
  <ArtDescriptions v-if="readonly" :data="display" :items="displayItems" :columns="2" />
  <ArtForm
    v-else
    v-model="model"
    :items="items"
    :span="12"
    label-position="top"
    :show-reset="false"
    :show-submit="false"
  />
</template>
<script setup lang="ts">
  import { computed } from 'vue'
  import type { FormItem } from '@/components/core/forms/art-form/index.vue'
  import type { CenterPolicy } from '@/api/mdm'
  import { useUserStore } from '@/store/modules/user'
  import { centerPolicyFields } from './center-policy'
  const props = defineProps<{ section?: string; readonly?: boolean }>()
  const model = defineModel<CenterPolicy>({ required: true })
  const user = useUserStore()
  const items = computed<FormItem[]>(() => {
    const list: FormItem[] = centerPolicyFields
      .filter((f) => !props.section || f.section === props.section)
      .map((f) => ({
        key: f.key,
        label: f.label,
        type: 'select',
        help: f.help,
        options: user.getDictMap['mdmCenter_' + f.key] ?? [],
        props: {
          multiple: f.multiple,
          collapseTags: true,
          collapseTagsTooltip: true,
          onChange: () => exclusive(f.key, f.values[0])
        }
      }))
    if (!props.section || props.section === '报工规则')
      list.push(
        {
          key: 'operationLimit',
          label: '操作时限',
          type: 'number',
          props: { min: 0, max: 86400, precision: 0 }
        },
        {
          key: 'operationUnit',
          label: '时限单位',
          type: 'select',
          options: user.getDictMap.mdmWorkCenterOperationUnit ?? []
        },
        {
          key: 'customLimit',
          label: '自定义限额（%）',
          type: 'number',
          hidden: model.value.quantityCheck !== '自定义限额',
          props: { min: 1, max: 10000, precision: 0 }
        },
        { key: 'groupTag', label: '组标签', type: 'input' }
      )
    if (!props.section || props.section === '自动化')
      list.push({
        key: 'reportTime',
        label: '自定义报工时间',
        type: 'timePicker',
        hidden: model.value.autoReport !== '自定义时间',
        props: { format: 'HH:mm', valueFormat: 'HH:mm' }
      })
    return list
  })
  function exclusive(key: string, none: string) {
    const value = model.value[key]
    if (Array.isArray(value) && value.length > 1 && value.includes(none))
      model.value = {
        ...model.value,
        [key]: value[value.length - 1] === none ? [none] : value.filter((v) => v !== none)
      }
  }
  const display = computed(() =>
    Object.fromEntries(
      items.value.map((i) => {
        const value = model.value[i.key]
        return [i.key, Array.isArray(value) ? value.join('、') : value]
      })
    )
  )
  const displayItems = computed(() =>
    items.value
      .filter((i) => !i.hidden)
      .map((i) => ({
        key: i.key,
        field: i.key,
        label: typeof i.label === 'string' ? i.label : i.key
      }))
  )
</script>

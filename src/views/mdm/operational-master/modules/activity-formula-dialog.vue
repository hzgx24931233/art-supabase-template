<template>
  <ArtDialog ref="dialogRef" size="xl">
    <div class="formula-dialog">
      <ArtEntitySummary
        compact
        icon="ri:function-line"
        eyebrow="ACTIVITY FORMULA"
        :title="model.name || '新活动公式'"
        :description="
          model.code
            ? `公式编码：${model.code}`
            : '组合业务参数与运算符，形成可复用的活动量计算规则。'
        "
      >
        <template #aside>
          <ElTag :type="model.enabled ? 'success' : 'info'" effect="light">
            {{ model.enabled ? '启用' : '停用' }}
          </ElTag>
        </template>
      </ArtEntitySummary>

      <ActivityFormulaDetail
        v-if="readonly"
        :record="model"
        :parameters="parameters"
        :tenant-options="tenantOptions"
      />

      <ArtForm
        custom-layout
        :show-reset="false"
        :show-submit="false"
        v-else
        ref="formRef"
        v-model="model"
        :rules="rules"
        label-position="top"
      >
        <ArtSectionCard class="formula-dialog__basic" preserve-content-structure>
          <header class="formula-dialog__section-header">
            <div>
              <span class="formula-dialog__eyebrow">基本信息</span>
              <h3>定义公式适用范围</h3>
            </div>
            <span class="formula-dialog__hint">用途会同步筛选下方可选参数</span>
          </header>

          <div class="formula-dialog__basic-grid">
            <ElFormItem
              v-if="shouldExposeTenantField"
              class="formula-dialog__field--wide"
              label="所属租户"
              prop="tenantId"
            >
              <ElSelect
                v-model="model.tenantId"
                filterable
                :disabled="readonly || (!!model.id && !copy)"
                placeholder="选择数据归属租户"
                @change="handleScopeChange"
              >
                <ElOption
                  v-for="tenant in tenantOptions"
                  :key="tenant.value"
                  :label="tenant.label"
                  :value="tenant.value"
                />
              </ElSelect>
            </ElFormItem>
            <ElFormItem class="formula-dialog__field--wide" label="公式编码" prop="code">
              <ElInput
                v-model="model.code"
                :disabled="readonly"
                maxlength="64"
                placeholder="例如 ACT_PREP_001"
              />
            </ElFormItem>
            <ElFormItem class="formula-dialog__field--wide" label="公式名称" prop="name">
              <ElInput
                v-model="model.name"
                :disabled="readonly"
                maxlength="160"
                placeholder="输入易于识别的公式名称"
              />
            </ElFormItem>
            <ElFormItem class="formula-dialog__field--wide" label="用途" prop="purpose">
              <ElSelect
                v-model="model.purpose"
                :disabled="readonly"
                placeholder="选择计划或汇报用途"
                @change="handlePurposeChange"
              >
                <ElOption
                  v-for="item in purposeOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </ElSelect>
            </ElFormItem>
            <ElFormItem
              :class="
                shouldExposeTenantField
                  ? 'formula-dialog__field--wide'
                  : 'formula-dialog__field--activity'
              "
              label="活动类型"
              prop="activityTypes"
            >
              <ElSelect
                v-model="model.activityTypes"
                multiple
                collapse-tags
                :disabled="readonly"
                placeholder="可选择多个活动类型"
              >
                <ElOption
                  v-for="item in activityTypeOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </ElSelect>
            </ElFormItem>
            <ElFormItem class="formula-dialog__field--status" label="默认公式">
              <ElSwitch
                v-model="model.isDefault"
                :disabled="readonly"
                inline-prompt
                active-text="是"
                inactive-text="否"
              />
            </ElFormItem>
            <ElFormItem class="formula-dialog__field--status" label="使用状态">
              <ElSwitch
                v-model="model.enabled"
                :disabled="readonly"
                inline-prompt
                active-text="启"
                inactive-text="停"
              />
            </ElFormItem>
          </div>
        </ArtSectionCard>

        <section class="formula-dialog__workspace">
          <aside class="parameter-panel art-card-xs">
            <header class="formula-dialog__section-header formula-dialog__section-header--compact">
              <div>
                <span class="formula-dialog__eyebrow">参数层级</span>
                <h3>选择计算参数</h3>
              </div>
              <div
                v-if="!readonly"
                class="parameter-panel__actions"
                v-auth="'MdmActivityFormula:ManageParameter'"
              >
                <ArtIconButton
                  class="parameter-panel__create"
                  icon="ri:add-line"
                  :label="model.purpose ? '新增参数分组' : '请先选择公式用途'"
                  :disabled="!model.purpose"
                  @click="openParameterEditor('group')"
                />
                <ArtIconButton
                  class="parameter-panel__refresh"
                  icon="ri:refresh-line"
                  label="刷新参数"
                  :loading="loadingParameters"
                  @click="loadParameters"
                />
              </div>
            </header>

            <ElInput
              v-model="parameterKeyword"
              clearable
              prefix-icon="Search"
              placeholder="搜索参数名称或编码"
            />
            <ArtEmptyState
              v-if="!model.purpose"
              class="parameter-panel__state"
              title="请先选择用途"
              description="参数会按所选用途自动级联。"
              size="compact"
              :visual-size="64"
            />
            <div v-else-if="parameterError" class="parameter-panel__empty is-error">
              <ArtSvgIcon icon="ri:error-warning-line" />
              <strong>参数加载失败</strong>
              <span>{{ parameterError }}</span>
              <ElButton link type="primary" @click="loadParameters">重新加载</ElButton>
            </div>
            <ElSkeleton v-else-if="loadingParameters" :rows="7" animated />
            <ArtEmptyState
              v-else-if="!parameterTree.length"
              class="parameter-panel__state"
              title="尚未配置公式参数"
              description="先新建分组，再在分组下维护可参与计算的参数。"
              size="compact"
              :visual-size="64"
            >
              <ElButton
                v-if="!readonly"
                v-auth="'MdmActivityFormula:ManageParameter'"
                type="primary"
                link
                @click="openParameterEditor('group')"
              >
                创建第一个节点
                <ArtSvgIcon icon="ri:arrow-right-line" />
              </ElButton>
            </ArtEmptyState>
            <ElScrollbar v-else class="parameter-panel__scroll">
              <ElTree
                class="parameter-panel__tree"
                :data="parameterTree"
                node-key="id"
                default-expand-all
                :expand-on-click-node="false"
                :filter-node-method="filterParameterNode"
                ref="parameterTreeRef"
                @node-click="insertParameter"
              >
                <template #default="{ data }">
                  <div
                    class="parameter-node"
                    :class="{ 'is-parameter': data.nodeType === 'parameter' }"
                  >
                    <span class="parameter-node__icon"
                      ><ArtSvgIcon
                        :icon="data.nodeType === 'group' ? 'ri:folder-3-line' : 'ri:braces-line'"
                    /></span>
                    <span class="parameter-node__main">
                      <strong>{{ data.name }}</strong>
                      <small
                        >{{ data.code
                        }}<template v-if="data.activityUnit">
                          · {{ unitLabel(data.activityUnit) }}</template
                        ></small
                      >
                    </span>
                    <span
                      v-if="!readonly"
                      class="parameter-node__actions"
                      v-auth="'MdmActivityFormula:ManageParameter'"
                      @click.stop
                    >
                      <ArtIconButton
                        v-if="data.nodeType === 'group'"
                        icon="ri:add-line"
                        label="新增下级参数"
                        @click="openParameterEditor('parameter', undefined, data)"
                      />
                      <ArtIconButton
                        icon="ri:edit-line"
                        label="编辑参数节点"
                        @click="openParameterEditor(data.nodeType, data)"
                      />
                      <ArtIconButton
                        icon="ri:delete-bin-6-line"
                        label="删除参数节点"
                        tone="danger"
                        @click="removeParameter(data)"
                      />
                    </span>
                    <ArtSvgIcon
                      v-if="data.nodeType === 'parameter' && !readonly"
                      class="parameter-node__insert"
                      icon="ri:add-circle-line"
                    />
                  </div>
                </template>
                <template #empty>
                  <ArtEmptyState
                    title="未找到匹配项"
                    description="请调整关键词或清空筛选条件。"
                    size="compact"
                    :visual-size="64"
                  />
                </template>
              </ElTree>
            </ElScrollbar>
          </aside>

          <main class="formula-editor art-card-xs">
            <header class="formula-dialog__section-header formula-dialog__section-header--compact">
              <div>
                <span class="formula-dialog__eyebrow">公式配置</span>
                <h3>组合计算规则</h3>
              </div>
              <span class="formula-dialog__hint">点击左侧参数，再选择运算符</span>
            </header>

            <div class="formula-editor__palette" :class="{ 'is-disabled': readonly }">
              <div class="palette-group">
                <span>运算符</span>
                <ElButton
                  v-for="item in operatorOptions"
                  :key="item.value"
                  plain
                  :disabled="readonly"
                  @click="addOperator(item)"
                >
                  <b>{{ item.symbol }}</b
                  ><small>{{ item.label }}</small>
                </ElButton>
              </div>
              <div class="palette-group">
                <span>函数</span>
                <ElButton
                  v-for="item in functionOptions"
                  :key="item.value"
                  plain
                  :disabled="readonly"
                  @click="addFunction(item)"
                  >{{ item.label }}</ElButton
                >
              </div>
              <div class="palette-group palette-group--constant">
                <span>常量</span>
                <ElInput
                  v-model="constantValue"
                  :disabled="readonly"
                  placeholder="输入数字"
                  @keyup.enter="addConstant"
                >
                  <template #append
                    ><ElButton :disabled="readonly" @click="addConstant">添加</ElButton></template
                  >
                </ElInput>
              </div>
            </div>

            <ElFormItem class="formula-editor__field" label="公式" prop="formulaTokens">
              <div class="formula-canvas" :class="{ 'is-empty': !model.formulaTokens?.length }">
                <div v-if="model.formulaTokens?.length" class="formula-canvas__tokens">
                  <button
                    v-for="(token, index) in model.formulaTokens"
                    :key="`${token.type}-${index}-${token.value}`"
                    type="button"
                    :class="['formula-token', `is-${token.type}`]"
                    :disabled="readonly"
                    :title="readonly ? token.label : '点击删除此项'"
                    @click="removeToken(index)"
                  >
                    {{ token.type === 'parameter' ? token.label : token.value }}
                  </button>
                </div>
                <div v-else class="formula-canvas__placeholder">
                  <ArtSvgIcon icon="ri:cursor-line" />
                  <span>从左侧选择参数，开始搭建公式</span>
                </div>
                <div v-if="!readonly" class="formula-canvas__tools">
                  <ElButton link :disabled="!model.formulaTokens?.length" @click="undoToken"
                    ><ArtSvgIcon icon="ri:arrow-go-back-line" />撤销</ElButton
                  >
                  <ElButton
                    link
                    type="danger"
                    :disabled="!model.formulaTokens?.length"
                    @click="clearFormula"
                    ><ArtSvgIcon icon="ri:delete-bin-line" />清空</ElButton
                  >
                </div>
              </div>
            </ElFormItem>

            <div class="formula-editor__preview-grid">
              <ElFormItem label="公式表达式">
                <ElInput
                  :model-value="formulaExpression"
                  readonly
                  type="textarea"
                  :rows="3"
                  placeholder="机器可计算表达式将在此生成"
                />
              </ElFormItem>
              <ElFormItem label="公式译文">
                <ElInput
                  :model-value="formulaTranslation"
                  readonly
                  type="textarea"
                  :rows="3"
                  placeholder="便于业务人员核对的中文译文"
                />
              </ElFormItem>
            </div>
            <ElFormItem label="公式说明">
              <ElInput
                v-model="model.description"
                :disabled="readonly"
                type="textarea"
                :rows="2"
                maxlength="500"
                show-word-limit
                placeholder="说明计算口径、边界条件或使用注意事项"
              />
            </ElFormItem>
          </main>
        </section>
      </ArtForm>
    </div>
  </ArtDialog>

  <ArtDialog ref="parameterDialogRef" size="sm">
    <ArtForm
      custom-layout
      :show-reset="false"
      :show-submit="false"
      ref="parameterFormRef"
      label-position="top"
      v-model="parameterEditor.model"
      :rules="parameterRules"
    >
      <div class="parameter-editor__grid">
        <ElFormItem label="节点类型" required>
          <ElSegmented
            v-model="parameterEditor.model.nodeType"
            :options="[
              { label: '分组', value: 'group' },
              { label: '参数', value: 'parameter' }
            ]"
            :disabled="!!parameterEditor.id"
            @change="handleParameterNodeTypeChange"
          />
        </ElFormItem>
        <ElFormItem label="上级分组">
          <ElTreeSelect
            v-model="parameterEditor.model.parentId"
            :data="parentGroupTree"
            node-key="id"
            check-strictly
            clearable
            :render-after-expand="false"
            placeholder="根级节点"
          />
        </ElFormItem>
        <ElFormItem label="节点编码" prop="code">
          <ElInput
            v-model="parameterEditor.model.code"
            maxlength="60"
            placeholder="以大写字母开头，可包含数字或下划线"
            @input="normalizeParameterCode"
          />
        </ElFormItem>
        <ElFormItem label="节点名称" prop="name">
          <ElInput
            v-model="parameterEditor.model.name"
            maxlength="100"
            placeholder="业务可读名称"
          />
        </ElFormItem>
        <template v-if="parameterEditor.model.nodeType === 'parameter'">
          <ElFormItem label="活动单位" prop="activityUnit">
            <ElSelect v-model="parameterEditor.model.activityUnit">
              <ElOption
                v-for="item in unitOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="关联字段" prop="relatedField">
            <ElInput
              v-model="parameterEditor.model.relatedField"
              maxlength="120"
              placeholder="例如 process_qty"
            />
          </ElFormItem>
        </template>
        <ElFormItem label="排序">
          <ElInputNumber
            v-model="parameterEditor.model.sort"
            :min="0"
            :max="999999"
            controls-position="right"
          />
        </ElFormItem>
        <ElFormItem label="启用">
          <ElSwitch v-model="parameterEditor.model.enabled" />
        </ElFormItem>
        <ElFormItem class="parameter-editor__wide" label="备注">
          <ElInput
            v-model="parameterEditor.model.remark"
            type="textarea"
            :rows="2"
            maxlength="500"
          />
        </ElFormItem>
      </div>
    </ArtForm>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import ArtForm from '@/components/core/forms/art-form/index.vue'
  import { cloneDeep } from 'lodash-es'
  import type { ElTree } from 'element-plus'
  import { ElMessage } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useTenantScopeFormPolicy } from '@/hooks/core/useTenantScopeFormPolicy'
  import { useUserStore } from '@/store/modules/user'
  import {
    deleteActivityFormulaParameter,
    fetchActivityFormulaParameters,
    saveActivityFormulaParameter,
    saveOperationalMaster,
    type ActivityFormulaParameter,
    type ActivityFormulaPurpose,
    type ActivityFormulaToken,
    type OperationalMasterRecord
  } from '@/api/mdm'
  import type { MasterDialogOpenData } from './master-dialog.vue'
  import ActivityFormulaDetail from './activity-formula-detail.vue'
  import {
    activityFormulaPurposeLabel,
    buildActivityFormulaParameterTree,
    expressionOf,
    functionOptions,
    operatorOptions,
    translationOf,
    validateFormula,
    type ActivityFormulaParameterTreeNode
  } from './activity-formula-builder'
  import { buildActivityFormulaWriteInput } from './activity-formula-payload'
  import {
    buildActivityFormulaParameterWriteInput,
    isActivityFormulaPurpose,
    type ActivityFormulaParameterFormModel
  } from './activity-formula-parameter'

  const emit = defineEmits<{ success: [mode: 'add' | 'edit'] }>()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const { confirmDelete } = useArtFeedback()
  const { shouldExposeTenantField } = useTenantScopeFormPolicy()
  const dialogRef = ref<ArtDialogExpose<MasterDialogOpenData>>()
  const parameterDialogRef = ref<ArtDialogExpose>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const parameterFormRef = ref<InstanceType<typeof ArtForm>>()
  const parameterTreeRef = ref<InstanceType<typeof ElTree>>()
  const tenantOptions = ref<Array<{ label: string; value: string }>>([])
  const readonly = ref(false)
  const copy = ref(false)
  const loadingParameters = ref(false)
  const parameterError = ref('')
  const parameters = ref<ActivityFormulaParameter[]>([])
  const parameterKeyword = ref('')
  const constantValue = ref('')
  const model = reactive<OperationalMasterRecord>(createEmptyModel(''))

  const parameterEditor = reactive({
    id: '',
    model: createEmptyParameter('group')
  })

  const purposeOptions = computed(() => {
    const options = dictionaryOptions('mdmFormulaPurpose').map((item) => ({
      ...item,
      label: activityFormulaPurposeLabel(item.value, item.label)
    }))
    const currentPurpose = String(model.purpose || '')
    if (currentPurpose && !options.some((item) => item.value === currentPurpose)) {
      options.unshift({
        label: activityFormulaPurposeLabel(currentPurpose),
        value: currentPurpose
      })
    }
    return options
  })
  const activityTypeOptions = computed(() => dictionaryOptions('mdmActivityType'))
  const unitOptions = computed(() => dictionaryOptions('mdmActivityUnit'))
  const formulaExpression = computed(() => expressionOf(model.formulaTokens ?? []))
  const formulaTranslation = computed(() => translationOf(model.formulaTokens ?? []))
  const parameterTree = computed(() => buildActivityFormulaParameterTree(parameters.value))
  const excludedParentIds = computed(() => {
    const ids = new Set<string>()
    if (!parameterEditor.id) return ids
    ids.add(parameterEditor.id)
    let foundDescendant = true
    while (foundDescendant) {
      foundDescendant = false
      for (const item of parameters.value) {
        if (!item.parentId || !ids.has(item.parentId) || ids.has(item.id)) continue
        ids.add(item.id)
        foundDescendant = true
      }
    }
    return ids
  })
  const parentGroupTree = computed(() =>
    buildActivityFormulaParameterTree(
      parameters.value.filter(
        (item) => item.nodeType === 'group' && !excludedParentIds.value.has(item.id)
      )
    )
  )
  const rules = {
    tenantId: [{ required: true, message: '请选择所属租户', trigger: 'change' }],
    code: [{ required: true, message: '请输入公式编码', trigger: 'blur' }],
    name: [{ required: true, message: '请输入公式名称', trigger: 'blur' }],
    purpose: [{ required: true, message: '请选择用途', trigger: 'change' }],
    activityTypes: [
      {
        type: 'array',
        required: true,
        min: 1,
        message: '请至少选择一个活动类型',
        trigger: 'change'
      }
    ],
    formulaTokens: [
      {
        validator: (
          _rule: unknown,
          value: ActivityFormulaToken[],
          callback: (error?: Error) => void
        ) => {
          const message = validateFormula(value ?? [])
          callback(message ? new Error(message) : undefined)
        },
        trigger: 'change'
      }
    ]
  }
  const parameterRules = {
    code: [
      { required: true, message: '请输入节点编码', trigger: 'blur' },
      {
        pattern: /^[A-Z][A-Z0-9_]{0,59}$/,
        message: '须以大写字母开头，且只能包含大写字母、数字和下划线',
        trigger: 'blur'
      }
    ],
    name: [{ required: true, message: '请输入节点名称', trigger: 'blur' }],
    activityUnit: [{ required: true, message: '请选择活动单位', trigger: 'change' }],
    relatedField: [
      { required: true, message: '请输入关联字段', trigger: 'blur' },
      {
        pattern: /^[A-Za-z_][A-Za-z0-9_.]{0,119}$/,
        message: '须以字母或下划线开头，且只能包含字母、数字、下划线和点',
        trigger: 'blur'
      }
    ]
  }

  function dictionaryOptions(code: string) {
    return (getDictMap.value[code] ?? []).map((item) => ({
      label: item.label || item.value,
      value: String(item.value)
    }))
  }

  function createEmptyModel(tenantId: string): OperationalMasterRecord {
    return {
      id: '',
      tenantId,
      code: '',
      name: '',
      purpose: null,
      activityType: null,
      activityTypes: [],
      isDefault: false,
      planExpression: '',
      reportExpression: '',
      formulaExpression: '',
      formulaTranslation: '',
      formulaTokens: [],
      description: '',
      enabled: true,
      remark: ''
    }
  }

  function createEmptyParameter(
    nodeType: 'group' | 'parameter',
    parentId: string | null = null
  ): ActivityFormulaParameterFormModel {
    return {
      tenantId: model.tenantId,
      purpose: isActivityFormulaPurpose(model.purpose) ? model.purpose : null,
      parentId,
      nodeType,
      code: '',
      name: '',
      activityUnit: nodeType === 'parameter' ? 'minute' : null,
      relatedField: '',
      sort: 0,
      enabled: true,
      remark: ''
    }
  }

  function unitLabel(value: string): string {
    return unitOptions.value.find((item) => item.value === value)?.label ?? value
  }
  function filterParameterNode(keyword: string, rawData: Record<string, unknown>): boolean {
    if (!keyword) return true
    const name = typeof rawData.name === 'string' ? rawData.name : ''
    const code = typeof rawData.code === 'string' ? rawData.code : ''
    return `${name} ${code}`.toLowerCase().includes(keyword.toLowerCase())
  }

  async function loadParameters(): Promise<void> {
    if (!model.tenantId || !model.purpose) {
      parameters.value = []
      return
    }
    loadingParameters.value = true
    parameterError.value = ''
    try {
      parameters.value = await fetchActivityFormulaParameters(
        model.tenantId,
        model.purpose as ActivityFormulaPurpose
      )
    } catch (error) {
      parameterError.value = getFriendlySupabaseErrorMessage(error, '公式参数加载失败，请重试')
    } finally {
      loadingParameters.value = false
    }
  }

  function handleScopeChange(): void {
    clearFormula()
    void loadParameters()
  }
  function handlePurposeChange(): void {
    clearFormula()
    void loadParameters()
  }
  function insertParameter(data: ActivityFormulaParameterTreeNode): void {
    if (readonly.value || data.nodeType !== 'parameter' || !data.enabled || !data.relatedField)
      return
    model.formulaTokens?.push({
      type: 'parameter',
      value: data.relatedField,
      label: data.name,
      parameterId: data.id
    })
  }
  function addOperator(item: (typeof operatorOptions)[number]): void {
    model.formulaTokens?.push({ type: 'operator', value: item.value, label: item.label })
  }
  function addFunction(item: (typeof functionOptions)[number]): void {
    model.formulaTokens?.push({ type: 'function', value: item.value, label: item.label })
  }
  function addConstant(): void {
    const value = constantValue.value.trim()
    if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) {
      ElMessage.warning('请输入有效数字')
      return
    }
    model.formulaTokens?.push({ type: 'number', value, label: value })
    constantValue.value = ''
  }
  function removeToken(index: number): void {
    if (!readonly.value) model.formulaTokens?.splice(index, 1)
  }
  function undoToken(): void {
    model.formulaTokens?.pop()
  }
  function clearFormula(): void {
    model.formulaTokens = []
  }

  function openParameterEditor(
    nodeType: 'group' | 'parameter',
    row?: ActivityFormulaParameter,
    parent?: ActivityFormulaParameter
  ): void {
    if (!isActivityFormulaPurpose(model.purpose)) {
      ElMessage.warning('请先选择公式用途，再维护参数层级')
      return
    }
    if (row) {
      const { id, ...input } = row
      parameterEditor.id = id
      parameterEditor.model = cloneDeep(input)
    } else {
      parameterEditor.id = ''
      parameterEditor.model = createEmptyParameter(nodeType, parent?.id ?? null)
    }
    parameterEditor.model.nodeType = nodeType
    void parameterDialogRef.value?.handleOpen(undefined, {
      title: parameterEditor.id ? '编辑参数节点' : '新增参数节点',
      subtitle: '维护参数层级、业务编码与公式字段映射。',
      confirmText: '保存节点',
      contentMaxHeight: '68vh',
      onOpen: async () => {
        await nextTick()
        parameterFormRef.value?.clearValidate()
      },
      onConfirm: saveParameter
    })
  }
  function normalizeParameterCode(value: string): void {
    parameterEditor.model.code = value.toUpperCase().replace(/[^A-Z0-9_]/g, '')
  }

  function handleParameterNodeTypeChange(value: 'group' | 'parameter'): void {
    if (value === 'parameter') {
      parameterEditor.model.activityUnit ||= 'minute'
      return
    }
    parameterEditor.model.activityUnit = null
    parameterEditor.model.relatedField = ''
  }
  async function saveParameter(): Promise<boolean> {
    try {
      await parameterFormRef.value?.validate()
    } catch {
      return false
    }
    try {
      const payload = buildActivityFormulaParameterWriteInput(parameterEditor.model)
      await saveActivityFormulaParameter(payload, parameterEditor.id || undefined)
      await loadParameters()
      return true
    } catch (error) {
      if (error instanceof Error && !error.cause) ElMessage.warning(error.message)
      return false
    }
  }
  async function removeParameter(row: ActivityFormulaParameter): Promise<void> {
    await confirmDelete(`确定删除参数节点“${row.name}”吗？`)
    await deleteActivityFormulaParameter(row.id)
    await loadParameters()
  }

  const handleOpen = async (data: MasterDialogOpenData): Promise<void> => {
    readonly.value = !!data.readonly
    copy.value = !!data.copy
    tenantOptions.value = data.tenantOptions
    const next = createEmptyModel(data.row?.tenantId || data.tenantId)
    if (data.row) Object.assign(next, cloneDeep(data.row))
    next.activityTypes = data.row?.activityTypes?.length
      ? [...data.row.activityTypes]
      : data.row?.activityType
        ? [data.row.activityType]
        : []
    next.formulaTokens = Array.isArray(data.row?.formulaTokens)
      ? cloneDeep(data.row.formulaTokens)
      : []
    if (!next.formulaTokens.length && data.row) {
      const legacy =
        data.row.formulaExpression || data.row.planExpression || data.row.reportExpression
      if (legacy)
        next.formulaTokens = [
          { type: 'literal', value: legacy, label: data.row.formulaTranslation || legacy }
        ]
    }
    if (data.copy) {
      next.id = ''
      next.code = `${next.code || ''}_COPY`
    }
    Object.assign(model, next)
    await dialogRef.value?.handleOpen(data, {
      title: readonly.value
        ? '活动公式详情'
        : data.copy
          ? '复制活动公式'
          : data.row
            ? '编辑活动公式'
            : '新增活动公式',
      subtitle: '按用途维护参数层级，并通过可视化组件构建计算公式。',
      showFooter: !readonly.value,
      confirmText: data.row && !data.copy ? '保存更改' : '创建活动公式',
      contentMaxHeight: '78vh',
      onOpen: async (_openData, api) => {
        api.setLoading(true)
        try {
          await Promise.all(
            ['mdmFormulaPurpose', 'mdmActivityType', 'mdmActivityUnit', 'commonBoolean'].map(
              (code) => userStore.ensureDictLoaded(code)
            )
          )
          await loadParameters()
          formRef.value?.clearValidate()
        } finally {
          api.setLoading(false)
        }
      },
      onConfirm: async () => {
        try {
          await formRef.value?.validate()
          const expression = formulaExpression.value
          const translation = formulaTranslation.value
          await saveOperationalMaster(
            'activity-formula',
            buildActivityFormulaWriteInput(model, expression, translation),
            data.row && !data.copy ? data.row.id : undefined
          )
          emit('success', data.row && !data.copy ? 'edit' : 'add')
          return true
        } catch {
          return false
        }
      }
    })
  }

  watch(parameterKeyword, (value) => parameterTreeRef.value?.filter(value))
  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .formula-dialog {
    display: grid;
    gap: var(--art-space-3);
    min-width: 0;
  }

  .formula-dialog__basic,
  .parameter-panel,
  .formula-editor {
    background: var(--el-bg-color);
    border: 1px solid var(--el-border-color-lighter);
  }

  .formula-dialog__basic {
    padding: var(--art-space-4) var(--art-space-5) 0;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--theme-color) 2.5%, var(--el-bg-color)) 0,
      var(--el-bg-color) 76px
    );
  }

  .formula-dialog__section-header {
    display: flex;
    gap: var(--art-space-3);
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--art-space-4);
  }

  .formula-dialog__section-header--compact {
    margin-bottom: var(--art-space-3);
  }

  .formula-dialog__section-header h3 {
    margin: 3px 0 0;
    font-size: 16px;
    color: var(--el-text-color-primary);
  }

  .formula-dialog__eyebrow {
    font-size: 11px;
    font-weight: 700;
    color: var(--el-color-primary);
    letter-spacing: 0.08em;
  }

  .formula-dialog__hint {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  .formula-dialog__basic-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 0 var(--art-space-4);

    :deep(.el-form-item) {
      margin-bottom: var(--art-space-4);
    }
  }

  .formula-dialog__field--wide {
    grid-column: span 2;
  }

  .formula-dialog__field--activity {
    grid-column: span 4;
  }

  .formula-dialog__field--status {
    grid-column: span 1;

    :deep(.el-form-item__content) {
      align-items: center;
      min-height: 40px;
    }
  }

  .formula-dialog__workspace {
    display: grid;
    grid-template-columns: minmax(300px, 32%) minmax(0, 1fr);
    gap: var(--art-space-3);
    min-height: 500px;
  }

  .parameter-panel,
  .formula-editor {
    min-width: 0;
    padding: var(--art-space-4);
  }

  .parameter-panel {
    display: flex;
    flex-direction: column;
    gap: var(--art-space-3);
  }

  .parameter-panel__actions {
    display: flex;
    gap: var(--art-space-2);
    align-items: center;
  }

  .parameter-panel__create {
    margin: 0;
  }

  .parameter-panel__create,
  .parameter-panel__refresh {
    margin: 0;
    color: var(--el-text-color-secondary);
  }

  .parameter-panel__scroll {
    flex: 1;
    min-height: 330px;
  }

  .parameter-panel__tree {
    --el-tree-node-hover-bg-color: transparent;

    :deep(.el-tree-node__content) {
      height: auto;
      min-height: 48px;
      padding: 2px 6px 2px 0;
      margin-bottom: 2px;
      border: 1px solid transparent;
      border-radius: var(--el-border-radius-base);
      transition:
        background-color var(--art-motion-duration-fast),
        border-color var(--art-motion-duration-fast);

      &:hover,
      &:focus-within {
        background: color-mix(in srgb, var(--theme-color) 8%, var(--default-box-color)) !important;
        border-color: color-mix(in srgb, var(--theme-color) 20%, transparent);
      }

      &:hover .parameter-node__actions,
      &:focus-within .parameter-node__actions {
        pointer-events: auto;
        opacity: 1;
      }
    }

    :deep(.el-tree-node__expand-icon) {
      color: var(--el-text-color-secondary);
    }
  }

  .parameter-panel__empty {
    display: flex;
    flex-direction: column;
    gap: var(--art-space-2);
    align-items: center;
    justify-content: center;
    min-height: 280px;
    padding: var(--art-space-5);
    color: var(--el-text-color-secondary);
    text-align: center;
    background: color-mix(in srgb, var(--el-fill-color-lighter) 52%, transparent);
    border: 1px dashed var(--el-border-color-lighter);
    border-radius: var(--art-control-radius);
  }

  .parameter-panel__empty strong {
    color: var(--el-text-color-primary);
  }

  .parameter-panel__empty span {
    max-width: 220px;
    font-size: 12px;
  }

  .parameter-panel__empty.is-error > svg {
    color: var(--el-color-danger);
  }

  .parameter-panel__state {
    min-height: 280px;
    background: color-mix(in srgb, var(--el-fill-color-lighter) 52%, transparent);
    border: 1px dashed var(--el-border-color-lighter);
    border-radius: var(--art-control-radius);
  }

  .parameter-node {
    display: flex;
    gap: var(--art-space-2);
    align-items: center;
    width: 100%;
    min-width: 0;
    padding: 7px 4px;
  }

  .parameter-node__icon {
    display: grid;
    flex: none;
    place-items: center;
    width: 28px;
    height: 28px;
    color: var(--el-text-color-secondary);
    background: var(--el-fill-color-light);
    border-radius: 8px;
  }

  .parameter-node.is-parameter .parameter-node__icon {
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
  }

  .parameter-node__main {
    display: grid;
    flex: 1;
    min-width: 0;
  }

  .parameter-node__main strong,
  .parameter-node__main small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .parameter-node__main strong {
    font-size: 13px;
    font-weight: 600;
  }

  .parameter-node__main small {
    color: var(--el-text-color-secondary);
  }

  .parameter-node__actions {
    display: flex;
    flex: none;
    gap: 2px;
    pointer-events: none;
    opacity: 0;
    transition: opacity var(--art-motion-duration-fast);
  }

  .parameter-node__insert {
    flex: none;
    color: var(--el-color-primary);
  }

  .formula-editor {
    display: flex;
    flex-direction: column;
  }

  .formula-editor__palette {
    display: grid;
    grid-template-columns: 1.35fr 1fr;
    gap: var(--art-space-3);
    padding: var(--art-space-3);
    background: color-mix(in srgb, var(--el-fill-color-light) 68%, var(--el-bg-color));
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--art-control-radius);
  }

  .palette-group {
    display: flex;
    flex-wrap: wrap;
    gap: var(--art-space-2);
    align-items: center;
  }

  .palette-group > span {
    width: 100%;
    font-size: 12px;
    font-weight: 600;
    color: var(--el-text-color-secondary);
  }

  .palette-group .el-button {
    min-width: 64px;
    margin: 0;
  }

  .palette-group .el-button b {
    margin-right: 5px;
    font-size: 16px;
  }

  .palette-group .el-button small {
    font-size: 11px;
    color: var(--el-text-color-secondary);
  }

  .palette-group--constant {
    grid-column: 1 / -1;
  }

  .palette-group--constant .el-input {
    max-width: 280px;
  }

  .formula-editor__field {
    margin-top: var(--art-space-4);
  }

  .formula-editor__field :deep(.el-form-item__content) {
    display: block;
    width: 100%;
  }

  .formula-canvas {
    min-height: 140px;
    padding: var(--art-space-3);
    background: color-mix(in srgb, var(--el-color-primary) 3%, var(--el-bg-color));
    border: 1px solid var(--el-border-color-light);
    border-radius: var(--art-control-radius);
  }

  .formula-canvas:focus-within {
    border-color: var(--el-color-primary);
    box-shadow: 0 0 0 3px var(--el-color-primary-light-9);
  }

  .formula-canvas:not(.is-empty) {
    border-color: var(--el-color-primary-light-7);
  }

  .formula-canvas__tokens {
    display: flex;
    flex-wrap: wrap;
    gap: var(--art-space-2);
    align-content: flex-start;
    min-height: 76px;
  }

  .formula-token {
    height: 34px;
    padding: 0 11px;
    color: var(--el-text-color-primary);
    cursor: pointer;
    background: var(--el-bg-color);
    border: 1px solid var(--el-border-color);
    border-radius: 8px;
  }

  .formula-token.is-parameter {
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
    border-color: var(--el-color-primary-light-7);
  }

  .formula-token.is-function {
    color: var(--el-color-success);
    background: var(--el-color-success-light-9);
    border-color: var(--el-color-success-light-7);
  }

  .formula-token:disabled {
    cursor: default;
  }

  .formula-canvas__placeholder {
    display: flex;
    gap: var(--art-space-2);
    align-items: center;
    justify-content: center;
    min-height: 76px;
    color: var(--el-text-color-placeholder);
  }

  .formula-canvas__tools {
    display: flex;
    justify-content: flex-end;
    padding-top: var(--art-space-2);
    border-top: 1px dashed var(--el-border-color-lighter);
  }

  .formula-editor__preview-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--art-space-4);
  }

  .parameter-editor__grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 var(--art-space-4);
  }

  .parameter-editor__wide {
    grid-column: 1 / -1;
  }

  :deep(.el-select),
  :deep(.el-input-number),
  :deep(.el-segmented) {
    width: 100%;
  }

  @media (width <= 1000px) {
    .formula-dialog__basic-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .formula-dialog__field--wide,
    .formula-dialog__field--activity,
    .formula-dialog__field--status {
      grid-column: span 1;
    }

    .formula-dialog__workspace {
      grid-template-columns: 1fr;
    }

    .parameter-panel__tree {
      max-height: 360px;
    }
  }

  @media (width <= 640px) {
    .formula-dialog__basic-grid,
    .formula-editor__preview-grid,
    .parameter-editor__grid {
      grid-template-columns: 1fr;
    }

    .formula-dialog__workspace {
      min-height: 0;
    }

    .formula-editor__palette {
      grid-template-columns: 1fr;
    }

    .palette-group--constant {
      grid-column: auto;
    }

    .formula-dialog__hint {
      display: none;
    }
  }
</style>

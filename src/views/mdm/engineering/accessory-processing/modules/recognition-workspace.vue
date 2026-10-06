<template>
  <ArtPermissionGuard permission="MdmAccessoryProcessing:View" resource-name="配件加工清单">
    <div class="business-workspace-page min-w-0 space-y-4 p-4 lg:p-6">
      <BusinessWorkspaceHeader
        eyebrow="ACCESSORY PROCESSING"
        title="配件加工清单"
        description="上传图片、PDF 或 DOCX，逐件校对并确认保存，再到清单中分别生成编码、项目 BOM 和生产工单。"
        icon="ri:shape-2-line"
        :tags="[
          { label: '一长度一加工件', type: 'primary' },
          { label: '图文绑定', type: 'success' },
          { label: '人工校对后生成', type: 'info' }
        ]"
      />

      <ArtSectionCard
        title="上传与识别"
        subtitle="原件与逐件草图保存在当前租户的私有文件区。"
        :preserve-content-structure="true"
      >
        <template #actions>
          <ElButton @click="downloadTemplate">
            <template #icon><ArtSvgIcon icon="ri:download-2-line" /></template>
            下载统一模板
          </ElButton>
        </template>
        <div class="grid gap-4 pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,320px)]">
          <div class="min-w-0 space-y-3">
            <label class="block text-sm font-medium">目标租户</label>
            <ElSelect
              v-if="isPlatformSuper && !effectiveTenantId"
              v-model="workspace.tenantId"
              filterable
              placeholder="先选择清单所属租户"
              class="w-full"
              @change="resetUpload"
            >
              <ElOption
                v-for="tenant in tenantOptions"
                :key="tenant.id"
                :label="tenant.tenantName || tenant.tenantCode"
                :value="tenant.id"
              />
            </ElSelect>
            <p v-else class="text-sm text-gray-500 dark:text-gray-400">{{ activeTenantName }}</p>
            <ArtUploadFile
              v-model="workspace.sourceUrl"
              title="选择加工清单"
              :file-name="workspace.sourceName"
              accept=".png,.jpg,.jpeg,.webp,.pdf,.docx"
              tip="支持图片、PDF、DOCX；每次识别前 3 页，单文件不超过 20 MB。旧版 DOC 请先另存为 DOCX。"
              :file-size="20 * 1024 * 1024"
              :disabled="!workspace.tenantId || workspace.recognizing || workspace.saving"
              :show-resource-picker="false"
              :upload-request="uploadSource"
              @resource-change="onSourceUploaded"
            />
          </div>
          <div class="flex min-w-0 flex-col justify-end gap-3">
            <ElButton
              v-auth="'MdmAccessoryProcessing:Recognize'"
              type="primary"
              :disabled="!workspace.pages.length || workspace.recognizing || workspace.saving"
              :loading="workspace.recognizing"
              @click="recognize"
              >识别清单内容</ElButton
            >
            <p class="text-xs leading-5 text-gray-500 dark:text-gray-400"
              >识别内容仅作为草稿。生成前请逐条检查长度、数量、材质和草图。</p
            >
          </div>
        </div>
      </ArtSectionCard>

      <ArtSectionCard
        id="accessory-recognition-result"
        class="scroll-mt-28"
        title="识别结果与校对"
        :subtitle="`共 ${draft.items.length} 个独立加工件，来自 ${rowGroups.length} 个原表行；每种长度独立编码与下单。`"
        :loading="workspace.recognizing"
        :error="workspace.recognitionError"
        error-title="清单识别未完成"
        :empty="!draft.items.length && !workspace.recognitionError"
        empty-title="尚无识别结果"
        empty-description="上传清单并点击识别，或在下方打开识别记录、已保存草稿。"
      >
        <template #actions>
          <ElTag v-if="draft.status === 'generated'" type="success">工单已生成</ElTag>
          <ElTag v-else-if="draft.status === 'bom_ready'" type="primary">BOM 已生成</ElTag>
          <ElTag v-else-if="draft.status === 'materials_ready'" type="primary">物料已生成</ElTag>
          <ElTag v-else-if="draft.id" type="warning">已保存草稿</ElTag>
        </template>
        <template #error-action>
          <ElButton type="primary" :disabled="!workspace.pages.length" @click="recognize"
            >重新识别</ElButton
          >
        </template>
        <div class="space-y-5 pt-4">
          <div
            v-if="!canSaveDraft || !['draft', 'materials_ready'].includes(draft.status)"
            class="grid gap-4 rounded-[var(--custom-radius)] bg-[var(--art-gray-100)] p-4 md:grid-cols-3 dark:bg-[var(--art-gray-200)]"
          >
            <div class="min-w-0">
              <p class="text-xs text-gray-600 dark:text-gray-300">项目名称</p>
              <p class="mt-1 break-words text-sm font-semibold">{{
                draft.projectName || '待确认'
              }}</p>
            </div>
            <div class="min-w-0">
              <p class="text-xs text-gray-600 dark:text-gray-300">图纸名称</p>
              <p class="mt-1 break-words text-sm font-semibold">{{
                draft.drawingName || '待确认'
              }}</p>
            </div>
            <div class="min-w-0">
              <p class="text-xs text-gray-600 dark:text-gray-300">识别状态</p>
              <p class="mt-1 text-sm font-medium">{{ draft.id ? '已保存清单' : '识别预览' }}</p>
            </div>
          </div>
          <div
            v-else
            class="rounded-[var(--custom-radius)] bg-[var(--art-gray-100)] p-4 dark:bg-[var(--art-gray-200)]"
          >
            <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 class="text-sm font-semibold">{{
                draft.status === 'materials_ready' ? '项目归属' : '清单归属'
              }}</h3>
              <p class="text-xs text-gray-600 dark:text-gray-300">
                {{
                  draft.status === 'materials_ready'
                    ? '关联已有项目，或选择项目客户后生成项目 BOM。'
                    : '关联已有项目，或填写名称与客户后在生成时创建项目。'
                }}
              </p>
            </div>
            <ArtForm
              :model-value="draft"
              :items="projectFormItems"
              :span="8"
              :gutter="16"
              label-position="top"
              :show-reset="false"
              :show-submit="false"
              root-class="accessory-inline-form mt-4"
            >
              <template #projectId>
                <ElSelect
                  v-model="draft.projectId"
                  clearable
                  filterable
                  placeholder="留空按名称查找或创建"
                  class="w-full"
                  :disabled="workspace.projectsLoading"
                  @change="onProjectSelected"
                >
                  <ElOption
                    v-for="project in workspace.projects"
                    :key="project.id"
                    :value="project.id"
                    :label="`${project.projectName} · ${project.projectCode}`"
                  />
                </ElSelect>
              </template>
              <template #customerId>
                <ElSelect
                  v-model="draft.customerId"
                  clearable
                  filterable
                  :placeholder="draft.projectId ? '已有项目未关联客户' : '新建项目时必选'"
                  class="w-full"
                  :disabled="Boolean(draft.projectId)"
                >
                  <ElOption
                    v-for="customer in workspace.customers"
                    :key="customer.id"
                    :value="customer.id"
                    :label="customer.customerName"
                  />
                </ElSelect>
              </template>
              <template #categoryId>
                <ElSelect
                  v-model="draft.categoryId"
                  clearable
                  filterable
                  placeholder="选择加工件所属分类"
                  class="w-full"
                  @change="onDefaultCategoryChanged"
                >
                  <ElOption
                    v-for="category in workspace.categories"
                    :key="category.id"
                    :value="category.id"
                    :label="category.categoryName"
                  />
                </ElSelect>
              </template>
            </ArtForm>
            <p
              v-if="draft.status === 'materials_ready'"
              class="text-xs leading-5 text-gray-600 dark:text-gray-300"
            >
              已关联项目时自动沿用其客户；如需选择其他客户，请先清除“关联已有项目”。未关联项目时，系统会按名称查找；找不到则使用所选客户创建。保存项目归属或直接生成
              BOM 均会保存当前选择。
            </p>
          </div>
          <ElAlert v-if="draft.warnings.length" type="warning" :closable="false" show-icon>
            <template #title>待核对提示 · {{ draft.warnings.length }} 项</template>
            <ul class="mt-1 list-disc space-y-1 pl-4 text-sm">
              <li v-for="(warning, index) in draft.warnings" :key="index">{{ warning }}</li>
            </ul>
          </ElAlert>
          <div
            v-if="canManageAccessory && draft.status !== 'generated'"
            class="mt-5! flex flex-wrap items-center justify-between gap-4 rounded-[var(--custom-radius)] border border-gray-200 bg-[var(--art-gray-100)] p-4 dark:border-gray-700 dark:bg-[var(--art-gray-200)]"
          >
            <div class="min-w-0 flex-1 basis-64">
              <p class="text-sm font-semibold">
                {{
                  draft.status === 'draft'
                    ? missingSketchCount
                      ? `${missingSketchCount} 件加工件待补草图`
                      : '校对完成后保存清单'
                    : '继续生成业务数据'
                }}
              </p>
              <p class="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-300">
                {{
                  draft.status === 'draft'
                    ? '保存后可在下方数据列表查看；生成前需为每件加工件关联独立草图。'
                    : '保存项目归属后，请回到清单分别点击“转项目 BOM”和“转生产工单”。'
                }}
              </p>
            </div>
            <div class="flex min-w-0 flex-wrap items-center gap-2">
              <ElButton
                v-if="draft.status === 'draft' || draft.status === 'materials_ready'"
                v-auth="'MdmAccessoryProcessing:SaveDraft'"
                :disabled="workspace.saving"
                :loading="workspace.saving"
                @click="draft.status === 'draft' ? saveDraft() : saveProjectAssignment()"
                >{{ draft.status === 'draft' ? '确认并保存清单' : '保存项目归属' }}</ElButton
              >
            </div>
          </div>
          <div class="space-y-2">
            <ElCollapse v-model="expandedRowKeys" class="accessory-result-collapse">
              <ElCollapseItem v-for="group in rowGroups" :key="group.key" :name="group.key">
                <template #title>
                  <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 py-1">
                    <span class="shrink-0 text-xs text-gray-600 dark:text-gray-300"
                      >原表第 {{ group.rowNo }} 行</span
                    >
                    <strong class="min-w-0 break-words text-sm font-semibold">{{
                      group.entries[0]?.item.name || '未命名构件'
                    }}</strong>
                    <span class="text-xs text-gray-600 dark:text-gray-300"
                      >{{ group.entries.length }} 个加工件 · {{ group.lengthSummary }}</span
                    >
                    <ElTag v-if="group.hasWarning" type="warning" size="small">需核对</ElTag>
                  </div>
                </template>
                <div class="divide-y divide-gray-100 dark:divide-gray-700">
                  <div
                    v-for="{ item, index } in group.entries"
                    :key="item.id || `${item.rowNo}-${index}`"
                  >
                    <div class="flex min-w-0 flex-wrap items-center gap-4 px-4 py-3">
                      <span
                        class="w-9 shrink-0 text-xs font-semibold tabular-nums text-gray-600 dark:text-gray-300"
                        >#{{ String(index + 1).padStart(2, '0') }}</span
                      >
                      <div class="min-w-28">
                        <p class="text-xs text-gray-600 dark:text-gray-300">加工长度</p>
                        <p class="mt-0.5 text-lg font-semibold tabular-nums leading-6"
                          >{{ item.lengthM.toFixed(3) }}
                          <span class="text-xs font-normal text-gray-600 dark:text-gray-300"
                            >m</span
                          ></p
                        >
                      </div>
                      <div class="min-w-14">
                        <p class="text-xs text-gray-600 dark:text-gray-300">数量</p>
                        <p class="mt-0.5 text-sm font-semibold tabular-nums"
                          >{{ item.quantity }} 件</p
                        >
                      </div>
                      <div class="min-w-18">
                        <p class="text-xs text-gray-600 dark:text-gray-300">展宽</p>
                        <p class="mt-0.5 text-sm font-medium tabular-nums"
                          >{{ item.widthMm ?? '—' }} mm</p
                        >
                      </div>
                      <div class="min-w-36 flex-1">
                        <p class="text-xs text-gray-600 dark:text-gray-300">材质与颜色</p>
                        <p class="mt-0.5 break-words text-sm font-medium">{{
                          item.materialColor || '待确认'
                        }}</p>
                      </div>
                      <div v-if="item.remark" class="min-w-36 flex-1">
                        <p class="text-xs text-gray-600 dark:text-gray-300">备注</p>
                        <p class="mt-0.5 break-words text-sm">{{ item.remark }}</p>
                      </div>
                      <div class="flex w-28 shrink-0 items-center gap-2">
                        <ElImage
                          v-if="workspace.sketchUrls[index]"
                          :src="workspace.sketchUrls[index]"
                          :preview-src-list="[workspace.sketchUrls[index]]"
                          :preview-teleported="true"
                          :z-index="10000"
                          :alt="`${item.name} ${item.lengthM} 米加工草图`"
                          fit="contain"
                          class="h-14 w-16 rounded border border-gray-200 bg-white dark:border-gray-700"
                        />
                        <span v-else class="text-xs font-medium text-amber-700 dark:text-amber-400"
                          >待补草图</span
                        >
                      </div>
                      <ElButton
                        v-if="canSaveDraft && draft.status === 'draft'"
                        link
                        type="primary"
                        :aria-label="`${editingIndex === index ? '收起' : '校对'}加工件 ${index + 1}`"
                        @click="editingIndex = editingIndex === index ? null : index"
                        >{{ editingIndex === index ? '收起' : '校对' }}</ElButton
                      >
                      <ElButton
                        v-if="canSaveDraft && !draft.id && draft.status === 'draft'"
                        link
                        type="danger"
                        :aria-label="`从识别预览移除加工件 ${index + 1}`"
                        @click="removePreviewItem(index)"
                        >移除</ElButton
                      >
                      <ElTag v-else-if="item.materialId" type="success" size="small"
                        >已生成物料</ElTag
                      >
                    </div>
                    <div
                      v-if="editingIndex === index && canSaveDraft && draft.status === 'draft'"
                      class="border-t border-gray-100 bg-[var(--art-gray-100)] px-4 py-5 dark:border-gray-700 dark:bg-[var(--art-gray-200)]"
                    >
                      <div class="mb-4">
                        <h4 class="text-sm font-semibold"
                          >校对加工件 #{{ String(index + 1).padStart(2, '0') }}</h4
                        >
                        <p class="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-300">
                          核对尺寸、数量及物料属性；每种长度对应独立加工件和草图。
                        </p>
                      </div>
                      <ArtForm
                        :model-value="item"
                        :items="correctionFormItems"
                        :span="8"
                        :gutter="16"
                        label-position="top"
                        :show-reset="false"
                        :show-submit="false"
                        root-class="accessory-inline-form"
                      >
                        <template #specificationModel>
                          <ElInput
                            v-model="item.specificationModel"
                            maxlength="120"
                            :placeholder="defaultSpecification(item)"
                          />
                        </template>
                        <template #sketchPath>
                          <div
                            class="flex w-full flex-wrap items-center gap-4 rounded-[var(--custom-radius)] border border-dashed border-gray-300 bg-white p-4 dark:border-gray-600 dark:bg-[var(--art-main-bg-color)]"
                          >
                            <ArtUploadImage
                              :model-value="workspace.sketchUrls[index] || ''"
                              :upload-request="(file) => uploadSketch(file, index)"
                              :show-resource-picker="false"
                              title="上传加工草图"
                              preview-fit="contain"
                              :size="112"
                              @update:model-value="(url) => onSketchModelChanged(url, index)"
                              @resource-change="(resources) => onSketchUploaded(resources, index)"
                            />
                            <div class="min-w-40 flex-1">
                              <p class="text-sm font-medium">{{
                                item.sketchPath ? '已关联独立草图' : '请上传本件加工草图'
                              }}</p>
                              <p class="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-300">
                                图片会单独保存，并随对应物料及生产加工单保留。点击图片可预览或删除。
                              </p>
                            </div>
                          </div>
                        </template>
                      </ArtForm>
                    </div>
                  </div>
                </div>
              </ElCollapseItem>
            </ElCollapse>
          </div>
        </div>
      </ArtSectionCard>

      <ArtSectionCard
        v-if="orderCards.length"
        title="已转生产工单"
        subtitle="这些 MES 工单由清单中的“转生产工单”操作分别创建。"
      >
        <div class="grid gap-3 pt-4 md:grid-cols-2 xl:grid-cols-3">
          <div v-for="card in orderCards" :key="card.order.id" class="art-card-xs min-w-0 p-4">
            <div class="flex items-start justify-between gap-2">
              <strong class="break-all">{{ card.order.workOrderNo }}</strong>
              <ElTag size="small" type="info">MES 工单</ElTag>
            </div>
            <p class="mt-2 text-sm font-medium">{{ card.item?.name || '加工件' }}</p>
            <p class="mt-1 break-all text-xs text-gray-500">物料 {{ card.materialCode }}</p>
            <div class="mt-3 flex gap-3 border-t border-gray-200 pt-3 dark:border-gray-700">
              <AccessorySketchThumbnail
                :path="card.item.sketchPath"
                :alt="`${card.item?.name || '加工件'}的加工草图`"
              />
              <div class="min-w-0 space-y-1 text-sm">
                <p>{{ card.item.lengthM }} m × {{ card.item.quantity }} 件</p>
                <p v-if="card.item?.widthMm" class="text-gray-500"
                  >展宽 {{ card.item.widthMm }} mm</p
                >
                <p v-if="card.item?.materialColor" class="break-words text-gray-500">{{
                  card.item.materialColor
                }}</p>
              </div>
            </div>
            <p v-if="card.item?.remark" class="mt-3 break-words text-xs text-gray-500">{{
              card.item.remark
            }}</p>
          </div>
        </div>
      </ArtSectionCard>

      <ArtSectionCard
        :title="isPlatformSuper ? '当前租户识别记录' : '我的识别记录'"
        subtitle="识别结果可继续校对；点击保存后才会成为下方业务清单。"
        :loading="workspace.recognitionsLoading"
        :error="workspace.recognitionsError"
        :empty="!workspace.recognitions.length"
        empty-title="暂无识别记录"
        empty-description="上传清单并完成一次识别后，这里会保留预览记录。"
        @retry="loadRecognitions"
      >
        <template #actions>
          <ElButton @click="loadRecognitions">
            <template #icon><ArtSvgIcon icon="ri:refresh-line" /></template>
            刷新记录
          </ElButton>
        </template>
        <div class="grid gap-3 pt-4 md:grid-cols-2 xl:grid-cols-3">
          <button
            v-for="record in workspace.recognitions"
            :key="record.id"
            type="button"
            class="art-card-xs min-w-0 p-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-color)]"
            :disabled="Boolean(workspace.openingRecognitionId)"
            @click="openRecognition(record)"
          >
            <div class="flex items-start justify-between gap-3">
              <strong class="min-w-0 break-words text-sm">{{
                record.projectName || '未识别项目名称'
              }}</strong>
              <div class="flex shrink-0 flex-wrap gap-1">
                <ElTag size="small" type="info">识别预览</ElTag>
                <ElTag v-if="record.items.some((item) => !item.sketch)" size="small" type="warning"
                  >需检查草图</ElTag
                >
              </div>
            </div>
            <p class="mt-2 break-words text-sm text-gray-600 dark:text-gray-300">{{
              record.drawingName || '未识别图纸名称'
            }}</p>
            <p class="mt-2 text-xs text-gray-600 dark:text-gray-300"
              >{{ record.items.length }} 件 · {{ formatDateTime(record.createTime) }}</p
            >
            <p class="mt-1 text-xs text-gray-600 dark:text-gray-300">
              点击继续校对；校对保存后才会进入加工清单数据列表
            </p>
            <p v-if="workspace.openingRecognitionId === record.id" class="mt-2 text-xs"
              >正在打开…</p
            >
          </button>
        </div>
      </ArtSectionCard>

      <ArtSectionCard
        title="配件加工清单数据列表"
        :subtitle="`逐件展示已保存的加工件，共 ${savedRows.length} 件；同名不同长度分别占一行。`"
        :loading="workspace.loading"
        :error="workspace.error"
        :empty="!savedRows.length && !listKeyword"
        empty-title="暂无配件加工清单"
        empty-description="完成识别校对后，点击“确认并保存清单”。"
        @retry="loadLists"
      >
        <template #actions>
          <div class="flex items-center gap-1">
            <ElInput
              v-model="listKeyword"
              clearable
              placeholder="搜索项目、图纸、物料"
              aria-label="搜索配件加工清单"
              class="w-52 sm:w-64"
            />
            <ArtIconButton
              icon="ri:refresh-line"
              label="刷新配件加工清单"
              class="shrink-0"
              :loading="workspace.loading"
              @click="loadLists"
            />
          </div>
        </template>
        <div class="min-w-0 pt-4">
          <ArtTable
            :data="visibleSavedRows"
            :columns="savedColumns"
            :pagination="{ current: listPage, size: listPageSize, total: filteredSavedRows.length }"
            :loading="workspace.loading"
            empty-text="没有匹配的加工件"
            @pagination:current-change="listPage = $event"
            @pagination:size-change="onListPageSizeChange"
          >
            <template #image="{ row }">
              <AccessorySketchThumbnail
                :path="row.sketchPath"
                :alt="`${row.name} ${row.lengthM} 米加工草图`"
              />
            </template>
            <template #materialName="{ row }">
              <div class="min-w-0">
                <p class="truncate font-medium">{{ row.name }}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">{{
                  listStatusLabel(row.list.status)
                }}</p>
              </div>
            </template>
            <template #operation="{ row }">
              <ElButton
                v-auth="'MdmAccessoryProcessing:View'"
                link
                type="primary"
                :aria-label="`打开${row.name}所在清单`"
                @click="openList(row.list)"
                >打开</ElButton
              >
            </template>
          </ArtTable>
        </div>
      </ArtSectionCard>
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="ts">
  import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
  import { storeToRefs } from 'pinia'
  import { ElCollapse, ElCollapseItem, ElMessage } from 'element-plus'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtUploadFile from '@/components/core/forms/art-upload-file/index.vue'
  import ArtUploadImage from '@/components/core/forms/art-upload-image/index.vue'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import type { ColumnOption } from '@/types/component'
  import { useUserStore } from '@/store/modules/user'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { createDateTimeFormatter } from '@/utils/ui/format'
  import {
    fetchAccessoryCustomers,
    fetchAccessoryLists,
    fetchAccessoryRecognitions,
    fetchAccessoryProjects,
    fetchMaterialCategories,
    fetchMaterialReferenceOptions,
    recognizeAccessoryPages,
    restoreAccessoryRecognitionFiles,
    saveAccessoryDraft,
    setAccessoryProjectAssignment,
    signAccessoryPath,
    uploadAccessoryFile,
    type AccessoryProcessingItem,
    type AccessoryProcessingList,
    type AccessoryRecognitionRecord,
    type AccessoryProjectOption,
    type AccessoryCustomerOption,
    type MaterialCategory,
    type MaterialType,
    type UnitOfMeasure
  } from '@/api/mdm'
  import AccessorySketchThumbnail from './accessory-sketch-thumbnail.vue'
  import { cropSketch, rasterizeProcessingList, type DocumentPage } from './document-pages'

  defineOptions({ name: 'MdmAccessoryRecognitionWorkspace' })
  const emit = defineEmits<{ saved: [] }>()
  const templateUrl = new URL('../assets/accessory-processing-template.docx', import.meta.url).href
  const { hasAuth } = useAuth()
  const userStore = useUserStore()
  const { isPlatformSuper, getDictMap } = storeToRefs(userStore)
  const { effectiveTenantId, tenantOptions } = storeToRefs(useTenantScopeStore())
  const formatDateTime = createDateTimeFormatter()
  interface WorkspaceState {
    tenantId: string
    sourceUrl: string
    sourcePath: string
    sourceName: string
    groupId: string
    pages: DocumentPage[]
    sketchUrls: string[]
    lists: AccessoryProcessingList[]
    recognitions: AccessoryRecognitionRecord[]
    projects: AccessoryProjectOption[]
    customers: AccessoryCustomerOption[]
    categories: MaterialCategory[]
    types: MaterialType[]
    units: UnitOfMeasure[]
    loading: boolean
    recognitionsLoading: boolean
    recognitionsError: string
    openingRecognitionId: string
    projectsLoading: boolean
    recognizing: boolean
    recognitionError: string
    saving: boolean
    error: string
  }
  interface DraftState {
    id?: string
    projectName: string
    drawingName: string
    projectId: string | null
    customerId: string | null
    categoryId: string | null
    status: AccessoryProcessingList['status']
    confidence: number
    warnings: string[]
    items: AccessoryProcessingItem[]
  }
  const workspace = reactive<WorkspaceState>({
    tenantId: effectiveTenantId.value ?? '',
    sourceUrl: '',
    sourcePath: '',
    sourceName: '',
    groupId: crypto.randomUUID(),
    pages: [],
    sketchUrls: [],
    lists: [],
    recognitions: [],
    projects: [],
    customers: [],
    categories: [],
    types: [],
    units: [],
    loading: false,
    recognitionsLoading: false,
    recognitionsError: '',
    openingRecognitionId: '',
    projectsLoading: false,
    recognizing: false,
    recognitionError: '',
    saving: false,
    error: ''
  })
  const draft = reactive<DraftState>({
    id: undefined,
    projectName: '',
    drawingName: '',
    projectId: null,
    customerId: null,
    categoryId: null,
    status: 'draft',
    confidence: 0,
    warnings: [],
    items: []
  })
  const editingIndex = ref<number | null>(null)
  const expandedRowKeys = ref<string[]>([])
  const listKeyword = ref('')
  const listPage = ref(1)
  const listPageSize = ref(20)
  const missingSketchCount = computed(() => draft.items.filter((item) => !item.sketchPath).length)
  const canSaveDraft = computed(() => hasAuth('MdmAccessoryProcessing:SaveDraft'))
  const canManageAccessory = canSaveDraft
  const materialSourceOptions = computed(() => getDictMap.value.mdmMaterialSource ?? [])
  const allProjectFormItems: FormItem[] = [
    {
      key: 'projectName',
      label: '项目名称',
      type: 'input',
      span: 8,
      props: { maxlength: 160, placeholder: '识别或手动填写项目名称' }
    },
    { key: 'projectId', label: '关联已有项目', type: 'select', span: 8 },
    {
      key: 'drawingName',
      label: '图纸名称',
      type: 'input',
      span: 8,
      props: { maxlength: 160, placeholder: '识别或手动填写图纸名称' }
    },
    { key: 'customerId', label: '项目客户', type: 'select', span: 8 },
    { key: 'categoryId', label: '默认物料分类', type: 'select', span: 8 }
  ]
  const projectFormItems = computed(() =>
    draft.status === 'materials_ready'
      ? allProjectFormItems.filter((item) =>
          ['projectName', 'projectId', 'customerId'].includes(item.key)
        )
      : allProjectFormItems
  )
  const correctionFormItems = computed<FormItem[]>(() => [
    {
      key: 'name',
      label: '构件名称',
      type: 'input',
      span: 8,
      props: { maxlength: 120 }
    },
    { key: 'specificationModel', label: '规格型号', type: 'input', span: 8 },
    {
      key: 'materialColor',
      label: '材质与颜色',
      type: 'input',
      span: 8,
      props: { maxlength: 160 }
    },
    {
      key: 'widthMm',
      label: '展宽 (mm)',
      type: 'number',
      span: 6,
      props: { min: 0, precision: 1, controlsPosition: 'right', class: '!w-full' }
    },
    {
      key: 'lengthM',
      label: '长度 (m)',
      type: 'number',
      span: 6,
      props: { min: 0.001, precision: 3, controlsPosition: 'right', class: '!w-full' }
    },
    {
      key: 'quantity',
      label: '数量 (件)',
      type: 'number',
      span: 6,
      props: { min: 1, precision: 0, controlsPosition: 'right', class: '!w-full' }
    },
    {
      key: 'baseUnitId',
      label: '基本单位',
      type: 'select',
      span: 6,
      options: workspace.units.map((unit) => ({ label: unit.unitName, value: unit.id })),
      props: { filterable: true }
    },
    {
      key: 'materialTypeId',
      label: '物料类型',
      type: 'select',
      span: 8,
      options: workspace.types.map((type) => ({ label: type.typeName, value: type.id })),
      props: { filterable: true }
    },
    {
      key: 'materialSource',
      label: '物料来源',
      type: 'select',
      span: 8,
      options: materialSourceOptions.value.map((source) => ({
        label: source.label,
        value: source.value
      }))
    },
    {
      key: 'categoryId',
      label: '物料分类',
      type: 'select',
      span: 8,
      options: workspace.categories.map((category) => ({
        label: category.categoryName,
        value: category.id
      })),
      props: { filterable: true }
    },
    { key: 'remark', label: '备注', type: 'input', span: 24 },
    { key: 'sketchPath', label: '独立加工草图', type: 'uploadImage', span: 24 }
  ])
  const defaultCategoryId = computed(
    () =>
      workspace.categories.find(
        (category) => category.categoryName === '配件' && category.categoryCode === 'B59'
      )?.id ??
      workspace.categories.find((category) => category.categoryName === '配件')?.id ??
      null
  )
  const defaultTypeId = computed(
    () => workspace.types.find((type) => type.typeName === '半成品')?.id ?? null
  )
  const defaultUnitId = computed(
    () =>
      workspace.units.find((unit) => unit.unitName.toUpperCase() === 'PC')?.id ??
      workspace.units.find((unit) => unit.symbol?.toUpperCase() === 'PC')?.id ??
      workspace.units.find((unit) => unit.unitCode.toUpperCase() === 'PC')?.id ??
      workspace.units.find((unit) => unit.unitName === '件')?.id ??
      null
  )

  interface AccessorySavedRow extends AccessoryProcessingItem {
    list: AccessoryProcessingList
    projectName: string
    drawingName: string
    materialName: string
    baseUnitName: string
    materialTypeName: string
    categoryName: string
  }
  const savedRows = computed<AccessorySavedRow[]>(() =>
    workspace.lists.flatMap((list) =>
      list.items.map((item) => ({
        ...item,
        list,
        projectName: list.projectName,
        drawingName: list.drawingName,
        materialName: item.name,
        baseUnitName: item.baseUnit?.unitName ?? '—',
        materialTypeName: item.materialType?.typeName ?? '—',
        categoryName: item.category?.categoryName ?? '—'
      }))
    )
  )
  const filteredSavedRows = computed(() => {
    const keyword = listKeyword.value.trim().toLowerCase()
    if (!keyword) return savedRows.value
    return savedRows.value.filter((row) =>
      [row.projectName, row.drawingName, row.name, row.materialCode].some((value) =>
        value?.toLowerCase().includes(keyword)
      )
    )
  })
  const visibleSavedRows = computed(() =>
    filteredSavedRows.value.slice(
      (listPage.value - 1) * listPageSize.value,
      listPage.value * listPageSize.value
    )
  )
  const savedColumns: ColumnOption<AccessorySavedRow>[] = [
    { prop: 'image', label: '图片', width: 92, useSlot: true, fixed: 'left' },
    { prop: 'projectName', label: '项目名称', minWidth: 170, showOverflowTooltip: true },
    { prop: 'drawingName', label: '图纸名称', minWidth: 150, showOverflowTooltip: true },
    { prop: 'rowNo', label: '原表序号', width: 100 },
    { prop: 'materialCode', label: '物料编码', minWidth: 270, showOverflowTooltip: true },
    { prop: 'materialName', label: '物料名称', minWidth: 160, useSlot: true },
    { prop: 'specificationModel', label: '规格型号', minWidth: 190, showOverflowTooltip: true },
    { prop: 'widthMm', label: '展宽(mm)', width: 105 },
    { prop: 'lengthM', label: '长度(M)', width: 105 },
    { prop: 'quantity', label: '数量', width: 78 },
    { prop: 'baseUnitName', label: '基本单位', width: 100 },
    { prop: 'materialColor', label: '材质与颜色', minWidth: 150, showOverflowTooltip: true },
    { prop: 'remark', label: '备注', minWidth: 180, showOverflowTooltip: true },
    { prop: 'materialTypeName', label: '物料类型', width: 110 },
    { prop: 'materialSource', label: '物料来源', width: 110, dict: { code: 'mdmMaterialSource' } },
    { prop: 'categoryName', label: '物料分类', width: 110 },
    { prop: 'operation', label: '操作', width: 85, useSlot: true, fixed: 'right' }
  ]
  watch(listKeyword, () => {
    listPage.value = 1
  })

  function onListPageSizeChange(size: number): void {
    listPageSize.value = size
    listPage.value = 1
  }

  function listStatusLabel(status: AccessoryProcessingList['status']): string {
    return {
      draft: '已保存草稿',
      materials_ready: '物料已生成',
      bom_ready: '项目 BOM 已生成',
      generated: '工单已生成'
    }[status]
  }

  function defaultSpecification(item: AccessoryProcessingItem): string {
    return `展宽 ${item.widthMm ?? '—'} mm × 长度 ${item.lengthM} m`
  }

  function withMaterialDefaults(item: AccessoryProcessingItem): AccessoryProcessingItem {
    return {
      ...item,
      specificationModel: item.specificationModel ?? '',
      baseUnitId: item.baseUnitId ?? defaultUnitId.value,
      materialTypeId: item.materialTypeId ?? defaultTypeId.value,
      materialSource: item.materialSource ?? 'self_made',
      categoryId: item.categoryId ?? defaultCategoryId.value
    }
  }

  function onDefaultCategoryChanged(categoryId: string | null): void {
    if (draft.status !== 'draft') return
    draft.items.forEach((item) => {
      item.categoryId = categoryId
    })
  }
  const rowGroups = computed(() => {
    const groups = new Map<
      string,
      {
        key: string
        rowNo: number
        hasWarning: boolean
        entries: { item: AccessoryProcessingItem; index: number }[]
      }
    >()
    draft.items.forEach((item, index) => {
      const key = `${item.sketch?.page ?? 0}:${item.rowNo}`
      const group = groups.get(key) ?? {
        key,
        rowNo: item.rowNo,
        hasWarning: draft.warnings.some((warning) =>
          warning.replaceAll(' ', '').includes(`第${item.rowNo}行`)
        ),
        entries: []
      }
      group.entries.push({ item, index })
      groups.set(key, group)
    })
    return [...groups.values()].map((group) => ({
      ...group,
      lengthSummary: group.entries.map(({ item }) => `${item.lengthM.toFixed(3)} m`).join(' / ')
    }))
  })
  const activeTenantName = computed(
    () =>
      tenantOptions.value.find((tenant) => tenant.id === workspace.tenantId)?.tenantName ||
      '当前租户'
  )
  const orderCards = computed(() =>
    draft.items.flatMap((item) =>
      (item.workOrders ?? []).map((order) => ({
        order,
        item,
        materialCode: item.materialCode ?? ''
      }))
    )
  )

  function removePreviewItem(index: number): void {
    if (draft.id || draft.status !== 'draft' || workspace.saving) return
    draft.items.splice(index, 1)
    workspace.sketchUrls.splice(index, 1)
    editingIndex.value = null
  }

  function downloadTemplate(): void {
    const link = document.createElement('a')
    link.href = templateUrl
    link.download = '配件加工清单模板.docx'
    link.click()
  }

  function resetUpload(): void {
    editingIndex.value = null
    Object.assign(workspace, {
      recognitionError: '',
      sourceUrl: '',
      sourcePath: '',
      sourceName: '',
      groupId: crypto.randomUUID(),
      pages: [],
      sketchUrls: []
    })
    Object.assign(draft, {
      id: undefined,
      projectName: '',
      drawingName: '',
      projectId: null,
      customerId: null,
      categoryId: null,
      status: 'draft',
      confidence: 0,
      warnings: [],
      items: []
    })
    void loadProjects()
  }

  async function uploadSource(file: File): Promise<Api.DataCenter.Resources.ResourceListItem[]> {
    if (!workspace.tenantId) throw new Error('请先选择目标租户')
    const pages = await rasterizeProcessingList(file)
    const groupId = crypto.randomUUID()
    const resources = await uploadAccessoryFile(
      workspace.tenantId,
      groupId,
      'source',
      file,
      file.name
    )
    workspace.groupId = groupId
    workspace.pages = pages
    return resources
  }

  function onSourceUploaded(resources: Api.DataCenter.Resources.ResourceListItem[]): void {
    const resource = resources[0]
    if (!resource?.storagePath) return
    editingIndex.value = null
    Object.assign(workspace, {
      recognitionError: '',
      sourcePath: resource.storagePath,
      sourceName: resource.originName || '加工清单',
      sketchUrls: []
    })
    Object.assign(draft, {
      id: undefined,
      status: 'draft',
      projectName: '',
      drawingName: '',
      projectId: null,
      customerId: null,
      categoryId: null,
      items: [],
      warnings: []
    })
  }

  async function recognize(): Promise<void> {
    if (!workspace.pages.length || !workspace.tenantId) return
    workspace.recognizing = true
    workspace.recognitionError = ''
    try {
      const urls: string[] = []
      for (const [index, page] of workspace.pages.entries()) {
        const blob = await (await fetch(page.dataUrl)).blob()
        const [resource] = await uploadAccessoryFile(
          workspace.tenantId,
          workspace.groupId,
          'page',
          blob,
          `page-${index + 1}.png`
        )
        if (!resource?.url) throw new Error('页面图片上传失败')
        urls.push(resource.url)
      }
      const result = await recognizeAccessoryPages(urls)
      if (!workspace.types.length) await loadProjects()
      const items: AccessoryProcessingItem[] = []
      const sketchUrls: string[] = []
      for (const [index, item] of result.items.entries()) {
        let sketchPath: string | null = null
        let sketchUrl = ''
        const page = item.sketch ? workspace.pages[item.sketch.page - 1] : undefined
        if (page && item.sketch) {
          try {
            const blob = await cropSketch(page, item.sketch)
            const [resource] = await uploadAccessoryFile(
              workspace.tenantId,
              workspace.groupId,
              'sketch',
              blob,
              `sketch-${index + 1}.png`
            )
            sketchPath = resource?.storagePath || null
            sketchUrl = resource?.url || ''
          } catch {
            result.warnings.push(`第 ${item.rowNo} 行草图裁剪失败，请补传`)
          }
        }
        items.push(withMaterialDefaults({ ...item, sketchPath }))
        sketchUrls.push(sketchUrl)
      }
      Object.assign(draft, {
        id: undefined,
        projectName: result.projectName,
        drawingName: result.drawingName,
        projectId: null,
        customerId: null,
        categoryId: defaultCategoryId.value,
        status: 'draft',
        confidence: result.confidence,
        warnings: result.warnings,
        items
      })
      workspace.sketchUrls = sketchUrls
      editingIndex.value = null
      await loadRecognitions()
      ElMessage.success(`已识别 ${items.length} 个独立加工件，识别记录已留存`)
      await nextTick()
      document
        .getElementById('accessory-recognition-result')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (error) {
      const message = getFriendlySupabaseErrorMessage(error, '加工清单识别失败，请重试')
      if (draft.items.length) {
        ElMessage.error(message)
      } else {
        workspace.recognitionError = message
        await nextTick()
        document
          .getElementById('accessory-recognition-result')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    } finally {
      workspace.recognizing = false
    }
  }

  async function uploadSketch(
    file: File,
    index: number
  ): Promise<Api.DataCenter.Resources.ResourceListItem[]> {
    return uploadAccessoryFile(
      workspace.tenantId,
      workspace.groupId,
      'sketch',
      file,
      `sketch-${index + 1}.${file.name.split('.').pop() || 'png'}`
    )
  }

  function onSketchUploaded(
    resources: Api.DataCenter.Resources.ResourceListItem[],
    index: number
  ): void {
    const item = draft.items[index]
    const resource = resources[0]
    if (item && resource?.storagePath) {
      item.sketchPath = resource.storagePath
      workspace.sketchUrls[index] = resource.url || ''
    }
  }

  function onSketchModelChanged(url: string | string[] | null, index: number): void {
    if (url) return
    const item = draft.items[index]
    if (item) item.sketchPath = null
    workspace.sketchUrls[index] = ''
  }

  function onProjectSelected(id: string | null): void {
    if (!id) {
      draft.projectId = null
      draft.customerId = null
      return
    }
    const project = workspace.projects.find((item) => item.id === id)
    if (project) {
      draft.customerId = project.customerId
    }
  }

  async function saveDraft(notify = true): Promise<boolean> {
    if (draft.status !== 'draft' || workspace.saving) return false
    if (
      !workspace.tenantId ||
      !workspace.sourcePath ||
      !draft.projectName.trim() ||
      !draft.items.length
    ) {
      ElMessage.warning('请先上传清单，填写项目名称并确认加工件')
      return false
    }
    if (draft.items.some((item) => !item.name.trim() || item.lengthM <= 0 || item.quantity < 1)) {
      ElMessage.warning('请检查每个加工件的名称、长度和数量')
      return false
    }
    if (draft.items.some((item) => !item.widthMm || item.widthMm <= 0)) {
      ElMessage.warning('请补齐每个加工件的展宽（mm），确认后才能生成物料编码和生产工单')
      return false
    }
    if (draft.items.some((item) => !item.baseUnitId || !item.materialTypeId || !item.categoryId)) {
      ElMessage.warning('请检查每个加工件的基本单位、物料类型和物料分类')
      return false
    }
    workspace.saving = true
    try {
      draft.id = await saveAccessoryDraft({
        id: draft.id,
        mode: 'SaveDraft',
        tenantId: workspace.tenantId,
        sourcePath: workspace.sourcePath,
        sourceName: workspace.sourceName,
        projectName: draft.projectName.trim(),
        drawingName: draft.drawingName.trim(),
        projectId: draft.projectId,
        customerId: draft.customerId,
        categoryId: draft.categoryId,
        confidence: draft.confidence,
        warnings: draft.warnings,
        items: draft.items
      })
      await loadLists()
      const saved = workspace.lists.find((list) => list.id === draft.id)
      if (saved) draft.items = saved.items
      if (notify) ElMessage.success('配件加工清单已保存，可在主列表逐件查看')
      emit('saved')
      return true
    } catch (error) {
      ElMessage.error(getFriendlySupabaseErrorMessage(error, '加工清单保存失败，请重试'))
      return false
    } finally {
      workspace.saving = false
    }
  }

  async function saveProjectAssignment(notify = true): Promise<boolean> {
    if (draft.status !== 'materials_ready' || !draft.id || workspace.saving) return false
    if (!draft.projectName.trim()) {
      ElMessage.warning('请填写项目名称')
      return false
    }
    workspace.saving = true
    try {
      await setAccessoryProjectAssignment({
        listId: draft.id,
        projectId: draft.projectId,
        customerId: draft.customerId,
        projectName: draft.projectName.trim()
      })
      await loadLists()
      const saved = workspace.lists.find((list) => list.id === draft.id)
      if (saved) {
        draft.projectName = saved.projectName
        draft.projectId = saved.projectId
        draft.customerId = saved.customerId
      }
      if (notify) ElMessage.success('项目归属已保存')
      return true
    } catch (error) {
      ElMessage.error(getFriendlySupabaseErrorMessage(error, '项目归属保存失败，请重试'))
      return false
    } finally {
      workspace.saving = false
    }
  }

  async function loadLists(): Promise<void> {
    workspace.loading = true
    workspace.error = ''
    try {
      workspace.lists = (await fetchAccessoryLists(effectiveTenantId.value)).filter((list) =>
        Boolean(list.sourcePath)
      )
    } catch (error) {
      workspace.error = getFriendlySupabaseErrorMessage(error, '清单加载失败，请重试')
    } finally {
      workspace.loading = false
    }
  }

  async function loadRecognitions(): Promise<void> {
    workspace.recognitionsLoading = true
    workspace.recognitionsError = ''
    const tenantId = effectiveTenantId.value
    const includeTenantRecords = isPlatformSuper.value
    try {
      const records = await fetchAccessoryRecognitions(tenantId, includeTenantRecords)
      if (tenantId === effectiveTenantId.value && includeTenantRecords === isPlatformSuper.value)
        workspace.recognitions = records
    } catch (error) {
      workspace.recognitionsError = getFriendlySupabaseErrorMessage(
        error,
        '识别记录加载失败，请重试'
      )
    } finally {
      workspace.recognitionsLoading = false
    }
  }

  async function openRecognition(record: AccessoryRecognitionRecord): Promise<void> {
    if (workspace.openingRecognitionId) return
    workspace.openingRecognitionId = record.id
    try {
      let files: Awaited<ReturnType<typeof restoreAccessoryRecognitionFiles>> = {
        sourcePath: '',
        sourceUrl: '',
        sketchPaths: record.items.map(() => null),
        sketchUrls: record.items.map(() => '')
      }
      try {
        files = await restoreAccessoryRecognitionFiles(record)
      } catch (error) {
        ElMessage.warning(
          getFriendlySupabaseErrorMessage(error, '已打开识别文字，原件和草图暂时无法预览')
        )
      }
      workspace.tenantId = record.tenantId
      Object.assign(workspace, {
        recognitionError: '',
        sourcePath: files.sourcePath,
        sourceUrl: files.sourceUrl,
        sourceName: files.sourcePath
          ? `识别原件.${files.sourcePath.split('.').pop() || 'pdf'}`
          : '识别原件',
        groupId: files.sourcePath.split('/')[1] || crypto.randomUUID(),
        pages: [],
        sketchUrls: files.sketchUrls,
        orders: []
      })
      await loadProjects()
      Object.assign(draft, {
        id: undefined,
        projectName: record.projectName,
        drawingName: record.drawingName,
        projectId: null,
        customerId: null,
        categoryId: defaultCategoryId.value,
        status: 'draft',
        confidence: record.confidence,
        warnings: record.warnings,
        items: record.items.map((item, index) =>
          withMaterialDefaults({
            ...item,
            sketchPath: files.sketchPaths[index]
          })
        )
      })
      editingIndex.value = null
      await nextTick()
      document
        .getElementById('accessory-recognition-result')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (error) {
      ElMessage.error(getFriendlySupabaseErrorMessage(error, '识别记录打开失败，请重试'))
    } finally {
      workspace.openingRecognitionId = ''
    }
  }

  async function loadProjects(): Promise<void> {
    workspace.projects = []
    workspace.customers = []
    workspace.categories = []
    workspace.types = []
    workspace.units = []
    if (!workspace.tenantId) return
    const tenantId = workspace.tenantId
    workspace.projectsLoading = true
    try {
      const projects = await fetchAccessoryProjects(tenantId)
      if (workspace.tenantId !== tenantId) return
      workspace.projects = projects
      const selectedProject = projects.find((project) => project.id === draft.projectId)
      if (selectedProject && !draft.customerId) draft.customerId = selectedProject.customerId
      const [customers, categories, types, units] = await Promise.all([
        fetchAccessoryCustomers(tenantId),
        fetchMaterialCategories(tenantId),
        fetchMaterialReferenceOptions<MaterialType>('material-type', tenantId),
        fetchMaterialReferenceOptions<UnitOfMeasure>('unit-of-measure', tenantId)
      ])
      if (workspace.tenantId !== tenantId) return
      workspace.customers = customers
      workspace.categories = categories.filter((category) => category.status === 'enabled')
      workspace.types = types
      workspace.units = units
    } catch (error) {
      ElMessage.error(getFriendlySupabaseErrorMessage(error, '项目列表加载失败，请重试'))
    } finally {
      workspace.projectsLoading = false
    }
  }

  async function openList(list: AccessoryProcessingList): Promise<void> {
    if (!list.sourcePath) return
    editingIndex.value = null
    workspace.tenantId = list.tenantId
    Object.assign(workspace, {
      recognitionError: '',
      sourcePath: list.sourcePath,
      sourceName: list.sourceName,
      groupId: list.sourcePath.split('/')[1] || crypto.randomUUID(),
      pages: []
    })
    Object.assign(draft, {
      id: list.id,
      projectName: list.projectName,
      drawingName: list.drawingName,
      projectId: list.projectId,
      customerId: list.customerId,
      categoryId: list.categoryId,
      status: list.status,
      confidence: list.confidence,
      warnings: list.warnings || [],
      items: list.items || []
    })
    try {
      workspace.sourceUrl = await signAccessoryPath(list.sourcePath)
      workspace.sketchUrls = await Promise.all(
        draft.items.map((item) =>
          item.sketchPath ? signAccessoryPath(item.sketchPath) : Promise.resolve('')
        )
      )
    } catch (error) {
      ElMessage.warning(
        getFriendlySupabaseErrorMessage(error, '部分文件暂时无法预览，请刷新后重试')
      )
    }
    await loadProjects()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  watch(effectiveTenantId, (tenantId) => {
    workspace.tenantId = tenantId ?? ''
    resetUpload()
    void Promise.all([loadLists(), loadRecognitions()])
  })
  watch(isPlatformSuper, () => {
    void Promise.all([loadProjects(), loadRecognitions()])
  })
  watch(
    () => draft.items,
    () => {
      expandedRowKeys.value = rowGroups.value
        .filter((group) => group.hasWarning)
        .map((group) => group.key)
    }
  )
  onMounted(() => {
    void userStore.ensureDictLoaded('mdmMaterialSource')
    void Promise.all([loadLists(), loadProjects(), loadRecognitions()])
  })
</script>

<style scoped lang="scss">
  :deep(.accessory-inline-form) {
    padding: 0;
  }

  :deep(.accessory-inline-form .el-form-item) {
    margin-bottom: var(--art-space-4);
  }

  .accessory-result-collapse {
    border: 0;

    :deep(.el-collapse-item) {
      margin-bottom: var(--art-space-2);
      overflow: hidden;
      border: 1px solid var(--el-border-color-light);
      border-radius: var(--custom-radius);
    }

    :deep(.el-collapse-item__header) {
      height: auto;
      min-height: 52px;
      padding: 8px 16px;
      line-height: 1.5;
      background: var(--el-fill-color-light);
      border-bottom: 0;
    }

    :deep(.el-collapse-item__header:focus-visible) {
      outline: 2px solid var(--theme-color);
      outline-offset: -2px;
    }

    :deep(.el-collapse-item__arrow) {
      flex: 0 0 auto;
      margin-left: 12px;
    }

    :deep(.el-collapse-item__wrap) {
      border-top: 1px solid var(--el-border-color-lighter);
      border-bottom: 0;
    }

    :deep(.el-collapse-item__content) {
      padding-bottom: 0;
    }
  }
</style>

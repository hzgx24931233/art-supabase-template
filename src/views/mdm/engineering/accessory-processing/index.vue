<template>
  <ArtPermissionGuard permission="MdmAccessoryProcessing:View" resource-name="配件加工清单">
    <div
      class="accessory-processing-page business-workspace-page art-full-height"
      :class="{ 'is-focus-mode': focusMode }"
    >
      <MasterDeleteProcessingNotice
        v-if="targetListId"
        action-hint="当前已定位到关联的加工清单，请核对关联，处理完成后返回原页面重试删除。"
      />
      <BusinessWorkspaceHeader
        v-show="!focusMode"
        density="compact"
        eyebrow="ACCESSORY PROCESSING"
        title="配件加工清单"
        description="按项目核对加工件，分别生成物料编码、项目 BOM 和 PP40 生产工单。"
        icon="ri:shape-2-line"
        :metrics="headerMetrics"
      >
        <template #actions>
          <BusinessWorkspaceFocusToggle v-model="focusMode" />
        </template>
      </BusinessWorkspaceHeader>

      <div
        class="accessory-processing-page__toolbar art-card-xs"
        role="toolbar"
        aria-label="配件加工清单操作"
      >
        <div class="accessory-processing-page__actions">
          <ElButton v-auth="'MdmAccessoryProcessing:Add'" type="primary" @click="openManual('add')">
            <ArtSvgIcon icon="ri:add-line" />新增
          </ElButton>
          <ElButton v-auth="'MdmAccessoryProcessing:Recognize'" @click="openRecognition">
            <ArtSvgIcon icon="ri:sparkling-line" />AI 识别
          </ElButton>
          <ElButton :disabled="selectedRows.length !== 1" @click="openDetail(selectedRows[0])">
            <ArtSvgIcon icon="ri:eye-line" />查看
          </ElButton>
          <ElButton
            v-auth="'MdmAccessoryProcessing:Copy'"
            :disabled="selectedRows.length !== 1"
            @click="openManual('copy', selectedRows[0])"
          >
            <ArtSvgIcon icon="ri:file-copy-line" />复制
          </ElButton>
          <ElButton
            v-auth="'MdmAccessoryProcessing:Edit'"
            :disabled="selectedRows.length !== 1 || !canChangeRow(selectedRows[0])"
            @click="openManual('edit', selectedRows[0])"
          >
            <ArtSvgIcon icon="ri:edit-line" />编辑
          </ElButton>
          <ElButton
            v-auth="'MdmAccessoryProcessing:Delete'"
            :disabled="deleteBusy || !selectedRows.length"
            @click="deleteSelected"
          >
            <ArtSvgIcon icon="ri:delete-bin-6-line" />删除
          </ElButton>
          <ElButton
            v-auth="'MdmAccessoryProcessing:Delete'"
            :disabled="
              deleteBusy || !selectedRows.length || selectedRows.some((row) => !row.materialId)
            "
            @click="resetSelectedCodes"
          >
            <ArtSvgIcon icon="ri:delete-back-2-line" />删除物料编码
          </ElButton>
          <ElButton
            v-auth="'MdmAccessoryProcessing:GenerateMaterial'"
            :disabled="!selectedRows.length || selectedRows.every((row) => Boolean(row.materialId))"
            @click="openMaterialDialog"
          >
            <ArtSvgIcon icon="ri:barcode-line" />生成物料编码
          </ElButton>
          <ElButton
            v-auth="'MdmAccessoryProcessing:GenerateBom'"
            :disabled="
              conversionBusy ||
              !selectedRows.length ||
              selectedRows.every((row) => Boolean(row.list.bomId))
            "
            @click="convertBom"
          >
            <ArtSvgIcon icon="ri:git-branch-line" />转项目 BOM
          </ElButton>
          <ElButton
            v-if="mesWorkOrderTracking"
            v-auth="'MdmAccessoryProcessing:GenerateWorkOrder'"
            :disabled="
              !selectedRows.length ||
              selectedRows.every((row) => !row.materialId || Boolean(row.workOrders?.length))
            "
            @click="openWorkOrderDialog"
          >
            <ArtSvgIcon icon="ri:clipboard-line" />转生产工单
          </ElButton>
        </div>
        <div class="accessory-processing-page__search">
          <ElSelect
            v-model="codeFilter"
            aria-label="筛选编码状态"
            class="accessory-processing-page__status-filter"
          >
            <ElOption label="全部编码状态" value="all" />
            <ElOption label="待编码" value="pending" />
            <ElOption label="已编码" value="coded" />
          </ElSelect>
          <ElInput
            v-model="keyword"
            clearable
            placeholder="搜索项目、图纸、物料"
            aria-label="搜索配件加工明细"
          >
            <template #prefix><ArtSvgIcon icon="ri:search-line" /></template>
          </ElInput>
          <ArtIconButton
            icon="ri:refresh-line"
            label="刷新配件加工清单"
            :loading="loading"
            @click="loadLists"
          />
        </div>
      </div>

      <div class="accessory-processing-page__workspace">
        <ArtWorkspaceSplitter
          primary-size="292px"
          primary-min="248px"
          primary-max="420px"
          :breakpoint="900"
          narrow-mode="stack"
          stacked-primary-size="300px"
        >
          <template #primary>
            <ArtSectionCard
              class="accessory-processing-page__card accessory-processing-page__navigator"
              body-class="accessory-processing-page__navigator-body"
              :show-scrollbar="false"
              title="项目名称"
              subtitle="按系统项目、图纸逐级筛选"
              :loading="loading"
              :error="error"
              :empty="!loading && !error && !projectTree.length"
              empty-title="暂无项目清单"
              empty-description="可新增加工件或导入图纸。"
              @retry="loadLists"
            >
              <template #actions>
                <ArtTreeExpandToggle
                  :tree="treeRef"
                  :data="projectTree"
                  label="项目树"
                  :default-expanded="projectTree.length < 12"
                />
              </template>
              <ElInput
                v-model="projectKeyword"
                clearable
                placeholder="搜索项目或图纸"
                aria-label="搜索项目名称树"
              >
                <template #prefix><ArtSvgIcon icon="ri:search-line" /></template>
              </ElInput>
              <button
                type="button"
                class="accessory-processing-page__all-projects"
                :class="{ 'is-current': !selectedNodeId }"
                @click="selectNode('')"
              >
                <span class="accessory-processing-page__all-icon" aria-hidden="true">
                  <ArtSvgIcon icon="ri:apps-2-line" />
                </span>
                <span class="accessory-processing-page__all-copy">
                  <strong>全部项目</strong>
                  <small>{{ projectTree.length }} 个项目 · {{ allRows.length }} 件加工件</small>
                </span>
                <ArtSvgIcon v-if="!selectedNodeId" icon="ri:check-line" aria-hidden="true" />
              </button>
              <ElScrollbar class="accessory-processing-page__tree-scroll">
                <ElTree
                  ref="treeRef"
                  :data="projectTree"
                  node-key="id"
                  :props="{ label: 'label', children: 'children' }"
                  :current-node-key="selectedNodeId || undefined"
                  :filter-node-method="filterProjectNode"
                  :default-expand-all="projectTree.length < 12"
                  :expand-on-click-node="false"
                  highlight-current
                  @node-click="(node: ProjectNode) => selectNode(node.id)"
                >
                  <template #default="{ data }">
                    <span class="accessory-processing-page__tree-node">
                      <span class="accessory-processing-page__tree-icon" aria-hidden="true">
                        <ArtSvgIcon
                          :icon="
                            data.kind === 'project' ? 'ri:folder-3-line' : 'ri:file-list-3-line'
                          "
                        />
                      </span>
                      <span class="accessory-processing-page__tree-copy">
                        <strong :title="data.label">{{ data.label }}</strong>
                        <small>{{ data.kind === 'project' ? '系统项目' : '加工图纸' }}</small>
                      </span>
                      <span class="accessory-processing-page__tree-count">{{ data.count }}</span>
                    </span>
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
            </ArtSectionCard>
          </template>

          <ArtSectionCard
            class="accessory-processing-page__card accessory-processing-page__detail"
            body-class="accessory-processing-page__detail-body"
            :show-scrollbar="false"
            title="配件加工明细"
            :subtitle="`${selectedNodeLabel} · ${filteredRows.length} 件加工件；同名不同长度分别占一行。`"
            :loading="loading"
            :error="error"
            :empty="!loading && !error && !allRows.length"
            empty-title="暂无配件加工清单"
            empty-description="点击新增手工录入，或使用 AI 识别导入。"
            @retry="loadLists"
          >
            <template v-if="focusMode" #actions>
              <BusinessWorkspaceFocusToggle v-model="focusMode" />
            </template>
            <div class="accessory-processing-page__table-content">
              <div
                v-if="selectedRows.length"
                class="accessory-processing-page__selection-hint"
                aria-live="polite"
              >
                <span>已选择 {{ selectedRows.length }} 件。</span>
                <template v-if="selectedRows.some((row) => row.materialId)">
                  <span
                    >删除支持批量；已编码件可删除编码后保留加工件并重新生成。已被 BOM
                    或工单引用时需先处理下游。</span
                  >
                  <ElButton link type="primary" @click="showPendingRows">查看待编码件</ElButton>
                </template>
                <span v-else>待编码件可批量删除；单选可编辑，转 BOM 和工单需先完成编码。</span>
              </div>
              <div ref="tableViewportRef" class="accessory-processing-page__table-viewport">
                <ArtTable
                  ref="tableRef"
                  :data="visibleRows"
                  :columns="columns"
                  row-key="id"
                  :pagination="{ current: page, size: pageSize, total: filteredRows.length }"
                  :pagination-options="paginationOptions"
                  :show-table-header="false"
                  :loading="loading"
                  empty-text="当前筛选下没有加工件"
                  @selection-change="onSelectionChange"
                  @pagination:current-change="onPageChange"
                  @pagination:size-change="onPageSizeChange"
                >
                  <template #image="{ row }">
                    <ElImage
                      v-if="row.material?.imageUrls?.[0] || row.imageUrls?.[0]"
                      :src="row.material?.imageUrls?.[0] || row.imageUrls?.[0]"
                      :preview-src-list="
                        row.material?.imageUrls?.length ? row.material.imageUrls : row.imageUrls
                      "
                      :alt="`${row.name}图片`"
                      fit="contain"
                      class="h-14 w-16 rounded border border-[var(--el-border-color-lighter)] bg-[var(--default-box-color)]"
                    />
                    <AccessorySketchThumbnail
                      v-else
                      :path="row.sketchPath"
                      :alt="`${row.name}加工草图`"
                    />
                  </template>
                  <template #materialName="{ row }">
                    <span class="font-medium" :title="row.name">{{ row.name }}</span>
                  </template>
                  <template #codeStatus="{ row }">
                    <ElTag size="small" :type="row.materialId ? 'success' : 'info'" effect="plain">
                      {{ row.materialId ? '已编码' : '待编码' }}
                    </ElTag>
                  </template>
                  <template #bomStatus="{ row }">
                    <ElTag size="small" :type="row.list.bomId ? 'success' : 'info'" effect="plain">
                      {{ row.list.bomId ? '已转 BOM' : '未转 BOM' }}
                    </ElTag>
                  </template>
                  <template #orderStatus="{ row }">
                    <ElTag
                      size="small"
                      :type="row.workOrders?.length ? 'success' : 'info'"
                      effect="plain"
                    >
                      {{ row.workOrders?.length ? '已转工单' : '未转工单' }}
                    </ElTag>
                  </template>
                  <template #operation="{ row }">
                    <ElButton
                      v-auth="'MdmAccessoryProcessing:View'"
                      link
                      type="primary"
                      :aria-label="`查看${row.name}加工明细`"
                      @click="openDetail(row)"
                      >查看</ElButton
                    >
                  </template>
                </ArtTable>
              </div>
            </div>
          </ArtSectionCard>
        </ArtWorkspaceSplitter>
      </div>

      <ArtDialog
        ref="recognitionDialogRef"
        size="full"
        :show-footer="false"
        content-max-height="82vh"
      >
        <RecognitionWorkspace @saved="onRecognitionSaved" />
      </ArtDialog>

      <ArtDialog ref="manualDialogRef" size="xl">
        <div class="min-w-0 space-y-4">
          <p class="text-sm text-gray-600 dark:text-gray-300">
            {{
              manualMode === 'edit'
                ? '修改尚未编码的加工件。项目及图纸归属保持不变。'
                : '手工建立一件加工件，物料编码与描述将在生成编码后返填。'
            }}
          </p>
          <ArtForm
            ref="manualFormRef"
            :model-value="manual"
            :items="manualItems"
            :rules="manualRules"
            :span="12"
            :gutter="16"
            label-position="top"
            :show-reset="false"
            :show-submit="false"
          >
            <template #tenantId>
              <ElSelect
                v-model="manual.tenantId"
                filterable
                class="w-full"
                placeholder="选择所属租户"
                @change="onManualTenantChanged"
              >
                <ElOption
                  v-for="tenant in tenantOptions"
                  :key="tenant.id"
                  :label="tenant.tenantName || tenant.tenantCode"
                  :value="tenant.id"
                />
              </ElSelect>
            </template>
            <template #projectId>
              <div class="flex min-w-0 gap-2">
                <ElSelect
                  v-model="manual.projectId"
                  clearable
                  filterable
                  class="min-w-0 flex-1"
                  placeholder="选择系统项目"
                >
                  <ElOption
                    v-for="project in options.projects"
                    :key="project.id"
                    :value="project.id"
                    :label="`${project.projectName} · ${project.projectCode}`"
                  />
                </ElSelect>
                <ElButton
                  v-auth="'MdmSalesProject:Add'"
                  :disabled="!manual.tenantId"
                  @click="openProjectDialog('manual')"
                  >新建</ElButton
                >
              </div>
            </template>
            <template #imageUrls>
              <ArtUploadImage
                v-model="manual.imageUrls"
                multiple
                :limit="5"
                preview-fit="contain"
                :size="92"
                tip="支持上传或从资源库选择，最多 5 张；与物料编码共用图片资源库"
              />
            </template>
          </ArtForm>
        </div>
      </ArtDialog>

      <ArtDialog ref="materialDialogRef" size="lg">
        <div class="min-w-0 space-y-4">
          <p class="text-sm text-gray-600 dark:text-gray-300">
            为 {{ materialRows.length }} 件加工件创建 MDM
            物料。确认系统项目和物料属性后，编码、描述、图片及分类会回写到清单。
          </p>
          <ArtForm
            ref="materialFormRef"
            :model-value="materialConfig"
            :items="materialItems"
            :rules="materialRules"
            :span="12"
            :gutter="16"
            label-position="top"
            :show-reset="false"
            :show-submit="false"
          >
            <template #projectId>
              <div class="flex min-w-0 gap-2">
                <ElSelect
                  v-model="materialConfig.projectId"
                  filterable
                  class="min-w-0 flex-1"
                  placeholder="选择系统项目"
                >
                  <ElOption
                    v-if="
                      materialConfig.projectId &&
                      !options.projects.some((project) => project.id === materialConfig.projectId)
                    "
                    :value="materialConfig.projectId"
                    :label="
                      materialRows[0]?.list.project?.projectName || '原清单关联项目（需重新核对）'
                    "
                  />
                  <ElOption
                    v-for="project in options.projects"
                    :key="project.id"
                    :value="project.id"
                    :label="`${project.projectName} · ${project.projectCode}`"
                  />
                </ElSelect>
                <ElButton v-auth="'MdmSalesProject:Add'" @click="openProjectDialog('material')"
                  >新建</ElButton
                >
              </div>
            </template>
          </ArtForm>
          <div>
            <h3 class="text-sm font-semibold">物料图片（选填）</h3>
            <p class="mt-1 text-xs text-gray-600 dark:text-gray-300"
              >每件加工件可单独上传或从资源库选择图片，最多 5 张。</p
            >
            <div class="mt-3 grid gap-3 sm:grid-cols-2">
              <div
                v-for="row in materialRows"
                :key="row.id"
                class="min-w-0 rounded-[var(--art-control-radius)] bg-[var(--art-gray-100)] p-3 dark:bg-[var(--art-gray-200)]"
              >
                <p class="mb-2 truncate text-sm font-medium" :title="row.name"
                  >{{ row.name }} · {{ row.lengthM }} m</p
                >
                <ArtUploadImage
                  :model-value="materialConfig.imageUrlsByItem[row.id] || []"
                  multiple
                  :limit="5"
                  :size="72"
                  @update:model-value="(value) => setMaterialImages(row.id, value)"
                />
              </div>
            </div>
          </div>
        </div>
      </ArtDialog>

      <ArtDialog ref="workOrderDialogRef" size="lg">
        <div class="min-w-0 space-y-4">
          <p class="text-sm text-gray-600 dark:text-gray-300">
            所选 {{ orderRows.length }} 件加工件将分别生成 PP40 生产工单，项目自动关联到系统项目。
          </p>
          <ArtForm
            ref="workOrderFormRef"
            :model-value="workOrderConfig"
            :items="workOrderItems"
            :rules="workOrderRules"
            :span="12"
            :gutter="16"
            label-position="top"
            :show-reset="false"
            :show-submit="false"
          >
            <template #workOrderType
              ><ElTag type="info" effect="plain">PP40 · 配件加工</ElTag></template
            >
            <template #projectId>
              <div class="flex min-w-0 gap-2">
                <ElSelect
                  v-model="workOrderConfig.projectId"
                  filterable
                  class="min-w-0 flex-1"
                  placeholder="选择系统项目"
                >
                  <ElOption
                    v-if="
                      workOrderConfig.projectId &&
                      !options.projects.some((project) => project.id === workOrderConfig.projectId)
                    "
                    :value="workOrderConfig.projectId"
                    :label="
                      orderRows[0]?.list.project?.projectName || '原清单关联项目（需重新核对）'
                    "
                  />
                  <ElOption
                    v-for="project in options.projects"
                    :key="project.id"
                    :value="project.id"
                    :label="`${project.projectName} · ${project.projectCode}`"
                  />
                </ElSelect>
                <ElButton v-auth="'MdmSalesProject:Add'" @click="openProjectDialog('order')"
                  >新建</ElButton
                >
              </div>
            </template>
            <template #plannedStartDate>
              <ElDatePicker
                v-model="workOrderConfig.plannedStartDate"
                type="date"
                value-format="YYYY-MM-DD"
                class="w-full!"
              />
            </template>
            <template #plannedEndDate>
              <ElDatePicker
                v-model="workOrderConfig.plannedEndDate"
                type="date"
                value-format="YYYY-MM-DD"
                class="w-full!"
              />
            </template>
          </ArtForm>
        </div>
      </ArtDialog>

      <ArtDialog ref="projectDialogRef" size="sm">
        <ArtForm
          ref="projectFormRef"
          :model-value="projectDraft"
          :items="projectItems"
          :rules="projectRules"
          :span="24"
          label-position="top"
          :show-reset="false"
          :show-submit="false"
        />
      </ArtDialog>

      <ArtDialog ref="detailDialogRef" size="lg" :show-footer="false">
        <ArtDescriptions
          v-if="detailRow"
          :data="detailRow"
          :columns="2"
          empty-text="—"
          :items="[
            { key: 'drawingProject', label: '项目名称（图纸）', value: detailRow.list.projectName },
            {
              key: 'systemProject',
              label: '项目名称（系统）',
              value: detailRow.list.project?.projectName
            },
            { key: 'drawing', label: '图纸名称', value: detailRow.list.drawingName },
            { key: 'rowNo', label: '原表序号', value: detailRow.rowNo },
            { key: 'code', label: '物料编码（系统）', value: detailRow.materialCode },
            { key: 'name', label: '物料名称', value: detailRow.name },
            {
              key: 'description',
              label: '物料描述',
              value: detailRow.material?.description,
              span: 2
            },
            { key: 'specification', label: '规格型号', value: detailRow.specificationModel },
            {
              key: 'size',
              label: '展宽 / 长度',
              value: `${detailRow.widthMm ?? '—'} mm / ${detailRow.lengthM} m`
            },
            { key: 'quantity', label: '数量', value: detailRow.quantity },
            { key: 'unit', label: '基本单位', value: detailRow.baseUnit?.unitName },
            { key: 'color', label: '材质与颜色', value: detailRow.materialColor },
            { key: 'remark', label: '备注', value: detailRow.remark },
            { key: 'type', label: '物料类型', value: detailRow.materialType?.typeName },
            { key: 'source', label: '物料来源', value: sourceLabel(detailRow.materialSource) },
            { key: 'category', label: '物料分类', value: detailRow.category?.categoryName },
            { key: 'strategy', label: '编码策略', value: detailRow.codeRule?.ruleName },
            ...(mesWorkOrderTracking
              ? [
                  {
                    key: 'order',
                    label: '生产工单',
                    value: detailRow.workOrders?.map((order) => order.workOrderNo).join('、')
                  }
                ]
              : [])
          ]"
        />
      </ArtDialog>

      <MasterDataDeleteGuard ref="deleteGuardRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="ts">
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import { computed, onMounted, reactive, ref, watch } from 'vue'
  import { useElementSize } from '@vueuse/core'
  import dayjs from 'dayjs'
  import { ElMessage, type FormRules, type ElTree } from 'element-plus'
  import { uniq, uniqBy } from 'lodash-es'
  import { storeToRefs } from 'pinia'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessWorkspaceFocusToggle from '@/components/business/business-workspace-focus-toggle/index.vue'
  import ArtWorkspaceSplitter from '@/components/core/layouts/art-workspace-splitter/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtTreeExpandToggle from '@/components/core/widget/art-tree-expand-toggle/index.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import type { ArtTableExpose } from '@/components/core/tables/art-table/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import MasterDataDeleteGuard, {
    type MasterDataDeleteDependencyMeta,
    type MasterDataDeleteGuardOpenOptions
  } from '@/components/business/master-data-delete-guard/index.vue'
  import {
    formatReferenceStatus,
    getRecordReferenceMeta
  } from '@/components/business/master-data-delete-guard/record-meta'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtUploadImage from '@/components/core/forms/art-upload-image/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useWorkspaceFocus } from '@/hooks/core/useWorkspaceFocus'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import type { ColumnOption } from '@/types/component'
  import {
    convertAccessoryWorkOrders,
    deleteAccessoryItems,
    deleteLegacyAccessoryOrderDrafts,
    fetchAccessoryDeleteDependencies,
    fetchAccessoryCustomers,
    fetchAccessoryLists,
    fetchAccessoryProjects,
    fetchMaterialCategories,
    fetchMaterialReferenceOptions,
    generateAccessoryMaterials,
    generateAccessoryStage,
    isMesWorkOrderTrackingAvailable,
    saveAccessoryDraft,
    saveOperationalMaster,
    updateAccessoryItem,
    type AccessoryCustomerOption,
    type AccessoryProcessingItem,
    type AccessoryProcessingList,
    type AccessoryProjectOption,
    type MaterialCategory,
    type MaterialCodeRule,
    type MaterialType,
    type UnitOfMeasure
  } from '@/api/mdm'
  import AccessorySketchThumbnail from './modules/accessory-sketch-thumbnail.vue'
  import RecognitionWorkspace from './modules/recognition-workspace.vue'

  import MasterDeleteProcessingNotice from '@/components/business/master-delete-processing-notice/index.vue'

  defineOptions({ name: 'MdmAccessoryProcessing' })

  interface AccessoryRow extends AccessoryProcessingItem {
    id: string
    list: AccessoryProcessingList
    drawingProjectName: string
    systemProjectName: string
    systemMaterialCode: string
    materialDescription: string
    unitName: string
    typeName: string
    categoryName: string
    codeRuleName: string
  }
  interface ProjectNode {
    id: string
    label: string
    kind: 'project' | 'drawing'
    count: number
    listIds: string[]
    parentLabel?: string
    children?: ProjectNode[]
  }
  interface ManualModel extends AccessoryProcessingItem {
    tenantId: string
    projectName: string
    drawingName: string
    projectId: string | null
    customerId: string | null
    imageUrls: string[]
  }

  const { confirmAction } = useArtFeedback()
  const { focusMode } = useWorkspaceFocus()
  const { hasAuth } = useAuth()
  const userStore = useUserStore()
  const { isPlatformSuper, getDictMap } = storeToRefs(userStore)
  const { effectiveTenantId, tenantOptions } = storeToRefs(useTenantScopeStore())
  const route = useRoute()
  const targetListId = computed(() =>
    route.query.fromMasterDelete === '1' &&
    (route.query.resourceType === 'bom' ||
      ['mdm_accessory_processing_list', 'mdm_accessory_processing_item'].includes(
        String(route.query.dependencyCode)
      )) &&
    typeof route.query.recordId === 'string'
      ? route.query.recordId
      : ''
  )
  const lists = ref<AccessoryProcessingList[]>([])
  const loading = ref(false)
  const error = ref('')
  // 工单状态来自 MES 联查；未接入 MES 时该整块 UI 隐藏
  const mesWorkOrderTracking = ref(true)
  const keyword = ref('')
  const codeFilter = ref<'all' | 'pending' | 'coded'>('all')
  const projectKeyword = ref('')
  const page = ref(1)
  const pageSize = ref(20)
  const selectedRows = ref<AccessoryRow[]>([])
  const tableRef = ref<ArtTableExpose>()
  const tableViewportRef = ref<HTMLElement | null>(null)
  const { width: tableViewportWidth } = useElementSize(tableViewportRef)
  const paginationOptions = computed(() => ({
    layout:
      tableViewportWidth.value >= 680
        ? 'total, prev, pager, next, sizes, jumper'
        : 'prev, pager, next, sizes',
    pagerCount: tableViewportWidth.value >= 900 ? 7 : 5
  }))
  const selectedNodeId = ref('')
  const treeRef = ref<InstanceType<typeof ElTree>>()
  const recognitionDialogRef = ref<ArtDialogExpose>()
  const manualDialogRef = ref<ArtDialogExpose>()
  const materialDialogRef = ref<ArtDialogExpose>()
  const workOrderDialogRef = ref<ArtDialogExpose>()
  const projectDialogRef = ref<ArtDialogExpose>()
  const detailDialogRef = ref<ArtDialogExpose>()
  const deleteGuardRef = ref<{
    inspect: (options: MasterDataDeleteGuardOpenOptions) => Promise<boolean>
  }>()
  const deleteBusy = ref(false)
  const conversionBusy = ref(false)
  const manualFormRef = ref<InstanceType<typeof ArtForm>>()
  const materialFormRef = ref<InstanceType<typeof ArtForm>>()
  const workOrderFormRef = ref<InstanceType<typeof ArtForm>>()
  const projectFormRef = ref<InstanceType<typeof ArtForm>>()
  const detailRow = ref<AccessoryRow | null>(null)
  const manualMode = ref<'add' | 'copy' | 'edit'>('add')
  const editingRow = ref<AccessoryRow | null>(null)
  const materialRows = ref<AccessoryRow[]>([])
  const orderRows = ref<AccessoryRow[]>([])
  const projectTarget = ref<'manual' | 'material' | 'order'>('manual')
  const options = reactive<{
    tenantId: string
    projects: AccessoryProjectOption[]
    customers: AccessoryCustomerOption[]
    categories: MaterialCategory[]
    types: MaterialType[]
    units: UnitOfMeasure[]
    codeRules: MaterialCodeRule[]
  }>({
    tenantId: '',
    projects: [],
    customers: [],
    categories: [],
    types: [],
    units: [],
    codeRules: []
  })
  const manual = reactive<ManualModel>({
    tenantId: '',
    projectName: '',
    drawingName: '',
    projectId: null,
    customerId: null,
    rowNo: 1,
    name: '',
    widthMm: null,
    lengthM: 1,
    quantity: 1,
    materialColor: '',
    remark: '',
    sketch: null,
    sketchPath: null,
    imageUrls: [],
    specificationModel: '',
    baseUnitId: null,
    materialTypeId: null,
    materialSource: 'self_made',
    categoryId: null,
    codeRuleId: null
  })
  const materialConfig = reactive({
    projectId: '',
    materialTypeId: '',
    materialSource: 'self_made' as const,
    categoryId: '',
    codeRuleId: '',
    imageUrlsByItem: {} as Record<string, string[]>
  })
  const workOrderConfig = reactive({
    projectId: '',
    constructionNo: '',
    plannedStartDate: dayjs().format('YYYY-MM-DD'),
    plannedEndDate: ''
  })
  const projectDraft = reactive({ projectName: '', customerId: '' })

  const allRows = computed<AccessoryRow[]>(() =>
    lists.value.flatMap((list) =>
      list.items.flatMap((item) =>
        item.id
          ? [
              {
                ...item,
                id: item.id,
                list,
                drawingProjectName: list.projectName,
                systemProjectName: list.project?.projectName || '',
                systemMaterialCode: item.materialCode || item.material?.materialCode || '',
                materialDescription: item.material?.description || '',
                unitName: item.baseUnit?.unitName || '',
                typeName: item.materialType?.typeName || '',
                categoryName: item.category?.categoryName || '',
                codeRuleName: item.codeRule?.ruleName || ''
              }
            ]
          : []
      )
    )
  )
  const headerMetrics = computed(() => [
    { label: '加工件', value: allRows.value.length, description: '已保存', icon: 'ri:stack-line' },
    {
      label: '待编码',
      value: allRows.value.filter((row) => !row.materialId).length,
      description: '未生成 MDM 物料',
      icon: 'ri:barcode-line'
    },
    ...(mesWorkOrderTracking.value
      ? [
          {
            label: '待转工单',
            value: allRows.value.filter((row) => !row.workOrders?.length).length,
            description: '未生成 MES 工单',
            icon: 'ri:clipboard-line'
          }
        ]
      : [])
  ])
  const projectTree = computed<ProjectNode[]>(() => {
    const projects = new Map<string, ProjectNode>()
    for (const list of lists.value) {
      const key = `${list.tenantId}:${list.projectId || list.projectName}`
      let project = projects.get(key)
      if (!project) {
        const tenant = tenantOptions.value.find((item) => item.id === list.tenantId)
        project = {
          id: `project:${key}`,
          label: `${isPlatformSuper.value && !effectiveTenantId.value ? `${tenant?.tenantName || '租户'} · ` : ''}${list.project?.projectName || list.projectName || '未关联项目'}`,
          kind: 'project',
          count: 0,
          listIds: [],
          children: []
        }
        projects.set(key, project)
      }
      project.listIds.push(list.id)
      project.count += list.items.length
      const drawingKey = `drawing:${key}:${list.drawingName}`
      let drawing = project.children?.find((item) => item.id === drawingKey)
      if (!drawing) {
        drawing = {
          id: drawingKey,
          label: list.drawingName || '未命名图纸',
          kind: 'drawing',
          parentLabel: project.label,
          count: 0,
          listIds: []
        }
        project.children?.push(drawing)
      }
      drawing.listIds.push(list.id)
      drawing.count += list.items.length
    }
    return [...projects.values()].sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'))
  })
  const selectedNode = computed(() =>
    projectTree.value
      .flatMap((node) => [node, ...(node.children || [])])
      .find((node) => node.id === selectedNodeId.value)
  )
  const selectedNodeLabel = computed(() => selectedNode.value?.label || '全部项目')
  const filteredRows = computed(() => {
    const needle = keyword.value.trim().toLowerCase()
    return allRows.value.filter((row) => {
      if (selectedNode.value && !selectedNode.value.listIds.includes(row.list.id)) return false
      if (codeFilter.value === 'pending' && row.materialId) return false
      if (codeFilter.value === 'coded' && !row.materialId) return false
      if (!needle) return true
      return [
        row.drawingProjectName,
        row.systemProjectName,
        row.list.drawingName,
        row.name,
        row.systemMaterialCode,
        row.materialDescription
      ].some((value) => value?.toLowerCase().includes(needle))
    })
  })
  const visibleRows = computed(() =>
    filteredRows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
  )
  const sourceLabel = (value?: string): string =>
    (getDictMap.value.mdmMaterialSource || []).find((item) => item.value === value)?.label ||
    value ||
    '—'
  const columns = computed<ColumnOption<AccessoryRow>[]>(() =>
    columnDefinitions.filter(
      (column) => mesWorkOrderTracking.value || !('prop' in column) || column.prop !== 'orderStatus'
    )
  )

  const columnDefinitions: ColumnOption<AccessoryRow>[] = [
    { type: 'selection', width: 48, fixed: 'left' },
    { type: 'globalIndex', label: '序号', width: 72, fixed: 'left' },
    { prop: 'image', label: '图片', width: 104, useSlot: true, fixed: 'left' },
    {
      prop: 'drawingProjectName',
      label: '项目名称（图纸）',
      minWidth: 180,
      showOverflowTooltip: true
    },
    {
      prop: 'systemProjectName',
      label: '项目名称（系统）',
      minWidth: 180,
      showOverflowTooltip: true
    },
    { prop: 'list.drawingName', label: '图纸名称', minWidth: 150, showOverflowTooltip: true },
    { prop: 'rowNo', label: '原表序号', width: 96 },
    {
      prop: 'systemMaterialCode',
      label: '物料编码（系统）',
      minWidth: 190,
      showOverflowTooltip: true
    },
    { prop: 'materialName', label: '物料名称', minWidth: 160, useSlot: true },
    { prop: 'materialDescription', label: '物料描述', minWidth: 220, showOverflowTooltip: true },
    { prop: 'specificationModel', label: '规格型号', minWidth: 180, showOverflowTooltip: true },
    { prop: 'widthMm', label: '展宽(mm)', width: 105 },
    { prop: 'lengthM', label: '长度(m)', width: 100 },
    { prop: 'quantity', label: '数量', width: 78 },
    { prop: 'unitName', label: '基本单位', width: 100 },
    { prop: 'materialColor', label: '材质与颜色', minWidth: 160, showOverflowTooltip: true },
    { prop: 'remark', label: '备注', minWidth: 180, showOverflowTooltip: true },
    { prop: 'typeName', label: '物料类型', width: 110 },
    { prop: 'materialSource', label: '物料来源', width: 110, dict: { code: 'mdmMaterialSource' } },
    { prop: 'categoryName', label: '物料分类', width: 120 },
    { prop: 'codeRuleName', label: '编码策略', minWidth: 180, showOverflowTooltip: true },
    { prop: 'codeStatus', label: '编码状态', width: 110, useSlot: true },
    { prop: 'bomStatus', label: '项目 BOM', width: 110, useSlot: true },
    { prop: 'orderStatus', label: '是否转工单', width: 115, useSlot: true },
    { prop: 'operation', label: '操作', width: 82, fixed: 'right', useSlot: true }
  ]

  const manualItems = computed<FormItem[]>(() => [
    ...(isPlatformSuper.value && !effectiveTenantId.value && manualMode.value !== 'edit'
      ? [{ key: 'tenantId', label: '目标租户', type: 'slot' as const, span: 12 }]
      : []),
    ...(manualMode.value === 'edit'
      ? []
      : [
          { key: 'projectName', label: '项目名称（图纸）', type: 'input' as const, span: 12 },
          { key: 'projectId', label: '项目名称（系统）', type: 'slot' as const, span: 12 },
          { key: 'drawingName', label: '图纸名称', type: 'input' as const, span: 12 }
        ]),
    {
      key: 'rowNo',
      label: '原表序号',
      type: 'number',
      span: 6,
      props: { min: 1, precision: 0, class: 'w-full!' }
    },
    { key: 'name', label: '物料名称', type: 'input', span: 12 },
    { key: 'specificationModel', label: '规格型号', type: 'input', span: 12 },
    {
      key: 'widthMm',
      label: '展宽 (mm)',
      type: 'number',
      span: 6,
      props: { min: 0.01, precision: 2, class: 'w-full!' }
    },
    {
      key: 'lengthM',
      label: '长度 (m)',
      type: 'number',
      span: 6,
      props: { min: 0.001, precision: 3, class: 'w-full!' }
    },
    {
      key: 'quantity',
      label: '数量',
      type: 'number',
      span: 6,
      props: { min: 1, precision: 0, class: 'w-full!' }
    },
    {
      key: 'baseUnitId',
      label: '基本单位',
      type: 'select',
      span: 6,
      options: options.units.map((unit) => ({ label: unit.unitName, value: unit.id }))
    },
    { key: 'materialColor', label: '材质与颜色', type: 'input', span: 12 },
    { key: 'remark', label: '备注', type: 'input', span: 12 },
    {
      key: 'materialTypeId',
      label: '物料类型',
      type: 'select',
      span: 8,
      options: options.types.map((type) => ({ label: type.typeName, value: type.id }))
    },
    {
      key: 'materialSource',
      label: '物料来源',
      type: 'select',
      span: 8,
      options: (getDictMap.value.mdmMaterialSource || []).map((source) => ({
        label: source.label,
        value: source.value
      }))
    },
    {
      key: 'categoryId',
      label: '物料分类',
      type: 'select',
      span: 8,
      options: options.categories.map((category) => ({
        label: category.categoryName,
        value: category.id
      }))
    },
    {
      key: 'codeRuleId',
      label: '编码策略',
      type: 'select',
      span: 12,
      options: options.codeRules.map((rule) => ({ label: rule.ruleName, value: rule.id }))
    },
    { key: 'imageUrls', label: '图片', type: 'slot', span: 24 }
  ])
  const manualRules: FormRules = {
    projectName: [{ required: true, message: '请填写图纸项目名称', trigger: 'blur' }],
    drawingName: [{ required: true, message: '请填写图纸名称', trigger: 'blur' }],
    name: [{ required: true, message: '请填写物料名称', trigger: 'blur' }],
    baseUnitId: [{ required: true, message: '请选择基本单位', trigger: 'change' }],
    materialTypeId: [{ required: true, message: '请选择物料类型', trigger: 'change' }],
    categoryId: [{ required: true, message: '请选择物料分类', trigger: 'change' }]
  }
  const materialItems = computed<FormItem[]>(() => [
    { key: 'projectId', label: '项目名称（系统）', type: 'slot', span: 24 },
    {
      key: 'materialTypeId',
      label: '物料类型',
      type: 'select',
      span: 12,
      options: options.types.map((type) => ({ label: type.typeName, value: type.id }))
    },
    {
      key: 'materialSource',
      label: '物料来源',
      type: 'select',
      span: 12,
      options: (getDictMap.value.mdmMaterialSource || []).map((source) => ({
        label: source.label,
        value: source.value
      }))
    },
    {
      key: 'categoryId',
      label: '物料分类',
      type: 'select',
      span: 12,
      options: options.categories.map((category) => ({
        label: category.categoryName,
        value: category.id
      }))
    },
    {
      key: 'codeRuleId',
      label: '编码策略',
      type: 'select',
      span: 12,
      options: options.codeRules.map((rule) => ({ label: rule.ruleName, value: rule.id }))
    }
  ])
  const materialRules: FormRules = {
    projectId: [{ required: true, message: '请选择系统项目', trigger: 'change' }],
    materialTypeId: [{ required: true, message: '请选择物料类型', trigger: 'change' }],
    materialSource: [{ required: true, message: '请选择物料来源', trigger: 'change' }],
    categoryId: [{ required: true, message: '请选择物料分类', trigger: 'change' }],
    codeRuleId: [{ required: true, message: '请选择编码策略', trigger: 'change' }]
  }
  const workOrderItems: FormItem[] = [
    { key: 'workOrderType', label: '工单类型', type: 'slot', span: 12 },
    { key: 'projectId', label: '项目', type: 'slot', span: 12 },
    { key: 'constructionNo', label: '施工号（选填）', type: 'input', span: 12 },
    { key: 'plannedStartDate', label: '计划开始日期', type: 'slot', span: 12 },
    { key: 'plannedEndDate', label: '计划完工日期', type: 'slot', span: 12 }
  ]
  const workOrderRules: FormRules = {
    projectId: [{ required: true, message: '请选择系统项目', trigger: 'change' }],
    plannedStartDate: [{ required: true, message: '请选择计划开始日期', trigger: 'change' }],
    plannedEndDate: [{ required: true, message: '请选择计划完工日期', trigger: 'change' }]
  }
  const projectItems = computed<FormItem[]>(() => [
    { key: 'projectName', label: '项目名称', type: 'input', span: 24 },
    {
      key: 'customerId',
      label: '项目客户',
      type: 'select',
      span: 24,
      options: options.customers.map((customer) => ({
        label: customer.customerName,
        value: customer.id
      }))
    }
  ])
  const projectRules: FormRules = {
    projectName: [{ required: true, message: '请填写项目名称', trigger: 'blur' }],
    customerId: [{ required: true, message: '请选择客户', trigger: 'change' }]
  }

  async function loadLists(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      lists.value = await fetchAccessoryLists(
        effectiveTenantId.value,
        targetListId.value || undefined
      )
      // MES 未同库部署时联查会自动降级，页面据此隐藏工单相关列与动作
      mesWorkOrderTracking.value = isMesWorkOrderTrackingAvailable()
      clearSelectedRows()
    } catch (cause) {
      error.value = getFriendlySupabaseErrorMessage(cause, '配件加工清单加载失败，请重试')
    } finally {
      loading.value = false
    }
  }
  async function loadOptions(tenantId: string): Promise<void> {
    options.tenantId = tenantId
    Object.assign(options, {
      projects: [],
      customers: [],
      categories: [],
      types: [],
      units: [],
      codeRules: []
    })
    if (!tenantId) return
    try {
      const [projects, customers, categories, types, units, codeRules] = await Promise.all([
        fetchAccessoryProjects(tenantId),
        fetchAccessoryCustomers(tenantId),
        fetchMaterialCategories(tenantId),
        fetchMaterialReferenceOptions<MaterialType>('material-type', tenantId),
        fetchMaterialReferenceOptions<UnitOfMeasure>('unit-of-measure', tenantId),
        fetchMaterialReferenceOptions<MaterialCodeRule>('code-rule', tenantId)
      ])
      if (options.tenantId !== tenantId) return
      Object.assign(options, {
        projects,
        customers,
        categories: categories.filter((item) => item.status === 'enabled'),
        types,
        units,
        codeRules
      })
      manual.materialTypeId ||= types.find((item) => item.typeName === '半成品')?.id || null
      manual.baseUnitId ||=
        units.find((item) => item.unitName === '件' || item.unitCode.toUpperCase() === 'PC')?.id ||
        null
      manual.categoryId ||=
        categories.find((item) => item.categoryName === '配件' && item.status === 'enabled')?.id ||
        null
      manual.codeRuleId ||=
        codeRules.find((item) => item.strategy === 'material_type')?.id || codeRules[0]?.id || null
    } catch (cause) {
      ElMessage.error(getFriendlySupabaseErrorMessage(cause, '物料选项加载失败，请重试'))
    }
  }
  function selectNode(id: string): void {
    selectedNodeId.value = id
    page.value = 1
    clearSelectedRows()
    if (!id) treeRef.value?.setCurrentKey(null)
  }
  function clearSelectedRows(): void {
    selectedRows.value = []
    tableRef.value?.elTableRef?.clearSelection()
  }
  function showPendingRows(): void {
    selectNode('')
    codeFilter.value = 'pending'
    keyword.value = ''
  }
  function filterProjectNode(value: string, node: Record<string, unknown>): boolean {
    const needle = value.trim().toLowerCase()
    return (
      !needle ||
      `${String(node.label || '')} ${String(node.parentLabel || '')}`.toLowerCase().includes(needle)
    )
  }
  function onSelectionChange(rows: AccessoryRow[]): void {
    selectedRows.value = rows
  }
  function onPageChange(nextPage: number): void {
    page.value = nextPage
    clearSelectedRows()
  }
  function onPageSizeChange(size: number): void {
    pageSize.value = size
    page.value = 1
    clearSelectedRows()
  }
  function canChangeRow(row?: AccessoryRow): boolean {
    return Boolean(row && !row.materialId && !row.workOrders?.length)
  }
  async function openRecognition(): Promise<void> {
    await recognitionDialogRef.value?.handleOpen(undefined, {
      title: '批量导入 · AI 识别',
      subtitle: '上传清单，校对识别结果，再保存配件加工清单。',
      showFooter: false
    })
  }
  async function onRecognitionSaved(): Promise<void> {
    await loadLists()
  }
  async function openDetail(row?: AccessoryRow): Promise<void> {
    if (!row) return
    detailRow.value = row
    await detailDialogRef.value?.handleOpen(undefined, {
      title: row.name,
      subtitle: row.systemMaterialCode || '尚未生成物料编码',
      showFooter: false
    })
  }
  function resetManual(): void {
    Object.assign(manual, {
      tenantId: effectiveTenantId.value || '',
      projectName: '',
      drawingName: '',
      projectId: null,
      customerId: null,
      rowNo: 1,
      name: '',
      widthMm: null,
      lengthM: 1,
      quantity: 1,
      materialColor: '',
      remark: '',
      sketch: null,
      sketchPath: null,
      imageUrls: [],
      specificationModel: '',
      baseUnitId: null,
      materialTypeId: null,
      materialSource: 'self_made',
      categoryId: null,
      codeRuleId: null
    })
  }
  async function openManual(mode: 'add' | 'copy' | 'edit', row?: AccessoryRow): Promise<void> {
    if (mode !== 'add' && !row) return
    if (mode === 'edit' && !canChangeRow(row)) return
    manualMode.value = mode
    editingRow.value = row || null
    resetManual()
    if (row) {
      Object.assign(manual, {
        ...row,
        tenantId: row.list.tenantId,
        projectName: row.list.projectName,
        drawingName: row.list.drawingName,
        projectId: row.list.projectId,
        customerId: row.list.customerId,
        imageUrls: [...(row.imageUrls?.length ? row.imageUrls : row.material?.imageUrls || [])]
      })
    }
    await manualDialogRef.value?.handleOpen(undefined, {
      title: { add: '新增配件加工件', copy: '复制配件加工件', edit: '编辑配件加工件' }[mode],
      subtitle:
        mode === 'edit'
          ? `${row?.list.drawingName} · 原表第 ${row?.rowNo} 行`
          : '手工添加到配件加工清单',
      confirmText: mode === 'edit' ? '保存更改' : '保存配件加工清单',
      loading: true,
      loadingText: '正在加载物料选项…',
      onOpen: async (_data, api) => {
        try {
          await loadOptions(manual.tenantId)
        } finally {
          api.setLoading(false)
        }
      },
      onConfirm: saveManual
    })
  }
  function onManualTenantChanged(tenantId: string): void {
    manual.projectId = null
    manual.customerId = null
    manual.materialTypeId = null
    manual.baseUnitId = null
    manual.categoryId = null
    manual.codeRuleId = null
    manual.sketchPath = null
    manual.imageUrls = []
    void loadOptions(tenantId)
  }
  function manualItem(): AccessoryProcessingItem {
    return {
      rowNo: manual.rowNo,
      name: manual.name.trim(),
      widthMm: manual.widthMm,
      lengthM: manual.lengthM,
      quantity: manual.quantity,
      materialColor: manual.materialColor.trim(),
      remark: manual.remark.trim(),
      sketch: manual.sketch,
      sketchPath: manual.sketchPath,
      imageUrls: manual.imageUrls,
      specificationModel: normalizeNullableText(manual.specificationModel),
      baseUnitId: manual.baseUnitId,
      materialTypeId: manual.materialTypeId,
      materialSource: manual.materialSource,
      categoryId: manual.categoryId,
      codeRuleId: manual.codeRuleId
    }
  }
  async function saveManual(): Promise<boolean> {
    try {
      await manualFormRef.value?.validate()
      if (
        !manual.tenantId ||
        !manual.name.trim() ||
        manual.lengthM <= 0 ||
        manual.quantity < 1 ||
        manual.rowNo < 1 ||
        !manual.baseUnitId ||
        !manual.materialTypeId ||
        !manual.categoryId
      ) {
        ElMessage.warning('请填写加工件必填项')
        return false
      }
      if (manualMode.value === 'edit' && editingRow.value) {
        await updateAccessoryItem(editingRow.value.id, manualItem())
      } else {
        if (!manual.projectName.trim() || !manual.drawingName.trim()) {
          ElMessage.warning('请填写图纸项目名称和图纸名称')
          return false
        }
        await saveAccessoryDraft({
          mode: manualMode.value === 'copy' ? 'Copy' : 'Add',
          sourceItemId: manualMode.value === 'copy' ? editingRow.value?.id : undefined,
          tenantId: manual.tenantId,
          sourcePath: null,
          sourceName: '',
          projectName: manual.projectName.trim(),
          drawingName: manual.drawingName.trim(),
          projectId: manual.projectId,
          customerId: manual.customerId,
          categoryId: manual.categoryId,
          confidence: 0,
          warnings: [],
          items: [manualItem()]
        })
      }
      ElMessage.success('配件加工件已保存')
      await loadLists()
      return true
    } catch (cause) {
      ElMessage.error(getFriendlySupabaseErrorMessage(cause, '加工件保存失败，请检查内容后重试'))
      return false
    }
  }
  const deleteDependencyMeta: Record<string, MasterDataDeleteDependencyMeta> = {
    mes_work_order: {
      label: '关联生产工单',
      unit: '张',
      description: hasAuth('MesWorkOrder:View')
        ? '工单属于生产业务记录，请先在生产工单页面核对并处理。'
        : '工单属于生产业务记录，请联系有工单权限的人员核对。',
      actionLabel: '去看工单',
      routeName: hasAuth('MesWorkOrder:View') ? 'MesWorkOrder' : undefined,
      order: 10
    },
    mdm_accessory_work_order: {
      label: '旧版加工工单草稿',
      unit: '张',
      description:
        '这是旧流程生成的草稿，不是 MES 生产工单。确认不再需要后，可勾选并明确删除这张草稿。',
      actionLabel: '处理草稿',
      order: 15
    },
    mdm_bom: {
      label: '作为成品的项目 BOM',
      unit: '份',
      description: '物料是 BOM 的成品，需先处理 BOM 后才能删除编码。',
      actionLabel: '去看 BOM',
      routeName: hasAuth('MdmBomMaintenance:View') ? 'MdmBomMaintenance' : undefined,
      order: 20
    },
    mdm_bom_item: {
      label: '作为组件的项目 BOM',
      unit: '份',
      description: '物料已列入 BOM 组件，需先处理对应 BOM。',
      actionLabel: '去看 BOM',
      routeName: hasAuth('MdmBomMaintenance:View') ? 'MdmBomMaintenance' : undefined,
      order: 30
    },
    mdm_accessory_processing_item: {
      label: '共用物料编码的加工件',
      unit: '件',
      description: '其他加工件仍使用同一物料编码，请先分别核对。',
      actionLabel: '去处理',
      routeName: 'MdmAccessoryProcessing',
      order: 40
    }
  }

  async function loadDeleteDependencies(rows: AccessoryRow[], mode: 'items' | 'codes') {
    const dependencies = await fetchAccessoryDeleteDependencies(rows, mode)
    for (const dependency of dependencies) {
      if (deleteDependencyMeta[dependency.dependencyCode]) continue
      const meta = getRecordReferenceMeta(dependency.dependencyCode)
      deleteDependencyMeta[dependency.dependencyCode] = {
        ...meta,
        unit: '条',
        description: meta.routeName
          ? '该业务记录仍在使用物料编码，请到对应页面核对后再删除。'
          : '该业务记录仍在使用物料编码，暂无处理入口，请联系有权限的管理员核对。',
        actionLabel: '查看关联',
        order: 100
      }
    }
    return dependencies.map((dependency) => ({
      ...dependency,
      recordStatus: formatReferenceStatus(dependency.recordStatus)
    }))
  }

  function deleteGuardOptions(
    rows: AccessoryRow[],
    mode: 'items' | 'codes'
  ): Pick<
    MasterDataDeleteGuardOpenOptions,
    'resourceLabel' | 'resources' | 'dependencyMeta' | 'cleanup'
  > {
    return {
      resourceLabel: mode === 'items' ? '加工件' : '物料编码',
      resources: rows.map((row) => ({ id: row.id, label: row.name })),
      dependencyMeta: deleteDependencyMeta,
      cleanup: {
        actionLabel: '删除旧版草稿工单',
        confirmMessage: (count) =>
          `将永久删除选中的 ${count} 张旧版加工工单草稿。请先核对单号；加工件和物料编码仍需再次点击删除，是否继续？`,
        run: (records) => deleteLegacyAccessoryOrderDrafts(records.map((record) => record.targetId))
      }
    }
  }

  async function inspectDeleteReferences(
    rows: AccessoryRow[],
    mode: 'items' | 'codes'
  ): Promise<boolean> {
    return (
      (await deleteGuardRef.value?.inspect({
        ...deleteGuardOptions(rows, mode),
        fetchDependencies: () => loadDeleteDependencies(rows, mode)
      })) ?? true
    )
  }

  async function showDeleteDependencyFailure(
    cause: unknown,
    rows: AccessoryRow[],
    mode: 'items' | 'codes'
  ): Promise<boolean> {
    if (!(cause instanceof Error) || !/引用|关联|使用/.test(cause.message)) return false
    const rawCause = cause.cause
    const code =
      rawCause && typeof rawCause === 'object' && 'code' in rawCause ? rawCause.code : undefined
    if (code !== '22023' && code !== '23503') return false
    await deleteGuardRef.value?.inspect({
      ...deleteGuardOptions(rows, mode),
      fetchDependencies: async () => {
        const dependencies = await loadDeleteDependencies(rows, mode)
        if (dependencies.length) return dependencies
        throw new Error(
          '服务端仍检测到业务引用，但当前账号无法读取关联明细。请刷新后重新检查，仍失败请联系管理员按单号核对。',
          {
            cause
          }
        )
      }
    })
    return true
  }

  async function deleteSelected(): Promise<void> {
    const rows = [...selectedRows.value]
    if (!rows.length || deleteBusy.value || !sameTenant(rows)) return
    deleteBusy.value = true
    const codedCount = rows.filter((row) => row.materialId).length
    try {
      if (await inspectDeleteReferences(rows, 'items')) return
      await confirmAction(
        `确定删除选中的 ${rows.length} 件加工件吗？${codedCount ? `其中 ${codedCount} 件已编码，将一并删除未被业务引用的物料编码。` : ''}此操作无法恢复；若存在 BOM 或工单引用，本批次不会删除任何记录。`,
        '批量删除加工件',
        {
          confirmButtonText: '删除',
          cancelButtonText: '取消',
          type: 'warning'
        }
      )
      const result = await deleteAccessoryItems(
        rows.map((row) => row.id),
        'items'
      )
      ElMessage.success(`已删除 ${result.processed} 件加工件`)
      await loadLists()
    } catch (cause) {
      if (cause === 'cancel' || cause === 'close') return
      if (await showDeleteDependencyFailure(cause, rows, 'items')) return
      ElMessage.error(getFriendlySupabaseErrorMessage(cause, '批量删除失败，请刷新后重试'))
    } finally {
      deleteBusy.value = false
    }
  }
  async function resetSelectedCodes(): Promise<void> {
    const rows = [...selectedRows.value]
    if (
      !rows.length ||
      deleteBusy.value ||
      rows.some((row) => !row.materialId) ||
      !sameTenant(rows)
    )
      return
    deleteBusy.value = true
    try {
      if (await inspectDeleteReferences(rows, 'codes')) return
      await confirmAction(
        `确定删除选中的 ${rows.length} 个物料编码吗？加工件会保留为待编码状态，核对后可重新生成。若存在 BOM 或工单引用，本批次不会修改任何记录。`,
        '删除物料编码',
        { confirmButtonText: '删除编码', cancelButtonText: '取消', type: 'warning' }
      )
      const result = await deleteAccessoryItems(
        rows.map((row) => row.id),
        'codes'
      )
      ElMessage.success(`已删除 ${result.processed} 个物料编码，加工件可重新编辑和编码`)
      await loadLists()
    } catch (cause) {
      if (cause === 'cancel' || cause === 'close') return
      if (await showDeleteDependencyFailure(cause, rows, 'codes')) return
      ElMessage.error(getFriendlySupabaseErrorMessage(cause, '物料编码删除失败，请刷新后重试'))
    } finally {
      deleteBusy.value = false
    }
  }
  function sameTenant(rows: AccessoryRow[]): boolean {
    if (uniq(rows.map((row) => row.list.tenantId)).length === 1) return true
    ElMessage.warning('请按租户分别处理所选加工件')
    return false
  }
  async function openMaterialDialog(): Promise<void> {
    const rows = selectedRows.value.filter((row) => !row.materialId)
    if (rows.length !== selectedRows.value.length) {
      ElMessage.warning('请只选择待编码的加工件，已编码记录无需重复生成')
      return
    }
    if (!rows.length || !sameTenant(rows)) return
    const missingWidth = rows.find((row) => !row.widthMm || row.widthMm <= 0)
    if (missingWidth) {
      ElMessage.warning(`“${missingWidth.name}”缺少展宽，请先编辑展宽（mm）再生成编码`)
      return
    }
    const linkedProjects = uniq(
      rows.map((row) => row.list.projectId).filter((id): id is string => Boolean(id))
    )
    if (linkedProjects.length > 1) {
      ElMessage.warning('所选加工件分属不同系统项目，请按项目分别生成编码')
      return
    }
    materialRows.value = rows
    materialConfig.projectId = linkedProjects[0] || ''
    materialConfig.imageUrlsByItem = Object.fromEntries(
      rows.map((row) => [row.id, [...(row.imageUrls || [])]])
    )
    await materialDialogRef.value?.handleOpen(undefined, {
      title: '生成物料编码',
      subtitle: '物料类型、来源、分类和编码策略与 MDM 物料编码使用同一套选项。',
      confirmText: '执行生成',
      loading: true,
      loadingText: '正在加载物料选项…',
      onOpen: async (_data, api) => {
        try {
          await loadOptions(rows[0].list.tenantId)
          materialConfig.materialTypeId =
            options.types.find((item) => item.typeName === '半成品')?.id || ''
          materialConfig.categoryId =
            options.categories.find((item) => item.categoryName === '配件')?.id || ''
          materialConfig.codeRuleId =
            options.codeRules.find((item) => item.strategy === 'material_type')?.id ||
            options.codeRules[0]?.id ||
            ''
        } finally {
          api.setLoading(false)
        }
      },
      onConfirm: async () => {
        try {
          await materialFormRef.value?.validate()
          if (
            !materialConfig.projectId ||
            !materialConfig.materialTypeId ||
            !materialConfig.categoryId ||
            !materialConfig.codeRuleId
          ) {
            ElMessage.warning('请确认系统项目、物料属性与编码策略')
            return false
          }
          await generateAccessoryMaterials(
            rows.map((row) => row.id),
            materialConfig
          )
          ElMessage.success(`已为 ${rows.length} 件加工件生成物料编码`)
          await loadLists()
          return true
        } catch (cause) {
          ElMessage.error(getFriendlySupabaseErrorMessage(cause, '物料编码生成失败，请重试'))
          return false
        }
      }
    })
  }
  function setMaterialImages(itemId: string, value: string | string[] | null): void {
    materialConfig.imageUrlsByItem[itemId] = Array.isArray(value) ? value : value ? [value] : []
  }
  async function convertBom(): Promise<void> {
    const rows = selectedRows.value
    if (!rows.length || conversionBusy.value || !sameTenant(rows)) return
    const selectedLists = uniqBy(
      rows.map((row) => row.list),
      (list) => list.id
    )
    if (selectedLists.some((list) => list.bomId)) {
      ElMessage.warning('请只选择尚未转项目 BOM 的清单')
      return
    }
    if (selectedLists.some((list) => list.items.some((item) => !item.materialId))) {
      ElMessage.warning('请先为所选清单的全部加工件生成物料编码')
      return
    }
    if (selectedLists.some((list) => !list.projectId)) {
      ElMessage.warning('请先为所选清单关联系统项目')
      return
    }
    try {
      await confirmAction(`将 ${selectedLists.length} 份清单转为项目 BOM。`, '转项目 BOM', {
        confirmButtonText: '执行',
        cancelButtonText: '取消'
      })
    } catch {
      return
    }
    conversionBusy.value = true
    let completed = 0
    try {
      for (const list of selectedLists) {
        await generateAccessoryStage(list.id, 'bom')
        completed++
      }
      ElMessage.success(`已处理 ${selectedLists.length} 份项目 BOM`)
      await loadLists()
    } catch (cause) {
      const reason = getFriendlySupabaseErrorMessage(cause, '项目 BOM 生成失败，请检查项目归属')
      ElMessage.error(
        completed
          ? `已完成 ${completed}/${selectedLists.length} 份项目 BOM；其余未处理。${reason}`
          : reason
      )
      await loadLists()
    } finally {
      conversionBusy.value = false
    }
  }
  async function openWorkOrderDialog(): Promise<void> {
    const rows = selectedRows.value.filter((row) => row.materialId && !row.workOrders?.length)
    if (rows.length !== selectedRows.value.length) {
      ElMessage.warning('请只选择已编码且尚未转工单的加工件')
      return
    }
    if (!rows.length || !sameTenant(rows)) return
    const missingWidth = rows.find((row) => !row.widthMm || row.widthMm <= 0)
    if (missingWidth) {
      ElMessage.warning(`“${missingWidth.name}”缺少展宽，需删除编码、补齐展宽后重新编码`)
      return
    }
    const linkedProjects = uniq(
      rows.map((row) => row.list.projectId).filter((id): id is string => Boolean(id))
    )
    if (linkedProjects.length > 1) {
      ElMessage.warning('所选加工件分属不同系统项目，请分别转单')
      return
    }
    orderRows.value = rows
    Object.assign(workOrderConfig, {
      projectId: linkedProjects[0] || '',
      constructionNo: '',
      plannedStartDate: dayjs().format('YYYY-MM-DD'),
      plannedEndDate: ''
    })
    await workOrderDialogRef.value?.handleOpen(undefined, {
      title: '转生产工单',
      subtitle: '按加工件逐件生成到生产工单数据库，重复执行不会重复建单。',
      confirmText: '执行转单',
      loading: true,
      loadingText: '正在加载项目选项…',
      onOpen: async (_data, api) => {
        try {
          await loadOptions(rows[0].list.tenantId)
        } finally {
          api.setLoading(false)
        }
      },
      onConfirm: async () => {
        try {
          await workOrderFormRef.value?.validate()
          if (
            !workOrderConfig.projectId ||
            !workOrderConfig.plannedEndDate ||
            workOrderConfig.plannedEndDate < workOrderConfig.plannedStartDate
          ) {
            ElMessage.warning('请确认项目和计划日期，完工日期不能早于开始日期')
            return false
          }
          const result = await convertAccessoryWorkOrders(
            rows.map((row) => row.id),
            workOrderConfig
          )
          ElMessage.success(
            `已生成 ${result.created} 张生产工单${result.skipped ? `，跳过 ${result.skipped} 张已转记录` : ''}`
          )
          await loadLists()
          return true
        } catch (cause) {
          ElMessage.error(getFriendlySupabaseErrorMessage(cause, '生产工单生成失败，请重试'))
          return false
        }
      }
    })
  }
  async function openProjectDialog(target: 'manual' | 'material' | 'order'): Promise<void> {
    if (!hasAuth('MdmSalesProject:Add')) return
    projectTarget.value = target
    const targetList =
      target === 'material' ? materialRows.value[0]?.list : orderRows.value[0]?.list
    projectDraft.projectName =
      target === 'manual' ? manual.projectName : targetList?.projectName || ''
    projectDraft.customerId =
      target === 'manual' ? manual.customerId || '' : targetList?.customerId || ''
    await projectDialogRef.value?.handleOpen(undefined, {
      title: '新建系统项目',
      subtitle: '项目会写入 MDM 销售主数据，并自动回填到当前表单。',
      confirmText: '创建并回填',
      onConfirm: async () => {
        const tenantId = target === 'manual' ? manual.tenantId : targetList?.tenantId
        try {
          await projectFormRef.value?.validate()
          if (!tenantId || !projectDraft.projectName.trim() || !projectDraft.customerId) {
            ElMessage.warning('请填写项目名称和客户')
            return false
          }
          const id = await saveOperationalMaster('project', {
            tenantId,
            projectName: projectDraft.projectName.trim(),
            customerId: projectDraft.customerId,
            enabled: true,
            source: 'manual'
          })
          if (!id) throw new Error('项目已保存，但暂时无法取得项目编号，请刷新后选择')
          await loadOptions(tenantId)
          if (projectTarget.value === 'manual') manual.projectId = id
          else if (projectTarget.value === 'material') materialConfig.projectId = id
          else workOrderConfig.projectId = id
          ElMessage.success('项目已创建并回填')
          return true
        } catch (cause) {
          ElMessage.error(getFriendlySupabaseErrorMessage(cause, '项目创建失败，请重试'))
          return false
        }
      }
    })
  }

  watch([keyword, selectedNodeId, codeFilter], () => {
    page.value = 1
    clearSelectedRows()
  })
  watch(filteredRows, () => {
    page.value = Math.min(
      page.value,
      Math.max(1, Math.ceil(filteredRows.value.length / pageSize.value))
    )
  })
  watch([projectKeyword, projectTree], () => {
    treeRef.value?.filter(projectKeyword.value)
  })
  watch(targetListId, () => {
    keyword.value = ''
    projectKeyword.value = ''
    selectedNodeId.value = ''
    codeFilter.value = 'all'
    page.value = 1
    void loadLists()
  })
  watch(effectiveTenantId, () => {
    selectedNodeId.value = ''
    void loadLists()
  })
  onMounted(() => {
    void userStore.ensureDictLoaded('mdmMaterialSource')
    void loadLists()
  })
</script>

<style scoped lang="scss">
  .accessory-processing-page {
    gap: var(--art-space-3);
    min-width: 0;
    overflow: hidden;

    &.is-focus-mode {
      gap: var(--art-space-2);
    }

    &__toolbar {
      display: flex;
      flex: 0 0 auto;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      min-width: 0;
      padding: 9px 12px;
    }

    &__actions,
    &__search {
      display: flex;
      gap: 8px;
      align-items: center;
      min-width: 0;
    }

    &__actions {
      flex: 1 1 1050px;
      flex-wrap: wrap;
    }

    &__actions :deep(.el-button + .el-button) {
      margin-left: 0;
    }

    &__search {
      flex: 0 1 auto;
      margin-left: auto;
    }

    &__search :deep(.el-input) {
      width: 232px;
    }

    &__status-filter {
      width: 138px;
    }

    &__workspace {
      display: flex;
      flex: 1 1 0;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }

    &__card {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }

    :deep(.accessory-processing-page__navigator-body),
    :deep(.accessory-processing-page__detail-body) {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-height: 0;
    }

    :deep(.accessory-processing-page__navigator-body) {
      gap: var(--art-space-3);
    }

    &__all-projects {
      display: grid;
      grid-template-columns: 36px minmax(0, 1fr) 18px;
      gap: 10px;
      align-items: center;
      width: 100%;
      min-height: 58px;
      padding: 8px 10px;
      font: inherit;
      color: var(--el-text-color-regular);
      text-align: left;
      cursor: pointer;
      background: var(--art-gray-100);
      border: 1px solid transparent;
      border-radius: var(--el-border-radius-base);

      &:hover,
      &.is-current {
        background: color-mix(in srgb, var(--theme-color) 9%, var(--default-box-color));
        border-color: color-mix(in srgb, var(--theme-color) 22%, transparent);
      }

      &.is-current {
        box-shadow: inset 3px 0 0 var(--theme-color);
      }

      &:focus-visible {
        outline: 2px solid var(--theme-color);
        outline-offset: 2px;
      }
    }

    &__all-icon,
    &__tree-icon {
      display: grid;
      place-items: center;
      color: var(--theme-color);
    }

    &__all-icon {
      width: 36px;
      height: 36px;
      background: var(--default-box-color);
      border-radius: var(--el-border-radius-base);
    }

    &__all-copy,
    &__tree-copy {
      display: grid;
      min-width: 0;

      strong {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 13px;
        font-weight: 600;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }

      small {
        margin-top: 2px;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 11px;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }
    }

    &__tree-scroll {
      flex: 1;
      min-height: 0;
    }

    &__tree-scroll :deep(.el-tree) {
      background: transparent;
    }

    &__tree-scroll :deep(.el-tree-node__content) {
      height: auto;
      min-height: 48px;
      padding-block: 5px;
      padding-right: 10px;
      margin-bottom: 2px;
      border: 1px solid transparent;
      border-radius: var(--el-border-radius-base);

      &:hover,
      &:focus-within {
        background: var(--art-gray-100);
        border-color: var(--el-border-color-lighter);
      }
    }

    &__tree-scroll :deep(.el-tree-node.is-current > .el-tree-node__content) {
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 10%, var(--default-box-color));
      border-color: color-mix(in srgb, var(--theme-color) 18%, transparent);
      box-shadow: inset 3px 0 0 var(--theme-color);
    }

    &__tree-node {
      display: grid;
      flex: 1;
      grid-template-columns: 20px minmax(0, 1fr) auto;
      gap: 7px;
      align-items: center;
      min-width: 0;
    }

    &__tree-count {
      flex: none;
      min-width: 24px;
      padding: 2px 5px;
      margin-left: 6px;
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      color: var(--el-text-color-secondary);
      text-align: center;
      background: var(--art-gray-100);
      border-radius: 999px;
    }

    &__table-content {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: var(--art-space-2);
      min-width: 0;
      min-height: 0;
      padding-top: var(--art-space-2);
    }

    &__table-viewport {
      flex: 1;
      min-height: 0;
      overflow: hidden;

      :deep(.art-table .el-table) {
        margin-top: 0;
      }
    }

    &__selection-hint {
      display: flex;
      flex: 0 0 auto;
      flex-wrap: wrap;
      gap: 4px 8px;
      align-items: center;
      min-height: 24px;
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }
  }

  @media (width <= 1400px) {
    .accessory-processing-page__actions {
      flex-basis: 100%;
      flex-wrap: wrap;
    }
  }
</style>

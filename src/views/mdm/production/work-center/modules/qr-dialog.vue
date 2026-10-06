<template>
  <ArtDialog ref="dialogRef" size="lg"
    ><div ref="labelsRef" class="center-labels"
      ><div v-for="row in rows" :key="row.id" class="center-labels__item"
        ><QrcodeVue
          :value="row.qrToken"
          :size="144"
          level="M"
          render-as="canvas"
          :margin="4"
        /><strong>{{ row.code }}</strong
        ><span>{{ row.name }}</span></div
      ></div
    ></ArtDialog
  >
</template>
<script setup lang="ts">
  import { ref } from 'vue'
  import QrcodeVue from 'qrcode.vue'
  import { ElMessage } from 'element-plus'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import type { WorkCenter } from '@/api/mdm'
  const dialogRef = ref<ArtDialogExpose>()
  const labelsRef = ref<HTMLElement>()
  const rows = ref<WorkCenter[]>([])
  async function handleOpen(data: WorkCenter[]) {
    rows.value = data
    await dialogRef.value?.handleOpen(undefined, {
      title: `工作中心二维码 · ${data.length} 个`,
      confirmText: '下载 Excel 标签',
      onConfirm: async () => {
        try {
          const [{ default: ExcelJS }, { default: saveAs }] = await Promise.all([
            import('exceljs'),
            import('file-saver')
          ])
          const workbook = new ExcelJS.Workbook()
          const sheet = workbook.addWorksheet('工作中心二维码')
          sheet.columns = [
            { header: '工作中心', key: 'code', width: 24 },
            { header: '名称', key: 'name', width: 30 },
            { header: '二维码', key: 'qr', width: 26 }
          ]
          const canvases = labelsRef.value?.querySelectorAll('canvas')
          if (!canvases || canvases.length !== rows.value.length) throw new Error('二维码未加载')
          rows.value.forEach((row, index) => {
            sheet.addRow({ code: row.code, name: row.name })
            sheet.getRow(index + 2).height = 122
            const image = workbook.addImage({
              base64: canvases[index].toDataURL('image/png'),
              extension: 'png'
            })
            sheet.addImage(image, {
              tl: { col: 2, row: index + 1 },
              ext: { width: 150, height: 150 }
            })
          })
          const bytes = await workbook.xlsx.writeBuffer()
          saveAs(
            new Blob([bytes], {
              type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            }),
            '工作中心二维码.xlsx'
          )
        } catch {
          ElMessage.error('二维码导出失败，请重试')
          return false
        }
      }
    })
  }
  defineExpose({ handleOpen })
</script>
<style scoped lang="scss">
  .center-labels {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 24px;

    &__item {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: center;
      min-width: 0;

      strong,
      span {
        max-width: 100%;
        overflow-wrap: anywhere;
      }

      span {
        color: var(--el-text-color-secondary);
      }
    }
  }
</style>

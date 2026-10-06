import { renderAsync } from 'docx-preview'
import { toPng } from 'html-to-image'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

export interface DocumentPage {
  dataUrl: string
  width: number
  height: number
}

export interface SketchBounds {
  x: number
  y: number
  width: number
  height: number
}

const maxPages = 3
const maxWidth = 1600

function canvasPage(canvas: HTMLCanvasElement): DocumentPage {
  return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height }
}

async function rasterizeImage(file: File): Promise<DocumentPage[]> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, maxWidth / bitmap.width)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('浏览器无法处理该图片')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return [canvasPage(canvas)]
  } finally {
    bitmap.close()
  }
}

async function rasterizePdf(file: File): Promise<DocumentPage[]> {
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const pdf = await task.promise
  try {
    const pages: DocumentPage[] = []
    for (let index = 1; index <= Math.min(pdf.numPages, maxPages); index += 1) {
      const page = await pdf.getPage(index)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: Math.min(2, maxWidth / base.width) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('浏览器无法渲染 PDF')
      await page.render({ canvas, canvasContext: context, viewport }).promise
      pages.push(canvasPage(canvas))
    }
    return pages
  } finally {
    await task.destroy()
  }
}

async function rasterizeDocx(file: File): Promise<DocumentPage[]> {
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:960px;background:#fff;z-index:-1'
  document.body.appendChild(host)
  try {
    await renderAsync(file, host, undefined, { breakPages: true, useBase64URL: true })
    await document.fonts.ready
    const sections = [...host.querySelectorAll<HTMLElement>('section.docx')]
    const targets = (sections.length ? sections : [host]).slice(0, maxPages)
    const pages: DocumentPage[] = []
    for (const target of targets) {
      const dataUrl = await toPng(target, { backgroundColor: '#fff', pixelRatio: 1 })
      const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob())
      pages.push({ dataUrl, width: bitmap.width, height: bitmap.height })
      bitmap.close()
    }
    return pages
  } finally {
    host.remove()
  }
}

export async function rasterizeProcessingList(file: File): Promise<DocumentPage[]> {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (['png', 'jpg', 'jpeg', 'webp'].includes(extension ?? '')) return rasterizeImage(file)
  if (extension === 'pdf') return rasterizePdf(file)
  if (extension === 'docx') return rasterizeDocx(file)
  throw new Error('请上传 PNG、JPG、WebP、PDF 或 DOCX 文件；旧版 DOC 请先另存为 DOCX')
}

export async function cropSketch(page: DocumentPage, bounds: SketchBounds): Promise<Blob> {
  const source = await createImageBitmap(await (await fetch(page.dataUrl)).blob())
  try {
    const sx = Math.max(0, Math.floor((bounds.x / 1000) * source.width))
    const sy = Math.max(0, Math.floor((bounds.y / 1000) * source.height))
    const width = Math.min(source.width - sx, Math.ceil((bounds.width / 1000) * source.width))
    const height = Math.min(source.height - sy, Math.ceil((bounds.height / 1000) * source.height))
    if (width < 10 || height < 10) throw new Error('加工草图区域过小，请手动核对')
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('浏览器无法裁剪加工草图')
    context.drawImage(source, sx, sy, width, height, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('加工草图保存失败')
    return blob
  } finally {
    source.close()
  }
}

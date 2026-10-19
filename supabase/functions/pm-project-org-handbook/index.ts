import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1'

type JsonRecord = Record<string, unknown>
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }
  })

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')
const escapeHtml = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

function buildWordHtml(projectId: string, workspace: JsonRecord): string {
  const version = (workspace.version ?? {}) as JsonRecord
  const nodes = Array.isArray(workspace.nodes) ? workspace.nodes : []
  const positions = Array.isArray(workspace.positions) ? workspace.positions : []
  const assignments = Array.isArray(workspace.assignments) ? workspace.assignments : []
  const rows = assignments
    .map((item) => {
      const row = item as JsonRecord
      return `<tr><td>${escapeHtml(text(row.person_name) || '--')}</td><td>${escapeHtml(text(row.unit_name) || '--')}</td><td>${escapeHtml(text(row.entry_date) || '--')}</td><td>${escapeHtml(text(row.exit_date) || '--')}</td></tr>`
    })
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,"Microsoft YaHei",sans-serif;color:#1f2937}h1{font-size:24px;border-bottom:2px solid #2563eb;padding-bottom:8px}h2{font-size:18px;margin-top:24px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #d1d5db;padding:6px;text-align:left}th{background:#eff6ff}</style></head><body><h1>项目组织机构及岗位职责</h1><p>项目：${escapeHtml(projectId)}</p><p>版本：V${escapeHtml(String(version.version_no ?? '--'))}　${escapeHtml(text(version.title) || '--')}</p><h2>组织节点（${nodes.length}）</h2><ul>${nodes.map((item) => `<li>${escapeHtml(text((item as JsonRecord).node_name) || '--')}</li>`).join('')}</ul><h2>项目岗位（${positions.length}）</h2><ul>${positions.map((item) => `<li>${escapeHtml(text((item as JsonRecord).position_name) || '--')}：${escapeHtml(text((item as JsonRecord).responsibilities) || '未填写职责')}</li>`).join('')}</ul><h2>人员花名册（${assignments.length}）</h2><table><thead><tr><th>姓名</th><th>所属单位</th><th>进场日期</th><th>退场日期</th></tr></thead><tbody>${rows}</tbody></table></body></html>`
}

async function buildPdf(textLines: string[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  let page = pdf.addPage([595, 842])
  let y = 800
  for (const line of textLines) {
    if (y < 48) {
      page = pdf.addPage([595, 842])
      y = 800
    }
    page.drawText(line.slice(0, 100), { x: 40, y, size: 11, font, color: rgb(0.12, 0.16, 0.22) })
    y -= 18
  }
  return await pdf.save()
}

async function uploadArtifact(client: ReturnType<typeof createClient>, bytes: Uint8Array, fileName: string, mimeType: string) {
  const storagePath = `pm-project-org/${crypto.randomUUID()}/${fileName}`
  const upload = await client.storage.from('attachments').upload(storagePath, bytes, { contentType: mimeType, upsert: false })
  if (upload.error) throw new Error('组织手册文件上传失败')
  const publicUrl = client.storage.from('attachments').getPublicUrl(storagePath).data.publicUrl
  const suffix = fileName.split('.').pop() || ''
  const insert = await client.from('sys_attachment').insert({
    storage_mode: 'supabase', origin_name: fileName, object_name: fileName, hash: crypto.randomUUID(),
    mime_type: mimeType, storage_path: storagePath, suffix, size_byte: bytes.byteLength,
    size_info: `${Math.ceil(bytes.byteLength / 1024)} KB`, url: publicUrl, create_by: 'pm-project-org-handbook',
    update_by: 'pm-project-org-handbook', remark: '项目组织基线手册'
  }).select('id').single()
  if (insert.error || !insert.data) throw new Error('组织手册附件登记失败')
  return { id: insert.data.id, publicUrl }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ code: 'method_not_allowed', message: '仅支持 POST' }, 405)
  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anonKey || !serviceRoleKey) return json({ code: 'server_not_configured', message: '文档服务未配置' }, 500)
  const authorization = request.headers.get('authorization')
  if (!authorization) return json({ code: 'unauthorized', message: '登录状态已失效，请重新登录' }, 401)
  const client = createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: authorization } } })
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } })
  const permission = await client.rpc('current_has_permission', { p_permission: 'PmProjectOrg:Export' })
  if (permission.error || permission.data !== true) return json({ code: 'forbidden', message: '当前账号没有生成组织手册的权限' }, 403)
  const body = (await request.json().catch(() => ({}))) as JsonRecord
  const projectId = text(body.projectId)
  const versionId = text(body.versionId)
  if (!projectId || !versionId) return json({ code: 'invalid_input', message: '缺少项目或组织版本' }, 400)
  const workspace = await client.rpc('pm_list_project_org', { p_project_id: projectId, p_version_id: versionId })
  if (workspace.error || !workspace.data?.version || (workspace.data.version as JsonRecord).status !== 'approved') {
    return json({ code: 'baseline_required', message: '只有审批通过的组织基线可以生成组织手册' }, 409)
  }
  try {
    const wordBytes = new TextEncoder().encode(buildWordHtml(projectId, workspace.data as JsonRecord))
    const pdfBytes = await buildPdf([
      '项目组织机构及岗位职责', `项目：${projectId}`, `版本：V${String((workspace.data.version as JsonRecord).version_no ?? '--')}`,
      `组织节点：${Array.isArray(workspace.data.nodes) ? workspace.data.nodes.length : 0}`,
      `项目岗位：${Array.isArray(workspace.data.positions) ? workspace.data.positions.length : 0}`,
      `项目人员：${Array.isArray(workspace.data.assignments) ? workspace.data.assignments.length : 0}`
    ])
    const [word, pdf] = await Promise.all([
      uploadArtifact(admin, wordBytes, '项目组织机构及岗位职责.doc', 'application/msword'),
      uploadArtifact(admin, pdfBytes, '项目组织机构及岗位职责.pdf', 'application/pdf')
    ])
    const artifacts = await admin.from('pm_project_org_artifact').insert([
      { project_id: projectId, version_id: versionId, artifact_type: 'word', attachment_id: word.id, generation_status: 'ready' },
      { project_id: projectId, version_id: versionId, artifact_type: 'pdf', attachment_id: pdf.id, generation_status: 'ready' }
    ]).select('id,artifact_type,attachment_id')
    if (artifacts.error) throw new Error('组织手册产物登记失败')
    return json({ data: { artifacts: artifacts.data ?? [], wordUrl: word.publicUrl, pdfUrl: pdf.publicUrl } })
  } catch (error) {
    console.error('pm-project-org-handbook failed', error)
    return json({ code: 'generation_failed', message: error instanceof Error ? error.message : '组织手册生成失败，请稍后重试' }, 500)
  }
})

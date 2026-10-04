/**
 * 把某个业务模块（默认 hr）接回平台的两份登记表：
 *   - scripts/audit-business-permissions.ts：模块视图根、业务模块集合、权限码前缀、平台超管安全例外白名单
 *   - scripts/business-button-permission-catalog.ts：该模块菜单的按钮权限目录项
 *
 * 用法：node scripts/attach-module-permissions.mjs hr
 * 需要源仓库（含被精简掉的登记项）可读：默认 D:/art-supabase-pro。
 */
import { readFileSync, writeFileSync } from 'node:fs'

const moduleCode = (process.argv[2] ?? 'hr').toLowerCase()
const moduleDir = `modules/art-supabase-${moduleCode}`
const modulePrefix = moduleCode.charAt(0).toUpperCase() + moduleCode.slice(1)
const sourceRoot = 'D:/art-supabase-pro'
const targetRoot = 'D:/art-supabase-template'

const read = (path) => readFileSync(path, 'utf8')
const EOL = /\r?\n/g

// ---- 1. 权限审计脚本 ----
const auditPath = `${targetRoot}/scripts/audit-business-permissions.ts`
let audit = read(auditPath)
const changes = []

// 1a. 模块视图根：插在 system 之前
if (!audit.includes(`'${moduleDir}/src/views'`)) {
  const anchor = /(\r?\n)(\s*\['system', join\(projectRoot, 'src\/views\/system'\)\],)/
  if (!anchor.test(audit)) throw new Error('未找到 managedViewRoots 的 system 锚点')
  audit = audit.replace(
    anchor,
    `$1  ['${moduleCode}', join(projectRoot, '${moduleDir}/src/views')],$1$2`
  )
  changes.push('managedViewRoots')
}

// 1b. 业务模块集合
if (!/businessModules = new Set<ManagedModule>\(\[[^\]]*'hr'/.test(audit)) {
  audit = audit.replace(
    /businessModules = new Set<ManagedModule>\(\[([^\]]*)\]\)/,
    (_match, inner) =>
      `businessModules = new Set<ManagedModule>([${inner.replace(/\s*$/, '')}, '${moduleCode}'])`
  )
  changes.push('businessModules')
}

// 1c. 业务按钮权限码前缀
if (!new RegExp(`\\|${modulePrefix}\\)`).test(audit)) {
  audit = audit.replace(
    /\(\?:System\|Workflow\|Finance\)/,
    `(?:System|Workflow|Finance|${modulePrefix})`
  )
  changes.push('permissionPattern')
}

// 1d. 目录归属解析
if (!audit.includes(`startsWith('${modulePrefix}')`)) {
  audit = audit.replace(
    /(function resolveBusinessCatalogOwner\(menuName: string\): ManagedModule \{\r?\n)/,
    (match) => `${match}  if (menuName.startsWith('${modulePrefix}')) return '${moduleCode}'\n`
  )
  changes.push('resolveBusinessCatalogOwner')
}

writeFileSync(auditPath, audit)
console.log(`audit-business-permissions.ts：${changes.join('、') || '无结构改动'}`)

// ---- 2. 平台超管安全例外：从源仓库搬回该模块的条目 ----
const sourceAudit = read(`${sourceRoot}/scripts/audit-business-permissions.ts`)
const entryPattern = /^ {2}\[\r?\n(?: {4}.*\r?\n)*? {2}\],?$/gm
const sourceEntries = [...sourceAudit.matchAll(entryPattern)]
  .map((match) => match[0])
  .filter((entry) => entry.includes(`${moduleDir}/`))
const targetPaths = new Set(
  [...read(auditPath).matchAll(/'(modules\/art-supabase-[a-z]+\/[^']+)'/g)].map((match) => match[1])
)
const missingEntries = sourceEntries.filter(
  (entry) => !targetPaths.has(/'(modules\/[^']+)'/.exec(entry)?.[1] ?? '')
)
if (missingEntries.length) {
  const marker =
    '// These files use platform-super only for cross-tenant context or controlled writes where explicitly required.'
  const current = read(auditPath)
  if (!current.includes(marker)) throw new Error('未找到 platformSuperAllowlist 注释锚点')
  writeFileSync(auditPath, current.replace(marker, `${missingEntries.join('\n')}\n${marker}`))
}
console.log(`platformSuperAllowlist：新增 ${missingEntries.length} 条 ${moduleCode} 例外`)

// ---- 3. 按钮权限目录 ----
const catalogPath = `${targetRoot}/scripts/business-button-permission-catalog.ts`
const sourceCatalog = read(`${sourceRoot}/scripts/business-button-permission-catalog.ts`)
let catalog = read(catalogPath)

const startMark =
  'export const businessButtonPermissionCatalog: BusinessMenuButtonCatalogEntry[] = ['
const endMark = '\nexport const systemButtonPermissionCatalog'
const sourceStart = sourceCatalog.indexOf(startMark)
const sourceEnd = sourceCatalog.indexOf(endMark)
if (sourceStart < 0 || sourceEnd <= sourceStart) throw new Error('源目录里未找到业务按钮目录数组')

const sourceBlock = sourceCatalog.slice(sourceStart + startMark.length, sourceEnd)
const moduleEntries = [...sourceBlock.matchAll(/^ {2}\{[\s\S]*?^ {2}\},?$/gm)]
  .map((match) => match[0])
  .filter((entry) => new RegExp(`menuName: '${modulePrefix}[A-Za-z]*'`).test(entry))

if (new RegExp(`menuName: '${modulePrefix}[A-Za-z]*'`).test(catalog)) {
  console.log(`business-button-permission-catalog.ts：已存在 ${modulePrefix} 目录项，跳过`)
} else {
  catalog = catalog.replace(startMark, `${startMark}\n${moduleEntries.join('\n')}`)
  writeFileSync(catalogPath, catalog)
  console.log(
    `business-button-permission-catalog.ts：新增 ${moduleEntries.length} 条 ${moduleCode} 菜单按钮`
  )
}

void EOL

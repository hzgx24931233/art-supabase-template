import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import {
  businessButtonPermissionCatalog,
  resolveCatalogPermissionCode,
  systemButtonPermissionCatalog
} from './business-button-permission-catalog'

const projectRoot = resolve(import.meta.dirname, '..')
const migrationDirectory = join(projectRoot, 'supabase/migrations')
const migrationFilePattern = /^(\d{14})_([a-z0-9_]+)\.sql$/
const requiredPermissionMigrations = [
  'business_button_permissions',
  'system_button_permissions',
  'tenant_notification_reminder',
  'backfill_new_button_permissions_for_existing_roles'
] as const
// Local migration SQL is intentionally absent; new migrations must remain unique.
const remoteDuplicateMigrationAllowlist = new Set<string>()
type ManagedModule = 'fms' | 'system' | 'workflow'

const managedViewRoots = new Map<ManagedModule, string>([
  ['system', join(projectRoot, 'src/views/system')],
  ['workflow', join(projectRoot, 'src/views/workflow')],
  ['fms', join(projectRoot, 'modules/art-supabase-fms/src/views')]
])
const businessModules = new Set<ManagedModule>(['fms'])
const sourceExtensions = new Set(['.ts', '.tsx', '.vue'])
const permissionPattern =
  /['"`]((?:System|Workflow|Finance)[A-Za-z0-9]*(?::[A-Za-z][A-Za-z0-9]*)+)['"`]/g
const platformSuperPattern = /isPlatformSuper|平台超级管理员|仅平台|platform super administrator/i

// These files use platform-super only for cross-tenant context or controlled writes where explicitly required.
// Adding a file here requires an explicit security rationale; normal business maintenance is forbidden.

// Catalogued actions must declare their exact code in page source unless listed here.
const sourceReferenceExemptions = new Map<string, string>([])

function walkSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolutePath = join(directory, entry)
    const stats = statSync(absolutePath)
    if (stats.isDirectory()) return walkSourceFiles(absolutePath)
    return sourceExtensions.has(extname(entry)) ? [absolutePath] : []
  })
}

function toProjectPath(filePath: string): string {
  return relative(projectRoot, filePath).replaceAll('\\', '/')
}

/** 新增业务模块时在这里登记菜单前缀与模块归属。 */
function resolveBusinessCatalogOwner(menuName: string): ManagedModule {
  if (menuName.startsWith('Finance')) return 'fms'
  throw new Error(`未登记的业务菜单归属：${menuName}`)
}

const catalogRows = [
  ...businessButtonPermissionCatalog.flatMap((entry) =>
    entry.buttons.map((definition) => ({
      owner: resolveBusinessCatalogOwner(entry.menuName),
      menuName: entry.menuName,
      action: definition.action,
      code: resolveCatalogPermissionCode(entry.menuName, definition)
    }))
  ),
  ...systemButtonPermissionCatalog.flatMap((entry) =>
    entry.buttons.map((definition) => ({
      owner: 'system' as const,
      menuName: entry.menuName,
      action: definition.action,
      code: resolveCatalogPermissionCode(entry.menuName, definition)
    }))
  )
]
const catalogCodes = new Set(catalogRows.map((row) => row.code))
assert.equal(catalogCodes.size, catalogRows.length, '业务按钮权限码存在重复，请保持全局唯一')

for (const code of sourceReferenceExemptions.keys()) {
  assert.ok(catalogCodes.has(code), `页面权限引用例外未登记在目录中：${code}`)
}

for (const row of catalogRows) {
  assert.match(
    row.code,
    /^[A-Za-z][A-Za-z0-9]*(?::[A-Za-z][A-Za-z0-9]*)+$/,
    `权限码格式不正确：${row.code}`
  )
}

const migrationFiles = readdirSync(migrationDirectory)
  .filter((fileName) => fileName.endsWith('.sql'))
  .sort()
  .map((fileName) => {
    const match = migrationFilePattern.exec(fileName)
    assert.ok(match, `迁移文件名必须使用 <14位版本>_<snake_case名称>.sql：${fileName}`)

    const sql = readFileSync(join(migrationDirectory, fileName), 'utf8')
    assert.ok(sql.trim(), `迁移文件不能为空：${fileName}`)

    return {
      fileName,
      version: match[1],
      name: match[2],
      sql,
      contentHash: createHash('sha256').update(sql.replace(/\r\n?/g, '\n').trimEnd()).digest('hex')
    }
  })

const duplicateVersions = migrationFiles
  .filter((migration, index, migrations) =>
    migrations.some(
      (candidate, candidateIndex) =>
        candidateIndex < index && candidate.version === migration.version
    )
  )
  .map((migration) => migration.version)
assert.deepEqual(duplicateVersions, [], `迁移版本号重复：${duplicateVersions.join(', ')}`)

const duplicateContents = migrationFiles
  .filter(
    (migration, index, migrations) =>
      !remoteDuplicateMigrationAllowlist.has(migration.fileName) &&
      migrations.some(
        (candidate, candidateIndex) =>
          candidateIndex < index && candidate.contentHash === migration.contentHash
      )
  )
  .map((migration) => migration.fileName)
assert.deepEqual(duplicateContents, [], `存在内容完全重复的迁移：${duplicateContents.join(', ')}`)

for (const fileName of remoteDuplicateMigrationAllowlist) {
  const duplicateIndex = migrationFiles.findIndex((migration) => migration.fileName === fileName)
  assert.notEqual(duplicateIndex, -1, `远端重复迁移兼容项不存在：${fileName}`)
  assert.ok(
    migrationFiles.some(
      (candidate, candidateIndex) =>
        candidateIndex < duplicateIndex &&
        candidate.contentHash === migrationFiles[duplicateIndex]!.contentHash
    ),
    `远端重复迁移兼容项不再重复，请移除白名单：${fileName}`
  )
}

if (migrationFiles.length > 0) {
  assert.ok(
    migrationFiles.some((migration) => migration.name === 'baseline'),
    '缺少真实数据库 baseline 迁移'
  )

  const requiredMigrationFiles = new Map(
    requiredPermissionMigrations.map((migrationName) => {
      const matches = migrationFiles.filter((migration) => migration.name === migrationName)
      assert.equal(matches.length, 1, `权限关键迁移必须且只能存在一份：${migrationName}`)
      return [migrationName, matches[0]!]
    })
  )
  const allMigrationSql = migrationFiles.map((migration) => migration.sql).join('\n')
  const missingFromMigration = catalogRows.filter(
    (row) =>
      !allMigrationSql.includes(JSON.stringify(row.code)) &&
      !allMigrationSql.includes(`'${row.code}'`)
  )
  assert.deepEqual(
    missingFromMigration,
    [],
    `权限目录尚未写入迁移：${missingFromMigration.map((row) => row.code).join(', ')}`
  )

  const compatibilityMigrationSql = requiredMigrationFiles.get(
    'backfill_new_button_permissions_for_existing_roles'
  )!.sql
  for (const migrationOwner of [
    'codex-business-permission-migration',
    'codex-system-permission-migration'
  ]) {
    assert.ok(
      compatibilityMigrationSql.includes(`'${migrationOwner}'`),
      `历史页面角色兼容迁移缺少按钮来源：${migrationOwner}`
    )
  }
  assert.match(
    compatibilityMigrationSql,
    /button\.parent_id\s*=\s*parent_grant\.menu_id/,
    '历史角色只能继承其已授权页面直属的新增按钮'
  )
}

const sourceFiles = [...managedViewRoots.entries()].flatMap(([moduleName, viewRoot]) =>
  existsSync(viewRoot)
    ? walkSourceFiles(viewRoot).map((filePath) => ({ filePath, moduleName }))
    : []
)
const availableSourceModules = new Set<ManagedModule>(
  [...managedViewRoots.entries()]
    .filter(([, viewRoot]) => existsSync(viewRoot))
    .map(([moduleName]) => moduleName)
)
const uncataloguedReferences: string[] = []
const forbiddenPlatformSuperReferences: string[] = []
const sourceText = new Map<string, string>()

for (const { filePath, moduleName } of sourceFiles) {
  const source = readFileSync(filePath, 'utf8')
  const projectPath = toProjectPath(filePath)
  sourceText.set(projectPath, source)

  for (const match of source.matchAll(permissionPattern)) {
    const code = match[1]
    if (code && !catalogCodes.has(code)) uncataloguedReferences.push(`${projectPath}: ${code}`)
  }

  if (
    businessModules.has(moduleName) &&
    platformSuperPattern.test(source) &&
    !platformSuperAllowlist.has(projectPath)
  ) {
    forbiddenPlatformSuperReferences.push(projectPath)
  }
}

const allManagedSource = [...sourceText.values()].join('\n')
const missingExplicitReferences = catalogRows.filter(
  ({ code, owner }) =>
    availableSourceModules.has(owner) &&
    !sourceReferenceExemptions.has(code) &&
    !allManagedSource.includes(`'${code}'`) &&
    !allManagedSource.includes(`"${code}"`) &&
    !allManagedSource.includes(`\`${code}\``)
)

assert.deepEqual(
  [...new Set(uncataloguedReferences)].sort(),
  [],
  `页面引用了未登记的业务按钮权限：\n${[...new Set(uncataloguedReferences)].sort().join('\n')}`
)
assert.deepEqual(
  forbiddenPlatformSuperReferences.sort(),
  [],
  `业务页面存在未获安全例外的平台超管判断：\n${forbiddenPlatformSuperReferences.sort().join('\n')}`
)
assert.deepEqual(
  missingExplicitReferences,
  [],
  `Every catalogued action must declare its exact permission code in page source; inference is fallback only:\n${missingExplicitReferences
    .map((row) => row.code)
    .join('\n')}`
)

console.log(
  `Managed permission audit passed: ${businessButtonPermissionCatalog.length} business menus, ${catalogRows.length} button permissions, ${sourceFiles.length} source files, ${migrationFiles.length} migrations.`
)

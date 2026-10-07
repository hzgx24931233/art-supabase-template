/**
 * 从 supabase 备份快照里抽出一份可复用的数据库交付物。
 *
 * 用法：
 *   tsx scripts/build-platform-baseline.ts --backup <快照目录> [--profile platform|hr] [--report] [--out <目录>]
 *
 * profile=platform（默认）：输出平台内核 schema + 基线数据（租户、内置角色、平台菜单、字典、参数）。
 * profile=hr：输出 HR 模块的领域 schema + 模块数据（HR 菜单、HR 角色授权、HR 字典）。
 *
 * 输入是 supabase/backup-supabase.ps1 产出的快照（database/schema.sql、database/data.sql）。
 * 保留判据：从「保留代码实际调用的表与 RPC」出发做依赖闭包，而不是按表名前缀猜。
 * 未解析引用（引用到被移除对象或托管对象）会写进报告；`--report` 只统计不写文件。
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

// ---------------------------------------------------------------------------
// 配置：保留 / 丢弃判定
// ---------------------------------------------------------------------------

const cliArgs = process.argv.slice(2)
const profileArgIndex = cliArgs.indexOf('--profile')
const profile = (profileArgIndex >= 0 ? cliArgs[profileArgIndex + 1] : 'platform') as
  'platform' | 'hr'
if (!['platform', 'hr'].includes(profile)) throw new Error(`未知 profile：${profile}`)

interface ProfileConfig {
  /** 该交付物自有的表/视图前缀。 */
  corePrefixes: readonly string[]
  /** 代码仍然依赖、但名字不带自有前缀的契约对象。 */
  contractTables: readonly string[]
  /** 扫描数据库依赖的代码根目录。 */
  codeRoots: readonly string[]
  /**
   * 输出文件名。平台交付物沿用仓库既有命名（schema→baseline、data→seed），
   * 与 supabase/baseline/verify-baseline.ps1 和 README 引用保持一致。
   */
  outputFiles: { schema: string; data: string; report: string }
}

const PROFILES: Record<'platform' | 'hr', ProfileConfig> = {
  platform: {
    // mdm_ 前缀属于平台自身：主数据（物料 / 工程 / 销售 / 生产）已作为主平台功能并入
    // src/views/mdm/**，其数据模型由平台承担，不再依赖「只保留被前端直接引用的表」那条闭包，
    // 否则仅在 RPC 函数体里出现的表（如 mdm_shift_schedule_member）会被裁掉。
    corePrefixes: ['sys_', 'wf_', 'ai_', 'mdm_'],
    // 平台代码仍然依赖的跨域契约对象（读取型集成、识别工件、收发货目标）
    contractTables: [
      'sync_user_audit',
      'mdm_organization',
      'mdm_carrier',
      'mdm_customer',
      'mdm_employee',
      'mdm_material',
      'mdm_project',
      'mdm_project_construction',
      'mdm_warehouse',
      'mdm_warehouse_bin',
      'scm_receipt_target_document',
      'scm_receipt_target_line',
      'tms_invoice'
    ],
    codeRoots: ['src', 'supabase/functions'],
    outputFiles: {
      schema: 'platform-baseline.sql',
      data: 'platform-seed.sql',
      report: 'platform-baseline-report.json'
    }
  },
  hr: {
    corePrefixes: ['hr_'],
    // HR 依赖的组织/人员/岗位主数据（这些表在平台基线里已存在，这里只做外键闭包与重建保护）
    contractTables: [
      'mdm_organization',
      'mdm_employee',
      'mdm_position',
      'mdm_job_profile',
      'mdm_job_family',
      'mdm_grade'
    ],
    codeRoots: ['modules/art-supabase-hr/src'],
    outputFiles: { schema: 'hr-schema.sql', data: 'hr-data.sql', report: 'hr-report.json' }
  }
}

const activeProfile = PROFILES[profile]
const CORE_PREFIXES = activeProfile.corePrefixes
const CONTRACT_TABLES = activeProfile.contractTables

/** 历史备份/审计快照表，任何 schema 下都丢弃。 */
const DROP_TABLE_PATTERN = /^(backup_|codex_backup_)/

/** 备份里携带的临时 schema。 */
const DROP_SCHEMAS = ['backup_mdm_mes_20260909']

/**
 * 代码不会用 `.rpc()` 直接调用、但平台运行必需的函数（数据库内部种子与调度入口）。
 * 观察未解析引用报告后按需补充。
 */
const CODE_SEED_FUNCTIONS = new Set<string>([
  'seed_field_permission_catalog',
  'seed_field_permission_catalog_for_tenant',
  'seed_notification_defaults',
  'seed_notification_defaults_for_new_tenant',
  'seed_document_number_rules',
  'seed_document_number_rules_for_tenant',
  'seed_notification_scenarios_for_tenant'
])

/** 托管 schema：由 Supabase 管理，基线不创建也不引用。 */
const MANAGED_SCHEMAS = [
  'auth',
  'storage',
  'extensions',
  'pg_catalog',
  'information_schema',
  'realtime',
  'vault',
  'net',
  'graphql',
  'graphql_public',
  'supabase_migrations',
  'supabase_functions',
  'pgsodium',
  'pgsodium_masks',
  'cron',
  'pgbouncer'
]

/** 备份里出现的扩展；带 IF NOT EXISTS，重复执行安全。 */
const KEEP_EXTENSIONS = true

// ---------------------------------------------------------------------------
// 解析
// ---------------------------------------------------------------------------

interface Block {
  schema: string
  type: string
  name: string
  sql: string
  index: number
}

interface CopyBlock {
  schema: string
  table: string
  columns: string[]
  rows: string[][]
}

const args = process.argv.slice(2)
const backupArgIndex = args.indexOf('--backup')
if (backupArgIndex < 0 || !args[backupArgIndex + 1]) {
  console.error(
    '用法：tsx scripts/build-platform-baseline.ts --backup <快照目录> [--report] [--out <目录>]'
  )
  process.exit(1)
}
const backupRoot = resolve(args[backupArgIndex + 1])
const reportOnly = args.includes('--report')
const outIndex = args.indexOf('--out')
const outputDirectory = resolve(outIndex >= 0 ? args[outIndex + 1] : 'supabase/baseline')

const schemaSource = readFileSync(join(backupRoot, 'database', 'schema.sql'), 'utf8')
const dataSource = readFileSync(join(backupRoot, 'database', 'data.sql'), 'utf8')

const headerPattern =
  /^-- Name: (?<name>.+?); Type: (?<type>[A-Z_ ]+); Schema: (?<schema>[^;]+); Owner: (?<owner>.*)$/gm

function parseBlocks(source: string): Block[] {
  const headers = [...source.matchAll(headerPattern)]
  return headers.map((match, index) => {
    const start = match.index + match[0].length
    const end = index + 1 < headers.length ? headers[index + 1].index : source.length
    return {
      schema: match.groups!.schema.trim(),
      type: match.groups!.type.trim(),
      name: match.groups!.name.trim(),
      sql: source.slice(start, end).trim(),
      index
    }
  })
}

function parseCopyBlocks(source: string): CopyBlock[] {
  const blocks: CopyBlock[] = []
  const lines = source.split('\n')
  let current: (Omit<CopyBlock, 'rows'> & { rows: string[][] }) | null = null
  for (const line of lines) {
    const copyMatch = /^COPY "([^"]+)"\."([^"]+)" \(([^)]*)\) FROM stdin;$/.exec(line)
    if (copyMatch) {
      current = {
        schema: copyMatch[1],
        table: copyMatch[2],
        columns: copyMatch[3].split(',').map((column) => column.trim().replace(/"/g, '')),
        rows: []
      }
      continue
    }
    if (current) {
      if (line === '\\.') {
        blocks.push(current)
        current = null
        continue
      }
      current.rows.push(line.split('\t'))
    }
  }
  return blocks
}

const blocks = parseBlocks(schemaSource)
const copyBlocks = parseCopyBlocks(dataSource)

// ---------------------------------------------------------------------------
// 取名字：不同 block 类型里 name 的含义不一样，统一成「对象键」
// ---------------------------------------------------------------------------

const quoteStripped = (value: string): string => value.replace(/"/g, '').trim()

/** 从 SQL 文本里找出所有 schema 限定引用（带引号或不带引号），区分函数调用与关系引用。 */
function extractReferences(sql: string): {
  functions: Set<string>
  relations: Set<string>
} {
  const functions = new Set<string>()
  const relations = new Set<string>()
  // 同时匹配 "public"."t" 与 public.t 两种写法：函数体里未加引号的引用同样要参与闭包
  const pattern =
    /(?:"([a-z_][a-z0-9_]*)"|(?<![\w."])([a-z_][a-z0-9_]*))\.(?:"([a-z_][a-z0-9_]*)"|([a-z_][a-z0-9_]*))(\s*\()?/gi
  const relationKeywords =
    /\b(references|from|join|into|update|table|on|only|exists|create\s+table(\s+if\s+not\s+exists)?|delete\s+from|alter\s+table)\s*$/i
  for (const match of sql.matchAll(pattern)) {
    const schema = (match[1] ?? match[2]).toLowerCase()
    const name = (match[3] ?? match[4]).toLowerCase()
    const key = `${schema}.${name}`
    const preceding = sql.slice(Math.max(0, (match.index ?? 0) - 32), match.index ?? 0)
    // REFERENCES "t"."c"(...) / ON "t" 都是关系引用，括号属于列清单或 JOIN 条件
    if (relationKeywords.test(preceding)) relations.add(key)
    else if (match[5]) functions.add(key)
    else relations.add(key)
  }
  return { functions, relations }
}

function tableBlockName(block: Block): string {
  if (typeof block?.name !== 'string') {
    throw new Error(
      'block without name: ' +
        JSON.stringify({
          schema: block?.schema,
          type: block?.type,
          keys: block ? Object.keys(block) : null
        })
    )
  }
  return quoteStripped(block.name)
}

function relationNameFromSql(sql: string): string | null {
  const match =
    /(?:ALTER\s+TABLE(?:\s+ONLY)?|CREATE(?:\s+OR\s+REPLACE)?\s+(?:TRIGGER|RULE)|ON)\s+"([a-z_][a-z0-9_]*)"\."([a-z_][a-z0-9_]*)"|CREATE\s+(?:UNIQUE\s+)?INDEX\s+"[^"]+"\s+ON\s+"([a-z_][a-z0-9_]*)"\."([a-z_][a-z0-9_]*)"|COMMENT\s+ON\s+(?:TABLE|VIEW|COLUMN)\s+"([a-z_][a-z0-9_]*)"\."([a-z_][a-z0-9_]*)"/i.exec(
      sql
    )
  if (!match) return null
  const schema = match[1] ?? match[3] ?? match[5]
  const name = match[2] ?? match[4] ?? match[6]
  return `${schema.toLowerCase()}.${name.toLowerCase()}`
}

const isCoreName = (name: string): boolean =>
  CORE_PREFIXES.some((prefix) => name.startsWith(prefix)) ||
  (CONTRACT_TABLES as readonly string[]).includes(name)

const isDroppableRelation = (schema: string, name: string): boolean => {
  if (DROP_SCHEMAS.includes(schema)) return true
  if (MANAGED_SCHEMAS.includes(schema)) return true
  if (schema === 'public' && DROP_TABLE_PATTERN.test(name)) return true
  if (schema === 'app_private' && DROP_TABLE_PATTERN.test(name)) return true
  return false
}

// ---------------------------------------------------------------------------
// 保留集合：种子 + 依赖闭包
// ---------------------------------------------------------------------------

const tableByName = new Map<string, Block>()
const viewByName = new Map<string, Block>()
const functionByKey = new Map<string, Block[]>()
for (const block of blocks) {
  const plainName = quoteStripped(block.name)
  if (block.type === 'TABLE') tableByName.set(`${block.schema}.${plainName}`, block)
  if (block.type === 'VIEW') viewByName.set(`${block.schema}.${plainName}`, block)
  if (block.type === 'FUNCTION') {
    const base = plainName.split('(')[0]
    const key = `${block.schema}.${base}`
    const list = functionByKey.get(key) ?? []
    list.push(block)
    functionByKey.set(key, list)
  }
}

const runtimeOptionalRelations = new Map<string, Set<string>>()
const keptBlocks = new Set<Block>()
const keepReasons = new Map<string, string>()
const unresolved = new Map<string, Set<string>>()

function keep(block: Block, reason: string): boolean {
  if (keptBlocks.has(block)) return false
  keptBlocks.add(block)
  keepReasons.set(`${block.type} ${block.schema}.${block.name}`, reason)
  return true
}

function recordUnresolved(key: string, from: string): void {
  // COMMENT/SEQUENCE 等 block 的对象标识本身会被当成引用，这里剔除这类自引用噪声，
  // 只保留真正找不到的定义（真实缺口以 verify-baseline.ps1 的连库校验为准）。
  const [schema, name] = key.split('.')
  if (tableByName.has(`${schema}.${name}`) || viewByName.has(`${schema}.${name}`)) return
  const fromName = from.split(':').slice(1).join(':')
  if (fromName.includes(name)) return
  const set = unresolved.get(key) ?? new Set<string>()
  set.add(from)
  unresolved.set(key, set)
}

// ---------------------------------------------------------------------------
// 从保留代码扫描数据库依赖：表 + RPC + 视图。这是保留集合的真正种子，
// 表名前缀只用来补充平台内核（sys_/wf_/ai_），避免「按名字猜」漏掉契约对象。
// ---------------------------------------------------------------------------

function walkSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolutePath = join(directory, entry)
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') return []
    const stats = statSync(absolutePath)
    if (stats.isDirectory()) return walkSourceFiles(absolutePath)
    return /\.(ts|vue|tsx)$/.test(entry) ? [absolutePath] : []
  })
}

function scanCodeDependencies(codeRoots: string[]): {
  tables: Set<string>
  rpcs: Set<string>
} {
  const tables = new Set<string>()
  const rpcs = new Set<string>()
  for (const file of codeRoots.flatMap((root) => walkSourceFiles(resolve(root)))) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/\.from\(\s*'([a-z_][a-z0-9_]*)'/g)) tables.add(match[1])
    for (const match of source.matchAll(/\.rpc\(\s*'([a-z_][a-z0-9_]*)'/g)) rpcs.add(match[1])
    // 表名与字典码还会以其它形式出现，只认 .from() 会漏掉它们：
    //   · 作为参数传给封装函数：fetchReference('mdm_work_center', …)
    //   · PostgREST 嵌入查询字符串：select('…,mdm_material_attribute(id,name)')
    //   · 字典码是 camelCase：getDictMap.value.mdmMaterialSource
    // 因此改用大小写不限的标识符扫描，再与快照里的对象名求交（比较时统一小写）。
    for (const match of source.matchAll(/\b([A-Za-z][A-Za-z0-9_]{4,})\b/g)) {
      tables.add(match[1])
    }
  }
  return { tables, rpcs }
}

const codeDependencies = scanCodeDependencies([...activeProfile.codeRoots])
const snapshotRelationNames = new Set<string>(
  [...tableByName.keys(), ...viewByName.keys()]
    .map((key) => key.split('.').pop() ?? '')
    .filter(Boolean)
)
const codeTableNames = new Set(
  [...codeDependencies.tables]
    .map((name) => name.toLowerCase())
    .filter((name) => snapshotRelationNames.has(name))
)
const codeRpcNames = new Set([...codeDependencies.rpcs].map((name) => name.toLowerCase()))

// 种子 1：平台内核表/视图 + 代码直接读写的表 + 代码调用的 RPC
const missingCodeTables: string[] = []
for (const name of codeTableNames) {
  if (!tableByName.has(`public.${name}`) && !viewByName.has(`public.${name}`)) {
    missingCodeTables.push(name)
  }
}
const seededRpcNames = new Set<string>()
for (const block of blocks) {
  if (block.type === 'TABLE') {
    const name = quoteStripped(block.name)
    if (isDroppableRelation(block.schema, name)) continue
    if (block.schema !== 'public') continue
    if (isCoreName(name) || codeTableNames.has(name.toLowerCase())) {
      keep(block, isCoreName(name) ? 'core-prefix' : 'code-table')
    }
  }
  if (block.type === 'VIEW') {
    const name = quoteStripped(block.name)
    if (MANAGED_SCHEMAS.includes(block.schema)) continue
    if (!['public', 'app_private'].includes(block.schema)) continue
    const lower = name.toLowerCase()
    if (isCoreName(name) || codeTableNames.has(lower)) {
      keep(block, codeTableNames.has(lower) ? 'code-view' : 'core-prefix')
    }
  }
  if (block.type === 'FUNCTION') {
    if (!['public', 'app_private'].includes(block.schema)) continue
    const base = quoteStripped(block.name).split('(')[0]
    if (CODE_SEED_FUNCTIONS.has(base)) {
      keep(block, 'code-seed-function')
      continue
    }
    if (codeRpcNames.has(base.toLowerCase())) {
      keep(block, 'code-rpc')
      seededRpcNames.add(base)
    }
  }
  if (block.type === 'EXTENSION' && KEEP_EXTENSIONS) keep(block, 'extension')
  if (block.type === 'SCHEMA') {
    const name = quoteStripped(block.name)
    if (!DROP_SCHEMAS.includes(name)) keep(block, 'schema')
  }
}

// 种子 2：被保留表引用的外键目标表
let changed = true
let pass = 0
const relationConsumers = new Map<string, string[]>()

while (changed && pass < 40) {
  changed = false
  pass += 1
  for (const block of blocks) {
    if (keptBlocks.has(block)) continue
    const key = `${block.schema}.${quoteStripped(block.name)}`

    const belongsToKeptRelation = (relationKey: string): boolean => {
      const owner = tableByName.get(relationKey) ?? viewByName.get(relationKey)
      return Boolean(owner && keptBlocks.has(owner))
    }

    const includeRelation = (relationKey: string, why: string): boolean => {
      const [schema, name] = relationKey.split('.')
      const target = tableByName.get(relationKey) ?? viewByName.get(relationKey)
      if (!target) {
        if (!MANAGED_SCHEMAS.includes(schema)) recordUnresolved(relationKey, why)
        return false
      }
      if (isDroppableRelation(schema, name) && !keptBlocks.has(target)) {
        recordUnresolved(relationKey, why)
        return false
      }
      return keep(target, why)
    }

    switch (block.type) {
      case 'ROW SECURITY':
      case 'POLICY':
      case 'TRIGGER':
      case 'RULE':
      case 'INDEX':
      case 'CONSTRAINT':
      case 'CHECK CONSTRAINT':
      case 'COMMENT':
      case 'DEFAULT ACL':
      case 'PUBLICATION TABLE': {
        const ownerKey = relationNameFromSql(block.sql)
        if (block.type === 'TRIGGER' && key.startsWith('public.')) {
          // TRIGGER 的 name 形如 "table trigger_name"
          const [tablePart] = tableBlockName(block).split(' ')
          const triggerKey = `${block.schema}.${tablePart}`
          if (belongsToKeptRelation(triggerKey))
            changed = keep(block, `trigger-of:${triggerKey}`) || changed
        } else if (
          block.type === 'COMMENT' ||
          block.type === 'INDEX' ||
          block.type === 'POLICY' ||
          block.type === 'ROW SECURITY'
        ) {
          if (ownerKey && belongsToKeptRelation(ownerKey))
            changed = keep(block, `owned-by:${ownerKey}`) || changed
        } else if (block.type === 'PUBLICATION TABLE') {
          if (belongsToKeptRelation(key)) changed = keep(block, `realtime:${key}`) || changed
        } else if (block.type === 'CONSTRAINT' || block.type === 'CHECK CONSTRAINT') {
          const [tablePart] = tableBlockName(block).split(' ')
          const owner = `${block.schema}.${tablePart}`
          if (belongsToKeptRelation(owner))
            changed = keep(block, `constraint-of:${owner}`) || changed
        } else if (block.type === 'RULE') {
          // `_RETURN` 规则是视图定义的重复（VIEW block 已含完整定义），其余规则按所属关系保留
          const ruleName = quoteStripped(block.name)
          if (ruleName.endsWith('_RETURN')) break
          if (belongsToKeptRelation(key)) changed = keep(block, `rule-of:${key}`) || changed
        } else if (block.type === 'DEFAULT ACL') {
          changed = keep(block, 'default-acl') || changed
        }
        break
      }
      case 'FK CONSTRAINT': {
        const [tablePart] = tableBlockName(block).split(' ')
        const owner = `${block.schema}.${tablePart}`
        if (!belongsToKeptRelation(owner)) break
        changed = keep(block, `fk-of:${owner}`) || changed
        for (const referenced of extractReferences(block.sql).relations) {
          changed = includeRelation(referenced, `fk-target-of:${owner}`) || changed
        }
        break
      }
      case 'FUNCTION': {
        // 只保留被显式需要的函数（种子 RPC、触发器函数、策略依赖），由后续规则加入。
        //
        // 例外：PostgREST 计算关联——参数是某张表的行类型、前端用 `alias:函数名(...)`
        // 嵌入查询调用（如 dict_type_cascade_parent(sys_dict_type)），不经 .rpc()，
        // 也不出现在策略/触发器里，必须随该表一起保留，否则嵌入查询会 400。
        const computedRelationship = /^[a-z0-9_]+\("(public|app_private)"\."([a-z0-9_]+)"\)$/i.exec(
          block.name.trim()
        )
        if (
          computedRelationship &&
          belongsToKeptRelation(`${computedRelationship[1]}.${computedRelationship[2]}`)
        ) {
          changed =
            keep(
              block,
              `computed-relationship-of:${computedRelationship[1]}.${computedRelationship[2]}`
            ) || changed
        }
        break
      }
      case 'ACL': {
        // ACL block 的 name 形如 `FUNCTION "f"(...)` / `TABLE "t"` / `SCHEMA "public"`
        const plainName = quoteStripped(
          quoteStripped(block.name).replace(/^(FUNCTION|TABLE|SEQUENCE|VIEW|SCHEMA)\s+/i, '')
        )
        const baseName = plainName.split('(')[0]
        const objectKey = `${block.schema}.${baseName}`
        const owner = tableByName.get(objectKey) ?? viewByName.get(objectKey)
        if (owner && keptBlocks.has(owner)) changed = keep(block, `acl-of:${objectKey}`) || changed
        const functionOwners = functionByKey.get(objectKey) ?? []
        if (functionOwners.some((candidate) => keptBlocks.has(candidate))) {
          changed = keep(block, `acl-of:${objectKey}`) || changed
        }
        if (block.schema === '-') changed = keep(block, 'acl-schema') || changed
        break
      }
      case 'SEQUENCE': {
        // 身份列序列：SEQUENCE block 里带 ALTER TABLE <owner> ADD GENERATED ...
        const ownerKey = relationNameFromSql(block.sql)
        if (ownerKey && belongsToKeptRelation(ownerKey))
          changed = keep(block, `sequence-of:${ownerKey}`) || changed
        break
      }
      default:
        break
    }
  }

  // 函数闭包：被保留对象引用的函数要一起保留，并继续它们的依赖。
  //
  // 关系引用分两类：
  //  - 建表期就必须存在（策略 / 视图 / 外键 / 索引 / 序列 / 触发器）→ 一并保留；
  //  - 只出现在函数体里（check_function_bodies = false，运行时才解析）→ 记为
  //    runtimeOptional，不强制保留，避免平台通用 RPC 把整套业务表拉进基线。
  for (const block of [...keptBlocks]) {
    const consumers = relationConsumers.get(`${block.schema}.${block.name}`) ?? []
    const { functions, relations } = extractReferences(block.sql)
    for (const functionKey of functions) {
      const candidates = functionByKey.get(functionKey)
      if (!candidates) {
        const [schema] = functionKey.split('.')
        if (['public', 'app_private'].includes(schema)) {
          recordUnresolved(functionKey, `called-by:${block.schema}.${block.name}`)
        }
        continue
      }
      for (const candidate of candidates) {
        if (keep(candidate, `called-by:${block.schema}.${block.name}`)) changed = true
        consumers.push(`${block.schema}.${block.name}`)
      }
    }
    for (const relationKey of relations) {
      const target = tableByName.get(relationKey) ?? viewByName.get(relationKey)
      if (!target || keptBlocks.has(target)) continue
      const [schema, name] = relationKey.split('.')
      if (isDroppableRelation(schema, name)) {
        recordUnresolved(relationKey, `referenced-by:${block.schema}.${block.name}`)
        continue
      }
      if (block.type === 'FUNCTION' && !isCoreName(name)) {
        const set = runtimeOptionalRelations.get(relationKey) ?? new Set<string>()
        set.add(`${block.schema}.${block.name}`)
        runtimeOptionalRelations.set(relationKey, set)
        continue
      }
      changed = keep(target, `referenced-by:${block.schema}.${block.name}`) || changed
    }
    relationConsumers.set(`${block.schema}.${block.name}`, consumers)
  }
}

// ---------------------------------------------------------------------------
// 收尾裁剪：签名（参数/返回类型）依赖已丢弃对象的函数无法创建，必须整块移除；
// 只出现在函数体里的依赖可以保留（check_function_bodies = false，运行时才解析）。
// ---------------------------------------------------------------------------

const prunedFunctions: Record<string, string> = {}
const signatureObjectPattern = /\bAS\s+\$/i

function signatureDependsOnDropped(block: Block): string | null {
  const [signature] = block.sql.split(signatureObjectPattern)
  const refs = extractReferences(signature ?? block.sql)
  for (const key of [...refs.relations, ...refs.functions]) {
    const [schema, name] = key.split('.')
    if (!['public', 'app_private'].includes(schema)) continue
    if (isDroppableRelation(schema, name)) return key
    // 签名里的类型/函数必须已经保留，否则函数根本创建不出来
    const relation = tableByName.get(key) ?? viewByName.get(key)
    if (relation) {
      if (!keptBlocks.has(relation)) return key
      continue
    }
    const candidates = functionByKey.get(key)
    if (!candidates || !candidates.some((candidate) => keptBlocks.has(candidate))) return key
  }
  return null
}

let pruned = true
while (pruned) {
  pruned = false
  for (const block of [...keptBlocks]) {
    if (block.type !== 'FUNCTION') continue
    const missing = signatureDependsOnDropped(block)
    if (!missing) continue
    keptBlocks.delete(block)
    prunedFunctions[`${block.schema}.${quoteStripped(block.name)}`] =
      `签名依赖已丢弃对象：${missing}`
    pruned = true
  }
  // 被剪函数的 ACL / COMMENT 一并移除，避免残留悬空授权
  for (const block of [...keptBlocks]) {
    if (block.type !== 'ACL' && block.type !== 'COMMENT') continue
    if (!block.name.includes('FUNCTION')) continue
    const plainName = quoteStripped(
      quoteStripped(block.name)
        .replace(/^(FUNCTION|TABLE|SEQUENCE|VIEW|SCHEMA)\s+/i, '')
        .replace(/^(TABLE|COLUMN|VIEW)\s+/i, '')
    )
    const baseName = plainName.split('(')[0]
    const key = `${block.schema}.${baseName}`
    if (keptBlocks.has(block) && !(functionByKey.get(key) ?? []).some((fn) => keptBlocks.has(fn))) {
      keptBlocks.delete(block)
    }
  }
}

// ---------------------------------------------------------------------------
// 收尾裁剪 1：业务模块的租户初始化触发器不能进基线。
//
// 例如 trg_seed_tms_basic_number_rules 会在新建租户时写入 tms.* 编号规则，
// 而基线里没有这些业务表；保留它会让「新建租户」直接失败。
// 判据：触发器函数体引用了已丢弃的关系 → 连同触发器一起移除（函数若无其他触发器使用也移除）。
// ---------------------------------------------------------------------------

const triggerFunctionKey = (block: Block): string | null => {
  // 早期触发器可能写成 EXECUTE PROCEDURE，两种写法都要识别
  const match =
    /EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+"([a-z_][a-z0-9_]*)"\."([a-z_][a-z0-9_]*)"/i.exec(block.sql)
  return match ? `${match[1].toLowerCase()}.${match[2].toLowerCase()}` : null
}

const bodyReferencesDropped = (block: Block): string | null => {
  const [body] = block.sql.split(signatureObjectPattern).slice(1)
  if (!body) return null
  const { relations } = extractReferences(body)
  for (const key of relations) {
    const [schema, name] = key.split('.')
    if (!['public', 'app_private'].includes(schema)) continue
    const target = tableByName.get(key) ?? viewByName.get(key)
    if (target && !keptBlocks.has(target)) return key
    if (!target && isDroppableRelation(schema, name)) return key
  }
  return null
}

const prunedTriggers: Record<string, string> = {}
const prunedBusinessFunctions: Record<string, string> = {}

const isTriggerFunction = (block: Block): boolean =>
  block.type === 'FUNCTION' && /RETURNS\s+"trigger"/i.test(block.sql)

/** 源库里全部编号场景键：租户初始化写编号规则时必须都能对上。 */
const sceneKeySet = new Set<string>()
{
  const sceneCopy = copyBlocks.find((block) => block.table === 'sys_document_number_scene')
  if (sceneCopy) {
    const keyIndex = sceneCopy.columns.indexOf('rule_key')
    for (const row of sceneCopy.rows) sceneKeySet.add(row[keyIndex])
  }
}

const NUMBER_RULE_INSERT_PATTERN = /insert\s+into\s+public\.sys_document_number_rule/i
const SCENE_KEY_PATTERN = /'([a-z][a-z0-9_]*\.[a-z0-9_]+)'/g

/** 函数自身或其调用链上会写编号规则的判断。 */
function functionWritesNumberRules(functionKey: string, seen = new Set<string>()): boolean {
  if (seen.has(functionKey)) return false
  seen.add(functionKey)
  for (const candidate of functionByKey.get(functionKey) ?? []) {
    if (NUMBER_RULE_INSERT_PATTERN.test(candidate.sql)) return true
    const { functions } = extractReferences(candidate.sql)
    for (const callee of functions) {
      if (functionWritesNumberRules(callee, seen)) return true
    }
  }
  return false
}

/** 收集函数调用链上会写入的编号规则键。 */ function ruleKeysInsertedBy(
  functionKey: string,
  seen = new Set<string>()
): string[] {
  if (seen.has(functionKey)) return []
  seen.add(functionKey)
  const keys: string[] = []
  for (const candidate of functionByKey.get(functionKey) ?? []) {
    if (NUMBER_RULE_INSERT_PATTERN.test(candidate.sql)) {
      for (const match of candidate.sql.matchAll(SCENE_KEY_PATTERN)) keys.push(match[1])
    }
    const { functions } = extractReferences(candidate.sql)
    for (const callee of functions) keys.push(...ruleKeysInsertedBy(callee, seen))
  }
  return keys
}

/**
 * 调用链完整性：触发器会在写入时立刻执行，链上任何一个 public/app_private 函数
 * 在快照里不存在（或已被裁剪），触发器就一定会报错。
 */
function missingCalleeInChain(functionKey: string, seen = new Set<string>()): string | null {
  if (seen.has(functionKey)) return null
  seen.add(functionKey)
  const definitions = functionByKey.get(functionKey)
  if (!definitions || !definitions.some((candidate) => keptBlocks.has(candidate)))
    return functionKey
  for (const definition of definitions) {
    const { functions } = extractReferences(definition.sql)
    for (const callee of functions) {
      const [schema] = callee.split('.')
      if (!['public', 'app_private'].includes(schema)) continue
      const missing = missingCalleeInChain(callee, seen)
      if (missing) return missing
    }
  }
  return null
}

/** 调用链上任一函数引用了已丢弃的关系。 */
function droppedRelationInChain(functionKey: string, seen = new Set<string>()): string | null {
  if (seen.has(functionKey)) return null
  seen.add(functionKey)
  for (const definition of functionByKey.get(functionKey) ?? []) {
    if (!keptBlocks.has(definition)) continue
    const direct = bodyReferencesDropped(definition)
    if (direct) return direct
    const { functions } = extractReferences(definition.sql)
    for (const callee of functions) {
      const [schema] = callee.split('.')
      if (!['public', 'app_private'].includes(schema)) continue
      const offender = droppedRelationInChain(callee, seen)
      if (offender) return offender
    }
  }
  return null
}

// 触发器与触发器函数必须一起收敛：被移除的触发器函数不能再被别的触发器引用，
// 引用了已丢弃对象的触发器也要连同其专属函数一起退出基线。
let triggerFixpoint = true
let triggerPass = 0
while (triggerFixpoint && triggerPass < 20) {
  triggerFixpoint = false
  triggerPass += 1

  // 触发器函数缺失，或调用链上引用了已丢弃的关系 → 触发器必须退出基线
  for (const block of [...keptBlocks]) {
    if (block.type !== 'TRIGGER') continue
    const functionKey = triggerFunctionKey(block)
    if (!functionKey) continue
    const keptCandidates = (functionByKey.get(functionKey) ?? []).filter((candidate) =>
      keptBlocks.has(candidate)
    )
    if (keptCandidates.length === 0) {
      keptBlocks.delete(block)
      prunedTriggers[`${block.schema}.${quoteStripped(block.name)}`] =
        `触发器函数不在基线内：${functionKey}`
      triggerFixpoint = true
      continue
    }
    const offender = droppedRelationInChain(functionKey)
    if (!offender) continue
    keptBlocks.delete(block)
    prunedTriggers[`${block.schema}.${quoteStripped(block.name)}`] =
      `触发器逻辑依赖已丢弃对象：${offender}`
    triggerFixpoint = true
  }

  // 租户编号规则初始化触发器：它插入的规则键必须都有对应场景，否则新建租户一定会失败
  // （源库里也存在同样的缺口时，这里会把它挡在基线之外并写进报告）。
  for (const block of [...keptBlocks]) {
    if (block.type !== 'TRIGGER') continue
    if (quoteStripped(block.name).split(' ')[0] !== 'sys_tenant') continue
    const functionKey = triggerFunctionKey(block)
    if (!functionKey) continue
    if (!functionWritesNumberRules(functionKey)) continue
    const keys = ruleKeysInsertedBy(functionKey)
    const missingKey = keys.find((key) => !sceneKeySet.has(key))
    if (!missingKey) continue
    keptBlocks.delete(block)
    prunedTriggers[`${block.schema}.${quoteStripped(block.name)}`] =
      `编号规则键缺少对应场景（${missingKey}），在源库同样会失败`
    triggerFixpoint = true
  }

  // 调用链完整性：链上有函数在快照里缺失时，触发器一旦触发就会报错
  for (const block of [...keptBlocks]) {
    if (block.type !== 'TRIGGER') continue
    const functionKey = triggerFunctionKey(block)
    if (!functionKey) continue
    const missing = missingCalleeInChain(functionKey)
    if (!missing) continue
    keptBlocks.delete(block)
    prunedTriggers[`${block.schema}.${quoteStripped(block.name)}`] =
      `调用链上的函数缺失（${missing}），在源库同样会失败`
    triggerFixpoint = true
  }

  const referencedFunctions = new Set(
    [...keptBlocks]
      .filter((block) => block.type === 'TRIGGER')
      .map((block) => triggerFunctionKey(block))
      .filter((key): key is string => Boolean(key))
  )
  for (const block of [...keptBlocks]) {
    if (!isTriggerFunction(block)) continue
    const key = `${block.schema}.${quoteStripped(block.name).split('(')[0]}`
    if (referencedFunctions.has(key)) continue
    keptBlocks.delete(block)
    prunedBusinessFunctions[`${block.schema}.${quoteStripped(block.name)}`] =
      '触发器函数已无触发器引用（业务初始化逻辑随业务域移除）'
    triggerFixpoint = true
  }
}

// ---------------------------------------------------------------------------
// 收尾裁剪 2：ACL / COMMENT 必须指向仍然保留的对象。
// 触发器、函数、表在上面的裁剪中被移除后，它们的授权与注释块不能再留在文件里，
// 否则 REVOKE/COMMENT 会因为对象不存在而失败。
// ---------------------------------------------------------------------------

const objectNameFromBlockName = (block: Block): string => {
  const withoutType = quoteStripped(block.name).replace(
    /^(FUNCTION|TABLE|SEQUENCE|VIEW|SCHEMA|COLUMN|CONSTRAINT|TRIGGER|POLICY|INDEX)\s+/i,
    ''
  )
  const beforeArgs = withoutType.split('(')[0]
  const firstQuoted = beforeArgs.split('"').filter(Boolean)[0]
  if (firstQuoted) return firstQuoted
  return beforeArgs.split('.')[0].trim()
}

const objectIsKept = (schema: string, name: string): boolean => {
  const key = `${schema}.${name}`
  const relation = tableByName.get(key) ?? viewByName.get(key)
  if (relation) return keptBlocks.has(relation)
  const functions = functionByKey.get(key)
  if (functions?.some((candidate) => keptBlocks.has(candidate))) return true
  const sequence = blocks.find(
    (candidate) =>
      candidate.type === 'SEQUENCE' &&
      `${candidate.schema}.${quoteStripped(candidate.name)}` === key
  )
  if (sequence && keptBlocks.has(sequence)) return true
  if (schema === '-' || name.toLowerCase() === 'schema') return true
  return false
}

const prunedAclBlocks: string[] = []
for (const block of [...keptBlocks]) {
  if (block.type !== 'ACL' && block.type !== 'COMMENT') continue
  const name = objectNameFromBlockName(block)
  if (objectIsKept(block.schema, name)) continue
  keptBlocks.delete(block)
  prunedAclBlocks.push(`${block.type} ${block.schema}.${name}`)
}

// ===========================================================================
// 报告
// ===========================================================================

const byType = new Map<string, number>()
for (const block of keptBlocks) byType.set(block.type, (byType.get(block.type) ?? 0) + 1)

const keptTables = [...keptBlocks]
  .filter((block) => block.type === 'TABLE')
  .map((block) => `${block.schema}.${quoteStripped(block.name)}`)
  .sort()
const keptViews = [...keptBlocks]
  .filter((block) => block.type === 'VIEW')
  .map((block) => `${block.schema}.${quoteStripped(block.name)}`)
  .sort()
const droppedTables = blocks
  .filter((block) => block.type === 'TABLE')
  .map((block) => `${block.schema}.${quoteStripped(block.name)}`)
  .filter((key) => !keptTables.includes(key))
  .sort()

const droppedByDomain = new Map<string, number>()
for (const key of droppedTables) {
  const name = key.split('.')[1]
  const prefix = name.split('_')[0]
  droppedByDomain.set(prefix, (droppedByDomain.get(prefix) ?? 0) + 1)
}

const report = {
  backup: backupRoot,
  passes: pass,
  codeDependencyCounts: {
    tables: codeTableNames.size,
    rpcs: codeRpcNames.size
  },
  codeTablesMissingFromDump: missingCodeTables.sort(),
  codeRpcsMissingFromDump: [...codeRpcNames]
    .filter(
      (name) =>
        ![...functionByKey.keys()].some((key) => key.endsWith(`.${name}`)) &&
        !seededRpcNames.has(name)
    )
    .sort(),
  keptBlockCounts: Object.fromEntries([...byType.entries()].sort((a, b) => b[1] - a[1])),
  keptTables,
  keptViews,
  droppedTableCount: droppedTables.length,
  droppedTablePrefixes: Object.fromEntries(
    [...droppedByDomain.entries()].sort((a, b) => b[1] - a[1])
  ),
  keptFunctions: [...keptBlocks]
    .filter((block) => block.type === 'FUNCTION')
    .map((block) => `${block.schema}.${quoteStripped(block.name)}`)
    .sort(),
  prunedFunctions,
  prunedTriggers,
  prunedAclBlocks,
  prunedBusinessFunctions,
  // 函数上的 PUBLIC 执行权限是 PostgreSQL 内建默认，无法通过 ALTER DEFAULT PRIVILEGES 收回：
  // 只有带 ACL 块（含 REVOKE … FROM PUBLIC）的函数才会被收回。这里给出预期数量，
  // 供 verify-baseline.ps1 断言目标库的 public_function_grants 一致。
  expectedPublicExecutableFunctions: (() => {
    // pg_dump 里 FUNCTION 块的 name 只有参数类型（"text", "uuid"），
    // ACL 块的 name 带参数名（"p_x" "text"）——统一归一化成「函数名 + 类型列表」再比对。
    const normalizeSignature = (name: string): string => {
      const withoutPrefix = name.replace(/^FUNCTION\s+/i, '')
      const openIndex = withoutPrefix.indexOf('(')
      const base = (openIndex >= 0 ? withoutPrefix.slice(0, openIndex) : withoutPrefix)
        .replace(/"/g, '')
        .trim()
      const argsText =
        openIndex >= 0 ? withoutPrefix.slice(openIndex + 1).replace(/\)\s*$/, '') : ''
      const types = argsText
        .split(',')
        .map((argument) => argument.trim())
        .filter(Boolean)
        .map((argument) => {
          const tokens = argument.replace(/"/g, '').split(/\s+/).filter(Boolean)
          return tokens[tokens.length - 1]
        })
      return `${base}(${types.join(',')})`
    }
    const aclBySignature = new Map(
      [...keptBlocks]
        .filter((block) => block.type === 'ACL' && /^FUNCTION\b/i.test(block.name))
        .map((block) => [`${block.schema}.${normalizeSignature(block.name)}`, block.sql])
    )
    return [...keptBlocks]
      .filter((block) => block.type === 'FUNCTION')
      .filter((block) => {
        const aclSql = aclBySignature.get(`${block.schema}.${normalizeSignature(block.name)}`)
        return !aclSql || !/REVOKE ALL ON [A-Z ]*FUNCTION[\s\S]*?FROM PUBLIC/i.test(aclSql)
      }).length
  })(),
  keptTableReasons: Object.fromEntries(
    keptTables.map((key) => [key, keepReasons.get(`TABLE ${key}`) ?? ''])
  ),
  runtimeOptionalRelations: Object.fromEntries(
    [...runtimeOptionalRelations.entries()]
      .sort()
      .map(([key, from]) => [key, [...from].sort().slice(0, 3)])
  ),
  unresolved: Object.fromEntries(
    [...unresolved.entries()].sort().map(([key, from]) => [key, [...from].sort().slice(0, 5)])
  )
}

if (reportOnly) {
  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}

// ===========================================================================
// 生成 SQL
// ===========================================================================

/** COPY 文本格式的反向转义。 */
function unescapeCopyValue(value: string): string | null {
  if (value === '\\N') return null
  return value
    .replace(/\\r/g, '\r')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\v/g, '\v')
    .replace(/\\\\/g, '\\')
}

function sqlLiteral(value: string | null): string {
  if (value === null) return 'NULL'
  return `'${value.replace(/'/g, "''")}'`
}

/** 审计列里出现的账号邮箱属于个人信息，导出前统一替换为中性标记。 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const AUDIT_COLUMNS = new Set([
  'create_by',
  'update_by',
  'created_by',
  'updated_by',
  'published_by'
])
/** 引用了未导出用户的负责人字段，导出时置空。 */
const PERSON_REFERENCE_COLUMNS = new Set(['leader_user_id', 'leaderUserId'])

function scrubSeedValue(column: string, value: string | null): string | null {
  if (value === null) return null
  if (EMAIL_PATTERN.test(value.trim())) return 'baseline'
  if (AUDIT_COLUMNS.has(column) && value === 'system-reminder') return 'baseline'
  if (PERSON_REFERENCE_COLUMNS.has(column)) return null
  return value
}

const PREAMBLE = `-- ===========================================================================
-- 平台基线 schema（由 scripts/build-platform-baseline.ts 生成，请勿手工编辑）
--
-- 来源快照：${backupRoot}
-- 生成时间：${new Date().toISOString()}
-- 保留：${profile === 'platform' ? '平台内核（sys_* / wf_* / ai_* / app_private 助手层）+ 保留代码依赖的跨域契约对象' : '该模块的领域表/视图/函数/策略 + 其依赖的主数据表'}
-- 丢弃：业务域表、视图、策略、函数与历史备份表
--
-- 应用方式：在全新的空 Supabase 项目上执行本文件，再执行 platform-seed.sql。
-- 详细说明见同目录 README.md。
-- ===========================================================================

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;
SET row_security = off;

-- 先建好 app_private，随后的默认权限加固要作用在它上面
CREATE SCHEMA IF NOT EXISTS "app_private";

-- 与源库的加固策略一致（harden_public_function_default_execution）：
-- Supabase 的托管默认权限会把新建函数开放给 anon，这里在创建任何对象之前收回，
-- 之后由各对象的 ACL 精确授予应有权访问的角色（app 调用走 authenticated）。
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app_private
  REVOKE EXECUTE ON FUNCTIONS FROM anon, PUBLIC;

-- 身份列序列只在数据库内部使用，源库里它们不对业务角色开放
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role, PUBLIC;
`

/**
 * 让交付物可以叠加执行：平台基线已经建过的索引/约束、策略等在模块 SQL 里要能安全重放。
 *   - INDEX：加 IF NOT EXISTS
 *   - POLICY：先 DROP IF EXISTS 再建
 *   - CONSTRAINT / FK CONSTRAINT / CHECK CONSTRAINT：按约束名判断后再 ADD
 * 其余对象本身已经幂等（IF NOT EXISTS / OR REPLACE / REVOKE+GRANT）。
 */
const EMAIL_LITERAL_RE = /'([A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)'/g

/** 交付物里不保留真实个人邮箱：函数体、注释、默认值里的邮箱字面量统一换成占位地址。 */
function redactEmails(sql: string): string {
  return sql.replace(EMAIL_LITERAL_RE, "'platform-owner@example.com'")
}

function toIdempotentSql(block: Block): string {
  const sql = redactEmails(block.sql)
  if (block.type === 'INDEX') {
    return sql.replace(/^CREATE (UNIQUE )?INDEX /m, 'CREATE $1INDEX IF NOT EXISTS ')
  }
  if (block.type === 'POLICY') {
    // pg_dump 的块名是「表名 策略名」，真实策略名要从 CREATE POLICY 语句里取
    const target = /\bON\s+"([a-z_][a-z0-9_]*)"\."([a-z_][a-z0-9_]*)"/i.exec(sql)
    const policyName = /CREATE\s+POLICY\s+"([^"]+)"/i.exec(sql)?.[1]
    if (!target || !policyName) return sql
    return `DROP POLICY IF EXISTS "${policyName}" ON "${target[1]}"."${target[2]}";\n${sql}`
  }
  if (['CONSTRAINT', 'FK CONSTRAINT', 'CHECK CONSTRAINT'].includes(block.type)) {
    const [tablePart, ...rest] = quoteStripped(block.name).split(' ')
    const constraintName = rest.join(' ').trim()
    if (!tablePart || !constraintName) return sql
    const statement = sql
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      .replace(/;?\s*$/, '')
    return [
      'DO $already_exists$',
      'BEGIN',
      '  IF NOT EXISTS (',
      '    SELECT 1 FROM pg_constraint c',
      `     WHERE c.conname = '${constraintName.replace(/'/g, "''")}'`,
      `       AND c.conrelid = '${block.schema}.${tablePart}'::regclass`,
      '  ) THEN',
      statement,
      '  END IF;',
      'END',
      '$already_exists$;'
    ].join('\n')
  }
  if (block.type === 'SEQUENCE') {
    // 身份列：pg_dump 会单独发 ALTER TABLE ... ADD GENERATED，重复执行会撞已存在的序列
    const identity =
      /ALTER TABLE\s+"([a-z_][a-z0-9_]*)"\."([a-z_][a-z0-9_]*)"\s+ALTER COLUMN\s+"([a-z_][a-z0-9_]*)"/i.exec(
        sql
      )
    if (!identity) return sql
    const statement = sql
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      .replace(/;?\s*$/, '')
    return [
      'DO $identity_column$',
      'BEGIN',
      '  IF NOT EXISTS (',
      '    SELECT 1 FROM pg_attribute a',
      `     WHERE a.attrelid = '${identity[1]}.${identity[2]}'::regclass`,
      `       AND a.attname = '${identity[3]}'`,
      "       AND a.attidentity <> ''",
      '  ) THEN',
      statement,
      '  END IF;',
      'END',
      '$identity_column$;'
    ].join('\n')
  }
  return sql
}

const baselineSql = [
  PREAMBLE,
  ...[...keptBlocks]
    .sort((a, b) => a.index - b.index)
    .map(
      (block) =>
        `--\n-- Name: ${block.name}; Type: ${block.type}; Schema: ${block.schema}\n--\n\n${toIdempotentSql(block)}\n`
    )
].join('\n')

// ---------------------------------------------------------------------------
// 种子数据：只取平台自己的行；业务行、历史行与个人信息一律不导出
// ---------------------------------------------------------------------------

/** 平台命名的字典类型（含目录），其余视为业务字典。 */
const PLATFORM_DICT_CODE_PATTERN =
  /^(ai|common|sys|workflow|menu|status|sex|userType|organization|notification|documentNumber|i18n|systemParam|enterpriseNature|supplier|FILE_EXTENSION_LABEL_MAP)/

/** 保留的 AI 功能配置（对应模板保留的 AI Edge Function），其余是业务功能。 */
const PLATFORM_AI_FEATURES = new Set([
  'project_assistant',
  'project_planner',
  'operations_diagnosis',
  'sql_assistant',
  'run_diagnosis',
  'website_wordmark',
  'feedback_resolution'
])

const KEPT_TENANT_CODES = ['platform', 'public_register']

interface SeedTablePlan {
  table: string
  where?: (row: string[], columns: string[], context: SeedContext) => boolean
  /** 导出前的行级改写（按 COPY 原文，未做反转义） */
  transform?: (row: string[], columns: string[]) => string[]
  note?: string
}

interface SeedContext {
  keptTenantIds: Set<string>
  keptRoleIds: Set<string>
  keptMenuIds: Set<string>
  keptDictTypeIds: Set<string>
}

const copyByTable = new Map(copyBlocks.map((block) => [block.table, block]))
const seedNotes: string[] = []

function columnIndex(columns: string[], name: string): number {
  return columns.indexOf(name)
}

function rowsOf(table: string): CopyBlock | undefined {
  return copyByTable.get(table)
}

// ---- 计算过滤器依赖的集合 ----

const tenantBlock = rowsOf('sys_tenant')
const keptTenantIds = new Set<string>()
if (tenantBlock) {
  const builtin = columnIndex(tenantBlock.columns, 'builtin_type')
  const idIndex = columnIndex(tenantBlock.columns, 'id')
  for (const row of tenantBlock.rows) {
    if (KEPT_TENANT_CODES.includes(row[builtin])) keptTenantIds.add(row[idIndex])
  }
}

// 菜单：只保留目标应用（platform / hr）下、且页面文件仍然存在的行（含其按钮与文件夹祖先）
const targetAppCode = profile === 'platform' ? 'platform' : 'hr'

/**
 * 已并入主平台的主数据（MDM）菜单根节点。
 *
 * 物料 / 工程 / 销售 / 生产四块主数据的页面位于 `src/views/mdm/**`，但旧库里这些菜单行的
 * app_code 仍是 mdm。这里按 id 把这四个分组子树视为平台菜单：既参与页面文件存在性判断，
 * 也在导出时把 app_code 改写为 platform，避免平台出现一个没有独立前端的 mdm 应用。
 * 这些 id 与 `supabase/baseline/mdm-master-data-menu.sql` 保持一致。
 */
const MDM_PLATFORM_MENU_ROOT_IDS =
  profile === 'platform'
    ? [
        'd0000000-0000-4000-8000-000000000001', // 主数据（/mdm）
        'db24361c-6182-4cc5-aa83-b64c59fb9b27', // 物料主数据
        '5f544180-7372-4f27-aaa2-f3af6231cbcf', // 工程主数据
        '2a0ed948-6308-4bf8-87f6-d768c6fc0cf8', // 销售主数据
        '5ec8dbc4-c6ea-4fcc-acc0-d30cf11a0f0b' // 生产主数据
      ]
    : []
const platformMdmMenuIds = new Set<string>()

const menuBlock = rowsOf('sys_menu')
const keptMenuIds = new Set<string>()
const droppedMenuRows: string[] = []
if (menuBlock) {
  const appCode = columnIndex(menuBlock.columns, 'app_code')
  const component = columnIndex(menuBlock.columns, 'component')
  const idIndex = columnIndex(menuBlock.columns, 'id')
  const parentIndex = columnIndex(menuBlock.columns, 'parent_id')
  const typeIndex = columnIndex(menuBlock.columns, 'type')
  const nameIndex = columnIndex(menuBlock.columns, 'name')
  const rowsById = new Map(menuBlock.rows.map((row) => [row[idIndex], row]))

  // 主数据四组子树：根节点 + 全部后代
  const collectMdmSubtree = (id: string): void => {
    const row = rowsById.get(id)
    if (!row || platformMdmMenuIds.has(id)) return
    platformMdmMenuIds.add(id)
    for (const candidate of menuBlock.rows) {
      if (candidate[parentIndex] === id) collectMdmSubtree(candidate[idIndex])
    }
  }
  MDM_PLATFORM_MENU_ROOT_IDS.forEach(collectMdmSubtree)

  // 平台页面在 src/views，模块页面在各自子仓的 src/views
  const viewRoots =
    profile === 'platform' ? ['src/views'] : [`modules/art-supabase-${profile}/src/views`]
  const componentExists = (value: string): boolean => {
    if (!value) return true
    // 模块菜单的 component 带应用前缀（/hr/personnel/position），
    // 而模块视图文件不含前缀，两种写法都试一遍。
    const candidates = [value.replace(/^\//, '')]
    const withoutAppPrefix = value.replace(new RegExp(`^/?${targetAppCode}/`), '')
    if (withoutAppPrefix !== candidates[0]) candidates.push(withoutAppPrefix)
    return viewRoots.some((root) =>
      candidates.some(
        (candidate) =>
          existsSync(join(root, candidate, 'index.vue')) ||
          existsSync(join(root, `${candidate}.vue`))
      )
    )
  }
  const isPlatformRow = (row: string[]): boolean =>
    row[appCode] === targetAppCode || platformMdmMenuIds.has(row[idIndex])
  const parentOf = (row: string[]): string | null => {
    const parent = row[parentIndex]
    return parent && parent !== '\\N' && rowsById.has(parent) ? parent : null
  }

  // 1) 页面菜单：组件文件确实存在
  for (const row of menuBlock.rows) {
    if (!isPlatformRow(row) || row[typeIndex] === 'button') continue
    if (componentExists(row[component])) keptMenuIds.add(row[idIndex])
  }

  // 2) 收敛补全：按钮跟随其父菜单，文件夹跟随其子节点
  let grew = true
  while (grew) {
    grew = false
    for (const row of menuBlock.rows) {
      if (keptMenuIds.has(row[idIndex]) || !isPlatformRow(row)) continue
      const parent = parentOf(row)
      if (row[typeIndex] === 'button') {
        // 父菜单必须已经保留（页面不存在时按钮也应一并移除）
        if (parent && keptMenuIds.has(parent)) {
          keptMenuIds.add(row[idIndex])
          grew = true
        }
        continue
      }
      if (row[typeIndex] !== 'folder') continue
      const hasKeptChild = menuBlock.rows.some(
        (candidate) => parentOf(candidate) === row[idIndex] && keptMenuIds.has(candidate[idIndex])
      )
      // 父节点属于别的应用（或被裁掉）时，这个文件夹就是本应用的树根，允许保留
      const parentKeptOrForeign =
        !parent || keptMenuIds.has(parent) || !isPlatformRow(rowsById.get(parent)!)
      if (hasKeptChild && parentKeptOrForeign) {
        keptMenuIds.add(row[idIndex])
        grew = true
      }
    }
  }

  // 3) 报告：收敛之后依然没被保留的平台菜单/文件夹
  for (const row of menuBlock.rows) {
    if (!isPlatformRow(row) || keptMenuIds.has(row[idIndex]) || row[typeIndex] === 'button')
      continue
    droppedMenuRows.push(`${row[nameIndex]} (${row[component] || row[typeIndex]})`)
  }
}

// 角色：保留平台租户内的内置角色，以及平台代码引用的 R_ADMIN / R_USER
const roleBlock = rowsOf('sys_role')
const keptRoleIds = new Set<string>()
const keptRoleCodes = new Set(['R_ADMIN', 'R_USER'])
if (roleBlock) {
  const idIndex = columnIndex(roleBlock.columns, 'id')
  const builtin = columnIndex(roleBlock.columns, 'builtin_type')
  const tenantId = columnIndex(roleBlock.columns, 'tenant_id')
  const roleCode = columnIndex(roleBlock.columns, 'role_code')
  for (const row of roleBlock.rows) {
    const isPlatformRole = keptTenantIds.has(row[tenantId])
    const isBuiltin = Boolean(row[builtin]) && row[builtin] !== '\\N'
    if (isPlatformRole && (isBuiltin || keptRoleCodes.has(row[roleCode])))
      keptRoleIds.add(row[idIndex])
  }
}

// 字典类型：平台命名的类型 + 它们的祖先目录（保持字典树完整）
const dictTypeBlock = rowsOf('sys_dict_type')
const keptDictTypeIds = new Set<string>()
if (dictTypeBlock) {
  const idIndex = columnIndex(dictTypeBlock.columns, 'id')
  const codeIndex = columnIndex(dictTypeBlock.columns, 'code')
  const parentIndex = columnIndex(dictTypeBlock.columns, 'parent_id')
  const byId = new Map(dictTypeBlock.rows.map((row) => [row[idIndex], row]))
  // 代码里出现的标识符（见 scanCodeDependencies）：与快照的字典编码求交，
  // 得到「页面实际引用的字典」。仅按命名前缀判断会把并入平台的业务字典（如 mdm*）裁掉，
  // 导致对应下拉框没有选项。
  const codeIdentifiers = new Set([...codeDependencies.tables].map((name) => name.toLowerCase()))
  for (const row of dictTypeBlock.rows) {
    const dictPattern = profile === 'platform' ? PLATFORM_DICT_CODE_PATTERN : /^hr/
    const code = row[codeIndex] ?? ''
    if (!dictPattern.test(code) && !codeIdentifiers.has(code.toLowerCase())) continue
    keptDictTypeIds.add(row[idIndex])
  }
  let grew = true
  while (grew) {
    grew = false
    for (const id of [...keptDictTypeIds]) {
      const parent = byId.get(id)?.[parentIndex]
      if (parent && parent !== '\\N' && !keptDictTypeIds.has(parent) && byId.has(parent)) {
        keptDictTypeIds.add(parent)
        grew = true
      }
    }
  }
}

// 编号场景：保留「被保留 SQL 引用到的场景」——这些是留存表上的编号触发器、以及租户初始化
// 触发器真正会用到的场景（如 FMS 发票号、承运商编码）。场景的外键指向菜单，
// 因此这些场景指向的业务菜单也要作为引用行一起保留（它们属于各自应用的 app_code，
// 不会出现在平台宿主的菜单树里）。
const sceneBlock = rowsOf('sys_document_number_scene')
const keptSceneKeys = new Set<string>()
const keptSceneMenuIds = new Set<string>()
if (sceneBlock) {
  const sceneMenuIndex = columnIndex(sceneBlock.columns, 'menu_id')
  const sceneKeyIndex = columnIndex(sceneBlock.columns, 'rule_key')
  for (const row of sceneBlock.rows) {
    if (baselineSql.includes(`'${row[sceneKeyIndex]}'`)) {
      keptSceneKeys.add(row[sceneKeyIndex])
      keptSceneMenuIds.add(row[sceneMenuIndex])
    }
  }
}

// 场景引用的菜单 + 它们的祖先（保持菜单树完整）
if (menuBlock && keptSceneMenuIds.size > 0) {
  const idIndex = columnIndex(menuBlock.columns, 'id')
  const parentIndex = columnIndex(menuBlock.columns, 'parent_id')
  const rowsById = new Map(menuBlock.rows.map((row) => [row[idIndex], row]))
  for (const id of [...keptSceneMenuIds]) {
    let current = rowsById.get(id)?.[parentIndex]
    while (current && current !== '\\N' && rowsById.has(current)) {
      keptSceneMenuIds.add(current)
      current = rowsById.get(current)![parentIndex]
    }
  }
  for (const id of keptSceneMenuIds) keptMenuIds.add(id)
}

/**
 * 可授权菜单：只有指向平台页面的菜单才授予角色。
 * 为满足编号场景外键而保留的业务菜单只是引用行，不参与授权，
 * 这样平台宿主的菜单树与应用切换器不会出现没有前端页面的应用。
 */
const grantableMenuIds = new Set<string>()
if (menuBlock) {
  const appCode = columnIndex(menuBlock.columns, 'app_code')
  const typeIndex = columnIndex(menuBlock.columns, 'type')
  const idIndex = columnIndex(menuBlock.columns, 'id')
  const parentIndex = columnIndex(menuBlock.columns, 'parent_id')
  for (const row of menuBlock.rows) {
    if (!keptMenuIds.has(row[idIndex])) continue
    if (row[typeIndex] === 'button') {
      if (grantableMenuIds.has(row[parentIndex])) grantableMenuIds.add(row[idIndex])
      continue
    }
    if (row[appCode] === targetAppCode || platformMdmMenuIds.has(row[idIndex])) {
      grantableMenuIds.add(row[idIndex])
    }
  }
}

/** 为满足外键而保留的菜单所引用的应用行。 */
const referencedApplicationCodes = new Set<string>([targetAppCode])
if (menuBlock) {
  const appCode = columnIndex(menuBlock.columns, 'app_code')
  const idIndex = columnIndex(menuBlock.columns, 'id')
  for (const row of menuBlock.rows) {
    if (!keptMenuIds.has(row[idIndex])) continue
    // 主数据四组的行会改写成 platform，不能再把 mdm 应用一起带进来
    if (platformMdmMenuIds.has(row[idIndex])) continue
    if (row[appCode] && row[appCode] !== '\\N') referencedApplicationCodes.add(row[appCode])
  }
}

const seedContext: SeedContext = {
  keptTenantIds,
  keptRoleIds,
  keptMenuIds,
  keptDictTypeIds
}

/**
 * 主数据四组菜单在导出时的改写：app_code 变为 platform，根目录标题由「MDM主数据」改为「主数据」。
 * 只作用于 `platformMdmMenuIds` 内的行，其他菜单不受影响。
 */
function rewritePlatformMdmMenuRow(row: string[], columns: string[]): string[] {
  const id = row[columnIndex(columns, 'id')]
  if (!platformMdmMenuIds.has(id)) return row

  const next = [...row]
  const appCodeIndex = columnIndex(columns, 'app_code')
  next[appCodeIndex] = 'platform'

  const metaIndex = columnIndex(columns, 'meta')
  if (metaIndex >= 0 && next[metaIndex]?.includes('MDM主数据')) {
    next[metaIndex] = next[metaIndex].replace('MDM主数据', '主数据')
  }

  return next
}

const PLATFORM_SEED_PLANS: SeedTablePlan[] = [
  {
    table: 'sys_tenant',
    where: (row, columns) => KEPT_TENANT_CODES.includes(row[columnIndex(columns, 'builtin_type')]),
    note: '仅内置租户：platform（平台管理租户）与 public-register（自助注册租户）'
  },
  {
    table: 'mdm_organization',
    where: (row, columns, context) =>
      context.keptTenantIds.has(row[columnIndex(columns, 'tenant_id')]),
    note: '内置租户的组织行：基线按源库 ID 写入，角色/用户按原组织归属'
  },
  {
    table: 'sys_role',
    where: (row, columns, context) => context.keptRoleIds.has(row[columnIndex(columns, 'id')]),
    note: '平台租户内置角色与代码引用的 R_ADMIN / R_USER'
  },
  {
    table: 'sys_menu',
    where: (row, columns, context) => context.keptMenuIds.has(row[columnIndex(columns, 'id')]),
    transform: rewritePlatformMdmMenuRow,
    note: 'app_code = platform 且对应页面文件仍存在的菜单、按钮与文件夹（含并入主平台的物料 / 工程 / 销售 / 生产四块主数据）'
  },
  {
    table: 'sys_role_menu',
    where: (row, columns, context) =>
      context.keptRoleIds.has(row[columnIndex(columns, 'role_id')]) &&
      grantableMenuIds.has(row[columnIndex(columns, 'menu_id')]),
    note: '仅保留角色的平台页面/按钮授权；引用型业务菜单不参与授权'
  },
  {
    table: 'sys_dict_type',
    where: (row, columns, context) => context.keptDictTypeIds.has(row[columnIndex(columns, 'id')]),
    note: '平台命名字典类型及其祖先目录'
  },
  {
    table: 'sys_dictionary',
    where: (row, columns, context) =>
      context.keptDictTypeIds.has(row[columnIndex(columns, 'type_id')]),
    note: '仅保留类型被保留的字典项'
  },
  {
    table: 'sys_param',
    where: (row, columns, context) =>
      context.keptTenantIds.has(row[columnIndex(columns, 'tenant_id')]),
    note: '平台参数（含安全策略、注册默认值与站点配置）'
  },
  {
    table: 'sys_application',
    where: (row, columns) => referencedApplicationCodes.has(row[columnIndex(columns, 'app_code')]),
    note: '平台应用 + 引用型菜单所属应用；未授权应用不会出现在应用切换器里'
  },
  {
    table: 'ai_feature_config',
    where: (row, columns, context) =>
      context.keptTenantIds.has(row[columnIndex(columns, 'tenant_id')]) &&
      PLATFORM_AI_FEATURES.has(row[columnIndex(columns, 'feature')]),
    note: '模板保留的 AI 功能配置（provider/model 需按新项目调整）'
  },
  {
    table: 'ai_prompt_template',
    where: (row, columns, context) =>
      context.keptTenantIds.has(row[columnIndex(columns, 'tenant_id')]) &&
      PLATFORM_AI_FEATURES.has(row[columnIndex(columns, 'feature')]),
    note: '平台 AI 功能的内置 Prompt，可在 AI Prompt 页面继续维护'
  },
  {
    table: 'sys_notification_scenario',
    where: (row, columns) => row[columnIndex(columns, 'module_code')] === 'system',
    note: '仅系统模块通知场景；业务场景随业务模块自行注册'
  },
  {
    table: 'sys_document_number_scene',
    where: (row, columns) => keptSceneKeys.has(row[columnIndex(columns, 'rule_key')]),
    note: '指向平台菜单的编号场景；租户初始化触发器会据此为新建租户写入编号规则'
  }
]

/** 模块交付物的数据计划：只搬模块自己的菜单、授权与字典。 */
const MODULE_SEED_PLANS: Record<string, SeedTablePlan[]> = {
  hr: [
    {
      table: 'sys_menu',
      where: (row, columns, context) => context.keptMenuIds.has(row[columnIndex(columns, 'id')]),
      note: 'app_code = hr 且页面文件存在的菜单、按钮与文件夹'
    },
    {
      table: 'sys_role_menu',
      where: (row, columns, context) =>
        context.keptMenuIds.has(row[columnIndex(columns, 'menu_id')]),
      note: '只保留指向 HR 菜单的角色授权（角色本身已在项目里）'
    },
    {
      table: 'sys_dict_type',
      where: (row, columns, context) =>
        context.keptDictTypeIds.has(row[columnIndex(columns, 'id')]),
      note: 'HR 命名字典类型及其祖先目录'
    },
    {
      table: 'sys_dictionary',
      where: (row, columns, context) =>
        context.keptDictTypeIds.has(row[columnIndex(columns, 'type_id')]),
      note: '仅保留类型被保留的字典项'
    }
  ]
}

const seedPlans: SeedTablePlan[] =
  profile === 'platform' ? PLATFORM_SEED_PLANS : MODULE_SEED_PLANS[profile]

const seedStatements: string[] = []
const seedReport: Record<string, { kept: number; total: number }> = {}

/**
 * 种子写入顺序。租户插入会触发一系列初始化触发器（编号规则、通知默认值、
 * 字段权限目录），其中编号规则需要 sys_document_number_scene 先存在，
 * 而场景又通过外键引用租户——这是一个环。处理方式：
 *   1. 先插租户，期间临时关闭「写编号规则」的初始化触发器；
 *   2. 再插编号场景；
 *   3. 重新启用触发器，并为已插入的租户补跑编号规则初始化。
 * 最终状态与源库一致，且新建租户的初始化逻辑保持可用。
 */
const numberRuleTenantTriggers = blocks
  .filter((block) => block.type === 'TRIGGER' && block.schema === 'public' && keptBlocks.has(block))
  .map((block) => {
    const [tableName, triggerName] = quoteStripped(block.name).split(' ')
    const functionKey = triggerFunctionKey(block)
    return tableName === 'sys_tenant' && triggerName && functionKey
      ? { triggerName, functionKey }
      : null
  })
  .filter((entry): entry is { triggerName: string; functionKey: string } => Boolean(entry))
  .filter((entry) => functionWritesNumberRules(entry.functionKey))
  .map((entry) => ({
    ...entry,
    // 补跑要调用真正接收租户 id 的种子函数，而不是触发器函数本身
    seedFunctions: [
      ...new Set(
        (functionByKey.get(entry.functionKey) ?? []).flatMap((definition) =>
          [...extractReferences(definition.sql).functions].filter((callee) => {
            if (callee === entry.functionKey) return false
            if (!['public', 'app_private'].includes(callee.split('.')[0])) return false
            if (!functionWritesNumberRules(callee)) return false
            // 触发器函数没有参数，这里只挑带 uuid 形参的种子函数
            return (functionByKey.get(callee) ?? []).some((candidate) =>
              /"uuid"/i.test(candidate.name)
            )
          })
        )
      )
    ]
  }))

for (const entry of numberRuleTenantTriggers) {
  if (entry.seedFunctions.length === 0) {
    seedNotes.push(
      `${entry.triggerName} 的编号规则写入在触发器函数内部完成，无法单独补跑；新建租户时仍会正常执行`
    )
  }
}

const SEED_ORDER = [
  'sys_application',
  'sys_menu',
  'sys_notification_scenario',
  'sys_tenant',
  'sys_document_number_scene',
  'mdm_organization',
  'sys_role',
  'sys_role_menu',
  'sys_dict_type',
  'sys_dictionary',
  'sys_param',
  'ai_feature_config',
  'ai_prompt_template'
]

/** 保留集合中、负责为新建租户创建根组织的触发器。 */
const rootOrgTenantTriggers = blocks
  .filter((block) => block.type === 'TRIGGER' && block.schema === 'public' && keptBlocks.has(block))
  .filter((block) => {
    const [tableName, triggerName] = quoteStripped(block.name).split(' ')
    return Boolean(tableName === 'sys_tenant' && triggerName)
  })
  .filter((block) => triggerFunctionKey(block) === 'public.trg_create_tenant_root_organization')
  .map((block) => quoteStripped(block.name).split(' ')[1])

const MODULE_SEED_ORDER = ['sys_menu', 'sys_role_menu', 'sys_dict_type', 'sys_dictionary']
const activeSeedOrder = profile === 'platform' ? SEED_ORDER : MODULE_SEED_ORDER

const orderedSeedPlans = [...seedPlans].sort(
  (a, b) => activeSeedOrder.indexOf(a.table) - activeSeedOrder.indexOf(b.table)
)

for (const plan of orderedSeedPlans) {
  const block = rowsOf(plan.table)
  if (!block) {
    seedNotes.push(`快照里没有 ${plan.table}，已跳过`)
    continue
  }
  const rows = plan.where
    ? block.rows.filter((row) => plan.where!(row, block.columns, seedContext))
    : block.rows
  const exportedRows = plan.transform
    ? rows.map((row) => plan.transform!(row, block.columns))
    : rows
  seedReport[plan.table] = { kept: exportedRows.length, total: block.rows.length }
  if (!exportedRows.length) continue
  const columnList = block.columns.map((column) => `"${column}"`).join(', ')
  const values = exportedRows
    .map(
      (row) =>
        `  (${row
          .map((value, index) =>
            sqlLiteral(scrubSeedValue(block.columns[index], unescapeCopyValue(value)))
          )
          .join(', ')})`
    )
    .join(',\n')
  // on conflict do nothing：交付物可能叠加执行（例如模块 SQL 建在平台基线之上），必须可重放
  const statement = `-- ${plan.table}${plan.note ? `：${plan.note}` : ''}\nINSERT INTO "public"."${plan.table}" (${columnList}) VALUES\n${values}\non conflict do nothing;`

  if (plan.table === 'sys_tenant') {
    seedStatements.push(
      [
        '-- 先临时关闭两类租户初始化触发器：',
        '--   ① 根组织触发器——基线直接写入源库的根组织行，保留原有组织 ID；',
        '--   ② 编号规则触发器——它们依赖的编号场景还需要租户行才能插入（见下方「恢复并补跑」）。',
        '-- 关掉后触发器的最终效果由后面的种子数据与补跑语句等价补回。',
        ...rootOrgTenantTriggers.map(
          (entry) => `ALTER TABLE "public"."sys_tenant" DISABLE TRIGGER "${entry}";`
        ),
        ...numberRuleTenantTriggers.map(
          (entry) => `ALTER TABLE "public"."sys_tenant" DISABLE TRIGGER "${entry.triggerName}";`
        ),
        statement
      ].join('\n')
    )
    continue
  }

  if (plan.table === 'mdm_organization') {
    seedStatements.push(
      [
        statement,
        rootOrgTenantTriggers.length
          ? '-- 根组织已按源库 ID 写入，恢复租户根组织触发器供后续新建租户使用'
          : '',
        ...rootOrgTenantTriggers.map(
          (entry) => `ALTER TABLE "public"."sys_tenant" ENABLE TRIGGER "${entry}";`
        )
      ]
        .filter(Boolean)
        .join('\n')
    )
    continue
  }

  if (plan.table === 'sys_document_number_scene') {
    seedStatements.push(
      [
        statement,
        numberRuleTenantTriggers.length
          ? '-- 场景就绪后恢复触发器，并为已插入的租户补跑编号规则初始化'
          : '',
        ...numberRuleTenantTriggers.map(
          (entry) => `ALTER TABLE "public"."sys_tenant" ENABLE TRIGGER "${entry.triggerName}";`
        ),
        ...numberRuleTenantTriggers.flatMap((entry) =>
          entry.seedFunctions.map(
            (functionKey) =>
              `SELECT "app_private"."${functionKey.split('.')[1]}"("id") FROM "public"."sys_tenant";`
          )
        )
      ]
        .filter(Boolean)
        .join('\n')
    )
    continue
  }

  seedStatements.push(statement)
}

const seedSql = [
  `-- ===========================================================================
-- 平台基线数据（由 scripts/build-platform-baseline.ts 生成，请勿手工编辑）
--
-- 来源快照：${backupRoot}
-- 生成时间：${new Date().toISOString()}
--
-- 不含任何真实用户、审计日志、通知记录、AI 会话与业务数据。
-- 首个超级管理员需要通过 Supabase Auth 注册后按 README 的引导步骤提升。
-- ===========================================================================

SET check_function_bodies = false;
`,
  ...seedStatements
].join('\n\n')

mkdirSync(outputDirectory, { recursive: true })
writeFileSync(join(outputDirectory, activeProfile.outputFiles.schema), `${baselineSql}\n`)
writeFileSync(join(outputDirectory, activeProfile.outputFiles.data), `${seedSql}\n`)

const seedSummary = Object.fromEntries(
  Object.entries(seedReport).map(([table, counts]) => [table, `${counts.kept}/${counts.total}`])
)
const finalReport = {
  ...report,
  seedRows: seedSummary,
  droppedMenuRows,
  seedNotes
}
writeFileSync(
  join(outputDirectory, activeProfile.outputFiles.report),
  `${JSON.stringify(finalReport, null, 2)}\n`
)

console.log(
  `保留 ${keptTables.length} 张表 / ${keptViews.length} 个视图 / ${report.keptFunctions.length} 个函数；` +
    `丢弃 ${droppedTables.length} 张表；未解析引用 ${Object.keys(report.unresolved).length} 处`
)
console.log('种子行：', JSON.stringify(seedSummary))
console.log(
  `输出：${activeProfile.outputFiles.schema}、${activeProfile.outputFiles.data}、${activeProfile.outputFiles.report} → ${outputDirectory}`
)

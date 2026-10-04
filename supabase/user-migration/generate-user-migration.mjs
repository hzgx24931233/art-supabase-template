import { readFileSync, writeFileSync } from 'node:fs'

// 从旧项目快照生成「用户迁移」SQL：租户 / 组织 / 角色 / 角色授权 / 员工 / 平台用户 / auth 用户与身份。
const backup = 'D:/art-supabase-pro/supabase/backups/20261004-111116/database/data.sql'
const output = 'D:/art-supabase-template/user-migration.sql'
const source = readFileSync(backup, 'utf8')
const lines = source.split('\n')

function block(schema, table) {
  let capture = false
  let columns = []
  const rows = []
  const pattern = new RegExp(`^COPY "${schema}"\\."${table}" \\(([^)]*)\\) FROM stdin;$`)
  for (const line of lines) {
    const match = pattern.exec(line)
    if (match) {
      capture = true
      columns = match[1].split(',').map((value) => value.trim().replace(/"/g, ''))
      continue
    }
    if (!capture) continue
    if (line === '\\.') break
    rows.push(line.split('\t'))
  }
  return { columns, rows }
}

const unescape = (value) => {
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
const literal = (value) => (value === null ? 'NULL' : `'${value.replace(/'/g, "''")}'`)

// 目标库里已登记的编号场景（来自平台基线 seed）：编号规则只迁移这些键
const seedSql = readFileSync('D:/art-supabase-template/supabase/baseline/platform-seed.sql', 'utf8')
const SEEDED_SCENE_KEYS = new Set(
  [...seedSql.matchAll(/^\s*\('([a-z][a-z0-9_]*\.[a-z0-9_]+)',/gm)].map((match) => match[1])
)
// 本次要迁移的租户（快照里除 platform / public-register 之外的全部租户）
const tenants = block('public', 'sys_tenant')
const MIGRATED_TENANT_IDS = tenants.rows
  .filter((row) => !['platform', 'public_register'].includes(row[tenants.columns.indexOf('builtin_type')]))
  .map((row) => row[tenants.columns.indexOf('id')])
const orgs = block('public', 'mdm_organization')
const roles = block('public', 'sys_role')
const users = block('public', 'sys_user')
const employees = block('public', 'mdm_employee')
const authUsers = block('auth', 'users')
const authIdentities = block('auth', 'identities')

const idx = (columns, name) => columns.indexOf(name)
const at = (row, columns, name) => {
  const position = idx(columns, name)
  return position < 0 ? null : row[position]
}

// ---- 决定要迁移的行 ----
const KEPT_TENANT_IDS = new Set(
  tenants.rows
    .filter((row) => ['platform', 'public_register'].includes(at(row, tenants.columns, 'builtin_type')))
    .map((row) => at(row, tenants.columns, 'id'))
)
const allTenantIds = new Set(tenants.rows.map((row) => at(row, tenants.columns, 'id')))

const referencedOrgIds = new Set(
  [...users.rows, ...roles.rows]
    .map((row) => at(row, 'organization_id'))
)
/** 目标库里已经存在（手工创建）的登录账号：按邮箱关联，不重复插入 auth 行。 */
const REUSED_AUTH_EMAILS = new Set(['869123771@qq.com'])

const orgRowById = new Map(orgs.rows.map((row) => [at(row, orgs.columns, 'id'), row]))
const orgsToMigrate = new Set()
for (const row of users.rows) {
  const orgId = at(row, users.columns, 'organization_id')
  if (orgId && orgId !== '\\N') orgsToMigrate.add(orgId)
}
for (const row of roles.rows) {
  const orgId = at(row, roles.columns, 'organization_id')
  if (orgId && orgId !== '\\N') orgsToMigrate.add(orgId)
}
// 补齐祖先链
let grew = true
while (grew) {
  grew = false
  for (const id of [...orgsToMigrate]) {
    const parent = orgRowById.get(id) ? at(orgRowById.get(id), orgs.columns, 'parent_id') : null
    if (parent && parent !== '\\N' && !orgsToMigrate.has(parent) && orgRowById.has(parent)) {
      orgsToMigrate.add(parent)
      grew = true
    }
  }
}

const employeeIds = new Set(
  users.rows
    .map((row) => at(row, users.columns, 'hr_employee_id'))
    .filter((value) => value && value !== '\\N')
)

// 员工引用的组织也要一起迁移（员工的 organization_id 与用户/角色未必重合）
for (const row of employees.rows) {
  if (!employeeIds.has(at(row, employees.columns, 'id'))) continue
  const orgId = at(row, employees.columns, 'organization_id')
  if (orgId && orgId !== '\\N') orgsToMigrate.add(orgId)
}
for (const id of [...orgsToMigrate]) {
  let parent = orgRowById.get(id) ? at(orgRowById.get(id), orgs.columns, 'parent_id') : null
  while (parent && parent !== '\\N' && orgRowById.has(parent)) {
    orgsToMigrate.add(parent)
    parent = at(orgRowById.get(parent), orgs.columns, 'parent_id')
  }
}

const rolesToMigrate = roles.rows.filter((row) => !KEPT_TENANT_IDS.size || true) // 16 个角色全部迁移

const statements = []
const deferredBackfills = []
const push = (sql) => statements.push(sql.trim())

/** 自引用外键（父子组织）要求父行先插入：按父链拓扑排序。 */
function sortByParent(rows, columns, idField, parentField) {
  const byId = new Map(rows.map((row) => [at(row, columns, idField), row]))
  const ordered = []
  const visiting = new Set()
  const visit = (row) => {
    const id = at(row, columns, idField)
    if (!row || visiting.has(id) || ordered.includes(row)) return
    visiting.add(id)
    const parentId = at(row, columns, parentField)
    if (parentId && parentId !== '\\N' && byId.has(parentId)) visit(byId.get(parentId))
    ordered.push(row)
    visiting.delete(id)
  }
  for (const row of rows) visit(row)
  return ordered
}

function insertRows({ schema, table, columns, rows, subset, conflict = 'DO NOTHING', filter = '' }) {
  if (!rows.length) return
  const columnList = columns.map((column) => `"${column}"`).join(', ')
  const values = rows
    .map(
      (row) =>
        `  (${columns
          .map((column, index) => literal(unescape(row[subset ? subset.indexOf(column) : index])))
          .join(', ')})`
    )
    .join(',\n')
  if (filter) {
    // 需要过滤时用 insert ... select 形式：便于附加 where（例如只插入场景已存在的编号规则）
    const quotedColumns = columns.map((column) => `"${column}"`).join(', ')
    const selectList = columns.map((column) => `v."${column}"`).join(', ')
    push(
      `-- ${schema}.${table}：${rows.length} 行（带过滤）\n` +
        `insert into "${schema}"."${table}" (${quotedColumns})\n` +
        `select ${selectList}\n  from (values\n${values}\n  ) as v(${quotedColumns})\n` +
        `${filter}\non conflict ${conflict};`
    )
    return
  }
  push(
    `-- ${schema}.${table}：${rows.length} 行\ninsert into "${schema}"."${table}" (${columnList}) values\n${values}\non conflict ${conflict};`
  )
}

const tenantColumns = tenants.columns
insertRows({
  schema: 'public',
  table: 'sys_tenant',
  columns: tenantColumns,
  rows: tenants.rows,
  subset: tenantColumns
})

const orgColumns = orgs.columns
const orgsToInsert = sortByParent(
  orgs.rows.filter((row) => orgsToMigrate.has(at(row, orgs.columns, 'id'))),
  orgs.columns,
  'id',
  'parent_id'
)
// 组织负责人外键指向 sys_user：组织先建（负责人留空），用户插入后再回填
const leaderField = orgColumns.indexOf('leader_user_id')
const leaderUpdates = orgsToInsert
  .map((row) => ({
    orgId: at(row, orgs.columns, 'id'),
    leaderId: leaderField >= 0 ? at(row, orgs.columns, 'leader_user_id') : null
  }))
  .filter((entry) => entry.leaderId && entry.leaderId !== '\\N')

insertRows({
  schema: 'public',
  table: 'mdm_organization',
  columns: orgColumns,
  rows: orgsToInsert.map((row) =>
    leaderField >= 0 ? row.map((value, index) => (index === leaderField ? '\\N' : value)) : row
  ),
  subset: orgColumns
})

const roleColumns = roles.columns
insertRows({
  schema: 'public',
  table: 'sys_role',
  columns: roleColumns,
  rows: rolesToMigrate,
  subset: roleColumns
})

if (employeeIds.size > 0 && employees.rows.length) {
  // 员工编号走「可配置编号规则」触发器：先迁入这些租户的编号规则
  // （只取新项目已登记场景的规则，业务模块自己的规则等接入模块时再补）
  const ruleBlock = block('public', 'sys_document_number_rule')
  if (ruleBlock.rows.length) {
    const ruleColumns = ruleBlock.columns
    const ruleRows = ruleBlock.rows.filter(
      (row) =>
        MIGRATED_TENANT_IDS.includes(at(row, ruleColumns, 'tenant_id')) &&
        // 目标库只登记了平台基线里的场景：不存在的场景对应的规则会违反外键，先跳过
        SEEDED_SCENE_KEYS.has(at(row, ruleColumns, 'rule_key'))
    )
    if (ruleRows.length) {
      insertRows({
        schema: 'public',
        table: 'sys_document_number_rule',
        columns: ruleColumns,
        rows: ruleRows,
        subset: ruleColumns,
        conflict: 'DO NOTHING'
      })
    }
  }
  // 员工档案依赖「职级 → 职位族 → 职位画像 → 岗位 → 员工」这条链，按依赖顺序逐张迁入；
  // 员工的 created_by_user_id 指向 sys_user，所以先留空、用户插入后再回填。
  const employeeRows = employees.rows.filter((row) => employeeIds.has(at(row, employees.columns, 'id')))
  const positionBlock = block('public', 'mdm_position')
  const profileBlock = block('public', 'mdm_job_profile')
  const gradeBlock = block('public', 'mdm_grade')
  const familyBlock = block('public', 'mdm_job_family')

  const positionsUsed = new Set(
    employeeRows.map((row) => at(row, employees.columns, 'position_id')).filter((value) => value && value !== '\\N')
  )
  const positionRows = positionBlock.rows.filter((row) => positionsUsed.has(at(row, positionBlock.columns, 'id')))
  const profilesUsed = new Set(
    positionRows.map((row) => at(row, positionBlock.columns, 'job_profile_id')).filter((value) => value && value !== '\\N')
  )
  const profileRows = profileBlock.rows.filter((row) => profilesUsed.has(at(row, profileBlock.columns, 'id')))
  const gradesUsed = new Set([
    ...positionRows.map((row) => at(row, positionBlock.columns, 'grade_id')),
    ...profileRows.map((row) => at(row, profileBlock.columns, 'default_grade_id'))
  ].filter((value) => value && value !== '\\N'))
  const gradeRows = gradeBlock.rows.filter((row) => gradesUsed.has(at(row, gradeBlock.columns, 'id')))
  const familiesUsed = new Set(
    profileRows.map((row) => at(row, profileBlock.columns, 'family_id')).filter((value) => value && value !== '\\N')
  )
  const familyRows = familyBlock.rows.filter((row) => familiesUsed.has(at(row, familyBlock.columns, 'id')))

  for (const [table, columns, rows] of [
    ['mdm_grade', gradeBlock.columns, gradeRows],
    ['mdm_job_family', familyBlock.columns, familyRows],
    ['mdm_job_profile', profileBlock.columns, profileRows],
    ['mdm_position', positionBlock.columns, positionRows]
  ]) {
    insertRows({ schema: 'public', table, columns, rows, subset: columns })
  }

  const creatorField = idx(employees.columns, 'created_by_user_id')
  const leaderUpdatesForEmployees = employeeRows
    .map((row) => ({
      id: at(row, employees.columns, 'id'),
      creator: creatorField >= 0 ? at(row, employees.columns, 'created_by_user_id') : null
    }))
    .filter((entry) => entry.creator && entry.creator !== '\\N')
  insertRows({
    schema: 'public',
    table: 'mdm_employee',
    columns: employees.columns,
    rows: employeeRows.map((row) =>
      creatorField >= 0 ? row.map((value, index) => (index === creatorField ? '\\N' : value)) : row
    ),
    subset: employees.columns
  })
  // 建档人回填语句在 sys_user 插入之后再执行（见下方「用户就位后回填」）
  if (leaderUpdatesForEmployees.length) {
    deferredBackfills.push(
      `-- 回填员工建档人（${leaderUpdatesForEmployees.length} 条）\n` +
        `update public.mdm_employee as e\n   set created_by_user_id = v.creator_id\n` +
        `  from (values\n${leaderUpdatesForEmployees
          .map((entry) => `    (${literal(entry.id)}::uuid, ${literal(entry.creator)}::uuid)`)
          .join(',\n')}\n  ) as v(employee_id, creator_id)\n` +
        ` where e.id = v.employee_id and e.created_by_user_id is distinct from v.creator_id;`
    )
  }
}

const userColumns = users.columns
insertRows({
  schema: 'public',
  table: 'sys_user',
  columns: userColumns,
  rows: users.rows,
  subset: userColumns
})

// 用户就位后回填组织负责人（外键要求负责人与组织同租户）
if (leaderUpdates.length) {
  push(
    `-- 回填组织负责人（${leaderUpdates.length} 条）\n` +
      `update public.mdm_organization as o\n` +
      `   set leader_user_id = v.leader_id\n` +
      `  from (values\n${leaderUpdates
        .map((entry) => `    (${literal(entry.orgId)}::uuid, ${literal(entry.leaderId)}::uuid)`)
        .join(',\n')}\n` +
      `  ) as v(org_id, leader_id)\n` +
      ` where o.id = v.org_id and o.leader_user_id is distinct from v.leader_id;`
  )
}

// 手工创建过登录账号的邮箱：按邮箱把平台用户与现有 auth 账号关联起来
push(
  `-- 按邮箱关联平台用户与登录账号（例如手工创建过的 869123771@qq.com，其 auth id 与旧库不同）\n` +
    `update public.sys_user u\n   set auth_user_id = a.id\n` +
    `  from auth.users a\n` +
    ` where lower(a.email) = lower(u.user_email)\n` +
    `   and u.auth_user_id is distinct from a.id;`
)

// 用户就位后再执行延后的回填（员工建档人等）
for (const statement of deferredBackfills) push(statement)

// 迁移过来的角色默认没有菜单授权：给它们平台菜单权限（复制 R_SUPER 的平台授权），
// 否则用户登录后看不到任何菜单。业务模块菜单不在新项目里，接入模块时再补。
push(
  `-- 租户成员关系：按用户所属租户补 sys_user_tenant（源库这张表为空，登录态主要看 sys_user.tenant_id）\n` +
    `-- role_codes 只保留该租户真实存在的角色（成员校验触发器要求角色属于同一租户）\n` +
    `insert into public.sys_user_tenant (id, user_id, tenant_id, role_codes, is_default, status, create_by, create_time, update_by, update_time)\n` +
    `select gen_random_uuid(),\n` +
    `       u.id,\n` +
    `       u.tenant_id,\n` +
    `       coalesce((\n` +
    `         select array_agg(code)\n` +
    `           from unnest(coalesce(u.user_roles, '{}'::text[])) as code\n` +
    `          where exists (\n` +
    `                select 1 from public.sys_role r\n` +
    `                 where r.tenant_id = u.tenant_id and r.role_code = code\n` +
    `          )\n` +
    `       ), '{}'::text[]),\n` +
    `       true, '1', 'user-migration', now(), 'user-migration', now()\n` +
    `  from public.sys_user u\n` +
    ` where not exists (\n` +
    `       select 1 from public.sys_user_tenant t\n` +
    `        where t.user_id = u.id and t.tenant_id = u.tenant_id\n` +
    ` );\n`
)

push(
  `-- 迁移角色补平台菜单授权（复制 R_SUPER 的平台授权；已存在的不重复插入）\n` +
    `insert into public.sys_role_menu (role_id, menu_id, permission, tenant_id, create_by, update_by)\n` +
    `select r.id, rm.menu_id, rm.permission, r.tenant_id, 'user-migration', 'user-migration'\n` +
    `  from public.sys_role r\n` +
    `  join public.sys_role rm_role on rm_role.role_code = 'R_SUPER' and rm_role.tenant_id = app_private.platform_tenant_id()\n` +
    `  join public.sys_role_menu rm on rm.role_id = rm_role.id\n` +
    ` where r.role_code not in ('R_SUPER', 'R_ADMIN', 'R_REGISTER')\n` +
    `   and not exists (select 1 from public.sys_role_menu existing where existing.role_id = r.id and existing.menu_id = rm.menu_id);`
)

// auth.users / auth.identities：只写目标库存在的列（交集）
const AUTH_USER_COLUMNS = [
  'instance_id',
  'id',
  'aud',
  'role',
  'email',
  'encrypted_password',
  'email_confirmed_at',
  'invited_at',
  'last_sign_in_at',
  'raw_app_meta_data',
  'raw_user_meta_data',
  'is_super_admin',
  'created_at',
  'updated_at',
  'email_change_confirm_status',
  'banned_until',
  'is_sso_user',
  'is_anonymous'
]
const authUserColumns = AUTH_USER_COLUMNS.filter((column) => authUsers.columns.includes(column))
const emailField = authUsers.columns.indexOf('email')
const authUserRows = authUsers.rows.filter(
  (row) => !REUSED_AUTH_EMAILS.has(String(row[emailField]).toLowerCase())
)
const authUserValues = authUserRows.map((row) =>
  authUserColumns.map((column) => unescape(at(row, authUsers.columns, column)))
)
push(
  `-- auth.users：${authUserRows.length} 个账号（保留 bcrypt 密码哈希与封禁状态）\n` +
    `insert into auth.users (${authUserColumns.map((column) => `"${column}"`).join(', ')})\nvalues\n` +
    authUserValues.map((row) => `  (${row.map(literal).join(', ')})`).join(',\n') +
    `\non conflict (id) do nothing;`
)

const AUTH_IDENTITY_COLUMNS = [
  'provider_id',
  'user_id',
  'identity_data',
  'provider',
  'last_sign_in_at',
  'created_at',
  'updated_at',
  'id'
]
const identityColumns = AUTH_IDENTITY_COLUMNS.filter((column) =>
  authIdentities.columns.includes(column)
)
const identityValues = authIdentities.rows
  .filter((row) => {
    const identityData = unescape(at(row, authIdentities.columns, 'identity_data')) ?? '{}'
    try {
      const email = String(JSON.parse(identityData).email ?? '').toLowerCase()
      return !REUSED_AUTH_EMAILS.has(email)
    } catch {
      return true
    }
  })
  .map((row) => {
  const values = []
  for (const column of identityColumns) {
    if (column === 'email') {
      const identityData = unescape(at(row, authIdentities.columns, 'identity_data')) ?? '{}'
      let email = null
      try {
        email = JSON.parse(identityData).email ?? null
      } catch {
        email = null
      }
      values.push(email)
      continue
    }
    values.push(unescape(at(row, authIdentities.columns, column)))
  }
  return values
})
push(
  `-- auth.identities：${identityValues.length} 条 email 身份\n` +
    `insert into auth.identities (${identityColumns.map((column) => `"${column}"`).join(', ')})\nvalues\n` +
    identityValues.map((row) => `  (${row.map(literal).join(', ')})`).join(',\n') +
    `\non conflict (provider_id, provider) do nothing;`
)

const header = `-- ===========================================================================
-- 用户迁移：旧项目 nvzlwcutsqptngyqfzqs → 新项目 trthbpyqubyjtkzmcewy
-- 来源快照：supabase/backups/20261004-111116
-- 内容：${tenants.rows.length} 个租户、${orgsToMigrate.size} 个组织、${rolesToMigrate.length} 个角色、
--       ${users.rows.length} 个平台用户、${authUserRows.length} 个登录账号与身份，以及迁移角色的平台菜单授权
-- 不含：会话、刷新令牌、MFA（密钥无法跨项目迁移）、审计日志、业务数据、角色原有业务菜单授权
--
-- 迁移期间临时关闭这些触发器，迁移完成后恢复（数据不变量随后人工复核）：
--   1. sys_tenant_create_root_organization —— 保留源库根组织 ID，避免触发器另生成一套 ROOT 组织；
--   2. mdm_organization.sys_organization_validate —— 组织负责人对应的用户在本批次后面才插入；
--   3. mdm_organization.sys_organization_guard_system —— 迁移要先清掉触发器自动生成的 ROOT 组织；
--   4. mdm_organization.trg_enforce_system_organization_rules —— 同上，删除根组织的守卫；
--   5. mdm_employee.hr_employee_creator_identity —— 建档人要在用户插入后回填（源库的负责人/建档人本就是这些用户）。
-- ===========================================================================

set check_function_bodies = false;

alter table "public"."sys_tenant" disable trigger "sys_tenant_create_root_organization";
alter table "public"."mdm_organization" disable trigger "sys_organization_validate";
alter table "public"."mdm_organization" disable trigger "sys_organization_guard_system";
alter table "public"."mdm_organization" disable trigger "trg_enforce_system_organization_rules";
alter table "public"."mdm_employee" disable trigger "hr_employee_creator_identity";

`
const footer = `
alter table "public"."mdm_employee" enable trigger "hr_employee_creator_identity";
alter table "public"."mdm_organization" enable trigger "trg_enforce_system_organization_rules";
alter table "public"."mdm_organization" enable trigger "sys_organization_guard_system";
alter table "public"."mdm_organization" enable trigger "sys_organization_validate";
alter table "public"."sys_tenant" enable trigger "sys_tenant_create_root_organization";
`
writeFileSync(output, `${header}${statements.join('\n\n')}\n${footer}`)
console.log(`已生成 ${output}`)
console.log(`租户 ${tenants.rows.length} / 组织 ${orgsToMigrate.size} / 角色 ${rolesToMigrate.length} / 平台用户 ${users.rows.length} / auth 用户 ${authUserRows.length} / 身份 ${authIdentities.rows.length}`)
console.log(`员工引用 ${employeeIds.size} 个（快照 mdm_employee 行数 ${employees.rows.length}）`)

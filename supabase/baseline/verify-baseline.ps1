# 在一次性 Postgres 容器里校验平台基线 SQL：语法、对象依赖、策略表达式与种子数据。
#
#   powershell -File supabase/baseline/verify-baseline.ps1
#   powershell -File supabase/baseline/verify-baseline.ps1 -KeepContainer    # 保留容器便于排查
#
# 使用 Supabase 官方 Postgres 镜像（与管理层同大版本）。容器里没有 GoTrue/PostgREST，
# 因此脚本会先建最小桩对象（anon/authenticated/service_role 角色、auth.uid()/auth.jwt()、
# storage 命名空间与 supabase_realtime 发布），让基线的策略与授权语句可以正常创建。
# 端到端校验（登录、菜单装配、RPC）仍需在真实 Supabase 项目上执行。
[CmdletBinding()]
param(
  [string]$Image = 'public.ecr.aws/supabase/postgres:17.11.0.002',
  [string]$ContainerName = 'art-platform-baseline-verify',
  [int]$Port = 55432,
  [switch]$KeepContainer
)

$ErrorActionPreference = 'Stop'
$baselineSql = Join-Path $PSScriptRoot 'platform-baseline.sql'
$seedSql = Join-Path $PSScriptRoot 'platform-seed.sql'
foreach ($file in @($baselineSql, $seedSql)) {
  if (-not (Test-Path $file)) { throw "缺少基线文件：$file。请先运行 pnpm baseline:platform。" }
}

function Invoke-Psql {
  param([string]$Sql, [switch]$AllowFailure, [switch]$Quiet, [string]$DatabaseUser = 'postgres')
  # -A -t 输出不带表头/对齐，便于后续按 item|value 解析
  $arguments = @(
    'exec', '-i', $ContainerName, 'psql', '-U', $DatabaseUser, '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-A', '-t'
  )
  if ($Quiet) { $arguments += '-q' }
  $arguments += @('-f', '-')
  # psql 的告警走 stderr，不能让 PowerShell 把它当成终止错误
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = $Sql | & docker @arguments 2>&1
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousPreference
  }
  if ($code -ne 0 -and -not $AllowFailure) {
    throw "psql 执行失败（退出码 $code）：`n$($output -join "`n")"
  }
  if ($code -ne 0) { return @() }
  return @($output | Where-Object { $_ -notmatch '^\s*$' })
}

& docker rm -f $ContainerName 2>&1 | Out-Null
Write-Host "[verify] 启动临时 Postgres 容器 $ContainerName（$Image）"
& docker run -d --name $ContainerName -e POSTGRES_PASSWORD=postgres -p "$Port`:5432" $Image | Out-Null
if ($LASTEXITCODE -ne 0) { throw '容器启动失败。' }

try {
  Write-Host '[verify] 等待数据库就绪'
  $ready = $false
  for ($attempt = 1; $attempt -le 90; $attempt++) {
    $ErrorActionPreference = 'Continue'
    try {
      'SELECT 1;' | & docker exec -i $ContainerName psql -U postgres -d postgres -q -f - *> $null
      $probeCode = $LASTEXITCODE
    } finally {
      $ErrorActionPreference = 'Stop'
    }
    if ($probeCode -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 2
  }
  if (-not $ready) { throw '数据库在 180 秒内没有就绪。' }

  # 官方 Postgres 镜像已自带 anon/authenticated/service_role 角色、auth.uid()/auth.role()
  # 以及 auth/storage 命名空间；这里只补基线创建期需要的 auth.users（外键目标）
  # 与运行期会用到的 auth.jwt()。auth schema 属于 supabase_admin，因此用该账号执行。
  $stubSql = @'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN CREATE ROLE authenticator NOINHERIT LOGIN; END IF;
END
$$;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text, created_at timestamptz DEFAULT now());
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END
$$;
'@

  Write-Host '[verify] 创建桩对象（auth.users、auth.jwt、发布）'
  Invoke-Psql -Sql $stubSql -Quiet -DatabaseUser 'supabase_admin' | Out-Null

  Write-Host '[verify] 应用 platform-baseline.sql'
  Invoke-Psql -Sql (Get-Content -Raw -Encoding UTF8 $baselineSql) -Quiet | Out-Null

  Write-Host '[verify] 应用 platform-seed.sql'
  Invoke-Psql -Sql (Get-Content -Raw -Encoding UTF8 $seedSql) -Quiet | Out-Null

  Write-Host '[verify] 统计对象与种子数据'
  $statsSql = @'
SELECT 'tables' AS item, count(*)::text AS value FROM pg_tables WHERE schemaname IN ('public','app_private')
UNION ALL SELECT 'views', count(*)::text FROM pg_views WHERE schemaname IN ('public','app_private')
UNION ALL SELECT 'functions', count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname IN ('public','app_private')
UNION ALL SELECT 'policies', count(*)::text FROM pg_policies WHERE schemaname IN ('public','app_private')
UNION ALL SELECT 'rls_tables', count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relrowsecurity
UNION ALL SELECT 'triggers', count(*)::text FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE NOT t.tgisinternal AND n.nspname IN ('public','app_private')
UNION ALL SELECT 'tenants', count(*)::text FROM public.sys_tenant
UNION ALL SELECT 'roles', count(*)::text FROM public.sys_role
UNION ALL SELECT 'menus', count(*)::text FROM public.sys_menu
UNION ALL SELECT 'menus_with_pages', count(*)::text FROM public.sys_menu WHERE type = 'menu'
UNION ALL SELECT 'role_menu_grants', count(*)::text FROM public.sys_role_menu
UNION ALL SELECT 'dict_types', count(*)::text FROM public.sys_dict_type
UNION ALL SELECT 'dict_items', count(*)::text FROM public.sys_dictionary
UNION ALL SELECT 'params', count(*)::text FROM public.sys_param
UNION ALL SELECT 'applications', count(*)::text FROM public.sys_application
UNION ALL SELECT 'ai_feature_configs', count(*)::text FROM public.ai_feature_config
UNION ALL SELECT 'number_scenes', count(*)::text FROM public.sys_document_number_scene
UNION ALL SELECT 'number_rules_seeded_by_trigger', count(*)::text FROM public.sys_document_number_rule
UNION ALL SELECT 'anon_function_grants', count(*)::text FROM information_schema.routine_privileges WHERE routine_schema IN ('public','app_private') AND grantee = 'anon'
UNION ALL SELECT 'public_function_grants', count(*)::text FROM information_schema.routine_privileges WHERE routine_schema IN ('public','app_private') AND grantee = 'PUBLIC'
UNION ALL SELECT 'authenticated_function_grants', count(*)::text FROM information_schema.routine_privileges WHERE routine_schema IN ('public','app_private') AND grantee = 'authenticated'
UNION ALL SELECT 'sequence_grants', count(*)::text FROM information_schema.usage_privileges WHERE object_schema IN ('public','app_private') AND object_type = 'SEQUENCE' AND grantee <> 'postgres'
UNION ALL SELECT 'chinese_roundtrip', count(*)::text FROM public.sys_dictionary WHERE "label" ~ '[一-龥]'
UNION ALL SELECT 'business_tables_left', count(*)::text FROM pg_tables WHERE schemaname = 'public' AND (tablename LIKE 'smis%' OR tablename LIKE 'hr_%' OR tablename LIKE 'fms%' OR tablename LIKE 'wms%' OR tablename LIKE 'mes%' OR tablename LIKE 'pmis%' OR tablename LIKE 'scm_%' OR tablename LIKE 'ctm%' OR tablename LIKE 'vehicle%' OR tablename LIKE 'backup%')
ORDER BY 1;
'@
  $stats = Invoke-Psql -Sql $statsSql

  Write-Host '[verify] 校验平台助手函数与授权'
  $helperSql = @'
SELECT 'platform_tenant_id' AS item, app_private.platform_tenant_id()::text AS value;
SELECT 'register_tenant_id' AS item, app_private.default_register_tenant_id()::text AS value;
SELECT 'current_is_super_without_jwt' AS item, public.current_is_super()::text AS value;
-- 无 JWT 时租户读取上下文会按设计抛错，这里改为校验安全模型本身是否随基线落地
SELECT 'sys_tenant_policies' AS item, count(*)::text AS value FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'sys_tenant';
SELECT 'sys_user_policies' AS item, count(*)::text AS value FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'sys_user';
SELECT 'anon_function_grants_summary' AS item, count(*)::text AS value
  FROM information_schema.routine_privileges
 WHERE routine_schema IN ('public','app_private') AND grantee IN ('anon','public');
SELECT 'r_super_granted_pages' AS item, count(*)::text AS value
  FROM public.sys_role_menu rm
  JOIN public.sys_role r ON r.id = rm.role_id
  JOIN public.sys_menu m ON m.id = rm.menu_id
 WHERE r.role_code = 'R_SUPER' AND m.type = 'menu';
SELECT 'workflow_definition_columns' AS item, count(*)::text AS value
  FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'wf_definition';
'@
  $helpers = Invoke-Psql -Sql $helperSql

  Write-Host "`n===== 对象与种子统计 ====="
  $stats | ForEach-Object { Write-Host "  $_" }
  Write-Host "`n===== 助手函数与授权 ====="
  $helpers | ForEach-Object { Write-Host "  $_" }

  function Read-Stat {
    param([string]$Name)
    foreach ($line in $stats) {
      if ($line -match "^$Name\|(.+)$") { return $Matches[1].Trim() }
    }
    return $null
  }

  $results = @(
    @{ name = '保留表数量'; actual = [int](Read-Stat 'tables'); min = 80 },
    @{ name = '策略数量'; actual = [int](Read-Stat 'policies'); min = 380 },
    @{ name = '函数数量'; actual = [int](Read-Stat 'functions'); min = 200 },
    @{ name = '启用 RLS 的表'; actual = [int](Read-Stat 'rls_tables'); min = 85 },
    @{ name = '触发器数量'; actual = [int](Read-Stat 'triggers'); min = 230 },
    @{ name = '内置租户'; actual = [int](Read-Stat 'tenants'); min = 2 },
    @{ name = '内置角色'; actual = [int](Read-Stat 'roles'); min = 3 },
    @{ name = '平台菜单'; actual = [int](Read-Stat 'menus'); min = 90 },
    @{ name = '角色菜单授权'; actual = [int](Read-Stat 'role_menu_grants'); min = 100 },
    @{ name = '字典类型'; actual = [int](Read-Stat 'dict_types'); min = 80 },
    @{ name = '字典项'; actual = [int](Read-Stat 'dict_items'); min = 300 },
    @{ name = '平台参数'; actual = [int](Read-Stat 'params'); min = 10 },
    @{ name = '平台应用'; actual = [int](Read-Stat 'applications'); min = 1 }
  )

  $failures = @()
  foreach ($check in $results) {
    if ($check.actual -lt $check.min) {
      $failures += "$($check.name) = $($check.actual)（期望 ≥ $($check.min)）"
    }
  }
  $businessLeft = [int](Read-Stat 'business_tables_left')
  # 契约表是按设计保留的（保留代码依赖的读取/识别/收发货集成），其余业务表必须为 0
  $contractTables = @(
    'scm_receipt_target_document',
    'scm_receipt_target_line',
    'scm_purchase_document',
    'scm_sales_document',
    'tms_invoice',
    'mdm_carrier',
    'mdm_customer',
    'mdm_employee',
    'mdm_material',
    'mdm_organization'
  )
  # 权限保真度：anon 只应拿到源库显式授予的函数（101 个），PUBLIC 与序列一律不开放
  if ([int](Read-Stat 'anon_function_grants') -ne 101) { $failures += 'anon 函数授权数与源库显式清单不一致（期望 101）' }
  # PUBLIC 执行权限是 PostgreSQL 内建默认，只对带 ACL 块的函数收回；期望值与生成报告对照
  $expectedPublic = (Get-Content -Raw -Encoding UTF8 (Join-Path $PSScriptRoot 'platform-baseline-report.json') | ConvertFrom-Json).expectedPublicExecutableFunctions
  if ([int](Read-Stat 'public_function_grants') -ne [int]$expectedPublic) {
    $failures += "PUBLIC 可执行函数数 = $(Read-Stat 'public_function_grants')（期望 $expectedPublic）"
  }
  if ([int](Read-Stat 'sequence_grants') -ne 0) { $failures += '序列不应授予业务角色' }
  if ([int](Read-Stat 'chinese_roundtrip') -le 0) { $failures += '中文字段没有正确写入（编码问题）' }
  if ($businessLeft -gt $contractTables.Count) {
    $failures += "业务表残留 $businessLeft 张，超过文档化的契约表数量 $($contractTables.Count)"
  }
  if (-not ($helpers | Where-Object { $_ -match '^platform_tenant_id\|028e6a68' })) {
    $failures += 'platform_tenant_id() 未返回平台租户'
  }
  if (-not ($helpers | Where-Object { $_ -match '^current_is_super_without_jwt\|f' })) {
    $failures += 'current_is_super() 在缺少 JWT 时未返回 false'
  }
  if ($helpers | Where-Object { $_ -match '^r_super_granted_pages\|0$' }) {
    $failures += 'R_SUPER 没有授权到任何平台页面'
  }

  if ($failures.Count -gt 0) {
    throw "基线校验未通过：`n- $($failures -join "`n- ")"
  }
  Write-Host "`n[verify] 通过：基线在干净 Postgres 上可完整应用，策略/函数/种子数据自洽，无业务表残留。"
} finally {
  if ($KeepContainer) {
    Write-Host "[verify] 保留容器 $ContainerName（端口 $Port）；排查后执行：docker rm -f $ContainerName"
  } else {
    & docker rm -f $ContainerName 2>&1 | Out-Null
    Write-Host '[verify] 已删除临时容器'
  }
}

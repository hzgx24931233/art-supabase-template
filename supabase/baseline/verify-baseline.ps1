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
-- 镜像自带的 graphql 托管 schema 有 DDL 事件触发器，缺序列会让任何 DDL 报 OID 错误；
-- 这里补齐它依赖的对象，等价于托管环境。
CREATE SCHEMA IF NOT EXISTS graphql;
CREATE SEQUENCE IF NOT EXISTS graphql.seq_schema_version;
-- 镜像里可能已有该函数（返回类型可能不同，CREATE OR REPLACE 换不掉）：存在就跳过
DO $stub$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'graphql' AND p.proname = 'increment_schema_version'
  ) THEN
    EXECUTE 'CREATE FUNCTION graphql.increment_schema_version() RETURNS void LANGUAGE plpgsql AS $body$ BEGIN PERFORM pg_catalog.nextval(''graphql.seq_schema_version''); END $body$';
  END IF;
END
$stub$;
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
SELECT 'current_is_super_without_jwt' AS item, public.current_is_super()::text AS value;
-- 单组织模型：基线里不再有 sys_tenant，读写上下文也不再按租户收敛
SELECT 'sys_user_policies' AS item, count(*)::text AS value FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'sys_user';
SELECT 'anon_function_grants_summary' AS item, count(*)::text AS value
  FROM information_schema.routine_privileges
 WHERE routine_schema IN ('public','app_private') AND grantee IN ('anon','public');
SELECT 'role_page_grants' AS item, count(*)::text AS value
  FROM public.sys_role_menu rm
  JOIN public.sys_role r ON r.id = rm.role_id
  JOIN public.sys_menu m ON m.id = rm.menu_id
 WHERE m.type = 'menu';
SELECT 'workflow_definition_columns' AS item, count(*)::text AS value
  FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'wf_definition';
'@
  $helpers = Invoke-Psql -Sql $helperSql
  # 平台超管角色守卫：改名/停用/删除必须被 sys_role 的触发器拦下。探针先造一个平台超管身份，
  # 让 platform-super 写入策略放行，从而确认拦住它的是触发器而不是 RLS；对照项证明没有误伤。
  $guardSql = @'
begin;
create temp table baseline_guard_probe(step text primary key, outcome text not null);
grant insert, select on baseline_guard_probe to authenticated;

insert into public.sys_user (id, auth_user_id, user_name, user_email, status, user_roles, create_by)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
        '基线守卫探针', 'baseline-guard@example.invalid', '1', array['R_SUPER'], 'verify-baseline');

set local role authenticated;
-- 镜像自带的 auth.uid() 读 request.jwt.claim.sub，桩 auth.jwt() 读 request.jwt.claims，两者都要设
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';

do $$
declare
  v_super_id uuid;
  v_rows integer := 0;
  v_control text := 'filtered';
  v_rename text := 'allowed';
  v_disable text := 'allowed';
  v_delete text := 'allowed';
begin
  select id into v_super_id from public.sys_role where role_code = 'R_SUPER';

  begin
    update public.sys_role set description = description where id = v_super_id;
    get diagnostics v_rows = row_count;
    if v_rows = 1 then v_control := 'allowed'; end if;
  exception when others then
    v_control := 'blocked';
  end;

  begin
    update public.sys_role set role_code = 'R_SUPER_RENAMED' where id = v_super_id;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then v_rename := 'filtered'; end if;
  exception when others then
    v_rename := 'blocked';
  end;

  begin
    update public.sys_role set enabled = false where id = v_super_id;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then v_disable := 'filtered'; end if;
  exception when others then
    v_disable := 'blocked';
  end;

  begin
    delete from public.sys_role where id = v_super_id;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then v_delete := 'filtered'; end if;
  exception when others then
    v_delete := 'blocked';
  end;

  insert into baseline_guard_probe values
    ('guard_control_description', v_control),
    ('guard_rename', v_rename),
    ('guard_disable', v_disable),
    ('guard_delete', v_delete);
end $$;

reset role;
select step as item, outcome as value from baseline_guard_probe order by step;
rollback;
'@
  $guards = Invoke-Psql -Sql $guardSql -Quiet

  Write-Host "`n===== 对象与种子统计 ====="
  $stats | ForEach-Object { Write-Host "  $_" }
  Write-Host "`n===== 助手函数与授权 ====="
  $helpers | ForEach-Object { Write-Host "  $_" }
  Write-Host "`n===== 平台超管角色守卫 ====="
  $guards | ForEach-Object { Write-Host "  $_" }

  function Read-Stat {
    param([string]$Name)
    foreach ($line in $stats) {
      if ($line -match "^$Name\|(.+)$") { return $Matches[1].Trim() }
    }
    return $null
  }

  $results = @(
    @{ name = '保留表数量'; actual = [int](Read-Stat 'tables'); min = 80 },
    @{ name = '策略数量'; actual = [int](Read-Stat 'policies'); min = 200 },
    @{ name = '函数数量'; actual = [int](Read-Stat 'functions'); min = 200 },
    @{ name = '启用 RLS 的表'; actual = [int](Read-Stat 'rls_tables'); min = 85 },
    @{ name = '触发器数量'; actual = [int](Read-Stat 'triggers'); min = 230 },
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
  # 权限保真度：anon 只应拿到源库显式授予的函数。期望值随源库 ACL 变化，取自
  # 「从远端目录重建授权」后的基线快照（见 supabase/baseline/README.md）。
  # 2026-10-16 重新生成基线时由 169 上调为 173：新增的 4 个显式 anon 授权函数是
  # dict_type_cascade_parent、mdm_transition_bom、publish_ai_prompt_template、
  # upsert_ai_feedback_resolution，没有任何函数失去 anon 授权。
  if ([int](Read-Stat 'anon_function_grants') -ne 173) { $failures += 'anon 函数授权数与源库显式清单不一致（期望 173）' }
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
  if (-not ($helpers | Where-Object { $_ -match '^current_is_super_without_jwt\|f' })) {
    $failures += 'current_is_super() 在缺少 JWT 时未返回 false'
  }
  if ($helpers | Where-Object { $_ -match '^role_page_grants\|0$' }) {
    $failures += '基线没有种入任何「角色→平台页面」授权'
  }

  foreach ($probe in @('guard_rename', 'guard_disable', 'guard_delete')) {
    if (-not ($guards | Where-Object { $_ -match "^$probe\|blocked$" })) {
      $failures += "平台超管角色守卫未拦住 $probe（期望 blocked）"
    }
  }
  if (-not ($guards | Where-Object { $_ -match '^guard_control_description\|allowed$' })) {
    $failures += '超管角色守卫误伤了描述修改（对照项未通过）'
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

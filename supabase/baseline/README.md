# 平台基线 SQL

一份**平台内核**的数据库基线：把已有项目的业务域剥离后，剩下让平台跑起来所需的表、视图、函数、
策略、索引与授权，外加能让平台开箱可用的种子数据。

```
platform-baseline.sql          平台内核 schema（约 90 张表 / 419 条策略 / 278 个函数）
platform-seed.sql              基线数据（内置租户、角色、平台菜单、字典、参数、编号场景）
mdm-master-data-menu.sql       增量补丁：已并入主平台的主数据四块菜单（物料 / 工程 / 销售 / 生产）
mdm-data-model-patch.sql       增量补丁：主数据四块所需的 mdm_* 表与函数
dict-cascade-relationship.sql  增量补丁：数据字典的计算关联函数（字典页加载失败时使用）
platform-baseline-report.json  生成报告：保留/丢弃清单、裁剪原因、种子行数
verify-baseline.ps1            在一次性 Postgres 容器里应用并断言基线
```

## 权限保真度

基线的 ACL 是从快照里逐对象复制的，并且针对 Supabase 托管默认权限做了两处对齐（都写在文件头）：

- **函数**：Supabase 会把新建函数开放给 `anon`，源库不存在这种授权 —— 文件在建任何对象之前用
  `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM anon, PUBLIC` 收回，
  再由各函数的 ACL 块精确授予应有权访问的角色。结果是 `anon` 恰好拿到源库显式授予的那 101 个函数。
- **序列**：身份列序列在源库里仅 owner 可用，同样通过默认权限收回业务角色授权。

一个 PostgreSQL 固有细节：函数上的 `PUBLIC` 执行权限是**内建默认**，`ALTER DEFAULT PRIVILEGES`
收不回，只有带 ACL 块（含 `REVOKE … FROM PUBLIC`）的函数才会被收回。因此源库中「没有 ACL 块」
的函数在基线与目标库里同样保留 `PUBLIC` 执行权限 —— 这是与源库一致的状态，报告里的
`expectedPublicExecutableFunctions` 记录了预期数量，校验脚本会据此断言。

## 它包含什么

- **平台内核**：`sys_*`（租户、用户、角色、菜单、字典、参数、编号、通知、附件、审计）、
  `wf_*` 工作流引擎、`ai_*` AI 基座，以及 `app_private` 租户/权限助手层。
- **保留代码依赖的跨域契约对象**：平台自己的集成读取与识别链路会用到的表，例如
  `mdm_organization`（组织）、`mdm_carrier` / `mdm_customer` / `mdm_employee` / `mdm_material`
  （FMS 与用户同步的读取契约）、`scm_receipt_target_*`（收发货目标工作区）、`tms_invoice`（发票 OCR 写回）。
  这些名字来自历史命名，但它们属于**平台自身的集成契约**，删掉会让保留代码在运行时报错。
- **被上述表外键/策略带进来的少量主数据表**（如 `mdm_material_type`、`mdm_warehouse_zone`）：
  它们是指向契约表的引用完整性依赖，报告里逐条列出了保留原因。

## 它不包含什么

- 业务域表、视图、策略、函数与历史备份表（`backup_*` / `codex_backup_*`）。
- 业务完整性触发器：触发器逻辑引用已丢弃业务表的，随业务域一起移除（报告 `prunedTriggers`）。
- 真实用户、审计日志、通知记录、AI 会话与消息、字段权限授权、业务数据。
- Storage 桶与对象（`supabase` 备份/恢复流程负责，或按需新建）。
- FMS 等业务子模块自己的业务表与业务数据：接入模块时需要用模块自己的 SQL 或快照补齐。

## 应用步骤

> 当前绑定项目 xmgl（ref `trthbpyqubyjtkzmcewy`）已应用本基线并逐项核对；下面是在新项目上复现的步骤。

在**全新的空项目**上依次执行：

```powershell
# 1. 平台内核
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/baseline/platform-baseline.sql

# 2. 基线数据
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/baseline/platform-seed.sql
```

也可以直接粘贴到 Supabase 控制台的 SQL 编辑器（两个文件都不依赖 `psql` 专有语法，
`platform-seed.sql` 全为 `INSERT` 语句）。

### 已有项目：补主数据四块菜单

主数据（物料 / 工程 / 销售 / 生产）已作为**平台自身功能**并入 `src/views/mdm/**`，菜单在
`platform-seed.sql` 里以 `app_code = platform` 出现，因此全新项目执行上面的两步即可。

已经建好库的项目（例如当前绑定的 xmgl）需要单独补一次菜单与数据模型：

```powershell
# 菜单、按钮与角色授权
supabase db query --linked --file supabase/baseline/mdm-master-data-menu.sql
# 数据模型：mdm_* 表、外键、策略、触发器与 mdm_* 函数
supabase db query --linked --file supabase/baseline/mdm-data-model-patch.sql
```

`mdm-data-model-patch.sql` 的说明：

- 内容：签名中列出的 mdm_* 表（含序列、约束、外键、索引、RLS 策略、触发器、授权），以及迁移
  代码与表定义依赖而目标库缺失的 mdm_* 函数；对象定义从 `platform-baseline.sql` 中原样抽取。
- 原因：主数据已作为平台功能并入 `src/views/mdm/**`，生成器把 `mdm_` 前缀视为平台核心
  （见 `PROFILES.platform.corePrefixes`），因此全新项目不再需要本文件。
- 边界：引用未并入应用（如 VMS 的 `vehicle_type_profile`）的外键会跳过，并在文件末尾以注释列出，
  不会把其它应用的模型一起带进来。
- 幂等：整段包在事务里，块内均为 IF NOT EXISTS / DROP IF EXISTS / CREATE OR REPLACE，可重复执行。

### 数据字典页打不开时

字典页依赖一条 PostgREST **计算关联**：`cascade_parent_type:dict_type_cascade_parent(...)`。
它不是外键关系，而是「以 `sys_dict_type` 行类型为参数、返回该表集合」的函数；缺失时整页报
「字典目录加载失败」，网络面板可见 `PGRST200 ... 'sys_dict_type' and 'dict_type_cascade_parent'`。

```powershell
supabase db query --linked --file supabase/baseline/dict-cascade-relationship.sql
```

生成器已补上「随已保留表的行类型函数一起保留」的规则，因此全新项目不再需要这个补丁。

- 内容：根目录「主数据」+ 物料 / 工程 / 销售 / 生产四个分组、23 个页面菜单、178 个按钮，
  复用旧库的菜单 id 与权限码（`Mdm*`），因此页面里的 `Mdm*` 权限判断无需改动。
- 幂等：菜单按主键 `id` 去重并更新描述字段，授权按 `(role_id, menu_id)` 唯一键去重，可重复执行。
- 授权：默认授予内置角色 `R_SUPER`（超级管理员）与 `R_ADMIN`（管理员）；其他角色请在
  「系统管理 / 角色管理」里按需分配。
- 执行身份：请以项目所有者身份执行（SQL 编辑器、`service_role` 或平台超级管理员）。
  `sys_role_menu` 上的 `trg_apply_current_tenant_id` 触发器会用会话租户覆盖显式 `tenant_id`，
  普通租户用户执行会把授权落到自己的租户里。

首个超级管理员需要自己创建（基线不含任何账号）：

1. 通过前端注册或用 `register-and-sync-user` 创建 Auth 用户；
2. 在 SQL 编辑器里把该用户提升到平台租户并授予超级管理员角色：

```sql
-- 用实际值替换 <user_id>、<tenant_code>
select app_private.platform_tenant_id() as platform_tenant_id;   -- 平台租户 id

update public.sys_user
   set tenant_id = app_private.platform_tenant_id(),
       user_type = '1',
       status = '1'
 where id = '<user_id>';

insert into public.sys_user_tenant (user_id, tenant_id, is_default)
select id, app_private.platform_tenant_id(), true from public.sys_user where id = '<user_id>'
on conflict do nothing;

insert into public.sys_role_menu (role_id, menu_id, permission, create_by, update_by)
select r.id, m.id, '{}', 'baseline', 'baseline'
  from public.sys_role r
  join public.sys_menu m on m.app_code = 'platform'
 where r.role_code = 'R_SUPER'
   and r.tenant_id = app_private.platform_tenant_id()
on conflict do nothing;
```

## 参数设置数据迁移（2026-10-08）

已从源项目 `nvzlwcutsqptngyqfzqs` 的 `public.sys_param` 迁移 10 条记录到当前项目 `trthbpyqubyjtkzmcewy`。参数记录统一归属当前 `vms` 租户（`f0c0d42a-300b-4958-ab5e-7da8cf823a67`）；`website.config` 中的图片和资源 URL 按用户选择保留源项目 Storage 地址。

当前项目原本缺少注册公共租户，因此同步创建 `public-register` 租户（`6675a0d6-3ff6-4ab7-bb09-232d85ae96ad`）及启用的 `R_REGISTER` / `default_register` 角色（`8bb744ab-c38e-436b-bafe-1cde73be0b7c`），并将 `registration.default_role_id` 的 `param_value` 与 `default_value` 映射到该角色。迁移前在事务中验证了租户、角色、10 条参数、租户归属和注册角色约束，回滚后正式提交；提交后再次核对参数键集合、租户归属及注册角色引用。

## 验证

```powershell
powershell -File supabase/baseline/verify-baseline.ps1            # 用一次性容器校验
powershell -File supabase/baseline/verify-baseline.ps1 -KeepContainer   # 保留容器排查
```

脚本会用 Supabase 官方 Postgres 镜像起一个临时库，补上最小的托管对象桩
（`auth.users`、`auth.jwt()`、`supabase_realtime` 发布），应用基线 + 种子，然后断言：

- 对象数量：表 ≥ 80、RLS 表 ≥ 85、策略 ≥ 380、函数 ≥ 200、触发器 ≥ 230；
- 种子数据：内置租户 2、内置角色 3、平台菜单 ≥ 90、授权 ≥ 100、字典类型 ≥ 80、参数 10；
- 平台助手：`platform_tenant_id()`、`default_register_tenant_id()`、`current_is_super()` 行为正确；
- 安全模型：`sys_tenant` / `sys_user` 有策略，`anon`/`public` 没有多余的函数执行授权；
- 中文写入：字典标签的中文能正确落库（防编码回归）；
- 无业务表残留（文档化的契约表除外）；
- 权限保真度：anon 的函数授权恰好 101 个、PUBLIC 可执行函数数等于报告里的预期值、序列不授予业务角色。

**已验证**：基线在 `public.ecr.aws/supabase/postgres:17.11.0.002` 上可完整应用并自洽。
端到端（登录、菜单装配、RPC 调用）仍需在真实 Supabase 项目上验证。

## 重新生成

```powershell
pnpm baseline:platform --backup supabase/backups/<时间戳>
```

脚本从快照的 `database/schema.sql` 与 `database/data.sql` 重新抽取，判据写在
`scripts/build-platform-baseline.ts` 顶部（保留前缀、契约对象清单、数据库托管 schema、
业务种子过滤器等）。快照本身用 `supabase/backup-supabase.ps1` 生成。

生成过程中会做这些自动裁剪，并在报告的 `prunedTriggers` / `prunedFunctions` /
`prunedBusinessFunctions` / `prunedAclBlocks` 中逐条给出原因：

| 阶段 | 判据 |
| --- | --- |
| 表/视图 | 平台前缀 `sys_`/`wf_`/`ai_` + 代码实际读写的表 + 外键/策略/视图闭包 |
| 函数 | 代码调用的 RPC、触发器函数、策略依赖，及其调用链 |
| 函数签名 | 返回/参数类型指向已丢弃对象 → 无法创建，整块移除 |
| 触发器 | 逻辑（含调用链）引用已丢弃关系、或调用链上函数缺失 → 移除 |
| 编号规则初始化 | 插入的规则键没有对应场景（源库同样会失败）→ 移除 |
| ACL / 注释 | 对象已被移除 → 同步移除 |

种子数据的过滤规则（见 `seedPlans`）：只取内置租户、平台菜单、平台字典、平台参数、
平台 AI 功能配置，以及被保留 SQL 引用到的编号场景。所有 `create_by` / `update_by` 中的
邮箱与负责人字段会被清洗为占位值或置空。

## 业务模块交付物

模块的库结构不由平台基线承担：每个模块产生自己的交付物，叠加在平台基线之上执行。
当前仓库自带 HR 模块的交付物（`supabase/modules/hr/`）：

| 文件 | 内容 |
| --- | --- |
| `hr-schema.sql` | HR 领域 schema：86 张 `hr_*` 表、7 个视图、263 个函数、326 条策略、193 个触发器，以及它们依赖的组织/岗位/职级等主数据表 |
| `hr-data.sql` | HR 数据：HR 菜单与按钮（app_code=hr）、指向这些菜单的角色授权、HR 字典类型与字典项 |
| `hr-report.json` | 保留/裁剪清单与原因 |

生成方式：

```powershell
pnpm exec tsx scripts/build-platform-baseline.ts --backup supabase/backups/<时间戳> --profile hr --out supabase/modules/hr
```

应用顺序（叠加执行，全部幂等）：

```powershell
supabase db query --linked --file supabase/baseline/platform-baseline.sql
supabase db query --linked --file supabase/baseline/platform-seed.sql
supabase db query --linked --file supabase/modules/hr/hr-schema.sql
supabase db query --linked --file supabase/modules/hr/hr-data.sql
```

幂等性约定：索引补 `IF NOT EXISTS`、策略先 `DROP POLICY IF EXISTS`、约束用
`DO $$ ... IF NOT EXISTS (pg_constraint)` 包裹、身份列的 `ALTER TABLE ... ADD GENERATED`
用 `pg_attribute.attidentity` 判断包裹、数据行用 `on conflict do nothing`，
因此平台基线与模块交付物都可以在已建库的项目上反复重放。新增模块时按同样方式扩一份 profile
（见 `scripts/build-platform-baseline.ts` 顶部的 `PROFILES`）。

## 已知取舍

- **保留的跨域契约表**（`mdm_*`、`scm_*`、`tms_invoice`）与它们的少量外键依赖表仍在基线内，
  这是为了让保留代码可用；如果派生项目不要这些能力，需要在
  `scripts/build-platform-baseline.ts` 的 `CONTRACT_TABLES` 中移除并同步删掉平台侧的集成代码。
- **业务完整性触发器被移除**：例如 `tms_invoice` 上的校验触发器引用了业务表，随业务域一起去掉；
  接入对应模块时应由模块自己的 SQL 提供。
- **字段权限目录、通知渠道配置、AI 运行数据不随基线导出**：它们在「字段权限」「通知提醒」
  「AI 配置中心」页面或模块 SQL 里按需创建。
- **真实个人邮箱已被脱敏**：函数体、注释、默认值里的邮箱字面量统一写为
  `platform-owner@example.com`，派生项目接手后要换成自己的平台超管账号邮箱；
  种子行的 `create_by` / `update_by` / 负责人字段同样被清洗或置空。
- **编号场景是业务场景**：平台内所有编号规则都挂在业务单据上，因此基线只保留被保留 SQL 用到的那
  41 条场景；派生项目新增业务单据时按 `sys_document_number_scene` 的既有格式登记。
- **`tms_*` / `smis_*` 等历史命名**：平台页面与 Edge Function 仍在调用这些名字的 RPC
  （如 `tms_save_geofence_config`、`smis_*` 系列）。改名属于数据库契约变更，需要连同
  `src/api/**` 与 Edge Function 一起改。

# 平台基线 SQL

一份**平台内核**的数据库基线：把已有项目的业务域剥离后，剩下让平台跑起来所需的表、视图、函数、
策略、索引与授权，外加能让平台开箱可用的种子数据。

```
platform-baseline.sql          平台内核 schema（约 90 张表 / 419 条策略 / 278 个函数）
platform-seed.sql              基线数据（内置角色、平台菜单、字典、参数、编号场景）
mdm-master-data-menu.sql       增量补丁：已并入主平台的主数据四块菜单（物料 / 工程 / 销售 / 生产）
mdm-data-model-patch.sql       增量补丁：主数据四块所需的 mdm_* 表与函数
dict-cascade-relationship.sql  增量补丁：数据字典的计算关联函数（字典页加载失败时使用）
document-number-counter-patch.sql  增量补丁：编号流水计数器的唯一索引（自动编号新增报 42P10 时使用）
platform-baseline-report.json  生成报告：保留/丢弃清单、裁剪原因、种子行数
verify-baseline.ps1            在一次性 Postgres 容器里应用并断言基线
```

## 权限保真度

基线的 ACL 是从快照里逐对象复制的，并且针对 Supabase 托管默认权限做了两处对齐（都写在文件头）：

- **函数**：Supabase 会把新建函数开放给 `anon`，源库不存在这种授权 —— 文件在建任何对象之前用
  `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM anon, PUBLIC` 收回，
  再由各函数的 ACL 块精确授予应有权访问的角色。结果是 `anon` 恰好拿到源库显式授予的那 169 个函数。
- **序列**：身份列序列在源库里仅 owner 可用，同样通过默认权限收回业务角色授权。

一个 PostgreSQL 固有细节：函数上的 `PUBLIC` 执行权限是**内建默认**，`ALTER DEFAULT PRIVILEGES`
收不回，只有带 ACL 块（含 `REVOKE … FROM PUBLIC`）的函数才会被收回。因此源库中「没有 ACL 块」
的函数在基线与目标库里同样保留 `PUBLIC` 执行权限 —— 这是与源库一致的状态，报告里的
`expectedPublicExecutableFunctions` 记录了预期数量，校验脚本会据此断言。

## 它包含什么

- **平台内核**：`sys_*`（用户、角色、菜单、字典、参数、编号、通知、附件、审计）、
  `wf_*` 工作流引擎、`ai_*` AI 基座，以及 `app_private` 权限助手层。
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

### 数据字典页「没有数据」（空目录而非报错）

症状与上面的加载失败不同：左侧目录面板显示空状态「暂无字典目录」，页脚是「0 个目录 · 0 个类型」，
页头计数为 0，但没有任何错误提示 —— 说明请求成功、只是返回了 0 行。此时问题在**读策略**或**数据缺失**，
与计算关联无关。

排查顺序（全程只读）：

```sql
-- 1) 数据是否存在
select (select count(*) from public.sys_dict_type) as dict_type_rows,
       (select count(*) from public.sys_dictionary) as dict_item_rows;

-- 2) 以真实登录用户身份看可见性（把 sub 换成 sys_user.auth_user_id）
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<auth_user_id>","role":"authenticated"}';
select app_private.is_platform_super() as is_super,
       (select count(*) from public.sys_dict_type) as dict_type_visible,
       (select count(*) from public.sys_dictionary) as dict_item_visible;
rollback;
```

`is_platform_super()` 的判据是「当前用户处于启用状态，且其 `sys_user.user_roles` 含有启用中的 `R_SUPER` 角色」。
所以一旦 `sys_dict_type` / `sys_dictionary` 的 SELECT 策略被写成 `is_platform_super()`，
字典页和所有字典下拉对谁都读不到数据。

修复：把两条读策略恢复成基线定义（`authenticated` 全量可读，与 `sys_menu_select_global` 一致），
写入策略保持平台超管专属不变。

```sql
begin;
drop policy if exists "sys_dict_type_select_global" on public.sys_dict_type;
create policy "sys_dict_type_select_global" on public.sys_dict_type for select to authenticated using (true);
drop policy if exists "sys_dictionary_select_global" on public.sys_dictionary;
create policy "sys_dictionary_select_global" on public.sys_dictionary for select to authenticated using (true);
commit;
```

回滚（恢复被收紧前的定义）：

```sql
begin;
drop policy if exists "sys_dict_type_select_global" on public.sys_dict_type;
create policy "sys_dict_type_select_global" on public.sys_dict_type for select to authenticated using (app_private.is_platform_super());
drop policy if exists "sys_dictionary_select_global" on public.sys_dictionary;
create policy "sys_dictionary_select_global" on public.sys_dictionary for select to authenticated using (app_private.is_platform_super());
commit;
```

已执行的验证（2026-10-09，项目 `trthbpyqubyjtkzmcewy` / xmgl）：修复前以真实登录账号身份（`authenticated`，
`is_platform_super() = false`）读到 0 行；事务内验证与正式执行后读到 `sys_dict_type` 307 行（63 目录 + 244 类型）、
`sys_dictionary` 300 行、10 个根目录，`anon` 仍为 0 行；`supabase db advisors` 无新增告警；
运行中的字典页由「0 个目录 · 0 个类型」变为「63 个目录 · 244 个类型」并渲染出根节点。

注意：字典的写入（`insert` / `update` / `delete`）仍要求平台超管。字典维护需要先按「首个超级管理员
需要自己创建」一节把库内账号配置成平台超管，或像 `sys_menu_delegate_*` 那样由复核过的委派策略授权，
不要通过放宽写入策略来解决。

- 内容：根目录「主数据」+ 物料 / 工程 / 销售 / 生产四个分组、23 个页面菜单、178 个按钮，
  复用旧库的菜单 id 与权限码（`Mdm*`），因此页面里的 `Mdm*` 权限判断无需改动。
- 幂等：菜单按主键 `id` 去重并更新描述字段，授权按 `(role_id, menu_id)` 唯一键去重，可重复执行。
- 授权：默认授予内置角色 `R_SUPER`（超级管理员）与 `R_ADMIN`（管理员）；其他角色请在
  「系统管理 / 角色管理」里按需分配。
- 执行身份：请以项目所有者身份执行（SQL 编辑器、`service_role` 或平台超级管理员）。

首个超级管理员需要自己创建（基线不含任何账号）：

1. 通过前端注册或用 `register-and-sync-user` 创建 Auth 用户；
2. 在 SQL 编辑器里启用该用户并授予内置超级管理员角色：

```sql
-- 用实际 <auth_user_id> 替换（对应 auth.users.id 与 sys_user.auth_user_id）

-- 1) 确认内置超级管理员角色存在且启用：应返回 role_code = 'R_SUPER' 且 enabled = true
select id, role_code, enabled from public.sys_role where role_code = 'R_SUPER';

-- 2) 启用该用户，并把 R_SUPER 并入其角色数组（可重复执行）
update public.sys_user
   set status = '1',
       user_roles = case
         when 'R_SUPER' = any(coalesce(user_roles, array[]::text[])) then user_roles
         else coalesce(user_roles, array[]::text[]) || 'R_SUPER'
       end
 where auth_user_id = '<auth_user_id>';
```

`is_platform_super()` 只依据 `sys_user.status = '1'`、`sys_user.user_roles` 含 `'R_SUPER'`，
以及 `sys_role` 中存在 `role_code = 'R_SUPER'` 且 `enabled is true` 判定，授完角色即生效。
可在 SQL 编辑器里这样复核（把 `sub` 换成该用户的 `auth_user_id`）：

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<auth_user_id>","role":"authenticated"}';
select app_private.is_platform_super();   -- 期望 true
rollback;
```

### 带自动编号的业务表新增报 42P10

症状：任何依赖自动编号的新增都失败，网络面板可见
`ERROR 42P10: there is no unique or exclusion constraint matching the ON CONFLICT specification`，
上下文指向 `app_private.next_document_number()` 里的
`insert into sys_document_number_counter … on conflict (rule_id, rule_version, period_key)`。
典型入口是「岗位管理 / 新增岗位」「员工档案 / 新增员工」以及主数据的新增编码。

原因：单组织改造去掉了多组织维度（`sys_document_number_counter` 已无 `tenant_id`），
连同该维度删除的唯一约束 `sys_document_number_counter_scope_uk`
（`UNIQUE (rule_id, tenant_id, rule_version, period_key)`）没有用去掉 `tenant_id` 的等价唯一索引补回来，
表上只剩同列的普通索引 `idx_document_number_counter_rule`，于是 `ON CONFLICT` 推断不出唯一索引，
语句在规划阶段即报错 —— 与计数器里有没有数据行无关。

```powershell
supabase db query --linked --file supabase/baseline/document-number-counter-patch.sql
```

- 内容：补一条与 `ON CONFLICT` 目标一致的唯一索引
  `sys_document_number_counter_rule_period_uk (rule_id, rule_version, period_key)`。
- 前提：`period_key` 由 `app_private.document_number_period_key()` 生成，只可能是 `'YYYY'`、`'YYYYMM'`、
  `'YYYYMMDD'` 或空串，不会为 NULL，所以不需要 `NULLS NOT DISTINCT`。
- 影响面：插入前触发器 `document_number_*` 调用同一函数的 10 张表 —— `mdm_cargo`、`mdm_carrier`、
  `mdm_customer`、`mdm_employee`、`mdm_part`、`mdm_part_category`、`mdm_position`、`mdm_station`、
  `mdm_vehicle`、`tms_invoice`。
- 幂等：`create unique index if not exists`；若目标库已存在重复计数行，本语句会直接报错而不是静默跳过，
  需要先人工核对 `sys_document_number_counter` 的重复分组。
- 生成侧待办：`platform-baseline.sql` 目前同样只有普通索引，重新生成基线时应让该唯一索引进入产物，
  否则派生项目会重现同一故障。

已执行的验证（2026-10-12，项目 `trthbpyqubyjtkzmcewy` / xmgl）：补索引前的回滚事务里
`select app_private.next_document_number('hr.position')` 复现 42P10；补索引后同一函数返回
`POS202610001`、`master.cargo` 返回 `HW202610-0001`，同一规则连续取号 `…002`、`…003` 时计数器仍是
1 行（`current_value` 递增到 3，不新增重复行），编号触发器开启时插入 `mdm_position` 成功并自动获得
`position_code`（补索引前该插入直接失败）；计数器重复分组 0 个。

### 禁止为当前账号分配角色（2026-10-13 起并入基线）

背景：`sys_user` 的更新策略只允许 `authenticated` 用户改**自己**那一行（`canonical_owner_update_v2`：
`has_table_permission('sys_user','Edit')` 且 `auth_user_id = auth.uid()`），因此登录用户原本可以顺手把自己的
`user_roles` 改成更高权限；给别的账号分配角色则走 Edge Function（service key）而不经过 RLS。

守卫分三层，基线里只承担数据库这一层：

- **数据库**：`public.trg_guard_sys_user_authorization_fields()`（`sys_user` 的 before update 触发器）在
  `v_roles_changed` 分支里先判 `v_is_self`，命中即 `raise exception '不能为当前账号分配角色'`，早于
  `System:User:AssignRole` 权限校验。`service_role` 仍按既有逻辑提前返回，因此**不受**这层约束。
- **Edge Function**：`supabase/functions/sync-user/index.ts` 在 `assign_roles` 分支前先查目标账号，
  目标不存在返回 404、目标等于调用者返回 403 —— 因为 service key 路径会绕过上面的触发器。
- **前端**：`src/views/system/user/index.vue` 对当前账号隐藏「分配角色」入口，自身判定同时比对
  `id` / `authUserId` / 邮箱。

已建库的项目补这一层（幂等，`create or replace function` 保留属主与授权）：

```powershell
# 把基线里的整段函数定义重新执行一次
supabase db query --linked --file supabase/baseline/platform-baseline.sql   # 全量重放，基线整体幂等
```

只补这一个函数时，从 `platform-baseline.sql` 里取出 `trg_guard_sys_user_authorization_fields` 的完整定义
单独执行即可；`supabase/modules/hr/hr-schema.sql` 中也有一份逐字一致的副本（HR 交付物），两者不要改歪。

已执行的验证（2026-10-13，项目 `trthbpyqubyjtkzmcewy` / xmgl）：

- 应用前（回滚事务内）：以平台超管自身身份（`authenticated` + `request.jwt.claims.sub` = 该账号
  `auth_user_id`）修改自己的 `user_roles` **成功**（1 行），确认守卫确实缺失。
- 应用：以基线定义 `create or replace`，同一事务内断言自助角色修改抛
  `不能为当前账号分配角色` 才提交，断言失败则整段回滚。
- 应用后（回滚事务内三条断言）：自助角色修改被拦截（`不能为当前账号分配角色`）；自助资料修改仍放行
  （1 行，确认未回归）；`service_role` 路径不受影响（1 行，说明 Edge Function 那层不可省）。
- 改后线上 `pg_get_functiondef` 与基线定义逐字一致（61 行、0 差异）；`supabase db advisors`
  1189 条告警全部为既有 WARN，无一条涉及该函数。
- Edge Function `sync-user`（版本 3，`verify_jwt` 保持 `true`）：部署前下载线上源码比对，差异仅为
  `assign_roles` 自助拦截块；部署后重新下载与本地逐字一致。以发布键调用该函数返回
  `403 缺少权限：System:User:AssignRole`，确认部署后代码正常执行（自助拦截块在权限校验之后，
  其 403 路径需要真实登录账号才能端到端验证）。

### 平台超管角色身份守卫（2026-10-13 起并入基线）

背景：`app_private.is_platform_super()` 只认「`sys_user.user_roles` 含 `R_SUPER`，且 `sys_role` 里该角色
`enabled is true`」，所以 `sys_role` 中 `role_code = 'R_SUPER'` 那一行的编码、启用状态与存在性就是平台超管的
全部凭据。此前 `app_private.enforce_system_role_rules()` 虽然存在，但**从未挂任何触发器**，旧分支的条件在
`sys_role_builtin_type_check` 约束下又永远不成立，等于角色表这层没有守卫：`authenticated` 的角色写入
（由 `canonical_platform_super_write` 策略放行）可以直接把超管角色改名、停用或删除，让全体账号失去平台超管
能力，且只能靠 SQL 修复。判据用角色编码而不是 `builtin_type`——后者在平台数据里始终为 `NULL`。

守卫分两层：

- **数据库**：`app_private.enforce_system_role_rules()` 补齐超管分支，并挂上
  `trg_enforce_system_role_rules`（`sys_role` 的 `before update or delete` 触发器）：改名抛
  `平台超管角色编码不可修改，请改用其他角色编码`、停用抛 `平台超管角色不可停用`、删除抛
  `平台超管角色不可删除`；其余列（名称 / 描述 / 适用组织）不受影响。函数保持 **security invoker**：
  `security definer` 下 `current_user` 恒等于属主，`service_role` 白名单会恒真而使守卫失效。
  `postgres` 与 `service_role`（含 JWT `role = service_role`）按既有约定提前返回，维护通道不受这层约束。
- **前端**：角色页按角色编码识别内置超管角色（`src/views/system/role/modules/role-builtin.ts`），不再为该行
  提供「配置菜单权限 / 编辑 / 删除」入口，与 `set_role_menus` 对该角色的拒绝保持一致。

已建库的项目补这一层（幂等，`create or replace function` 保留属主与授权）：

```powershell
# 从 platform-baseline.sql 取出该函数与触发器定义单独执行，或全量重放基线
supabase db query --linked --file supabase/baseline/platform-baseline.sql
```

`supabase/modules/hr/hr-schema.sql` 中的函数副本与平台基线逐字一致；该交付物按既有约定只保留领域触发器，
`sys_role` 的触发器仍只由平台基线提供。

已执行的验证（2026-10-13，项目 `trthbpyqubyjtkzmcewy` / xmgl）：

- 应用前（回滚事务内）：以平台超管身份（`authenticated` + `request.jwt.claims.sub` = 该账号 `auth_user_id`）
  对 `R_SUPER` 行改名 / 停用 / 删除**全部成功**（各 1 行），确认角色表这层守卫确实缺失。
- 应用：`create or replace function` + `create trigger` 与断言同事务执行，断言（停用必须抛
  `平台超管角色不可停用`）通过才提交，失败则整段回滚。
- 应用后（回滚事务内六条断言）：改名 / 停用 / 删除被拦截（消息如上）；改描述仍放行（1 行）、普通角色停用与
  改编码仍放行（各 1 行）、`service_role` 改编码仍放行（1 行），确认既未误伤也未封死维护通道。
- 改后线上 `pg_get_functiondef` 与 `platform-baseline.sql` 定义逐字一致；触发器为
  `BEFORE DELETE OR UPDATE ON public.sys_role FOR EACH ROW`；`supabase db advisors` 仍为 1189 条既有
  WARN，0 条涉及该函数或触发器。
- `supabase/baseline/verify-baseline.ps1` 新增守卫断言（先造一个平台超管身份，再验证改名 / 停用 / 删除被拦、
  改描述放行）：在干净 Postgres 容器里通过；临时注释掉基线中的触发器语句后同一断言失败，确认断言有效。

## 参数设置数据迁移（2026-10-08）

已从源项目 `nvzlwcutsqptngyqfzqs` 的 `public.sys_param` 迁移 10 条记录到当前项目
`trthbpyqubyjtkzmcewy`；`website.config` 中的图片和资源 URL 按用户选择保留源项目 Storage 地址。
注册默认角色 `R_REGISTER`（`builtin_type = default_register`）已配置为启用，
`registration.default_role_id` 的 `param_value` 与 `default_value` 均指向该角色。

## 验证

```powershell
powershell -File supabase/baseline/verify-baseline.ps1            # 用一次性容器校验
powershell -File supabase/baseline/verify-baseline.ps1 -KeepContainer   # 保留容器排查
```

脚本会用 Supabase 官方 Postgres 镜像起一个临时库，补上最小的托管对象桩
（`auth.users`、`auth.jwt()`、`supabase_realtime` 发布），应用基线 + 种子，然后断言：

- 对象数量：表 ≥ 80、RLS 表 ≥ 85、策略 ≥ 200、函数 ≥ 200、触发器 ≥ 230；
- 种子数据：内置角色 ≥ 3、平台菜单 ≥ 90、角色菜单授权 ≥ 100、字典类型 ≥ 80、字典项 ≥ 300、
  平台参数 ≥ 10、平台应用 ≥ 1；
- 平台助手：`current_is_super()` 在缺少 JWT 时返回 false；基线确实种入了「角色→平台页面」授权
  （脚本另输出 `sys_user` 策略数、`wf_definition` 列数等信息）；
- 中文写入：字典标签的中文能正确落库（防编码回归）；
- 无业务表残留（文档化的契约表除外，脚本按契约表清单计数）；
- 权限保真度：anon 的函数授权恰好 169 个、PUBLIC 可执行函数数等于报告里的预期值、序列不授予业务角色。

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

种子数据的过滤规则（见 `seedPlans`）：只取内置角色、平台菜单、平台字典、平台参数，
以及被保留 SQL 引用到的编号场景。所有 `create_by` / `update_by` 中的
邮箱与负责人字段会被清洗为占位值或置空。

## 业务模块交付物

模块的库结构不由平台基线承担：每个模块产生自己的交付物，叠加在平台基线之上执行。
当前仓库自带 HR 模块的交付物（`supabase/modules/hr/`）：

| 文件 | 内容 |
| --- | --- |
| `hr-schema.sql` | HR 领域 schema：86 张 `hr_*` 表、7 个视图、263 个函数、326 条策略、193 个触发器，以及它们依赖的组织/岗位/职级等主数据表 |
| `hr-data.sql` | HR 数据：HR 菜单与按钮（app_code=hr）、指向这些菜单的角色授权、HR 字典类型与字典项 |
| `hr-report.json` | 保留/裁剪清单与原因 |
| `hr-job-architecture-rpc-patch.sql` | 增量补丁：职务体系（职族 / 职级 / 标准职务）的 3 个列表与 3 个保存 RPC，页面报 `hr_list_job_profiles_secure` 404 时使用 |

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
supabase db query --linked --file supabase/modules/hr/hr-job-architecture-rpc-patch.sql
```

`hr-job-architecture-rpc-patch.sql` 的说明：

- 症状：打开「人事管理 / 职务体系」时报 `POST /rest/v1/rpc/hr_list_job_profiles_secure 404`，
  三个页签都取不到数据。
- 原因：页面与弹窗调用的 3 个列表 RPC、3 个保存 RPC 从未建过 —— 同域的
  `hr_list_job_architecture_options_secure` 与 `hr_delete_job_architecture_record_secure` 已存在，
  所以页面能打开、列表全挂。函数名取自 `modules/art-supabase-hr` 的 `src/api/modules/job-architecture.ts`。
- 内容：`app_private` 共享实现 2 个（列表分页查询、保存校验与写入）+ `public` 业务 RPC 6 个 + 显式授权。
  列表按页签校验 `Hr:JobFamily|Grade|JobProfile:View`，保存按新增或编辑校验对应 `Add` / `Edit`，
  与页面按钮权限和 `hr-data.sql` 种入的按钮菜单一致。
- 授权：内部实现不对 `public` / `anon` / `authenticated` 开放；6 个业务 RPC 只显式授予
  `authenticated` 与 `service_role`。
- 生成侧待办：重新生成 `hr-schema.sql` 后本补丁即为冗余，可随之删除。

已执行的验证（2026-10-12，项目 `trthbpyqubyjtkzmcewy` / xmgl）：应用前在回滚事务里以
`set local role authenticated` + 平台超管 JWT 身份跑了 39 项断言（列表结构、嵌套职族/职级对象、
引用计数、关键字与启用过滤、分页、新增/编辑、重复编码与停用引用等服务端校验、删除引用拦截、
无权限身份被拒）全部通过；应用后再跑一遍幂等重放无副作用；六个 RPC 经 PostgREST 均返回
`401 42501 permission denied for function …`（`anon` 边界生效）而不再是 404。

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

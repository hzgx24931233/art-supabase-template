# 从模板派生新项目

这份文档说明如何把 `art-supabase-pro` 平台模板变成一个可运行的新项目。按顺序执行即可；
需要业务改造（新增模块、改权限模型）时，再参考 `.agents/skills/` 下的项目约定技能。

---

## 0. 模板现状速览

| 维度 | 现状 |
| --- | --- |
| 前端 | Vue 3 + TypeScript + Element Plus + Vite，Art 组件库与数据中心、系统管理、工作流、AI 基座页面齐全 |
| 业务子应用 | 仅保留 FMS 财务模块（`modules/art-supabase-fms`，Git submodule）作为机制示例 |
| Edge Functions | 24 个：通用平台 9 + AI 基座 6 + FMS 相关 9 |
| 数据库 | 仓库内不含 schema/迁移；通过 `supabase/backup-*.ps1` / `restore-*.ps1` 交付 |
| 品牌与密钥 | 品牌为中性占位（`管理平台`）；Supabase 已绑定当前项目 xmgl（`.env` 与 `.mcp.json` 为真实值） |

---

## 1. 落地仓库与命名

1. 复制模板目录，或在 Git 托管上新建仓库后推送模板内容。
2. 平台包名 **保持 `art-supabase-pro`**：FMS 等业务子仓通过 `pnpm-workspace` override 与
   `art-supabase-pro` 依赖解析平台类型；改名需要同步修改每个业务子仓的依赖与
   `scripts/manage-modules.ts` 的 override 逻辑。
3. 子仓远程地址在 `.gitmodules` 中按需调整（当前只有 FMS）。

## 2. 配置环境变量

编辑 `.env`（随仓库提交，占位值）：

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY` | 是 | 新 Supabase 项目的地址与 publishable（anon）密钥 |
| `VITE_LOCK_ENCRYPT_KEY` | 是 | 锁屏加密密钥，换成自己的随机串 |
| `VITE_APP_CODE` | 否 | `platform`（平台宿主）或 `fms` |
| `VITE_BASE_URL` / `VITE_OUT_DIR` | 否 | 部署子路径与构建输出目录（默认 `/` 与 `dist`） |
| `VITE_AMAP_KEY` / `VITE_AMAP_SECURITY_JS_CODE` | 否 | 地址选择、电子围栏等能力需要 |

`.env.development` / `.env.production` 也保留为占位：需要后端代理时填 `VITE_API_PROXY_URL`。

## 3. 绑定 Supabase 项目

1. 在 Supabase 控制台新建空项目，记下 project ref。
2. 替换 `.mcp.json` 中的 `trthbpyqubyjtkzmcewy`（AI 编码会话的 MCP 作用域），并同步更新
   `AGENTS.md` 中同名占位与 `supabase/README*.md`。
3. 建库，二选一：
   - **平台基线（推荐）**：在空项目上依次执行 `supabase/baseline/platform-baseline.sql` 与
     `supabase/baseline/platform-seed.sql`，得到平台内核与内置租户/角色/菜单/字典；
     然后用 [supabase/baseline/README.md](../supabase/baseline/README.md) 里的引导 SQL 提升首个超级管理员。
   - **整库快照**：用 `supabase/README.zh-CN.md` 的恢复流程把一份快照恢复到新项目（含业务数据）。

> 平台页面依赖的数据库对象包括 `sys_*` 系统表、`app_private` 助手函数、组织数据，以及若干历史命名的
> RPC（例如 `tms_*`、`smis_*` 系列）。这些名字来自平台历史，属于现有数据库契约；
> 如果派生项目要重命名，需同时改数据库函数、`src/api/**` 调用点与 Edge Function。

4. 部署 Edge Functions：

```powershell
supabase functions deploy <name> --project-ref trthbpyqubyjtkzmcewy --use-api
```

   `supabase/config.toml` 的 `[functions.*]` 段已经按保留清单写好，`verify_jwt` 默认 `true`；
   只有面向外部身份提供方（`oauth-provider-bridge`）或未登录用户（`check_user_status`、
   `login-with-phone`、`register-and-sync-user`）的入口才关闭。
   AI 能力需要在 Edge Function Secrets 中配置 `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL`。

5. 注册/登录相关：`register-and-sync-user` 的 `allowedOrigins` 里有一个
   `https://example.github.io` 占位，按自己的前端域名替换或删除。

## 4. 去品牌与站点信息

后台「系统管理 → 网站配置」可以在线覆盖站点名称、登录标题、SEO、页脚版权等；
代码里的出厂默认值集中在：

- `src/config/website-config-defaults.ts`（站点名、登录文案、SEO、版权、Turnstile key）
- `src/config/index.ts` 的 `systemInfo.name`、`index.html` 的 title/description
- `src/utils/sys/console.ts` 的开发横幅、`src/utils/file/index.ts` 导出文件作者
- `src/utils/constants/links.ts` 的仓库/文档/社区外链（留空即隐藏入口）
- `src/assets/images/common/logo.webp` 与 favicon

## 5. 删除或替换 FMS 示例模块

如果新项目不需要财务模块：

1. 删除 `.gitmodules` 中的 FMS 声明，并 `git rm -r --cached modules/art-supabase-fms`。
2. 移除 `scripts/hosted-module-dependencies.ts` 的 `@fms` 别名。
3. 移除 `src/config/application.ts` 的 `fms` 档案（`APPLICATION_CODES` 同步）。
4. 移除 `src/bootstrapHostedApplications.ts` 的注册块与 FMS 集成 glob。
5. 移除 `tsconfig.json` 的 `@fms/*` paths 与 include。
6. 清理依赖 FMS 的保留项：`src/router/business-paths.ts`、`src/utils/business-permission.ts`
   的路由前缀、`scripts/business-button-permission-catalog.ts` 的 Finance 目录项、
   `src/components/business/scm-receipt-target-workspace`（FMS 收货目标工作区）、
   FMS 调用的 Edge Functions 与 `_shared` 契约。
7. 删除 `src/views/workflow/modules/workflow-business-contracts.ts` 与
   `src/views/workflow/definition/modules/workflow-templates.ts` 中的 FMS 契约与模板。
8. `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm build` 复验。

## 6. 接入新的业务模块

模块机制共四处配置 + 一个子仓声明，缺一不可：

1. `.gitmodules` 增加子仓；
2. `scripts/hosted-module-dependencies.ts` 增加 `@<code>` 源码别名；
3. `src/config/application.ts` 增加应用档案（code/name/defaultPath/deploymentPath/port）；
4. `src/bootstrapHostedApplications.ts` 注册视图目录 glob；
5. `tsconfig.json` 增加 paths 与 include；
6. 需要 Tailwind 扫描模块样式时，在 `src/assets/styles/core/tailwind.css` 增加 `@source`；
7. 模块自身的 `vite.config.ts` 用 `scripts/module-vite-config.mjs` 收敛公共依赖；
8. 用 `pnpm modules:install <code>` / `pnpm modules:build <code>` 验证，最后 `pnpm build:all`。

模块页面通过数据库菜单驱动：在 `sys_menu` 中登记页面与按钮权限（命名约定
`<RouteName>:<Action>`），并在 `scripts/business-button-permission-catalog.ts` 登记按钮，
`pnpm permissions:audit` 会校验两边一致。

## 7. 数据库变更策略

本项目刻意**不保存迁移 SQL**：变更在备份与校验之后，通过项目级 Supabase MCP 直接执行，
再用 `supabase/backup-supabase.ps1` 生成新的快照。若团队希望改用迁移文件，
需要同时调整 `supabase/migrations/README.md`、`scripts/audit-database-security.ts`
与 `scripts/audit-business-permissions.ts` 中的版本边界假设。

## 8. 上线前检查

```powershell
pnpm check:fast        # ui/reuse/permissions 审计 + 类型 + lint + 单元测试
pnpm lint:stylelint
pnpm build             # 输出 dist/
pnpm bundle:check      # 首屏与分包体积预算
pnpm snapshot:check    # AI 项目快照与仓库事实一致
```

端到端测试需要真实 Supabase 项目，并先执行一次：

```powershell
$env:E2E_EMAIL = '<账号>'; $env:E2E_PASSWORD = '<密码>'
pnpm test:e2e:install
pnpm test:e2e:update   # 重新生成视觉基线（新建项目后必须执行一次）
pnpm test:e2e
```

容器部署见 `DOCKER.md`（`docker compose up -d --build`），记得把
`docker-compose.yml` / `Dockerfile` / `nginx.conf` 中已经是本项目（xmgl）的值，派生项目记得替换。

---

## 后续可选任务（本模板未完成）

- 业务子仓重命名/去品牌；`tms_*`、`smis_*` 等历史 RPC 与表名的统一改名。
- e2e 用例在真实项目上的视觉基线补录（`pnpm test:e2e:update`）。
- 如果希望模板自带更干净的业务命名：调整 `scripts/build-platform-baseline.ts` 的
  `CONTRACT_TABLES` 与平台侧集成代码，重新生成 `supabase/baseline/` 下的基线 SQL。

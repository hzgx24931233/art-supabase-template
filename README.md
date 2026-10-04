# art-supabase-pro · 平台模板

基于 **Vue 3 + TypeScript + Element Plus + Supabase** 的企业级中后台平台模板，用于派生新的业务项目。
它不只是一个展示表格和表单的 UI 模板：平台自带多租户、RBAC 与字段权限、动态菜单、工作流引擎、
数据字典、编号规则、AI 助手与 SQL 工作台，并按「平台宿主 + 业务子应用」的方式组织业务能力。

模板已经去除具体业务与品牌信息，只保留一个真实的业务子应用接入示例（FMS 财务模块）。

## 模板里保留了什么

- **身份与权限**：Supabase Auth 登录、多租户隔离、角色/菜单/按钮权限、字段级权限、平台超管租户切换。
- **平台治理**：动态菜单与路由装配、数据字典、系统参数、网站配置、编号规则、通知提醒、附件中心。
- **工作流引擎**：流程定义与版本、工作台、监控、分析、业务契约登记。
- **AI 基座**：AI 配置与 Prompt 版本、SQL 助手、运行诊断、项目助手、AI 运营中心。
- **数据中心**：Supabase AI 助手、SQL 控制台、字典管理、附件管理。
- **前端基线**：Art 组件库（表单/表格/对话框/抽屉/布局/反馈）、主题与暗色模式、国际化、示例与组件演示页。
- **模块化宿主机制**：hosted applications（应用档案 + 视图 glob + 子仓别名），可按需接入业务子应用。
- **工程化**：ESLint/Prettier/Stylelint、单元测试（node:test）、Playwright e2e、质量审计脚本、
  Supabase 备份/恢复/分发 PowerShell 工具链。

## 模板去掉了什么

原产品的运输、车辆、人力、主数据、安全、仓储、生产、供应链等业务模块与对应 Edge Function 已移除；
品牌名、项目 ref、Supabase 密钥、地图密钥、演示账号等部署专属信息已改为占位值。
数据库基线不在本仓库内：数据库通过备份/恢复流程交付（见 `supabase/README.md`）。

## 快速开始

```bash
pnpm install        # 安装依赖
```

`.env` 已指向当前项目 **xmgl**（`https://trthbpyqubyjtkzmcewy.supabase.co`），数据库已应用平台基线。
派生新项目时替换下面这些值：

| 变量 | 说明 |
| --- | --- |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY` | Supabase 项目地址与 publishable（客户端）密钥 |
| `VITE_LOCK_ENCRYPT_KEY` | 锁屏加密密钥，换成自己的随机串 |
| `VITE_APP_CODE` | 运行的应用：`platform`（平台宿主）或 `fms` |
| `VITE_AMAP_KEY` / `VITE_AMAP_SECURITY_JS_CODE` | 高德地图 Key，仅地址选择等能力需要 |

同步替换 `.mcp.json` 的 project ref（Agent 工具作用域）与 `docker-compose.yml` / `Dockerfile` /
`nginx.conf` 里的 Supabase 地址。

```bash
pnpm dev            # 启动开发服务器
pnpm typecheck      # 类型检查
pnpm lint           # 代码检查
pnpm test:unit      # 单元测试
pnpm build          # 生产构建（输出 dist/）
pnpm check:fast     # 审计 + 类型 + 检查 + 单元测试
```

## 目录结构

```
src/
  api/            接口层（providers/supabase 为默认 provider）
  components/     core 组件库 + business 业务组件
  config/         应用档案、站点配置、模块配置
  hooks/          composables
  locales/        中英文文案
  router/         静态路由 + 动态菜单装配 + 守卫
  store/          Pinia stores
  utils/          工具与通用能力
  views/          平台页面（system / workflow / data-center / dashboard / auth / examples ...）
modules/          业务子应用（Git submodule，当前仅 art-supabase-fms）
supabase/         Edge Functions、config.toml、备份/恢复脚本
scripts/          构建、审计、模块管理工具
tests/            单元测试与 Playwright e2e
```

## 业务子应用（FMS）与新增模块

FMS 作为模块化宿主机制的示例保留，同时也是机制可用的活样本：

```bash
pnpm modules:install fms    # 初始化子仓并安装依赖
pnpm modules:build fms      # 构建子仓
pnpm modules:status         # 查看子仓状态
pnpm build:all              # 构建全部子仓 + 平台
```

接入新业务模块需要同步四处：`scripts/hosted-module-dependencies.ts`、`src/bootstrapHostedApplications.ts`、
`src/config/application.ts`、`tsconfig.json`（以及 `.gitmodules` 的子仓声明）。
完整的派生步骤见 [docs-template/START-HERE.md](docs-template/START-HERE.md)。

## 数据库

本仓库不保存迁移 SQL。新项目的库结构有两种来源：

- **平台基线（推荐）**：`supabase/baseline/platform-baseline.sql` + `platform-seed.sql`，
  在空项目上直接执行即可得到平台内核（租户、权限、菜单、字典、工作流、AI 基座）与开箱可用的基础数据；
  生成与校验见 [supabase/baseline/README.md](supabase/baseline/README.md)。
- **整库快照**：`supabase/backup-supabase.ps1 -ProjectRef <ref>` 导出远端项目快照，
  `supabase/restore-supabase.ps1` 恢复到新项目（含业务数据）。

```bash
pnpm baseline:platform --backup supabase/backups/<时间戳>   # 从快照重新生成平台基线
```

详见 [supabase/README.zh-CN.md](supabase/README.zh-CN.md)。

## 端到端测试前置条件

Playwright 用例需要一个可访问的 Supabase 项目，并通过环境变量提供测试账号：

```bash
export E2E_EMAIL=...
export E2E_PASSWORD=...
pnpm test:e2e:install       # 安装浏览器
pnpm test:e2e:update        # 建库后重新生成视觉基线
```

## 许可

ISC（见 `LICENSE`）。

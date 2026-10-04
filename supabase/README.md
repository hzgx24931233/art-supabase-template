# Supabase source of truth

中文的远端备份、只读分发、本地恢复与跨项目恢复操作说明见 [README.zh-CN.md](README.zh-CN.md)。

这是本仓库唯一的 Supabase 目录，业务子仓（`modules/*`）不各自保存 Supabase 资产。
下文与脚本中的 `<your-project-ref>` 是派生项目要替换的位置；本仓库当前绑定项目 xmgl（ref `trthbpyqubyjtkzmcewy`）。

- `functions/` 保存经过评审、可直接部署的 Edge Function 源码。部署示例：
  `supabase functions deploy <name> --project-ref trthbpyqubyjtkzmcewy --use-api`。
- `migrations/` 不保存迁移 SQL。经过评审的生产 SQL 在完成备份与校验后，通过项目级 Supabase MCP 直接执行。
- `baseline/` 保存平台基线：`platform-baseline.sql` + `platform-seed.sql`，用于在空项目上快速得到
  平台内核结构。生成与校验方式见 [baseline/README.md](baseline/README.md)。
- `backup-supabase.ps1` 把一个远端项目导出为带时间戳、被 Git 忽略的备份目录；
  `package-supabase-backup.ps1` 打包以便校验下载；`restore-local-supabase.ps1` 恢复到隔离的本地栈；
  `restore-supabase.ps1` 恢复到新的远端项目。

两条建库路径：

| 目标 | 用哪个 |
| --- | --- |
| 只要平台内核（推荐给新项目） | `baseline/platform-baseline.sql` + `baseline/platform-seed.sql` |
| 连业务数据一起搬（迁移/复制现网） | 备份快照 + `restore-supabase.ps1` |

数据库结构、数据与迁移历史一起存放在备份目录里；导出不会在仓库中生成逐条迁移 SQL。

## Edge Function 清单

通用平台：`admin_reset_password`、`check_user_status`、`login-with-phone`、`register-and-sync-user`、
`sync-user`、`notification-dispatcher`、`oauth-provider-bridge`、`proxy-logs`、
`execute-sql-with-columns`。

AI 基座：`ai-provider-catalog`、`ai-sql-assistant`、`ai-run-diagnosis`、`ai-project-assistant`、
`ai-project-planner`、`ai-website-wordmark`。

FMS 财务模块调用：`ai-invoice-ocr`、`ai-invoice-compliance-auditor`、`ai-cash-voucher-ocr`、
`ai-bank-statement-batch-match`、`ai-waybill-cost-auditor`、`ai-waybill-expense-ocr`、
`ai-waybill-profit-analyst`、`ai-receivables-collection-advisor`。

新增函数时同步更新 `supabase/config.toml` 的 `[functions.*]` 段（`verify_jwt` 默认保持 `true`，
只有面向外部身份提供方或未登录用户的入口才关闭）。

## AI 项目助手与项目管理器

`ai-project-planner` 支撑 **系统管理 → AI 项目规划器**；`ai-project-assistant` 支撑数据中心里的
Supabase 项目助手。应用用户仍使用 Supabase JWT 认证，模型访问是服务端到服务端，走 OpenAI 兼容
Provider。在 Edge Function Secrets 中配置 `AI_API_KEY`、`AI_BASE_URL`、`AI_MODEL`（`OPENAI_*`
别名仍然兼容）。密钥不会写入浏览器或数据库。

代码有实质变更后刷新仓库事实快照，再部署经过评审的函数：

```powershell
pnpm snapshot:ai
supabase functions deploy ai-project-planner --project-ref trthbpyqubyjtkzmcewy --use-api
```

## 导出与导入 Supabase 项目

安装并登录 Supabase CLI，启动 Docker Desktop，然后在仓库根目录导出源项目：

```powershell
.\supabase\backup-supabase.ps1 -ProjectRef 'trthbpyqubyjtkzmcewy'
```

脚本会提示输入源数据库密码。产出是 `supabase/backups/<timestamp>/manifest.json`，以及数据库
转储、Storage 文件、已部署 Edge Functions 与项目元数据。该目录含真实数据，必须放在加密存储中，
且不要提交到 Git。它不会覆盖仓库里经过评审的 Function 源码。

恢复到**新的空项目**：

```powershell
.\supabase\restore-supabase.ps1 -BackupPath '.\supabase\backups\YYYYMMDD-HHMMSS' -TargetProjectRef '<new-project-ref>'
```

恢复脚本会校验 manifest 与文件哈希、二次确认目标 ref，并拒绝已有业务表的项目。它会一并恢复
数据库（含 Auth 用户与迁移历史）、Storage 对象、Realtime 发布成员以及已部署的 Edge Functions；
源仓库的项目链接不会被改动。加 `-VerifyBackupOnly` 可以在不连接任何项目的情况下校验备份。

只读分发：拥有者可以用 `publish-supabase-backup.ps1` 把打包后的备份上传到**独立分发项目里的私有
bucket**。打包过程会移除源端 Auth 密码哈希、会话、refresh token、MFA 数据、OAuth 流程数据、迁移
历史行以及仅拥有者可见的 managed-schema 快照，原始备份保持不变。只分享短期签名 URL 与 SHA-256。
接收方使用 `download-supabase-backup.ps1`、`restore-local-supabase.ps1`、`set-local-login.ps1`，
不需要源项目 token 或数据库密码。分发前请再检查业务数据与 Storage 文件中的其他敏感信息。
完整命令见 [README.zh-CN.md](README.zh-CN.md)。

Supabase 无法导出 Edge Function secret 的**值**，也无法导出仅存在于控制台的 Auth/OAuth、SMTP、
域名等设置，需要在新项目上重新配置。对 `auth`、`storage` 等托管 schema 的改动要先人工比对
`database/managed-schema-snapshot.sql`。若源项目使用 Vault 或加密列，需按 Supabase 官方流程先
迁移加密根密钥；自定义 `LOGIN` 角色密码、Function import map 与 `deno.json` 需要单独提供。
其他限制参见 [Supabase 备份恢复指南](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)。

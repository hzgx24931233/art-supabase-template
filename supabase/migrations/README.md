# Database migrations

No per-version migration SQL is kept here. The database delivery policy uses reviewed direct SQL
execution against the project-scoped Supabase MCP, with a backup taken first.

## 平台基线

新建项目的库结构走 [../baseline/README.md](../baseline/README.md)：`platform-baseline.sql`
（平台内核 schema）+ `platform-seed.sql`（内置租户、角色、平台菜单、字典、参数、编号场景）。
基线由 `pnpm baseline:platform --backup supabase/backups/<时间戳>` 从快照重新生成，
并用 `supabase/baseline/verify-baseline.ps1` 在一次性 Postgres 容器里校验。

## 整库迁移

To export the remote project's current schema, data, and migration history, run
`supabase/backup-supabase.ps1` from the repository root. Its timestamped backup is ignored by Git and
can be imported into a new project with `supabase/restore-supabase.ps1`.

Do not fetch historical migrations or create a migration baseline in this directory.

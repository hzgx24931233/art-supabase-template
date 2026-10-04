# UI 视觉回归

视觉回归覆盖 AI 运营中心、Supabase AI 助手、AI 项目规划器、网站配置和 ArtTableQuery 示例页，
并配置桌面、平板、移动端、暗色与阴影盒模型环境。

测试默认通过独立的 `41737` 端口预览 `VITE_OUT_DIR` 配置的生产构建（模板默认 `dist`）。
源码 UI 发生变化后，先构建再生成或确认新基线：

```powershell
pnpm.cmd exec playwright install chromium
pnpm.cmd build
pnpm.cmd test:e2e:update
```

## 前置条件

端到端用例需要一个可访问的 Supabase 项目，以及通过环境变量提供的测试账号：

```powershell
$env:E2E_EMAIL = '<test-account-email>'
$env:E2E_PASSWORD = '<test-account-password>'
```

`E2E_SUPABASE_AUTH_TOKEN_KEY` 可选：默认会从 `.env` 的 `VITE_SUPABASE_URL` 推导
`sb-<ref>-auth-token`。

视觉基线随仓库提交；新建项目、换库或调整 UI 之后，请用 `test:e2e:update` 重新生成，
并在 PR 里人工确认差异。

本地默认复用已安装的 Chrome；CI 环境使用 Playwright Chromium，因此流水线初始化阶段仍需执行
`pnpm.cmd test:e2e:install`。

日常验证：

```powershell
pnpm.cmd test:e2e
```

提交前的核心页面快速门禁只运行 1440 桌面与 390 移动端：

```powershell
pnpm.cmd test:e2e:core
```

完整 CI 门禁会依次执行静态检查、项目快照校验、生产构建和核心视觉回归：

```powershell
pnpm.cmd check:ci
```

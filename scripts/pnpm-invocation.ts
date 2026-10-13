/**
 * 解析启动项目锁定 pnpm 的命令。
 *
 * 脚本被不同入口拉起时 `npm_execpath` 指向的形态不同：pnpm 的 JS 入口（`pnpm.cjs`）、
 * standalone 分发的可执行文件（`pnpm.exe`）、或 npm 自己的 `npm-cli.js`。
 * 只有 JS 入口能交给 node 执行；把可执行文件交给 node 会直接报
 * `ERR_UNKNOWN_FILE_EXTENSION: Unknown file extension ".exe"`，
 * 因此这里按入口形态分派，并始终回落到 pnpm（而不是 npm），保证用的是项目锁定的版本。
 */

export interface PnpmInvocation {
  command: string
  args: string[]
}

export interface PnpmInvocationEnvironment {
  /** `process.env.npm_execpath`：当前包管理器的入口路径。 */
  npmExecPath?: string
  /** `process.execPath`：node 可执行文件路径。 */
  execPath: string
  /** `process.platform`。 */
  platform: NodeJS.Platform
  /** `process.env.ComSpec`：Windows 命令解释器路径。 */
  comSpec?: string
}

const JAVASCRIPT_ENTRY_PATTERN = /\.(?:c?js|mjs)$/i
const WINDOWS_EXECUTABLE_PATTERN = /\.(?:exe|com)$/i
const WINDOWS_SCRIPT_PATTERN = /\.(?:cmd|bat)$/i

export function resolvePnpmInvocation(
  args: string[],
  environment: PnpmInvocationEnvironment
): PnpmInvocation {
  const { execPath, platform, comSpec } = environment
  const cliPath = environment.npmExecPath?.trim()

  // 入口路径含 npm 时不接管：那些情况下要落到下面的 pnpm 回落，而不是执行 npm 自己。
  if (cliPath && cliPath.toLowerCase().includes('pnpm')) {
    if (JAVASCRIPT_ENTRY_PATTERN.test(cliPath)) {
      return { command: execPath, args: [cliPath, ...args] }
    }
    if (platform === 'win32' && WINDOWS_EXECUTABLE_PATTERN.test(cliPath)) {
      return { command: cliPath, args }
    }
    if (platform === 'win32' && WINDOWS_SCRIPT_PATTERN.test(cliPath)) {
      return { command: comSpec ?? 'cmd.exe', args: ['/d', '/s', '/c', cliPath, ...args] }
    }
  }

  if (platform === 'win32') {
    return { command: comSpec ?? 'cmd.exe', args: ['/d', '/s', '/c', 'pnpm.cmd', ...args] }
  }

  return { command: 'pnpm', args }
}

/** 以当前进程环境解析启动命令。 */
export function resolvePnpmInvocationFromProcess(args: string[]): PnpmInvocation {
  return resolvePnpmInvocation(args, {
    npmExecPath: process.env.npm_execpath,
    execPath: process.execPath,
    platform: process.platform,
    comSpec: process.env.ComSpec
  })
}

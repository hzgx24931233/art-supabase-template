/**
 * 子仓声明的平台依赖与主仓平台交付包的约定。
 *
 * 子仓在 `package.json` 里用 `art-supabase-pro` 声明自己构建时面向的平台，目前有两种形态：
 *
 * - `file:..\..\packages\art-supabase-pro-1.0.0.tgz`：仓库内的平台交付包。平台版本跟着主仓交付物走，
 *   安装直接用子仓自己的锁文件（锁文件记录了该包的完整性哈希），运行器不生成任何东西。
 * - `https://<主仓>/archive/<40 位提交>.tar.gz`：主仓提交的归档地址。运行器从**本地 Git 历史**就地
 *   `git archive` 出等价包再安装，所以离线也能安装，归档地址只作为约定记录。
 *
 * 交付包由 `pnpm modules:pack-platform` 从主仓工作区生成，落在 `packages/` 下并随主仓提交。
 */

import { resolve } from 'node:path'

export const platformPackageDirectory = 'packages'
export type PlatformDependency =
  | { kind: 'none' }
  | { kind: 'local-package'; reference: string }
  | { kind: 'commit-archive'; reference: string }

export function classifyPlatformDependency(reference: string | undefined): PlatformDependency {
  const spec = reference?.trim()
  if (!spec) return { kind: 'none' }
  if (spec.toLowerCase().startsWith('file:')) return { kind: 'local-package', reference: spec }
  return { kind: 'commit-archive', reference: spec }
}

/** 把 `file:` 依赖解析成绝对路径；Windows 风格的 `\` 分隔符先归一化。 */
export function resolveLocalPlatformPackage(reference: string, moduleRoot: string): string {
  const spec = reference.trim().slice('file:'.length).replaceAll('\\', '/')
  return resolve(moduleRoot, spec)
}

/** 交付包文件名，与 `pnpm pack` 的命名一致（作用域名里的 `/` 换成 `-`）。 */
export function platformPackageFileName(packageName: string, version: string): string {
  return `${packageName.replace(/^@/, '').replaceAll('/', '-')}-${version}.tgz`
}

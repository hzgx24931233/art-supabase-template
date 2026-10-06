/**
 * 浏览器默认右键菜单守卫
 *
 * 平台内所有页面（含 FMS、HR 业务应用）默认不再弹出浏览器右键菜单，
 * 需要右键交互的场景继续使用 `ArtMenuRight` 等组件自行渲染菜单。
 *
 * 实现要点：只在捕获阶段调用 `preventDefault()`，绝不调用 `stopPropagation()`。
 * 页面上已有的自定义菜单都依赖各自的 `contextmenu` 处理器（`ArtMenuRight.show()`
 * 内部同样会 `preventDefault` 并渲染菜单），拦截掉事件传递会让这些菜单失效。
 */

/**
 * 不接管的右键区域。
 *
 * - `input` / `textarea` / `select` / `[contenteditable]`：需要浏览器原生菜单完成
 *   粘贴、复制、剪贴板与拼写检查，原生菜单在这些控件内保持可用。
 * - `.monaco-editor`：Monaco 自带右键菜单（SQL 控制台动作挂在其中）。
 * - `[data-native-context-menu]`：显式豁免标记，供后续页面按需声明例外区域。
 */
const SELF_MANAGED_CONTEXT_MENU_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
  '.monaco-editor',
  '[data-native-context-menu]'
].join(', ')

/**
 * 判断右键落点是否由控件自己处理。
 *
 * @param target 右键事件的原始目标
 */
function isSelfManagedTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(SELF_MANAGED_CONTEXT_MENU_SELECTOR) !== null
}

function handleContextMenu(event: MouseEvent): void {
  if (isSelfManagedTarget(event.target)) return

  event.preventDefault()
}

/**
 * 安装浏览器默认右键菜单守卫。
 *
 * 与应用同生命周期，常驻不卸载（与 `setupErrorHandle` 等应用级副作用一致）。
 */
export function setupContextMenuGuard(): void {
  document.addEventListener('contextmenu', handleContextMenu, true)
}

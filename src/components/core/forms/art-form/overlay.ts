import type { InjectionKey, Ref } from 'vue'
import type { ArtOverlayDirtySource } from '@/hooks/core/useArtOverlay'

export type ArtFormDirtySource = ArtOverlayDirtySource

export interface ArtFormOverlayContext {
  focusMode: Readonly<Ref<boolean>>
  registerForm: () => () => void
  /** 未开启关闭前变更检测的弹层可以不提供 */
  registerDirtySource?: (source: ArtFormDirtySource) => () => void
}

export const artFormOverlayKey: InjectionKey<ArtFormOverlayContext> = Symbol('artFormOverlay')

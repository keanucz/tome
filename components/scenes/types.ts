import type { Citation, DeepPartial, Scene } from '@/lib/story/schema'

/** A scene as it arrives over the stream — every field may be missing. */
export type PartialScene = DeepPartial<Scene>

export interface SceneContext {
  /** 0-based chapter index, for chapter numerals / ornaments. */
  chapterIndex: number
}

export interface SceneComponentProps<S extends { type: string }> {
  scene: DeepPartial<S>
  ctx: SceneContext
}

export type OnCite = (citations: Citation[]) => void

/**
 * Citations of one scene with all required fields present — safe to hand to
 * the citations panel even mid-stream.
 */
export function sceneCitations(scene: PartialScene | undefined): Citation[] {
  const out: Citation[] = []
  for (const c of scene?.citations ?? []) {
    if (c?.articleTitle && c?.url && c?.snippet) out.push(c as Citation)
  }
  return out
}

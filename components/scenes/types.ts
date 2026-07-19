import type { Citation, DeepPartial, Scene } from '@/lib/story/schema'

/** A scene as it arrives over the stream — every field may be missing. */
export type PartialScene = DeepPartial<Scene>

export interface SceneContext {
  /** 0-based chapter index, for chapter numerals / ornaments. */
  chapterIndex: number
  /** Theme's ambient art prompt — chapter headers render a frontispiece from it. */
  ambientPrompt?: string
  /** Story title — grounds "request an audience" conversations with figures. */
  topic?: string
  /** Theme's era label, threaded to persona conversations. */
  era?: string
}

export interface SceneComponentProps<S extends { type: string }> {
  scene: DeepPartial<S>
  ctx: SceneContext
}

/**
 * Fired when a reader opens a scene's sources. `sceneNarrations` carries the
 * narration text of the cited scene(s) so the citations panel can offer a
 * cross-examination pass; older callers may omit it.
 */
export type OnCite = (citations: Citation[], sceneNarrations?: string[]) => void

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

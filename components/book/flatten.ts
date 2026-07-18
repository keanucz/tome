import { pageNarration, type PartialStory } from '@/lib/story/schema'
import type { PartialScene } from '@/components/scenes/types'

/** One renderable book page, flattened out of chapters → pages. */
export interface FlatPage {
  key: string
  kind: 'cover' | 'content'
  chapterIndex: number
  chapterTitle: string | undefined
  /** 0-based page number within its chapter. */
  pageInChapter: number
  scenes: PartialScene[]
  /** Concatenated narration for TTS (cover narrates title + subtitle). */
  narration: string
}

/**
 * Flatten a (possibly partially-streamed) story into an ordered page list.
 * Page 0 is a synthesized title page once the story title exists. Content
 * pages appear as soon as they carry at least one scene — even a scene shell
 * renders (as a skeleton), which is what makes the book visibly grow.
 */
export function flattenStory(story: PartialStory | undefined): FlatPage[] {
  const out: FlatPage[] = []
  if (!story) return out

  if (story.title) {
    out.push({
      key: 'cover',
      kind: 'cover',
      chapterIndex: -1,
      chapterTitle: undefined,
      pageInChapter: 0,
      scenes: [],
      narration: [story.title, story.subtitle].filter(Boolean).join('. '),
    })
  }

  for (const [ci, chapter] of (story.chapters ?? []).entries()) {
    for (const [pi, page] of (chapter?.pages ?? []).entries()) {
      const scenes = (page?.scenes ?? []).filter(
        (s): s is PartialScene => s !== undefined,
      )
      if (scenes.length === 0) continue
      out.push({
        key: `c${ci}p${pi}`,
        kind: 'content',
        chapterIndex: ci,
        chapterTitle: chapter?.title,
        pageInChapter: pi,
        scenes,
        narration: pageNarration(page),
      })
    }
  }

  return out
}

/**
 * Cheap fingerprint of how much of the story has arrived — used to detect
 * when the stream has gone quiet (page "settled") before narrating the
 * final page.
 */
export function storyFingerprint(pages: FlatPage[]): string {
  return pages
    .map(
      (p) =>
        `${p.key}:${p.narration.length}:${p.scenes
          .map((s) => Object.keys(s ?? {}).length)
          .join(',')}`,
    )
    .join('|')
}

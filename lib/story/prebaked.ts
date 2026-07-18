import { StorySchema, type Story } from './schema'

/**
 * Client-safe access to the prebaked demo stories served from
 * `public/prebaked/` (baked by `scripts/prebake.ts`). No Node APIs —
 * importable from client components ('use client' trees) and the demo chips.
 */

export interface PrebakedEntry {
  slug: string
  topic: string
}

export const PREBAKED: readonly PrebakedEntry[] = [
  { slug: 'seven-years-war', topic: "The Seven Years' War" },
  { slug: 'french-revolution', topic: 'The French Revolution' },
  { slug: 'ada-lovelace', topic: 'Ada Lovelace' },
  { slug: 'unification-of-germany', topic: 'The Unification of Germany' },
]

/**
 * Load one prebaked story by slug. Resolves to null on any failure
 * (missing file, bad JSON, schema mismatch) — callers fall back to the
 * live weave.
 */
export async function loadPrebaked(slug: string): Promise<Story | null> {
  try {
    const res = await fetch(`/prebaked/${encodeURIComponent(slug)}.json`)
    if (!res.ok) return null
    const data: unknown = await res.json()
    if (typeof data !== 'object' || data === null) return null
    return StorySchema.parse((data as { story?: unknown }).story)
  } catch {
    return null
  }
}

/**
 * URL of the prebaked narration mp3 for a page, addressed by the page's
 * 0-based index across the whole book (chapters flattened in order).
 */
export function prebakedAudioUrl(slug: string, pageIndex: number): string {
  return `/prebaked/audio/${encodeURIComponent(slug)}/${pageIndex}.mp3`
}

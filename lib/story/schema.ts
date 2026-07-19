import { z } from 'zod'

/**
 * CONTRACT FILE — shared by the weave pipeline (server), the book renderer
 * (client), and the citations panel. Do not change shapes without updating
 * all consumers. Owned by the orchestrator; agents import, never edit.
 */

export const CitationSchema = z.object({
  articleTitle: z.string(),
  url: z.string().describe('Full Wikipedia article URL'),
  snippet: z
    .string()
    .describe('Short verbatim quote from the source that supports this passage'),
  sectionAnchor: z.string().nullish(),
})
export type Citation = z.infer<typeof CitationSchema>

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const FONT_PAIRINGS = [
  'classical',
  'enlightenment',
  'gothic',
  'romantic',
  'modern',
] as const

export const TEXTURE_IDS = [
  'parchment',
  'linen',
  'aged-paper',
  'vellum',
  'none',
] as const

export const ThemeSpecSchema = z.object({
  era: z.string().describe('Human-readable era label, e.g. "Enlightenment Europe, 1756–1763"'),
  fontPairing: z.enum(FONT_PAIRINGS),
  palette: z.object({
    paper: hex.describe('Page background, light parchment tone'),
    ink: hex.describe('Body text color, dark'),
    accent: hex.describe('Chapter titles / ornaments'),
    gold: hex.nullish().describe('Gilding highlights'),
  }),
  textureId: z.enum(TEXTURE_IDS),
  ambientPrompt: z
    .string()
    .describe('Image-generation prompt for ambient chapter art in a period-appropriate painting style'),
})
export type ThemeSpec = z.infer<typeof ThemeSpecSchema>

const sceneBase = {
  narration: z
    .string()
    .max(900)
    .describe('Spoken audiobook narration for this scene. Vivid, factual, flowing prose. Length target comes from the reading depth.'),
  citations: z.array(CitationSchema).min(1),
}

export const ChapterHeaderSceneSchema = z.object({
  type: z.literal('chapter-header'),
  title: z.string(),
  epigraph: z.string().nullish().describe('Short period quote or line setting the mood'),
  ...sceneBase,
})

export const PortraitSceneSchema = z.object({
  type: z.literal('portrait'),
  imageUrl: z
    .string()
    .describe('MUST be an exact url copied from the provided source-image list. Never invent URLs.'),
  personName: z.string(),
  caption: z.string().describe('Painting title, artist, and year if known'),
  ...sceneBase,
})

export const MapPlateSceneSchema = z.object({
  type: z.literal('map-plate'),
  imageUrl: z
    .string()
    .describe('MUST be an exact url copied from the provided source-image list. Never invent URLs.'),
  caption: z.string(),
  ...sceneBase,
})

export const TimelineSceneSchema = z.object({
  type: z.literal('timeline'),
  events: z
    .array(z.object({ year: z.string(), label: z.string().max(80) }))
    .min(3)
    .max(8),
  ...sceneBase,
})

export const LetterQuoteSceneSchema = z.object({
  type: z.literal('letter-quote'),
  quoteText: z.string().describe('Verbatim primary-source quote'),
  attribution: z.string(),
  date: z.string().nullish(),
  ...sceneBase,
})

export const SceneSchema = z.discriminatedUnion('type', [
  ChapterHeaderSceneSchema,
  PortraitSceneSchema,
  MapPlateSceneSchema,
  TimelineSceneSchema,
  LetterQuoteSceneSchema,
])
export type Scene = z.infer<typeof SceneSchema>
export type SceneType = Scene['type']

export const PageSchema = z.object({
  scenes: z.array(SceneSchema).min(1).max(3),
})
export type Page = z.infer<typeof PageSchema>

export const ChapterSchema = z.object({
  title: z.string(),
  pages: z.array(PageSchema).min(1).max(6),
})
export type Chapter = z.infer<typeof ChapterSchema>

export const StorySchema = z.object({
  title: z.string(),
  subtitle: z.string().nullish(),
  theme: ThemeSpecSchema,
  chapters: z.array(ChapterSchema).min(2).max(9),
})
export type Story = z.infer<typeof StorySchema>

/**
 * Reader-selected story depth. Controls corpus size, chapter/page targets,
 * and output budget — 'pamphlet' is a quick tale, 'tome' an exhaustive
 * telling that refuses to compress a life into vignettes.
 */
export const STORY_DEPTHS = ['pamphlet', 'chronicle', 'tome'] as const
export type StoryDepth = (typeof STORY_DEPTHS)[number]

/**
 * While streaming, every nested field may be missing. Renderers must
 * null-guard everything. Use with `useObject` partial results.
 */
export type DeepPartial<T> = T extends (infer U)[]
  ? (DeepPartial<U> | undefined)[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T
export type PartialStory = DeepPartial<Story>

/** Concatenated narration for one page — the unit of TTS playback. */
export function pageNarration(page: DeepPartial<Page> | undefined): string {
  if (!page?.scenes) return ''
  return page.scenes
    .map((s) => s?.narration ?? '')
    .filter(Boolean)
    .join(' ')
}

/** All citations on one page, for the citations panel. */
export function pageCitations(page: DeepPartial<Page> | undefined): Citation[] {
  if (!page?.scenes) return []
  const out: Citation[] = []
  for (const s of page.scenes ?? []) {
    for (const c of s?.citations ?? []) {
      if (c?.articleTitle && c?.url && c?.snippet) out.push(c as Citation)
    }
  }
  return out
}

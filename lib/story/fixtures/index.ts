import { z } from 'zod'
import type { SourceCorpus } from '../../sources/types'
import sevenYearsWar from './corpus-seven-years-war.json'

/**
 * Pre-baked source corpora (real Wikipedia/Commons data fetched at build
 * time). Used by POST /api/story {fixture: true} so the weave pipeline is
 * testable and demoable without the live sources pipeline.
 */

const SourceImageSchema = z.object({
  url: z.url(),
  thumbUrl: z.url(),
  title: z.string(),
  artist: z.string().optional(),
  date: z.string().optional(),
  license: z.string(),
  description: z.string().optional(),
  kind: z.enum(['portrait', 'map', 'scene', 'other']),
})

const SourceSectionSchema = z.object({
  anchor: z.string(),
  heading: z.string(),
  text: z.string(),
})

const SourceArticleSchema = z.object({
  title: z.string(),
  url: z.url(),
  extract: z.string(),
  sections: z.array(SourceSectionSchema),
})

export const SourceCorpusSchema = z.object({
  topic: z.string(),
  main: SourceArticleSchema,
  related: z.array(SourceArticleSchema),
  images: z.array(SourceImageSchema).min(1),
})

/** Loads and validates the Seven Years' War fixture corpus. */
export function loadFixtureCorpus(): SourceCorpus {
  return SourceCorpusSchema.parse(sevenYearsWar)
}

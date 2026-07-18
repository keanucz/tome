import { anthropic } from '@ai-sdk/anthropic'
import { streamObject } from 'ai'
import { z } from 'zod'
import { buildCorpus } from '@/lib/sources/corpus'
import type { SourceCorpus } from '@/lib/sources/types'
import { loadFixtureCorpus } from '@/lib/story/fixtures'
import { buildStoryPrompt } from '@/lib/story/prompt'
import { STORY_DEPTHS, StorySchema, type StoryDepth } from '@/lib/story/schema'

/**
 * POST /api/story
 *   body: { topic: string, depth?: StoryDepth } — build a live corpus and
 *     weave a story ('pamphlet' | 'chronicle' | 'tome', default 'chronicle')
 *   body: { fixture: true } — weave from the pre-baked Seven Years' War corpus
 * Success: text stream of the Story JSON (consume with useObject).
 * Failure: JSON { error } with status 400 (bad request) or 500 (pipeline).
 */

export const maxDuration = 300

const DEFAULT_MODEL = 'claude-sonnet-5'

/** Deeper tellings get a proportionally larger output budget. */
const DEPTH_MAX_TOKENS: Record<StoryDepth, number> = {
  pamphlet: 12_000,
  chronicle: 24_000,
  tome: 40_000,
}

const BodySchema = z
  .object({
    topic: z.string().trim().min(2).max(200).optional(),
    depth: z.enum(STORY_DEPTHS).optional(),
    fixture: z.boolean().optional(),
  })
  .refine((body) => body.fixture === true || body.topic !== undefined, {
    message: 'Provide { topic: string } or { fixture: true }',
  })

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Unexpected error'
}

export async function POST(req: Request): Promise<Response> {
  let parsed: z.infer<typeof BodySchema>
  try {
    parsed = BodySchema.parse(await req.json())
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? 'Invalid request: provide { topic: string } or { fixture: true }'
        : 'Request body must be valid JSON'
    return Response.json({ error: message }, { status: 400 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: 'ANTHROPIC_API_KEY is not configured' },
      { status: 500 },
    )
  }

  const depth: StoryDepth = parsed.depth ?? 'chronicle'

  let corpus: SourceCorpus
  try {
    corpus = parsed.fixture === true
      ? loadFixtureCorpus()
      : await buildCorpus(parsed.topic as string, depth)
  } catch (err) {
    console.error('[api/story] corpus build failed:', err)
    return Response.json(
      { error: `Could not gather sources: ${errorMessage(err)}` },
      { status: 500 },
    )
  }

  try {
    const { system, prompt } = buildStoryPrompt(corpus, depth)
    const result = streamObject({
      model: anthropic(process.env.TOME_MODEL ?? DEFAULT_MODEL),
      schema: StorySchema,
      schemaName: 'Story',
      schemaDescription:
        'An illustrated, narrated storybook woven from the provided sources',
      system,
      prompt,
      maxOutputTokens: DEPTH_MAX_TOKENS[depth],
      // "New story" / retry on the client aborts the request — stop the
      // server-side generation with it instead of streaming into the void.
      abortSignal: req.signal,
      // The default outputFormat mode compiles our discriminated-union schema
      // into a constraint grammar the API rejects as too large; jsonTool sends
      // it as a plain tool schema instead.
      providerOptions: {
        anthropic: { structuredOutputMode: 'jsonTool' },
      },
      onError: ({ error }) => {
        console.error('[api/story] stream error:', error)
      },
    })
    return result.toTextStreamResponse()
  } catch (err) {
    console.error('[api/story] weave failed:', err)
    return Response.json(
      { error: `Story weave failed: ${errorMessage(err)}` },
      { status: 500 },
    )
  }
}

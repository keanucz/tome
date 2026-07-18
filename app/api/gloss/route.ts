import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import { z } from 'zod'
import {
  articleUrl,
  wikiGet,
  WIKIMEDIA_USER_AGENT,
} from '@/lib/sources/wikipedia'

/**
 * POST /api/gloss
 *   body: { term: string (1..120), sentence: string (<=500), topic: string (<=200) }
 * Resolves the term against Wikipedia (search → REST summary) and asks a small
 * model for a 2-3 sentence margin note grounded in the summary extract.
 * Success: { gloss, articleTitle, url, thumbnail? } — url is the Wikipedia
 *   page, or null (with note: 'no-article') when nothing was found and the
 *   gloss was drawn from the sentence context alone.
 * Failure: { error } with 400 (bad input), 503 (no ANTHROPIC_API_KEY),
 *   500 (total failure). Responses cached in-memory per term+topic.
 */

export const runtime = 'nodejs'

const GLOSS_MODEL = 'claude-haiku-4-5-20251001'
const SUMMARY_TIMEOUT_MS = 20_000
const CACHE_MAX_ENTRIES = 200

const BodySchema = z.object({
  term: z.string().trim().min(1).max(120),
  sentence: z.string().trim().max(500),
  topic: z.string().trim().max(200),
})

interface GlossPayload {
  gloss: string
  articleTitle: string | null
  url: string | null
  thumbnail?: string
  note?: 'no-article'
}

// ---------------------------------------------------------------------------
// In-memory response cache (per server process), capped at 200 entries.
// ---------------------------------------------------------------------------

const glossCache = new Map<string, GlossPayload>()

function cacheKey(term: string, topic: string): string {
  return `${term.toLowerCase()}␟${topic}`
}

function cachePut(key: string, value: GlossPayload): void {
  if (glossCache.size >= CACHE_MAX_ENTRIES) {
    // Maps iterate in insertion order — evict the oldest entry.
    const oldest = glossCache.keys().next().value
    if (oldest !== undefined) glossCache.delete(oldest)
  }
  glossCache.set(key, value)
}

// ---------------------------------------------------------------------------
// Wikipedia grounding: search the term, then fetch the REST page summary.
// ---------------------------------------------------------------------------

const SearchResponseSchema = z.object({
  query: z
    .object({ search: z.array(z.object({ title: z.string() })) })
    .optional(),
})

const SummarySchema = z.object({
  title: z.string().optional(),
  extract: z.string().optional(),
  type: z.string().optional(),
  content_urls: z
    .object({ desktop: z.object({ page: z.string() }).optional() })
    .optional(),
  thumbnail: z.object({ source: z.string() }).optional(),
})

interface Grounding {
  articleTitle: string
  extract: string
  url: string
  thumbnail?: string
}

async function searchArticleTitle(
  term: string,
  topic: string,
): Promise<string | undefined> {
  // The bare term almost always resolves to the right article ("Voltaire" →
  // Voltaire); only when it finds nothing, retry biased toward the story's
  // subject so obscure short terms still land somewhere relevant.
  const queries = topic ? [term, `${term} ${topic}`] : [term]
  for (const srsearch of queries) {
    const body = await wikiGet({
      action: 'query',
      list: 'search',
      srsearch,
      srnamespace: '0',
      srlimit: '3',
    })
    const parsed = SearchResponseSchema.safeParse(body)
    const hit = parsed.success ? parsed.data.query?.search[0]?.title : undefined
    if (hit) return hit
  }
  return undefined
}

async function fetchSummary(title: string): Promise<Grounding | null> {
  const slug = encodeURIComponent(title.replace(/ /g, '_'))
  const res = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`,
    {
      headers: {
        'User-Agent': WIKIMEDIA_USER_AGENT,
        'Api-User-Agent': WIKIMEDIA_USER_AGENT,
      },
      signal: AbortSignal.timeout(SUMMARY_TIMEOUT_MS),
    },
  )
  if (!res.ok) return null
  const parsed = SummarySchema.safeParse(await res.json())
  if (!parsed.success) return null
  const { title: resolvedTitle, extract, type, content_urls, thumbnail } =
    parsed.data
  // Disambiguation pages carry no usable grounding text.
  if (!extract || type === 'disambiguation') return null
  const articleTitle = resolvedTitle ?? title
  return {
    articleTitle,
    extract,
    url: content_urls?.desktop?.page ?? articleUrl(articleTitle),
    thumbnail: thumbnail?.source,
  }
}

/** Resolve grounding; a Wikipedia hiccup degrades to null, never throws. */
async function resolveGrounding(
  term: string,
  topic: string,
): Promise<Grounding | null> {
  try {
    const title = await searchArticleTitle(term, topic)
    if (!title) return null
    return await fetchSummary(title)
  } catch (err) {
    console.error('[api/gloss] wikipedia lookup failed:', err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Gloss generation
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT =
  'You write brief margin notes for a historical storybook. A reader has ' +
  'selected a phrase while reading and wants its context explained in the ' +
  'margin, without leaving the page.'

function buildPrompt(
  term: string,
  sentence: string,
  topic: string,
  grounding: Grounding | null,
): string {
  const lines = [
    `Selected term: "${term}"`,
    sentence ? `The sentence it appeared in: "${sentence}"` : '',
    topic ? `The story being read: "${topic}"` : '',
    grounding
      ? `Wikipedia article "${grounding.articleTitle}" says: ${grounding.extract}`
      : 'No Wikipedia article was found for this term.',
    '',
    'Write the margin note now. 2-3 sentences MAXIMUM. Explain what the term',
    "is AND why it matters in this sentence's context. Ground every fact in",
    'the provided Wikipedia extract — never invent facts. If no extract is',
    'provided, explain the term only as far as the sentence itself supports.',
    'Respond with the note text alone: no preamble, no quotation marks.',
  ]
  return lines.filter(Boolean).join('\n')
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unexpected error'
}

export async function POST(req: Request): Promise<Response> {
  let body: z.infer<typeof BodySchema>
  try {
    body = BodySchema.parse(await req.json())
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? 'Invalid request: provide { term: 1-120 chars, sentence: <=500, topic: <=200 }'
        : 'Request body must be valid JSON'
    return Response.json({ error: message }, { status: 400 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: 'ANTHROPIC_API_KEY is not configured' },
      { status: 503 },
    )
  }

  const { term, sentence, topic } = body
  const key = cacheKey(term, topic)
  const cached = glossCache.get(key)
  if (cached) {
    return Response.json(cached, { headers: { 'X-Gloss-Cache': 'hit' } })
  }

  const grounding = await resolveGrounding(term, topic)

  try {
    const { text } = await generateText({
      model: anthropic(GLOSS_MODEL),
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(term, sentence, topic, grounding),
      maxOutputTokens: 300,
      abortSignal: req.signal,
    })
    const gloss = text.trim()
    if (!gloss) throw new Error('model returned an empty gloss')

    const payload: GlossPayload = grounding
      ? {
          gloss,
          articleTitle: grounding.articleTitle,
          url: grounding.url,
          ...(grounding.thumbnail ? { thumbnail: grounding.thumbnail } : {}),
        }
      : { gloss, articleTitle: null, url: null, note: 'no-article' }

    cachePut(key, payload)
    return Response.json(payload, { headers: { 'X-Gloss-Cache': 'miss' } })
  } catch (err) {
    console.error('[api/gloss] gloss generation failed:', err)
    return Response.json(
      { error: `Gloss failed: ${errorMessage(err)}` },
      { status: 500 },
    )
  }
}

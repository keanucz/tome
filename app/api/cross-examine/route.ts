import { createHash } from 'node:crypto'
import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import { z } from 'zod'
import { CitationSchema, type Citation } from '@/lib/story/schema'
import { fetchArticle, type ArticleBudget } from '@/lib/sources/wikipedia'
import type { SourceArticle } from '@/lib/sources/types'

/**
 * POST /api/cross-examine
 *   body: { scenes: [{ narration: string (<=4000), citations: Citation[] }] }
 *   with 1..6 scenes.
 * A judge-facing verification pass: for each scene the cited Wikipedia
 * article is fetched (first citation's articleTitle) and a small model
 * cross-examines the narration against the actual source text.
 * Success: { verdicts: [{ supported: 'yes'|'partial'|'no',
 *   snippetVerbatim: boolean, note: string }] } aligned with input order.
 * Failure: { error } with 400 (bad input), 503 (no ANTHROPIC_API_KEY).
 * Per-scene failures degrade to a 'partial' fallback verdict, never 500.
 * Verdicts cached in-memory keyed on sha256 of the scene narration.
 */

export const runtime = 'nodejs'

const EXAMINE_MODEL = 'claude-haiku-4-5-20251001'
const CACHE_MAX_ENTRIES = 100
const SOURCE_CHAR_BUDGET = 6000
const ARTICLE_BUDGET: ArticleBudget = {
  leadWords: 400,
  sectionWords: 300,
  totalWords: 1500,
}

const ExamineSceneSchema = z.object({
  narration: z.string().trim().min(1).max(4000),
  citations: z.array(CitationSchema).min(1).max(12),
})
type ExamineScene = z.infer<typeof ExamineSceneSchema>

const BodySchema = z.object({
  scenes: z.array(ExamineSceneSchema).min(1).max(6),
})

const VerdictSchema = z.object({
  supported: z.enum(['yes', 'partial', 'no']),
  snippetVerbatim: z.boolean(),
  note: z.string().max(200),
})
type Verdict = z.infer<typeof VerdictSchema>

/** Sentinel fallback — reference-compared so failures are never cached. */
const FALLBACK_VERDICT: Verdict = {
  supported: 'partial',
  snippetVerbatim: false,
  note: 'verdict unavailable',
}

// ---------------------------------------------------------------------------
// In-memory verdict cache (per server process), capped at 100 entries.
// ---------------------------------------------------------------------------

const verdictCache = new Map<string, Verdict>()

function cacheKey(narration: string): string {
  return createHash('sha256').update(narration).digest('hex')
}

function cachePut(key: string, value: Verdict): void {
  if (verdictCache.size >= CACHE_MAX_ENTRIES) {
    // Maps iterate in insertion order — evict the oldest entry.
    const oldest = verdictCache.keys().next().value
    if (oldest !== undefined) verdictCache.delete(oldest)
  }
  verdictCache.set(key, value)
}

// ---------------------------------------------------------------------------
// Source text assembly — prefer the cited section, then lead, then the rest.
// ---------------------------------------------------------------------------

function buildSourceText(
  article: SourceArticle,
  sectionAnchor: string | null | undefined,
): string {
  const anchor = sectionAnchor?.trim().toLowerCase()
  const preferred = anchor
    ? article.sections.find(
        (s) =>
          s.anchor.toLowerCase() === anchor ||
          s.heading.toLowerCase() === anchor.replace(/_/g, ' '),
      )
    : undefined
  const parts: string[] = []
  if (preferred) parts.push(`== ${preferred.heading} ==\n${preferred.text}`)
  if (article.extract) parts.push(article.extract)
  for (const section of article.sections) {
    if (section === preferred) continue
    parts.push(`== ${section.heading} ==\n${section.text}`)
  }
  return parts.join('\n\n').slice(0, SOURCE_CHAR_BUDGET)
}

// ---------------------------------------------------------------------------
// Verdict generation
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT =
  'You are a rigorous, literal-minded fact-checker for a historical ' +
  'storybook. You compare a narration passage against the actual text of ' +
  'its cited source and judge, strictly, whether the source supports every ' +
  'specific claim. You never give the narration the benefit of the doubt: ' +
  'a claim absent from the source text is unsupported.'

function buildPrompt(scene: ExamineScene, sourceText: string): string {
  const snippetLines = scene.citations.map((c: Citation, i: number) => {
    const section = c.sectionAnchor ? ` § ${c.sectionAnchor}` : ''
    return `${i + 1}. [${c.articleTitle}${section}] "${c.snippet}"`
  })
  return [
    'NARRATION under examination:',
    `"""${scene.narration}"""`,
    '',
    'CITED SNIPPETS (each claimed to be a verbatim quote of the source):',
    ...snippetLines,
    '',
    `SOURCE TEXT (fetched from the cited article "${scene.citations[0].articleTitle}"):`,
    `"""${sourceText}"""`,
    '',
    'Respond with STRICT JSON only — no markdown, no preamble — exactly:',
    '{"supported":"yes"|"partial"|"no","snippetVerbatim":true|false,"note":"..."}',
    '- supported: "yes" if every specific claim in the narration is backed',
    '  by the source text; "partial" if only some are; "no" if the source',
    '  contradicts or fails to support the main claims.',
    '- snippetVerbatim: true only if cited snippet 1 appears word-for-word',
    '  in the source text above.',
    '- note: max 200 characters, naming any unsupported specific claim, or',
    '  a short confirmation when everything checks out.',
  ].join('\n')
}

/** Strip any accidental preamble/code fences around the JSON object. */
function extractJson(text: string): string {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return text
  return text.slice(start, end + 1)
}

/** Trim over-long notes at a word boundary rather than mid-word. */
function clampNote(note: string): string {
  if (note.length <= 200) return note
  const cut = note.slice(0, 199)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 120 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

function parseVerdict(text: string): Verdict {
  try {
    const candidate: unknown = JSON.parse(extractJson(text))
    if (!candidate || typeof candidate !== 'object') return FALLBACK_VERDICT
    const record = candidate as Record<string, unknown>
    const normalized = {
      supported: record.supported,
      snippetVerbatim: record.snippetVerbatim,
      // Trim over-long notes rather than failing the whole verdict.
      note: typeof record.note === 'string' ? clampNote(record.note) : record.note,
    }
    const parsed = VerdictSchema.safeParse(normalized)
    return parsed.success ? parsed.data : FALLBACK_VERDICT
  } catch {
    return FALLBACK_VERDICT
  }
}

async function examineScene(
  scene: ExamineScene,
  abortSignal: AbortSignal,
): Promise<Verdict> {
  const key = cacheKey(scene.narration)
  const cached = verdictCache.get(key)
  if (cached) return cached

  let sourceText: string
  try {
    const article = await fetchArticle(
      scene.citations[0].articleTitle,
      ARTICLE_BUDGET,
    )
    sourceText = buildSourceText(article, scene.citations[0].sectionAnchor)
  } catch (err) {
    console.error('[api/cross-examine] source fetch failed:', err)
    return {
      supported: 'partial',
      snippetVerbatim: false,
      note: 'the cited source could not be fetched — verdict unavailable',
    }
  }

  try {
    const { text } = await generateText({
      model: anthropic(EXAMINE_MODEL),
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(scene, sourceText),
      maxOutputTokens: 300,
      abortSignal,
    })
    const verdict = parseVerdict(text)
    // Only genuine verdicts are cached — fallbacks stay retryable.
    if (verdict !== FALLBACK_VERDICT) cachePut(key, verdict)
    return verdict
  } catch (err) {
    console.error('[api/cross-examine] verdict generation failed:', err)
    return FALLBACK_VERDICT
  }
}

export async function POST(req: Request): Promise<Response> {
  let body: z.infer<typeof BodySchema>
  try {
    body = BodySchema.parse(await req.json())
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? 'Invalid request: provide { scenes: [{ narration: 1-4000 chars, citations: [{articleTitle, url, snippet, sectionAnchor?}] }] } with 1-6 scenes'
        : 'Request body must be valid JSON'
    return Response.json({ error: message }, { status: 400 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: 'ANTHROPIC_API_KEY is not configured' },
      { status: 503 },
    )
  }

  // Sequential on purpose: at most 6 scenes, and this keeps the archive
  // and model traffic gentle while a reader waits behind one button.
  const verdicts: Verdict[] = []
  for (const scene of body.scenes) {
    verdicts.push(await examineScene(scene, req.signal))
  }

  return Response.json({ verdicts })
}

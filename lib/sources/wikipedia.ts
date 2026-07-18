import { z } from 'zod'
import type { SourceArticle, SourceSection } from './types'

/**
 * Wikipedia (en) API helpers: topic resolution, article fetching with
 * plain-text sections, link harvesting, and related-article selection.
 * All requests carry the Wikimedia-policy User-Agent.
 */

const WIKI_API = 'https://en.wikipedia.org/w/api.php'
const REQUEST_TIMEOUT_MS = 20_000

export const WIKIMEDIA_USER_AGENT =
  'Tome/0.1 (hackathon; contact keanu@keanuc.net)'

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** GET against the MediaWiki action API. Throws descriptive Errors. */
export async function wikiGet(
  params: Record<string, string>,
): Promise<unknown> {
  const search = new URLSearchParams({
    format: 'json',
    formatversion: '2',
    ...params,
  })
  const url = `${WIKI_API}?${search.toString()}`
  let res: Response
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': WIKIMEDIA_USER_AGENT,
        'Api-User-Agent': WIKIMEDIA_USER_AGENT,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    throw new Error(
      `Wikipedia request failed (${params.prop ?? params.list ?? params.action ?? 'query'}): ${errorMessage(err)}`,
    )
  }
  if (!res.ok) {
    throw new Error(
      `Wikipedia API returned HTTP ${res.status} for ${params.prop ?? params.list ?? params.action ?? 'query'}`,
    )
  }
  let body: unknown
  try {
    body = await res.json()
  } catch (err) {
    throw new Error(`Wikipedia API returned non-JSON body: ${errorMessage(err)}`)
  }
  if (body && typeof body === 'object' && 'error' in body) {
    const apiError = (body as { error?: { info?: unknown } }).error
    throw new Error(
      `Wikipedia API error: ${typeof apiError?.info === 'string' ? apiError.info : JSON.stringify(apiError)}`,
    )
  }
  return body
}

// ---------------------------------------------------------------------------
// Topic resolution
// ---------------------------------------------------------------------------

const SearchResponseSchema = z.object({
  query: z
    .object({ search: z.array(z.object({ title: z.string() })) })
    .optional(),
})

const QUERY_FILLER_PATTERNS = [
  /^please\s+/i,
  /^(can|could|would|will) you\s+/i,
  /^tell (me|us)\s+/i,
  /^(narrate|read|show|give) (me |us )?\s*/i,
  /^(the )?(story|tale|history) (of|about|behind)\s+/i,
  /^about\s+/i,
  /^(what|who) (is|are|was|were)\s+/i,
  /^what happened (in|at|during)\s+/i,
] as const

/** Strip conversational filler ("tell me the story of …") from a query. */
export function cleanQuery(query: string): string {
  let out = query.trim()
  let changed = true
  while (changed) {
    changed = false
    for (const re of QUERY_FILLER_PATTERNS) {
      const next = out.replace(re, '').trim()
      if (next !== out && next.length > 0) {
        out = next
        changed = true
      }
    }
  }
  return out || query.trim()
}

async function searchTitle(term: string): Promise<string | undefined> {
  const body = await wikiGet({
    action: 'query',
    list: 'search',
    srsearch: term,
    srnamespace: '0',
    srlimit: '5',
  })
  const parsed = SearchResponseSchema.safeParse(body)
  if (!parsed.success || !parsed.data.query) {
    throw new Error('Wikipedia search returned an unexpected response shape')
  }
  return parsed.data.query.search[0]?.title
}

/** Resolve free text ("story of the seven years war") to an article title. */
export async function resolveTopic(query: string): Promise<string> {
  const q = query.trim()
  if (!q) throw new Error('Cannot resolve an empty query to a Wikipedia topic')
  const cleaned = cleanQuery(q)
  const hit =
    (await searchTitle(cleaned)) ??
    (cleaned !== q ? await searchTitle(q) : undefined)
  if (!hit) throw new Error(`No Wikipedia article found for "${q}"`)
  return hit
}

// ---------------------------------------------------------------------------
// Article fetch (plain-text extract split into sections)
// ---------------------------------------------------------------------------

export type ArticleBudget = {
  /** Max words kept from the lead extract */
  leadWords: number
  /** Max words kept per section */
  sectionWords: number
  /** Max words for the whole article (lead + sections) */
  totalWords: number
}

const ExtractResponseSchema = z.object({
  query: z
    .object({
      pages: z.array(
        z.object({
          title: z.string(),
          missing: z.boolean().optional(),
          extract: z.string().optional(),
        }),
      ),
    })
    .optional(),
})

const BOILERPLATE_SECTION_RE =
  /^(references|external links|see also|bibliography|notes|explanatory notes|further reading|citations|sources|footnotes|gallery|works cited|primary sources|secondary sources)$/i

const HEADING_RE = /^(={2,6})\s*(.+?)\s*\1\s*$/gm

export function countWords(text: string): number {
  if (!text) return 0
  return text.split(/\s+/).filter(Boolean).length
}

export function truncateWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length <= maxWords) return text.trim()
  return `${words.slice(0, maxWords).join(' ')} …`
}

/** Split a plain-text extract (exsectionformat=wiki) into lead + h2 sections. */
export function splitExtract(extract: string): {
  lead: string
  sections: SourceSection[]
} {
  const matches = [...extract.matchAll(HEADING_RE)]
  const lead = (
    matches.length ? extract.slice(0, matches[0].index) : extract
  ).trim()
  const raw: { heading: string; parts: string[] }[] = []
  let current: { heading: string; parts: string[] } | null = null
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const level = m[1].length
    const heading = m[2].trim()
    const start = (m.index ?? 0) + m[0].length
    const end = i + 1 < matches.length ? matches[i + 1].index : extract.length
    const chunk = extract.slice(start, end).trim()
    if (level === 2) {
      if (current) raw.push(current)
      current = { heading, parts: chunk ? [chunk] : [] }
    } else if (current && chunk) {
      // Fold sub-sections into their parent h2 section.
      current.parts.push(chunk)
    }
  }
  if (current) raw.push(current)
  const sections = raw
    .filter((s) => !BOILERPLATE_SECTION_RE.test(s.heading))
    .map((s) => ({
      anchor: s.heading.replace(/ /g, '_'),
      heading: s.heading,
      text: s.parts.join('\n\n').trim(),
    }))
    .filter((s) => s.text.length > 0)
  return { lead, sections }
}

export function articleUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
}

export type FetchedArticle = {
  article: SourceArticle
  /** Untruncated lead — for related-article scoring only */
  rawLead: string
  /** Untruncated lead + section text — for related-article scoring only */
  rawText: string
}

/** Fetch one article, returning both the budgeted article and raw text. */
export async function fetchArticleDetailed(
  title: string,
  budget: ArticleBudget,
): Promise<FetchedArticle> {
  const body = await wikiGet({
    action: 'query',
    prop: 'extracts',
    explaintext: '1',
    exsectionformat: 'wiki',
    redirects: '1',
    titles: title,
  })
  const parsed = ExtractResponseSchema.safeParse(body)
  const page = parsed.success ? parsed.data.query?.pages[0] : undefined
  if (!page || page.missing || !page.extract?.trim()) {
    throw new Error(`Wikipedia article "${title}" could not be fetched`)
  }
  const { lead, sections } = splitExtract(page.extract)
  const leadText = truncateWords(lead, budget.leadWords)
  let remaining = budget.totalWords - countWords(leadText)
  const kept: SourceSection[] = []
  for (const section of sections) {
    if (remaining < 40) break
    const text = truncateWords(
      section.text,
      Math.min(budget.sectionWords, remaining),
    )
    if (!text) continue
    kept.push({ ...section, text })
    remaining -= countWords(text)
  }
  return {
    article: {
      title: page.title,
      url: articleUrl(page.title),
      extract: leadText,
      sections: kept,
    },
    rawLead: lead,
    rawText: [lead, ...sections.map((s) => s.text)].join('\n'),
  }
}

/** Fetch one article as plain text, truncated to the given word budget. */
export async function fetchArticle(
  title: string,
  budget: ArticleBudget,
): Promise<SourceArticle> {
  return (await fetchArticleDetailed(title, budget)).article
}

// ---------------------------------------------------------------------------
// Link harvesting + related-article selection
// ---------------------------------------------------------------------------

const LinksResponseSchema = z.object({
  continue: z.object({ plcontinue: z.string() }).optional(),
  query: z
    .object({
      pages: z.array(
        z.object({
          links: z.array(z.object({ title: z.string() })).optional(),
        }),
      ),
    })
    .optional(),
})

/** All main-namespace links from an article (paginated, capped). */
export async function fetchLinkTitles(
  title: string,
  cap = 900,
): Promise<string[]> {
  const titles: string[] = []
  let plcontinue: string | undefined
  for (let i = 0; i < 3 && titles.length < cap; i++) {
    const body = await wikiGet({
      action: 'query',
      prop: 'links',
      plnamespace: '0',
      pllimit: 'max',
      redirects: '1',
      titles: title,
      ...(plcontinue ? { plcontinue } : {}),
    })
    const parsed = LinksResponseSchema.safeParse(body)
    if (!parsed.success || !parsed.data.query) {
      throw new Error(`Wikipedia links query for "${title}" returned an unexpected shape`)
    }
    for (const page of parsed.data.query.pages) {
      for (const link of page.links ?? []) titles.push(link.title)
    }
    plcontinue = parsed.data.continue?.plcontinue
    if (!plcontinue) break
  }
  return titles.slice(0, cap)
}

const EXCLUDED_TITLE_RE =
  /^(list of|lists of|timeline of|index of|outline of|glossary of|bibliography of|historiography of|order of battle)/i
const YEAR_RE = /^\d{1,4}( BC| BCE| AD| CE)?$/
const EVENT_RE =
  /^(battle|siege|treaty|congress|peace|convention|capture|raid|invasion|fall) of\b/i
const POLITY_RE =
  /^(kingdom|empire|electorate|province|duchy|county|margraviate|principality|republic|house|history|geography|demographics) of\b/i
const GEO_RE =
  /^((north|south|central|latin) america|new world|old world|great britain|united kingdom|united states|british empire|holy roman empire|ottoman empire|russian empire|spanish empire|middle east|far east|east indies|west indies|(western|eastern|central|northern|southern) europe|southeast asia)$/i
const NON_PERSON_WORD_RE =
  /\b(war|wars|battle|siege|treaty|revolution|empire|kingdom|army|navy|regiment|company|engine|machine|university|museum|history|century|dynasty|republic|island|river|ocean|prussia|austria|netherlands|britain|france|spain|portugal|england|scotland|ireland|wales|germany|italy|russia|sweden|poland|saxony|silesia|bohemia|hanover|bavaria|europe|america|asia|africa|india|indies|canada|mexico|china|japan|colony|colonies|coast|states)\b/i
const NON_PERSON_PREFIX_RE =
  /^(east|west|north|south|new|old|upper|lower|royal|holy|fort)\s/i
const NAME_STOPWORD_RE =
  /^(the|of|von|van|de|la|le|du|und|and|great|elder|younger|saint|king|queen|prince|princess|lord|lady|sir|earl|duke|count|baron|general|admiral)$/i

export function stripDisambig(title: string): string {
  return title.replace(/\s*\([^)]*\)\s*$/, '').trim()
}

/** Heuristic: does this title look like a person's name? */
export function isPersonLike(title: string): boolean {
  const name = stripDisambig(title)
  const tokens = name.split(/\s+/)
  if (tokens.length < 2 || tokens.length > 5) return false
  if (NON_PERSON_WORD_RE.test(name) || NON_PERSON_PREFIX_RE.test(name)) {
    return false
  }
  const capitalized = tokens.filter((t) => /^[A-ZÀ-Þ]/.test(t))
  return capitalized.length >= 2
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  let idx = 0
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++
    idx += needle.length
    if (count >= 50) break
  }
  return count
}

/** Distinctive tokens of a person-like name (for fallback text matching). */
function distinctiveNameTokens(name: string): string[] {
  return name
    .split(/\s+/)
    .filter((t) => t.length >= 5 && !NAME_STOPWORD_RE.test(t))
}

/**
 * Pick the most story-relevant sub-articles (key people, battles, treaties):
 * links that actually appear in the main article's text, weighted toward
 * events and person names; generic single-word / polity / continent titles
 * are excluded. Person names also match on distinctive tokens because
 * article text often says "Frederick", not "Frederick the Great".
 * Score against the RAW (untruncated) text so budget cuts don't hide links.
 */
export function pickRelated(
  main: { title: string; lead: string; text: string },
  linkTitles: string[],
  max = 5,
): string[] {
  const fullText = main.text
  const lead = main.lead
  const seenTitles = new Set<string>()
  const bestByName = new Map<string, { title: string; score: number }>()
  for (const title of linkTitles) {
    if (seenTitles.has(title) || title === main.title) continue
    seenTitles.add(title)
    if (EXCLUDED_TITLE_RE.test(title) || YEAR_RE.test(title)) continue
    const name = stripDisambig(title)
    if (name.length < 4 || !name.includes(' ')) continue
    // Parenthetical disambigs are usually the wrong article ("Lord Byron
    // (opera)") — allow only year-style disambigs ("Treaty of Paris (1763)").
    const disambig = title.slice(name.length).trim()
    if (disambig && !/\d{3,4}/.test(disambig)) continue
    if (POLITY_RE.test(name) || GEO_RE.test(name)) continue
    const isEvent = EVENT_RE.test(name)
    const isPerson = !isEvent && isPersonLike(name)
    const occurrences = countOccurrences(fullText, name)
    const tokenOccurrences = isPerson
      ? Math.max(
          0,
          ...distinctiveNameTokens(name).map((t) =>
            countOccurrences(fullText, t),
          ),
        )
      : 0
    if (occurrences === 0 && tokenOccurrences === 0) continue
    const leadOccurrences = countOccurrences(lead, name)
    const score =
      Math.min(occurrences, 8) +
      Math.min(leadOccurrences, 2) * 3 +
      (isEvent ? 14 : 0) +
      (isPerson ? 10 + Math.min(tokenOccurrences, 6) : 0)
    if (score <= 0) continue
    const existing = bestByName.get(name)
    // Same stripped name: prefer higher score, then the disambig-free title.
    if (
      !existing ||
      score > existing.score ||
      (score === existing.score && title.length < existing.title.length)
    ) {
      bestByName.set(name, { title, score })
    }
  }
  return [...bestByName.values()]
    .toSorted((a, b) => b.score - a.score)
    .slice(0, max)
    .map((s) => s.title)
}

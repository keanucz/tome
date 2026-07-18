import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import { z } from 'zod'
import {
  resolveTopic,
  WIKIMEDIA_USER_AGENT,
} from '@/lib/sources/wikipedia'

/**
 * POST /api/converse — an audience with a figure from the book.
 * body: { person, topic, era?, messages: [{role, content}...] }
 * Success: JSON { reply, articleUrl } — the figure answers in character,
 * grounded in their Wikipedia summary. Failure: JSON { error } (400/500/503).
 */

export const maxDuration = 60

const DEFAULT_MODEL = 'claude-sonnet-5'
const MAX_TURNS = 20

const BodySchema = z.object({
  person: z.string().trim().min(2).max(120),
  topic: z.string().trim().max(200).default(''),
  era: z.string().trim().max(120).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(1000),
      }),
    )
    .min(1)
    .max(MAX_TURNS),
})

type WikiGrounding = { extract: string; url: string | null }

/** Small in-memory grounding cache — one Wikipedia summary per figure. */
const groundingCache = new Map<string, WikiGrounding>()
const GROUNDING_CACHE_MAX = 100

async function fetchGrounding(person: string): Promise<WikiGrounding> {
  const key = person.toLowerCase()
  const cached = groundingCache.get(key)
  if (cached) return cached

  let grounding: WikiGrounding = { extract: '', url: null }
  try {
    const title = await resolveTopic(person)
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      { headers: { 'User-Agent': WIKIMEDIA_USER_AGENT } },
    )
    if (res.ok) {
      const data = (await res.json()) as {
        extract?: string
        content_urls?: { desktop?: { page?: string } }
      }
      grounding = {
        extract: data.extract ?? '',
        url: data.content_urls?.desktop?.page ?? null,
      }
    }
  } catch {
    // No grounding found — the figure still answers from the conversation
    // context, instructed below to stay within what it knows.
  }

  if (groundingCache.size >= GROUNDING_CACHE_MAX) {
    const oldest = groundingCache.keys().next().value
    if (oldest !== undefined) groundingCache.delete(oldest)
  }
  groundingCache.set(key, grounding)
  return grounding
}

function personaSystem(
  person: string,
  topic: string,
  era: string | undefined,
  extract: string,
): string {
  return `You are ${person}${era ? `, speaking from your own time (${era})` : ''}.
The reader has just met you inside an illustrated storybook about ${topic || 'your life and times'} and wishes to speak with you.

## Grounding (a modern encyclopedia summary of your life — treat it as your own memory)
${extract || '(No summary available — speak only from what a well-read account of your life would support, and admit uncertainty freely.)'}

## Rules of the audience
- Stay in first person, in character, always. Never mention being an AI, a model, or a book.
- Period voice: dignified, era-appropriate diction — but clear to a modern ear. No modern slang.
- Keep every reply to 2–4 sentences. This is conversation, not lecture.
- Ground every fact in the summary above or in what the reader has said. Never invent events, dates, or quotes.
- You know nothing after your own death; if asked, say so in character ("that lies beyond my final winter", or similar).
- If asked about something outside your knowledge, admit it gracefully, in character.
- You may ask the reader a brief question back when natural.`
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Unexpected error'
}

export async function POST(req: Request): Promise<Response> {
  let parsed: z.infer<typeof BodySchema>
  try {
    parsed = BodySchema.parse(await req.json())
  } catch (err) {
    return Response.json(
      { error: `Invalid request: ${errorMessage(err)}` },
      { status: 400 },
    )
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: 'ANTHROPIC_API_KEY is not configured' },
      { status: 503 },
    )
  }

  const grounding = await fetchGrounding(parsed.person)

  try {
    const result = await generateText({
      model: anthropic(process.env.TOME_MODEL ?? DEFAULT_MODEL),
      system: personaSystem(
        parsed.person,
        parsed.topic,
        parsed.era,
        grounding.extract,
      ),
      messages: parsed.messages,
      maxOutputTokens: 400,
      abortSignal: req.signal,
    })
    return Response.json({
      reply: result.text.trim(),
      articleUrl: grounding.url,
    })
  } catch (err) {
    console.error('[api/converse] failed:', err)
    return Response.json(
      { error: `The audience was interrupted: ${errorMessage(err)}` },
      { status: 500 },
    )
  }
}

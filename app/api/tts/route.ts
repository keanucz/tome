import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { TTS_PROVIDER_IDS } from '@/lib/tts/types'
import { TTS_PROVIDERS, providerVoice } from '@/lib/tts/providers'
import { isCatalogVoice } from '@/lib/tts/voices'

/**
 * GET /api/tts?text=<urlencoded>&provider=<id optional>&voice=<id optional>
 *   → 200 audio (provider mime) on success
 *   → 400 on invalid input, 503 when no server provider is available,
 *     502 when every available provider failed
 * `voice` must come from the curated catalog (persona casting) and only
 * applies to ElevenLabs; other providers keep their own default voice.
 * Audio cached by sha256(provider + voice + text) under .cache/tts/.
 */

export const runtime = 'nodejs'

const MAX_TEXT_LENGTH = 4000
const CACHE_DIR = path.join(process.cwd(), '.cache', 'tts')
const IMMUTABLE = 'public, max-age=31536000, immutable'

const QuerySchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'text is required')
    .max(MAX_TEXT_LENGTH, `text must be at most ${MAX_TEXT_LENGTH} characters`),
  provider: z.enum(TTS_PROVIDER_IDS).optional(),
  voice: z
    .string()
    .refine(isCatalogVoice, 'voice must come from the curated catalog')
    .optional(),
})

function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status })
}

function cacheKey(providerId: string, voice: string, text: string): string {
  return createHash('sha256')
    .update(providerId + voice + text)
    .digest('hex')
}

async function readCache(
  key: string,
): Promise<{ audio: Buffer; mime: string } | null> {
  try {
    const audio = await readFile(path.join(CACHE_DIR, `${key}.mp3`))
    let mime = 'audio/mpeg'
    try {
      const meta: unknown = JSON.parse(
        await readFile(path.join(CACHE_DIR, `${key}.json`), 'utf8'),
      )
      if (
        typeof meta === 'object' &&
        meta !== null &&
        typeof (meta as { mime?: unknown }).mime === 'string'
      ) {
        mime = (meta as { mime: string }).mime
      }
    } catch {
      // Missing/corrupt sidecar — audio/mpeg is correct for all current providers.
    }
    return { audio, mime }
  } catch {
    return null
  }
}

async function writeCache(
  key: string,
  audio: Buffer,
  mime: string,
): Promise<void> {
  // Write via temp file + rename so concurrent readers never see partial audio.
  const finalPath = path.join(CACHE_DIR, `${key}.mp3`)
  const tmpPath = `${finalPath}.${randomUUID()}.tmp`
  await writeFile(tmpPath, audio)
  await rename(tmpPath, finalPath)
  await writeFile(path.join(CACHE_DIR, `${key}.json`), JSON.stringify({ mime }))
}

function audioResponse(
  audio: Buffer,
  mime: string,
  providerId: string,
  cache: 'hit' | 'miss',
): Response {
  return new Response(new Uint8Array(audio), {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Length': String(audio.byteLength),
      'Cache-Control': IMMUTABLE,
      'X-Tts-Provider': providerId,
      'X-Tts-Cache': cache,
    },
  })
}

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url)
  const parsed = QuerySchema.safeParse({
    text: searchParams.get('text') ?? '',
    provider: searchParams.get('provider') ?? undefined,
    voice: searchParams.get('voice') ?? undefined,
  })
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? 'invalid request')
  }
  const { text, provider: preferred, voice: castVoice } = parsed.data

  // Fallback chain in registry order; a preferred provider jumps the queue.
  const available = TTS_PROVIDERS.filter((p) => p.available())
  const candidates = preferred
    ? [
        ...available.filter((p) => p.id === preferred),
        ...available.filter((p) => p.id !== preferred),
      ]
    : available
  if (candidates.length === 0) {
    return jsonError(503, 'No TTS provider available')
  }

  try {
    await mkdir(CACHE_DIR, { recursive: true })
  } catch (error: unknown) {
    console.error('[tts] cache dir creation failed', error)
  }

  for (const provider of candidates) {
    // Persona casting applies to ElevenLabs only — its ids are meaningless
    // to other providers, which keep their defaults.
    const voice =
      castVoice && provider.id === 'elevenlabs'
        ? castVoice
        : providerVoice(provider.id)
    const key = cacheKey(provider.id, voice, text)

    const cached = await readCache(key)
    if (cached) {
      return audioResponse(cached.audio, cached.mime, provider.id, 'hit')
    }

    try {
      const { audio, mime } = await provider.synthesize(text, { voice })
      try {
        await writeCache(key, audio, mime)
      } catch (error: unknown) {
        console.error('[tts] cache write failed', error)
      }
      return audioResponse(audio, mime, provider.id, 'miss')
    } catch (error: unknown) {
      console.error(`[tts] provider ${provider.id} failed`, error)
      // Fall through to the next available provider.
    }
  }

  return jsonError(502, 'All available TTS providers failed')
}

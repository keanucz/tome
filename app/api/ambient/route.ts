import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { generateAmbient } from '@/lib/ambient/runware'

/**
 * GET /api/ambient?prompt=<urlencoded>
 *   → 200 image/jpeg on success (immutable cache headers)
 *   → 400 on invalid prompt, 503 when RUNWARE_API_KEY is missing,
 *     502 when generation or download fails
 * Image bytes cached by sha256(prompt) under .cache/ambient/ — Runware is
 * hit at most once per prompt. Clients treat any non-200 as "no ambient art".
 */

export const runtime = 'nodejs'

const MAX_PROMPT_LENGTH = 600
const CACHE_DIR = path.join(process.cwd(), '.cache', 'ambient')
const IMMUTABLE = 'public, max-age=31536000, immutable'
const DOWNLOAD_TIMEOUT_MS = 30_000
const MIME = 'image/jpeg'

const QuerySchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, 'prompt is required')
    .max(MAX_PROMPT_LENGTH, `prompt must be at most ${MAX_PROMPT_LENGTH} characters`),
})

function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status })
}

function cacheKey(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex')
}

async function readCache(key: string): Promise<Buffer | null> {
  try {
    return await readFile(path.join(CACHE_DIR, `${key}.jpg`))
  } catch {
    return null
  }
}

async function writeCache(key: string, image: Buffer): Promise<void> {
  // Temp file + rename so concurrent readers never see a partial image.
  const finalPath = path.join(CACHE_DIR, `${key}.jpg`)
  const tmpPath = `${finalPath}.${randomUUID()}.tmp`
  await writeFile(tmpPath, image)
  await rename(tmpPath, finalPath)
}

async function downloadImage(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new Error(`image download failed (${res.status}) from ${url}`)
  }
  const image = Buffer.from(await res.arrayBuffer())
  if (image.byteLength === 0) {
    throw new Error(`image download returned 0 bytes from ${url}`)
  }
  return image
}

function imageResponse(image: Buffer, cache: 'hit' | 'miss'): Response {
  return new Response(new Uint8Array(image), {
    status: 200,
    headers: {
      'Content-Type': MIME,
      'Content-Length': String(image.byteLength),
      'Cache-Control': IMMUTABLE,
      'X-Ambient-Cache': cache,
    },
  })
}

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url)
  const parsed = QuerySchema.safeParse({
    prompt: searchParams.get('prompt') ?? '',
  })
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? 'invalid request')
  }
  const { prompt } = parsed.data

  if (!process.env.RUNWARE_API_KEY) {
    return jsonError(503, 'Ambient art unavailable: RUNWARE_API_KEY not configured')
  }

  const key = cacheKey(prompt)
  const cached = await readCache(key)
  if (cached) {
    return imageResponse(cached, 'hit')
  }

  try {
    await mkdir(CACHE_DIR, { recursive: true })
  } catch (error: unknown) {
    console.error('[ambient] cache dir creation failed', error)
  }

  try {
    const { url } = await generateAmbient(prompt)
    const image = await downloadImage(url)
    try {
      await writeCache(key, image)
    } catch (error: unknown) {
      console.error('[ambient] cache write failed', error)
    }
    return imageResponse(image, 'miss')
  } catch (error: unknown) {
    console.error('[ambient] generation failed', error)
    return jsonError(502, 'Ambient art generation failed')
  }
}

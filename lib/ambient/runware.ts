import { randomUUID } from 'node:crypto'

/**
 * Runware ambient chapter art — SECONDARY imagery. Real Commons artifacts are
 * always the primary imagery (see design spec); ambient art arrives async and
 * every failure must degrade to "no ambient art", never a broken page.
 *
 * API: POST https://api.runware.ai/v1 with a JSON task array:
 *   [{ taskType: 'authentication', apiKey },
 *    { taskType: 'imageInference', taskUUID, positivePrompt, ... }]
 * Response: { data: [{ taskType, taskUUID, imageURL, ... }], errors?: [...] }
 */

const RUNWARE_ENDPOINT = 'https://api.runware.ai/v1'
/** FLUX.1 Dev on Runware's model registry. */
const MODEL_ID = 'runware:101@1'
const STYLE_SUFFIX = ', muted period painting, aged canvas, subtle, low contrast'
const IMAGE_WIDTH = 1024
const IMAGE_HEIGHT = 640
const REQUEST_TIMEOUT_MS = 90_000

interface RunwareError {
  message?: string
  error?: string
  code?: string
}

interface RunwareTaskResult {
  taskType?: string
  imageURL?: string
}

function extractErrorMessage(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null
  const errors = (body as { errors?: unknown }).errors
  if (!Array.isArray(errors) || errors.length === 0) return null
  const first = errors[0] as RunwareError
  return (
    first.message ?? first.error ?? first.code ?? JSON.stringify(first).slice(0, 300)
  )
}

function extractImageUrl(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null
  const data = (body as { data?: unknown }).data
  if (!Array.isArray(data)) return null
  for (const entry of data) {
    const result = entry as RunwareTaskResult
    if (
      result.taskType === 'imageInference' &&
      typeof result.imageURL === 'string' &&
      result.imageURL.length > 0
    ) {
      return result.imageURL
    }
  }
  return null
}

/**
 * Generate one ambient image and return its hosted URL. Throws on any
 * failure (missing key, network, API error, malformed response) — callers
 * treat a throw as "no ambient art".
 */
export async function generateAmbient(prompt: string): Promise<{ url: string }> {
  const apiKey = process.env.RUNWARE_API_KEY
  if (!apiKey) throw new Error('RUNWARE_API_KEY not configured')

  const trimmed = prompt.trim()
  if (!trimmed) throw new Error('Runware: empty prompt')

  const tasks = [
    { taskType: 'authentication', apiKey },
    {
      taskType: 'imageInference',
      taskUUID: randomUUID(),
      positivePrompt: trimmed + STYLE_SUFFIX,
      width: IMAGE_WIDTH,
      height: IMAGE_HEIGHT,
      model: MODEL_ID,
      numberResults: 1,
      outputFormat: 'JPEG',
    },
  ]

  const res = await fetch(RUNWARE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tasks),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  const bodyText = await res.text()
  let body: unknown = null
  try {
    body = JSON.parse(bodyText)
  } catch {
    // Non-JSON body — fall through to the status/shape checks below.
  }

  const apiError = extractErrorMessage(body)
  if (!res.ok) {
    throw new Error(
      `Runware request failed (${res.status}): ${apiError ?? bodyText.slice(0, 300)}`,
    )
  }
  if (apiError) {
    throw new Error(`Runware generation error: ${apiError}`)
  }

  const url = extractImageUrl(body)
  if (!url) {
    throw new Error(
      `Runware response missing imageURL: ${bodyText.slice(0, 300)}`,
    )
  }
  return { url }
}

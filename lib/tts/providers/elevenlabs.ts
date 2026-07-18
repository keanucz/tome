import type { TTSProvider } from '../types'

/**
 * ElevenLabs adapter — primary narrator (best storytelling quality).
 * POST https://api.elevenlabs.io/v1/text-to-speech/{voiceId}
 */

/** "George" — well-known public narrative voice on ElevenLabs. */
const DEFAULT_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb'
const MODEL_ID = 'eleven_turbo_v2_5'
const API_BASE = 'https://api.elevenlabs.io/v1/text-to-speech'

/** Effective voice id (env override → public default). Used for cache keys. */
export function elevenLabsVoice(): string {
  return process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID
}

export const elevenLabsProvider: TTSProvider = {
  id: 'elevenlabs',

  available(): boolean {
    return !!process.env.ELEVENLABS_API_KEY
  },

  async synthesize(
    text: string,
    opts?: { voice?: string },
  ): Promise<{ audio: Buffer; mime: string }> {
    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) throw new Error('ELEVENLABS_API_KEY not configured')
    if (!text.trim()) throw new Error('ElevenLabs: empty text')

    const voiceId = opts?.voice || elevenLabsVoice()
    const res = await fetch(`${API_BASE}/${encodeURIComponent(voiceId)}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({ text, model_id: MODEL_ID }),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(
        `ElevenLabs TTS failed (${res.status}): ${detail.slice(0, 300)}`,
      )
    }

    const audio = Buffer.from(await res.arrayBuffer())
    if (audio.byteLength === 0) throw new Error('ElevenLabs returned empty audio')
    return { audio, mime: 'audio/mpeg' }
  },
}

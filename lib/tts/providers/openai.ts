import type { TTSProvider } from '../types'

/**
 * OpenAI TTS adapter — server-side fallback narrator.
 * POST https://api.openai.com/v1/audio/speech
 */

/** 'fable' is OpenAI's storyteller voice — exactly right for a living book. */
const DEFAULT_VOICE = 'fable'
const MODEL = 'gpt-4o-mini-tts'
const API_URL = 'https://api.openai.com/v1/audio/speech'

/** Effective voice name. Used for cache keys. */
export function openAiVoice(): string {
  return DEFAULT_VOICE
}

export const openAiProvider: TTSProvider = {
  id: 'openai',

  available(): boolean {
    return !!process.env.OPENAI_API_KEY
  },

  async synthesize(
    text: string,
    opts?: { voice?: string },
  ): Promise<{ audio: Buffer; mime: string }> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured')
    if (!text.trim()) throw new Error('OpenAI TTS: empty text')

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        input: text,
        voice: opts?.voice || openAiVoice(),
        response_format: 'mp3',
      }),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(
        `OpenAI TTS failed (${res.status}): ${detail.slice(0, 300)}`,
      )
    }

    const audio = Buffer.from(await res.arrayBuffer())
    if (audio.byteLength === 0) throw new Error('OpenAI TTS returned empty audio')
    return { audio, mime: 'audio/mpeg' }
  },
}

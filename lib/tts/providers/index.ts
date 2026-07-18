import type { TTSProvider, TTSProviderId } from '../types'
import { elevenLabsProvider, elevenLabsVoice } from './elevenlabs'
import { openAiProvider, openAiVoice } from './openai'
import { kokoroProvider } from './kokoro'

/**
 * Ordered provider registry. Order is the runtime fallback chain from the
 * spec: ElevenLabs → OpenAI → Kokoro (browser speechSynthesis is the final
 * client-side fallback, outside this registry).
 */
export const TTS_PROVIDERS: readonly TTSProvider[] = [
  elevenLabsProvider,
  openAiProvider,
  kokoroProvider,
]

/**
 * Pick the provider to use. When `preferred` names an available provider it
 * wins; otherwise the first available provider in registry order is used.
 * Returns null when no server-side provider is available (route answers 503
 * and the client falls back to browser speechSynthesis).
 */
export function pickProvider(preferred?: TTSProviderId): TTSProvider | null {
  if (preferred) {
    const match = TTS_PROVIDERS.find((p) => p.id === preferred)
    if (match?.available()) return match
  }
  return TTS_PROVIDERS.find((p) => p.available()) ?? null
}

/** Effective default voice per provider — part of the audio cache key. */
export function providerVoice(id: TTSProviderId): string {
  switch (id) {
    case 'elevenlabs':
      return elevenLabsVoice()
    case 'openai':
      return openAiVoice()
    case 'kokoro':
      return ''
  }
}

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

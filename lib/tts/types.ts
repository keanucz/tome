/**
 * CONTRACT FILE — TTS provider interface. Owned by the orchestrator;
 * agents import, never edit.
 */

export const TTS_PROVIDER_IDS = ['elevenlabs', 'openai', 'kokoro'] as const
export type TTSProviderId = (typeof TTS_PROVIDER_IDS)[number]

export interface TTSProvider {
  id: TTSProviderId
  /** True when the required API key / local server is configured */
  available(): boolean
  /** Synthesize narration audio. Throws on provider failure. */
  synthesize(
    text: string,
    opts?: { voice?: string },
  ): Promise<{ audio: Buffer; mime: string }>
}

/**
 * Server route contract (implemented in app/api/tts/route.ts):
 *   GET /api/tts?text=<urlencoded>&provider=<id optional>
 *   → 200 audio/mpeg (or provider mime) on success
 *   → 503 when no server provider is available (client falls back to
 *     browser speechSynthesis)
 * Server must cache by sha256(provider + voice + text) under .cache/tts/.
 */

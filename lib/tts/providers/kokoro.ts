import type { TTSProvider } from '../types'

/**
 * Kokoro (local) adapter — stub. Per the spec's cut order this is built
 * last and cut first; it reports unavailable so the registry always
 * skips it. Wire a local Kokoro server here if time ever allows.
 */

export const kokoroProvider: TTSProvider = {
  id: 'kokoro',

  available(): boolean {
    return false
  },

  async synthesize(): Promise<{ audio: Buffer; mime: string }> {
    throw new Error('Kokoro not configured')
  },
}

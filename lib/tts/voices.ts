/**
 * Curated ElevenLabs premade-voice catalog for persona matching. The
 * converse route asks the model to cast the closest voice for a historical
 * figure from this list; the /api/tts route only accepts voice ids present
 * here (allowlist — never arbitrary ids from the client).
 */

export type VoiceProfile = {
  id: string
  name: string
  /** Casting notes the model matches a persona against. */
  character: string
}

export const VOICE_CATALOG: VoiceProfile[] = [
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', character: 'warm mature British male, measured storyteller, statesmanlike' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', character: 'deep authoritative British male, formal, commanding, official' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum', character: 'gravelly intense male, hoarse edge, dangerous charisma' },
  { id: '2EiwWnXFnvU5JabPnv8n', name: 'Clyde', character: 'gruff middle-aged military man, war-weary, blunt' },
  { id: 'ZQe5CZNOzWyzPSCn5a3c', name: 'James', character: 'husky calm older male, quiet gravitas, elder statesman' },
  { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill', character: 'trustworthy older American male, plainspoken, grandfatherly' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', character: 'resonant middle-aged American male, narrator, presidential' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', character: 'energetic young adult male, quick, ardent, revolutionary' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', character: 'deep young American male, brooding, romantic intensity' },
  { id: 'GBv7mTt0atIp3Br8iCZE', name: 'Thomas', character: 'soft meditative male, scholarly, gentle clergyman or scientist' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', character: 'clear confident British female, crisp, aristocratic' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', character: 'warm middle-aged British female, velvety, cultured' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', character: 'warm friendly American female, bright, inquisitive' },
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', character: 'calm composed American female, thoughtful, precise' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', character: 'soft young American female, gentle, earnest' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', character: 'sultry continental-European accented female, worldly, magnetic' },
]

const VOICE_IDS = new Set(VOICE_CATALOG.map((v) => v.id))

export function isCatalogVoice(id: string): boolean {
  return VOICE_IDS.has(id)
}

/** Rendered for the casting prompt: one line per voice. */
export function catalogForPrompt(): string {
  return VOICE_CATALOG.map((v) => `- ${v.id} — ${v.name}: ${v.character}`).join(
    '\n',
  )
}

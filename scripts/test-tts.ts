/**
 * Live smoke test for TTS providers. Run: npx -y tsx scripts/test-tts.ts
 *
 * Loads .env.local, calls each available provider directly with a short
 * sentence, writes .cache/tts-test-<id>.mp3 (first one also copied to
 * .cache/tts-test.mp3), asserts >10KB and MP3 magic bytes.
 * Exits 1 on any failure; exits 0 with a notice when no keys are present.
 */

import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { TTS_PROVIDERS } from '../lib/tts/providers'

const ROOT = path.resolve(__dirname, '..')
const CACHE_DIR = path.join(ROOT, '.cache')
const SENTENCE =
  'The old king closed his book, and the candle guttered out at last.'
const MIN_BYTES = 10 * 1024

async function loadEnvLocal(): Promise<void> {
  try {
    const raw = await readFile(path.join(ROOT, '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim())
      if (!match) continue
      const [, key, rawValue] = match
      const value = rawValue.replace(/^['"]|['"]$/g, '').trim()
      if (value && !process.env[key]) process.env[key] = value
    }
  } catch {
    // No .env.local — rely on the ambient environment.
  }
}

function isMp3(buf: Buffer): boolean {
  if (buf.length < 3) return false
  const id3 = buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33
  const frameSync = buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0
  return id3 || frameSync
}

async function main(): Promise<void> {
  await loadEnvLocal()
  await mkdir(CACHE_DIR, { recursive: true })

  const available = TTS_PROVIDERS.filter((p) => p.available())
  console.log(
    'Provider availability:',
    TTS_PROVIDERS.map((p) => `${p.id}=${p.available()}`).join(' '),
  )
  if (available.length === 0) {
    console.log('No API keys present in .env.local — nothing to live-test.')
    return
  }

  let failures = 0
  let firstFile: string | null = null
  for (const provider of available) {
    const started = Date.now()
    try {
      const { audio, mime } = await provider.synthesize(SENTENCE)
      const file = path.join(CACHE_DIR, `tts-test-${provider.id}.mp3`)
      await writeFile(file, audio)
      const ok = audio.byteLength > MIN_BYTES && isMp3(audio)
      if (!ok) {
        failures++
        console.error(
          `FAIL ${provider.id}: ${audio.byteLength} bytes, mime=${mime}, ` +
            `mp3Magic=${isMp3(audio)} (need >${MIN_BYTES} bytes + mp3 magic)`,
        )
        continue
      }
      if (!firstFile) firstFile = file
      console.log(
        `PASS ${provider.id}: ${audio.byteLength} bytes, mime=${mime}, ` +
          `mp3 magic ok, ${Date.now() - started}ms → ${file}`,
      )
    } catch (error: unknown) {
      failures++
      const message = error instanceof Error ? error.message : String(error)
      console.error(`FAIL ${provider.id}: ${message}`)
    }
  }

  if (firstFile) {
    await copyFile(firstFile, path.join(CACHE_DIR, 'tts-test.mp3'))
    console.log(`Copied first passing output to .cache/tts-test.mp3`)
  }
  if (failures > 0) process.exit(1)
}

main().catch((error: unknown) => {
  console.error('test-tts crashed:', error)
  process.exit(1)
})

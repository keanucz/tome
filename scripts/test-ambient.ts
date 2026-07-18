/**
 * Live smoke test for Runware ambient art. Run: npx -y tsx scripts/test-ambient.ts
 *
 * Loads .env.local, calls generateAmbient with a Seven Years' War prompt,
 * downloads the hosted image, asserts >20KB and JPEG magic bytes, and saves
 * it to .cache/ambient-test.jpg. Exits 1 on any failure; exits 0 with a
 * notice when RUNWARE_API_KEY is absent.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { generateAmbient } from '../lib/ambient/runware'

const ROOT = path.resolve(__dirname, '..')
const CACHE_DIR = path.join(ROOT, '.cache')
const OUT_FILE = path.join(CACHE_DIR, 'ambient-test.jpg')
const PROMPT =
  'Prussian grenadiers advancing through cannon smoke at dusk, ' +
  'Seven Years War battlefield, 18th century oil painting'
const MIN_BYTES = 20 * 1024
const DOWNLOAD_TIMEOUT_MS = 30_000

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

function isJpeg(buf: Buffer): boolean {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
}

async function main(): Promise<void> {
  await loadEnvLocal()

  if (!process.env.RUNWARE_API_KEY) {
    console.log('RUNWARE_API_KEY not present in .env.local — nothing to live-test.')
    return
  }

  await mkdir(CACHE_DIR, { recursive: true })

  const started = Date.now()
  const { url } = await generateAmbient(PROMPT)
  const generatedMs = Date.now() - started
  console.log(`generateAmbient OK in ${generatedMs}ms → ${url}`)

  const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
  if (!res.ok) {
    throw new Error(`image download failed (${res.status}) from ${url}`)
  }
  const image = Buffer.from(await res.arrayBuffer())
  await writeFile(OUT_FILE, image)

  const failures: string[] = []
  if (image.byteLength <= MIN_BYTES) {
    failures.push(`size ${image.byteLength} bytes — need >${MIN_BYTES}`)
  }
  if (!isJpeg(image)) {
    failures.push('missing JPEG magic bytes (FF D8 FF)')
  }
  if (failures.length > 0) {
    console.error(`FAIL: ${failures.join('; ')} (saved to ${OUT_FILE})`)
    process.exit(1)
  }

  console.log(
    `PASS: ${image.byteLength} bytes, JPEG magic ok, ` +
      `total ${Date.now() - started}ms → ${OUT_FILE}`,
  )
}

main().catch((error: unknown) => {
  console.error('test-ambient crashed:', error)
  process.exit(1)
})

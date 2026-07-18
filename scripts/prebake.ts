/**
 * Prebake demo stories (track G — demo insurance).
 *
 * For each showcase topic: build a live Wikipedia corpus, weave the full
 * Story with the exact same streamObject call as POST /api/story, validate
 * with StorySchema, write public/prebaked/<slug>.json, then warm the TTS
 * cache page-by-page via the running dev server (port 4000) and save each
 * page's narration mp3 to public/prebaked/audio/<slug>/<pageIndex>.mp3.
 * Finally rebuilds public/prebaked/manifest.json from what is on disk.
 *
 * Topics run SEQUENTIALLY (Wikipedia rate limits; TTS warmed one page at a
 * time). A topic failure is logged and skipped — partial bakes still count.
 *
 * Run all:      npx -y tsx scripts/prebake.ts
 * Run subset:   npx -y tsx scripts/prebake.ts ada-lovelace french-revolution
 * Requires ANTHROPIC_API_KEY in .env.local and the dev server on :4000.
 */
import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { anthropic } from '@ai-sdk/anthropic'
import { streamObject } from 'ai'
import { z } from 'zod'
import { buildCorpus } from '../lib/sources/corpus'
import type { SourceCorpus } from '../lib/sources/types'
import { PREBAKED, type PrebakedEntry } from '../lib/story/prebaked'
import { buildStoryPrompt } from '../lib/story/prompt'
import {
  pageNarration,
  StorySchema,
  type Page,
  type Story,
} from '../lib/story/schema'

const DEFAULT_MODEL = 'claude-sonnet-5'
const MAX_OUTPUT_TOKENS = 24_000
const WEAVE_ATTEMPTS = 2
const TTS_BASE = process.env.TOME_TTS_BASE ?? 'http://localhost:4000'
const TTS_TIMEOUT_MS = 120_000
const MIN_AUDIO_BYTES = 10_240
const PREBAKED_DIR = path.resolve(__dirname, '..', 'public', 'prebaked')

const BakedFileSchema = z.object({
  topic: z.string(),
  slug: z.string(),
  story: StorySchema,
  bakedAt: z.string(),
})

interface ManifestEntry {
  slug: string
  topic: string
  title: string
  pages: number
  audioFiles: string[]
}

function loadEnvLocal(): void {
  const envPath = path.resolve(__dirname, '..', '.env.local')
  let raw: string
  try {
    raw = readFileSync(envPath, 'utf8')
  } catch {
    return
  }
  for (const line of raw.split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (!match) continue
    const value = match[2].trim().replace(/^["']|["']$/g, '')
    if (value && !process.env[match[1]]) process.env[match[1]] = value
  }
}

function elapsed(since: number): string {
  return `${((Date.now() - since) / 1000).toFixed(1)}s`
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

function flattenPages(story: Story): Page[] {
  return story.chapters.flatMap((chapter) => chapter.pages)
}

/** Mirrors app/api/story/route.ts exactly: same model, schema, options. */
async function weaveOnce(corpus: SourceCorpus): Promise<Story> {
  const { system, prompt } = buildStoryPrompt(corpus)
  let streamError: unknown = null
  const result = streamObject({
    model: anthropic(process.env.TOME_MODEL ?? DEFAULT_MODEL),
    schema: StorySchema,
    schemaName: 'Story',
    schemaDescription:
      'An illustrated, narrated storybook woven from the provided sources',
    system,
    prompt,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    providerOptions: {
      anthropic: { structuredOutputMode: 'jsonTool' },
    },
    onError: ({ error }) => {
      streamError = error
      console.error('  [weave] stream error:', errorMessage(error))
    },
  })

  const started = Date.now()
  let lastLine = ''
  for await (const partial of result.partialObjectStream) {
    const chapters = partial.chapters?.length ?? 0
    const pages =
      partial.chapters?.reduce((n, c) => n + (c?.pages?.length ?? 0), 0) ?? 0
    const line = `chapters=${chapters} pages=${pages}`
    if (line !== lastLine) {
      console.log(`  [weave ${elapsed(started)}] ${line}`)
      lastLine = line
    }
  }

  try {
    return StorySchema.parse(await result.object)
  } catch (err) {
    if (streamError !== null) {
      throw new Error(
        `weave stream failed: ${errorMessage(streamError)} (final object: ${errorMessage(err)})`,
      )
    }
    throw err
  }
}

async function weave(corpus: SourceCorpus): Promise<Story> {
  let lastError: unknown = null
  for (let attempt = 1; attempt <= WEAVE_ATTEMPTS; attempt++) {
    try {
      return await weaveOnce(corpus)
    } catch (err) {
      lastError = err
      console.error(
        `  [weave] attempt ${attempt}/${WEAVE_ATTEMPTS} failed: ${errorMessage(err)}`,
      )
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

/**
 * Warm the dev server's TTS cache for every page and save each mp3 under
 * public/prebaked/audio/<slug>/. Sequential on purpose. Per-page failures
 * are logged and skipped so one bad page never sinks the topic.
 */
async function warmNarration(slug: string, story: Story): Promise<number> {
  const audioDir = path.join(PREBAKED_DIR, 'audio', slug)
  await rm(audioDir, { recursive: true, force: true })
  await mkdir(audioDir, { recursive: true })

  const pages = flattenPages(story)
  let saved = 0
  for (let i = 0; i < pages.length; i++) {
    const text = pageNarration(pages[i])
    if (!text) {
      console.warn(`  [tts] page ${i}: empty narration, skipped`)
      continue
    }
    const url = `${TTS_BASE}/api/tts?text=${encodeURIComponent(text)}`
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
      })
      if (!res.ok) {
        console.error(`  [tts] page ${i}: HTTP ${res.status}, skipped`)
        continue
      }
      const audio = Buffer.from(await res.arrayBuffer())
      if (audio.byteLength < MIN_AUDIO_BYTES) {
        console.warn(
          `  [tts] page ${i}: suspiciously small (${audio.byteLength} bytes)`,
        )
      }
      await writeFile(path.join(audioDir, `${i}.mp3`), audio)
      saved++
      console.log(
        `  [tts] page ${i}/${pages.length - 1}: ${audio.byteLength} bytes via ${res.headers.get('x-tts-provider') ?? '?'} (cache ${res.headers.get('x-tts-cache') ?? '?'})`,
      )
    } catch (err) {
      console.error(`  [tts] page ${i} failed: ${errorMessage(err)}, skipped`)
    }
  }
  return saved
}

async function bakeTopic(entry: PrebakedEntry): Promise<boolean> {
  const started = Date.now()
  console.log(`\n=== ${entry.topic} (${entry.slug}) ===`)
  try {
    const corpus = await buildCorpus(entry.topic)
    console.log(
      `  corpus: main="${corpus.main.title}" related=${corpus.related.length} images=${corpus.images.length} (${elapsed(started)})`,
    )
    const story = await weave(corpus)
    const pages = flattenPages(story)
    console.log(
      `  story: "${story.title}" chapters=${story.chapters.length} pages=${pages.length} (${elapsed(started)})`,
    )

    const baked = {
      topic: entry.topic,
      slug: entry.slug,
      story,
      bakedAt: new Date().toISOString(),
    }
    await writeFile(
      path.join(PREBAKED_DIR, `${entry.slug}.json`),
      JSON.stringify(baked, null, 2),
    )

    const savedAudio = await warmNarration(entry.slug, story)
    console.log(
      `  DONE ${entry.slug}: ${pages.length} pages, ${savedAudio} audio files in ${elapsed(started)}`,
    )
    return true
  } catch (err) {
    console.error(`  FAILED ${entry.slug}: ${errorMessage(err)} — continuing`)
    return false
  }
}

/** Rebuild manifest.json from what actually exists on disk. */
async function rebuildManifest(): Promise<ManifestEntry[]> {
  const entries: ManifestEntry[] = []
  for (const { slug } of PREBAKED) {
    const jsonPath = path.join(PREBAKED_DIR, `${slug}.json`)
    let baked: z.infer<typeof BakedFileSchema>
    try {
      baked = BakedFileSchema.parse(
        JSON.parse(await readFile(jsonPath, 'utf8')),
      )
    } catch {
      continue // not baked (yet) — leave it out of the manifest
    }

    const audioDir = path.join(PREBAKED_DIR, 'audio', slug)
    let audioFiles: string[] = []
    try {
      const files = (await readdir(audioDir))
        .filter((f) => /^\d+\.mp3$/.test(f))
        .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
      for (const f of files) {
        const { size } = await stat(path.join(audioDir, f))
        if (size < MIN_AUDIO_BYTES) {
          console.warn(`  [manifest] ${slug}/${f}: only ${size} bytes`)
        }
      }
      audioFiles = files.map((f) => `/prebaked/audio/${slug}/${f}`)
    } catch {
      // no audio dir — story-only bake is still usable
    }

    entries.push({
      slug,
      topic: baked.topic,
      title: baked.story.title,
      pages: flattenPages(baked.story).length,
      audioFiles,
    })
  }

  await writeFile(
    path.join(PREBAKED_DIR, 'manifest.json'),
    JSON.stringify(entries, null, 2),
  )
  return entries
}

async function main(): Promise<void> {
  loadEnvLocal()
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY missing from .env.local — cannot bake.')
    process.exit(2)
  }
  await mkdir(PREBAKED_DIR, { recursive: true })

  const args = process.argv.slice(2)
  const selected =
    args.length > 0
      ? PREBAKED.filter((e) => args.includes(e.slug))
      : [...PREBAKED]
  if (selected.length === 0) {
    console.error(
      `No matching slugs in [${args.join(', ')}]. Known: ${PREBAKED.map((e) => e.slug).join(', ')}`,
    )
    process.exit(2)
  }

  try {
    const probe = await fetch(`${TTS_BASE}/api/tts?text=tome`, {
      signal: AbortSignal.timeout(30_000),
    })
    console.log(`TTS server at ${TTS_BASE}: HTTP ${probe.status}`)
  } catch (err) {
    console.warn(
      `TTS server at ${TTS_BASE} unreachable (${errorMessage(err)}) — stories will bake without audio.`,
    )
  }

  let succeeded = 0
  for (const entry of selected) {
    if (await bakeTopic(entry)) succeeded++
  }

  const manifest = await rebuildManifest()
  console.log(
    `\nmanifest.json: ${manifest.length} stories [${manifest.map((m) => `${m.slug}:${m.pages}p/${m.audioFiles.length}a`).join(', ')}]`,
  )
  console.log(`baked ${succeeded}/${selected.length} topics this run`)
  process.exit(succeeded > 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('prebake crashed:', err)
  process.exit(1)
})

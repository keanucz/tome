/**
 * Live test for the story weave pipeline (track B). Bypasses HTTP: loads the
 * Seven Years' War fixture corpus, calls streamObject directly with the same
 * prompt + schema as POST /api/story, streams partial objects, then validates
 * the final Story:
 *   - StorySchema.parse succeeds
 *   - every scene imageUrl is copied exactly from the fixture image list
 *   - every citation's articleTitle + url reference a fixture article
 *   - citation snippets are verbatim quotes from the corpus (warning only)
 *
 * Run: npx -y tsx scripts/test-weave.ts
 * Requires ANTHROPIC_API_KEY in .env.local.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { anthropic } from '@ai-sdk/anthropic'
import { streamObject } from 'ai'
import { loadFixtureCorpus } from '../lib/story/fixtures'
import { buildStoryPrompt } from '../lib/story/prompt'
import { StorySchema, type Story } from '../lib/story/schema'
import type { SourceCorpus } from '../lib/sources/types'

function loadEnvLocal(): void {
  const path = resolve(__dirname, '..', '.env.local')
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
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

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase()
}

function countScenes(story: Story): number {
  return story.chapters.reduce(
    (n, ch) => n + ch.pages.reduce((m, p) => m + p.scenes.length, 0),
    0,
  )
}

function validateStory(story: Story, corpus: SourceCorpus): {
  failures: string[]
  warnings: string[]
} {
  const failures: string[] = []
  const warnings: string[] = []

  const validUrls = new Set(corpus.images.map((i) => i.url))
  const articles = [corpus.main, ...corpus.related]
  const articleTitles = new Set(articles.map((a) => a.title))
  const articleUrls = new Set(articles.map((a) => a.url))
  const corpusText = normalize(
    articles
      .map((a) => [a.extract, ...a.sections.map((s) => s.text)].join(' '))
      .join(' '),
  )

  story.chapters.forEach((chapter, ci) => {
    chapter.pages.forEach((page, pi) => {
      page.scenes.forEach((scene, si) => {
        const where = `ch${ci + 1}/p${pi + 1}/s${si + 1} (${scene.type})`
        if (pi === 0 && si === 0 && scene.type !== 'chapter-header') {
          warnings.push(`${where}: chapter does not open with chapter-header`)
        }
        if ('imageUrl' in scene && !validUrls.has(scene.imageUrl)) {
          failures.push(`${where}: imageUrl not in fixture list: ${scene.imageUrl}`)
        }
        if (scene.citations.length === 0) {
          failures.push(`${where}: no citations`)
        }
        for (const cite of scene.citations) {
          if (!articleTitles.has(cite.articleTitle)) {
            failures.push(`${where}: unknown articleTitle "${cite.articleTitle}"`)
          }
          if (!articleUrls.has(cite.url)) {
            failures.push(`${where}: unknown citation url ${cite.url}`)
          }
          if (!corpusText.includes(normalize(cite.snippet))) {
            warnings.push(
              `${where}: snippet not verbatim in corpus: "${cite.snippet.slice(0, 60)}..."`,
            )
          }
        }
        if (scene.narration.length > 700) {
          failures.push(`${where}: narration ${scene.narration.length} chars (>700)`)
        }
      })
    })
  })

  return { failures, warnings }
}

async function main(): Promise<void> {
  loadEnvLocal()
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY missing from .env.local — cannot live-test.')
    process.exit(2)
  }

  const corpus = loadFixtureCorpus()
  const { system, prompt } = buildStoryPrompt(corpus)
  const model = process.env.TOME_MODEL ?? 'claude-sonnet-5'
  console.log(`model=${model} | prompt=${prompt.length} chars | images=${corpus.images.length}`)

  const started = Date.now()
  const result = streamObject({
    model: anthropic(model),
    schema: StorySchema,
    schemaName: 'Story',
    system,
    prompt,
    maxOutputTokens: 24_000,
    // Match app/api/story/route.ts: outputFormat mode rejects our union schema
    // as a too-large grammar; jsonTool sends it as a plain tool schema.
    providerOptions: {
      anthropic: { structuredOutputMode: 'jsonTool' },
    },
    onError: ({ error }) => {
      console.error('stream error:', error)
    },
  })

  let lastLine = ''
  for await (const partial of result.partialObjectStream) {
    const chapters = partial.chapters?.length ?? 0
    const pages =
      partial.chapters?.reduce((n, c) => n + (c?.pages?.length ?? 0), 0) ?? 0
    const line = `partial: title=${JSON.stringify(partial.title ?? '…')} chapters=${chapters} pages=${pages}`
    if (line !== lastLine) {
      console.log(`  [${((Date.now() - started) / 1000).toFixed(1)}s] ${line}`)
      lastLine = line
    }
  }

  const story = StorySchema.parse(await result.object)
  const usage = await result.usage
  console.log(`\nfinal object in ${((Date.now() - started) / 1000).toFixed(1)}s`)
  console.log(`title: ${story.title}`)
  console.log(`theme: ${story.theme.era} | ${story.theme.fontPairing} | ${story.theme.textureId}`)
  console.log(
    `chapters=${story.chapters.length} scenes=${countScenes(story)} tokens=${JSON.stringify(usage)}`,
  )

  const { failures, warnings } = validateStory(story, corpus)
  for (const w of warnings) console.warn(`WARN  ${w}`)
  for (const f of failures) console.error(`FAIL  ${f}`)
  console.log(
    `\nvalidation: ${failures.length} failures, ${warnings.length} warnings — ${
      failures.length === 0 ? 'PASS' : 'FAIL'
    }`,
  )
  process.exit(failures.length === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('test-weave crashed:', err)
  process.exit(1)
})

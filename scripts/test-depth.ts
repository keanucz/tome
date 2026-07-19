/** Live check: does tome depth actually produce long, detailed narrations? */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { anthropic } from '@ai-sdk/anthropic'
import { streamObject } from 'ai'
import { buildCorpus } from '../lib/sources/corpus'
import { buildStoryPrompt } from '../lib/story/prompt'
import { StorySchema, type Story } from '../lib/story/schema'

for (const line of readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
  if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2]
}

async function main() {
  const topic = process.argv[2] ?? 'Sándor Petőfi'
  const corpus = await buildCorpus(topic, 'tome')
  const { system, prompt } = buildStoryPrompt(corpus, 'tome')
  const result = streamObject({
    model: anthropic(process.env.TOME_MODEL ?? 'claude-sonnet-5'),
    schema: StorySchema,
    schemaName: 'Story',
    system,
    prompt,
    maxOutputTokens: 40_000,
    providerOptions: { anthropic: { structuredOutputMode: 'jsonTool' } },
  })
  for await (const _ of result.partialObjectStream) {
    // drain
  }
  const story = (await result.object) as Story
  const narrations = story.chapters.flatMap((c) =>
    c.pages.flatMap((p) => p.scenes.map((s) => s.narration.length)),
  )
  const pages = story.chapters.reduce((n, c) => n + c.pages.length, 0)
  const sorted = [...narrations].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const long = narrations.filter((n) => n >= 700).length
  console.log(
    `chapters=${story.chapters.length} pages=${pages} scenes=${narrations.length}`,
  )
  console.log(
    `narration chars: median=${median} min=${sorted[0]} max=${sorted[sorted.length - 1]} >=700: ${long}/${narrations.length}`,
  )
}

main()

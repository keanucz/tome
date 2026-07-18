/**
 * One-off diagnostic: reproduce the french-revolution schema failure and
 * print the exact zod issues from the raw model output. Delete after use.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { anthropic } from '@ai-sdk/anthropic'
import { streamObject } from 'ai'
import { buildCorpus } from '../lib/sources/corpus'
import { buildStoryPrompt } from '../lib/story/prompt'
import { StorySchema } from '../lib/story/schema'

for (const line of readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
  const match = /^([A-Z_]+)=(.*)$/.exec(line.trim())
  if (match && match[2] && !process.env[match[1]]) process.env[match[1]] = match[2]
}

async function main() {
  const corpus = await buildCorpus('The French Revolution', 'chronicle')
  const { system, prompt } = buildStoryPrompt(corpus, 'chronicle')
  const result = streamObject({
    model: anthropic(process.env.TOME_MODEL ?? 'claude-sonnet-5'),
    schema: StorySchema,
    schemaName: 'Story',
    system,
    prompt,
    maxOutputTokens: 24_000,
    providerOptions: { anthropic: { structuredOutputMode: 'jsonTool' } },
  })
  for await (const _ of result.partialObjectStream) {
    // drain
  }
  try {
    await result.object
    console.log('PASSED this time (nondeterministic)')
  } catch (err) {
    const raw =
      (err as { text?: string }).text ??
      ((err as { cause?: { text?: string } }).cause?.text as string | undefined)
    if (!raw) {
      console.log('no raw text on error:', err)
      return
    }
    const parsed = StorySchema.safeParse(JSON.parse(raw))
    if (parsed.success) {
      console.log('raw parses fine?! error was elsewhere:', err)
      return
    }
    console.log(`${parsed.error.issues.length} zod issues; first 12:`)
    for (const issue of parsed.error.issues.slice(0, 12)) {
      console.log('-', issue.path.join('.'), '|', issue.code, '|', issue.message)
    }
  }
}

main()

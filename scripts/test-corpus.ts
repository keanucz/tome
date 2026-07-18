/* eslint-disable no-console */
/**
 * Live smoke test for the Wikipedia/Commons source pipeline.
 * Run: npx -y tsx scripts/test-corpus.ts
 * Exits non-zero if any check fails.
 */
import { buildCorpus } from '../lib/sources/corpus'
import { countWords, WIKIMEDIA_USER_AGENT } from '../lib/sources/wikipedia'
import type { SourceArticle, SourceCorpus } from '../lib/sources/types'

// upload.wikimedia.org rate-limits bursts hard (observed 429s at ~8 rps),
// so pace the checks and back off generously on 429.
const HEAD_CONCURRENCY = 2
const HEAD_PACING_MS = 350
const HEAD_TIMEOUT_MS = 15_000
const HEAD_RETRIES = 3
const CORPUS_WORD_CAP = 25_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** HEAD-check a URL with retries; returns null on success, else a reason. */
async function urlProblem(url: string): Promise<string | null> {
  const headers = { 'User-Agent': WIKIMEDIA_USER_AGENT }
  let lastReason = 'unknown'
  for (let attempt = 0; attempt <= HEAD_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        headers,
        signal: AbortSignal.timeout(HEAD_TIMEOUT_MS),
      })
      if (res.ok) return null
      lastReason = `HEAD ${res.status}`
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after'))
        await sleep(
          Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter, 30) * 1000
            : 3000 * (attempt + 1),
        )
        continue
      }
      if (res.status === 405 || res.status === 501) {
        const getRes = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(HEAD_TIMEOUT_MS),
        })
        await getRes.body?.cancel()
        if (getRes.ok) return null
        lastReason = `GET ${getRes.status}`
      }
      // Other 4xx will not change on retry.
      if (res.status < 500) return lastReason
      await sleep(1000 * (attempt + 1))
    } catch (err) {
      lastReason = err instanceof Error ? err.message : String(err)
      await sleep(1000 * (attempt + 1))
    }
  }
  return lastReason
}

async function checkUrls(urls: readonly string[]): Promise<string[]> {
  const failures: string[] = []
  let next = 0
  async function worker(): Promise<void> {
    while (next < urls.length) {
      const url = urls[next++]
      await sleep(HEAD_PACING_MS)
      const problem = await urlProblem(url)
      if (problem) failures.push(`${url} (${problem})`)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(HEAD_CONCURRENCY, urls.length) }, worker),
  )
  return failures
}

function articleWords(article: SourceArticle): number {
  return (
    countWords(article.extract) +
    article.sections.reduce((sum, s) => sum + countWords(s.text), 0)
  )
}

function summarize(corpus: SourceCorpus): number {
  const mainWords = articleWords(corpus.main)
  console.log(`  topic:  ${corpus.topic}`)
  console.log(
    `  main:   ${corpus.main.title} — ${corpus.main.sections.length} sections, ${mainWords} words`,
  )
  let total = mainWords
  for (const article of corpus.related) {
    const words = articleWords(article)
    total += words
    console.log(
      `  related: ${article.title} — ${article.sections.length} sections, ${words} words`,
    )
  }
  const byKind = corpus.images.reduce<Record<string, number>>((acc, img) => {
    return { ...acc, [img.kind]: (acc[img.kind] ?? 0) + 1 }
  }, {})
  console.log(
    `  images: ${corpus.images.length} (${Object.entries(byKind)
      .map(([k, n]) => `${k}: ${n}`)
      .join(', ')})`,
  )
  console.log(`  corpus total: ${total} words`)
  return total
}

async function runCase(query: string): Promise<string[]> {
  console.log(`\n=== buildCorpus(${JSON.stringify(query)}) ===`)
  const started = Date.now()
  const corpus = await buildCorpus(query)
  console.log(`  built in ${((Date.now() - started) / 1000).toFixed(1)}s`)
  const totalWords = summarize(corpus)

  const problems: string[] = []
  if (!corpus.topic) problems.push('empty topic')
  if (!corpus.main.extract) problems.push('main article has empty extract')
  if (corpus.main.sections.length === 0) problems.push('main article has no sections')
  if (corpus.related.length < 3) {
    problems.push(`only ${corpus.related.length} related articles (want 3-6)`)
  }
  if (corpus.related.length > 6) {
    problems.push(`${corpus.related.length} related articles (want 3-6)`)
  }
  if (corpus.images.length === 0) problems.push('no images gathered')
  if (corpus.images.length > 25) problems.push(`${corpus.images.length} images (cap 25)`)
  if (totalWords > CORPUS_WORD_CAP) {
    problems.push(`corpus is ${totalWords} words (cap ${CORPUS_WORD_CAP})`)
  }
  for (const img of corpus.images) {
    if (!img.license) problems.push(`image missing license: ${img.title}`)
    if (!img.url.startsWith('https://')) problems.push(`non-https url: ${img.url}`)
  }

  const urls = [...new Set(corpus.images.flatMap((i) => [i.url, i.thumbUrl]))]
  console.log(`  validating ${urls.length} image urls (HEAD)...`)
  const failures = await checkUrls(urls)
  for (const url of failures) problems.push(`image url not reachable: ${url}`)

  if (problems.length === 0) {
    console.log('  PASS')
  } else {
    console.log('  FAIL:')
    for (const p of problems) console.log(`   - ${p}`)
  }
  return problems
}

async function main(): Promise<void> {
  const queries = ["Seven Years' War", 'Ada Lovelace']
  let failed = false
  for (const query of queries) {
    try {
      const problems = await runCase(query)
      if (problems.length > 0) failed = true
    } catch (err) {
      failed = true
      console.error(
        `  ERROR: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }
  console.log(failed ? '\nRESULT: FAIL' : '\nRESULT: PASS')
  process.exitCode = failed ? 1 : 0
}

void main()

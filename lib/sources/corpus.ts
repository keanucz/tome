import type { SourceCorpus } from './types'

/**
 * STUB — replaced by the sources agent with a real Wikipedia/Commons
 * pipeline. Contract: resolve a free-text query to a corpus.
 * Must throw a descriptive Error on failure (surfaced as the torn-page state).
 */
export async function buildCorpus(query: string): Promise<SourceCorpus> {
  throw new Error(`buildCorpus not implemented yet (query: ${query})`)
}

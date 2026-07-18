import type { SourceArticle, SourceCorpus, SourceImage } from './types'
import { gatherImages } from './commons'
import {
  countWords,
  fetchArticle,
  fetchArticleDetailed,
  fetchLinkTitles,
  isPersonLike,
  pickRelated,
  resolveTopic,
} from './wikipedia'

/**
 * buildCorpus — resolve a free-text query to a canonical Wikipedia article,
 * fetch it plus 3–6 story-relevant sub-articles, and gather Commons images.
 * Throws a descriptive Error on failure (surfaced as the torn-page state).
 */

// Budgets keep the whole corpus well under ~25k words for the LLM prompt.
const MAIN_BUDGET = { leadWords: 700, sectionWords: 900, totalWords: 8000 }
const RELATED_BUDGET = { leadWords: 350, sectionWords: 450, totalWords: 2200 }
const MAX_RELATED = 5
const CORPUS_WORD_CAP = 25_000

function articleWords(article: SourceArticle): number {
  return (
    countWords(article.extract) +
    article.sections.reduce((sum, s) => sum + countWords(s.text), 0)
  )
}

/** Safety net: trim related articles (whole sections) if over the cap. */
function capRelated(
  related: readonly SourceArticle[],
  budget: number,
): SourceArticle[] {
  const kept: SourceArticle[] = []
  let remaining = budget
  for (const article of related) {
    const lead = countWords(article.extract)
    if (remaining < lead + 40) break
    let sectionBudget = remaining - lead
    const sections = article.sections.filter((s) => {
      const words = countWords(s.text)
      if (words > sectionBudget) return false
      sectionBudget -= words
      return true
    })
    const trimmed = { ...article, sections }
    kept.push(trimmed)
    remaining -= articleWords(trimmed)
  }
  return kept
}

export async function buildCorpus(query: string): Promise<SourceCorpus> {
  const trimmed = query?.trim()
  if (!trimmed) throw new Error('Cannot build a story from an empty query')

  const topic = await resolveTopic(trimmed)
  const { article: main, rawLead, rawText } = await fetchArticleDetailed(
    topic,
    MAIN_BUDGET,
  )

  let linkTitles: string[] = []
  try {
    linkTitles = await fetchLinkTitles(main.title)
  } catch (err) {
    console.warn(
      `[corpus] link harvest failed for "${main.title}", continuing without related articles:`,
      err instanceof Error ? err.message : err,
    )
  }
  const relatedTitles = pickRelated(
    { title: main.title, lead: rawLead, text: rawText },
    linkTitles,
    MAX_RELATED,
  )

  const relatedResults = await Promise.all(
    relatedTitles.map(async (title): Promise<SourceArticle | null> => {
      try {
        return await fetchArticle(title, RELATED_BUDGET)
      } catch (err) {
        console.warn(
          `[corpus] skipping related article "${title}":`,
          err instanceof Error ? err.message : err,
        )
        return null
      }
    }),
  )
  const fetched = relatedResults.filter((a): a is SourceArticle => a !== null)
  const related = capRelated(fetched, CORPUS_WORD_CAP - articleWords(main))

  const personTitles = new Set(
    [main.title, ...related.map((r) => r.title)].filter(isPersonLike),
  )
  let images: SourceImage[] = []
  try {
    images = await gatherImages(
      [main.title, ...related.map((r) => r.title)],
      personTitles,
    )
  } catch (err) {
    console.warn(
      `[corpus] image gathering failed for "${main.title}", continuing without images:`,
      err instanceof Error ? err.message : err,
    )
  }

  return { topic: main.title, main, related, images }
}

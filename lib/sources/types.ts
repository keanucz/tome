/**
 * CONTRACT FILE — shape of the source corpus handed from the Wikipedia
 * pipeline to the story weave. Owned by the orchestrator; agents import,
 * never edit.
 */

export type SourceImage = {
  /** Direct image URL (upload.wikimedia.org), display-ready */
  url: string
  /** Smaller thumb (~640px wide) for fast loading */
  thumbUrl: string
  title: string
  artist?: string
  date?: string
  license: string
  description?: string
  /** Rough classification to help the LLM pick: portrait, map, scene, other */
  kind: 'portrait' | 'map' | 'scene' | 'other'
}

export type SourceSection = {
  anchor: string
  heading: string
  text: string
}

export type SourceArticle = {
  title: string
  url: string
  /** Lead extract, plain text */
  extract: string
  sections: SourceSection[]
}

export type SourceCorpus = {
  /** Resolved canonical topic, e.g. "Seven Years' War" */
  topic: string
  main: SourceArticle
  /** Linked sub-articles: key people, battles, treaties (3–6 of them) */
  related: SourceArticle[]
  /** Commons images gathered across all articles, deduped */
  images: SourceImage[]
}

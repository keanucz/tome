import type {
  SourceArticle,
  SourceCorpus,
  SourceImage,
} from '../sources/types'
import { FONT_PAIRINGS, TEXTURE_IDS } from './schema'

/**
 * Builds the system + user prompt for the story weave. The corpus text and
 * the Commons image list are injected verbatim so the model can (a) quote
 * citations word-for-word and (b) copy image URLs exactly.
 */

/** Character budgets keep the prompt well inside the context window. */
const MAIN_SECTION_CHARS = 3200
const RELATED_SECTION_CHARS = 1500
const RELATED_EXTRACT_CHARS = 1500

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  // Cut at the last sentence end before the limit so quotes stay verbatim.
  const slice = text.slice(0, max)
  const lastStop = slice.lastIndexOf('. ')
  return lastStop > max * 0.5 ? slice.slice(0, lastStop + 1) : slice
}

function renderArticle(
  article: SourceArticle,
  opts: { extractChars: number; sectionChars: number },
): string {
  const parts: string[] = [
    `### ARTICLE: ${article.title}`,
    `URL: ${article.url}`,
    '',
    '[LEAD]',
    truncate(article.extract, opts.extractChars),
  ]
  for (const section of article.sections) {
    parts.push(
      '',
      `[SECTION heading="${section.heading}" anchor="${section.anchor}"]`,
      truncate(section.text, opts.sectionChars),
    )
  }
  return parts.join('\n')
}

function renderImage(image: SourceImage, index: number): string {
  const meta = [
    `kind: ${image.kind}`,
    `title: ${image.title}`,
    image.artist ? `artist: ${image.artist}` : null,
    image.date ? `date: ${image.date}` : null,
  ]
    .filter(Boolean)
    .join(' | ')
  return `${index + 1}. url: ${image.url}\n   ${meta}`
}

const SYSTEM = `You are a master historical storyteller and a master book designer.

You transform verified encyclopedia source material into a living, illustrated
storybook: an audiobook-quality narrative laid out as chapters, pages, and
scenes, dressed in typography, color, and texture true to its historical era.

You write like the finest narrative historians — concrete, vivid, human, and
scrupulously factual. Every fact you narrate comes from the source text you
are given; you never invent events, quotes, dates, or imagery. You design like
a letterpress artisan: palettes, type, and textures that a reader would date
to the period at a glance.

You respond with a single JSON object that exactly matches the provided
schema. No commentary, no markdown — only the object.`

export function buildStoryPrompt(corpus: SourceCorpus): {
  system: string
  prompt: string
} {
  const articles = [
    renderArticle(corpus.main, {
      extractChars: MAIN_SECTION_CHARS,
      sectionChars: MAIN_SECTION_CHARS,
    }),
    ...corpus.related.map((a) =>
      renderArticle(a, {
        extractChars: RELATED_EXTRACT_CHARS,
        sectionChars: RELATED_SECTION_CHARS,
      }),
    ),
  ].join('\n\n')

  const imageList = corpus.images.map(renderImage).join('\n')

  const prompt = `Weave an illustrated storybook about: ${corpus.topic}

## SOURCE TEXT (the only permitted factual basis and the only permitted source of quotes)

${articles}

## IMAGES (the only permitted imageUrl values)

${imageList}

## HARD RULES

1. IMAGE URLS — every \`imageUrl\` MUST be copied character-for-character from
   the IMAGES list above. Never invent, modify, shorten, or re-encode a URL.
   Use each image at most once. Prefer kind=portrait for portrait scenes and
   kind=map for map-plate scenes.
2. CITATIONS — every scene MUST have at least one citation. Each citation's
   \`snippet\` is a short VERBATIM quote (one clause to two sentences, under
   250 characters) copied word-for-word from the SOURCE TEXT above. Its
   \`articleTitle\` and \`url\` MUST match the article the quote came from
   exactly as printed above. When the quote comes from a [SECTION], set
   \`sectionAnchor\` to that section's anchor.
3. NARRATION — each scene's \`narration\` is at most 700 characters of vivid,
   flowing audiobook prose: full sentences, concrete detail, momentum. Never
   bullet-point-speak, never headings, never meta commentary ("in this
   chapter…"), never second person.
4. STRUCTURE — 3 to 4 chapters; 2 to 4 pages per chapter; 1 to 2 scenes per
   page. The FIRST scene of every chapter is a \`chapter-header\` scene.
5. VARIETY — across the book use portraits, map-plates, timelines, and
   letter-quotes. Avoid the same scene type on consecutive pages when
   possible. A \`letter-quote\`'s \`quoteText\` should be a real quoted phrase
   found in the source text whenever one exists.
6. THEME — the \`theme\` must match the historical period of the topic:
   an accurate \`era\` label; \`fontPairing\` chosen from
   ${FONT_PAIRINGS.join(', ')}; palette hex values that evoke period book
   design (paper light, ink dark, readable contrast); \`textureId\` from
   ${TEXTURE_IDS.join(', ')}; and an \`ambientPrompt\` describing chapter art
   in a painting style true to the period.

Begin the book now. Output only the JSON object.`

  return { system: SYSTEM, prompt }
}

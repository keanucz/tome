import type {
  SourceArticle,
  SourceCorpus,
  SourceImage,
} from '../sources/types'
import { FONT_PAIRINGS, TEXTURE_IDS, type StoryDepth } from './schema'

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
schema. No commentary, no markdown — only the object.

CRITICAL OUTPUT ORDER: the reader watches the book materialize as you
stream, so you MUST emit the JSON object's top-level keys in exactly this
order: "title" first, then "subtitle", then "theme", then "chapters". The
cover and era styling must exist before the first chapter is written.
Emitting "chapters" before "title" and "theme" ruins the experience.`

/** Depth → structure targets and narrative density instructions. */
const DEPTH_SPECS: Record<
  StoryDepth,
  { chapters: string; pages: string; density: string; narration: string }
> = {
  pamphlet: {
    chapters: '2 to 3 chapters',
    pages: '2 to 3 pages per chapter',
    density:
      'A brisk, evocative telling — hit the defining moments, keep momentum high.',
    narration: '300 to 500 characters per scene — punchy, propulsive.',
  },
  chronicle: {
    chapters: '4 to 5 chapters',
    pages: '3 to 4 pages per chapter',
    density:
      'A full telling. Give each major phase of the subject its own space; ' +
      'do not fold distinct periods, campaigns, or works into one breath.',
    narration:
      '550 to 750 characters per scene — full paragraphs with concrete detail.',
  },
  tome: {
    chapters: '6 to 9 chapters',
    pages: '3 to 5 pages per chapter',
    density:
      'An exhaustive telling. Cover every major phase of the subject in ' +
      'proportion to the source material. A single narration must never ' +
      'compress more than a few years of a life (or one campaign, one work, ' +
      'one phase of an event). Where the sources give detail — names, ' +
      'places, dates, quotes — use it. Refuse the urge to summarize.',
    narration:
      'At least 750 characters per scene, with NO upper limit — a scene ' +
      'runs as long as its moment deserves. Write like a narrative ' +
      'historian mid-chapter, never like an encyclopedia lead: one scene = ' +
      'one moment or one event, entered in medias res, thick with the ' +
      'names, dates, places, sums, and verbatim phrases the sources ' +
      'provide. Never pad; when the material runs long, prefer MORE scenes ' +
      'and pages over trimming detail. If a scene reads as an overview of ' +
      'a period rather than a moment within it, split it.',
  },
}

export function buildStoryPrompt(
  corpus: SourceCorpus,
  depth: StoryDepth = 'chronicle',
): {
  system: string
  prompt: string
} {
  const depthSpec = DEPTH_SPECS[depth]
  // Deeper tellings get proportionally more source text per section.
  const charScale = depth === 'tome' ? 2 : depth === 'pamphlet' ? 0.6 : 1
  const articles = [
    renderArticle(corpus.main, {
      extractChars: Math.round(MAIN_SECTION_CHARS * charScale),
      sectionChars: Math.round(MAIN_SECTION_CHARS * charScale),
    }),
    ...corpus.related.map((a) =>
      renderArticle(a, {
        extractChars: Math.round(RELATED_EXTRACT_CHARS * charScale),
        sectionChars: Math.round(RELATED_SECTION_CHARS * charScale),
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
3. NARRATION — each scene's \`narration\` is vivid, flowing audiobook
   prose: full sentences, concrete detail, momentum. Length for this
   telling: ${depthSpec.narration} Never bullet-point-speak, never
   headings, never meta commentary ("in this chapter…"), never second
   person.
4. STRUCTURE — ${depthSpec.chapters}; ${depthSpec.pages}; 1 to 3 scenes per
   page. The FIRST scene of every chapter is a \`chapter-header\` scene.
   NARRATIVE DENSITY — ${depthSpec.density} Narration is scene-level
   storytelling, never encyclopedia summary.
   PAGE FILL — every page must read like a FULL page of a printed book,
   never a thin strip of text over blank paper. Write narrations to this
   telling's length target (rule 3). Compose pages deliberately: an
   image scene (portrait or map-plate) is always accompanied on its page by
   a second scene or a full-length narration; timelines and letter-quotes
   pair well with a portrait. Only a chapter-header may stand alone on its
   page.
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
7. KEY ORDER — the reader watches the book materialize as you stream, so emit
   the JSON object's keys in exactly this order: \`title\`, \`subtitle\`,
   \`theme\`, then \`chapters\`. The cover and era styling must appear before
   the first chapter, never after.

Begin the book now. Output only the JSON object, in EXACTLY this shape —
top-level keys title, subtitle, theme, chapters; every scene lives inside
chapters[].pages[].scenes[]. Never emit a top-level "scenes" or "pages"
array; in a long book it is tempting to flatten the structure — do not.`

  return { system: SYSTEM, prompt }
}

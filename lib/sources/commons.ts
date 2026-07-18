import { z } from 'zod'
import type { SourceImage } from './types'
import { stripDisambig, wikiGet } from './wikipedia'

/**
 * Wikimedia Commons image gathering: list image files used on articles,
 * fetch direct URLs + metadata, filter out icons/flags/tiny images, and
 * classify each image (portrait / map / scene / other) heuristically.
 */

const IMAGE_CAP = 25
const MAX_FILES_FOR_METADATA = 140
const IMAGEINFO_BATCH = 50
const THUMB_WIDTH = 640
/**
 * upload.wikimedia.org only serves bucketed thumb widths (960, 1280 verified
 * live; 640/1024/1200 return HTTP 400). Resized thumbs must use a bucket.
 */
const LARGE_THUMB_BUCKET = 1280
const MIN_WIDTH = 300
const MIN_HEIGHT = 240

const USABLE_EXT_RE = /\.(jpe?g|png|webp|tiff?|svg)$/i
const JUNK_TITLE_RE =
  /flag[_ ]|[_ ]flag\b|banner[_ ]of|coat[_ ]of[_ ]arms|\blogo\b|logo[_ .]|icon|seal[_ ]of|emblem|insignia|signature|autograph|monogram|commons-|wikinews|wikiquote|wikisource|wiktionary|wikibooks|wikiversity|wikispecies|wikidata|wikivoyage|\bstub\b|ambox|question[_ ]book|padlock|pog\.svg|arrow|bullet|loudspeaker|speaker[_ ]|sound[_ -]|magnify|searchtool|edit[_ -]|disambig|nuvola|crystal[_ ]clear|gnome-|octicons|blank\.|placeholder|no[_ ]image|missing[_ ]image|default[_ ]image|barnstar|award|ribbon[_ ]bar|screenshot/i

// Classification heuristics (checked in order).
const PORTRAIT_KEYWORD_RE =
  /portrait|porträt|self-portrait|bust of|miniature|daguerreotype|carte de visite|photograph of|engraving of .* by/i
const MAP_RE =
  /\bmaps?\b|\bmapa\b|\bkarte\b|\bcarte\b|cartogra|\batlas\b|campaign[_ ]map|theatre of (war|operations)/i
const SCENE_RE =
  /battle|siege|bombardment|storming|assault|attack|charge|surrender|signing|skirmish|engagement|combat|action of|death of|capture of|massacre|landing|crossing|encampment|coronation|congress of|conference|execution|burning of/i

const ImagesResponseSchema = z.object({
  continue: z.object({ imcontinue: z.string() }).optional(),
  query: z
    .object({
      pages: z.array(
        z.object({
          title: z.string(),
          images: z.array(z.object({ title: z.string() })).optional(),
        }),
      ),
    })
    .optional(),
})

const ImageInfoResponseSchema = z.object({
  query: z
    .object({
      pages: z.array(
        z.object({
          title: z.string(),
          imageinfo: z
            .array(
              z.object({
                url: z.string().optional(),
                thumburl: z.string().optional(),
                width: z.number().optional(),
                height: z.number().optional(),
                mime: z.string().optional(),
                extmetadata: z.unknown().optional(),
              }),
            )
            .optional(),
        }),
      ),
    })
    .optional(),
})

type ImageInfo = NonNullable<
  NonNullable<
    z.infer<typeof ImageInfoResponseSchema>['query']
  >['pages'][number]['imageinfo']
>[number]

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function metaValue(meta: unknown, key: string): string | undefined {
  if (!meta || typeof meta !== 'object') return undefined
  const entry = (meta as Record<string, unknown>)[key]
  if (!entry || typeof entry !== 'object') return undefined
  const value = (entry as { value?: unknown }).value
  if (typeof value === 'number') return String(value)
  if (typeof value !== 'string') return undefined
  const text = stripHtml(value)
  return text || undefined
}

function isUsableFileTitle(fileTitle: string): boolean {
  return USABLE_EXT_RE.test(fileTitle) && !JUNK_TITLE_RE.test(fileTitle)
}

function humanTitle(fileTitle: string): string {
  return fileTitle
    .replace(/^File:/i, '')
    .replace(USABLE_EXT_RE, '')
    .replace(/_/g, ' ')
    .trim()
}

export function classifyImage(
  fileTitle: string,
  description: string | undefined,
  fromArticles: readonly string[],
  personTitles: ReadonlySet<string>,
): SourceImage['kind'] {
  const hay = `${fileTitle} ${description ?? ''}`.replace(/_/g, ' ').toLowerCase()
  if (PORTRAIT_KEYWORD_RE.test(hay)) return 'portrait'
  if (MAP_RE.test(hay)) return 'map'
  if (SCENE_RE.test(hay)) return 'scene'
  for (const person of personTitles) {
    if (hay.includes(stripDisambig(person).toLowerCase())) return 'portrait'
  }
  if (
    fromArticles.length > 0 &&
    fromArticles.every((a) => personTitles.has(a))
  ) {
    return 'portrait'
  }
  return 'other'
}

/** List image file titles used on the given articles, mapped file → articles. */
async function listImageFiles(
  articleTitles: readonly string[],
): Promise<Map<string, string[]>> {
  const fileToArticles = new Map<string, string[]>()
  let imcontinue: string | undefined
  for (let i = 0; i < 5; i++) {
    const body = await wikiGet({
      action: 'query',
      prop: 'images',
      imlimit: 'max',
      titles: articleTitles.join('|'),
      ...(imcontinue ? { imcontinue } : {}),
    })
    const parsed = ImagesResponseSchema.safeParse(body)
    if (!parsed.success || !parsed.data.query) {
      throw new Error('Wikipedia images query returned an unexpected shape')
    }
    for (const page of parsed.data.query.pages) {
      for (const image of page.images ?? []) {
        const articles = fileToArticles.get(image.title) ?? []
        if (!articles.includes(page.title)) {
          fileToArticles.set(image.title, [...articles, page.title])
        }
      }
    }
    imcontinue = parsed.data.continue?.imcontinue
    if (!imcontinue) break
  }
  return fileToArticles
}

/** Fetch imageinfo (url, size, extmetadata) for file titles, batched. */
async function fetchImageInfo(
  fileTitles: readonly string[],
): Promise<Map<string, ImageInfo>> {
  const infoByTitle = new Map<string, ImageInfo>()
  for (let i = 0; i < fileTitles.length; i += IMAGEINFO_BATCH) {
    const batch = fileTitles.slice(i, i + IMAGEINFO_BATCH)
    const body = await wikiGet({
      action: 'query',
      prop: 'imageinfo',
      iiprop: 'url|size|mime|extmetadata',
      iiurlwidth: String(THUMB_WIDTH),
      iiextmetadatafilter:
        'Artist|DateTimeOriginal|DateTime|LicenseShortName|ImageDescription',
      titles: batch.join('|'),
    })
    const parsed = ImageInfoResponseSchema.safeParse(body)
    if (!parsed.success || !parsed.data.query) {
      throw new Error('Commons imageinfo query returned an unexpected shape')
    }
    for (const page of parsed.data.query.pages) {
      const info = page.imageinfo?.[0]
      if (info) infoByTitle.set(page.title, info)
    }
  }
  return infoByTitle
}

/**
 * Swap the width segment of an upload.wikimedia.org thumb URL.
 * Note: the API may serve a bucketed path (e.g. 960px-) even when a 640px
 * thumb was requested, so match any "<n>px-" segment, first occurrence.
 */
function resizeThumb(thumbUrl: string, width: number): string {
  return thumbUrl.replace(/([/-])\d+px-/, `$1${width}px-`)
}

function toSourceImage(
  fileTitle: string,
  info: ImageInfo | undefined,
  fromArticles: readonly string[],
  personTitles: ReadonlySet<string>,
): SourceImage | null {
  if (!info?.url) return null
  const isSvg = /\.svg$/i.test(fileTitle)
  const isTiff = /\.tiff?$/i.test(fileTitle) || info.mime === 'image/tiff'
  const width = info.width ?? 0
  const height = info.height ?? 0
  if (!isSvg && (width < MIN_WIDTH || height < MIN_HEIGHT)) return null
  const description = metaValue(info.extmetadata, 'ImageDescription')?.slice(0, 300)
  const kind = classifyImage(fileTitle, description, fromArticles, personTitles)
  // SVGs are mostly icons/diagrams; only maps are worth keeping.
  if (isSvg && kind !== 'map') return null
  const thumbUrl = info.thumburl ?? info.url
  let url = info.url
  if (isSvg) {
    if (!info.thumburl) return null
    // Rendered PNG, browser-displayable (SVGs scale to any bucket).
    url = resizeThumb(info.thumburl, LARGE_THUMB_BUCKET)
  } else if (isTiff) {
    if (!info.thumburl) return null
    url =
      width > LARGE_THUMB_BUCKET
        ? resizeThumb(info.thumburl, LARGE_THUMB_BUCKET)
        : info.thumburl
  }
  return {
    url,
    thumbUrl,
    title: humanTitle(fileTitle),
    artist: metaValue(info.extmetadata, 'Artist')?.slice(0, 120),
    date:
      metaValue(info.extmetadata, 'DateTimeOriginal')?.slice(0, 80) ??
      metaValue(info.extmetadata, 'DateTime')?.slice(0, 80),
    license: metaValue(info.extmetadata, 'LicenseShortName') ?? 'Unknown',
    description,
    kind,
  }
}

/**
 * Gather usable Commons images across the given articles (main first).
 * `personTitles` biases classification toward 'portrait' for images that
 * mention or belong to person articles.
 */
export async function gatherImages(
  articleTitles: readonly string[],
  personTitles: ReadonlySet<string>,
): Promise<SourceImage[]> {
  if (articleTitles.length === 0) return []
  const fileToArticles = await listImageFiles(articleTitles)
  // Order candidates by article priority (main article's images first).
  const ordered: string[] = []
  const orderedSeen = new Set<string>()
  for (const article of articleTitles) {
    for (const [file, articles] of fileToArticles) {
      if (articles.includes(article) && !orderedSeen.has(file)) {
        orderedSeen.add(file)
        ordered.push(file)
      }
    }
  }
  const candidates = ordered
    .filter(isUsableFileTitle)
    .slice(0, MAX_FILES_FOR_METADATA)
  if (candidates.length === 0) return []
  const infoByTitle = await fetchImageInfo(candidates)
  const images: SourceImage[] = []
  const seenUrls = new Set<string>()
  for (const file of candidates) {
    const image = toSourceImage(
      file,
      infoByTitle.get(file),
      fileToArticles.get(file) ?? [],
      personTitles,
    )
    if (image && !seenUrls.has(image.url)) {
      seenUrls.add(image.url)
      images.push(image)
    }
  }
  // Classified imagery (portrait/map/scene) ahead of 'other', stable order.
  return images
    .toSorted((a, b) => Number(a.kind === 'other') - Number(b.kind === 'other'))
    .slice(0, IMAGE_CAP)
}

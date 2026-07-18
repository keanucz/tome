'use client'

/**
 * MarginGloss — select any phrase on a book page and read its context inline.
 *
 * Watches text selections scoped to .tome-page elements. A valid selection
 * (1..120 chars) summons a small brass ornament button ("Ask the margin")
 * floating near the selection; clicking it opens an anchored parchment
 * popover that fetches POST /api/gloss with the term, its surrounding
 * sentence, and the story topic, then renders the margin note with a
 * "Read on Wikipedia" link. Esc, scroll, click-away, and a new selection
 * dismiss it. Styled after the CitationsPanel marginalia cards; sits at
 * z-index 55 — above the pages, below the citations panel (60/61).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

interface MarginGlossProps {
  topic: string
}

interface Candidate {
  term: string
  sentence: string
  /** Selection bounding rect (viewport coords). */
  rect: { left: number; top: number; right: number; bottom: number }
}

interface PopoverPlacement {
  term: string
  left: number
  width: number
  /** Exactly one of top/bottom is set: below or above the selection. */
  top?: number
  bottom?: number
  /** Never let a long gloss run off the viewport edge. */
  maxHeight: number
  /** Rise direction for the entry animation. */
  rise: 1 | -1
}

interface GlossData {
  gloss: string
  articleTitle: string | null
  url: string | null
  thumbnail?: string
}

type GlossState =
  | { status: 'loading' }
  | { status: 'ready'; data: GlossData }
  | { status: 'error' }

const POPOVER_MAX_WIDTH = 336
const POPOVER_EST_HEIGHT = 320
const VIEWPORT_MARGIN = 12

/** Only link out to real web URLs — API output is treated as untrusted. */
function isHttpUrl(url: string | null): url is string {
  return typeof url === 'string' && /^https?:\/\//i.test(url)
}

function elementOf(node: Node | null | undefined): Element | null {
  if (!node) return null
  return node instanceof Element ? node : node.parentElement
}

const SENTENCE_BLOCK_SELECTOR =
  'p, li, blockquote, h1, h2, h3, h4, figcaption, .tome-scene, .tome-page'

/**
 * The full sentence around the selected term: walk the anchor node's block
 * container text and cut at sentence boundaries on either side. Capped at
 * 500 chars to match the gloss route's contract.
 */
function sentenceAround(node: Node, term: string): string {
  const block =
    elementOf(node)?.closest(SENTENCE_BLOCK_SELECTOR) ?? elementOf(node)
  const full = (block?.textContent ?? node.textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!full) return term
  const idx = full.indexOf(term)
  if (idx === -1) return full.slice(0, 500)
  let start = 0
  for (let i = idx - 1; i > 0; i--) {
    const ch = full[i]
    if ((ch === '.' || ch === '!' || ch === '?') && full[i + 1] === ' ') {
      start = i + 2
      break
    }
  }
  let end = full.length
  for (let i = idx + term.length; i < full.length; i++) {
    const ch = full[i]
    if (ch === '.' || ch === '!' || ch === '?') {
      end = i + 1
      break
    }
  }
  return full.slice(start, end).trim().slice(0, 500)
}

/** Read the live selection into a gloss candidate, or null if not eligible. */
function readSelection(): Candidate | null {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null
  const term = sel.toString().replace(/\s+/g, ' ').trim()
  if (term.length < 1 || term.length > 120) return null
  const anchorEl = elementOf(sel.anchorNode)
  if (!anchorEl?.closest('.tome-page')) return null
  const rect = sel.getRangeAt(0).getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null
  return {
    term,
    sentence: sel.anchorNode ? sentenceAround(sel.anchorNode, term) : term,
    rect: {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    },
  }
}

function placePopover(term: string, rect: Candidate['rect']): PopoverPlacement {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = Math.min(POPOVER_MAX_WIDTH, vw - VIEWPORT_MARGIN * 2)
  const centerX = (rect.left + rect.right) / 2
  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(centerX - width / 2, vw - width - VIEWPORT_MARGIN),
  )
  const roomBelow = vh - rect.bottom - VIEWPORT_MARGIN - 10
  const roomAbove = rect.top - VIEWPORT_MARGIN - 10
  const below = roomBelow >= POPOVER_EST_HEIGHT || roomBelow >= roomAbove
  return below
    ? {
        term,
        left,
        width,
        top: rect.bottom + 10,
        maxHeight: roomBelow,
        rise: 1,
      }
    : {
        term,
        left,
        width,
        bottom: vh - rect.top + 10,
        maxHeight: roomAbove,
        rise: -1,
      }
}

export function MarginGloss({ topic }: MarginGlossProps) {
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [popover, setPopover] = useState<PopoverPlacement | null>(null)
  const [gloss, setGloss] = useState<GlossState>({ status: 'loading' })

  // Our own floating UI — events landing here never dismiss it.
  const rootRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const topicRef = useRef(topic)
  topicRef.current = topic

  const closeAll = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setCandidate(null)
    setPopover(null)
  }, [])

  const openGloss = useCallback((c: Candidate) => {
    setCandidate(null)
    setPopover(placePopover(c.term, c.rect))
    setGloss({ status: 'loading' })
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    fetch('/api/gloss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        term: c.term,
        sentence: c.sentence,
        topic: topicRef.current.slice(0, 200),
      }),
      signal: ctrl.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`gloss request failed (${res.status})`)
        return (await res.json()) as GlossData
      })
      .then((data) => {
        if (ctrl.signal.aborted) return
        if (typeof data?.gloss !== 'string' || !data.gloss) {
          throw new Error('malformed gloss response')
        }
        setGloss({ status: 'ready', data })
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return
        console.error('[margin-gloss] fetch failed:', err)
        setGloss({ status: 'error' })
      })
  }, [])

  const popoverOpenRef = useRef(false)
  popoverOpenRef.current = popover !== null

  useEffect(() => {
    // Selection settles after mouseup / double-click — read it a tick later.
    const onMouseUp = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return
      window.setTimeout(() => setCandidate(readSelection()), 0)
    }
    // Touch devices select via long-press with no mouseup — debounce
    // selectionchange itself so a settled touch selection also summons the
    // ornament. Collapsed selection still dismisses it immediately.
    let touchTimer: number | undefined
    const onSelectionChange = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed) {
        window.clearTimeout(touchTimer)
        setCandidate(null)
        return
      }
      window.clearTimeout(touchTimer)
      touchTimer = window.setTimeout(() => setCandidate(readSelection()), 450)
    }
    // Lifting the finger after a long-press selection reads it right away.
    const onTouchEnd = () => {
      window.setTimeout(() => setCandidate(readSelection()), 50)
    }
    // Click-away dismisses the popover (mousedown, before click handlers).
    const onMouseDown = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return
      if (popoverOpenRef.current) closeAll()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAll()
    }
    // Any scroll (page or inner container) dismisses the floating UI.
    const onScroll = () => {
      setCandidate(null)
      if (popoverOpenRef.current) closeAll()
    }
    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('touchend', onTouchEnd)
    document.addEventListener('selectionchange', onSelectionChange)
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => {
      window.clearTimeout(touchTimer)
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('touchend', onTouchEnd)
      document.removeEventListener('selectionchange', onSelectionChange)
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onScroll, { capture: true })
    }
  }, [closeAll])

  // Abort any in-flight fetch on unmount.
  useEffect(() => () => abortRef.current?.abort(), [])

  const askLeft = candidate
    ? Math.max(
        VIEWPORT_MARGIN,
        Math.min(
          (candidate.rect.left + candidate.rect.right) / 2,
          window.innerWidth - VIEWPORT_MARGIN,
        ),
      )
    : 0
  const askAbove = candidate ? candidate.rect.top > 52 : true
  const askTop = candidate
    ? askAbove
      ? candidate.rect.top - 44
      : candidate.rect.bottom + 10
    : 0

  return (
    <div ref={rootRef}>
      <AnimatePresence>
        {candidate && !popover ? (
          <motion.button
            key="tome-gloss-ask"
            type="button"
            className="tome-gloss-ask"
            style={{ left: askLeft, top: askTop }}
            initial={{ opacity: 0, y: 4, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            // Keep the selection alive when the button is pressed.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => openGloss(candidate)}
            aria-label="Ask the margin"
          >
            <span className="tome-gloss-ask-orn" aria-hidden>
              &#10086;
            </span>
            Ask the margin
          </motion.button>
        ) : null}

        {popover ? (
          <motion.aside
            key="tome-gloss-popover"
            className="tome-gloss-popover"
            role="dialog"
            aria-label={`Margin note on ${popover.term}`}
            style={{
              left: popover.left,
              width: popover.width,
              top: popover.top,
              bottom: popover.bottom,
              maxHeight: popover.maxHeight,
            }}
            initial={{ opacity: 0, y: 10 * popover.rise }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 * popover.rise }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <header className="tome-gloss-head">
              <div>
                <p className="tome-gloss-kicker">From the margin</p>
                <h3 className="tome-gloss-term">{popover.term}</h3>
              </div>
              <button
                type="button"
                className="tome-gloss-close"
                onClick={closeAll}
                aria-label="Close margin note"
              >
                &times;
              </button>
            </header>

            {gloss.status === 'loading' ? (
              <p className="tome-gloss-loading">
                <span aria-hidden>&#10002; </span>
                consulting the margins&hellip;
              </p>
            ) : gloss.status === 'error' ? (
              <p className="tome-gloss-silent">
                the margin is silent on this
              </p>
            ) : (
              <>
                <p className="tome-gloss-body">{gloss.data.gloss}</p>
                {isHttpUrl(gloss.data.url) ? (
                  <footer className="tome-gloss-meta">
                    {gloss.data.articleTitle &&
                    gloss.data.articleTitle.toLowerCase() !==
                      popover.term.toLowerCase() ? (
                      <span className="tome-gloss-article">
                        {gloss.data.articleTitle}
                      </span>
                    ) : null}
                    <a
                      className="tome-gloss-link"
                      href={gloss.data.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Read on Wikipedia
                      <span aria-hidden> &#8599;</span>
                    </a>
                  </footer>
                ) : null}
              </>
            )}
            <div className="tome-gloss-ornament" aria-hidden>
              &#8212; &#10087; &#8212;
            </div>
          </motion.aside>
        ) : null}
      </AnimatePresence>

      <style>{`
        .tome-gloss-ask {
          --tg-ink: var(--ink, #2f2718);
          position: fixed;
          z-index: 55;
          transform: translateX(-50%);
          display: inline-flex;
          align-items: center;
          gap: 0.42em;
          padding: 0.34rem 0.85rem 0.34rem 0.6rem;
          border-radius: 9999px;
          border: 1px solid rgba(122, 92, 41, 0.55);
          background:
            linear-gradient(180deg, rgba(255, 244, 214, 0.16), rgba(0, 0, 0, 0.18)),
            #2b2317;
          color: #ecdcb4;
          font-family: 'Courier New', Courier, monospace;
          font-size: 0.64rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          white-space: nowrap;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(20, 14, 6, 0.45);
          transition: border-color 150ms ease, color 150ms ease;
        }
        .tome-gloss-ask:hover {
          border-color: #c9a45c;
          color: #fff3d6;
        }
        .tome-gloss-ask:focus-visible {
          outline: 2px solid #c9a45c;
          outline-offset: 2px;
        }
        .tome-gloss-ask-orn {
          display: grid;
          place-items: center;
          width: 1.35rem;
          height: 1.35rem;
          border-radius: 9999px;
          border: 1px solid rgba(201, 164, 92, 0.7);
          background: radial-gradient(circle at 35% 30%, #e3c07c, #a97f36 78%);
          color: #241a0c;
          font-size: 0.78rem;
          line-height: 1;
        }

        .tome-gloss-popover {
          --tg-paper: var(--paper, #f6efdd);
          --tg-ink: var(--ink, #2f2718);
          --tg-accent: var(--accent, #8c2f24);
          position: fixed;
          z-index: 55;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
          scrollbar-width: thin;
          background:
            linear-gradient(105deg, rgba(47, 39, 24, 0.06), rgba(47, 39, 24, 0) 16%),
            color-mix(in srgb, #ffffff 30%, var(--tg-paper));
          color: var(--tg-ink);
          border: 1px solid color-mix(in srgb, var(--tg-ink) 16%, transparent);
          border-left: 3px solid var(--tg-accent);
          border-radius: 2px 8px 8px 2px;
          padding: 0.9rem 1.05rem 0.65rem;
          box-shadow:
            0 3px 9px rgba(30, 22, 12, 0.14),
            0 14px 34px -12px rgba(24, 17, 8, 0.5);
          font-family: Georgia, 'Times New Roman', serif;
        }
        .tome-gloss-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 0.5rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid color-mix(in srgb, var(--tg-ink) 14%, transparent);
        }
        .tome-gloss-kicker {
          margin: 0 0 0.18rem;
          font-family: 'Courier New', Courier, monospace;
          font-size: 0.56rem;
          letter-spacing: 0.24em;
          text-transform: uppercase;
          color: color-mix(in srgb, var(--tg-ink) 55%, transparent);
        }
        .tome-gloss-term {
          margin: 0;
          font-size: 1.02rem;
          font-weight: 600;
          font-variant: small-caps;
          letter-spacing: 0.04em;
          line-height: 1.25;
          color: var(--tg-accent);
          overflow-wrap: anywhere;
        }
        .tome-gloss-close {
          flex-shrink: 0;
          width: 1.5rem;
          height: 1.5rem;
          display: grid;
          place-items: center;
          margin-top: 0.05rem;
          border-radius: 9999px;
          border: 1px solid color-mix(in srgb, var(--tg-ink) 28%, transparent);
          background: transparent;
          color: var(--tg-ink);
          font-size: 0.95rem;
          line-height: 1;
          cursor: pointer;
          transition: color 150ms ease, border-color 150ms ease;
        }
        .tome-gloss-close:hover {
          color: var(--tg-accent);
          border-color: var(--tg-accent);
        }
        .tome-gloss-close:focus-visible,
        .tome-gloss-link:focus-visible {
          outline: 2px solid var(--tg-accent);
          outline-offset: 2px;
        }
        .tome-gloss-body {
          margin: 0;
          font-style: italic;
          font-size: 0.9rem;
          line-height: 1.6;
          color: var(--tg-ink);
        }
        .tome-gloss-loading {
          margin: 0.15rem 0 0.25rem;
          font-style: italic;
          font-size: 0.88rem;
          line-height: 1.5;
          background: linear-gradient(
            100deg,
            color-mix(in srgb, var(--tg-ink) 62%, transparent) 30%,
            var(--tg-accent) 50%,
            color-mix(in srgb, var(--tg-ink) 62%, transparent) 70%
          );
          background-size: 220% auto;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: tome-gloss-shimmer 1.7s linear infinite;
        }
        @keyframes tome-gloss-shimmer {
          from { background-position: 110% center; }
          to { background-position: -110% center; }
        }
        .tome-gloss-silent {
          margin: 0.15rem 0 0.25rem;
          font-style: italic;
          font-size: 0.88rem;
          line-height: 1.5;
          color: color-mix(in srgb, var(--tg-ink) 55%, transparent);
        }
        .tome-gloss-meta {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          gap: 0.3rem 0.7rem;
          margin-top: 0.6rem;
          padding-top: 0.5rem;
          border-top: 1px solid color-mix(in srgb, var(--tg-ink) 12%, transparent);
          font-family: 'Courier New', Courier, monospace;
        }
        .tome-gloss-article {
          font-size: 0.6rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          font-weight: 700;
          color: color-mix(in srgb, var(--tg-accent) 85%, var(--tg-ink));
        }
        .tome-gloss-link {
          margin-left: auto;
          font-size: 0.6rem;
          letter-spacing: 0.06em;
          color: var(--tg-accent);
          text-decoration: underline;
          text-underline-offset: 3px;
          text-decoration-color: color-mix(in srgb, var(--tg-accent) 55%, transparent);
        }
        .tome-gloss-link:hover {
          text-decoration-color: var(--tg-accent);
        }
        .tome-gloss-ornament {
          margin: 0.5rem 0 0.05rem;
          text-align: center;
          font-size: 0.62rem;
          letter-spacing: 0.3em;
          color: color-mix(in srgb, var(--tg-accent) 45%, transparent);
        }
        .tome-gloss-link {
          white-space: nowrap;
        }
      `}</style>
    </div>
  )
}

export default MarginGloss

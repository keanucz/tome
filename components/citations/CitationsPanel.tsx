'use client'

/**
 * CitationsPanel — archive marginalia for the current page.
 *
 * A framer-motion side panel that slides in from the right, listing every
 * citation as a marginalia card: verbatim snippet in quotes, source article
 * title, section anchor when present, and an external Wikipedia link.
 * Citations are deduped by url + snippet. Esc and backdrop click close it.
 * Styled against the book's CSS vars (--paper / --ink / --accent) with
 * parchment fallbacks so it also works standalone.
 */

import { useEffect, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Citation } from '@/lib/story/schema'

interface CitationsPanelProps {
  citations: Citation[]
  open: boolean
  onClose: () => void
}

/** Only render anchors for real web URLs — LLM output is untrusted. */
function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

/** Wikipedia section anchors use underscores; show them as readable text. */
function formatAnchor(anchor: string): string {
  return anchor.replace(/[_]+/g, ' ').trim()
}

function dedupeCitations(citations: Citation[]): Citation[] {
  const seen = new Set<string>()
  const out: Citation[] = []
  for (const citation of citations) {
    if (!citation?.url || !citation?.snippet) continue
    const key = `${citation.url}␟${citation.snippet}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(citation)
  }
  return out
}

export function CitationsPanel({
  citations,
  open,
  onClose,
}: CitationsPanelProps) {
  const deduped = useMemo(() => dedupeCitations(citations), [citations])

  // Esc closes while open.
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // Lock body scroll behind the panel while open.
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  return (
    <>
      <AnimatePresence>
        {open ? (
          <motion.div
            key="tome-cite-backdrop"
            className="tome-cite-backdrop"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            aria-hidden="true"
          />
        ) : null}
        {open ? (
          <motion.aside
            key="tome-cite-panel"
            className="tome-cite-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Sources and citations"
            initial={{ x: '105%' }}
            animate={{ x: 0 }}
            exit={{ x: '105%' }}
            transition={{ type: 'tween', duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          >
            <header className="tome-cite-head">
              <div>
                <p className="tome-cite-kicker">From the archive</p>
                <h2 className="tome-cite-title">Marginalia</h2>
              </div>
              <button
                type="button"
                className="tome-cite-close"
                onClick={onClose}
                aria-label="Close citations panel"
              >
                ×
              </button>
            </header>

            <p className="tome-cite-count">
              {deduped.length === 1
                ? '1 source passage'
                : `${deduped.length} source passages`}
            </p>

            <div className="tome-cite-scroll">
              {deduped.length === 0 ? (
                <p className="tome-cite-empty">
                  No sources cited on this page yet — as the book writes
                  itself, its marginalia fill in.
                </p>
              ) : (
                deduped.map((citation, index) => (
                  <article
                    className="tome-cite-card"
                    key={`${citation.url}-${index}`}
                  >
                    <blockquote className="tome-cite-snippet">
                      &ldquo;{citation.snippet}&rdquo;
                    </blockquote>
                    <footer className="tome-cite-meta">
                      <span className="tome-cite-article">
                        {citation.articleTitle}
                      </span>
                      {citation.sectionAnchor ? (
                        <span className="tome-cite-anchor">
                          § {formatAnchor(citation.sectionAnchor)}
                        </span>
                      ) : null}
                      {isHttpUrl(citation.url) ? (
                        <a
                          className="tome-cite-link"
                          href={citation.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Read on Wikipedia
                          <span aria-hidden="true"> ↗</span>
                        </a>
                      ) : null}
                    </footer>
                  </article>
                ))
              )}
            </div>

            <div className="tome-cite-ornament" aria-hidden="true">
              — ❧ —
            </div>
          </motion.aside>
        ) : null}
      </AnimatePresence>

      <style>{`
        .tome-cite-backdrop {
          position: fixed;
          inset: 0;
          z-index: 60;
          background: rgba(24, 17, 8, 0.45);
          backdrop-filter: blur(2px);
        }
        .tome-cite-panel {
          --tc-paper: var(--paper, #f6efdd);
          --tc-ink: var(--ink, #2f2718);
          --tc-accent: var(--accent, #8c2f24);
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          z-index: 61;
          width: min(26rem, 92vw);
          display: flex;
          flex-direction: column;
          background:
            linear-gradient(105deg, rgba(47, 39, 24, 0.07), rgba(47, 39, 24, 0) 12%),
            var(--tc-paper);
          color: var(--tc-ink);
          border-left: 6px double color-mix(in srgb, var(--tc-accent) 65%, transparent);
          box-shadow: -18px 0 44px -18px rgba(24, 17, 8, 0.55);
          font-family: Georgia, 'Times New Roman', serif;
        }
        .tome-cite-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          padding: 1.15rem 1.25rem 0.75rem;
          border-bottom: 1px solid color-mix(in srgb, var(--tc-ink) 18%, transparent);
        }
        .tome-cite-kicker {
          margin: 0 0 0.2rem;
          font-size: 0.62rem;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: color-mix(in srgb, var(--tc-ink) 60%, transparent);
        }
        .tome-cite-title {
          margin: 0;
          font-size: 1.45rem;
          font-weight: 600;
          font-style: italic;
          letter-spacing: 0.01em;
          color: var(--tc-accent);
        }
        .tome-cite-close {
          flex-shrink: 0;
          width: 2rem;
          height: 2rem;
          display: grid;
          place-items: center;
          border-radius: 9999px;
          border: 1px solid color-mix(in srgb, var(--tc-ink) 32%, transparent);
          background: transparent;
          color: var(--tc-ink);
          font-size: 1.15rem;
          line-height: 1;
          cursor: pointer;
          transition: color 150ms ease, border-color 150ms ease, transform 120ms ease;
        }
        .tome-cite-close:hover {
          color: var(--tc-accent);
          border-color: var(--tc-accent);
          transform: rotate(90deg);
        }
        .tome-cite-close:focus-visible,
        .tome-cite-link:focus-visible {
          outline: 2px solid var(--tc-accent);
          outline-offset: 2px;
        }
        .tome-cite-count {
          margin: 0;
          padding: 0.55rem 1.25rem 0;
          font-size: 0.68rem;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: color-mix(in srgb, var(--tc-ink) 55%, transparent);
        }
        .tome-cite-scroll {
          flex: 1;
          overflow-y: auto;
          display: grid;
          align-content: start;
          gap: 0.9rem;
          padding: 0.9rem 1.25rem 1.1rem;
          scrollbar-width: thin;
          scrollbar-color: color-mix(in srgb, var(--tc-ink) 35%, transparent) transparent;
        }
        .tome-cite-card {
          position: relative;
          background: color-mix(in srgb, #ffffff 42%, var(--tc-paper));
          border: 1px solid color-mix(in srgb, var(--tc-ink) 14%, transparent);
          border-left: 3px solid var(--tc-accent);
          border-radius: 2px 6px 6px 2px;
          padding: 0.9rem 1rem 0.75rem 1.05rem;
          box-shadow: 0 2px 6px rgba(30, 22, 12, 0.08);
        }
        .tome-cite-snippet {
          margin: 0 0 0.65rem;
          font-style: italic;
          font-size: 0.94rem;
          line-height: 1.55;
          color: var(--tc-ink);
        }
        .tome-cite-meta {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          gap: 0.35rem 0.7rem;
          font-family: 'Courier New', Courier, monospace;
        }
        .tome-cite-article {
          font-size: 0.68rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          font-weight: 700;
          color: color-mix(in srgb, var(--tc-accent) 85%, var(--tc-ink));
        }
        .tome-cite-anchor {
          font-size: 0.68rem;
          letter-spacing: 0.06em;
          color: color-mix(in srgb, var(--tc-ink) 62%, transparent);
        }
        .tome-cite-link {
          margin-left: auto;
          font-size: 0.68rem;
          letter-spacing: 0.06em;
          color: var(--tc-accent);
          text-decoration: underline;
          text-underline-offset: 3px;
          text-decoration-color: color-mix(in srgb, var(--tc-accent) 55%, transparent);
        }
        .tome-cite-link:hover {
          text-decoration-color: var(--tc-accent);
        }
        .tome-cite-empty {
          margin: 1.4rem 0.25rem;
          font-style: italic;
          text-align: center;
          line-height: 1.6;
          color: color-mix(in srgb, var(--tc-ink) 55%, transparent);
        }
        .tome-cite-ornament {
          padding: 0.4rem 0 0.7rem;
          text-align: center;
          font-size: 0.8rem;
          letter-spacing: 0.3em;
          color: color-mix(in srgb, var(--tc-accent) 55%, transparent);
          border-top: 1px solid color-mix(in srgb, var(--tc-ink) 14%, transparent);
        }
      `}</style>
    </>
  )
}

export default CitationsPanel

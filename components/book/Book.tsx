'use client'

import { AnimatePresence } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Citation, PartialStory } from '@/lib/story/schema'
import { textureClass, themeToCssVars } from '@/lib/story/theme'
import { useNarration } from '@/lib/tts/client'
import { BookPage } from './BookPage'
import { flattenStory, storyFingerprint } from './flatten'
import { PageLeaf } from './PageLeaf'
import { ProgressBar } from './ProgressBar'
import { useMediaQuery } from './useMediaQuery'
import './book.css'

/** How long the stream must stay quiet before the last page counts as done. */
const SETTLE_MS = 4000

/**
 * The living book. Renders a (possibly still-streaming) story as a themed
 * two-page spread (single page on mobile) with 3D page turns, narration that
 * auto-advances the pages, and click-to-cite on every scene.
 */
export function Book({
  story,
  onCite,
  autoNarrate = true,
  narrationSrc,
}: {
  story: PartialStory
  onCite: (c: Citation[]) => void
  autoNarrate?: boolean
  /**
   * Optional pre-recorded narration lookup (prebaked stories): given the
   * 0-based content-page index (cover excluded), return an audio URL to
   * try before live TTS.
   */
  narrationSrc?: (contentPageIndex: number) => string
}) {
  const pages = useMemo(() => flattenStory(story), [story])
  const total = pages.length
  const twoUp = useMediaQuery('(min-width: 920px)')
  const perView = twoUp ? 2 : 1

  const [current, setCurrent] = useState(0)
  const [dir, setDir] = useState(1)
  const clamped = Math.min(current, Math.max(total - 1, 0))
  const spreadStart = twoUp ? clamped - (clamped % 2) : clamped

  const { speak, stop } = useNarration()
  const epoch = useRef(0)
  const lastStarted = useRef(-1)
  const totalRef = useRef(total)
  totalRef.current = total
  const [awaitingNext, setAwaitingNext] = useState(false)

  // ── Stream-settle detection: has the story stopped changing? ──────────────
  const fingerprint = useMemo(() => storyFingerprint(pages), [pages])
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    setSettled(false)
    const t = setTimeout(() => setSettled(true), SETTLE_MS)
    return () => clearTimeout(t)
  }, [fingerprint])

  // A fresh story stream rewinds the book to its cover. Streams only grow,
  // so shrinking back to the bare cover (total <= 1) means a new story began.
  useEffect(() => {
    if (total <= 1 && current !== 0) {
      epoch.current++
      lastStarted.current = -1
      setCurrent(0)
      setDir(1)
    }
  }, [total, current])

  // ── Navigation ────────────────────────────────────────────────────────────
  const goTo = useCallback(
    (idx: number, manual: boolean) => {
      const next = Math.max(0, Math.min(idx, totalRef.current - 1))
      epoch.current++
      lastStarted.current = -1
      setAwaitingNext(false)
      if (manual) stop()
      if (next === clamped) return
      setDir(next > clamped ? 1 : -1)
      setCurrent(next)
    },
    [clamped, stop],
  )
  const goToRef = useRef(goTo)
  goToRef.current = goTo

  const canPrev = spreadStart > 0
  const canNext = spreadStart + perView < total
  const next = useCallback(
    () => goTo(spreadStart + perView, true),
    [goTo, spreadStart, perView],
  )
  const prev = useCallback(
    () => goTo(spreadStart - perView, true),
    [goTo, spreadStart, perView],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev])

  // ── Narration: speak the active page, auto-turn when it finishes ─────────
  const currentPage = pages[clamped]
  // The last page may still be streaming. It is safe to narrate once every
  // scene on it carries at least one citation entry — citations stream last
  // within each scene, so their arrival means the narration is complete.
  // The settle timer stays as a fallback for pages the model never closes.
  const lastPageClosed =
    currentPage !== undefined &&
    currentPage.scenes.length > 0 &&
    currentPage.scenes.every((s) => (s?.citations?.length ?? 0) > 0)
  const pageDone = clamped < total - 1 || settled || lastPageClosed
  useEffect(() => {
    if (!autoNarrate || !currentPage || !pageDone) return
    if (lastStarted.current === clamped) return
    const text = currentPage.narration.trim()
    if (!text) return
    lastStarted.current = clamped
    const my = ++epoch.current
    // The cover always holds flat index 0, so content page N sits at N + 1.
    const preferUrl =
      narrationSrc && clamped > 0 ? narrationSrc(clamped - 1) : undefined
    speak(text, preferUrl).then(() => {
      if (epoch.current !== my) return
      if (clamped + 1 < totalRef.current) goToRef.current(clamped + 1, false)
      else setAwaitingNext(true)
    })
  }, [autoNarrate, pageDone, clamped, currentPage, speak, narrationSrc])

  // A narration finished at the story's edge — advance once more pages arrive.
  useEffect(() => {
    if (awaitingNext && clamped + 1 < total) {
      setAwaitingNext(false)
      goToRef.current(clamped + 1, false)
    }
  }, [awaitingNext, total, clamped])

  // Opening the citations panel silences the narrator so the reader can
  // study the sources; narration resumes on the next page turn.
  const handleCite = useCallback(
    (c: Citation[]) => {
      epoch.current++
      stop()
      onCite(c)
    },
    [onCite, stop],
  )

  // Stop speech when narration is switched off or the book unmounts.
  const stopRef = useRef(stop)
  stopRef.current = stop
  useEffect(() => {
    if (!autoNarrate) {
      epoch.current++
      stopRef.current()
    }
  }, [autoNarrate])
  useEffect(() => () => stopRef.current(), [])

  // ── Render ────────────────────────────────────────────────────────────────
  const themeVars = themeToCssVars(story?.theme)
  const textureCls = textureClass(story?.theme?.textureId)
  const cover = {
    title: story?.title,
    subtitle: story?.subtitle ?? undefined,
    era: story?.theme?.era,
  }
  const visible = twoUp
    ? [pages[spreadStart], pages[spreadStart + 1]]
    : [pages[spreadStart]]

  return (
    <div className={`tome-book ${twoUp ? 'tome-two-up' : 'tome-one-up'}`} style={themeVars}>
      <div className="tome-cover-board">
        <div className="tome-spread">
          <AnimatePresence initial={false}>
            {visible.map((page, i) => {
              const flatIdx = spreadStart + i
              const side = twoUp ? (i === 0 ? 'left' : 'right') : 'single'
              return (
                <PageLeaf
                  key={page?.key ?? `blank-${flatIdx}`}
                  side={side}
                  dir={dir}
                >
                  <BookPage
                    page={page}
                    pageNo={page && page.kind === 'content' ? flatIdx : null}
                    active={flatIdx === clamped}
                    writing={!settled}
                    textureCls={textureCls}
                    onCite={handleCite}
                    cover={cover}
                    ambientPrompt={story?.theme?.ambientPrompt}
                  />
                </PageLeaf>
              )
            })}
          </AnimatePresence>
          {twoUp ? <div className="tome-spine-shadow" aria-hidden /> : null}

          {canPrev ? (
            <button
              type="button"
              className="tome-corner tome-corner-prev"
              onClick={prev}
              aria-label="Previous page"
            />
          ) : null}
          {canNext ? (
            <button
              type="button"
              className="tome-corner tome-corner-next"
              onClick={next}
              aria-label="Next page"
            />
          ) : null}
        </div>

        <button
          type="button"
          className="tome-arrow tome-arrow-prev"
          onClick={prev}
          disabled={!canPrev}
          aria-label="Previous page"
        >
          &#8249;
        </button>
        <button
          type="button"
          className="tome-arrow tome-arrow-next"
          onClick={next}
          disabled={!canNext}
          aria-label="Next page"
        >
          &#8250;
        </button>

        <ProgressBar current={clamped} total={total} writing={!settled} />
      </div>
    </div>
  )
}

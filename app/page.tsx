'use client'

import { useCallback, useRef, useState } from 'react'
import { useObject } from '@ai-sdk/react'
import {
  StorySchema,
  type Citation,
  type PartialStory,
  type StoryDepth,
} from '@/lib/story/schema'
import {
  loadPrebaked,
  PREBAKED,
  prebakedAudioUrl,
  type PrebakedEntry,
} from '@/lib/story/prebaked'
import { simulateStream } from '@/components/book/mockStory'
import { Book } from '@/components/book/Book'
import { VoiceInput } from '@/components/voice/VoiceInput'
import { CitationsPanel } from '@/components/citations/CitationsPanel'

const DISPLAY = { fontFamily: 'var(--font-classical-display), Georgia, serif' }
const BODY = { fontFamily: 'var(--font-classical-body), Georgia, serif' }
const ARCHIVE = { fontFamily: 'var(--font-archive), monospace' }

const DEPTH_OPTIONS: {
  value: StoryDepth
  label: string
  hint: string
}[] = [
  { value: 'pamphlet', label: 'Pamphlet', hint: 'a brisk tale' },
  { value: 'chronicle', label: 'Chronicle', hint: 'the full story' },
  { value: 'tome', label: 'Tome', hint: 'every detail' },
]

const SILENT_STREAM_MESSAGE =
  'The storyteller fell silent before the tale began — the archive may be overloaded. Try again in a moment.'

/**
 * The route reports failures as a JSON body ({ error }) which useObject
 * surfaces raw as error.message — parse it back into the human sentence.
 */
function friendlyError(raw: string | undefined): string {
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw)
      const message = (parsed as { error?: unknown } | null)?.error
      if (typeof message === 'string' && message) return message
    } catch {
      // Not the route's JSON envelope — fall through to the generic line.
    }
  }
  return 'The archive shelves are in disarray — please try again in a moment.'
}

export default function Home() {
  const [started, setStarted] = useState(false)
  const [topic, setTopic] = useState('')
  const [depth, setDepth] = useState<StoryDepth>('chronicle')
  const [citations, setCitations] = useState<Citation[]>([])
  const [citationsOpen, setCitationsOpen] = useState(false)
  // ai v7 textStream drops error parts: a 429/overload can close the stream
  // cleanly with zero content while `error` stays undefined. Local flag.
  const [streamDied, setStreamDied] = useState(false)
  // Prebaked chip path: the story replayed through simulateStream.
  const [prebaked, setPrebaked] = useState<PartialStory | null>(null)
  const [prebakedSlug, setPrebakedSlug] = useState<string | null>(null)
  const cancelSimRef = useRef<(() => void) | null>(null)
  // Bumped on every begin/reset so stale async prebaked loads are ignored.
  const runRef = useRef(0)
  const hasPagesRef = useRef(false)

  const { object, submit, isLoading, error, stop, clear } = useObject({
    api: '/api/story',
    schema: StorySchema,
    onFinish: ({ object: finished }) => {
      // Stream closed without a single page and without a validated story —
      // a silent death (rate limit / overload) the hook never reports.
      if (!hasPagesRef.current && !finished) setStreamDied(true)
    },
  })

  const cancelPrebaked = useCallback(() => {
    cancelSimRef.current?.()
    cancelSimRef.current = null
    setPrebaked(null)
    setPrebakedSlug(null)
  }, [])

  const beginStory = useCallback(
    (query: string) => {
      const trimmed = query.trim()
      if (!trimmed) return
      runRef.current++
      cancelPrebaked()
      setStreamDied(false)
      setTopic(trimmed)
      setStarted(true)
      submit({ topic: trimmed, depth })
    },
    [submit, depth, cancelPrebaked],
  )

  const beginPrebaked = useCallback(
    async (entry: PrebakedEntry) => {
      runRef.current++
      const run = runRef.current
      cancelSimRef.current?.()
      cancelSimRef.current = null
      setStreamDied(false)
      setTopic(entry.topic)
      setStarted(true)
      setPrebaked({}) // the book opens immediately; the sim fills it in
      setPrebakedSlug(entry.slug)
      const story = await loadPrebaked(entry.slug)
      if (runRef.current !== run) return // reader moved on meanwhile
      if (!story) {
        // Not baked (yet) — fall back to the live weave seamlessly.
        setPrebaked(null)
        setPrebakedSlug(null)
        submit({ topic: entry.topic, depth })
        return
      }
      cancelSimRef.current = simulateStream(story, setPrebaked)
    },
    [submit, depth],
  )

  const reset = useCallback(() => {
    runRef.current++
    cancelPrebaked()
    stop()
    clear()
    setStreamDied(false)
    setStarted(false)
    setCitationsOpen(false)
    setCitations([])
  }, [stop, clear, cancelPrebaked])

  const onCite = useCallback((c: Citation[]) => {
    setCitations(c)
    setCitationsOpen(true)
  }, [])

  const hasPages = Boolean(object?.chapters?.some((ch) => ch?.pages?.length))
  hasPagesRef.current = hasPages

  if (!started) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-night px-6 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 70% 55% at 50% 36%, oklch(0.72 0.105 75 / 0.13), transparent 70%)',
          }}
        />
        <p
          className="relative mb-6 text-[11px] uppercase tracking-[0.3em] text-mute"
          style={ARCHIVE}
        >
          The living archive
        </p>
        <h1
          className="relative mb-3 text-6xl tracking-[0.3em] text-vellum sm:text-7xl"
          style={DISPLAY}
        >
          TOME
        </h1>
        <p
          className="relative mb-12 max-w-md text-xl italic text-faint"
          style={{ ...BODY, textWrap: 'balance' }}
        >
          Ask history for a story — watch the book write itself.
        </p>
        <div className="relative w-full max-w-xl">
          <VoiceInput onSubmit={beginStory} />
        </div>
        <div
          className="relative mt-6 flex justify-center"
          role="radiogroup"
          aria-label="Story depth"
        >
          {DEPTH_OPTIONS.map((option, i) => {
            const selected = option.value === depth
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setDepth(option.value)}
                className={`border px-3.5 py-2 text-[10px] uppercase tracking-[0.18em] transition-[border-color,color,scale] duration-150 active:scale-[0.96] ${
                  i === 0 ? 'rounded-l-lg' : '-ml-px'
                } ${i === DEPTH_OPTIONS.length - 1 ? 'rounded-r-lg' : ''} ${
                  selected
                    ? 'relative z-10 border-brass bg-brass/10 text-vellum'
                    : 'border-line text-mute hover:border-brass/50 hover:text-faint'
                }`}
                style={ARCHIVE}
              >
                {option.label}
                <span
                  className={`normal-case tracking-[0.06em] ${
                    selected ? 'text-faint' : ''
                  }`}
                >
                  {' '}
                  &middot; {option.hint}
                </span>
              </button>
            )
          })}
        </div>
        <div className="relative mt-8 flex max-w-xl flex-wrap justify-center gap-2.5">
          {PREBAKED.map((entry) => (
            <button
              key={entry.slug}
              type="button"
              onClick={() => beginPrebaked(entry)}
              className="rounded-full border border-line px-4 py-2 text-[15px] text-faint transition-[border-color,color,scale] duration-150 hover:border-brass hover:text-vellum active:scale-[0.96]"
              style={BODY}
            >
              {entry.topic}
            </button>
          ))}
        </div>
        <p
          className="relative mt-14 max-w-md text-[11px] uppercase tracking-[0.18em] text-mute"
          style={{ ...ARCHIVE, textWrap: 'pretty' }}
        >
          Woven live from Wikipedia &amp; Wikimedia Commons — every passage
          cited — select any phrase for a margin note
        </p>
      </main>
    )
  }

  return (
    <main className="relative min-h-screen bg-night">
      {error || streamDied ? (
        <TornPage
          message={error ? friendlyError(error.message) : SILENT_STREAM_MESSAGE}
          topic={topic}
          onRetry={() => beginStory(topic)}
          onBack={reset}
        />
      ) : prebaked !== null ? (
        <>
          <div className="flex min-h-screen items-center justify-center px-2 py-4">
            <Book
              story={prebaked}
              onCite={onCite}
              autoNarrate
              narrationSrc={
                prebakedSlug
                  ? (i) => prebakedAudioUrl(prebakedSlug, i)
                  : undefined
              }
            />
          </div>
          <button
            type="button"
            onClick={reset}
            className="fixed left-4 top-4 z-50 rounded-lg border border-line bg-night/80 px-3.5 py-2 text-sm text-faint backdrop-blur transition-[border-color,color,scale] duration-150 hover:border-brass hover:text-vellum active:scale-[0.96]"
            style={BODY}
          >
            ← New story
          </button>
          <p
            className="fixed right-4 top-4 z-50 text-[10px] uppercase tracking-[0.24em] text-mute"
            style={ARCHIVE}
          >
            From the archive
          </p>
        </>
      ) : !hasPages && isLoading ? (
        <ConsultingArchives topic={topic} onBack={reset} />
      ) : (
        <>
          <div className="flex min-h-screen items-center justify-center px-2 py-4">
            <Book story={object ?? {}} onCite={onCite} autoNarrate />
          </div>
          <button
            type="button"
            onClick={reset}
            className="fixed left-4 top-4 z-50 rounded-lg border border-line bg-night/80 px-3.5 py-2 text-sm text-faint backdrop-blur transition-[border-color,color,scale] duration-150 hover:border-brass hover:text-vellum active:scale-[0.96]"
            style={BODY}
          >
            ← New story
          </button>
        </>
      )}
      <CitationsPanel
        citations={citations}
        open={citationsOpen}
        onClose={() => setCitationsOpen(false)}
      />
    </main>
  )
}

function ConsultingArchives({
  topic,
  onBack,
}: {
  topic: string
  onBack: () => void
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="mb-7 h-10 w-10 animate-spin rounded-full border-2 border-line border-t-brass" />
      <p
        className="text-2xl italic text-faint"
        style={{
          fontFamily: 'var(--font-classical-body), Georgia, serif',
          textWrap: 'balance',
        }}
      >
        Consulting the archives on “{topic}”…
      </p>
      <p
        className="mt-3 text-[11px] uppercase tracking-[0.18em] text-mute"
        style={ARCHIVE}
      >
        Gathering articles, portraits &amp; maps
      </p>
      <button
        type="button"
        onClick={onBack}
        className="mt-9 px-2 py-2 text-sm text-mute underline-offset-4 transition-[color] duration-150 hover:text-faint hover:underline"
      >
        Never mind — ask something else
      </button>
    </div>
  )
}

function TornPage({
  message,
  topic,
  onRetry,
  onBack,
}: {
  message: string
  topic: string
  onRetry: () => void
  onBack: () => void
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p
        className="mb-4 text-4xl text-vellum"
        style={{ fontFamily: 'var(--font-classical-display), Georgia, serif' }}
      >
        This page is torn
      </p>
      <p
        className="max-w-md text-lg italic text-faint"
        style={{
          fontFamily: 'var(--font-classical-body), Georgia, serif',
          textWrap: 'balance',
        }}
      >
        The archives could not be reached for “{topic}”.
      </p>
      <p className="mt-3 max-w-md break-words text-xs text-mute" style={ARCHIVE}>
        {message}
      </p>
      <div className="mt-9 flex gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-brass px-5 py-2.5 text-sm text-vellum transition-[background-color,scale] duration-150 hover:bg-brass/10 active:scale-[0.96]"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-line px-5 py-2.5 text-sm text-faint transition-[border-color,color,scale] duration-150 hover:border-brass hover:text-vellum active:scale-[0.96]"
        >
          Ask something else
        </button>
      </div>
    </div>
  )
}

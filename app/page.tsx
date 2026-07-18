'use client'

import { useCallback, useState } from 'react'
import { useObject } from '@ai-sdk/react'
import { StorySchema, type Citation } from '@/lib/story/schema'
import { Book } from '@/components/book/Book'
import { VoiceInput } from '@/components/voice/VoiceInput'
import { CitationsPanel } from '@/components/citations/CitationsPanel'

const SAMPLE_QUERIES = [
  "The Seven Years' War",
  'The French Revolution',
  'Ada Lovelace',
  'The Unification of Germany',
]

export default function Home() {
  const [started, setStarted] = useState(false)
  const [topic, setTopic] = useState('')
  const [citations, setCitations] = useState<Citation[]>([])
  const [citationsOpen, setCitationsOpen] = useState(false)

  const { object, submit, isLoading, error, stop, clear } = useObject({
    api: '/api/story',
    schema: StorySchema,
  })

  const beginStory = useCallback(
    (query: string) => {
      const trimmed = query.trim()
      if (!trimmed) return
      setTopic(trimmed)
      setStarted(true)
      submit({ topic: trimmed })
    },
    [submit],
  )

  const reset = useCallback(() => {
    stop()
    clear()
    setStarted(false)
    setCitationsOpen(false)
    setCitations([])
  }, [stop, clear])

  const onCite = useCallback((c: Citation[]) => {
    setCitations(c)
    setCitationsOpen(true)
  }, [])

  const hasPages = Boolean(object?.chapters?.some((ch) => ch?.pages?.length))

  if (!started) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#161008] px-6 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 70% 55% at 50% 38%, rgba(214,164,86,0.16), transparent 70%)',
          }}
        />
        <h1
          className="relative mb-2 text-6xl tracking-[0.35em] text-[#e8d5ae] sm:text-7xl"
          style={{ fontFamily: 'var(--font-classical-display), serif' }}
        >
          TOME
        </h1>
        <p
          className="relative mb-10 max-w-md text-lg italic text-[#a89571]"
          style={{ fontFamily: 'var(--font-classical-body), serif' }}
        >
          Ask history for a story — watch the book write itself.
        </p>
        <div className="relative w-full max-w-xl">
          <VoiceInput onSubmit={beginStory} />
        </div>
        <div className="relative mt-8 flex max-w-xl flex-wrap justify-center gap-2">
          {SAMPLE_QUERIES.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => beginStory(q)}
              className="rounded-full border border-[#5c4a2e] px-4 py-1.5 text-sm text-[#c9b891] transition-colors hover:border-[#a8854a] hover:text-[#ecd9ae]"
              style={{ fontFamily: 'var(--font-classical-body), serif' }}
            >
              {q}
            </button>
          ))}
        </div>
        <p className="relative mt-12 max-w-sm text-xs text-[#6b5b40]">
          Woven live from Wikipedia and Wikimedia Commons. Every passage is
          cited — tap any page to see its sources.
        </p>
      </main>
    )
  }

  return (
    <main className="relative min-h-screen bg-[#161008]">
      {error ? (
        <TornPage
          message={error.message}
          topic={topic}
          onRetry={() => beginStory(topic)}
          onBack={reset}
        />
      ) : !hasPages && isLoading ? (
        <ConsultingArchives topic={topic} onBack={reset} />
      ) : (
        <>
          <Book story={object ?? {}} onCite={onCite} autoNarrate />
          <button
            type="button"
            onClick={reset}
            className="fixed left-4 top-4 z-50 rounded border border-[#5c4a2e] bg-[#161008]/80 px-3 py-1.5 text-sm text-[#c9b891] backdrop-blur transition-colors hover:text-[#ecd9ae]"
            style={{ fontFamily: 'var(--font-classical-body), serif' }}
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
      <div className="mb-6 h-10 w-10 animate-spin rounded-full border-2 border-[#5c4a2e] border-t-[#d6a456]" />
      <p
        className="text-xl italic text-[#c9b891]"
        style={{ fontFamily: 'var(--font-classical-body), serif' }}
      >
        Consulting the archives on “{topic}”…
      </p>
      <p className="mt-2 text-sm text-[#6b5b40]">
        Gathering articles, portraits, and maps from verified sources.
      </p>
      <button
        type="button"
        onClick={onBack}
        className="mt-8 text-sm text-[#6b5b40] underline-offset-4 hover:text-[#c9b891] hover:underline"
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
        className="mb-3 text-3xl text-[#e8d5ae]"
        style={{ fontFamily: 'var(--font-classical-display), serif' }}
      >
        This page is torn
      </p>
      <p
        className="max-w-md italic text-[#a89571]"
        style={{ fontFamily: 'var(--font-classical-body), serif' }}
      >
        The archives could not be reached for “{topic}”.
      </p>
      <p className="mt-2 max-w-md break-words text-xs text-[#6b5b40]">
        {message}
      </p>
      <div className="mt-8 flex gap-4">
        <button
          type="button"
          onClick={onRetry}
          className="rounded border border-[#a8854a] px-4 py-2 text-sm text-[#ecd9ae] transition-colors hover:bg-[#a8854a]/10"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={onBack}
          className="rounded border border-[#5c4a2e] px-4 py-2 text-sm text-[#c9b891] transition-colors hover:text-[#ecd9ae]"
        >
          Ask something else
        </button>
      </div>
    </div>
  )
}

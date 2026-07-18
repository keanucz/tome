'use client'

import { useEffect, useState } from 'react'
import { fontVariables } from '@/app/fonts'
import type { Citation, PartialStory } from '@/lib/story/schema'
import { Book } from './Book'
import { mockStory, simulateStream } from './mockStory'
import './book.css'

/**
 * Dev-only harness for the book renderer (served at /dev-book).
 * Streams the mock story through simulateStream, wires onCite to a simple
 * drawer, and exposes toggles for narration / instant-full rendering.
 */
export default function DevPreview() {
  const [story, setStory] = useState<PartialStory>({})
  const [citations, setCitations] = useState<Citation[] | null>(null)
  const [streamKey, setStreamKey] = useState(0)
  const [instant, setInstant] = useState(false)
  const [narrate, setNarrate] = useState(false)

  useEffect(() => {
    if (instant) {
      setStory(mockStory)
      return
    }
    setStory({})
    return simulateStream(mockStory, setStory)
  }, [instant, streamKey])

  return (
    <div className={`${fontVariables} tome-dev-backdrop`}>
      <Book story={story} onCite={setCitations} autoNarrate={narrate} />

      <div className="tome-dev-controls">
        <button type="button" onClick={() => setStreamKey((k) => k + 1)}>
          Restart stream
        </button>
        <button type="button" onClick={() => setInstant((v) => !v)}>
          {instant ? 'Streamed mode' : 'Instant full story'}
        </button>
        <button type="button" onClick={() => setNarrate((v) => !v)}>
          Narration: {narrate ? 'on' : 'off'}
        </button>
      </div>

      {citations ? (
        <aside className="tome-dev-citations" aria-label="Citations">
          <h3>Sources</h3>
          <button type="button" onClick={() => setCitations(null)}>
            Close
          </button>
          {citations.map((c, i) => (
            <div key={i} className="tome-dev-citation">
              <a href={c.url} target="_blank" rel="noreferrer">
                {c.articleTitle}
              </a>
              <blockquote>&ldquo;{c.snippet}&rdquo;</blockquote>
            </div>
          ))}
        </aside>
      ) : null}
    </div>
  )
}

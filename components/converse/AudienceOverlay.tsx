'use client'

/**
 * AudienceOverlay — a private audience with a figure from the book.
 *
 * A self-contained candlelit modal (portaled to document.body) opened from
 * a portrait scene. The reader asks questions by text or voice; each turn
 * is POSTed to /api/converse and the figure's in-character reply is read
 * aloud via a locally managed HTMLAudioElement hitting /api/tts with the
 * cast voice. While open, it announces itself on window ('tome:audience')
 * so the book narrator falls silent. Esc and backdrop click close it.
 */

import { AnimatePresence, motion } from 'framer-motion'
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

/* ------------------------------------------------------------------ */
/* Minimal Web Speech API typings — SpeechRecognition is not in       */
/* lib.dom; declared locally, same approach as VoiceInput.            */
/* ------------------------------------------------------------------ */

interface SpeechRecognitionAlternativeLike {
  readonly transcript: string
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean
  readonly length: number
  readonly [index: number]: SpeechRecognitionAlternativeLike
}

interface SpeechRecognitionResultListLike {
  readonly length: number
  readonly [index: number]: SpeechRecognitionResultLike
}

interface SpeechRecognitionEventLike {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultListLike
}

interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

type TranscriptEntry =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string }
  | { role: 'note'; content: string }

interface AudienceOverlayProps {
  open: boolean
  onClose: () => void
  person: string
  /** Portrait image, shown small and sepia-framed in the header. */
  portraitUrl?: string
  /** Story title — grounds the conversation. */
  topic?: string
  /** Era label from the theme. */
  era?: string
}

const INTERRUPTED_LINE = 'the audience was interrupted — try again'
/** /api/converse caps each message at 1000 chars and 20 turns. */
const MAX_MESSAGE_CHARS = 1000
const MAX_TURNS = 20
/** Keep the spoken reply under the /api/tts 2000-char limit. */
const TTS_MAX_CHARS = 1900

function isTurn(
  e: TranscriptEntry,
): e is { role: 'user' | 'assistant'; content: string } {
  return e.role === 'user' || e.role === 'assistant'
}

function MicIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="21" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  )
}

/** Transcripts survive page turns and reopen — one per figure, per session. */
const transcriptStore = new Map<string, TranscriptEntry[]>()

/** Book theme custom props snapshotted onto the portal (it escapes the
 *  .tome-book scope, so the vars must travel with it). */
const THEME_VARS = [
  '--paper',
  '--ink',
  '--accent',
  '--gold',
  '--font-display',
  '--font-body',
] as const

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export function AudienceOverlay({
  open,
  onClose,
  person,
  portraitUrl,
  topic,
  era,
}: AudienceOverlayProps) {
  const [mounted, setMounted] = useState(false)
  const [entries, setEntries] = useState<TranscriptEntry[]>([])
  const [value, setValue] = useState('')
  const [pending, setPending] = useState(false)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [micSupported, setMicSupported] = useState(false)

  /** One reply voice at a time — never useNarration (it belongs to the book). */
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const valueRef = useRef('')
  const sessionBaseRef = useRef('')

  useEffect(() => {
    setMounted(true)
    setMicSupported(getSpeechRecognitionCtor() !== null)
  }, [])

  const setFieldValue = useCallback((next: string) => {
    valueRef.current = next
    setValue(next)
  }, [])

  const stopAudio = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
    }
  }, [])

  /** A finished utterance auto-sends after a short pause; typing cancels. */
  const autoSendRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearAutoSend = useCallback(() => {
    if (autoSendRef.current !== null) {
      clearTimeout(autoSendRef.current)
      autoSendRef.current = null
    }
  }, [])

  const stopListening = useCallback(() => {
    clearAutoSend()
    const rec = recognitionRef.current
    recognitionRef.current = null
    if (rec) {
      rec.onresult = null
      rec.onerror = null
      rec.onend = null
      try {
        rec.abort()
      } catch {
        // already stopped
      }
    }
    setListening(false)
    setInterim('')
  }, [clearAutoSend])

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) return
    const typed = valueRef.current.trim()
    sessionBaseRef.current = typed ? `${typed} ` : ''

    const rec = new Ctor()
    rec.lang = 'en-US'
    rec.interimResults = true
    rec.continuous = false

    rec.onresult = (event) => {
      let finalText = ''
      let interimText = ''
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i]
        const transcript = result[0]?.transcript ?? ''
        if (result.isFinal) finalText += transcript
        else interimText += transcript
      }
      if (finalText) {
        const combined = (sessionBaseRef.current + finalText)
          .replace(/\s+/g, ' ')
          .trimStart()
        setFieldValue(combined)
        // Speak, pause, and the question sends itself — matching the
        // landing-page mic. Any further speech or typing resets the clock.
        clearAutoSend()
        autoSendRef.current = setTimeout(() => {
          autoSendRef.current = null
          void sendRef.current()
        }, 700)
      }
      setInterim(interimText)
    }
    rec.onerror = () => {
      // Mic trouble never breaks the audience — typing still works.
    }
    rec.onend = () => {
      recognitionRef.current = null
      setListening(false)
      setInterim('')
      inputRef.current?.focus()
    }

    recognitionRef.current = rec
    try {
      rec.start()
      setListening(true)
    } catch {
      recognitionRef.current = null
    }
  }, [setFieldValue, clearAutoSend])

  const toggleMic = useCallback(() => {
    if (listening) stopListening()
    else startListening()
  }, [listening, startListening, stopListening])

  /** Speak a reply through /api/tts with the figure's cast voice. */
  const speakReply = useCallback(
    (reply: string, voiceId: string | null) => {
      stopAudio()
      const params = new URLSearchParams({ text: reply.slice(0, TTS_MAX_CHARS) })
      if (voiceId) params.set('voice', voiceId)
      const audio = (audioRef.current ??= new Audio())
      audio.src = `/api/tts?${params.toString()}`
      audio.play().catch(() => {
        // Autoplay blocked or provider down — the written reply stands alone.
      })
    },
    [stopAudio],
  )

  const send = useCallback(async () => {
    const question = valueRef.current.trim().slice(0, MAX_MESSAGE_CHARS)
    if (!question || pending) return
    stopListening()
    stopAudio()
    setFieldValue('')

    setEntries((prev) => [...prev, { role: 'user', content: question }])
    setPending(true)

    const controller = new AbortController()
    abortRef.current = controller
    try {
      const turns = [...entries.filter(isTurn), { role: 'user' as const, content: question }]
        .slice(-MAX_TURNS)
        .map((t) => ({ role: t.role, content: t.content.slice(0, MAX_MESSAGE_CHARS) }))
      const res = await fetch('/api/converse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          person,
          topic: topic ?? '',
          era: era || undefined,
          messages: turns,
        }),
        signal: controller.signal,
      })
      const data: unknown = await res.json()
      const reply =
        typeof data === 'object' && data !== null
          ? (data as { reply?: unknown }).reply
          : undefined
      if (!res.ok || typeof reply !== 'string' || !reply.trim()) {
        throw new Error('bad reply')
      }
      const voiceId =
        typeof (data as { voiceId?: unknown }).voiceId === 'string'
          ? ((data as { voiceId: string }).voiceId)
          : null
      setEntries((prev) => [...prev, { role: 'assistant', content: reply }])
      speakReply(reply, voiceId)
    } catch (err) {
      if (controller.signal.aborted) return
      console.error('[audience] converse failed:', err)
      setEntries((prev) => [...prev, { role: 'note', content: INTERRUPTED_LINE }])
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      if (!controller.signal.aborted) setPending(false)
    }
  }, [
    entries,
    era,
    pending,
    person,
    setFieldValue,
    speakReply,
    stopAudio,
    stopListening,
    topic,
  ])

  const sendRef = useRef<() => Promise<void>>(async () => {})
  useEffect(() => {
    sendRef.current = send
  }, [send])

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      void send()
    },
    [send],
  )

  // The portal lives on document.body, outside the book's inline CSS-var
  // scope — snapshot the story theme onto the overlay whenever it opens.
  const [themeStyle, setThemeStyle] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!open || typeof document === 'undefined') return
    const host = document.querySelector<HTMLElement>('.tome-book')
    if (!host) return
    const computed = getComputedStyle(host)
    const snapshot: Record<string, string> = {}
    for (const name of THEME_VARS) {
      const value = computed.getPropertyValue(name).trim()
      if (value) snapshot[name] = value
    }
    setThemeStyle(snapshot)
  }, [open])

  // Restore this figure's transcript on open; persist every change.
  useEffect(() => {
    if (open) setEntries(transcriptStore.get(person) ?? [])
  }, [open, person])
  useEffect(() => {
    if (entries.length > 0) transcriptStore.set(person, entries)
  }, [person, entries])

  // Announce open/close so the book narrator yields the floor while the
  // figure speaks; Book.tsx listens and silences itself on open.
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('tome:audience', { detail: { open } }),
    )
  }, [open])

  // Closing ends everything in flight: voice, request, microphone.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 80)
      return () => clearTimeout(t)
    }
    stopAudio()
    abortRef.current?.abort()
    abortRef.current = null
    stopListening()
    setPending(false)
  }, [open, stopAudio, stopListening])

  // Unmount (page turn) — same teardown.
  useEffect(
    () => () => {
      stopAudio()
      abortRef.current?.abort()
      stopListening()
    },
    [stopAudio, stopListening],
  )

  // Esc closes while open, even when focus is elsewhere on the page.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Keep the newest line in view.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [entries, pending])

  if (!mounted) return null

  const firstName = person.trim().split(/\s+/)[0] || person
  const hint = `Ask ${firstName} anything — “Why did you…”`

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="tome-aud-backdrop"
          className="tome-aud-backdrop"
          style={themeStyle}
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            className="tome-aud-card"
            role="dialog"
            aria-modal="true"
            aria-label={`An audience with ${person}`}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              // Arrows must not leaf through the book behind the chamber.
              e.stopPropagation()
              if (e.key === 'Escape') onClose()
            }}
            initial={{ opacity: 0, y: 26, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.97 }}
            transition={{ type: 'tween', duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="tome-aud-frame" aria-hidden />
            <header className="tome-aud-head">
              {portraitUrl ? (
                <span className="tome-aud-portrait">
                  <img src={portraitUrl} alt="" referrerPolicy="no-referrer" />
                </span>
              ) : null}
              <div className="tome-aud-head-text">
                <p className="tome-aud-kicker">A private audience</p>
                <h2 className="tome-aud-title">
                  An audience with <span>{person}</span>
                </h2>
                {era ? <p className="tome-aud-era">{era}</p> : null}
              </div>
              <button
                type="button"
                className="tome-aud-close"
                onClick={onClose}
                aria-label="End the audience"
              >
                ×
              </button>
            </header>

            <div className="tome-aud-transcript" ref={scrollRef}>
              {entries.length === 0 && !pending ? (
                <p className="tome-aud-empty">
                  {firstName} inclines their head, candlelight at their back,
                  and waits for your question.
                </p>
              ) : null}
              {entries.map((entry, i) =>
                entry.role === 'user' ? (
                  <p className="tome-aud-line-user" key={i}>
                    {entry.content}
                  </p>
                ) : entry.role === 'assistant' ? (
                  <div className="tome-aud-line-figure" key={i}>
                    <span className="tome-aud-figure-name">{firstName}</span>
                    <p>{entry.content}</p>
                  </div>
                ) : (
                  <p className="tome-aud-line-note" key={i}>
                    {entry.content}
                  </p>
                ),
              )}
              {pending ? (
                <div
                  className="tome-aud-line-figure tome-aud-considering"
                  aria-label={`${firstName} is considering`}
                >
                  <span className="tome-aud-figure-name">{firstName}</span>
                  <p aria-hidden>
                    <span className="tome-aud-dot">✒</span>
                    <span className="tome-aud-dot">✒</span>
                    <span className="tome-aud-dot">✒</span>
                  </p>
                </div>
              ) : null}
            </div>

            <div className="tome-aud-ornament" aria-hidden>
              — ❧ —
            </div>

            <form className="tome-aud-inputrow" onSubmit={handleSubmit}>
              <div className="tome-aud-fieldwrap">
                <input
                  ref={inputRef}
                  className="tome-aud-input"
                  type="text"
                  name="audience-question"
                  value={value}
                  onChange={(e) => {
                    clearAutoSend()
                    setFieldValue(e.target.value)
                  }}
                  placeholder={hint}
                  aria-label={`Ask ${person} a question`}
                  autoComplete="off"
                  spellCheck={false}
                  enterKeyHint="send"
                  maxLength={MAX_MESSAGE_CHARS}
                />
                {interim ? (
                  <div className="tome-aud-ghost" aria-hidden="true">
                    <span className="tome-aud-ghost-pad">
                      {value ? `${value} ` : ''}
                    </span>
                    <span className="tome-aud-ghost-live">{interim}</span>
                  </div>
                ) : null}
              </div>
              {micSupported ? (
                <button
                  type="button"
                  className={`tome-aud-mic${listening ? ' tome-aud-mic--live' : ''}`}
                  onClick={toggleMic}
                  aria-label={listening ? 'Stop listening' : 'Ask by voice'}
                  aria-pressed={listening}
                >
                  <MicIcon />
                </button>
              ) : null}
              <button
                type="submit"
                className="tome-aud-send"
                disabled={pending || !value.trim()}
                aria-label="Send your question"
              >
                <SendIcon />
              </button>
            </form>

            <style>{`
              .tome-aud-backdrop {
                position: fixed;
                inset: 0;
                z-index: 70;
                display: grid;
                place-items: center;
                padding: 1.2rem;
                background:
                  radial-gradient(
                    60% 46% at 50% 42%,
                    rgba(96, 62, 24, 0.32),
                    rgba(12, 8, 4, 0.82) 78%
                  ),
                  rgba(10, 6, 3, 0.55);
                backdrop-filter: blur(3px);
              }
              .tome-aud-card {
                position: relative;
                z-index: 71;
                display: flex;
                flex-direction: column;
                width: min(31rem, 96vw);
                max-height: min(84vh, 46rem);
                border-radius: 10px 16px 16px 10px;
                background:
                  radial-gradient(
                    130% 90% at 28% 12%,
                    rgba(126, 88, 48, 0.4),
                    transparent 62%
                  ),
                  linear-gradient(150deg, #3a2a1c 0%, #241710 55%, #2c1d12 100%);
                box-shadow:
                  0 0 110px 14px rgba(255, 176, 76, 0.19),
                  0 42px 90px rgba(6, 3, 1, 0.72),
                  0 12px 30px rgba(6, 3, 1, 0.5),
                  inset 0 1px 0 rgba(255, 220, 160, 0.14);
                color: #e8cf9f;
              }
              .tome-aud-frame {
                position: absolute;
                inset: 8px;
                border: 1px solid rgba(210, 170, 96, 0.5);
                border-radius: 7px 12px 12px 7px;
                pointer-events: none;
              }
              .tome-aud-frame::before {
                content: '';
                position: absolute;
                inset: 5px;
                border: 1px solid rgba(200, 160, 90, 0.16);
                border-radius: 5px 9px 9px 5px;
              }
              .tome-aud-head {
                display: flex;
                align-items: center;
                gap: 0.95rem;
                margin: 0 1.05rem;
                padding: 1.15rem 0.3rem 0.85rem;
                border-bottom: 1px solid rgba(200, 160, 90, 0.3);
              }
              .tome-aud-portrait {
                flex-shrink: 0;
                width: 3.4rem;
                height: 4.2rem;
                padding: 3px;
                background: linear-gradient(160deg, #55402a, #32241666);
                border: 1px solid rgba(200, 160, 90, 0.55);
                box-shadow:
                  0 6px 16px rgba(6, 3, 1, 0.55),
                  inset 0 0 8px rgba(6, 3, 1, 0.5);
                transform: rotate(-1.5deg);
              }
              .tome-aud-portrait img {
                display: block;
                width: 100%;
                height: 100%;
                object-fit: cover;
                filter: sepia(0.45) contrast(1.02) saturate(0.8);
              }
              .tome-aud-head-text {
                flex: 1;
                min-width: 0;
              }
              .tome-aud-kicker {
                margin: 0 0 0.18rem;
                font-family: var(--font-archive, 'Courier New', monospace);
                font-size: 0.58rem;
                letter-spacing: 0.26em;
                text-transform: uppercase;
                color: rgba(200, 165, 105, 0.66);
              }
              .tome-aud-title {
                margin: 0;
                font-family: var(--font-display, Georgia, 'Times New Roman', serif);
                font-size: 1.06rem;
                font-weight: 500;
                font-variant: small-caps;
                letter-spacing: 0.045em;
                line-height: 1.25;
                color: rgba(232, 207, 159, 0.85);
                text-shadow: 0 1px 0 rgba(0, 0, 0, 0.5);
              }
              .tome-aud-title span {
                color: #eed9a8;
              }
              .tome-aud-era {
                margin: 0.22rem 0 0;
                font-family: var(--font-archive, 'Courier New', monospace);
                font-size: 0.56rem;
                letter-spacing: 0.2em;
                text-transform: uppercase;
                color: rgba(200, 165, 105, 0.5);
              }
              .tome-aud-close {
                flex-shrink: 0;
                align-self: flex-start;
                width: 2.5rem;
                height: 2.5rem;
                display: grid;
                place-items: center;
                margin: -0.3rem -0.45rem 0 0;
                background: transparent;
                border: 1px solid rgba(200, 160, 90, 0.35);
                border-radius: 9999px;
                color: rgba(232, 207, 159, 0.8);
                font-size: 1.25rem;
                line-height: 1;
                cursor: pointer;
                transition: color 150ms ease, border-color 150ms ease,
                  transform 150ms ease;
              }
              .tome-aud-close:hover {
                color: #eed9a8;
                border-color: rgba(220, 185, 120, 0.7);
                transform: rotate(90deg);
              }
              .tome-aud-close:focus-visible,
              .tome-aud-mic:focus-visible,
              .tome-aud-send:focus-visible {
                outline: 2px solid rgba(220, 185, 120, 0.75);
                outline-offset: 2px;
              }
              .tome-aud-transcript {
                flex: 1;
                min-height: 11rem;
                margin: 0.85rem 1.05rem 0;
                padding: 1rem 1.05rem 1.1rem;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 0.75rem;
                background:
                  linear-gradient(
                    175deg,
                    rgba(60, 44, 24, 0.14),
                    rgba(60, 44, 24, 0) 18%
                  ),
                  var(--paper, #f4ecd9);
                border: 1px solid rgba(58, 42, 24, 0.65);
                border-radius: 3px;
                box-shadow:
                  inset 0 2px 10px rgba(43, 28, 12, 0.22),
                  0 1px 0 rgba(255, 220, 160, 0.1);
                color: var(--ink, #2f2718);
                font-family: var(--font-body, Georgia, 'Times New Roman', serif);
                scrollbar-width: thin;
                scrollbar-color: rgba(58, 42, 24, 0.4) transparent;
              }
              .tome-aud-empty {
                margin: auto 0.6rem;
                text-align: center;
                font-style: italic;
                font-size: 0.9rem;
                line-height: 1.6;
                color: color-mix(in srgb, var(--ink, #2f2718) 55%, transparent);
              }
              .tome-aud-line-user {
                align-self: flex-end;
                max-width: 88%;
                margin: 0;
                text-align: right;
                font-size: 0.9rem;
                line-height: 1.5;
                color: color-mix(in srgb, var(--ink, #2f2718) 82%, transparent);
              }
              .tome-aud-line-figure {
                align-self: flex-start;
                max-width: 92%;
                padding: 0.6rem 0.8rem 0.65rem;
                background: color-mix(in srgb, #ffffff 38%, var(--paper, #f4ecd9));
                border: 1px solid color-mix(in srgb, var(--ink, #2f2718) 14%, transparent);
                border-left: 3px solid var(--accent, #8c2f24);
                border-radius: 2px 6px 6px 2px;
                box-shadow: 0 2px 6px rgba(30, 22, 12, 0.1);
              }
              .tome-aud-line-figure p {
                margin: 0;
                font-style: italic;
                font-size: 0.92rem;
                line-height: 1.55;
              }
              .tome-aud-figure-name {
                display: block;
                margin-bottom: 0.25rem;
                font-family: var(--font-archive, 'Courier New', monospace);
                font-style: normal;
                font-size: 0.56rem;
                letter-spacing: 0.22em;
                text-transform: uppercase;
                color: color-mix(in srgb, var(--accent, #8c2f24) 80%, var(--ink, #2f2718));
              }
              .tome-aud-line-note {
                align-self: center;
                margin: 0;
                font-style: italic;
                font-size: 0.8rem;
                color: color-mix(in srgb, var(--accent, #8c2f24) 70%, var(--ink, #2f2718));
              }
              .tome-aud-dot {
                display: inline-block;
                margin-right: 0.45em;
                font-size: 0.75rem;
                animation: tome-aud-consider 1.3s ease-in-out infinite;
              }
              .tome-aud-dot:nth-child(2) {
                animation-delay: 0.22s;
              }
              .tome-aud-dot:nth-child(3) {
                animation-delay: 0.44s;
              }
              @keyframes tome-aud-consider {
                0%,
                100% {
                  opacity: 0.25;
                  transform: translateY(0);
                }
                40% {
                  opacity: 0.95;
                  transform: translateY(-2px) rotate(-6deg);
                }
              }
              .tome-aud-ornament {
                padding: 0.4rem 0 0;
                text-align: center;
                font-size: 0.72rem;
                letter-spacing: 0.3em;
                color: rgba(200, 165, 105, 0.45);
              }
              .tome-aud-inputrow {
                display: flex;
                align-items: center;
                gap: 0.55rem;
                padding: 0.4rem 1.05rem 1.05rem;
              }
              .tome-aud-fieldwrap {
                position: relative;
                flex: 1;
                min-width: 0;
              }
              .tome-aud-input,
              .tome-aud-ghost {
                font-family: var(--font-archive, 'Courier New', monospace);
                font-size: 0.88rem;
                line-height: 1.45;
                letter-spacing: 0.01em;
                padding: 0.62rem 0.75rem;
              }
              .tome-aud-input {
                width: 100%;
                background: rgba(244, 236, 217, 0.08);
                border: 1px solid rgba(200, 160, 90, 0.35);
                border-radius: 3px;
                color: #eadfc2;
                caret-color: #eed9a8;
                outline: none;
                transition: border-color 150ms ease, background 150ms ease;
              }
              .tome-aud-input:focus {
                border-color: rgba(220, 185, 120, 0.7);
                background: rgba(244, 236, 217, 0.12);
              }
              .tome-aud-input::placeholder {
                color: rgba(232, 207, 159, 0.38);
                font-style: italic;
              }
              .tome-aud-ghost {
                position: absolute;
                inset: 0;
                border: 1px solid transparent;
                pointer-events: none;
                white-space: pre;
                overflow: hidden;
              }
              .tome-aud-ghost-pad {
                color: transparent;
              }
              .tome-aud-ghost-live {
                color: rgba(232, 207, 159, 0.5);
                font-style: italic;
              }
              .tome-aud-mic,
              .tome-aud-send {
                position: relative;
                flex-shrink: 0;
                width: 2.5rem;
                height: 2.5rem;
                display: grid;
                place-items: center;
                border-radius: 9999px;
                cursor: pointer;
                transition: background 150ms ease, color 150ms ease,
                  transform 120ms ease, opacity 150ms ease;
              }
              .tome-aud-mic {
                background: transparent;
                border: 1px solid rgba(200, 160, 90, 0.45);
                color: rgba(232, 207, 159, 0.85);
              }
              .tome-aud-mic:hover {
                background: rgba(200, 160, 90, 0.14);
              }
              .tome-aud-mic--live {
                background: var(--accent, #8c2f24);
                border-color: var(--accent, #8c2f24);
                color: #f4ecd9;
              }
              .tome-aud-mic--live::before,
              .tome-aud-mic--live::after {
                content: '';
                position: absolute;
                inset: -3px;
                border-radius: 9999px;
                border: 2px solid var(--accent, #8c2f24);
                animation: tome-aud-pulse 1.6s ease-out infinite;
                pointer-events: none;
              }
              .tome-aud-mic--live::after {
                animation-delay: 0.55s;
              }
              @keyframes tome-aud-pulse {
                0% {
                  transform: scale(1);
                  opacity: 0.7;
                }
                100% {
                  transform: scale(1.8);
                  opacity: 0;
                }
              }
              .tome-aud-send {
                background: linear-gradient(
                  150deg,
                  rgba(220, 185, 120, 0.92),
                  rgba(176, 138, 62, 0.92)
                );
                border: 1px solid rgba(255, 226, 168, 0.5);
                color: #2b1c0e;
                box-shadow: 0 4px 12px rgba(6, 3, 1, 0.4);
              }
              .tome-aud-send:hover:not(:disabled) {
                transform: translateY(-1px);
              }
              .tome-aud-send:active:not(:disabled),
              .tome-aud-mic:active {
                transform: scale(0.96);
              }
              .tome-aud-send:disabled {
                opacity: 0.4;
                cursor: default;
              }
              @media (prefers-reduced-motion: reduce) {
                .tome-aud-dot,
                .tome-aud-mic--live::before,
                .tome-aud-mic--live::after {
                  animation: none;
                }
                .tome-aud-close:hover,
                .tome-aud-send:hover:not(:disabled) {
                  transform: none;
                }
              }
            `}</style>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}

export default AudienceOverlay

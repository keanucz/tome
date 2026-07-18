'use client'

/**
 * VoiceInput — a library card-catalog inquiry slip with a mic.
 *
 * Text input styled as an aged catalog card; optional voice input via the
 * Web Speech API (Chrome's webkitSpeechRecognition). While listening, the
 * mic pulses and the live interim transcript appears ghosted in the field.
 * A final recognition result fills the field and auto-submits after a
 * 600ms pause. If speech recognition is unavailable the mic button is
 * hidden and typing still works. Enter always submits.
 */

import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

/* ------------------------------------------------------------------ */
/* Minimal Web Speech API typings — SpeechRecognition is not in       */
/* lib.dom, so we declare only the surface this component touches.    */
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

interface SpeechRecognitionErrorEventLike {
  readonly error: string
}

interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
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

const AUTO_SUBMIT_PAUSE_MS = 600

/* ------------------------------------------------------------------ */
/* Icons                                                              */
/* ------------------------------------------------------------------ */

function MicIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
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

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <rect
        x="7"
        y="7"
        width="10"
        height="10"
        rx="1.5"
        fill="currentColor"
      />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export function VoiceInput({
  onSubmit,
}: {
  onSubmit: (query: string) => void
}) {
  const [value, setValue] = useState('')
  const [interim, setInterim] = useState('')
  const [listening, setListening] = useState(false)
  const [micSupported, setMicSupported] = useState(false)
  const [micMessage, setMicMessage] = useState<string | null>(null)

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const submitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionBaseRef = useRef('')
  const valueRef = useRef('')
  const onSubmitRef = useRef(onSubmit)

  useEffect(() => {
    onSubmitRef.current = onSubmit
  }, [onSubmit])

  // Detect support after mount (SSR-safe: server renders without the mic).
  useEffect(() => {
    setMicSupported(getSpeechRecognitionCtor() !== null)
    return () => {
      if (submitTimerRef.current) clearTimeout(submitTimerRef.current)
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
    }
  }, [])

  const clearSubmitTimer = useCallback(() => {
    if (submitTimerRef.current) {
      clearTimeout(submitTimerRef.current)
      submitTimerRef.current = null
    }
  }, [])

  const setFieldValue = useCallback((next: string) => {
    valueRef.current = next
    setValue(next)
  }, [])

  const stopListening = useCallback(() => {
    const rec = recognitionRef.current
    recognitionRef.current = null
    if (rec) {
      rec.onresult = null
      rec.onerror = null
      rec.onend = null
      try {
        rec.stop()
      } catch {
        // recognition already ended — nothing to stop
      }
    }
    setListening(false)
    setInterim('')
  }, [])

  const submitQuery = useCallback(() => {
    clearSubmitTimer()
    stopListening()
    const query = valueRef.current.trim()
    if (!query) return
    onSubmitRef.current(query)
  }, [clearSubmitTimer, stopListening])

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) return
    setMicMessage(null)
    const typed = valueRef.current.trim()
    sessionBaseRef.current = typed ? `${typed} ` : ''

    const rec = new Ctor()
    rec.lang = 'en-US'
    rec.interimResults = true
    rec.continuous = true

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
        // Auto-submit after a pause: every new result resets the clock.
        clearSubmitTimer()
        submitTimerRef.current = setTimeout(submitQuery, AUTO_SUBMIT_PAUSE_MS)
      }
      setInterim(interimText)
    }

    rec.onerror = (event) => {
      if (
        event.error === 'not-allowed' ||
        event.error === 'service-not-allowed'
      ) {
        setMicMessage(
          'Microphone access was denied — you can still type your question.',
        )
      } else if (event.error === 'no-speech') {
        setMicMessage('Didn’t catch that. Try again, or type instead.')
      } else if (event.error === 'audio-capture') {
        setMicMessage('No microphone found — typing still works.')
      } else if (event.error !== 'aborted') {
        setMicMessage('Voice input hit a snag — typing still works.')
      }
    }

    rec.onend = () => {
      recognitionRef.current = null
      setListening(false)
      setInterim('')
    }

    recognitionRef.current = rec
    try {
      rec.start()
      setListening(true)
    } catch {
      recognitionRef.current = null
      setMicMessage('Could not start the microphone — typing still works.')
    }
  }, [clearSubmitTimer, setFieldValue, submitQuery])

  const toggleMic = useCallback(() => {
    if (listening) {
      clearSubmitTimer()
      stopListening()
    } else {
      startListening()
    }
  }, [listening, clearSubmitTimer, stopListening, startListening])

  const handleFormSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      submitQuery()
    },
    [submitQuery],
  )

  const handleChange = useCallback(
    (next: string) => {
      // Manual typing cancels any pending voice auto-submit.
      clearSubmitTimer()
      setMicMessage(null)
      setFieldValue(next)
    },
    [clearSubmitTimer, setFieldValue],
  )

  const statusText = micMessage ?? (listening ? 'Listening…' : '')

  return (
    <div className="tome-voice">
      <form
        className="tome-voice-card"
        onSubmit={handleFormSubmit}
        aria-label="Ask the archive a history question"
      >
        <div className="tome-voice-head">
          <span>Reader&rsquo;s Inquiry</span>
          <span className="tome-voice-head-no">The Tome Archive</span>
        </div>

        <div className="tome-voice-row">
          <div className="tome-voice-fieldwrap">
            <input
              className="tome-voice-input"
              type="text"
              value={value}
              onChange={(event) => handleChange(event.target.value)}
              placeholder="Ask for a story… e.g. the Seven Years’ War"
              aria-label="Ask a history question"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="go"
            />
            {interim ? (
              <div className="tome-voice-ghost" aria-hidden="true">
                <span className="tome-voice-ghost-pad">
                  {value ? `${value} ` : ''}
                </span>
                <span className="tome-voice-ghost-live">{interim}</span>
              </div>
            ) : null}
          </div>

          {micSupported ? (
            <button
              type="button"
              className={`tome-voice-mic${listening ? ' tome-voice-mic--live' : ''}`}
              onClick={toggleMic}
              aria-label={listening ? 'Stop listening' : 'Ask by voice'}
              aria-pressed={listening}
              title={listening ? 'Stop listening' : 'Ask by voice'}
            >
              {listening ? <StopIcon /> : <MicIcon />}
            </button>
          ) : null}
        </div>

        <div className="tome-voice-lines" aria-hidden="true" />
        <div className="tome-voice-hole" aria-hidden="true" />

        <p
          className={`tome-voice-status${micMessage ? ' tome-voice-status--error' : ''}`}
          role="status"
          aria-live="polite"
        >
          {statusText}
        </p>
      </form>

      <style>{`
        .tome-voice {
          --tv-paper: var(--paper, #f6efdd);
          --tv-ink: var(--ink, #2f2718);
          --tv-accent: var(--accent, #8c2f24);
          width: 100%;
          max-width: 40rem;
          margin-inline: auto;
          font-family: 'Courier New', Courier, monospace;
          color: var(--tv-ink);
        }
        .tome-voice-card {
          position: relative;
          background:
            linear-gradient(160deg, rgba(255, 255, 255, 0.35), rgba(255, 255, 255, 0) 45%),
            var(--tv-paper);
          border: 1px solid rgba(47, 39, 24, 0.28);
          border-radius: 7px;
          padding: 0.85rem 1.15rem 1.05rem;
          box-shadow:
            3px 4px 0 -1px rgba(240, 232, 210, 0.9),
            3px 5px 0 0 rgba(47, 39, 24, 0.22),
            6px 9px 0 -2px rgba(240, 232, 210, 0.75),
            6px 10px 0 -1px rgba(47, 39, 24, 0.16),
            0 18px 32px -14px rgba(47, 39, 24, 0.45);
        }
        .tome-voice-head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 1rem;
          font-size: 0.62rem;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(47, 39, 24, 0.62);
          padding-bottom: 0.5rem;
          border-bottom: 2px solid var(--tv-accent);
          box-shadow: 0 3px 0 -1.4px color-mix(in srgb, var(--tv-accent) 45%, transparent);
        }
        .tome-voice-head-no {
          color: color-mix(in srgb, var(--tv-accent) 80%, var(--tv-ink));
        }
        .tome-voice-row {
          display: flex;
          align-items: flex-end;
          gap: 0.75rem;
          border-bottom: 1px solid rgba(106, 130, 156, 0.55);
          padding-top: 0.55rem;
        }
        .tome-voice-fieldwrap {
          position: relative;
          flex: 1;
          min-width: 0;
        }
        .tome-voice-input,
        .tome-voice-ghost {
          font-family: inherit;
          font-size: 1.02rem;
          line-height: 1.5;
          letter-spacing: 0.01em;
          padding: 0.55rem 0.1rem 0.4rem;
        }
        .tome-voice-input {
          width: 100%;
          background: transparent;
          border: none;
          outline: none;
          color: var(--tv-ink);
          caret-color: var(--tv-accent);
        }
        .tome-voice-input::placeholder {
          color: rgba(47, 39, 24, 0.38);
          font-style: italic;
        }
        .tome-voice-ghost {
          position: absolute;
          inset: 0;
          pointer-events: none;
          white-space: pre;
          overflow: hidden;
        }
        .tome-voice-ghost-pad {
          color: transparent;
        }
        .tome-voice-ghost-live {
          color: rgba(47, 39, 24, 0.45);
          font-style: italic;
        }
        .tome-voice-mic {
          position: relative;
          flex-shrink: 0;
          width: 2.6rem;
          height: 2.6rem;
          margin-bottom: 0.3rem;
          display: grid;
          place-items: center;
          border-radius: 9999px;
          border: 1px solid color-mix(in srgb, var(--tv-accent) 65%, var(--tv-ink));
          background: color-mix(in srgb, var(--tv-paper) 70%, #ffffff);
          color: var(--tv-accent);
          cursor: pointer;
          transition: background 150ms ease, color 150ms ease, transform 120ms ease;
        }
        .tome-voice-mic:hover {
          transform: translateY(-1px);
          background: color-mix(in srgb, var(--tv-accent) 12%, var(--tv-paper));
        }
        .tome-voice-mic:focus-visible {
          outline: 2px solid var(--tv-accent);
          outline-offset: 2px;
        }
        .tome-voice-mic--live {
          background: var(--tv-accent);
          color: var(--tv-paper);
          border-color: var(--tv-accent);
        }
        .tome-voice-mic--live::before,
        .tome-voice-mic--live::after {
          content: '';
          position: absolute;
          inset: -3px;
          border-radius: 9999px;
          border: 2px solid var(--tv-accent);
          animation: tome-voice-pulse 1.6s ease-out infinite;
          pointer-events: none;
        }
        .tome-voice-mic--live::after {
          animation-delay: 0.55s;
        }
        @keyframes tome-voice-pulse {
          0% {
            transform: scale(1);
            opacity: 0.7;
          }
          100% {
            transform: scale(1.85);
            opacity: 0;
          }
        }
        .tome-voice-lines {
          height: 3.4rem;
          background: repeating-linear-gradient(
            to bottom,
            transparent 0,
            transparent calc(1.7rem - 1px),
            rgba(106, 130, 156, 0.45) calc(1.7rem - 1px),
            rgba(106, 130, 156, 0.45) 1.7rem
          );
        }
        .tome-voice-hole {
          position: absolute;
          left: 50%;
          bottom: 0.55rem;
          transform: translateX(-50%);
          width: 0.85rem;
          height: 0.85rem;
          border-radius: 9999px;
          background: color-mix(in srgb, var(--tv-ink) 22%, var(--tv-paper));
          box-shadow:
            inset 0 1px 3px rgba(20, 14, 6, 0.55),
            0 1px 0 rgba(255, 255, 255, 0.5);
        }
        .tome-voice-status {
          min-height: 1.1rem;
          margin: 0;
          padding-top: 0.5rem;
          font-size: 0.72rem;
          letter-spacing: 0.06em;
          font-style: italic;
          color: rgba(47, 39, 24, 0.55);
        }
        .tome-voice-status--error {
          color: color-mix(in srgb, var(--tv-accent) 85%, var(--tv-ink));
          font-style: normal;
        }
        @media (prefers-reduced-motion: reduce) {
          .tome-voice-mic--live::before,
          .tome-voice-mic--live::after {
            animation: none;
            opacity: 0.4;
          }
          .tome-voice-mic:hover {
            transform: none;
          }
        }
      `}</style>
    </div>
  )
}

export default VoiceInput

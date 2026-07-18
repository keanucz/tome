'use client'

/**
 * Client narration hook. Tries GET /api/tts first (ElevenLabs → OpenAI
 * server-side) and plays the returned audio; on 503 / provider failure /
 * network error it falls back to browser speechSynthesis. The exported
 * signature is a CONTRACT — the book renderer depends on it exactly as
 * written:
 *
 *   useNarration(): {
 *     speak(text: string): Promise<void>   // resolves when playback ends
 *     stop(): void
 *     speaking: boolean
 *   }
 */

import { useCallback, useRef, useState } from 'react'

type PlaybackResult = 'ended' | 'error'

/** Keep safely under the /api/tts 2000-char limit, cutting at a sentence. */
const TTS_MAX_CHARS = 1950

/** Chrome speechSynthesis silently dies mid-utterance unless resumed. */
const SYNTHESIS_KEEPALIVE_MS = 10_000

function clampAtSentence(text: string, max = TTS_MAX_CHARS): string {
  if (text.length <= max) return text
  const slice = text.slice(0, max)
  const lastStop = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? '),
  )
  if (lastStop > max * 0.5) return slice.slice(0, lastStop + 1)
  const lastSpace = slice.lastIndexOf(' ')
  return lastSpace > 0 ? slice.slice(0, lastSpace) : slice
}

/** Split prose into sentence-sized chunks (Chrome kills long utterances). */
function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?…]+[.!?…]+["'”’)\]]*\s*|[^.!?…]+$/g) ?? [text]
  return parts.map((s) => s.trim()).filter(Boolean)
}

export function useNarration(): {
  speak: (text: string) => Promise<void>
  stop: () => void
  speaking: boolean
} {
  const [speaking, setSpeaking] = useState(false)
  /** Bumped by every speak() and stop(); stale invocations see a mismatch. */
  const sessionRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  /** Resolves whichever playback promise is currently pending. */
  const finishRef = useRef<(() => void) | null>(null)
  /** speechSynthesis.resume() keepalive while the fallback voice speaks. */
  const keepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearKeepalive = useCallback(() => {
    if (keepaliveRef.current !== null) {
      clearInterval(keepaliveRef.current)
      keepaliveRef.current = null
    }
  }, [])

  const teardownPlayback = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.removeAttribute('src')
      audioRef.current = null
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    clearKeepalive()
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
    finishRef.current?.()
    finishRef.current = null
  }, [clearKeepalive])

  const stop = useCallback(() => {
    sessionRef.current++
    teardownPlayback()
    setSpeaking(false)
  }, [teardownPlayback])

  const playBlob = useCallback((blob: Blob): Promise<PlaybackResult> => {
    return new Promise<PlaybackResult>((resolve) => {
      const url = URL.createObjectURL(blob)
      objectUrlRef.current = url
      const audio = new Audio(url)
      audioRef.current = audio

      let done = false
      const finish = (result: PlaybackResult) => {
        if (done) return
        done = true
        if (audioRef.current === audio) audioRef.current = null
        if (objectUrlRef.current === url) {
          URL.revokeObjectURL(url)
          objectUrlRef.current = null
        }
        resolve(result)
      }
      finishRef.current = () => finish('ended') // stop()/replacement path
      audio.onended = () => finish('ended')
      audio.onerror = () => finish('error')
      // play() rejects when autoplay is blocked or the source is unusable.
      audio.play().catch(() => finish('error'))
    })
  }, [])

  const speakWithSynthesis = useCallback(
    (text: string): Promise<void> => {
      if (typeof window === 'undefined' || !window.speechSynthesis) {
        return Promise.resolve()
      }
      return new Promise<void>((resolve) => {
        let done = false
        const finish = () => {
          if (done) return
          done = true
          clearKeepalive()
          resolve()
        }
        finishRef.current = finish

        // Chrome silently kills long utterances ~15s in without firing onend,
        // freezing the auto page-turn. Speak sentence-sized utterances
        // sequentially and nudge the engine with resume() while speaking.
        const sentences = splitSentences(text)
        let index = 0
        const speakNext = () => {
          if (done) return
          if (index >= sentences.length) {
            finish()
            return
          }
          const utterance = new SpeechSynthesisUtterance(sentences[index])
          index += 1
          utterance.rate = 0.95
          utterance.onend = speakNext
          utterance.onerror = finish
          window.speechSynthesis.speak(utterance)
        }
        clearKeepalive()
        keepaliveRef.current = setInterval(() => {
          window.speechSynthesis.resume()
        }, SYNTHESIS_KEEPALIVE_MS)
        speakNext()
      })
    },
    [clearKeepalive],
  )

  const speak = useCallback(
    async (rawText: string): Promise<void> => {
      if (!rawText.trim() || typeof window === 'undefined') return
      // Oversized pages must not 400 the TTS route into the robot voice.
      const text = clampAtSentence(rawText.trim())

      const session = ++sessionRef.current
      teardownPlayback() // replace any narration already in flight
      setSpeaking(true)
      const stale = () => sessionRef.current !== session

      try {
        let response: Response | null = null
        try {
          const controller = new AbortController()
          abortRef.current = controller
          response = await fetch(`/api/tts?text=${encodeURIComponent(text)}`, {
            signal: controller.signal,
          })
        } catch {
          response = null // network failure or aborted by stop()
        } finally {
          abortRef.current = null
        }
        if (stale()) return

        if (response?.ok) {
          let result: PlaybackResult = 'error'
          try {
            const blob = await response.blob()
            if (stale()) return
            result = await playBlob(blob)
          } catch {
            result = 'error' // body read failed mid-stream
          }
          if (stale() || result === 'ended') return
          // Playback failed (autoplay block / bad audio) — fall through.
        }

        // 503 (no provider), server error, network failure, or bad playback.
        await speakWithSynthesis(text)
      } finally {
        if (!stale()) {
          finishRef.current = null
          setSpeaking(false)
        }
      }
    },
    [teardownPlayback, playBlob, speakWithSynthesis],
  )

  return { speak, stop, speaking }
}

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
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
    finishRef.current?.()
    finishRef.current = null
  }, [])

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

  const speakWithSynthesis = useCallback((text: string): Promise<void> => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        resolve()
      }
      finishRef.current = finish
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 0.95
      utterance.onend = finish
      utterance.onerror = finish
      window.speechSynthesis.speak(utterance)
    })
  }, [])

  const speak = useCallback(
    async (text: string): Promise<void> => {
      if (!text.trim() || typeof window === 'undefined') return

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

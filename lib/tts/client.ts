'use client'

/**
 * Client narration hook. Currently a functional browser-speechSynthesis
 * implementation; the TTS agent upgrades it to try GET /api/tts first
 * (ElevenLabs → OpenAI server-side) and keep speechSynthesis as the final
 * fallback. The exported signature is a CONTRACT — the book renderer
 * depends on it exactly as written:
 *
 *   useNarration(): {
 *     speak(text: string): Promise<void>   // resolves when playback ends
 *     stop(): void
 *     speaking: boolean
 *   }
 */

import { useCallback, useRef, useState } from 'react'

export function useNarration(): {
  speak: (text: string) => Promise<void>
  stop: () => void
  speaking: boolean
} {
  const [speaking, setSpeaking] = useState(false)
  const cancelled = useRef(false)

  const stop = useCallback(() => {
    cancelled.current = true
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
    setSpeaking(false)
  }, [])

  const speak = useCallback((text: string): Promise<void> => {
    cancelled.current = false
    if (!text.trim() || typeof window === 'undefined' || !window.speechSynthesis) {
      return Promise.resolve()
    }
    setSpeaking(true)
    return new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 0.95
      utterance.onend = () => {
        setSpeaking(false)
        resolve()
      }
      utterance.onerror = () => {
        setSpeaking(false)
        resolve()
      }
      window.speechSynthesis.speak(utterance)
    })
  }, [])

  return { speak, stop, speaking }
}

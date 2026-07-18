'use client'

import { useEffect, useState } from 'react'

/**
 * useAmbient(prompt) → /api/ambient URL, but only AFTER the image has fully
 * preloaded (new Image() onload), so consumers never flash a broken <img>.
 * Returns null while loading, on any failure, or when prompt is undefined.
 *
 * Results (including failures) are cached per-prompt in module-level maps so
 * repeat mounts never refetch and a failing route is never hammered mid-demo.
 */

/** prompt → preloaded URL, or null when generation/preload failed. */
const resolved = new Map<string, string | null>()
/** prompt → in-flight preload, shared across concurrently mounted consumers. */
const pending = new Map<string, Promise<string | null>>()

function ambientUrl(prompt: string): string {
  return `/api/ambient?prompt=${encodeURIComponent(prompt)}`
}

function preload(prompt: string): Promise<string | null> {
  return new Promise((resolve) => {
    const url = ambientUrl(prompt)
    const img = new Image()
    img.onload = () => resolve(url)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

export function useAmbient(prompt: string | undefined): string | null {
  const normalized = prompt?.trim() || undefined

  const [url, setUrl] = useState<string | null>(() =>
    normalized ? (resolved.get(normalized) ?? null) : null,
  )

  useEffect(() => {
    if (!normalized) {
      setUrl(null)
      return
    }
    if (resolved.has(normalized)) {
      setUrl(resolved.get(normalized) ?? null)
      return
    }

    setUrl(null)
    let cancelled = false

    let inflight = pending.get(normalized)
    if (!inflight) {
      inflight = preload(normalized).then((result) => {
        resolved.set(normalized, result)
        pending.delete(normalized)
        return result
      })
      pending.set(normalized, inflight)
    }

    inflight.then((result) => {
      if (!cancelled) setUrl(result)
    })

    return () => {
      cancelled = true
    }
  }, [normalized])

  return url
}

'use client'

/**
 * Shimmering-ink placeholders shown while scene fields are still streaming.
 * Styling lives in components/book/book.css (.tome-skel*).
 */

export function SkeletonLines({ lines = 3 }: { lines?: number }) {
  return (
    <div className="tome-skel-lines" aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="tome-skel tome-skel-line"
          style={{ width: `${100 - (i % 3) * 9 - (i === lines - 1 ? 32 : 0)}%` }}
        />
      ))}
    </div>
  )
}

export function SkeletonBlock({
  className = '',
  ratio = '4 / 3',
}: {
  className?: string
  ratio?: string
}) {
  return (
    <div
      className={`tome-skel tome-skel-block ${className}`}
      style={{ aspectRatio: ratio }}
      aria-hidden
    />
  )
}

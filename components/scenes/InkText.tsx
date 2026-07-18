'use client'

import { motion } from 'framer-motion'

interface InkTextProps {
  text: string | undefined
  className?: string
  /** Per-word stagger cap in seconds (first paint cascades up to this). */
  maxDelay?: number
}

/**
 * Renders prose as per-word spans that fade in from an ink-blur. Because
 * words are keyed by index, words already on the page never re-animate —
 * newly streamed words materialize at the end, giving the
 * "book writes itself" effect for free while streaming.
 */
export function InkText({ text, className, maxDelay = 1.1 }: InkTextProps) {
  const words = (text ?? '').split(/\s+/).filter(Boolean)
  if (words.length === 0) return null

  return (
    <span className={className}>
      {words.map((word, i) => (
        // Trailing space lives OUTSIDE the inline-block span so justification
        // and line wrapping still happen between words.
        <span key={i}>
          <motion.span
            className="tome-word"
            initial={{ opacity: 0, y: 4, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{
              duration: 0.5,
              delay: Math.min(i * 0.022, maxDelay),
              ease: 'easeOut',
            }}
          >
            {word}
          </motion.span>{' '}
        </span>
      ))}
    </span>
  )
}

'use client'

import { motion } from 'framer-motion'

interface ProgressBarProps {
  /** 0-based index of the active page. */
  current: number
  /** Pages that exist so far (grows while streaming). */
  total: number
  /** True while the stream is still adding to the book. */
  writing: boolean
}

/** Thin reading-progress bar with a page count and a writing indicator. */
export function ProgressBar({ current, total, writing }: ProgressBarProps) {
  const pct = total > 0 ? Math.min(((current + 1) / total) * 100, 100) : 0

  return (
    <div className="tome-progress">
      <div className="tome-progress-track">
        <motion.div
          className="tome-progress-fill"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
      <div className="tome-progress-label">
        {total > 0 ? (
          <span>
            Page {Math.min(current + 1, total)} of {total}
          </span>
        ) : (
          <span>Opening the tome&hellip;</span>
        )}
        {writing ? (
          <span className="tome-progress-writing"> &middot; writing&hellip;</span>
        ) : null}
      </div>
    </div>
  )
}

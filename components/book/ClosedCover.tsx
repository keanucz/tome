'use client'

import { motion } from 'framer-motion'

/**
 * The closed front board of the book, shown while the story is still being
 * woven. Title, subtitle, and era emboss themselves as they stream in; a
 * quiet progress line shows the binder at work. The Book opens the spread
 * once enough pages exist.
 */
export function ClosedCover({
  title,
  subtitle,
  era,
  latestChapter,
  pagesWritten,
}: {
  title?: string
  subtitle?: string
  era?: string
  latestChapter?: string
  pagesWritten: number
}) {
  return (
    <div className="tome-closed-board">
      <div className="tome-closed-frame" aria-hidden />
      <div className="tome-closed-spine" aria-hidden />
      <div className="tome-closed-content">
        <span className="tome-closed-ornament" aria-hidden>
          &#10022;
        </span>
        {title ? (
          <motion.h2
            className="tome-closed-title"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          >
            {title}
          </motion.h2>
        ) : (
          <h2 className="tome-closed-title tome-closed-pending">
            The archive is listening&hellip;
          </h2>
        )}
        {subtitle ? (
          <motion.p
            className="tome-closed-subtitle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2, delay: 0.2 }}
          >
            {subtitle}
          </motion.p>
        ) : null}
        {era ? (
          <motion.p
            className="tome-closed-era"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2, delay: 0.35 }}
          >
            {era}
          </motion.p>
        ) : null}
      </div>
      <div className="tome-closed-progress">
        <span className="tome-closed-quill" aria-hidden>
          &#10002;
        </span>
        {latestChapter
          ? `writing “${latestChapter}” — ${pagesWritten} ${pagesWritten === 1 ? 'page' : 'pages'} so far`
          : 'the first page is being written…'}
      </div>
    </div>
  )
}

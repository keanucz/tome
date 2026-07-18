'use client'

import { motion } from 'framer-motion'
import type { z } from 'zod'
import type { LetterQuoteSceneSchema } from '@/lib/story/schema'
import { InkText } from './InkText'
import { SkeletonLines } from './Skeleton'
import type { SceneComponentProps } from './types'

type LetterQuote = z.infer<typeof LetterQuoteSceneSchema>

/** Primary-source quote styled as a tilted period letter with attribution. */
export function LetterQuoteScene({ scene }: SceneComponentProps<LetterQuote>) {
  return (
    <div className="tome-scene-letter">
      <motion.figure
        className="tome-letter-paper"
        initial={{ opacity: 0, y: 16, rotate: 0 }}
        animate={{ opacity: 1, y: 0, rotate: -1.4 }}
        transition={{ duration: 1.1, ease: 'easeOut' }}
      >
        <span className="tome-letter-quotemark" aria-hidden>
          &ldquo;
        </span>
        {scene.quoteText ? (
          <blockquote className="tome-letter-quote">
            <InkText text={scene.quoteText} />
          </blockquote>
        ) : (
          <SkeletonLines lines={3} />
        )}
        <figcaption className="tome-letter-attribution">
          {scene.attribution ? (
            <>
              <span className="tome-letter-dash">&mdash;</span>{' '}
              {scene.attribution}
              {scene.date ? (
                <span className="tome-letter-date">, {scene.date}</span>
              ) : null}
            </>
          ) : (
            <SkeletonLines lines={1} />
          )}
        </figcaption>
        <span className="tome-letter-seal" aria-hidden />
      </motion.figure>

      {scene.narration ? (
        <p className="tome-prose">
          <InkText text={scene.narration} />
        </p>
      ) : (
        <SkeletonLines lines={2} />
      )}
    </div>
  )
}

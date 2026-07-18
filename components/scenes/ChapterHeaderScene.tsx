'use client'

import { motion } from 'framer-motion'
import type { z } from 'zod'
import { useAmbient } from '@/lib/ambient/useAmbient'
import type { ChapterHeaderSceneSchema } from '@/lib/story/schema'
import { InkText } from './InkText'
import { SkeletonLines } from './Skeleton'
import type { SceneComponentProps } from './types'

type ChapterHeader = z.infer<typeof ChapterHeaderSceneSchema>

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

/** Era-styled chapter opening: numeral, ornamental rule, title, epigraph, drop-cap prose. */
export function ChapterHeaderScene({
  scene,
  ctx,
}: SceneComponentProps<ChapterHeader>) {
  const numeral = ROMAN[ctx.chapterIndex] ?? String(ctx.chapterIndex + 1)
  // Ambient frontispiece art from the story theme; null (loading / failed /
  // no prompt) renders exactly the plain header — no placeholder, no shift.
  const frontispiece = useAmbient(ctx.ambientPrompt)
  const narration = scene.narration ?? ''
  const dropCap = narration.charAt(0)
  const rest = narration.slice(1)

  return (
    <div className="tome-scene-chapter">
      <motion.div
        className="tome-chapter-numeral"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.9 }}
      >
        Chapter {numeral}
      </motion.div>

      <div className="tome-rule" aria-hidden>
        <span className="tome-rule-line" />
        <span className="tome-rule-fleuron">&#10087;</span>
        <span className="tome-rule-line" />
      </div>

      {frontispiece ? (
        <motion.img
          src={frontispiece}
          alt=""
          aria-hidden
          className="tome-frontispiece"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.4, ease: 'easeOut' }}
        />
      ) : null}

      {scene.title ? (
        <motion.h2
          className="tome-chapter-title"
          initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
        >
          {scene.title}
        </motion.h2>
      ) : (
        <div className="tome-chapter-title">
          <SkeletonLines lines={1} />
        </div>
      )}

      {scene.epigraph ? (
        <motion.p
          className="tome-epigraph"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 0.3 }}
        >
          {scene.epigraph}
        </motion.p>
      ) : null}

      <div className="tome-rule tome-rule-small" aria-hidden>
        <span className="tome-rule-line" />
      </div>

      {narration ? (
        <p className="tome-prose tome-prose-opening">
          {dropCap ? <span className="tome-dropcap">{dropCap}</span> : null}
          <InkText text={rest} />
        </p>
      ) : (
        <SkeletonLines lines={4} />
      )}
    </div>
  )
}

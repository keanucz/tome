'use client'

import { motion } from 'framer-motion'
import type { z } from 'zod'
import type { TimelineSceneSchema } from '@/lib/story/schema'
import { InkText } from './InkText'
import { SkeletonLines } from './Skeleton'
import type { SceneComponentProps } from './types'

type Timeline = z.infer<typeof TimelineSceneSchema>

/** Era-styled chronology strip with a staggered reveal of events. */
export function TimelineScene({ scene }: SceneComponentProps<Timeline>) {
  const events = (scene.events ?? []).filter(
    (e): e is { year: string; label: string } => Boolean(e?.year && e?.label),
  )

  return (
    <div className="tome-scene-timeline">
      <div className="tome-timeline-heading">
        <span className="tome-rule-line" />
        <span className="tome-timeline-word">Chronology</span>
        <span className="tome-rule-line" />
      </div>

      {events.length > 0 ? (
        <ol className="tome-timeline-list">
          {events.map((event, i) => (
            <motion.li
              key={`${event.year}-${i}`}
              className="tome-timeline-event"
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: i * 0.18, ease: 'easeOut' }}
            >
              <span className="tome-timeline-year">{event.year}</span>
              <span className="tome-timeline-dot" aria-hidden />
              <span className="tome-timeline-label">{event.label}</span>
            </motion.li>
          ))}
        </ol>
      ) : (
        <SkeletonLines lines={4} />
      )}

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

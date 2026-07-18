'use client'

import { motion } from 'framer-motion'
import { useState } from 'react'
import type { z } from 'zod'
import type { PortraitSceneSchema } from '@/lib/story/schema'
import { InkText } from './InkText'
import { SkeletonBlock, SkeletonLines } from './Skeleton'
import type { SceneComponentProps } from './types'

type Portrait = z.infer<typeof PortraitSceneSchema>

function isSafeImageUrl(url: string | undefined): url is string {
  return typeof url === 'string' && url.startsWith('https://')
}

/** Framed Commons portrait with a slow Ken Burns drift and engraved caption. */
export function PortraitScene({ scene }: SceneComponentProps<Portrait>) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const showImage = isSafeImageUrl(scene.imageUrl) && !failed

  return (
    <div className="tome-scene-portrait">
      <div className="tome-portrait-frame">
        {showImage ? (
          <motion.img
            src={scene.imageUrl}
            alt={scene.personName ?? 'Portrait'}
            className="tome-portrait-img"
            referrerPolicy="no-referrer"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            initial={{ scale: 1.08, x: '1.5%', y: '-1.5%', opacity: 0 }}
            animate={
              loaded
                ? { scale: 1.22, x: '-1.5%', y: '1.5%', opacity: 1 }
                : { opacity: 0 }
            }
            transition={{
              opacity: { duration: 1.4, ease: 'easeOut' },
              default: {
                duration: 36,
                ease: 'linear',
                repeat: Infinity,
                repeatType: 'mirror',
              },
            }}
          />
        ) : (
          <SkeletonBlock ratio="3 / 4" className="tome-portrait-skel" />
        )}
      </div>

      <div className="tome-caption">
        {scene.personName ? (
          <span className="tome-caption-name">{scene.personName}</span>
        ) : null}
        {scene.caption ? (
          <span className="tome-caption-detail">{scene.caption}</span>
        ) : !scene.personName ? (
          <SkeletonLines lines={1} />
        ) : null}
      </div>

      {scene.narration ? (
        <p className="tome-prose">
          <InkText text={scene.narration} />
        </p>
      ) : (
        <SkeletonLines lines={3} />
      )}
    </div>
  )
}

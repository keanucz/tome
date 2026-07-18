'use client'

import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import type { z } from 'zod'
import type { MapPlateSceneSchema } from '@/lib/story/schema'
import { SkeletonBlock, SkeletonLines } from './Skeleton'
import type { SceneComponentProps } from './types'

type MapPlate = z.infer<typeof MapPlateSceneSchema>

function isSafeImageUrl(url: string | undefined): url is string {
  return typeof url === 'string' && url.startsWith('https://')
}

/** Full-bleed plate: the image fills the page under a slow zoom, with a caption cartouche. */
export function MapPlateScene({ scene }: SceneComponentProps<MapPlate>) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const showImage = isSafeImageUrl(scene.imageUrl) && !failed

  // The URL streams in chunks — a 404 on a partial URL must not latch the
  // failed state, or the finished image never shows.
  useEffect(() => {
    setFailed(false)
  }, [scene.imageUrl])

  return (
    <div className="tome-scene-mapplate">
      <div className="tome-mapplate-well">
        {showImage ? (
          <motion.img
            src={scene.imageUrl}
            alt={scene.caption ?? 'Historical plate'}
            className="tome-mapplate-img"
            referrerPolicy="no-referrer"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            initial={{ scale: 1, opacity: 0 }}
            animate={loaded ? { scale: 1.03, opacity: 1 } : { opacity: 0 }}
            transition={{
              opacity: { duration: 1.6, ease: 'easeOut' },
              scale: {
                duration: 48,
                ease: 'linear',
                repeat: Infinity,
                repeatType: 'mirror',
              },
            }}
          />
        ) : (
          <SkeletonBlock ratio="auto" className="tome-mapplate-skel" />
        )}
        <div className="tome-mapplate-vignette" aria-hidden />

        <div className="tome-cartouche">
          {scene.caption ? (
            <motion.span
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.5 }}
            >
              {scene.caption}
            </motion.span>
          ) : (
            <SkeletonLines lines={1} />
          )}
        </div>
      </div>
    </div>
  )
}

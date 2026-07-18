'use client'

import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

export type LeafSide = 'left' | 'right' | 'single'

interface PageLeafProps {
  side: LeafSide
  /** 1 = turning forward, -1 = backward. */
  dir: number
  children: ReactNode
}

const TURN = { duration: 0.7, ease: [0.35, 0.1, 0.22, 1] as const }
const SETTLE = { duration: 0.45, ease: 'easeOut' as const }

/**
 * One physical page in the spread, 3D page-turn via rotateY at the spine.
 * Forward: the old right page folds across the spine while the new left page
 * falls open; the non-hinged pages crossfade beneath. (Mirrored backward.)
 */
export function PageLeaf({ side, dir, children }: PageLeafProps) {
  const turningIn =
    side === 'single' || (dir === 1 ? side === 'left' : side === 'right')
  const turningOut =
    side === 'single' || (dir === 1 ? side === 'right' : side === 'left')

  // Hinge sits at the spine: right edge of a left page, left edge of a right page.
  const originIn = side === 'right' ? 'left center' : 'right center'
  const originOut = side === 'left' ? 'right center' : 'left center'

  const inAngle = side === 'right' ? -102 : 102
  const outAngle = side === 'left' ? 102 : -102

  return (
    <motion.div
      className={`tome-leaf tome-leaf-${side}`}
      style={{
        transformOrigin: turningIn ? originIn : originOut,
        zIndex: turningIn ? 4 : 1,
      }}
      initial={
        turningIn
          ? { rotateY: inAngle, opacity: 0.5 }
          : { rotateY: 0, opacity: 0 }
      }
      animate={{
        rotateY: 0,
        opacity: 1,
        transition: turningIn ? { ...TURN, delay: 0.12 } : SETTLE,
      }}
      exit={
        turningOut
          ? {
              rotateY: outAngle,
              opacity: 0,
              transition: {
                rotateY: TURN,
                opacity: { duration: 0.32, delay: 0.3 },
              },
              zIndex: 5,
            }
          : { opacity: 0, transition: { duration: 0.35 } }
      }
    >
      {children}
    </motion.div>
  )
}

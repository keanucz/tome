'use client'

import { ChapterHeaderScene } from './ChapterHeaderScene'
import { LetterQuoteScene } from './LetterQuoteScene'
import { MapPlateScene } from './MapPlateScene'
import { PortraitScene } from './PortraitScene'
import { SkeletonLines } from './Skeleton'
import { TimelineScene } from './TimelineScene'
import {
  sceneCitations,
  type OnCite,
  type PartialScene,
  type SceneContext,
} from './types'

interface SceneViewProps {
  scene: PartialScene | undefined
  ctx: SceneContext
  onCite: OnCite
}

/**
 * Dispatches a (possibly partial) streamed scene to its renderer and wraps it
 * in a citation target: clicking any scene reveals its sources.
 */
export function SceneView({ scene, ctx, onCite }: SceneViewProps) {
  const citations = sceneCitations(scene)
  const citable = citations.length > 0

  const body = renderScene(scene, ctx)

  return (
    <div
      className={`tome-scene ${citable ? 'tome-scene-citable' : ''} tome-scene-${scene?.type ?? 'loading'}-slot`}
      role={citable ? 'button' : undefined}
      tabIndex={citable ? 0 : undefined}
      title={citable ? 'View sources' : undefined}
      onClick={citable ? () => onCite(citations) : undefined}
      onKeyDown={
        citable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onCite(citations)
              }
            }
          : undefined
      }
    >
      {body}
      {citable ? (
        <span className="tome-cite-mark" aria-hidden>
          &#8224;
        </span>
      ) : null}
    </div>
  )
}

function renderScene(scene: PartialScene | undefined, ctx: SceneContext) {
  switch (scene?.type) {
    case 'chapter-header':
      return <ChapterHeaderScene scene={scene} ctx={ctx} />
    case 'portrait':
      return <PortraitScene scene={scene} ctx={ctx} />
    case 'map-plate':
      return <MapPlateScene scene={scene} ctx={ctx} />
    case 'timeline':
      return <TimelineScene scene={scene} ctx={ctx} />
    case 'letter-quote':
      return <LetterQuoteScene scene={scene} ctx={ctx} />
    default:
      return <SkeletonLines lines={5} />
  }
}

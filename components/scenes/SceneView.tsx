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
 * Dispatches a (possibly partial) streamed scene to its renderer. The scene
 * body is plain, freely selectable text (margin glosses depend on that); the
 * citations affordance is the dagger button in the scene's top corner alone.
 */
export function SceneView({ scene, ctx, onCite }: SceneViewProps) {
  const citations = sceneCitations(scene)
  const citable = citations.length > 0

  const body = renderScene(scene, ctx)

  return (
    <div
      className={`tome-scene ${citable ? 'tome-scene-citable' : ''} tome-scene-${scene?.type ?? 'loading'}-slot`}
    >
      {body}
      {citable ? (
        <button
          type="button"
          className="tome-cite-mark"
          onClick={() =>
            onCite(citations, scene?.narration ? [scene.narration] : undefined)
          }
          aria-label="View sources"
          title="View sources"
        >
          <span aria-hidden>&#8224;</span>
        </button>
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

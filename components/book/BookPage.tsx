'use client'

import { motion } from 'framer-motion'
import { InkText } from '@/components/scenes/InkText'
import { SceneView } from '@/components/scenes/SceneView'
import { SkeletonLines } from '@/components/scenes/Skeleton'
import type { OnCite } from '@/components/scenes/types'
import type { FlatPage } from './flatten'

export interface CoverInfo {
  title: string | undefined
  subtitle: string | undefined
  era: string | undefined
}

interface BookPageProps {
  page: FlatPage | undefined
  /** 1-based display page number; null for the cover / blank pages. */
  pageNo: number | null
  active: boolean
  /** True while the stream is still writing (blank pages show a hint). */
  writing: boolean
  textureCls: string
  onCite: OnCite
  cover: CoverInfo
  /** Theme's ambient art prompt, threaded to chapter-header frontispieces. */
  ambientPrompt?: string
  /** Story title, threaded to portrait audiences as conversation grounding. */
  topic?: string
  /** Theme's era label, threaded to portrait audiences. */
  era?: string
}

/** Renders one paper page: cover, content scenes, or a blank/forming page. */
export function BookPage({
  page,
  pageNo,
  active,
  writing,
  textureCls,
  onCite,
  cover,
  ambientPrompt,
  topic,
  era,
}: BookPageProps) {
  const isPlate =
    page?.kind === 'content' &&
    page.scenes.length === 1 &&
    page.scenes[0]?.type === 'map-plate'

  return (
    <div
      className={`tome-page ${textureCls} ${isPlate ? 'tome-page-plate' : ''} ${
        active ? 'tome-page-active' : ''
      }`}
    >
      {!page ? (
        <BlankPage writing={writing} />
      ) : page.kind === 'cover' ? (
        <CoverPage cover={cover} />
      ) : (
        <>
          {!isPlate && page.chapterTitle ? (
            <div className="tome-running-head">{page.chapterTitle}</div>
          ) : null}
          <div className="tome-page-body">
            {page.scenes.map((scene, i) => (
              <SceneView
                key={i}
                scene={scene}
                ctx={{ chapterIndex: page.chapterIndex, ambientPrompt, topic, era }}
                onCite={onCite}
              />
            ))}
          </div>
          {!isPlate && pageNo !== null ? (
            <div className="tome-page-number">{pageNo}</div>
          ) : null}
        </>
      )}
    </div>
  )
}

function CoverPage({ cover }: { cover: CoverInfo }) {
  return (
    <div className="tome-title-page">
      <div className="tome-title-frame">
        <span className="tome-title-ornament" aria-hidden>
          &#10022;
        </span>
        {cover.title ? (
          <h1 className="tome-title">
            <InkText text={cover.title} maxDelay={1.6} />
          </h1>
        ) : (
          <div className="tome-title">
            <SkeletonLines lines={2} />
          </div>
        )}
        {cover.subtitle ? (
          <p className="tome-subtitle">
            <InkText text={cover.subtitle} maxDelay={1.8} />
          </p>
        ) : null}
        <div className="tome-rule" aria-hidden>
          <span className="tome-rule-line" />
          <span className="tome-rule-fleuron">&#10087;</span>
          <span className="tome-rule-line" />
        </div>
        {cover.era ? (
          <motion.p
            className="tome-era-label"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.4, delay: 0.6 }}
          >
            {cover.era}
          </motion.p>
        ) : null}
      </div>
    </div>
  )
}

function BlankPage({ writing }: { writing: boolean }) {
  return (
    <div className="tome-blank-page">
      {writing ? (
        <div className="tome-forming">
          <span className="tome-forming-quill" aria-hidden>
            &#10002;
          </span>
          <span className="tome-forming-text">
            the story is still being written&hellip;
          </span>
        </div>
      ) : null}
    </div>
  )
}

# Tome — Build Ownership Map

Spec: `docs/superpowers/specs/2026-07-18-tome-design.md`. Parallel build with
disjoint file ownership; contracts locked in phase 0.

## Contracts (orchestrator-owned, agents import only)

- `lib/story/schema.ts` — zod Story/Scene/Theme/Citation + PartialStory helpers
- `lib/sources/types.ts` — SourceCorpus shapes
- `lib/tts/types.ts` — TTSProvider interface + /api/tts route contract
- `lib/tts/client.ts` — `useNarration()` hook contract (stub is functional speechSynthesis; TTS agent upgrades in place)

## Track ownership

| Track | Owns | Public API consumed by others |
|---|---|---|
| A sources | `lib/sources/wikipedia.ts`, `lib/sources/commons.ts`, `lib/sources/corpus.ts` (replaces stub), `scripts/test-corpus.ts` | `buildCorpus(query): Promise<SourceCorpus>` |
| B weave | `lib/story/prompt.ts`, `app/api/story/route.ts`, `lib/story/fixtures/*` | `POST /api/story {topic}` → streamObject text stream of StorySchema |
| C book UI | `components/book/*`, `components/scenes/*`, `lib/story/theme.ts`, `app/fonts.ts` | `<Book story={PartialStory} onCite={(c: Citation[]) => void} autoNarrate?: boolean />` |
| D tts | `lib/tts/providers/*`, `app/api/tts/route.ts`, upgrade `lib/tts/client.ts` | `useNarration()` per contract; GET /api/tts |
| E voice+cite | `components/voice/VoiceInput.tsx`, `components/citations/CitationsPanel.tsx` | `<VoiceInput onSubmit={(q: string) => void} />`, `<CitationsPanel citations open onClose />` |
| Integration (orchestrator) | `app/page.tsx`, `app/layout.tsx`, `app/globals.css` glue | — |

## Rules for all agents

- Do not edit contract files, package.json, or files outside your track.
- No `npm install`, no `npm run dev`, no `npm run build` (collisions). Verify with `npx tsc --noEmit` only.
- No git commits — orchestrator commits after integration.
- Later phases: Runware ambient (`app/api/ambient/route.ts`), prebake script, polish.

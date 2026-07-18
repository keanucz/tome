# Tome — Design Spec

**Date:** 2026-07-18
**Context:** Null Fellows hackathon. Theme: inter(action/faces) — "build a better way to interact with AI."
**Deadline:** 2026-07-19 10:00 (submission), pitches 10:30. ~17 working hours from design approval.
**Team:** Solo.
**Judging criteria:** coolness, technical complexity, creativity.

## Concept

Ask a history question by voice (or text) and a living book materializes on screen: era-styled typography, real period artwork from Wikimedia Commons, narrated pages that turn themselves, and every passage tappable to reveal its source. The story is woven live from Wikipedia articles — the book visibly writes itself in front of the viewer as the LLM streams.

**The 30-second demo moment:** speak "tell me the story of the Seven Years' War" → a book opens, an era-appropriate theme applies itself, pages fill with text, portraits, and maps while a narrator reads, and the page turns on its own when the narration finishes.

## Explicitly Out of Scope

Pitched as roadmap only — not built:

- Android / Boox / reMarkable e-ink companion app
- Rendered video output / YouTube upload
- Full claim-level cross-reference engine across independent source sites (a "cross-ref lite" agreement badge is a stretch goal, see Cut Order)

## Architecture

- **Framework:** Next.js (App Router) + TypeScript + Tailwind CSS + Framer Motion. Single repo. Runs locally for the demo; no deployment required.
- **LLM:** Anthropic `claude-sonnet-5` via Vercel AI SDK `streamObject`. The story arrives as a stream of schema-validated JSON scenes; the client renders each page as it lands.
- **Pipeline:**
  1. **Query** — voice via Web Speech API (Chrome) or typed text.
  2. **Source fetch** — Wikipedia search API resolves the topic → fetch main article + linked sub-articles (people, battles, treaties) via the Wikipedia REST API → fetch associated Wikimedia Commons images with metadata (title, artist, date, license).
  3. **Story weave** — Claude receives the source corpus and streams a `Story` object: title, era theme, chapters → pages → scenes. Every scene carries `narrationText` and `citations[]` pointing back to source articles and section anchors.
  4. **TTS** — narration per page through a `TTSProvider` interface. Audio cached by `hash(text + voice)`.
  5. **Ambient art** — Runware generates page textures and chapter frontispieces asynchronously; placeholders shown until ready. Real Commons artifacts are always the primary imagery.

## Data Model

```ts
Story {
  title: string
  theme: ThemeSpec        // LLM-picked palette, font pairing (curated Google-font set), page texture id
  chapters: Chapter[]     // → pages[] → scenes[]
}

Scene {
  type: 'chapter-header' | 'portrait' | 'map-plate' | 'timeline' | 'letter-quote'
  props: Record<string, unknown>   // per-component, zod-validated
  narrationText: string
  citations: Citation[]   // { articleTitle, sectionAnchor, url, snippet }
}
```

### Scene Components (5 core)

| Component | Behavior |
|---|---|
| `ChapterHeader` | Era-styled drop-cap title page, optional frontispiece |
| `Portrait` | Commons portrait with Ken Burns pan/zoom, caption with artist/date |
| `MapPlate` | Historical map image, slow zoom toward relevant region |
| `Timeline` | Key dates strip, animated reveal |
| `LetterQuote` | Primary-source quote styled as period letter/document |

Battle diagrams: stretch goal only.

## Generative UI Approach (Hybrid)

Curated scene components that the LLM selects and parameterizes via streamed JSON, **plus** a per-story LLM-generated `ThemeSpec` (typography, palette, page texture per era). This is the technical-complexity centerpiece: the interface itself is generated per story, but from a vocabulary that cannot produce broken layouts.

## Voice

- **Input:** Web Speech API (Chrome). No Whisper fallback unless Web Speech proves unreliable during build.
- **Output:** `TTSProvider` interface with four adapters, built in this order:
  1. **ElevenLabs** — default narrator, best storytelling quality
  2. **OpenAI TTS** — fallback
  3. **Browser `speechSynthesis`** — final fallback, zero-dependency
  4. **Kokoro (local)** — built last, cut first
- Runtime fallback chain: ElevenLabs → OpenAI → browser.
- Page auto-turns when its narration audio ends.

## Citations UI

Tap or hover any passage → side panel slides in with the source snippet, article title, and Wikipedia link. Purpose: turn "how do you know it's not hallucinating?" into a live demo of provenance. Every narrated sentence is traceable.

## Error Handling

- **Streamed scenes:** zod-validated. Malformed scene → one retry → skip scene; the story continues without it.
- **TTS:** provider fallback chain (above).
- **Wikipedia fetch failure:** in-book "torn page" error state — errors stay inside the book fiction.
- **Demo insurance:** 2–3 pre-baked showcase stories cached to disk (Seven Years' War, French Revolution, one biography). If wifi or any API dies at pitch time, the cached stories play fully offline except live TTS (cached audio ships with them).

## Testing

Hackathon-pragmatic (conscious deviation from the 80%-coverage house rule; TDD ceremony would cost ~3h against a 17h budget):

- Zod schemas as the runtime contract for all LLM output
- Unit tests on pipeline transforms (source fetch parsing, story assembly)
- Manual E2E checklist run before submission

## Hour Plan

| Hours | Work |
|---|---|
| 0–1 | Scaffold, API keys, Wikipedia fetch utils |
| 1–4 | Weave pipeline + zod schemas + streaming to client |
| 4–8 | Book renderer, 5 scene components, page-turn animation, theming |
| 8–10 | `TTSProvider` + ElevenLabs + browser adapters, audio/page sync |
| 10–11.5 | Voice input + citations panel |
| 11.5–13 | Runware ambient art |
| 13–14.5 | Pre-bake showcase stories, polish |
| 14.5–15.5 | README, push repo, pitch outline |
| remainder | Buffer / sleep / pitch rehearsal |

## Cut Order (if behind schedule)

1. Runware ambient art
2. Kokoro + OpenAI TTS adapters (keep ElevenLabs + browser)
3. Voice input (keep text input)
4. Multi-article sourcing (drop to single article)

## Stretch (only if ahead at ~04:00)

- Cross-ref-lite: agreement badges on key facts (dates, actors, outcomes) checked against a second source
- Word-level karaoke highlight synced to narration timestamps

## API Keys Available

Anthropic, OpenAI, ElevenLabs, Runware — all in hand. Stored in `.env.local`, never committed.

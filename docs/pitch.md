# Tome — 5-minute pitch script

Pitch slot: 5 minutes, then unlimited Q&A. Timings below are cumulative.

## Before you go on

- Chrome, mic permission already granted for localhost, audio output tested at room volume.
- Dev server running; home page loaded and idle.
- Run the demo query once beforehand: the TTS cache then replays narration from disk with zero delay.
- If wifi dies: the browser voice covers TTS, and the saved Seven Years' War corpus (`POST /api/story {fixture: true}`) covers Wikipedia. The model call needs a connection; tether as last resort.

## 0:00 — Hook (face the room, screen dark or on the home page)

"Show of hands: who can tell me how the Seven Years' War started?"

(beat)

"Right. We could ask a chatbot, and we'd get twelve grey paragraphs. Every AI product today is a chat window. I wanted to see what happens when the answer isn't text at all."

Turn to the screen. "This is Tome. You ask history a question, and it writes you a book."

## 0:30 — Live demo

Beats, with what to say while each is happening. The generation takes about a minute; the talking points below fill it. Do not apologize for the wait — the book writing itself is the demo.

1. **Press the mic and ask, out loud:** "Tell me the story of the Seven Years' War." Point out the live transcript ghosting into the catalog card, and that it auto-submits when you stop talking.
2. **"Consulting the archives."** Say what is actually happening: "Right now it's searching Wikipedia, picking the sub-articles that matter — Frederick the Great, the Battle of Rossbach, the Treaty of Paris — and pulling real portraits and maps from Wikimedia Commons, with painter and date."
3. **The cover lands.** Call it out: "The model just designed this book. It picked the era label, this palette, this font pairing, this page texture — for this story. Ask about Ada Lovelace instead and you get a different book."
4. **Pages fill in.** "The story arrives as one streaming JSON object. Every page you see materialize is a validated piece of it. Skeletons fill as scenes land."
5. **Narration starts.** Let it read for ten seconds or so. Point at the portrait: "That's a real painting, from Commons, drifting Ken Burns style. Nothing here is AI-generated imagery."
6. **The page turns itself.** "When the narration for a page finishes, the book turns the page. Nobody is clicking."
7. **Tap the dagger (†) on a scene.** The marginalia panel slides in. "Every passage is backed by a verbatim quote from the source. Article, section, link to Wikipedia. This is the answer to 'how do I know it's not making this up' — you tap and read the source."
8. **Select a phrase** (e.g. "Estates-General"). The margin note appears inline. "You never leave the book to Google something — select it and the margin explains it, grounded in Wikipedia, with the link."
9. **The closer — click "⚜ Request an audience" under a portrait.** Ask Frederick, out loud, why he invaded Saxony. He answers in character, in a voice cast for him, grounded in his article. Then turn to the judges: "You have unlimited Q&A — so does the book. Ask it anything."

Use the NARRATION ON/OFF toggle (bottom right of the book) to silence the narrator when you start talking to the room.

## 3:00 — How it works (30 seconds)

"One pipeline, one streaming call. Wikipedia and Commons become a source corpus — main article, five related articles, twenty-five images with metadata. That corpus goes to Claude in a single `streamObject` call with a zod schema: chapters, pages, five scene types, a theme. The schema is enforced through the tool interface, so malformed output fails validation instead of rendering. The client renders the partial JSON as it streams. Each page's narration goes through ElevenLabs, cached to disk, with OpenAI and the browser voice as fallbacks, and the audio ending is what turns the page."

## 3:30 — Why this answers the theme (45 seconds)

"The theme asks for a better way to interact with AI. Our answer: stop rendering the model's words and start rendering its judgment. In Tome, the interface is the product — the model art-directs the book: layout, palette, typography, imagery, pacing, citations. All of it is fields in one schema.

But it's generative UI with a curated vocabulary. The model chooses from five scene components, five font pairings, five textures, and hex colors that get validated. That vocabulary is big enough that every book feels authored, and small enough that the model cannot produce a broken layout. Zod supplies the grammar; the model supplies the taste."

## 4:15 — Roadmap and close (45 seconds)

"Three things we pitched and deliberately did not build in twenty hours. An e-ink companion app — this book belongs on a reMarkable. Rendered video — the Story object is already a storyboard with narration timing. And a cross-reference engine — claim-level agreement badges checked against independent sources, on top of today's citations.

We've spent years teaching models to talk. Tome is what it looks like when you let one write you a book instead. Come ask it something — any topic, live."

---

## Q&A ammo

**"How do you stop it hallucinating?"**
Four layers. The source text and image list are injected verbatim and the system prompt restricts the model to them. The zod schema is enforced through the tool interface, and every scene must carry a citation whose snippet is a verbatim quote from the corpus. Image URLs must be copied character-for-character from the supplied Commons list — the test harness runs a full weave and fails if any URL or citation doesn't match the corpus exactly, and the renderer drops anything that isn't https or fails to load. And honestly: no prompt makes hallucination impossible, which is exactly why provenance is in the UI. Tap the passage, read the quote, click through to Wikipedia. Then offer to tap one live.

**"Is the demo canned?"**
Partly, and the UI says so: the four archive chips are prebaked showcase replays — baked earlier by `scripts/prebake.ts` through the identical live pipeline, labeled "From the archive" on screen — so the pitch doesn't gamble on conference wifi. Anything typed or spoken is a live streaming weave against claude-sonnet-5. Then: "Give me any topic and we'll run it right now." Take the topic.

**"A minute of latency?"**
About 73 seconds for the complete book in live runs, and that is the theatre. The cover and first pages arrive much sooner because the JSON streams with title and theme forced first, and page one's narration covers the tail of generation — by the time the narrator finishes page one, the rest of the book exists. Chat interfaces hide latency behind a spinner; Tome performs it. Watching the book write itself is the thirty seconds people remember.

**"Why not just RAG with a chat window?"**
The retrieval is the same; the output contract is the difference. Chat renders tokens. Tome renders a designed object: theme, imagery, narration, pacing, and citations are all fields in one schema the model fills, and the client knows how to perform each one. You cannot get a self-turning narrated page with tappable provenance out of a text stream. The book is the interface.

**"What does a story cost?"**
Roughly 30k tokens through claude-sonnet-5 per weave — about twenty cents at current pricing — plus ten to fifteen short ElevenLabs calls, since narration is capped at 700 characters per scene. Well under a dollar per story, and the audio cache makes every replay free.

**"What happens if the model emits garbage mid-stream?"**
Every renderer null-guards every field; partial scenes render as skeletons. Theme values are validated with parchment fallbacks, broken images hide themselves, and a scene that fails schema validation never reaches the page. Errors stay inside the book's fiction: if the archives can't be reached, you get a torn page, not a stack trace.

**"Why Wikipedia? Isn't that a weak source?"**
It's the largest structured, licensed, machine-readable corpus with images attached, which is what a 20-hour build needs. The architecture doesn't care where the corpus comes from — `buildCorpus()` is one function, and the cross-reference roadmap item is exactly about adding independent sources and scoring agreement.

**"What was the hardest technical problem?"**
Two candidates, both honest: the streaming discriminated-union schema was too large for the API's default constraint-grammar mode, so the weave uses the jsonTool structured-output mode instead — and the whole client is built to render a deeply partial object at any moment. Second, the audio-to-page-turn sync: narration finishing is a signal that has to race correctly against pages still streaming in, manual navigation, and provider fallbacks.

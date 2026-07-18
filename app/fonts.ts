import {
  Baskervville,
  Bodoni_Moda,
  Cardo,
  Crimson_Text,
  EB_Garamond,
  Fraunces,
  Grenze_Gotisch,
  IBM_Plex_Mono,
  Marcellus,
  Playfair_Display,
  Source_Serif_4,
} from 'next/font/google'
import { PAIRING_FONT_VARS, type FontPairing } from '@/lib/story/theme'

/**
 * Era font pairings (display + body) for the five ThemeSpec fontPairing ids,
 * plus a shared archival mono accent for catalog labels and folios.
 *
 * next/font requires the `variable` option to be a string literal, so the
 * CSS-variable names are written out here AND in
 * `lib/story/theme.ts` (PAIRING_FONT_VARS) — keep both in sync.
 *
 * Integration: drop `fontVariables` onto <body> (or any ancestor of <Book/>).
 */

// ── classical: Marcellus + EB Garamond ──────────────────────────────────────
// Marcellus is an inscriptional Roman capital face — the classical register
// without the over-used Cinzel look.
const classicalDisplay = Marcellus({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-classical-display',
})
const classicalBody = EB_Garamond({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-classical-body',
})

// ── enlightenment: Playfair Display + Baskervville ──────────────────────────
// Baskerville is literally the type of the Enlightenment; Baskervville is its
// faithful revival and pairs with Playfair's high-contrast display cut.
const enlightenmentDisplay = Playfair_Display({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-enlightenment-display',
})
const enlightenmentBody = Baskervville({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-enlightenment-body',
})

// ── gothic: Grenze Gotisch + Cardo ──────────────────────────────────────────
// Grenze Gotisch carries the blackletter flavor while staying readable
// (UnifrakturMaguntia was authentic but illegible); Cardo is a scholarly
// medievalist text face.
const gothicDisplay = Grenze_Gotisch({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-gothic-display',
})
const gothicBody = Cardo({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-gothic-body',
})

// ── romantic: Bodoni Moda + Crimson Text ────────────────────────────────────
// The 19th century is Didone territory: Bodoni Moda with optical sizing
// replaces the too-deco Italiana.
const romanticDisplay = Bodoni_Moda({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-romantic-display',
})
const romanticBody = Crimson_Text({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-romantic-body',
})

// ── modern: Fraunces + Source Serif 4 ───────────────────────────────────────
const modernDisplay = Fraunces({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-modern-display',
})
const modernBody = Source_Serif_4({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-modern-body',
})

// ── archive accent: IBM Plex Mono ───────────────────────────────────────────
// Shared across all eras for catalog labels, folios, and page counters —
// the "library apparatus" voice, distinct from every book voice.
const archiveMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-archive',
})

const ALL_FONTS = [
  classicalDisplay,
  classicalBody,
  enlightenmentDisplay,
  enlightenmentBody,
  gothicDisplay,
  gothicBody,
  romanticDisplay,
  romanticBody,
  modernDisplay,
  modernBody,
  archiveMono,
]

/** className list exposing every era font CSS variable — put on <body>. */
export const fontVariables: string = ALL_FONTS.map((f) => f.variable).join(' ')

/** Pairing id → the CSS variable names its display/body fonts live under. */
export const pairingFontVars: Record<
  FontPairing,
  { displayVar: string; bodyVar: string }
> = PAIRING_FONT_VARS

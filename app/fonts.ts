import {
  Cinzel,
  Cormorant_Garamond,
  Crimson_Text,
  EB_Garamond,
  Fraunces,
  IM_Fell_English,
  Italiana,
  Playfair_Display,
  Source_Serif_4,
  UnifrakturMaguntia,
} from 'next/font/google'
import { PAIRING_FONT_VARS, type FontPairing } from '@/lib/story/theme'

/**
 * Era font pairings (display + body) for the five ThemeSpec fontPairing ids.
 *
 * next/font requires the `variable` option to be a string literal, so the
 * CSS-variable names are written out here AND in
 * `lib/story/theme.ts` (PAIRING_FONT_VARS) — keep both in sync.
 *
 * Integration: drop `fontVariables` onto <body> (or any ancestor of <Book/>).
 */

// ── classical: Cinzel + EB Garamond ─────────────────────────────────────────
const classicalDisplay = Cinzel({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-classical-display',
})
const classicalBody = EB_Garamond({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-classical-body',
})

// ── enlightenment: Playfair Display + Cormorant Garamond ────────────────────
const enlightenmentDisplay = Playfair_Display({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-enlightenment-display',
})
const enlightenmentBody = Cormorant_Garamond({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-enlightenment-body',
})

// ── gothic: UnifrakturMaguntia + IM Fell English ────────────────────────────
const gothicDisplay = UnifrakturMaguntia({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-gothic-display',
})
const gothicBody = IM_Fell_English({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-gothic-body',
})

// ── romantic: Italiana + Crimson Text ───────────────────────────────────────
const romanticDisplay = Italiana({
  subsets: ['latin'],
  weight: '400',
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
]

/** className list exposing every era font CSS variable — put on <body>. */
export const fontVariables: string = ALL_FONTS.map((f) => f.variable).join(' ')

/** Pairing id → the CSS variable names its display/body fonts live under. */
export const pairingFontVars: Record<
  FontPairing,
  { displayVar: string; bodyVar: string }
> = PAIRING_FONT_VARS

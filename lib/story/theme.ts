import type { CSSProperties } from 'react'
import {
  FONT_PAIRINGS,
  TEXTURE_IDS,
  type DeepPartial,
  type ThemeSpec,
} from '@/lib/story/schema'

/**
 * Theme → CSS custom properties for the book renderer.
 *
 * The font CSS-variable NAMES here must stay in sync with the literal
 * `variable:` options in `app/fonts.ts` (next/font requires literals there,
 * so the names are duplicated by necessity — change both together).
 */

export type FontPairing = (typeof FONT_PAIRINGS)[number]
export type TextureId = (typeof TEXTURE_IDS)[number]

export const PAIRING_FONT_VARS: Record<
  FontPairing,
  { displayVar: string; bodyVar: string }
> = {
  classical: {
    displayVar: '--font-classical-display',
    bodyVar: '--font-classical-body',
  },
  enlightenment: {
    displayVar: '--font-enlightenment-display',
    bodyVar: '--font-enlightenment-body',
  },
  gothic: {
    displayVar: '--font-gothic-display',
    bodyVar: '--font-gothic-body',
  },
  romantic: {
    displayVar: '--font-romantic-display',
    bodyVar: '--font-romantic-body',
  },
  modern: {
    displayVar: '--font-modern-display',
    bodyVar: '--font-modern-body',
  },
}

/** Sane parchment defaults shown while the theme is still streaming in. */
export const DEFAULT_PALETTE = {
  paper: '#f4ecd9',
  ink: '#2b2118',
  accent: '#7d3b28',
  gold: '#b08a3e',
} as const

const HEX_RE = /^#[0-9a-fA-F]{6}$/

function safeHex(value: string | undefined, fallback: string): string {
  return value !== undefined && HEX_RE.test(value) ? value : fallback
}

function safePairing(value: string | undefined): FontPairing {
  return (FONT_PAIRINGS as readonly string[]).includes(value ?? '')
    ? (value as FontPairing)
    : 'classical'
}

/** Style object with CSS custom properties, assignable to `style` props. */
export type ThemeCssVars = CSSProperties & Record<`--${string}`, string>

/**
 * Convert a (possibly partially-streamed) ThemeSpec into the CSS custom
 * properties the book and scene styles consume. Every field is guarded;
 * missing or malformed values fall back to a classical parchment look.
 */
export function themeToCssVars(
  theme: DeepPartial<ThemeSpec> | undefined,
): ThemeCssVars {
  const pairing = safePairing(theme?.fontPairing)
  const fonts = PAIRING_FONT_VARS[pairing]
  const palette = theme?.palette

  return {
    '--paper': safeHex(palette?.paper, DEFAULT_PALETTE.paper),
    '--ink': safeHex(palette?.ink, DEFAULT_PALETTE.ink),
    '--accent': safeHex(palette?.accent, DEFAULT_PALETTE.accent),
    '--gold': safeHex(palette?.gold ?? undefined, DEFAULT_PALETTE.gold),
    '--font-display': `var(${fonts.displayVar}), Georgia, serif`,
    '--font-body': `var(${fonts.bodyVar}), Georgia, serif`,
  }
}

/**
 * CSS class applying the page texture (implemented in components/book/book.css).
 * Unknown / still-streaming ids fall back to parchment.
 */
export function textureClass(
  textureId: string | undefined,
): `tome-texture-${TextureId}` {
  const id = (TEXTURE_IDS as readonly string[]).includes(textureId ?? '')
    ? (textureId as TextureId)
    : 'parchment'
  return `tome-texture-${id}`
}

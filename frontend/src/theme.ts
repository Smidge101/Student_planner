import type { CSSProperties } from 'react'

import type { PastelColor, ThemeMode } from './types'

// One saturated shade per palette color, dark enough for white text on top
// (WCAG AA). Pastel fills are mixed from it in CSS with color-mix().
export const PALETTE: Record<PastelColor, { label: string; hex: string }> = {
  lavender: { label: 'Lavender', hex: '#7357c4' },
  lilac: { label: 'Lilac', hex: '#9b4fb0' },
  periwinkle: { label: 'Periwinkle', hex: '#5466c4' },
  sky: { label: 'Sky', hex: '#2f78ae' },
  mint: { label: 'Mint', hex: '#2b7f5c' },
  butter: { label: 'Butter', hex: '#8a6a0e' },
  peach: { label: 'Peach', hex: '#b4572a' },
  pink: { label: 'Pink', hex: '#b3467a' },
}

export const PALETTE_KEYS = Object.keys(PALETTE) as PastelColor[]

export function applyTheme(mode: ThemeMode, accent: PastelColor) {
  const root = document.documentElement
  root.dataset.theme = mode
  root.style.setProperty('--accent', PALETTE[accent].hex)
}

/** CSS variables for something drawn in a course's color. */
export function courseColorStyle(color: PastelColor | undefined) {
  return { '--course': PALETTE[color ?? 'lavender'].hex } as CSSProperties
}

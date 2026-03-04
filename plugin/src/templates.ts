// ─────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────

export const SLIDE_WIDTH = 1440
export const SLIDE_HEIGHT = 900
export const SLIDE_GAP = 80

// Andes X ax-color tokens (source: 01 Main library [Andes X])
export const COLORS = {
  // Slide backgrounds
  bg:           { r: 1,     g: 1,     b: 1     },  // white
  bgSection:    { r: 0.957, g: 0.961, b: 0.976 },  // ax-gray/100 #f4f5f9
  bgSection2:   { r: 0.906, g: 0.914, b: 0.953 },  // ax-gray/200 #e7e9f3

  // Dark bg — CHO header style (ax-dark-gray/200)
  bgDark:       { r: 0.051, g: 0.051, b: 0.106 },  // #0d0d1b

  // Andes X primary (blue/700) — used for section labels, tags
  accent:       { r: 0.263, g: 0.294, b: 0.894 },  // #434be4
  accentLight:  { r: 0.914, g: 0.945, b: 1     },  // ax-blue/100 #e9f1ff

  // Mercado Pago green — used for cover accent line & CTA
  mpGreen:      { r: 0,     g: 0.651, b: 0.314 },  // #00a650
  mpGreenLight: { r: 0.902, g: 0.969, b: 0.933 },  // #e6f7ee

  // Text
  textPrimary:  { r: 0.157, g: 0.157, b: 0.200 },  // ax-gray/900 #282833
  textSecondary:{ r: 0.392, g: 0.396, b: 0.529 },  // ax-gray/700 #646587
  textLight:    { r: 1,     g: 1,     b: 1     },

  // Border
  border:       { r: 0.816, g: 0.831, b: 0.902 },  // ax-gray/300 #d0d4e6
  borderLight:  { r: 0.906, g: 0.914, b: 0.953 },  // ax-gray/200

  // Do / Don't
  doGreen:      { r: 0.871, g: 0.980, b: 0.871 },  // ax-green/100 #defade
  dontRed:      { r: 1,     g: 0.898, b: 0.914 },  // ax-red/100 #ffe5e9
  dontBorder:   { r: 0.929, g: 0.192, b: 0.290 },  // ax-red/600 #ed314a

  // Tags
  tagBg:        { r: 0.914, g: 0.945, b: 1     },  // ax-blue/100
  tagText:      { r: 0.263, g: 0.294, b: 0.894 },  // ax-blue/700
}

// ax-font tokens: family=Inter, weights=400/600/700
export const FONTS = {
  regular:  { family: 'Inter', style: 'Regular' },   // ax-font/weight/regular  400
  semiBold: { family: 'Inter', style: 'SemiBold' },  // ax-font/weight/semibold 600
  bold:     { family: 'Inter', style: 'Bold' },      // ax-font/weight/bold     700
  extraBold:{ family: 'Inter', style: 'ExtraBold' },
}

export const REQUIRED_FONTS = [
  FONTS.regular,
  FONTS.semiBold,
  FONTS.bold,
  FONTS.extraBold,
]

export const OPTIONAL_FONTS = [
]

// ─────────────────────────────────────────────
// Padding / spacing constants
// ─────────────────────────────────────────────

export const PAD = {
  slideH: 80,    // horizontal slide padding
  slideTop: 64,  // top padding below header bar
  slideBot: 64,  // bottom slide padding
  cardH: 40,     // card horizontal padding
  cardV: 32,     // card vertical padding
  headerH: 80,
  headerV: 20,
  gap: 24,
  gapSmall: 12,
  gapLarge: 40,
}

// ─────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────

export const SLIDE_WIDTH = 1920   // Updated to modern 16:9 standard (was 1440)
export const SLIDE_HEIGHT = 1080  // Updated to modern 16:9 standard (was 900)
export const SLIDE_GAP = 100       // Increased spacing between slides

// Andes X design tokens (source: 01 Main library [Andes X], ksPpKcDXCSni1iK9azu7GX)
// Slide template reference: CALCU playground [Andes X}, node 945-161927
export const COLORS = {
  // ── Backgrounds ─────────────────────────────────────────────
  bg:            { r: 1,     g: 1,     b: 1     },  // #ffffff  color/background/primary
  bgCover:       { r: 1,     g: 0.902, b: 0     },  // #ffe600  ax-color/yellow/500 — cover + section break
  bgSection:     { r: 0.957, g: 0.961, b: 0.976 },  // #f4f5f9  component-focus + do/dont slides
  bgDetail:      { r: 0.906, g: 0.914, b: 0.953 },  // #e7e9f3  color/background/secondary
  bgComponent:   { r: 0.710, g: 0.725, b: 0.831 },  // #b5b9d4  component block placeholders
  bgComponentAlt:{ r: 0.878, g: 0.886, b: 0.930 },  // #e0e2ed  lighter component blocks
  bgTableHeader: { r: 0.157, g: 0.157, b: 0.2   },  // #282833  glossary table headers
  bgTableRow:    { r: 0.957, g: 0.961, b: 0.976 },  // #f4f5f9  alternate row
  bgBadge:       { r: 1,     g: 1,     b: 1     },  // #ffffff  cover badge background

  // ── Text ────────────────────────────────────────────────────
  textPrimary:   { r: 0.157, g: 0.157, b: 0.2   },  // #282833  color/text/primary
  textSecondary: { r: 0.392, g: 0.396, b: 0.529 },  // #646587  color/text/secondary
  textLight:     { r: 1,     g: 1,     b: 1     },  // #ffffff  color/text/inverse
  textDisabled:  { r: 0.612, g: 0.620, b: 0.749 },  // #9c9ebf  color/text/disabled (coming soon)
  textOnCover:   { r: 0.157, g: 0.157, b: 0.2   },  // #282833  text on yellow background

  // ── Accent ──────────────────────────────────────────────────
  accent:        { r: 0.263, g: 0.294, b: 0.894 },  // #434be4  color/text/accent
  accentDark:    { r: 0.153, g: 0.173, b: 0.588 },  // #272c96  color/selected/text/active
  accentLight:   { r: 0.914, g: 0.945, b: 1     },  // #e9f1ff  ax-blue/100

  // ── Feedback ────────────────────────────────────────────────
  dontRed:       { r: 0.878, g: 0.243, b: 0.102 },  // #e03e1a  Don't overlay color
  dontRedLight:  { r: 0.878, g: 0.243, b: 0.102 },  // used at 10% opacity
  doGreen:       { r: 0.122, g: 0.537, b: 0.137 },  // #1f8923  color/feedback/text/positive-loud

  // ── Borders ─────────────────────────────────────────────────
  border:        { r: 0.816, g: 0.831, b: 0.902 },  // #d0d4e6  color/border/primary
  borderLight:   { r: 0.875, g: 0.886, b: 0.93  },  // #e0e2ed  lighter dividers
  annLine:       { r: 0.710, g: 0.725, b: 0.831 },  // #b5b9d4  annotation connector lines

  // ── CTA ─────────────────────────────────────────────────────
  ctaBlue:       { r: 0.263, g: 0.294, b: 0.894 },  // #434be4  primary button

  // ── Tags ────────────────────────────────────────────────────
  tagBg:         { r: 0.914, g: 0.945, b: 1     },  // #e9f1ff  ax-blue/100
  tagText:       { r: 0.263, g: 0.294, b: 0.894 },  // #434be4  ax-blue/700

  // ── Legacy aliases (keep for compatibility) ──────────────────
  bgDark:        { r: 0.157, g: 0.157, b: 0.2   },  // replaced by bgTableHeader
  mpYellow:      { r: 1,     g: 0.902, b: 0     },  // alias for bgCover
  mpBlue:        { r: 0.263, g: 0.294, b: 0.894 },  // alias for accent
  mpGreen:       { r: 0.122, g: 0.537, b: 0.137 },  // alias for doGreen
  mpGreenLight:  { r: 0.902, g: 0.969, b: 0.933 },
  textMuted:     { r: 0.392, g: 0.396, b: 0.529 },  // alias for textSecondary
  dontBorder:    { r: 0.878, g: 0.243, b: 0.102 },  // alias for dontRed
}

// ax-font tokens: family=Inter, weights=400/600/700
export const FONTS = {
  regular:  { family: 'Inter', style: 'Regular' },   // ax-font/weight/regular  400
  semiBold: { family: 'Inter', style: 'Semi Bold' }, // ax-font/weight/semibold 600
  bold:     { family: 'Inter', style: 'Bold' },      // ax-font/weight/bold     700
  extraBold:{ family: 'Inter', style: 'Extra Bold' },
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
// Updated for 1920x1080 and better readability
// ─────────────────────────────────────────────

export const PAD = {
  slideH: 100,   // horizontal slide padding (was 80)
  slideTop: 120, // top padding below floating header (header is 100px tall with paddingTop=62)
  slideBot: 80,  // bottom slide padding (was 64)
  cardH: 48,     // card horizontal padding (was 40)
  cardV: 40,     // card vertical padding (was 32)
  headerH: 100,  // header horizontal padding (was 80)
  headerV: 24,   // header vertical padding (was 20)
  gap: 32,       // default gap (was 24)
  gapSmall: 16,  // small gap (was 12)
  gapLarge: 48,  // large gap (was 40)
}

import type {
  GuidelineData,
  Slide,
  CoverSlide,
  ObjectiveSlide,
  GlossarySlide,
  AnatomySlide,
  UseCaseSlide,
  UseCaseMapSlide,
  BehaviorSlide,
  DoDontSlide,
  WordingSlide,
  ContactSlide,
  BeforeAfterSlide,
  MicrointeractionSlide,
  IndexSlide,
} from './types'
import {
  SLIDE_WIDTH,
  SLIDE_HEIGHT,
  SLIDE_GAP,
  COLORS,
  FONTS,
  PAD,
} from './templates'

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function solid(color: RGB): Paint[] {
  return [{ type: 'SOLID', color }]
}

function makeFrame(name: string): FrameNode {
  const f = figma.createFrame()
  f.name = name
  return f
}

function makeText(content: string, size: number, font: FontName, color: RGB): TextNode {
  const t = figma.createText()
  t.fontName = font
  t.fontSize = size
  t.characters = content ?? ''
  t.fills = solid(color)
  t.textAutoResize = 'HEIGHT'
  return t
}

function setAutoLayout(
  frame: FrameNode,
  direction: 'HORIZONTAL' | 'VERTICAL',
  gap: number,
  padTop = 0,
  padBottom = 0,
  padLeft = 0,
  padRight = 0
) {
  frame.layoutMode = direction
  frame.itemSpacing = gap
  frame.paddingTop = padTop
  frame.paddingBottom = padBottom
  frame.paddingLeft = padLeft
  frame.paddingRight = padRight
  frame.primaryAxisSizingMode = 'AUTO'
  frame.counterAxisSizingMode = 'AUTO'
}

type FontRole = keyof typeof FONTS

const FONT_STYLE_CANDIDATES: Record<FontRole, string[]> = {
  regular: ['Regular', 'Book', 'Roman', 'Normal', 'Medium'],
  semiBold: ['Semi Bold', 'SemiBold', 'Demi Bold', 'DemiBold', 'Medium', 'Bold'],
  bold: ['Bold', 'Semi Bold', 'SemiBold'],
  extraBold: ['Extra Bold', 'ExtraBold', 'Black', 'Heavy', 'Bold'],
}

const FONT_FAMILY_PREFERENCE = ['Inter', 'Roboto', 'Arial', 'Helvetica Neue']

function normalizeFontToken(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, '')
}

function pickFont(
  availableFonts: FontName[],
  families: string[],
  styleCandidates: string[]
): FontName | null {
  const styleSet = new Set(styleCandidates.map((style) => normalizeFontToken(style)))

  for (const family of families) {
    const familyToken = normalizeFontToken(family)
    const match = availableFonts.find(
      (font) =>
        normalizeFontToken(font.family) === familyToken
        && styleSet.has(normalizeFontToken(font.style))
    )
    if (match) return match
  }

  return availableFonts.find((font) => styleSet.has(normalizeFontToken(font.style))) ?? null
}

function uniqueFonts(fonts: FontName[]): FontName[] {
  const seen = new Set<string>()
  return fonts.filter((font) => {
    const key = `${font.family}::${font.style}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function loadFontWithTimeout(font: FontName, timeoutMs = 8000): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Timeout ao carregar fonte ${font.family} ${font.style}`))
    }, timeoutMs)
  })

  try {
    await Promise.race([figma.loadFontAsync(font), timeoutPromise])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

interface ResolvedFontSet {
  regular: FontName
  semiBold: FontName
  bold: FontName
  extraBold: FontName
  primaryFamily: string
  usingInterFallback: boolean
}

export interface BuildGuidelineOptions {
  onProgress?: (stage: string, progress?: number) => void
  shouldAbort?: () => boolean
}

const BUILD_ABORTED_MESSAGE = 'A criação dos slides foi interrompida por tempo limite.'

function ensureBuildNotAborted(options: BuildGuidelineOptions | undefined) {
  if (options?.shouldAbort?.()) {
    throw new Error(BUILD_ABORTED_MESSAGE)
  }
}

function reportProgress(
  options: BuildGuidelineOptions | undefined,
  stage: string,
  progress?: number
) {
  if (!options?.onProgress) return
  if (typeof progress === 'number') {
    options.onProgress(stage, Math.min(1, Math.max(0, progress)))
    return
  }
  options.onProgress(stage)
}

async function resolveFontSet(): Promise<ResolvedFontSet> {
  const availableFonts = (await figma.listAvailableFontsAsync()).map((font) => font.fontName)
  if (!availableFonts.length) {
    throw new Error('Nenhuma fonte disponível no Figma para criar os slides.')
  }

  const hasInter = availableFonts.some((font) => normalizeFontToken(font.family) === 'inter')
  const preferredFamilies = hasInter
    ? FONT_FAMILY_PREFERENCE
    : FONT_FAMILY_PREFERENCE.filter((family) => normalizeFontToken(family) !== 'inter')

  const regular = pickFont(availableFonts, preferredFamilies, FONT_STYLE_CANDIDATES.regular) ?? availableFonts[0]
  const familyPriority = [
    regular.family,
    ...preferredFamilies.filter(
      (family) => normalizeFontToken(family) !== normalizeFontToken(regular.family)
    ),
  ]

  const semiBold = pickFont(availableFonts, familyPriority, FONT_STYLE_CANDIDATES.semiBold) ?? regular
  const bold = pickFont(availableFonts, familyPriority, FONT_STYLE_CANDIDATES.bold) ?? semiBold
  const extraBold = pickFont(availableFonts, familyPriority, FONT_STYLE_CANDIDATES.extraBold) ?? bold

  return {
    regular,
    semiBold,
    bold,
    extraBold,
    primaryFamily: regular.family,
    usingInterFallback: normalizeFontToken(regular.family) !== 'inter',
  }
}

// ─────────────────────────────────────────────
// Shared slide components
// ─────────────────────────────────────────────

function makeHeaderBar(guidelineTitle: string, slideNum?: number): FrameNode {
  const bar = makeFrame('Header bar')
  bar.resize(SLIDE_WIDTH, 1)
  bar.layoutMode = 'HORIZONTAL'
  bar.primaryAxisSizingMode = 'FIXED'
  bar.counterAxisSizingMode = 'AUTO'
  bar.counterAxisAlignItems = 'CENTER'
  bar.paddingLeft = PAD.headerH
  bar.paddingRight = PAD.headerH
  bar.paddingTop = PAD.headerV
  bar.paddingBottom = PAD.headerV
  bar.fills = solid(COLORS.bgDark)

  const label = makeText(
    `GUIDELINE - ${guidelineTitle.toUpperCase()}`,
    18,  // Increased from 12
    FONTS.semiBold,
    { r: 0.6, g: 0.6, b: 0.65 }
  )
  label.letterSpacing = { value: 2, unit: 'PIXELS' }
  label.layoutGrow = 1
  bar.appendChild(label)

  if (slideNum !== undefined) {
    const num = makeText(String(slideNum), 20, FONTS.bold, { r: 0.6, g: 0.6, b: 0.65 })  // Increased from 14
    bar.appendChild(num)
  }

  return bar
}

function makeDivider(): FrameNode {
  const d = makeFrame('Divider')
  d.resize(SLIDE_WIDTH - PAD.slideH * 2, 1)
  d.fills = solid(COLORS.border)
  d.layoutSizingHorizontal = 'FILL' as any
  return d
}

function makeTag(text: string): FrameNode {
  const tag = makeFrame('Tag')
  setAutoLayout(tag, 'HORIZONTAL', 0, 8, 8, 16, 16)  // Increased padding
  tag.cornerRadius = 100
  tag.fills = solid(COLORS.tagBg)

  const label = makeText(text, 24, FONTS.semiBold, COLORS.tagText)  // Increased from 11
  tag.appendChild(label)
  return tag
}

// ─────────────────────────────────────────────
// Slide builders
// ─────────────────────────────────────────────

function buildCoverSlide(slide: CoverSlide, index: number): FrameNode {
  const frame = makeFrame('Cover')
  frame.resize(SLIDE_WIDTH, SLIDE_HEIGHT)
  frame.fills = solid(COLORS.bgDark)
  frame.x = index * (SLIDE_WIDTH + SLIDE_GAP)

  // Accent line top — Mercado Pago green (CHO style)
  const accentLine = makeFrame('Accent')
  accentLine.resize(80, 4)
  accentLine.fills = solid(COLORS.mpGreen)
  accentLine.x = PAD.slideH
  accentLine.y = PAD.slideTop
  frame.appendChild(accentLine)

  // Content frame (centered vertically and horizontally)
  const content = makeFrame('Content')
  setAutoLayout(content, 'VERTICAL', 32, 0, 0, PAD.slideH, PAD.slideH)
  content.fills = []
  content.resize(SLIDE_WIDTH, 1)
  content.primaryAxisSizingMode = 'AUTO'
  content.counterAxisSizingMode = 'FIXED'
  content.counterAxisAlignItems = 'CENTER' // Center horizontally

  const label = makeText('GUIDELINE', 20, FONTS.semiBold, COLORS.mpGreen)
  label.letterSpacing = { value: 4, unit: 'PIXELS' }
  content.appendChild(label)

  const title = makeText(slide.title, 120, FONTS.extraBold, COLORS.textLight)
  title.lineHeight = { value: 110, unit: 'PERCENT' }
  title.textAlignHorizontal = 'CENTER'
  title.resize(SLIDE_WIDTH - PAD.slideH * 2, title.height)
  content.appendChild(title)

  const sub = makeText(slide.subtitle, 48, FONTS.regular, { r: 0.6, g: 0.6, b: 0.65 })
  sub.lineHeight = { value: 140, unit: 'PERCENT' }
  sub.textAlignHorizontal = 'CENTER'
  sub.resize(SLIDE_WIDTH - PAD.slideH * 2, sub.height)
  content.appendChild(sub)

  const spacer = makeFrame('Spacer')
  spacer.resize(1, 60)
  spacer.fills = []
  content.appendChild(spacer)

  const meta = makeText(`${slide.team}  ·  ${slide.version}`, 28, FONTS.semiBold, {
    r: 0.45,
    g: 0.45,
    b: 0.5,
  })
  content.appendChild(meta)

  content.y = (SLIDE_HEIGHT - 500) / 2  // Adjusted for larger content
  frame.appendChild(content)

  return frame
}

function buildObjectiveSlide(
  slide: ObjectiveSlide,
  guidelineTitle: string,
  index: number,
  slideNum: number
): FrameNode {
  const frame = makeFrame('Objetivo')
  frame.resize(SLIDE_WIDTH, SLIDE_HEIGHT)
  frame.fills = solid(COLORS.bg)
  frame.x = index * (SLIDE_WIDTH + SLIDE_GAP)

  const bar = makeHeaderBar(guidelineTitle, slideNum)
  frame.appendChild(bar)

  const content = makeFrame('Content')
  setAutoLayout(content, 'VERTICAL', PAD.gap, PAD.slideTop, PAD.slideBot, PAD.slideH, PAD.slideH)
  content.fills = []
  content.resize(SLIDE_WIDTH, 1)
  content.primaryAxisSizingMode = 'AUTO'
  content.counterAxisSizingMode = 'FIXED'

  const label = makeText('Objetivo do guideline', 20, FONTS.semiBold, COLORS.textSecondary)  // Increased from 13
  label.letterSpacing = { value: 1.5, unit: 'PIXELS' }
  content.appendChild(label)

  const body = makeText(slide.body, 36, FONTS.regular, COLORS.textPrimary)  // Increased from 20
  body.lineHeight = { value: 160, unit: 'PERCENT' }
  body.layoutSizingHorizontal = 'FILL' as any
  content.appendChild(body)

  frame.appendChild(content)
  return frame
}

function buildGlossarySlide(
  slide: GlossarySlide,
  guidelineTitle: string,
  index: number,
  slideNum: number
): FrameNode {
  const frame = makeFrame('Glosário')
  frame.resize(SLIDE_WIDTH, SLIDE_HEIGHT)
  frame.fills = solid(COLORS.bg)
  frame.x = index * (SLIDE_WIDTH + SLIDE_GAP)

  const bar = makeHeaderBar(guidelineTitle, slideNum)
  frame.appendChild(bar)

  const content = makeFrame('Content')
  setAutoLayout(content, 'VERTICAL', PAD.gap, PAD.slideTop, PAD.slideBot, PAD.slideH, PAD.slideH)
  content.fills = []
  content.resize(SLIDE_WIDTH, 1)
  content.primaryAxisSizingMode = 'AUTO'
  content.counterAxisSizingMode = 'FIXED'

  const title = makeText('Glosário', 72, FONTS.bold, COLORS.textPrimary)  // Increased from 40
  content.appendChild(title)

  const sub = makeText('Termos importantes para entender este guideline.', 28, FONTS.regular, COLORS.textSecondary)  // Increased from 16
  content.appendChild(sub)

  content.appendChild(makeDivider())

  // Two-column grid - limit to max 6 terms for readability
  const grid = makeFrame('Grid')
  grid.layoutMode = 'HORIZONTAL'
  grid.primaryAxisSizingMode = 'FIXED'
  grid.counterAxisSizingMode = 'AUTO'
  grid.itemSpacing = PAD.gap
  grid.fills = []
  grid.resize(SLIDE_WIDTH - PAD.slideH * 2, 1)
  grid.layoutSizingHorizontal = 'FILL' as any

  const col1 = makeFrame('Col 1')
  setAutoLayout(col1, 'VERTICAL', PAD.gapSmall, 0, 0, 0, 0)
  col1.fills = []
  col1.layoutGrow = 1

  const col2 = makeFrame('Col 2')
  setAutoLayout(col2, 'VERTICAL', PAD.gapSmall, 0, 0, 0, 0)
  col2.fills = []
  col2.layoutGrow = 1

  // Limit to 6 terms max for readability
  const displayTerms = slide.terms.slice(0, 6)
  const half = Math.ceil(displayTerms.length / 2)

  displayTerms.forEach((item, i) => {
    const row = makeFrame(`Term: ${item.term}`)
    setAutoLayout(row, 'HORIZONTAL', PAD.gapSmall, 20, 20, 0, 0)  // Increased padding
    row.fills = []
    row.strokeWeight = 1
    row.strokes = solid(COLORS.border)
    row.strokeAlign = 'INSIDE'

    const termText = makeText(item.term, 28, FONTS.semiBold, COLORS.textPrimary)  // Increased from 13
    termText.resize(280, termText.height)  // Wider column
    termText.textAutoResize = 'HEIGHT'
    row.appendChild(termText)

    const defText = makeText(item.definition, 24, FONTS.regular, COLORS.textSecondary)  // Increased from 13
    defText.lineHeight = { value: 150, unit: 'PERCENT' }
    defText.layoutGrow = 1
    row.appendChild(defText)

    if (i < half) col1.appendChild(row)
    else col2.appendChild(row)
  })

  grid.appendChild(col1)
  grid.appendChild(col2)
  content.appendChild(grid)
  frame.appendChild(content)
  return frame
}

function buildAnatomySlide(
  slide: AnatomySlide,
  guidelineTitle: string,
  index: number,
  slideNum: number
): FrameNode {
  const frame = makeFrame('Anatomía')
  frame.resize(SLIDE_WIDTH, SLIDE_HEIGHT)
  frame.fills = solid(COLORS.bg)
  frame.x = index * (SLIDE_WIDTH + SLIDE_GAP)

  const bar = makeHeaderBar(guidelineTitle, slideNum)
  frame.appendChild(bar)

  const content = makeFrame('Content')
  setAutoLayout(content, 'VERTICAL', PAD.gap, PAD.slideTop, PAD.slideBot, PAD.slideH, PAD.slideH)
  content.fills = []
  content.resize(SLIDE_WIDTH, 1)
  content.primaryAxisSizingMode = 'AUTO'
  content.counterAxisSizingMode = 'FIXED'

  // Section label
  const sectionLabel = makeText('1 · Estrutura base', 20, FONTS.semiBold, COLORS.accent)  // Increased from 12
  sectionLabel.letterSpacing = { value: 1.5, unit: 'PIXELS' }
  content.appendChild(sectionLabel)

  const title = makeText(slide.title, 72, FONTS.bold, COLORS.textPrimary)  // Increased from 40
  content.appendChild(title)

  if (slide.body) {
    const body = makeText(slide.body, 28, FONTS.regular, COLORS.textSecondary)  // Increased from 16
    body.lineHeight = { value: 150, unit: 'PERCENT' }
    body.layoutSizingHorizontal = 'FILL' as any
    content.appendChild(body)
  }

  content.appendChild(makeDivider())

  // Components list - limit to 4 components for readability
  const list = makeFrame('Components')
  setAutoLayout(list, 'VERTICAL', PAD.gapSmall, 0, 0, 0, 0)
  list.fills = []
  list.layoutSizingHorizontal = 'FILL' as any

  const displayComponents = slide.components.slice(0, 4)  // Limit to 4 components

  displayComponents.forEach((comp) => {
    const row = makeFrame(`Row: ${comp.name}`)
    setAutoLayout(row, 'HORIZONTAL', PAD.gapSmall, 16, 16, 24, 24)  // Increased padding
    row.fills = solid(COLORS.bgSection)
    row.cornerRadius = 12
    row.layoutSizingHorizontal = 'FILL' as any

    const num = makeText(String(comp.index), 28, FONTS.bold, COLORS.accent)  // Increased from 14
    num.resize(40, num.height)
    row.appendChild(num)

    const name = makeText(comp.name, 28, FONTS.semiBold, COLORS.textPrimary)  // Increased from 15
    name.layoutGrow = 1
    row.appendChild(name)

    const tag = makeTag(comp.required ? 'Obrigatório' : 'Optativo')
    row.appendChild(tag)

    list.appendChild(row)
  })

  content.appendChild(list)

  if (slide.note) {
    const note = makeText(`⚠️  ${slide.note}`, 24, FONTS.regular, COLORS.textSecondary)  // Increased from 13
    note.lineHeight = { value: 150, unit: 'PERCENT' }
    content.appendChild(note)
  }

  // Mockup placeholder removed - occupies valuable space without adding value

  frame.appendChild(content)
  return frame
}

function buildUseCaseMapSlide(
  slide: UseCaseMapSlide,
  guidelineTitle: string,
  index: number,
  slideNum: number
): FrameNode {
  const frame = makeFrame('Mapa CDU')
  frame.resize(SLIDE_WIDTH, SLIDE_HEIGHT)
  frame.fills = solid(COLORS.bg)
  frame.x = index * (SLIDE_WIDTH + SLIDE_GAP)

  const bar = makeHeaderBar(guidelineTitle, slideNum)
  frame.appendChild(bar)

  const content = makeFrame('Content')
  setAutoLayout(content, 'VERTICAL', PAD.gap, PAD.slideTop, PAD.slideBot, PAD.slideH, PAD.slideH)
  content.fills = []
  content.resize(SLIDE_WIDTH, 1)
  content.primaryAxisSizingMode = 'AUTO'
  content.counterAxisSizingMode = 'FIXED'

  const sectionLabel = makeText('2 · Casos de uso', 12, FONTS.semiBold, COLORS.accent)
  sectionLabel.letterSpacing = { value: 1, unit: 'PIXELS' }
  content.appendChild(sectionLabel)

  const title = makeText(slide.title, 40, FONTS.bold, COLORS.textPrimary)
  content.appendChild(title)

  content.appendChild(makeDivider())

  const colWidth = Math.max(120, Math.floor((SLIDE_WIDTH - PAD.slideH * 2 - 200) / slide.caseNames.length))
  const COMP_COL = 200

  // Header row
  const headerRow = makeFrame('Header row')
  headerRow.layoutMode = 'HORIZONTAL'
  headerRow.primaryAxisSizingMode = 'AUTO'
  headerRow.counterAxisSizingMode = 'AUTO'
  headerRow.fills = solid(COLORS.bgDark)
  headerRow.cornerRadius = 8
  headerRow.paddingTop = 12
  headerRow.paddingBottom = 12
  headerRow.paddingLeft = 16
  headerRow.paddingRight = 16
  headerRow.itemSpacing = 0

  const emptyCell = makeFrame('empty')
  emptyCell.resize(COMP_COL, 1)
  emptyCell.fills = []
  headerRow.appendChild(emptyCell)

  slide.caseNames.forEach((name) => {
    const cell = makeFrame(`Header: ${name}`)
    cell.resize(colWidth, 1)
    cell.fills = []
    const t = makeText(name, 11, FONTS.semiBold, COLORS.textLight)
    t.textAutoResize = 'HEIGHT'
    cell.appendChild(t)
    headerRow.appendChild(cell)
  })
  content.appendChild(headerRow)

  // Data rows
  slide.rows.forEach((row, i) => {
    const dataRow = makeFrame(`Row: ${row.component}`)
    dataRow.layoutMode = 'HORIZONTAL'
    dataRow.primaryAxisSizingMode = 'AUTO'
    dataRow.counterAxisSizingMode = 'AUTO'
    dataRow.fills = solid(i % 2 === 0 ? COLORS.bg : COLORS.bgSection)
    dataRow.paddingTop = 12
    dataRow.paddingBottom = 12
    dataRow.paddingLeft = 16
    dataRow.paddingRight = 16
    dataRow.itemSpacing = 0

    const compCell = makeFrame('comp')
    compCell.resize(COMP_COL, 1)
    compCell.fills = []
    const compText = makeText(row.component, 13, FONTS.semiBold, COLORS.textPrimary)
    compText.textAutoResize = 'HEIGHT'
    compCell.appendChild(compText)
    dataRow.appendChild(compCell)

    slide.caseNames.forEach((caseName) => {
      const cell = makeFrame(`cell`)
      cell.resize(colWidth, 1)
      cell.fills = []
      const check = makeText(row.cases[caseName] ? '✅' : '—', 14, FONTS.regular, COLORS.textSecondary)
      cell.appendChild(check)
      dataRow.appendChild(cell)
    })

    content.appendChild(dataRow)
  })

  frame.appendChild(content)
  return frame
}

function buildUseCaseSlide(
  slide: UseCaseSlide,
  guidelineTitle: string,
  index: number,
  slideNum: number
): FrameNode {
  const frame = makeFrame(`CDU: ${slide.title}`)
  frame.resize(SLIDE_WIDTH, SLIDE_HEIGHT)
  frame.fills = solid(COLORS.bg)
  frame.x = index * (SLIDE_WIDTH + SLIDE_GAP)

  const bar = makeHeaderBar(guidelineTitle, slideNum)
  frame.appendChild(bar)

  const content = makeFrame('Content')
  setAutoLayout(content, 'VERTICAL', PAD.gap, PAD.slideTop, PAD.slideBot, PAD.slideH, PAD.slideH)
  content.fills = []
  content.resize(SLIDE_WIDTH - 360, 1)
  content.primaryAxisSizingMode = 'AUTO'
  content.counterAxisSizingMode = 'FIXED'

  const sectionLabel = makeText('2 · Casos de uso', 12, FONTS.semiBold, COLORS.accent)
  sectionLabel.letterSpacing = { value: 1, unit: 'PIXELS' }
  content.appendChild(sectionLabel)

  // Title + country tags
  const titleRow = makeFrame('Title row')
  setAutoLayout(titleRow, 'HORIZONTAL', PAD.gapSmall, 0, 0, 0, 0)
  titleRow.fills = []
  titleRow.counterAxisAlignItems = 'CENTER'

  const titleText = makeText(slide.title, 40, FONTS.bold, COLORS.textPrimary)
  titleRow.appendChild(titleText)

  slide.countries?.forEach((c) => {
    const tag = makeTag(c)
    tag.fills = solid(COLORS.bgSection)
    const tagTextNode = tag.children[0] as TextNode
    tagTextNode.fills = solid(COLORS.textSecondary)
    titleRow.appendChild(tag)
  })

  content.appendChild(titleRow)
  content.appendChild(makeDivider())

  const body = makeText(slide.body, 16, FONTS.regular, COLORS.textPrimary)
  body.lineHeight = { value: 170, unit: 'PERCENT' }
  body.layoutSizingHorizontal = 'FILL' as any
  content.appendChild(body)

  // Components row
  const compLabel = makeText('Componentes', 12, FONTS.semiBold, COLORS.textSecondary)
  compLabel.letterSpacing = { value: 0.5, unit: 'PIXELS' }
  content.appendChild(compLabel)

  const compsRow = makeFrame('Components row')
  setAutoLayout(compsRow, 'HORIZONTAL', 8, 0, 0, 0, 0)
  compsRow.fills = []

  slide.components.forEach((comp, i) => {
    if (i > 0) {
      const dot = makeText('·', 14, FONTS.regular, COLORS.textSecondary)
      compsRow.appendChild(dot)
    }
    const tag = makeTag(comp)
    compsRow.appendChild(tag)
  })
  content.appendChild(compsRow)

  // Mockup placeholder
  const mockup = makeFrame('Mockup')
  mockup.resize(260, 520)
  mockup.cornerRadius = 24
  mockup.fills = solid(COLORS.bgSection)
  mockup.strokes = solid(COLORS.border)
  mockup.strokeWeight = 1
  const mockLabel = makeText('Inserir tela\ndo CDU', 13, FONTS.regular, COLORS.textSecondary)
  mockLabel.textAlignHorizontal = 'CENTER'
  mockLabel.x = 82
  mockLabel.y = (520 - 50) / 2
  mockup.appendChild(mockLabel)
  mockup.x = SLIDE_WIDTH - PAD.slideH - 260
  mockup.y = 120

  frame.appendChild(content)
  frame.appendChild(mockup)
  return frame
}

function buildBehaviorSlide(
  slide: BehaviorSlide,
  guidelineTitle: string,
  index: number,
  slideNum: number
): FrameNode {
  const frame = makeFrame(`Comportamento: ${slide.title}`)
  frame.resize(SLIDE_WIDTH, SLIDE_HEIGHT)
  frame.fills = solid(COLORS.bg)
  frame.x = index * (SLIDE_WIDTH + SLIDE_GAP)

  const bar = makeHeaderBar(guidelineTitle, slideNum)
  frame.appendChild(bar)

  const content = makeFrame('Content')
  setAutoLayout(content, 'VERTICAL', PAD.gap, PAD.slideTop, PAD.slideBot, PAD.slideH, PAD.slideH)
  content.fills = []
  content.resize(SLIDE_WIDTH - 360, 1)
  content.primaryAxisSizingMode = 'AUTO'
  content.counterAxisSizingMode = 'FIXED'

  const sectionLabel = makeText('3 · Comportamentos', 12, FONTS.semiBold, COLORS.accent)
  sectionLabel.letterSpacing = { value: 1, unit: 'PIXELS' }
  content.appendChild(sectionLabel)

  const title = makeText(slide.title, 40, FONTS.bold, COLORS.textPrimary)
  content.appendChild(title)

  if (slide.description) {
    const desc = makeText(slide.description, 16, FONTS.regular, COLORS.textSecondary)
    desc.lineHeight = { value: 160, unit: 'PERCENT' }
    desc.layoutSizingHorizontal = 'FILL' as any
    content.appendChild(desc)
  }

  content.appendChild(makeDivider())

  const table = makeFrame('Table')
  setAutoLayout(table, 'VERTICAL', 0, 0, 0, 0, 0)
  table.fills = []
  table.cornerRadius = 8
  table.clipsContent = true
  table.strokes = solid(COLORS.border)
  table.strokeWeight = 1
  table.layoutSizingHorizontal = 'FILL' as any

  // Table header
  const tHead = makeFrame('Table head')
  tHead.layoutMode = 'HORIZONTAL'
  tHead.primaryAxisSizingMode = 'FIXED'
  tHead.counterAxisSizingMode = 'AUTO'
  tHead.resize(SLIDE_WIDTH - PAD.slideH * 2 - 360, 1)
  tHead.layoutSizingHorizontal = 'FILL' as any
  tHead.fills = solid(COLORS.bgDark)
  tHead.paddingLeft = 16
  tHead.paddingRight = 16
  tHead.paddingTop = 12
  tHead.paddingBottom = 12

  const headers = ['Estado / Condição', 'Descrição']
  headers.forEach((h) => {
    const cell = makeFrame('header cell')
    cell.fills = []
    cell.layoutGrow = 1
    const t = makeText(h, 12, FONTS.semiBold, COLORS.textLight)
    t.letterSpacing = { value: 0.5, unit: 'PIXELS' }
    cell.appendChild(t)
    tHead.appendChild(cell)
  })
  table.appendChild(tHead)

  slide.rows.forEach((row, i) => {
    const tRow = makeFrame(`Row: ${row.label}`)
    tRow.layoutMode = 'HORIZONTAL'
    tRow.primaryAxisSizingMode = 'FIXED'
    tRow.counterAxisSizingMode = 'AUTO'
    tRow.fills = solid(i % 2 === 0 ? COLORS.bg : COLORS.bgSection)
    tRow.paddingLeft = 16
    tRow.paddingRight = 16
    tRow.paddingTop = 14
    tRow.paddingBottom = 14
    tRow.resize(SLIDE_WIDTH - PAD.slideH * 2 - 360, 1)
    tRow.layoutSizingHorizontal = 'FILL' as any

    const labelCell = makeFrame('label cell')
    labelCell.fills = []
    labelCell.layoutGrow = 1
    const lText = makeText(row.label, 14, FONTS.semiBold, COLORS.textPrimary)
    lText.textAutoResize = 'HEIGHT'
    labelCell.appendChild(lText)
    tRow.appendChild(labelCell)

    const valCell = makeFrame('value cell')
    valCell.fills = []
    valCell.layoutGrow = 1
    const vText = makeText(row.value, 14, FONTS.regular, COLORS.textSecondary)
    vText.lineHeight = { value: 150, unit: 'PERCENT' }
    vText.textAutoResize = 'HEIGHT'
    valCell.appendChild(vText)
    tRow.appendChild(valCell)

    table.appendChild(tRow)
  })

  content.appendChild(table)

  // Mockup placeholder
  const mockup = makeFrame('Mockup')
  mockup.resize(260, 520)
  mockup.cornerRadius = 24
  mockup.fills = solid(COLORS.bgSection)
  mockup.strokes = solid(COLORS.border)
  mockup.strokeWeight = 1
  const mockLabel = makeText('Inserir tela\nexemplo', 13, FONTS.regular, COLORS.textSecondary)
  mockLabel.textAlignHorizontal = 'CENTER'
  mockLabel.x = 82
  mockLabel.y = (520 - 50) / 2
  mockup.appendChild(mockLabel)
  mockup.x = SLIDE_WIDTH - PAD.slideH - 260
  mockup.y = 120

  frame.appendChild(content)
  frame.appendChild(mockup)
  return frame
}

function buildDoDontSlide(
  slide: DoDontSlide,
  guidelineTitle: string,
  index: number,
  slideNum: number
): FrameNode {
  const frame = makeFrame('Do / Dont')
  frame.resize(SLIDE_WIDTH, SLIDE_HEIGHT)
  frame.fills = solid(COLORS.bg)
  frame.x = index * (SLIDE_WIDTH + SLIDE_GAP)

  const bar = makeHeaderBar(guidelineTitle, slideNum)
  frame.appendChild(bar)

  const content = makeFrame('Content')
  setAutoLayout(content, 'VERTICAL', PAD.gap, PAD.slideTop, PAD.slideBot, PAD.slideH, PAD.slideH)
  content.fills = []
  content.resize(SLIDE_WIDTH, 1)
  content.primaryAxisSizingMode = 'AUTO'
  content.counterAxisSizingMode = 'FIXED'

  const title = makeText(slide.title, 72, FONTS.bold, COLORS.textPrimary)  // Increased from 40
  content.appendChild(title)
  content.appendChild(makeDivider())

  const cols = makeFrame('Columns')
  cols.layoutMode = 'HORIZONTAL'
  cols.primaryAxisSizingMode = 'FIXED'
  cols.counterAxisSizingMode = 'AUTO'
  cols.itemSpacing = PAD.gapLarge
  cols.fills = []
  cols.resize(SLIDE_WIDTH - PAD.slideH * 2, 1)
  cols.layoutSizingHorizontal = 'FILL' as any

  const buildCol = (items: string[], isdo: boolean) => {
    const col = makeFrame(isdo ? 'Do' : 'Dont')
    setAutoLayout(col, 'VERTICAL', PAD.gap, PAD.cardV, PAD.cardV, PAD.cardH, PAD.cardH)
    col.fills = solid(isdo ? COLORS.doGreen : COLORS.dontRed)
    col.cornerRadius = 16
    col.layoutGrow = 1
    col.strokeWeight = 2
    col.strokes = solid(
      isdo ? { r: 0, g: 0.647, b: 0.314 } : COLORS.dontBorder
    )

    const header = makeText(isdo ? '✅  Faça' : '❌  Evite', 32, FONTS.bold,  // Increased from 16
      isdo ? { r: 0, g: 0.4, b: 0.17 } : { r: 0.75, g: 0.1, b: 0.07 }
    )
    col.appendChild(header)

    // Limit to 3 items per column for readability
    const displayItems = items.slice(0, 3)

    displayItems.forEach((item) => {
      const row = makeFrame(`Item`)
      setAutoLayout(row, 'HORIZONTAL', 12, 0, 0, 0, 0)
      row.fills = []
      row.layoutSizingHorizontal = 'FILL' as any

      const dot = makeText('•', 28, FONTS.bold, COLORS.textSecondary)  // Increased from 14
      row.appendChild(dot)

      const text = makeText(item, 28, FONTS.regular, COLORS.textPrimary)  // Increased from 15
      text.lineHeight = { value: 150, unit: 'PERCENT' }
      text.layoutGrow = 1
      row.appendChild(text)

      col.appendChild(row)
    })

    return col
  }

  cols.appendChild(buildCol(slide.do, true))
  cols.appendChild(buildCol(slide.dont, false))
  content.appendChild(cols)
  frame.appendChild(content)
  return frame
}

function buildWordingSlide(
  slide: WordingSlide,
  guidelineTitle: string,
  index: number,
  slideNum: number
): FrameNode {
  const frame = makeFrame('Wording')
  frame.resize(SLIDE_WIDTH, SLIDE_HEIGHT)
  frame.fills = solid(COLORS.bg)
  frame.x = index * (SLIDE_WIDTH + SLIDE_GAP)

  const bar = makeHeaderBar(guidelineTitle, slideNum)
  frame.appendChild(bar)

  const content = makeFrame('Content')
  setAutoLayout(content, 'VERTICAL', PAD.gap, PAD.slideTop, PAD.slideBot, PAD.slideH, PAD.slideH)
  content.fills = []
  content.resize(SLIDE_WIDTH, 1)
  content.primaryAxisSizingMode = 'AUTO'
  content.counterAxisSizingMode = 'FIXED'

  const sectionLabel = makeText('5 · Keys wording default', 12, FONTS.semiBold, COLORS.accent)
  sectionLabel.letterSpacing = { value: 1, unit: 'PIXELS' }
  content.appendChild(sectionLabel)

  const title = makeText(slide.title, 40, FONTS.bold, COLORS.textPrimary)
  content.appendChild(title)
  content.appendChild(makeDivider())

  slide.errors.forEach((error) => {
    const card = makeFrame(`Error: ${error.name}`)
    setAutoLayout(card, 'VERTICAL', PAD.gapSmall, PAD.cardV, PAD.cardV, PAD.cardH, PAD.cardH)
    card.fills = solid(COLORS.bgSection)
    card.cornerRadius = 12
    card.layoutSizingHorizontal = 'FILL' as any

    const errTitle = makeText(error.name, 16, FONTS.bold, COLORS.textPrimary)
    card.appendChild(errTitle)

    const obj = makeText(`Objetivo: ${error.objective}`, 13, FONTS.regular, COLORS.textSecondary)
    obj.lineHeight = { value: 150, unit: 'PERCENT' }
    obj.layoutSizingHorizontal = 'FILL' as any
    card.appendChild(obj)

    const variantsRow = makeFrame('Variants')
    setAutoLayout(variantsRow, 'HORIZONTAL', PAD.gapSmall, 0, 0, 0, 0)
    variantsRow.fills = []

    error.variants.forEach((v) => {
      const chip = makeFrame('Chip')
      setAutoLayout(chip, 'HORIZONTAL', 6, 10, 10, 14, 14)
      chip.cornerRadius = 8
      chip.fills = solid(COLORS.bg)
      chip.strokes = solid(COLORS.border)
      chip.strokeWeight = 1

      const flag = makeText(v.flag, 14, FONTS.regular, COLORS.textPrimary)
      chip.appendChild(flag)

      const text = makeText(v.text, 13, FONTS.semiBold, COLORS.textPrimary)
      chip.appendChild(text)

      variantsRow.appendChild(chip)
    })
    card.appendChild(variantsRow)

    if (error.rationale) {
      const rat = makeText(`⚠️  ${error.rationale}`, 12, FONTS.regular, COLORS.textSecondary)
      rat.lineHeight = { value: 150, unit: 'PERCENT' }
      rat.layoutSizingHorizontal = 'FILL' as any
      card.appendChild(rat)
    }

    content.appendChild(card)
  })

  frame.appendChild(content)
  return frame
}

function buildContactSlide(
  slide: ContactSlide,
  guidelineTitle: string,
  index: number,
  slideNum: number
): FrameNode {
  const frame = makeFrame('Contato')
  frame.resize(SLIDE_WIDTH, SLIDE_HEIGHT)
  frame.fills = solid(COLORS.bgDark)
  frame.x = index * (SLIDE_WIDTH + SLIDE_GAP)

  const content = makeFrame('Content')
  setAutoLayout(content, 'VERTICAL', PAD.gapLarge, 0, 0, PAD.slideH, PAD.slideH)
  content.fills = []
  content.resize(SLIDE_WIDTH, 1)
  content.primaryAxisSizingMode = 'AUTO'
  content.counterAxisSizingMode = 'FIXED'
  content.counterAxisAlignItems = 'CENTER'  // Center horizontally
  content.y = (SLIDE_HEIGHT - 450) / 2

  const accentLine = makeFrame('Accent')
  accentLine.resize(100, 6)  // Larger accent line
  accentLine.fills = solid(COLORS.accent)
  content.appendChild(accentLine)

  const title = makeText('Comentários, dúvidas\nou feedback?', 80, FONTS.extraBold, COLORS.textLight)  // Increased from 48
  title.lineHeight = { value: 120, unit: 'PERCENT' }
  title.textAlignHorizontal = 'CENTER'
  title.resize(SLIDE_WIDTH - PAD.slideH * 2, title.height)
  content.appendChild(title)

  const sub = makeText(`Envie uma mensagem no nosso canal do Slack.`, 32, FONTS.regular, {  // Increased from 18
    r: 0.6, g: 0.6, b: 0.65,
  })
  sub.textAlignHorizontal = 'CENTER'
  content.appendChild(sub)

  const channel = makeText(slide.channel, 36, FONTS.semiBold, COLORS.accent)  // Increased from 20
  content.appendChild(channel)

  if (slide.links.length > 0) {
    const spacer = makeFrame('s')
    spacer.resize(1, 32)
    spacer.fills = []
    content.appendChild(spacer)

    const linksTitle = makeText('LINKS ÚTEIS', 20, FONTS.semiBold, { r: 0.5, g: 0.5, b: 0.55 })  // Increased from 13
    linksTitle.letterSpacing = { value: 2, unit: 'PIXELS' }
    content.appendChild(linksTitle)

    // Limit to 3 links for readability
    const displayLinks = slide.links.slice(0, 3)
    displayLinks.forEach((link) => {
      const linkText = makeText(`🔗  ${link.label}`, 28, FONTS.semiBold, { r: 0.6, g: 0.7, b: 0.95 })  // Increased from 15
      content.appendChild(linkText)
    })
  }

  frame.appendChild(content)
  return frame
}

// ─────────────────────────────────────────────
// Before / After slide
// ─────────────────────────────────────────────

function buildBeforeAfterSlide(
  slide: BeforeAfterSlide,
  guidelineTitle: string,
  index: number,
  slideNum: number
): FrameNode {
  const frame = makeFrame('Antes e depois')
  frame.resize(SLIDE_WIDTH, SLIDE_HEIGHT)
  frame.fills = solid(COLORS.bg)
  frame.x = index * (SLIDE_WIDTH + SLIDE_GAP)

  const bar = makeHeaderBar(guidelineTitle, slideNum)
  frame.appendChild(bar)

  const content = makeFrame('Content')
  setAutoLayout(content, 'VERTICAL', PAD.gap, PAD.slideTop, PAD.slideBot, PAD.slideH, PAD.slideH)
  content.fills = []
  content.resize(SLIDE_WIDTH, 1)
  content.primaryAxisSizingMode = 'AUTO'
  content.counterAxisSizingMode = 'FIXED'

  const title = makeText(slide.title, 40, FONTS.bold, COLORS.textPrimary)
  content.appendChild(title)
  content.appendChild(makeDivider())

  // Two columns: Antes / Depois
  const cols = makeFrame('Columns')
  cols.layoutMode = 'HORIZONTAL'
  cols.primaryAxisSizingMode = 'FIXED'
  cols.counterAxisSizingMode = 'AUTO'
  cols.itemSpacing = PAD.gap
  cols.fills = []
  cols.resize(SLIDE_WIDTH - PAD.slideH * 2, 1)
  cols.layoutSizingHorizontal = 'FILL' as any

  const buildCol = (data: { label: string; points: string[] }, isBefore: boolean) => {
    const col = makeFrame(data.label)
    setAutoLayout(col, 'VERTICAL', PAD.gapSmall, PAD.cardV, PAD.cardV, PAD.cardH, PAD.cardH)
    col.fills = solid(isBefore ? COLORS.bgSection2 : COLORS.accentLight)
    col.cornerRadius = 12
    col.layoutGrow = 1

    const colLabel = makeText(data.label, 13, FONTS.semiBold,
      isBefore ? COLORS.textSecondary : COLORS.accent)
    colLabel.letterSpacing = { value: 0.5, unit: 'PIXELS' }
    col.appendChild(colLabel)

    data.points.forEach((pt) => {
      const row = makeFrame('point')
      setAutoLayout(row, 'HORIZONTAL', 8, 0, 0, 0, 0)
      row.fills = []
      row.layoutSizingHorizontal = 'FILL' as any

      const bullet = makeText(isBefore ? '–' : '✓', 14, FONTS.bold,
        isBefore ? COLORS.textSecondary : COLORS.accent)
      row.appendChild(bullet)

      const txt = makeText(pt, 16, FONTS.regular, COLORS.textPrimary)
      txt.lineHeight = { value: 150, unit: 'PERCENT' }
      txt.layoutGrow = 1
      row.appendChild(txt)

      col.appendChild(row)
    })
    return col
  }

  cols.appendChild(buildCol(slide.before, true))
  cols.appendChild(buildCol(slide.after, false))
  content.appendChild(cols)

  if (slide.imageNote) {
    const note = makeText(`📸 ${slide.imageNote}`, 12, FONTS.regular, COLORS.textSecondary)
    content.appendChild(note)
  }

  frame.appendChild(content)
  return frame
}

// ─────────────────────────────────────────────
// Microinteraction slide
// ─────────────────────────────────────────────

function buildMicrointeractionSlide(
  slide: MicrointeractionSlide,
  guidelineTitle: string,
  index: number,
  slideNum: number
): FrameNode {
  const frame = makeFrame(`Microinteração: ${slide.title}`)
  frame.resize(SLIDE_WIDTH, SLIDE_HEIGHT)
  frame.fills = solid(COLORS.bg)
  frame.x = index * (SLIDE_WIDTH + SLIDE_GAP)

  const bar = makeHeaderBar(guidelineTitle, slideNum)
  frame.appendChild(bar)

  const content = makeFrame('Content')
  setAutoLayout(content, 'VERTICAL', PAD.gap, PAD.slideTop, PAD.slideBot, PAD.slideH, PAD.slideH)
  content.fills = []
  content.resize(SLIDE_WIDTH - 320, 1)
  content.primaryAxisSizingMode = 'AUTO'
  content.counterAxisSizingMode = 'FIXED'

  const sectionLabel = makeText('4 · Microinterações', 12, FONTS.semiBold, COLORS.accent)
  sectionLabel.letterSpacing = { value: 1, unit: 'PIXELS' }
  content.appendChild(sectionLabel)

  const title = makeText(slide.title, 40, FONTS.bold, COLORS.textPrimary)
  content.appendChild(title)

  if (slide.description) {
    const desc = makeText(slide.description, 16, FONTS.regular, COLORS.textSecondary)
    desc.lineHeight = { value: 160, unit: 'PERCENT' }
    desc.layoutSizingHorizontal = 'FILL' as any
    content.appendChild(desc)
  }

  content.appendChild(makeDivider())

  slide.behaviors.forEach((b) => {
    const card = makeFrame(`behavior-${b.name}`)
    setAutoLayout(card, 'VERTICAL', PAD.gapSmall, PAD.cardV, PAD.cardV, PAD.cardH, PAD.cardH)
    card.fills = solid(COLORS.bgSection)
    card.cornerRadius = 8
    card.layoutSizingHorizontal = 'FILL' as any

    const bName = makeText(b.name, 15, FONTS.semiBold, COLORS.textPrimary)
    card.appendChild(bName)

    if (b.trigger) {
      const trigger = makeText(`Quando: ${b.trigger}`, 13, FONTS.regular, COLORS.textSecondary)
      card.appendChild(trigger)
    }

    const spec = makeText(b.spec, 13, FONTS.regular, COLORS.textSecondary)
    spec.lineHeight = { value: 150, unit: 'PERCENT' }
    spec.layoutSizingHorizontal = 'FILL' as any
    card.appendChild(spec)

    content.appendChild(card)
  })

  // Mockup placeholder
  const mockup = makeFrame('Mockup')
  mockup.resize(260, 480)
  mockup.cornerRadius = 24
  mockup.fills = solid(COLORS.bgSection)
  mockup.strokes = solid(COLORS.border)
  mockup.strokeWeight = 1
  const mockLabel = makeText(slide.imageNote ?? 'Inserir vídeo\nou protótipo', 13, FONTS.regular, COLORS.textSecondary)
  mockLabel.textAlignHorizontal = 'CENTER'
  mockLabel.x = 82
  mockLabel.y = (480 - 50) / 2
  mockup.appendChild(mockLabel)
  mockup.x = SLIDE_WIDTH - PAD.slideH - 260
  mockup.y = 120

  frame.appendChild(content)
  frame.appendChild(mockup)
  return frame
}

// ─────────────────────────────────────────────
// Index slide
// ─────────────────────────────────────────────

function buildIndexSlide(
  slide: IndexSlide,
  guidelineTitle: string,
  index: number
): FrameNode {
  const frame = makeFrame('Índice')
  frame.resize(SLIDE_WIDTH, SLIDE_HEIGHT)
  frame.fills = solid(COLORS.bgDark)
  frame.x = index * (SLIDE_WIDTH + SLIDE_GAP)

  const bar = makeHeaderBar(guidelineTitle)
  frame.appendChild(bar)

  const content = makeFrame('Content')
  setAutoLayout(content, 'VERTICAL', PAD.gapLarge, PAD.slideTop, PAD.slideBot, PAD.slideH, PAD.slideH)
  content.fills = []
  content.resize(SLIDE_WIDTH, 1)
  content.primaryAxisSizingMode = 'AUTO'
  content.counterAxisSizingMode = 'FIXED'

  const title = makeText('Índice', 48, FONTS.bold, COLORS.textLight)
  content.appendChild(title)

  // Sections grid
  const grid = makeFrame('Grid')
  grid.layoutMode = 'HORIZONTAL'
  grid.primaryAxisSizingMode = 'FIXED'
  grid.counterAxisSizingMode = 'AUTO'
  grid.itemSpacing = PAD.gap * 2
  grid.fills = []
  grid.resize(SLIDE_WIDTH - PAD.slideH * 2, 1)
  grid.layoutSizingHorizontal = 'FILL' as any

  const col1 = makeFrame('Col1')
  setAutoLayout(col1, 'VERTICAL', PAD.gap, 0, 0, 0, 0)
  col1.fills = []
  col1.layoutGrow = 1

  const col2 = makeFrame('Col2')
  setAutoLayout(col2, 'VERTICAL', PAD.gap, 0, 0, 0, 0)
  col2.fills = []
  col2.layoutGrow = 1

  const half = Math.ceil(slide.sections.length / 2)

  slide.sections.forEach((sec, i) => {
    const secFrame = makeFrame(`section-${sec.number}`)
    setAutoLayout(secFrame, 'VERTICAL', PAD.gapSmall, 0, 0, 0, 0)
    secFrame.fills = []

    const secTitle = makeText(`${sec.number}  ${sec.title}`, 20, FONTS.semiBold, COLORS.textLight)
    secFrame.appendChild(secTitle)

    sec.items.forEach((item) => {
      const itemText = makeText(`    ${item}`, 14, FONTS.regular, { r: 0.55, g: 0.55, b: 0.65 })
      secFrame.appendChild(itemText)
    })

    if (i < half) col1.appendChild(secFrame)
    else col2.appendChild(secFrame)
  })

  grid.appendChild(col1)
  grid.appendChild(col2)
  content.appendChild(grid)
  frame.appendChild(content)
  return frame
}

// ─────────────────────────────────────────────
// Main entry
// ─────────────────────────────────────────────

export async function buildGuideline(data: GuidelineData, options?: BuildGuidelineOptions): Promise<void> {
  ensureBuildNotAborted(options)
  reportProgress(options, 'Preparando fontes', 0.04)
  const resolvedFonts = await resolveFontSet()
  FONTS.regular = resolvedFonts.regular
  FONTS.semiBold = resolvedFonts.semiBold
  FONTS.bold = resolvedFonts.bold
  FONTS.extraBold = resolvedFonts.extraBold

  const fontsToLoad = uniqueFonts([
    FONTS.regular,
    FONTS.semiBold,
    FONTS.bold,
    FONTS.extraBold,
  ])

  reportProgress(options, 'Carregando fontes', 0.1)

  const fontResults: Array<{ status: 'fulfilled' } | { status: 'rejected'; reason: unknown }> = await Promise.all(
    fontsToLoad.map((font) =>
      loadFontWithTimeout(font).then(
        () => ({ status: 'fulfilled' as const }),
        (reason) => ({ status: 'rejected' as const, reason })
      )
    )
  )

  const hasFontLoadFailure = fontResults.some((result) => result.status === 'rejected')
  if (hasFontLoadFailure) {
    const fallback = FONTS.regular
    try {
      await loadFontWithTimeout(fallback)
      FONTS.semiBold = fallback
      FONTS.bold = fallback
      FONTS.extraBold = fallback
      figma.notify('⚠️ Alguns pesos de fonte não estavam disponíveis. O Guidely usou uma variação única para concluir a exportação.', { timeout: 4500 })
    } catch {
      throw new Error('Não foi possível carregar nenhuma fonte para criar os slides.')
    }
  }

  if (resolvedFonts.usingInterFallback) {
    figma.notify(`⚠️ Fonte Inter indisponível. Usando ${resolvedFonts.primaryFamily}.`, { timeout: 3500 })
  }

  ensureBuildNotAborted(options)

  const page = figma.currentPage
  let slideNum = 1
  const skipped: string[] = []
  const totalSlides = data.slides.length || 1

  reportProgress(options, 'Montando slides', 0.16)

  for (let i = 0; i < data.slides.length; i++) {
    ensureBuildNotAborted(options)
    const slide = data.slides[i]
    let frame: FrameNode

    reportProgress(
      options,
      `Criando slide ${i + 1}/${totalSlides}`,
      0.16 + ((i + 1) / totalSlides) * 0.78
    )

    try {
      switch (slide.type) {
        case 'cover':
          frame = buildCoverSlide(slide, i)
          break
        case 'objective':
          frame = buildObjectiveSlide(slide, data.title, i, slideNum++)
          break
        case 'glossary':
          frame = buildGlossarySlide(slide, data.title, i, slideNum++)
          break
        case 'anatomy':
          frame = buildAnatomySlide(slide, data.title, i, slideNum++)
          break
        case 'use_case_map':
          frame = buildUseCaseMapSlide(slide, data.title, i, slideNum++)
          break
        case 'use_case':
          frame = buildUseCaseSlide(slide, data.title, i, slideNum++)
          break
        case 'behavior':
          frame = buildBehaviorSlide(slide, data.title, i, slideNum++)
          break
        case 'do_dont':
          frame = buildDoDontSlide(slide, data.title, i, slideNum++)
          break
        case 'wording':
          frame = buildWordingSlide(slide, data.title, i, slideNum++)
          break
        case 'contact':
          frame = buildContactSlide(slide, data.title, i, slideNum++)
          break
        case 'before_after':
          frame = buildBeforeAfterSlide(slide as BeforeAfterSlide, data.title, i, slideNum++)
          break
        case 'microinteraction':
          frame = buildMicrointeractionSlide(slide as MicrointeractionSlide, data.title, i, slideNum++)
          break
        case 'index':
          frame = buildIndexSlide(slide as IndexSlide, data.title, i)
          break
        default:
          skipped.push(`Slide ${i + 1}: tipo "${(slide as { type: string }).type}"`)
          continue
      }
    } catch (err) {
      if (err instanceof Error && err.message === BUILD_ABORTED_MESSAGE) {
        throw err
      }
      const reason = err instanceof Error ? err.message : String(err)
      throw new Error(`Falha no slide ${i + 1} (${slide.type}): ${reason}`)
    }

    ensureBuildNotAborted(options)
    page.appendChild(frame)
  }

  if (skipped.length) {
    figma.notify(`⚠️ ${skipped.length} slide(s) ignorado(s): tipo desconhecido`, { timeout: 5000 })
  }

  reportProgress(options, 'Ajustando viewport', 0.98)
  ensureBuildNotAborted(options)

  // Zoom to fit all slides
  figma.viewport.scrollAndZoomIntoView(page.children)
  reportProgress(options, 'Slides criados', 1)
}

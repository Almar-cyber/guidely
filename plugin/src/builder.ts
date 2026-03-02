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
} from './types'
import {
  SLIDE_WIDTH,
  SLIDE_HEIGHT,
  SLIDE_GAP,
  COLORS,
  FONTS,
  REQUIRED_FONTS,
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
  t.characters = content
  t.fontSize = size
  t.fontName = font
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
    12,
    FONTS.semiBold,
    { r: 0.6, g: 0.6, b: 0.65 }
  )
  label.letterSpacing = { value: 1.5, unit: 'PIXELS' }
  label.layoutGrow = 1
  bar.appendChild(label)

  if (slideNum !== undefined) {
    const num = makeText(String(slideNum), 14, FONTS.bold, { r: 0.6, g: 0.6, b: 0.65 })
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
  setAutoLayout(tag, 'HORIZONTAL', 0, 6, 6, 12, 12)
  tag.cornerRadius = 100
  tag.fills = solid(COLORS.tagBg)

  const label = makeText(text, 11, FONTS.semiBold, COLORS.tagText)
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

  // Content frame (centered vertically)
  const content = makeFrame('Content')
  setAutoLayout(content, 'VERTICAL', 20, 0, 0, PAD.slideH, PAD.slideH)
  content.fills = []
  content.resize(SLIDE_WIDTH, 1)
  content.primaryAxisSizingMode = 'AUTO'
  content.counterAxisSizingMode = 'FIXED'

  const label = makeText('GUIDELINE', 13, FONTS.semiBold, COLORS.mpGreen)
  label.letterSpacing = { value: 3, unit: 'PIXELS' }
  content.appendChild(label)

  const title = makeText(slide.title, 72, FONTS.extraBold, COLORS.textLight)
  title.lineHeight = { value: 1.1, unit: 'MULTIPLIER' }
  content.appendChild(title)

  const sub = makeText(slide.subtitle, 24, FONTS.regular, { r: 0.6, g: 0.6, b: 0.65 })
  sub.lineHeight = { value: 1.5, unit: 'MULTIPLIER' }
  content.appendChild(sub)

  const spacer = makeFrame('Spacer')
  spacer.resize(1, 40)
  spacer.fills = []
  content.appendChild(spacer)

  const meta = makeText(`${slide.team}  ·  ${slide.version}`, 14, FONTS.semiBold, {
    r: 0.45,
    g: 0.45,
    b: 0.5,
  })
  content.appendChild(meta)

  content.y = (SLIDE_HEIGHT - 300) / 2
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

  const label = makeText('Objetivo do guideline', 13, FONTS.semiBold, COLORS.textSecondary)
  label.letterSpacing = { value: 1, unit: 'PIXELS' }
  content.appendChild(label)

  const body = makeText(slide.body, 20, FONTS.regular, COLORS.textPrimary)
  body.lineHeight = { value: 1.7, unit: 'MULTIPLIER' }
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

  const title = makeText('Glosário', 40, FONTS.bold, COLORS.textPrimary)
  content.appendChild(title)

  const sub = makeText('Termos importantes para entender este guideline.', 16, FONTS.regular, COLORS.textSecondary)
  content.appendChild(sub)

  content.appendChild(makeDivider())

  // Two-column grid
  const grid = makeFrame('Grid')
  grid.layoutMode = 'HORIZONTAL'
  grid.primaryAxisSizingMode = 'FIXED'
  grid.counterAxisSizingMode = 'AUTO'
  grid.itemSpacing = PAD.gap
  grid.fills = []
  grid.resize(SLIDE_WIDTH - PAD.slideH * 2, 1)
  grid.layoutSizingHorizontal = 'FILL' as any

  const col1 = makeFrame('Col 1')
  setAutoLayout(col1, 'VERTICAL', 0, 0, 0, 0, 0)
  col1.fills = []
  col1.layoutGrow = 1

  const col2 = makeFrame('Col 2')
  setAutoLayout(col2, 'VERTICAL', 0, 0, 0, 0, 0)
  col2.fills = []
  col2.layoutGrow = 1

  const half = Math.ceil(slide.terms.length / 2)

  slide.terms.forEach((item, i) => {
    const row = makeFrame(`Term: ${item.term}`)
    setAutoLayout(row, 'HORIZONTAL', PAD.gapSmall, 16, 16, 0, 0)
    row.fills = []
    row.strokeWeight = 0.5
    row.strokes = solid(COLORS.border)
    row.strokeAlign = 'INSIDE'

    const termText = makeText(item.term, 13, FONTS.semiBold, COLORS.textPrimary)
    termText.resize(180, termText.height)
    termText.textAutoResize = 'HEIGHT'
    row.appendChild(termText)

    const defText = makeText(item.definition, 13, FONTS.regular, COLORS.textSecondary)
    defText.lineHeight = { value: 1.6, unit: 'MULTIPLIER' }
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
  const sectionLabel = makeText('1 · Estrutura base', 12, FONTS.semiBold, COLORS.accent)
  sectionLabel.letterSpacing = { value: 1, unit: 'PIXELS' }
  content.appendChild(sectionLabel)

  const title = makeText(slide.title, 40, FONTS.bold, COLORS.textPrimary)
  content.appendChild(title)

  if (slide.body) {
    const body = makeText(slide.body, 16, FONTS.regular, COLORS.textSecondary)
    body.lineHeight = { value: 1.6, unit: 'MULTIPLIER' }
    body.layoutSizingHorizontal = 'FILL' as any
    content.appendChild(body)
  }

  content.appendChild(makeDivider())

  // Components list
  const list = makeFrame('Components')
  setAutoLayout(list, 'VERTICAL', PAD.gapSmall, 0, 0, 0, 0)
  list.fills = []
  list.layoutSizingHorizontal = 'FILL' as any

  slide.components.forEach((comp) => {
    const row = makeFrame(`Row: ${comp.name}`)
    setAutoLayout(row, 'HORIZONTAL', PAD.gapSmall, 12, 12, 16, 16)
    row.fills = solid(COLORS.bgSection)
    row.cornerRadius = 8
    row.layoutSizingHorizontal = 'FILL' as any

    const num = makeText(String(comp.index), 14, FONTS.bold, COLORS.accent)
    num.resize(24, num.height)
    row.appendChild(num)

    const name = makeText(comp.name, 15, FONTS.semiBold, COLORS.textPrimary)
    name.layoutGrow = 1
    row.appendChild(name)

    const tag = makeTag(comp.required ? 'Obrigatório' : 'Optativo')
    row.appendChild(tag)

    list.appendChild(row)
  })

  content.appendChild(list)

  if (slide.note) {
    const note = makeText(`⚠️  ${slide.note}`, 13, FONTS.regular, COLORS.textSecondary)
    note.lineHeight = { value: 1.5, unit: 'MULTIPLIER' }
    content.appendChild(note)
  }

  // Mockup placeholder (right side)
  const mockup = makeFrame('Mockup placeholder')
  mockup.resize(240, 480)
  mockup.cornerRadius = 24
  mockup.fills = solid(COLORS.bgSection)
  mockup.strokes = solid(COLORS.border)
  mockup.strokeWeight = 1
  const mockLabel = makeText('Inserir mockup\nanotado', 13, FONTS.regular, COLORS.textSecondary)
  mockLabel.textAlignHorizontal = 'CENTER'
  mockLabel.x = (240 - mockLabel.width) / 2
  mockLabel.y = (480 - 50) / 2
  mockup.appendChild(mockLabel)
  mockup.x = SLIDE_WIDTH - PAD.slideH - 240
  mockup.y = 80
  frame.appendChild(mockup)

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
  body.lineHeight = { value: 1.7, unit: 'MULTIPLIER' }
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
  mockLabel.x = (260 - mockLabel.width) / 2
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
    desc.lineHeight = { value: 1.6, unit: 'MULTIPLIER' }
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

  ;['Estado / Condição', 'Descrição'].forEach((h) => {
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
    vText.lineHeight = { value: 1.5, unit: 'MULTIPLIER' }
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
  mockLabel.x = (260 - mockLabel.width) / 2
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

  const title = makeText(slide.title, 40, FONTS.bold, COLORS.textPrimary)
  content.appendChild(title)
  content.appendChild(makeDivider())

  const cols = makeFrame('Columns')
  cols.layoutMode = 'HORIZONTAL'
  cols.primaryAxisSizingMode = 'FIXED'
  cols.counterAxisSizingMode = 'AUTO'
  cols.itemSpacing = PAD.gap
  cols.fills = []
  cols.resize(SLIDE_WIDTH - PAD.slideH * 2, 1)
  cols.layoutSizingHorizontal = 'FILL' as any

  const buildCol = (items: string[], isdo: boolean) => {
    const col = makeFrame(isdo ? 'Do' : 'Dont')
    setAutoLayout(col, 'VERTICAL', PAD.gapSmall, PAD.cardV, PAD.cardV, PAD.cardH, PAD.cardH)
    col.fills = solid(isdo ? COLORS.doGreen : COLORS.dontRed)
    col.cornerRadius = 12
    col.layoutGrow = 1
    col.strokeWeight = 1.5
    col.strokes = solid(
      isdo ? { r: 0, g: 0.647, b: 0.314 } : COLORS.dontBorder
    )

    const header = makeText(isdo ? '✅  Faça' : '❌  Evite', 16, FONTS.bold,
      isdo ? { r: 0, g: 0.4, b: 0.17 } : { r: 0.75, g: 0.1, b: 0.07 }
    )
    col.appendChild(header)

    items.forEach((item) => {
      const row = makeFrame(`Item`)
      setAutoLayout(row, 'HORIZONTAL', 8, 0, 0, 0, 0)
      row.fills = []
      row.layoutSizingHorizontal = 'FILL' as any

      const dot = makeText('•', 14, FONTS.bold, COLORS.textSecondary)
      row.appendChild(dot)

      const text = makeText(item, 15, FONTS.regular, COLORS.textPrimary)
      text.lineHeight = { value: 1.6, unit: 'MULTIPLIER' }
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
    obj.lineHeight = { value: 1.5, unit: 'MULTIPLIER' }
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
      rat.lineHeight = { value: 1.5, unit: 'MULTIPLIER' }
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
  setAutoLayout(content, 'VERTICAL', PAD.gap, 0, 0, PAD.slideH, PAD.slideH)
  content.fills = []
  content.resize(SLIDE_WIDTH, 1)
  content.primaryAxisSizingMode = 'AUTO'
  content.counterAxisSizingMode = 'FIXED'
  content.y = (SLIDE_HEIGHT - 350) / 2

  const accentLine = makeFrame('Accent')
  accentLine.resize(60, 4)
  accentLine.fills = solid(COLORS.accent)
  content.appendChild(accentLine)

  const title = makeText('Comentários, dúvidas\nou feedback?', 48, FONTS.extraBold, COLORS.textLight)
  title.lineHeight = { value: 1.2, unit: 'MULTIPLIER' }
  content.appendChild(title)

  const sub = makeText(`Envie uma mensagem no nosso canal do Slack.`, 18, FONTS.regular, {
    r: 0.6, g: 0.6, b: 0.65,
  })
  content.appendChild(sub)

  const channel = makeText(slide.channel, 20, FONTS.semiBold, COLORS.accent)
  content.appendChild(channel)

  if (slide.links.length > 0) {
    const spacer = makeFrame('s')
    spacer.resize(1, 16)
    spacer.fills = []
    content.appendChild(spacer)

    const linksTitle = makeText('Links úteis', 13, FONTS.semiBold, { r: 0.5, g: 0.5, b: 0.55 })
    linksTitle.letterSpacing = { value: 1, unit: 'PIXELS' }
    content.appendChild(linksTitle)

    slide.links.forEach((link) => {
      const linkText = makeText(`🔗  ${link.label}`, 15, FONTS.semiBold, { r: 0.6, g: 0.7, b: 0.95 })
      content.appendChild(linkText)
    })
  }

  frame.appendChild(content)
  return frame
}

// ─────────────────────────────────────────────
// Main entry
// ─────────────────────────────────────────────

export async function buildGuideline(data: GuidelineData): Promise<void> {
  await Promise.all(REQUIRED_FONTS.map((f) => figma.loadFontAsync(f)))

  const page = figma.currentPage
  let slideNum = 1

  data.slides.forEach((slide, i) => {
    let frame: FrameNode

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
    }

    page.appendChild(frame)
  })

  // Zoom to fit all slides
  figma.viewport.scrollAndZoomIntoView(page.children)
}

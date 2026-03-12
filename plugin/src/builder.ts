import type {
  GuidelineData,
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
  OverviewSlide,
  StructureSlide,
  FlowSlide,
  HandoffSlide,
  SectionSlide,
  ComponentFocusSlide,
  StructureDualSlide,
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
  try {
    t.fontName = font
  } catch {
    // Font not loaded — fall back to whatever is currently loaded
    try { t.fontName = FONTS.regular } catch { /* keep default font */ }
  }
  t.fontSize = size
  t.characters = content ?? ''
  t.fills = solid(color)
  // WIDTH_AND_HEIGHT: text grows freely — prevents unexpected word-wrap when no explicit width is set.
  // appendFill() overrides horizontal sizing to FILL, causing wrapping at container width when needed.
  t.textAutoResize = 'WIDTH_AND_HEIGHT'
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
  mockupImages?: Record<string, number[]>
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

/**
 * Floating header: top-left label + top-right slide number.
 * Matches the Andes X slide template (CALCU playground node 945-161927).
 * No dark bar — just text floating on the slide background.
 */
function makeFloatingHeader(guidelineTitle: string, slideNum?: number, textColor: RGB = COLORS.textPrimary): FrameNode {
  const wrapper = makeFrame('FloatingHeader')
  // paddingTop=62 places label at y=62 within the slide (matches Andes X design)
  wrapper.resize(SLIDE_WIDTH, 100)
  wrapper.fills = []
  wrapper.layoutMode = 'HORIZONTAL'
  wrapper.primaryAxisSizingMode = 'FIXED'
  wrapper.counterAxisSizingMode = 'FIXED'
  wrapper.counterAxisAlignItems = 'CENTER'
  wrapper.paddingLeft = 97
  wrapper.paddingRight = 97
  wrapper.paddingTop = 62
  wrapper.paddingBottom = 0

  const label = makeText(
    `GUIDELINE - ${guidelineTitle.toUpperCase()}`,
    16,
    FONTS.bold,
    textColor
  )
  label.letterSpacing = { value: 2, unit: 'PIXELS' }
  label.layoutGrow = 1
  wrapper.appendChild(label)

  if (slideNum !== undefined) {
    const num = makeText(String(slideNum), 20, FONTS.bold, textColor)
    wrapper.appendChild(num)
  }

  return wrapper
}

/** @deprecated Use makeFloatingHeader instead */
function makeHeaderBar(guidelineTitle: string, slideNum?: number): FrameNode {
  return makeFloatingHeader(guidelineTitle, slideNum)
}

function makeDivider(): FrameNode {
  const d = makeFrame('Divider')
  d.resize(SLIDE_WIDTH - PAD.slideH * 2, 1)
  d.fills = solid(COLORS.borderLight)
  return d
}

/** appendChild + set layoutSizingHorizontal='FILL' (must be done after parenting)
 * IMPORTANT: Only sets FILL when the parent has auto-layout (layoutMode !== 'NONE').
 * Setting layoutSizingHorizontal='FILL' on a child of a non-auto-layout frame
 * collapses the child to 0px width, making all content invisible. */
function appendFill<T extends SceneNode>(parent: FrameNode, child: T): T {
  if (!parent || !child) {
    console.warn('[appendFill] skipping — parent or child is null/undefined')
    return child
  }
  parent.appendChild(child)
  // Only set FILL when parent has auto-layout — non-auto-layout parents collapse child to 0px
  if ((parent as FrameNode).layoutMode !== 'NONE') {
    try {
      if ('layoutSizingHorizontal' in child) {
        ;(child as any).layoutSizingHorizontal = 'FILL'
      }
    } catch (err) {
      console.warn(`[appendFill] could not set FILL on ${child.name}: ${err}`)
    }
  }
  return child
}

function makeTag(text: string): FrameNode {
  const tag = makeFrame('Tag')
  setAutoLayout(tag, 'HORIZONTAL', 0, 4, 4, 10, 10)
  tag.cornerRadius = 100
  tag.fills = solid(COLORS.tagBg)

  const label = makeText(text, 13, FONTS.semiBold, COLORS.tagText)
  tag.appendChild(label)
  return tag
}

/** Adds an imageNote as a prominent 📸 banner at the bottom of a content frame */
function appendImageNote(content: FrameNode, imageNote: string | undefined): void {
  if (!imageNote) return
  const note = makeFrame('ImageNote')
  setAutoLayout(note, 'HORIZONTAL', 14, 18, 18, 24, 24)
  note.fills = solid(COLORS.bgSection)
  note.cornerRadius = 10
  note.strokeWeight = 1
  note.strokes = solid(COLORS.border)
  note.strokeAlign = 'INSIDE'
  note.primaryAxisSizingMode = 'AUTO'
  note.counterAxisSizingMode = 'FIXED'
  note.resize(SLIDE_WIDTH - PAD.slideH * 2, 1)
  note.primaryAxisSizingMode = 'AUTO'  // re-apply after resize()

  const emojiBox = makeFrame('EmojiBox')
  setAutoLayout(emojiBox, 'HORIZONTAL', 0, 6, 6, 6, 6)
  emojiBox.fills = solid(COLORS.border)
  emojiBox.cornerRadius = 6
  emojiBox.primaryAxisSizingMode = 'AUTO'
  emojiBox.counterAxisSizingMode = 'AUTO'
  emojiBox.appendChild(makeText('📸', 18, FONTS.regular, COLORS.textPrimary))
  note.appendChild(emojiBox)

  const col = makeFrame('NoteCol')
  setAutoLayout(col, 'VERTICAL', 2, 0, 0, 0, 0)
  col.fills = []
  col.layoutGrow = 1
  col.primaryAxisSizingMode = 'AUTO'
  col.counterAxisSizingMode = 'AUTO'
  const label = makeText('INSERIR IMAGEM', 11, FONTS.bold, COLORS.accent)
  label.letterSpacing = { value: 1, unit: 'PIXELS' }
  col.appendChild(label)
  const txt = makeText(imageNote, 14, FONTS.regular, COLORS.textSecondary)
  txt.lineHeight = { value: 150, unit: 'PERCENT' }
  txt.textAutoResize = 'HEIGHT'
  appendFill(col, txt)
  note.appendChild(col)

  appendFill(content, note)
}

// ─────────────────────────────────────────────
// Pagination helper
// ─────────────────────────────────────────────

/** Estimated usable content height per slide (total height minus header bar, paddings, title area) */
const CONTENT_AREA_HEIGHT = SLIDE_HEIGHT - 56 - PAD.slideTop - PAD.slideBot - 120 // ~824px on 1080 slide

/** Rough per-item height estimates for pagination */
const ITEM_HEIGHTS: Record<string, number> = {
  glossary_term: 100,
  anatomy_component: 80,
  wording_error: 200,
  behavior_row: 60,
}

/** Split an array of items into pages that fit within the slide height */
function paginate<T>(items: T[], itemType: string, headerHeight = 160): T[][] {
  const maxH = CONTENT_AREA_HEIGHT - headerHeight
  const perItem = ITEM_HEIGHTS[itemType] ?? 100
  const perPage = Math.max(1, Math.floor(maxH / perItem))
  const pages: T[][] = []
  for (let i = 0; i < items.length; i += perPage) {
    pages.push(items.slice(i, i + perPage))
  }
  return pages
}

// ─────────────────────────────────────────────
// Slide builders
// ─────────────────────────────────────────────

function buildCoverSlide(slide: CoverSlide, index: number): FrameNode {
  // ── Andes X: yellow bg, left-aligned content, using proven setAutoLayout pattern ──
  const frame = makeFrame('Cover')
  frame.resize(SLIDE_WIDTH, SLIDE_HEIGHT)
  frame.fills = solid(COLORS.bgCover)
  frame.x = index * (SLIDE_WIDTH + SLIDE_GAP)

  // ── Content frame: paddingTop=400 pushes badge/title down (proven pattern) ──
  const content = makeFrame('CoverContent')
  setAutoLayout(content, 'VERTICAL', 24, 400, 80, 263, 263)
  content.fills = []
  content.counterAxisSizingMode = 'FIXED'
  content.primaryAxisSizingMode = 'AUTO'
  content.resize(SLIDE_WIDTH, 1)
  content.primaryAxisSizingMode = 'AUTO'  // re-apply after resize()
  content.counterAxisAlignItems = 'MIN'

  // Top label — positioned directly on the frame at y=74 (matches floating header position)
  const topLabel = makeText(
    `GUIDELINE - ${(slide.team ?? 'UX').toUpperCase()}`, 16, FONTS.bold, COLORS.textOnCover
  )
  topLabel.letterSpacing = { value: 2, unit: 'PIXELS' }
  frame.appendChild(topLabel)
  topLabel.x = 97
  topLabel.y = 74

  // White badge "GUIDELINE"
  const badge = makeFrame('Badge')
  setAutoLayout(badge, 'HORIZONTAL', 0, 10, 10, 16, 16)
  badge.cornerRadius = 4
  badge.fills = solid(COLORS.bgBadge)
  const badgeText = makeText('GUIDELINE', 20, FONTS.semiBold, COLORS.textOnCover)
  badgeText.letterSpacing = { value: 1, unit: 'PIXELS' }
  badge.appendChild(badgeText)
  content.appendChild(badge)

  // Main title
  const title = makeText(slide.title, 80, FONTS.extraBold, COLORS.textOnCover)
  title.lineHeight = { value: 105, unit: 'PERCENT' }
  title.letterSpacing = { value: -2, unit: 'PIXELS' }
  appendFill(content, title)

  // Version / meta
  const versionStr = [slide.version, slide.subtitle, slide.team].filter(Boolean).join('  ·  ')
  const meta = makeText(versionStr || 'v1.0', 18, FONTS.semiBold, COLORS.textSecondary)
  content.appendChild(meta)

  appendFill(frame, content)
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

  // ── Andes X: proven setAutoLayout pattern, 2-col horizontal ──
  const header = makeFloatingHeader(guidelineTitle, slideNum)
  frame.appendChild(header)

  // Two-column row using HORIZONTAL auto-layout
  const cols = makeFrame('Cols')
  setAutoLayout(cols, 'HORIZONTAL', 80, 380, 0, 102, 100)
  cols.counterAxisSizingMode = 'FIXED'
  cols.primaryAxisSizingMode = 'FIXED'
  cols.resize(SLIDE_WIDTH, SLIDE_HEIGHT - 380)
  cols.counterAxisAlignItems = 'MIN'

  // Left column
  const leftCol = makeFrame('LeftCol')
  setAutoLayout(leftCol, 'VERTICAL', 24, 0, 0, 0, 0)
  leftCol.counterAxisSizingMode = 'FIXED'
  leftCol.primaryAxisSizingMode = 'AUTO'
  leftCol.resize(650, 1)
  leftCol.primaryAxisSizingMode = 'AUTO'  // re-apply after resize()

  const sectionTag = makeText('OBJETIVO', 16, FONTS.bold, COLORS.textSecondary)
  sectionTag.letterSpacing = { value: 2, unit: 'PIXELS' }
  leftCol.appendChild(sectionTag)

  const title = makeText('Objetivo\ndo guideline', 56, FONTS.extraBold, COLORS.textPrimary)
  title.lineHeight = { value: 110, unit: 'PERCENT' }
  title.letterSpacing = { value: -1, unit: 'PIXELS' }
  appendFill(leftCol, title)

  cols.appendChild(leftCol)

  // Right column
  const rightCol = makeFrame('RightCol')
  setAutoLayout(rightCol, 'VERTICAL', 28, 0, 0, 0, 0)
  rightCol.layoutGrow = 1
  rightCol.counterAxisSizingMode = 'AUTO'
  rightCol.primaryAxisSizingMode = 'AUTO'

  const body = makeText(slide.body, 22, FONTS.regular, COLORS.textPrimary)
  body.lineHeight = { value: 160, unit: 'PERCENT' }
  appendFill(rightCol, body)

  const yellowDiv = makeFrame('YellowDivider')
  yellowDiv.resize(48, 4)
  yellowDiv.fills = solid(COLORS.bgCover)
  rightCol.appendChild(yellowDiv)

  cols.appendChild(rightCol)
  appendFill(frame, cols)
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

  // ── Andes X: floating label, title top-left, 2 tables side-by-side ──
  const header = makeFloatingHeader(guidelineTitle, slideNum)
  frame.appendChild(header)

  const h1 = makeText('Glossário', 64, FONTS.extraBold, COLORS.textPrimary)
  h1.letterSpacing = { value: -1, unit: 'PIXELS' }
  frame.appendChild(h1)
  h1.x = 102
  h1.y = 130

  const subTxt = makeText('Termos importantes para entender este guideline.', 20, FONTS.regular, COLORS.textSecondary)
  frame.appendChild(subTxt)
  subTxt.x = 102
  subTxt.y = 218

  // Helper: build a glossary table with dark header + alternating rows
  function buildGlossTable(
    terms: { term: string; definition: string }[],
    termColW: number,
    tableW: number,
    categoryLabel: string
  ): FrameNode {
    const col = makeFrame(categoryLabel)
    col.layoutMode = 'VERTICAL'
    col.itemSpacing = 12
    col.fills = []
    col.primaryAxisSizingMode = 'AUTO'
    col.counterAxisSizingMode = 'FIXED'
    col.resize(tableW, 1)
    col.primaryAxisSizingMode = 'AUTO'  // re-apply after resize()

    const catLabel = makeText(categoryLabel, 20, FONTS.bold, COLORS.textPrimary)
    col.appendChild(catLabel)

    const table = makeFrame('Table')
    table.layoutMode = 'VERTICAL'
    table.itemSpacing = 0
    table.fills = []
    table.strokeWeight = 1
    table.strokes = solid(COLORS.border)
    table.strokeAlign = 'OUTSIDE'
    table.primaryAxisSizingMode = 'AUTO'
    table.counterAxisSizingMode = 'FIXED'
    table.resize(tableW, 1)
    table.primaryAxisSizingMode = 'AUTO'  // re-apply after resize()

    // Header row
    const hdrRow = makeFrame('hdr')
    hdrRow.layoutMode = 'HORIZONTAL'
    hdrRow.itemSpacing = 0
    hdrRow.fills = solid(COLORS.bgTableHeader)
    hdrRow.primaryAxisSizingMode = 'FIXED'
    hdrRow.counterAxisSizingMode = 'FIXED'
    hdrRow.resize(tableW, 44)
    const hT = makeFrame('c1'); hT.layoutMode = 'HORIZONTAL'; hT.counterAxisAlignItems = 'CENTER'; hT.fills = []; hT.resize(termColW, 44); hT.paddingLeft = 16; hT.paddingRight = 16; hT.appendChild(makeText('Termo', 13, FONTS.bold, COLORS.textLight)); hdrRow.appendChild(hT)
    const hD = makeFrame('c2'); hD.layoutMode = 'HORIZONTAL'; hD.counterAxisAlignItems = 'CENTER'; hD.fills = []; hD.primaryAxisSizingMode = 'AUTO'; hD.counterAxisSizingMode = 'FIXED'; hD.resize(tableW - termColW, 44); hD.paddingLeft = 16; hD.paddingRight = 16; hD.appendChild(makeText('Significado', 13, FONTS.bold, COLORS.textLight)); hdrRow.appendChild(hD)
    table.appendChild(hdrRow)

    terms.forEach((item, i) => {
      const row = makeFrame(`r${i}`)
      row.layoutMode = 'HORIZONTAL'
      row.itemSpacing = 0
      row.fills = solid(i % 2 === 0 ? COLORS.bg : COLORS.bgTableRow)
      row.strokeWeight = 1
      row.strokes = solid(COLORS.border)
      row.strokeAlign = 'INSIDE'
      row.primaryAxisSizingMode = 'FIXED'
      row.counterAxisSizingMode = 'AUTO'
      row.resize(tableW, 1)
      row.counterAxisSizingMode = 'AUTO'  // re-apply after resize()

      const tCell = makeFrame('term')
      tCell.layoutMode = 'VERTICAL'
      tCell.primaryAxisAlignItems = 'CENTER'
      tCell.paddingTop = 12; tCell.paddingBottom = 12; tCell.paddingLeft = 16; tCell.paddingRight = 16
      tCell.fills = []
      tCell.primaryAxisSizingMode = 'AUTO'
      tCell.counterAxisSizingMode = 'FIXED'
      tCell.resize(termColW, 1)
      tCell.primaryAxisSizingMode = 'AUTO'  // re-apply after resize()
      tCell.appendChild(makeText(item.term, 15, FONTS.semiBold, COLORS.textPrimary))
      row.appendChild(tCell)

      const dCell = makeFrame('def')
      dCell.layoutMode = 'VERTICAL'
      dCell.primaryAxisAlignItems = 'CENTER'
      dCell.paddingTop = 12; dCell.paddingBottom = 12; dCell.paddingLeft = 16; dCell.paddingRight = 16
      dCell.fills = []
      dCell.primaryAxisSizingMode = 'AUTO'
      dCell.counterAxisSizingMode = 'AUTO'
      dCell.resize(tableW - termColW, 1)
      dCell.primaryAxisSizingMode = 'AUTO'  // re-apply after resize()
      const defTxt = makeText(item.definition, 15, FONTS.regular, COLORS.textSecondary)
      defTxt.resize(tableW - termColW - 32, defTxt.height)
      defTxt.textAutoResize = 'HEIGHT'
      dCell.appendChild(defTxt)
      row.appendChild(dCell)

      table.appendChild(row)
    })

    col.appendChild(table)
    return col
  }

  const half = Math.ceil(slide.terms.length / 2)
  const leftTerms = slide.terms.slice(0, half)
  const rightTerms = slide.terms.slice(half)

  // Two-table horizontal container using proven setAutoLayout
  const tablesRow = makeFrame('TablesRow')
  setAutoLayout(tablesRow, 'HORIZONTAL', 60, 115, 0, 102, 100)
  tablesRow.counterAxisSizingMode = 'FIXED'
  tablesRow.primaryAxisSizingMode = 'FIXED'
  tablesRow.resize(SLIDE_WIDTH, SLIDE_HEIGHT - 115)
  tablesRow.counterAxisAlignItems = 'MIN'

  const leftTable = buildGlossTable(leftTerms, 180, 660, 'Siglas e abreviações')
  tablesRow.appendChild(leftTable)

  const rightTable = buildGlossTable(rightTerms, 220, 1000, 'Outros termos')
  tablesRow.appendChild(rightTable)

  appendFill(frame, tablesRow)
  return frame
}

function buildAnatomySlide(
  slide: AnatomySlide,
  guidelineTitle: string,
  index: number,
  slideNum: number
): FrameNode {
  // ── Andes X: white bg, 2-col — left: title+desc+specs / right: mockup area ──
  // Matches Pencil "afiaa" (Component Description Slide)
  const frame = makeFrame('Anatomia')
  frame.resize(SLIDE_WIDTH, SLIDE_HEIGHT)
  frame.fills = solid(COLORS.bg)
  frame.x = index * (SLIDE_WIDTH + SLIDE_GAP)

  const header = makeHeaderBar(guidelineTitle, slideNum)
  frame.appendChild(header)

  // Horizontal container: paddingTop=100 places content below header
  const mainRow = makeFrame('MainRow')
  setAutoLayout(mainRow, 'HORIZONTAL', 40, 100, 0, 97, 97)
  mainRow.counterAxisSizingMode = 'FIXED'
  mainRow.primaryAxisSizingMode = 'FIXED'
  mainRow.resize(SLIDE_WIDTH, SLIDE_HEIGHT - 100)
  mainRow.counterAxisAlignItems = 'MIN'

  // Left column
  const leftCol = makeFrame('LeftCol')
  setAutoLayout(leftCol, 'VERTICAL', 28, 0, 0, 0, 0)
  leftCol.counterAxisSizingMode = 'FIXED'
  leftCol.primaryAxisSizingMode = 'AUTO'
  leftCol.resize(700, 1)
  leftCol.primaryAxisSizingMode = 'AUTO'  // re-apply after resize()

  const sectionTag = makeText(`${slide.components[0]?.index ?? 1} · COMPONENTES`, 20, FONTS.bold, COLORS.textSecondary)
  sectionTag.letterSpacing = { value: 2, unit: 'PIXELS' }
  leftCol.appendChild(sectionTag)

  const h1 = makeText(slide.title, 64, FONTS.bold, COLORS.textPrimary)
  h1.letterSpacing = { value: -1, unit: 'PIXELS' }
  h1.resize(700, h1.height)
  h1.textAutoResize = 'HEIGHT'
  leftCol.appendChild(h1)

  if (slide.body) {
    const desc = makeText(slide.body, 22, FONTS.regular, COLORS.textSecondary)
    desc.lineHeight = { value: 160, unit: 'PERCENT' }
    desc.resize(700, desc.height)
    desc.textAutoResize = 'HEIGHT'
    leftCol.appendChild(desc)
  }

  const divider = makeFrame('Divider')
  divider.resize(700, 1)
  divider.fills = solid(COLORS.border)
  leftCol.appendChild(divider)

  // Specs / component list
  const specs = makeFrame('Specs')
  specs.layoutMode = 'VERTICAL'
  specs.itemSpacing = 12
  specs.fills = []
  specs.primaryAxisSizingMode = 'AUTO'
  specs.counterAxisSizingMode = 'FIXED'
  specs.resize(700, 1)
  specs.primaryAxisSizingMode = 'AUTO'  // re-apply after resize()

  slide.components.forEach((comp) => {
    const specRow = makeFrame(`spec-${comp.index}`)
    specRow.layoutMode = 'HORIZONTAL'
    specRow.itemSpacing = 12
    specRow.counterAxisAlignItems = 'CENTER'
    specRow.fills = []
    specRow.primaryAxisSizingMode = 'AUTO'
    specRow.counterAxisSizingMode = 'AUTO'

    const badge = makeFrame('badge')
    badge.layoutMode = 'HORIZONTAL'
    badge.paddingTop = 3; badge.paddingBottom = 3; badge.paddingLeft = 10; badge.paddingRight = 10
    badge.cornerRadius = 100
    badge.fills = solid(comp.required ? COLORS.accent : COLORS.bgDetail)
    badge.primaryAxisSizingMode = 'AUTO'; badge.counterAxisSizingMode = 'AUTO'
    badge.appendChild(makeText(String(comp.index), 13, FONTS.bold, comp.required ? COLORS.textLight : COLORS.textSecondary))
    specRow.appendChild(badge)

    const specName = makeText(comp.name, 20, comp.required ? FONTS.semiBold : FONTS.regular, COLORS.textPrimary)
    specRow.appendChild(specName)

    const reqTag = makeText(comp.required ? 'Obrigatório' : 'Opcional', 14, FONTS.regular, COLORS.textSecondary)
    specRow.appendChild(reqTag)

    specs.appendChild(specRow)
  })

  leftCol.appendChild(specs)

  if (slide.note) {
    const note = makeText(`⚠️  ${slide.note}`, 14, FONTS.regular, COLORS.textSecondary)
    note.lineHeight = { value: 150, unit: 'PERCENT' }
    note.resize(700, note.height); note.textAutoResize = 'HEIGHT'
    leftCol.appendChild(note)
  }

  mainRow.appendChild(leftCol)

  // Right: mockup placeholder
  const mockupArea = makeFrame('MockupArea')
  mockupArea.layoutGrow = 1
  mockupArea.cornerRadius = 16
  mockupArea.fills = solid(COLORS.bgSection)
  mockupArea.primaryAxisSizingMode = 'FIXED'
  mockupArea.counterAxisSizingMode = 'FIXED'
  mockupArea.resize(900, SLIDE_HEIGHT - 120)
  mainRow.appendChild(mockupArea)

  appendFill(frame, mainRow)
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
  content.primaryAxisSizingMode = 'AUTO'
  content.counterAxisSizingMode = 'FIXED'
  content.resize(SLIDE_WIDTH, 100)
  content.primaryAxisSizingMode = 'AUTO'  // re-apply after resize()

  const sectionLabel = makeText('2 · Casos de uso', 12, FONTS.semiBold, COLORS.accent)
  sectionLabel.letterSpacing = { value: 1, unit: 'PIXELS' }
  content.appendChild(sectionLabel)

  const title = makeText(slide.title, 40, FONTS.bold, COLORS.textPrimary)
  content.appendChild(title)

  appendFill(content, makeDivider())

  const tableWidth = SLIDE_WIDTH - PAD.slideH * 2
  const numCases = Math.max(1, slide.caseNames.length)
  const COMP_COL = Math.max(200, Math.floor(tableWidth * 0.25))
  const colWidth = Math.floor((tableWidth - COMP_COL) / numCases)

  // Table container
  const table = makeFrame('Table')
  setAutoLayout(table, 'VERTICAL', 0, 0, 0, 0, 0)
  table.fills = []
  table.cornerRadius = 8
  table.clipsContent = true
  table.strokes = solid(COLORS.border)
  table.strokeWeight = 1

  // Header row
  const headerRow = makeFrame('Header row')
  headerRow.layoutMode = 'HORIZONTAL'
  headerRow.primaryAxisSizingMode = 'FIXED'
  headerRow.counterAxisSizingMode = 'AUTO'
  headerRow.resize(tableWidth, 1)
  headerRow.counterAxisSizingMode = 'AUTO'  // re-apply after resize()
  headerRow.fills = solid(COLORS.bgDark)
  headerRow.paddingTop = 16
  headerRow.paddingBottom = 16
  headerRow.paddingLeft = 20
  headerRow.paddingRight = 20
  headerRow.itemSpacing = 8

  const emptyCell = makeFrame('empty')
  emptyCell.layoutMode = 'VERTICAL'
  emptyCell.primaryAxisSizingMode = 'AUTO'
  emptyCell.counterAxisSizingMode = 'FIXED'
  emptyCell.resize(COMP_COL, 1)
  emptyCell.primaryAxisSizingMode = 'AUTO'  // re-apply after resize()
  emptyCell.counterAxisSizingMode = 'FIXED'
  emptyCell.fills = []
  headerRow.appendChild(emptyCell)

  slide.caseNames.forEach((name) => {
    const cell = makeFrame(`Header: ${name}`)
    cell.layoutMode = 'VERTICAL'
    cell.counterAxisAlignItems = 'CENTER'   // center text horizontally
    cell.primaryAxisSizingMode = 'AUTO'     // VERTICAL primary = height — AUTO (grows)
    cell.counterAxisSizingMode = 'FIXED'    // VERTICAL counter = width — FIXED
    cell.resize(colWidth, 1)
    cell.primaryAxisSizingMode = 'AUTO'     // re-apply after resize()
    cell.counterAxisSizingMode = 'FIXED'
    cell.fills = []
    const t = makeText(name, 16, FONTS.semiBold, COLORS.textLight)
    t.textAutoResize = 'HEIGHT'
    t.textAlignHorizontal = 'CENTER'
    appendFill(cell, t)                     // FILL cell width after parenting
    headerRow.appendChild(cell)
  })
  table.appendChild(headerRow)
  headerRow.layoutSizingHorizontal = 'FILL'

  // Data rows
  slide.rows.forEach((row, i) => {
    const dataRow = makeFrame(`Row: ${row.component}`)
    dataRow.layoutMode = 'HORIZONTAL'
    dataRow.primaryAxisSizingMode = 'FIXED'
    dataRow.counterAxisSizingMode = 'AUTO'
    dataRow.resize(tableWidth, 1)
    dataRow.counterAxisSizingMode = 'AUTO'  // re-apply after resize()
    dataRow.fills = solid(i % 2 === 0 ? COLORS.bg : COLORS.bgSection)
    dataRow.paddingTop = 14
    dataRow.paddingBottom = 14
    dataRow.paddingLeft = 20
    dataRow.paddingRight = 20
    dataRow.itemSpacing = 8

    const compCell = makeFrame('comp')
    compCell.layoutMode = 'VERTICAL'
    compCell.primaryAxisSizingMode = 'AUTO'    // height grows with text
    compCell.counterAxisSizingMode = 'FIXED'   // width fixed
    compCell.resize(COMP_COL, 1)
    compCell.primaryAxisSizingMode = 'AUTO'    // re-apply after resize()
    compCell.counterAxisSizingMode = 'FIXED'
    compCell.fills = []
    const compText = makeText(row.component, 18, FONTS.semiBold, COLORS.textPrimary)
    compText.textAutoResize = 'HEIGHT'
    appendFill(compCell, compText)             // FILL cell width after parenting
    dataRow.appendChild(compCell)

    slide.caseNames.forEach((caseName) => {
      const cell = makeFrame('cell')
      cell.layoutMode = 'VERTICAL'
      cell.counterAxisAlignItems = 'CENTER'    // center checkmark horizontally
      cell.primaryAxisSizingMode = 'AUTO'      // height grows with text
      cell.counterAxisSizingMode = 'FIXED'     // width fixed
      cell.resize(colWidth, 1)
      cell.primaryAxisSizingMode = 'AUTO'      // re-apply after resize()
      cell.counterAxisSizingMode = 'FIXED'
      cell.fills = []
      const check = makeText(row.cases[caseName] ? '✅' : '—', 18, FONTS.regular,
        row.cases[caseName] ? COLORS.accent : COLORS.textSecondary)
      check.textAlignHorizontal = 'CENTER'
      check.textAutoResize = 'HEIGHT'
      cell.appendChild(check)
      dataRow.appendChild(cell)
    })

    table.appendChild(dataRow)
    dataRow.layoutSizingHorizontal = 'FILL'
  })

  appendFill(content, table)

  frame.appendChild(content)
  return frame
}

function buildUseCaseSlide(
  slide: UseCaseSlide,
  guidelineTitle: string,
  index: number,
  slideNum: number
): FrameNode {
  // ── Matches Pencil "9. Estrutura 1 Tela" (5AonJ):
  // top label + title + 1 mockup with component blocks + annotation cards on right ──
  const frame = makeFrame(`CDU: ${slide.title}`)
  frame.resize(SLIDE_WIDTH, SLIDE_HEIGHT)
  frame.fills = solid(COLORS.bg)
  frame.x = index * (SLIDE_WIDTH + SLIDE_GAP)

  const bar = makeHeaderBar(guidelineTitle, slideNum)
  frame.appendChild(bar)

  // Single VERTICAL content container (0,0 → padded to clear header)
  const content = makeFrame('Content')
  setAutoLayout(content, 'VERTICAL', 40, PAD.slideTop, PAD.slideBot, PAD.slideH, PAD.slideH)
  content.fills = []
  content.primaryAxisSizingMode = 'FIXED'  // VERTICAL primary = height — FIXED (full slide)
  content.counterAxisSizingMode = 'FIXED'  // VERTICAL counter = width — FIXED (full slide)
  content.resize(SLIDE_WIDTH, SLIDE_HEIGHT)

  // Title row with countries
  const titleRow = makeFrame('TitleRow')
  setAutoLayout(titleRow, 'HORIZONTAL', PAD.gapSmall, 0, 0, 0, 0)
  titleRow.fills = []
  titleRow.counterAxisSizingMode = 'AUTO'  // HORIZONTAL counter = height — AUTO (grows)
  titleRow.counterAxisAlignItems = 'CENTER'

  const titleText = makeText(slide.title, 40, FONTS.bold, COLORS.textPrimary)
  titleRow.appendChild(titleText)

  slide.countries?.forEach((c) => {
    const tag = makeTag(c)
    tag.fills = solid(COLORS.bgSection)
    const tagTxt = tag.children[0] as TextNode
    tagTxt.fills = solid(COLORS.textSecondary)
    titleRow.appendChild(tag)
  })
  appendFill(content, titleRow)  // FILL width inside content

  // Main row: mockup (left) + annotation cards (right)
  const mainRow = makeFrame('Main')
  setAutoLayout(mainRow, 'HORIZONTAL', 40, 0, 0, 0, 0)
  mainRow.fills = []
  mainRow.counterAxisAlignItems = 'MIN'
  appendFill(content, mainRow)           // FILL width inside content
  mainRow.layoutSizingVertical = 'FILL'  // fills remaining height after titleRow

  // Mockup with component blocks
  const mockup = makeFrame('Mockup')
  mockup.layoutMode = 'VERTICAL'
  mockup.itemSpacing = 0
  mockup.fills = solid(COLORS.bg)
  mockup.strokeWeight = 2
  mockup.strokes = solid(COLORS.border)
  mockup.strokeAlign = 'INSIDE'
  mockup.cornerRadius = 16
  mockup.primaryAxisSizingMode = 'FIXED'
  mockup.counterAxisSizingMode = 'FIXED'
  mockup.resize(480, 780)

  // Generate component blocks as colored regions inside the mockup
  const blockColors = [
    COLORS.bgSection, COLORS.bgDetail, COLORS.bgComponent,
    COLORS.bgDetail, COLORS.bgComponent, COLORS.bgDetail, COLORS.bgComponent,
  ]
  const compCount = Math.max(slide.components.length, 3)
  const baseH = Math.floor(780 / compCount)
  slide.components.forEach((_, i) => {
    const block = makeFrame(`block-${i}`)
    block.fills = solid(blockColors[i % blockColors.length])
    block.primaryAxisSizingMode = 'FIXED'
    block.counterAxisSizingMode = 'FIXED'
    block.resize(480, i === slide.components.length - 1 ? 780 - baseH * (compCount - 1) : baseH)
    mockup.appendChild(block)
  })
  mainRow.appendChild(mockup)

  // Annotation cards column
  const annCol = makeFrame('Annotations')
  setAutoLayout(annCol, 'VERTICAL', 0, 0, 0, 0, 0)
  annCol.fills = []
  annCol.layoutGrow = 1
  annCol.primaryAxisSizingMode = 'FIXED'
  annCol.counterAxisSizingMode = 'AUTO'
  annCol.resize(1, 700)
  annCol.primaryAxisSizingMode = 'FIXED'
  annCol.counterAxisSizingMode = 'AUTO'  // re-apply after resize()

  const perCard = Math.floor(780 / Math.max(slide.components.length, 1))
  slide.components.forEach((comp, i) => {
    const annRow = makeFrame(`ann-${i}`)
    setAutoLayout(annRow, 'HORIZONTAL', 8, 0, 0, 0, 0)
    annRow.fills = []
    annRow.primaryAxisSizingMode = 'FIXED'
    annRow.counterAxisSizingMode = 'FIXED'
    annRow.resize(1, perCard)

    annRow.counterAxisAlignItems = 'CENTER'
    annRow.clipsContent = false

    const line = makeFrame('line')
    line.resize(32, 1)
    line.fills = solid(COLORS.annLine)
    annRow.appendChild(line)

    const card = makeFrame('card')
    setAutoLayout(card, 'VERTICAL', 4, 8, 8, 12, 12)
    card.fills = solid(COLORS.bg)
    card.strokeWeight = 1; card.strokes = solid(COLORS.border); card.strokeAlign = 'INSIDE'
    card.cornerRadius = 6
    card.primaryAxisSizingMode = 'AUTO'
    card.counterAxisSizingMode = 'FIXED'
    card.resize(500, 1)
    card.primaryAxisSizingMode = 'AUTO'

    card.appendChild(makeText(comp, 14, FONTS.semiBold, COLORS.accent))

    annRow.appendChild(card)
    annCol.appendChild(annRow)
    annRow.layoutSizingHorizontal = 'FILL'  // fill annCol width after append

    // Thin divider
    if (i < slide.components.length - 1) {
      const div = makeFrame('div')
      div.resize(1, 1); div.fills = solid(COLORS.border)
      div.primaryAxisSizingMode = 'FIXED'; div.counterAxisSizingMode = 'AUTO'
      annCol.appendChild(div)
    }
  })

  // ImageNote below annotations
  if (slide.imageNote) {
    const noteRow = makeFrame('note')
    setAutoLayout(noteRow, 'HORIZONTAL', 8, 8, 8, 0, 0)
    noteRow.fills = solid(COLORS.bgDetail); noteRow.cornerRadius = 6
    noteRow.primaryAxisSizingMode = 'AUTO'; noteRow.counterAxisSizingMode = 'FIXED'
    noteRow.resize(640, 1); noteRow.primaryAxisSizingMode = 'AUTO'
    noteRow.appendChild(makeText('📸', 13, FONTS.regular, COLORS.textPrimary))
    const noteTxt = makeText(slide.imageNote, 13, FONTS.regular, COLORS.textSecondary)
    noteTxt.lineHeight = { value: 150, unit: 'PERCENT' }
    noteTxt.textAutoResize = 'HEIGHT'
    noteRow.appendChild(noteTxt)
    annCol.appendChild(noteRow)
  }

  mainRow.appendChild(annCol)
  annCol.layoutSizingHorizontal = 'FILL'  // fill remaining mainRow width (set after append)

  frame.appendChild(content)
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
  content.primaryAxisSizingMode = 'AUTO'
  content.counterAxisSizingMode = 'FIXED'
  content.resize(SLIDE_WIDTH - 440, 100)
  content.primaryAxisSizingMode = 'AUTO'  // re-apply after resize()

  const sectionLabel = makeText('3 · Comportamentos', 12, FONTS.semiBold, COLORS.accent)
  sectionLabel.letterSpacing = { value: 1, unit: 'PIXELS' }
  content.appendChild(sectionLabel)

  const title = makeText(slide.title, 40, FONTS.bold, COLORS.textPrimary)
  content.appendChild(title)

  if (slide.description) {
    const desc = makeText(slide.description, 16, FONTS.regular, COLORS.textSecondary)
    desc.lineHeight = { value: 160, unit: 'PERCENT' }
    appendFill(content, desc)
  }

  appendFill(content, makeDivider())

  const table = makeFrame('Table')
  setAutoLayout(table, 'VERTICAL', 0, 0, 0, 0, 0)
  table.fills = []
  table.cornerRadius = 8
  table.clipsContent = true
  table.strokes = solid(COLORS.border)
  table.strokeWeight = 1

  // Table header
  const tHead = makeFrame('Table head')
  tHead.layoutMode = 'HORIZONTAL'
  tHead.primaryAxisSizingMode = 'FIXED'
  tHead.counterAxisSizingMode = 'AUTO'
  tHead.resize(SLIDE_WIDTH - PAD.slideH * 2 - 440, 1)
  tHead.counterAxisSizingMode = 'AUTO'  // re-apply after resize()
  tHead.fills = solid(COLORS.bgDark)
  tHead.paddingLeft = 16
  tHead.paddingRight = 16
  tHead.paddingTop = 12
  tHead.paddingBottom = 12

  const headers = ['Estado / Condição', 'Descrição']
  headers.forEach((h) => {
    const cell = makeFrame('header cell')
    cell.layoutMode = 'VERTICAL'
    cell.primaryAxisSizingMode = 'AUTO'    // height grows
    cell.counterAxisSizingMode = 'AUTO'    // width from layoutGrow
    cell.layoutGrow = 1
    cell.fills = []
    const t = makeText(h, 12, FONTS.semiBold, COLORS.textLight)
    t.letterSpacing = { value: 0.5, unit: 'PIXELS' }
    t.textAutoResize = 'HEIGHT'
    appendFill(cell, t)
    tHead.appendChild(cell)
  })
  appendFill(table, tHead)

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
    tRow.resize(SLIDE_WIDTH - PAD.slideH * 2 - 440, 1)
    tRow.counterAxisSizingMode = 'AUTO'  // re-apply after resize()

    const labelCell = makeFrame('label cell')
    labelCell.layoutMode = 'VERTICAL'
    labelCell.primaryAxisSizingMode = 'AUTO'   // height grows with text
    labelCell.counterAxisSizingMode = 'AUTO'   // width from layoutGrow
    labelCell.layoutGrow = 1
    labelCell.fills = []
    const lText = makeText(row.label, 14, FONTS.semiBold, COLORS.textPrimary)
    lText.textAutoResize = 'HEIGHT'
    appendFill(labelCell, lText)
    tRow.appendChild(labelCell)

    const valCell = makeFrame('value cell')
    valCell.layoutMode = 'VERTICAL'
    valCell.primaryAxisSizingMode = 'AUTO'     // height grows with text
    valCell.counterAxisSizingMode = 'AUTO'     // width from layoutGrow
    valCell.layoutGrow = 1
    valCell.fills = []
    const vText = makeText(row.value, 14, FONTS.regular, COLORS.textSecondary)
    vText.lineHeight = { value: 150, unit: 'PERCENT' }
    vText.textAutoResize = 'HEIGHT'
    appendFill(valCell, vText)
    tRow.appendChild(valCell)

    appendFill(table, tRow)
  })

  appendFill(content, table)
  appendImageNote(content, slide.imageNote)

  // Mockup placeholder
  const mockup = makeFrame('Mockup')
  mockup.resize(360, 820)
  mockup.cornerRadius = 24
  mockup.fills = solid(COLORS.bgSection)
  mockup.strokes = solid(COLORS.border)
  mockup.strokeWeight = 1
  const mockLabel = makeText(slide.imageNote ? '📸' : 'Inserir tela\nexemplo', 22, FONTS.regular, COLORS.textSecondary)
  mockLabel.textAlignHorizontal = 'CENTER'
  mockup.appendChild(mockLabel)
  mockLabel.x = (360 - 40) / 2
  mockLabel.y = (820 - 50) / 2
  mockup.x = SLIDE_WIDTH - PAD.slideH - 360
  mockup.y = 130

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
  content.primaryAxisSizingMode = 'AUTO'
  content.counterAxisSizingMode = 'FIXED'
  content.resize(SLIDE_WIDTH, 100)
  content.primaryAxisSizingMode = 'AUTO'  // re-apply after resize()

  const title = makeText(slide.title, 40, FONTS.bold, COLORS.textPrimary)
  content.appendChild(title)
  appendFill(content, makeDivider())

  const cols = makeFrame('Columns')
  cols.layoutMode = 'HORIZONTAL'
  cols.primaryAxisSizingMode = 'FIXED'
  cols.counterAxisSizingMode = 'AUTO'
  cols.itemSpacing = PAD.gapLarge
  cols.fills = []
  cols.resize(SLIDE_WIDTH - PAD.slideH * 2, 1)
  cols.counterAxisSizingMode = 'AUTO'  // re-apply after resize()

  const buildCol = (items: string[], isdo: boolean) => {
    const col = makeFrame(isdo ? 'Do' : 'Dont')
    col.layoutMode = 'VERTICAL'
    col.itemSpacing = 20
    col.paddingTop = 32
    col.paddingBottom = 32
    col.paddingLeft = 36
    col.paddingRight = 36
    col.primaryAxisSizingMode = 'AUTO'
    col.counterAxisSizingMode = 'FIXED'
    col.fills = solid(COLORS.bg)
    col.cornerRadius = 12
    col.layoutGrow = 1
    col.strokeWeight = 1
    col.strokes = solid(COLORS.border)
    col.strokeAlign = 'INSIDE'

    const header = makeText(isdo ? '✅  Do' : '❌  Don\'t', 28, FONTS.bold, COLORS.textPrimary)
    col.appendChild(header)

    items.forEach((item) => {
      const text = makeText(`•  ${item}`, 16, FONTS.regular, COLORS.textPrimary)
      text.lineHeight = { value: 160, unit: 'PERCENT' }
      text.textAutoResize = 'HEIGHT'
      appendFill(col, text)
    })

    return col
  }

  cols.appendChild(buildCol(slide.do ?? [], true))
  cols.appendChild(buildCol(slide.dont ?? [], false))
  appendFill(content, cols)
  frame.appendChild(content)
  return frame
}

function buildWordingSlide(
  slide: WordingSlide,
  guidelineTitle: string,
  index: number,
  slideNum: number
): FrameNode[] {
  const pages = paginate(slide.errors, 'wording_error')
  const frames: FrameNode[] = []

  pages.forEach((pageErrors, pageIdx) => {
    const frame = makeFrame(pageIdx === 0 ? 'Wording' : `Wording (cont. ${pageIdx + 1})`)
    frame.resize(SLIDE_WIDTH, SLIDE_HEIGHT)
    frame.fills = solid(COLORS.bg)
    frame.x = (index + pageIdx) * (SLIDE_WIDTH + SLIDE_GAP)

    const bar = makeHeaderBar(guidelineTitle, slideNum + pageIdx)
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

    const suffix = pages.length > 1 ? ` (${pageIdx + 1}/${pages.length})` : ''
    const title = makeText(slide.title + suffix, 40, FONTS.bold, COLORS.textPrimary)
    content.appendChild(title)
    appendFill(content, makeDivider())

    pageErrors.forEach((error) => {
    const card = makeFrame(`Error: ${error.name}`)
    setAutoLayout(card, 'VERTICAL', PAD.gapSmall, PAD.cardV, PAD.cardV, PAD.cardH, PAD.cardH)
    card.fills = solid(COLORS.bgSection)
    card.cornerRadius = 12

    const errTitle = makeText(error.name, 16, FONTS.bold, COLORS.textPrimary)
    card.appendChild(errTitle)

    const obj = makeText(`Objetivo: ${error.objective}`, 13, FONTS.regular, COLORS.textSecondary)
    obj.lineHeight = { value: 150, unit: 'PERCENT' }
    appendFill(card, obj)

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
      appendFill(card, rat)
    }

    appendFill(content, card)
    })

    frame.appendChild(content)
    frames.push(frame)
  })

  return frames
}

function buildContactSlide(
  slide: ContactSlide,
  _guidelineTitle: string,
  index: number,
  _slideNum: number
): FrameNode {
  // ── Andes X: yellow bg, dark text, left-aligned — matches Pencil Oe8qY ──
  const frame = makeFrame('Contato')
  frame.resize(SLIDE_WIDTH, SLIDE_HEIGHT)
  frame.fills = solid(COLORS.bgCover)
  frame.x = index * (SLIDE_WIDTH + SLIDE_GAP)

  // paddingTop=200 pushes content down, paddingLeft=100 for left margin
  const content = makeFrame('Content')
  setAutoLayout(content, 'VERTICAL', PAD.gapLarge, 200, 80, 100, 100)
  content.fills = []
  content.primaryAxisSizingMode = 'AUTO'
  content.counterAxisSizingMode = 'FIXED'
  content.resize(SLIDE_WIDTH, 1)
  content.primaryAxisSizingMode = 'AUTO'  // re-apply after resize()

  const accentLine = makeFrame('Accent')
  accentLine.resize(80, 6)
  accentLine.fills = solid(COLORS.textPrimary)
  content.appendChild(accentLine)

  const title = makeText('Comentários, dúvidas\nou feedback?', 72, FONTS.extraBold, COLORS.textPrimary)
  title.lineHeight = { value: 110, unit: 'PERCENT' }
  appendFill(content, title)

  const sub = makeText('Envie uma mensagem no nosso canal do Slack.', 24, FONTS.regular, COLORS.textSecondary)
  content.appendChild(sub)

  const channel = makeText(slide.channel, 32, FONTS.bold, COLORS.textPrimary)
  content.appendChild(channel)

  if (slide.links.length > 0) {
    const spacer = makeFrame('spacer'); spacer.resize(1, 16); spacer.fills = []; content.appendChild(spacer)
    const linksTitle = makeText('LINKS ÚTEIS', 18, FONTS.bold, COLORS.textSecondary)
    linksTitle.letterSpacing = { value: 2, unit: 'PIXELS' }
    content.appendChild(linksTitle)
    slide.links.slice(0, 3).forEach((link) => {
      content.appendChild(makeText(`🔗  ${link.label}`, 24, FONTS.semiBold, COLORS.textPrimary))
    })
  }

  appendFill(frame, content)
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
  content.primaryAxisSizingMode = 'AUTO'
  content.counterAxisSizingMode = 'FIXED'
  content.resize(SLIDE_WIDTH, 100)
  content.primaryAxisSizingMode = 'AUTO'  // re-apply after resize()

  const title = makeText(slide.title, 40, FONTS.bold, COLORS.textPrimary)
  content.appendChild(title)
  appendFill(content, makeDivider())

  // Two columns: Antes / Depois
  const cols = makeFrame('Columns')
  cols.layoutMode = 'HORIZONTAL'
  cols.primaryAxisSizingMode = 'FIXED'
  cols.counterAxisSizingMode = 'AUTO'
  cols.itemSpacing = PAD.gap
  cols.fills = []
  cols.resize(SLIDE_WIDTH - PAD.slideH * 2, 1)
  cols.counterAxisSizingMode = 'AUTO'  // re-apply after resize()

  const buildCol = (data: { label: string; points: string[] }, isBefore: boolean) => {
    const col = makeFrame(data.label)
    col.layoutMode = 'VERTICAL'
    col.itemSpacing = PAD.gapSmall
    col.paddingTop = PAD.cardV
    col.paddingBottom = PAD.cardV
    col.paddingLeft = PAD.cardH
    col.paddingRight = PAD.cardH
    col.primaryAxisSizingMode = 'AUTO'
    col.counterAxisSizingMode = 'FIXED'
    col.fills = solid(isBefore ? COLORS.bgDetail : COLORS.accentLight)
    col.cornerRadius = 12
    col.layoutGrow = 1

    const colLabel = makeText(data.label, 18, FONTS.semiBold,
      isBefore ? COLORS.textSecondary : COLORS.accent)
    colLabel.letterSpacing = { value: 0.5, unit: 'PIXELS' }
    col.appendChild(colLabel)

    data.points.forEach((pt) => {
      const bullet = isBefore ? '–' : '✓'
      const txt = makeText(`${bullet}  ${pt}`, 18, FONTS.regular, COLORS.textPrimary)
      txt.lineHeight = { value: 160, unit: 'PERCENT' }
      txt.textAutoResize = 'HEIGHT'
      appendFill(col, txt)
    })
    return col
  }

  cols.appendChild(buildCol(slide.before, true))
  cols.appendChild(buildCol(slide.after, false))
  appendFill(content, cols)

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
  content.primaryAxisSizingMode = 'AUTO'
  content.counterAxisSizingMode = 'FIXED'
  content.resize(SLIDE_WIDTH - 420, 100)
  content.primaryAxisSizingMode = 'AUTO'  // re-apply after resize()

  const sectionLabel = makeText('4 · Microinterações', 12, FONTS.semiBold, COLORS.accent)
  sectionLabel.letterSpacing = { value: 1, unit: 'PIXELS' }
  content.appendChild(sectionLabel)

  const title = makeText(slide.title, 40, FONTS.bold, COLORS.textPrimary)
  content.appendChild(title)

  if (slide.description) {
    const desc = makeText(slide.description, 16, FONTS.regular, COLORS.textSecondary)
    desc.lineHeight = { value: 160, unit: 'PERCENT' }
    appendFill(content, desc)
  }

  appendFill(content, makeDivider())

  slide.behaviors.forEach((b) => {
    const card = makeFrame(`behavior-${b.name}`)
    setAutoLayout(card, 'VERTICAL', PAD.gapSmall, PAD.cardV, PAD.cardV, PAD.cardH, PAD.cardH)
    card.fills = solid(COLORS.bgSection)
    card.cornerRadius = 8

    const bName = makeText(b.name, 15, FONTS.semiBold, COLORS.textPrimary)
    card.appendChild(bName)

    if (b.trigger) {
      const trigger = makeText(`Quando: ${b.trigger}`, 13, FONTS.regular, COLORS.textSecondary)
      card.appendChild(trigger)
    }

    const spec = makeText(b.spec, 13, FONTS.regular, COLORS.textSecondary)
    spec.lineHeight = { value: 150, unit: 'PERCENT' }
    appendFill(card, spec)

    appendFill(content, card)
  })

  // Mockup placeholder
  const mockup = makeFrame('Mockup')
  mockup.resize(360, 820)
  mockup.cornerRadius = 24
  mockup.fills = solid(COLORS.bgSection)
  mockup.strokes = solid(COLORS.border)
  mockup.strokeWeight = 1
  const mockLabel = makeText(slide.imageNote ? '📸' : 'Inserir vídeo\nou protótipo', 22, FONTS.regular, COLORS.textSecondary)
  mockLabel.textAlignHorizontal = 'CENTER'
  mockup.appendChild(mockLabel)
  mockLabel.x = (360 - 40) / 2
  mockLabel.y = (820 - 50) / 2
  mockup.x = SLIDE_WIDTH - PAD.slideH - 360
  mockup.y = 130

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
  // ── Andes X: white bg, big "Índice" left, chapters right — matches Pencil uOrml ──
  const frame = makeFrame('Índice')
  frame.resize(SLIDE_WIDTH, SLIDE_HEIGHT)
  frame.fills = solid(COLORS.bg)
  frame.x = index * (SLIDE_WIDTH + SLIDE_GAP)

  // Top-left label
  const lbl = makeText(`GUIDELINE - ${guidelineTitle.toUpperCase()}`, 16, FONTS.bold, COLORS.textPrimary)
  lbl.letterSpacing = { value: 2, unit: 'PIXELS' }
  frame.appendChild(lbl)
  lbl.x = 97; lbl.y = 74

  // Big "Índice" — left side, anchored low
  const bigTitle = makeText('Índice', 96, FONTS.extraBold, COLORS.textPrimary)
  bigTitle.letterSpacing = { value: -2, unit: 'PIXELS' }
  frame.appendChild(bigTitle)
  bigTitle.x = 200; bigTitle.y = 480

  // Chapter list — right side
  const chapList = makeFrame('ChapterList')
  chapList.layoutMode = 'VERTICAL'
  chapList.itemSpacing = 0
  chapList.fills = []
  chapList.primaryAxisSizingMode = 'AUTO'
  chapList.counterAxisSizingMode = 'FIXED'
  chapList.resize(1000, 1)
  chapList.primaryAxisSizingMode = 'AUTO'  // re-apply after resize()
  frame.appendChild(chapList)
  chapList.x = 793; chapList.y = 100

  // Max 5 sections so content fits within the 1080px slide height
  const visibleSections = slide.sections.slice(0, 5)

  visibleSections.forEach((sec, si) => {
    // Chapter row
    const row = makeFrame(`ch${sec.number}`)
    row.layoutMode = 'HORIZONTAL'
    row.counterAxisAlignItems = 'MIN'
    row.itemSpacing = 24
    row.paddingTop = 32; row.paddingBottom = 32
    row.fills = []
    row.primaryAxisSizingMode = 'FIXED'
    row.counterAxisSizingMode = 'AUTO'
    row.resize(1000, 1)
    row.counterAxisSizingMode = 'AUTO'  // re-apply after resize()
    chapList.appendChild(row)

    // Number circle
    const circle = makeFrame('num')
    circle.resize(52, 52)
    circle.cornerRadius = 99
    circle.fills = solid(COLORS.textPrimary)
    circle.layoutMode = 'VERTICAL'
    circle.primaryAxisAlignItems = 'CENTER'
    circle.counterAxisAlignItems = 'CENTER'
    circle.primaryAxisSizingMode = 'FIXED'
    circle.counterAxisSizingMode = 'FIXED'
    row.appendChild(circle)
    circle.appendChild(makeText(String(sec.number).padStart(2, '0'), 20, FONTS.bold, COLORS.textLight))

    // Chapter content
    const chContent = makeFrame('content')
    chContent.layoutMode = 'VERTICAL'
    chContent.itemSpacing = 10
    chContent.fills = []
    chContent.primaryAxisSizingMode = 'AUTO'
    chContent.counterAxisSizingMode = 'AUTO'
    row.appendChild(chContent)

    chContent.appendChild(makeText(sec.title, 32, FONTS.bold, COLORS.textPrimary))

    const subs = makeFrame('subs')
    subs.layoutMode = 'VERTICAL'
    subs.itemSpacing = 6
    subs.fills = []
    subs.primaryAxisSizingMode = 'AUTO'
    subs.counterAxisSizingMode = 'AUTO'
    chContent.appendChild(subs)

    sec.items.forEach((item) => {
      subs.appendChild(makeText(item, 22, FONTS.regular, COLORS.textSecondary))
    })

    // Divider between chapters
    if (si < visibleSections.length - 1) {
      const div = makeFrame('div')
      div.resize(1000, 1)
      div.fills = solid(COLORS.border)
      chapList.appendChild(div)
    }
  })

  return frame
}

// ─────────────────────────────────────────────
// Overview slide (Visión general)
// ─────────────────────────────────────────────

function buildOverviewSlide(
  slide: OverviewSlide,
  guidelineTitle: string,
  index: number,
  slideNum: number
): FrameNode {
  const frame = makeFrame(`Overview: ${slide.title}`)
  frame.resize(SLIDE_WIDTH, SLIDE_HEIGHT)
  frame.fills = solid(COLORS.bg)
  frame.x = index * (SLIDE_WIDTH + SLIDE_GAP)

  const bar = makeHeaderBar(guidelineTitle, slideNum)
  frame.appendChild(bar)

  // Two-column layout: text left, mockup right
  const main = makeFrame('Main')
  main.layoutMode = 'HORIZONTAL'
  main.itemSpacing = PAD.gapLarge
  main.paddingTop = PAD.slideTop
  main.paddingBottom = PAD.slideBot
  main.paddingLeft = PAD.slideH
  main.paddingRight = PAD.slideH
  main.primaryAxisSizingMode = 'FIXED'
  main.counterAxisSizingMode = 'AUTO'
  main.resize(SLIDE_WIDTH, 1)
  main.counterAxisSizingMode = 'AUTO'  // re-apply after resize()
  main.fills = []

  // Left column — text content
  const left = makeFrame('Text')
  left.layoutMode = 'VERTICAL'
  left.itemSpacing = PAD.gap
  left.primaryAxisSizingMode = 'AUTO'
  left.counterAxisSizingMode = 'FIXED'
  left.layoutGrow = 1
  left.fills = []

  if (slide.sectionLabel) {
    const label = makeText(slide.sectionLabel, 13, FONTS.semiBold, COLORS.accent)
    label.letterSpacing = { value: 1, unit: 'PIXELS' }
    left.appendChild(label)
  }

  const title = makeText(slide.title, 40, FONTS.bold, COLORS.textPrimary)
  left.appendChild(title)

  const desc = makeText(slide.description, 16, FONTS.regular, COLORS.textSecondary)
  desc.lineHeight = { value: 160, unit: 'PERCENT' }
  desc.textAutoResize = 'HEIGHT'
  left.appendChild(desc)

  if (slide.bullets?.length) {
    const bulletList = makeFrame('Bullets')
    bulletList.layoutMode = 'VERTICAL'
    bulletList.itemSpacing = 12
    bulletList.primaryAxisSizingMode = 'AUTO'
    bulletList.counterAxisSizingMode = 'AUTO'
    bulletList.fills = []

    slide.bullets.forEach((b) => {
      const bt = makeText(`•  ${b}`, 15, FONTS.regular, COLORS.textPrimary)
      bt.lineHeight = { value: 150, unit: 'PERCENT' }
      bulletList.appendChild(bt)
    })
    left.appendChild(bulletList)
  }

  if (slide.links?.length) {
    const linksFrame = makeFrame('Links')
    linksFrame.layoutMode = 'VERTICAL'
    linksFrame.itemSpacing = 8
    linksFrame.primaryAxisSizingMode = 'AUTO'
    linksFrame.counterAxisSizingMode = 'AUTO'
    linksFrame.fills = []

    slide.links.forEach((link) => {
      const lt = makeText(`${link.label} ${link.arrow !== false ? '→' : ''}`, 14, FONTS.semiBold, COLORS.accent)
      linksFrame.appendChild(lt)
    })
    left.appendChild(linksFrame)
  }

  main.appendChild(left)

  // Right column — mockup placeholder
  const mockup = makeFrame('Mockup')
  mockup.resize(460, 800)
  mockup.cornerRadius = 24
  mockup.fills = solid(COLORS.bgSection)
  mockup.strokes = solid(COLORS.border)
  mockup.strokeWeight = 1

  const mockLabel = makeText(slide.imageNote ? '📸' : 'Inserir tela', 22, FONTS.regular, COLORS.textSecondary)
  mockLabel.textAlignHorizontal = 'CENTER'
  mockup.appendChild(mockLabel)
  mockLabel.x = 200
  mockLabel.y = 380
  main.appendChild(mockup)

  frame.appendChild(main)
  return frame
}

// ─────────────────────────────────────────────
// Structure / Specs slide (Estructura)
// ─────────────────────────────────────────────

function buildStructureSlide(
  slide: StructureSlide,
  guidelineTitle: string,
  index: number,
  slideNum: number
): FrameNode[] {
  const pages = paginate(slide.specs, 'wording_error') // similar size to wording cards
  const frames: FrameNode[] = []

  pages.forEach((pageSpecs, pageIdx) => {
    const frame = makeFrame(pageIdx === 0 ? `Estructura: ${slide.title}` : `Estructura: ${slide.title} (cont.)`)
    frame.resize(SLIDE_WIDTH, SLIDE_HEIGHT)
    frame.fills = solid(COLORS.bg)
    frame.x = (index + pageIdx) * (SLIDE_WIDTH + SLIDE_GAP)

    const bar = makeHeaderBar(guidelineTitle, slideNum + pageIdx)
    frame.appendChild(bar)

    // Two-column: specs left, mockup right
    const main = makeFrame('Main')
    main.layoutMode = 'HORIZONTAL'
    main.itemSpacing = PAD.gapLarge
    main.paddingTop = PAD.slideTop
    main.paddingBottom = PAD.slideBot
    main.paddingLeft = PAD.slideH
    main.paddingRight = PAD.slideH
    main.primaryAxisSizingMode = 'FIXED'
    main.counterAxisSizingMode = 'AUTO'
    main.resize(SLIDE_WIDTH, 1)
    main.counterAxisSizingMode = 'AUTO'  // re-apply after resize()
    main.fills = []

    // Left — specs
    const left = makeFrame('Specs')
    left.layoutMode = 'VERTICAL'
    left.itemSpacing = PAD.gap
    left.primaryAxisSizingMode = 'AUTO'
    left.counterAxisSizingMode = 'FIXED'
    left.layoutGrow = 1
    left.fills = []

    if (slide.sectionLabel) {
      const label = makeText(slide.sectionLabel, 13, FONTS.semiBold, COLORS.accent)
      label.letterSpacing = { value: 1, unit: 'PIXELS' }
      left.appendChild(label)
    }

    const suffix = pages.length > 1 ? ` (${pageIdx + 1}/${pages.length})` : ''
    const title = makeText(slide.title + suffix, 32, FONTS.bold, COLORS.textPrimary)
    left.appendChild(title)

    if (slide.description && pageIdx === 0) {
      const desc = makeText(slide.description, 14, FONTS.regular, COLORS.textSecondary)
      desc.lineHeight = { value: 150, unit: 'PERCENT' }
      desc.textAutoResize = 'HEIGHT'
      left.appendChild(desc)
    }

    // Spec cards
    pageSpecs.forEach((spec) => {
      const card = makeFrame(`Spec: ${spec.name}`)
      card.layoutMode = 'VERTICAL'
      card.itemSpacing = 8
      card.paddingTop = 16
      card.paddingBottom = 16
      card.paddingLeft = 20
      card.paddingRight = 20
      card.primaryAxisSizingMode = 'AUTO'
      card.counterAxisSizingMode = 'AUTO'
      card.fills = solid(COLORS.bgSection)
      card.cornerRadius = 8

      const specName = makeText(spec.name, 15, FONTS.semiBold, COLORS.textPrimary)
      card.appendChild(specName)

      const specDesc = makeText(spec.description, 13, FONTS.regular, COLORS.textSecondary)
      specDesc.lineHeight = { value: 150, unit: 'PERCENT' }
      card.appendChild(specDesc)

      if (spec.variants?.length) {
        const varRow = makeFrame('Variants')
        varRow.layoutMode = 'HORIZONTAL'
        varRow.itemSpacing = 8
        varRow.primaryAxisSizingMode = 'AUTO'
        varRow.counterAxisSizingMode = 'AUTO'
        varRow.fills = []

        spec.variants.forEach((v) => {
          const chip = makeFrame('Chip')
          chip.layoutMode = 'HORIZONTAL'
          chip.itemSpacing = 4
          chip.paddingTop = 4
          chip.paddingBottom = 4
          chip.paddingLeft = 8
          chip.paddingRight = 8
          chip.primaryAxisSizingMode = 'AUTO'
          chip.counterAxisSizingMode = 'AUTO'
          chip.cornerRadius = 4
          chip.fills = solid(COLORS.bg)
          chip.strokes = solid(COLORS.border)
          chip.strokeWeight = 1

          if (v.flag) {
            const flag = makeText(v.flag, 12, FONTS.regular, COLORS.textPrimary)
            chip.appendChild(flag)
          }
          const val = makeText(v.value, 12, FONTS.semiBold, COLORS.textPrimary)
          chip.appendChild(val)
          varRow.appendChild(chip)
        })
        card.appendChild(varRow)
      }

      if (spec.note) {
        const noteText = makeText(`⚠️  ${spec.note}`, 12, FONTS.regular, COLORS.textSecondary)
        card.appendChild(noteText)
      }

      appendFill(left, card)
    })

    main.appendChild(left)

    // Right — mockup placeholder
    const mockup = makeFrame('Mockup')
    mockup.resize(440, 800)
    mockup.cornerRadius = 24
    mockup.fills = solid(COLORS.bgSection)
    mockup.strokes = solid(COLORS.border)
    mockup.strokeWeight = 1
    const mockLabel = makeText(slide.imageNote ? '📸' : 'Inserir tela\ndo componente', 22, FONTS.regular, COLORS.textSecondary)
    mockLabel.textAlignHorizontal = 'CENTER'
    mockLabel.x = 180
    mockLabel.y = 380
    mockup.appendChild(mockLabel)
    main.appendChild(mockup)

    frame.appendChild(main)
    frames.push(frame)
  })

  return frames
}

// ─────────────────────────────────────────────
// Flow slide (Flows y lógicas)
// ─────────────────────────────────────────────

function buildFlowSlide(
  slide: FlowSlide,
  guidelineTitle: string,
  index: number,
  slideNum: number
): FrameNode {
  const frame = makeFrame(`Flow: ${slide.title}`)
  frame.resize(SLIDE_WIDTH, SLIDE_HEIGHT)
  frame.fills = solid(COLORS.bg)
  frame.x = index * (SLIDE_WIDTH + SLIDE_GAP)

  const bar = makeHeaderBar(guidelineTitle, slideNum)
  frame.appendChild(bar)

  const content = makeFrame('Content')
  content.layoutMode = 'VERTICAL'
  content.itemSpacing = PAD.gapLarge
  content.paddingTop = PAD.slideTop
  content.paddingBottom = PAD.slideBot
  content.paddingLeft = PAD.slideH
  content.paddingRight = PAD.slideH
  content.primaryAxisSizingMode = 'AUTO'
  content.counterAxisSizingMode = 'FIXED'
  content.resize(SLIDE_WIDTH, 1)
  content.primaryAxisSizingMode = 'AUTO'  // re-apply after resize()
  content.fills = []

  if (slide.sectionLabel) {
    const label = makeText(slide.sectionLabel, 13, FONTS.semiBold, COLORS.accent)
    label.letterSpacing = { value: 1, unit: 'PIXELS' }
    content.appendChild(label)
  }

  const title = makeText(slide.title, 40, FONTS.bold, COLORS.textPrimary)
  content.appendChild(title)

  if (slide.description) {
    const desc = makeText(slide.description, 16, FONTS.regular, COLORS.textSecondary)
    desc.lineHeight = { value: 150, unit: 'PERCENT' }
    desc.textAutoResize = 'HEIGHT'
    content.appendChild(desc)
  }

  appendFill(content, makeDivider())

  // Flow steps as horizontal sequence
  const stepsRow = makeFrame('Steps')
  stepsRow.layoutMode = 'HORIZONTAL'
  stepsRow.itemSpacing = 16
  stepsRow.primaryAxisSizingMode = 'AUTO'
  stepsRow.counterAxisSizingMode = 'AUTO'
  stepsRow.fills = []

  slide.steps.forEach((step, i) => {
    // Step card
    const stepCard = makeFrame(`Step ${i + 1}`)
    stepCard.layoutMode = 'VERTICAL'
    stepCard.itemSpacing = 8
    stepCard.paddingTop = 20
    stepCard.paddingBottom = 20
    stepCard.paddingLeft = 24
    stepCard.paddingRight = 24
    stepCard.primaryAxisSizingMode = 'AUTO'
    stepCard.counterAxisSizingMode = 'FIXED'
    stepCard.resize(240, 1)
    stepCard.primaryAxisSizingMode = 'AUTO'  // re-apply after resize()
    stepCard.cornerRadius = 12

    if (step.type === 'decision') {
      stepCard.fills = solid(COLORS.accentLight)
      stepCard.strokes = solid(COLORS.accent)
      stepCard.strokeWeight = 2
    } else if (step.type === 'action') {
      stepCard.fills = solid(COLORS.mpGreenLight)
      stepCard.strokes = solid(COLORS.mpGreen)
      stepCard.strokeWeight = 1
    } else {
      stepCard.fills = solid(COLORS.bgSection)
      stepCard.strokes = solid(COLORS.border)
      stepCard.strokeWeight = 1
    }

    const stepLabel = makeText(step.label, 14, FONTS.semiBold, COLORS.textPrimary)
    stepLabel.textAutoResize = 'HEIGHT'
    stepCard.appendChild(stepLabel)

    if (step.note) {
      const noteText = makeText(step.note, 12, FONTS.regular, COLORS.textSecondary)
      noteText.lineHeight = { value: 140, unit: 'PERCENT' }
      noteText.textAutoResize = 'HEIGHT'
      stepCard.appendChild(noteText)
    }

    stepsRow.appendChild(stepCard)

    // Arrow between steps
    if (i < slide.steps.length - 1) {
      const arrow = makeText('→', 20, FONTS.bold, COLORS.textMuted)
      stepsRow.appendChild(arrow)
    }
  })

  appendFill(content, stepsRow)

  // Branches / conditions
  if (slide.branches?.length) {
    const branchTitle = makeText('Condições', 14, FONTS.semiBold, COLORS.textSecondary)
    branchTitle.letterSpacing = { value: 1, unit: 'PIXELS' }
    content.appendChild(branchTitle)

    slide.branches.forEach((branch) => {
      const branchRow = makeFrame('Branch')
      branchRow.layoutMode = 'HORIZONTAL'
      branchRow.itemSpacing = 12
      branchRow.primaryAxisSizingMode = 'AUTO'
      branchRow.counterAxisSizingMode = 'AUTO'
      branchRow.fills = []

      const condition = makeText(branch.condition, 14, FONTS.semiBold, COLORS.accent)
      branchRow.appendChild(condition)

      const arrowText = makeText('→', 14, FONTS.regular, COLORS.textMuted)
      branchRow.appendChild(arrowText)

      const target = makeText(branch.target, 14, FONTS.regular, COLORS.textPrimary)
      branchRow.appendChild(target)

      content.appendChild(branchRow)
    })
  }

  frame.appendChild(content)
  return frame
}

// ─────────────────────────────────────────────
// Handoff slide
// ─────────────────────────────────────────────

function buildHandoffSlide(
  slide: HandoffSlide,
  guidelineTitle: string,
  index: number,
  slideNum: number
): FrameNode {
  const frame = makeFrame(`Handoff: ${slide.title}`)
  frame.resize(SLIDE_WIDTH, SLIDE_HEIGHT)
  frame.fills = solid(COLORS.bg)
  frame.x = index * (SLIDE_WIDTH + SLIDE_GAP)

  const bar = makeHeaderBar(guidelineTitle, slideNum)
  frame.appendChild(bar)

  const content = makeFrame('Content')
  content.layoutMode = 'VERTICAL'
  content.itemSpacing = PAD.gapLarge
  content.paddingTop = PAD.slideTop
  content.paddingBottom = PAD.slideBot
  content.paddingLeft = PAD.slideH
  content.paddingRight = PAD.slideH
  content.primaryAxisSizingMode = 'AUTO'
  content.counterAxisSizingMode = 'FIXED'
  content.resize(SLIDE_WIDTH, 1)
  content.primaryAxisSizingMode = 'AUTO'  // re-apply after resize()
  content.fills = []

  const title = makeText(slide.title, 40, FONTS.bold, COLORS.textPrimary)
  content.appendChild(title)

  if (slide.country) {
    const countryTag = makeTag(slide.country)
    content.appendChild(countryTag)
  }

  appendFill(content, makeDivider())

  // Figma links
  if (slide.figmaLinks?.length) {
    const linksLabel = makeText('Figma', 13, FONTS.semiBold, COLORS.textSecondary)
    linksLabel.letterSpacing = { value: 1, unit: 'PIXELS' }
    content.appendChild(linksLabel)

    slide.figmaLinks.forEach((link) => {
      const linkRow = makeFrame('Link')
      linkRow.layoutMode = 'HORIZONTAL'
      linkRow.itemSpacing = 8
      linkRow.paddingTop = 12
      linkRow.paddingBottom = 12
      linkRow.paddingLeft = 16
      linkRow.paddingRight = 16
      linkRow.primaryAxisSizingMode = 'AUTO'
      linkRow.counterAxisSizingMode = 'AUTO'
      linkRow.fills = solid(COLORS.bgSection)
      linkRow.cornerRadius = 8

      const icon = makeText('📐', 14, FONTS.regular, COLORS.textPrimary)
      linkRow.appendChild(icon)

      const linkLabel = makeText(link.label, 14, FONTS.semiBold, COLORS.accent)
      linkRow.appendChild(linkLabel)

      const arrow = makeText('→', 14, FONTS.regular, COLORS.accent)
      linkRow.appendChild(arrow)

      content.appendChild(linkRow)
    })
  }

  // Specs table
  if (slide.specs?.length) {
    const specsLabel = makeText('Especificações', 13, FONTS.semiBold, COLORS.textSecondary)
    specsLabel.letterSpacing = { value: 1, unit: 'PIXELS' }
    content.appendChild(specsLabel)

    const table = makeFrame('Specs table')
    table.layoutMode = 'VERTICAL'
    table.itemSpacing = 0
    table.primaryAxisSizingMode = 'AUTO'
    table.counterAxisSizingMode = 'FIXED'
    table.resize(SLIDE_WIDTH - PAD.slideH * 2, 1)
    table.primaryAxisSizingMode = 'AUTO'  // re-apply after resize()
    table.fills = []
    table.cornerRadius = 8
    table.clipsContent = true
    table.strokes = solid(COLORS.border)
    table.strokeWeight = 1

    slide.specs.forEach((spec, i) => {
      const row = makeFrame(`Spec: ${spec.label}`)
      row.layoutMode = 'HORIZONTAL'
      row.itemSpacing = 16
      row.paddingTop = 12
      row.paddingBottom = 12
      row.paddingLeft = 16
      row.paddingRight = 16
      row.primaryAxisSizingMode = 'FIXED'
      row.counterAxisSizingMode = 'AUTO'
      row.resize(SLIDE_WIDTH - PAD.slideH * 2, 1)
      row.counterAxisSizingMode = 'AUTO'  // re-apply after resize()
      row.fills = solid(i % 2 === 0 ? COLORS.bg : COLORS.bgSection)

      const label = makeText(spec.label, 14, FONTS.semiBold, COLORS.textPrimary)
      label.resize(200, label.height)
      label.textAutoResize = 'HEIGHT'
      row.appendChild(label)

      const value = makeText(spec.value, 14, FONTS.regular, COLORS.textSecondary)
      value.layoutGrow = 1
      value.textAutoResize = 'HEIGHT'
      row.appendChild(value)

      table.appendChild(row)
      row.layoutSizingHorizontal = 'FILL'
    })

    appendFill(content, table)
  }

  frame.appendChild(content)
  return frame
}

// ─────────────────────────────────────────────
// New Andes X slide builders — using proven setAutoLayout pattern
// ─────────────────────────────────────────────

/** Yellow section-break — matches Pencil Jajou */
function buildSectionSlide(slide: SectionSlide, index: number): FrameNode {
  const frame = makeFrame(`Seção - ${slide.title}`)
  frame.resize(SLIDE_WIDTH, SLIDE_HEIGHT)
  frame.fills = solid(COLORS.bgCover)
  frame.x = index * (SLIDE_WIDTH + SLIDE_GAP)

  // Main content: paddingTop=280, paddingLeft=98
  const content = makeFrame('Content')
  setAutoLayout(content, 'VERTICAL', 24, 280, 80, 98, 98)
  content.fills = []
  content.primaryAxisSizingMode = 'AUTO'
  content.counterAxisSizingMode = 'FIXED'
  content.resize(SLIDE_WIDTH, 1)
  content.primaryAxisSizingMode = 'AUTO'  // re-apply after resize()
  content.counterAxisAlignItems = 'MIN'

  // Number + title row
  const numCircle = makeFrame('NumCircle')
  setAutoLayout(numCircle, 'HORIZONTAL', 0, 16, 16, 18, 18)
  numCircle.cornerRadius = 99
  numCircle.fills = solid(COLORS.textPrimary)
  numCircle.primaryAxisSizingMode = 'AUTO'
  numCircle.counterAxisSizingMode = 'AUTO'
  numCircle.appendChild(makeText(slide.number, 20, FONTS.bold, COLORS.textLight))
  content.appendChild(numCircle)

  const titleTxt = makeText(slide.title, 80, FONTS.extraBold, COLORS.textPrimary)
  titleTxt.lineHeight = { value: 100, unit: 'PERCENT' }
  titleTxt.letterSpacing = { value: -2, unit: 'PIXELS' }
  appendFill(content, titleTxt)

  const subTxt = makeText(slide.subtitle, 36, FONTS.bold, COLORS.textPrimary)
  subTxt.letterSpacing = { value: -1, unit: 'PIXELS' }
  content.appendChild(subTxt)

  slide.bullets.forEach((b) => {
    content.appendChild(makeText(b, 22, FONTS.regular, COLORS.textSecondary))
  })

  appendFill(frame, content)
  return frame
}

/** Component focus — #f4f5f9 bg, breadcrumb, 2-col layout — matches Pencil 42KP1 */
function buildComponentFocusSlide(
  slide: ComponentFocusSlide,
  guidelineTitle: string,
  index: number,
  slideNum: number
): FrameNode {
  const frame = makeFrame(`Foco - ${slide.componentTitle}`)
  frame.resize(SLIDE_WIDTH, SLIDE_HEIGHT)
  frame.fills = solid(COLORS.bgSection)
  frame.x = index * (SLIDE_WIDTH + SLIDE_GAP)

  const header = makeHeaderBar(guidelineTitle, slideNum)
  appendFill(frame, header)

  // Horizontal main row: left content + right mockup
  const mainRow = makeFrame('MainRow')
  setAutoLayout(mainRow, 'HORIZONTAL', 80, 120, 0, 97, 97)
  mainRow.counterAxisSizingMode = 'FIXED'
  mainRow.primaryAxisSizingMode = 'FIXED'
  mainRow.resize(SLIDE_WIDTH, SLIDE_HEIGHT - 120)
  mainRow.counterAxisAlignItems = 'MIN'

  // Left: breadcrumb + title + description
  const leftCol = makeFrame('Left')
  setAutoLayout(leftCol, 'VERTICAL', 24, 0, 0, 0, 0)
  leftCol.counterAxisSizingMode = 'FIXED'
  leftCol.primaryAxisSizingMode = 'AUTO'
  leftCol.resize(620, 1)
  leftCol.primaryAxisSizingMode = 'AUTO'  // re-apply after resize()

  // Breadcrumb
  const breadRow = makeFrame('Breadcrumb')
  setAutoLayout(breadRow, 'HORIZONTAL', 8, 0, 0, 0, 0)
  breadRow.fills = []
  breadRow.primaryAxisSizingMode = 'AUTO'
  breadRow.counterAxisSizingMode = 'AUTO'
  breadRow.counterAxisAlignItems = 'CENTER'
  slide.breadcrumb.forEach((crumb, i) => {
    const isLast = i === slide.breadcrumb.length - 1
    breadRow.appendChild(makeText(crumb, 18, isLast ? FONTS.regular : FONTS.semiBold,
      isLast ? COLORS.textPrimary : COLORS.accent))
    if (!isLast) breadRow.appendChild(makeText('›', 18, FONTS.regular, COLORS.textPrimary))
  })
  leftCol.appendChild(breadRow)

  const titleNode = makeText(`${slide.screenName}\n${slide.componentTitle}`, 48, FONTS.bold, COLORS.textPrimary)
  titleNode.lineHeight = { value: 115, unit: 'PERCENT' }
  appendFill(leftCol, titleNode)

  const descNode = makeText(slide.description, 20, FONTS.regular, COLORS.textPrimary)
  descNode.lineHeight = { value: 160, unit: 'PERCENT' }
  appendFill(leftCol, descNode)

  mainRow.appendChild(leftCol)

  // Right: mockup + annotation card (vertical column)
  const rightCol = makeFrame('Right')
  setAutoLayout(rightCol, 'VERTICAL', 24, 0, 0, 0, 0)
  rightCol.layoutGrow = 1
  rightCol.primaryAxisSizingMode = 'AUTO'
  rightCol.counterAxisSizingMode = 'AUTO'

  // Mockup placeholder
  const mockup = makeFrame('Mockup')
  mockup.cornerRadius = 16
  mockup.fills = solid(COLORS.bg)
  mockup.strokeWeight = 2; mockup.strokes = solid(COLORS.border); mockup.strokeAlign = 'INSIDE'
  mockup.layoutGrow = 1
  mockup.primaryAxisSizingMode = 'FIXED'
  mockup.counterAxisSizingMode = 'FIXED'
  mockup.resize(336, 580)

  // Show focused component block
  const sbMock = makeFrame('sb'); sbMock.resize(336, 36); sbMock.fills = solid(COLORS.bgSection); mockup.appendChild(sbMock)
  const focusBlock = makeFrame('focus'); focusBlock.resize(336, 70); focusBlock.fills = solid(COLORS.bgComponent); mockup.appendChild(focusBlock)
  const blurRest = makeFrame('blur'); blurRest.resize(336, 474); blurRest.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 0.7 }]; mockup.appendChild(blurRest)
  rightCol.appendChild(mockup)

  // Annotation card
  const annotCard = makeFrame('AnnotCard')
  setAutoLayout(annotCard, 'VERTICAL', 8, 14, 14, 16, 16)
  annotCard.fills = solid(COLORS.bg)
  annotCard.strokeWeight = 1; annotCard.strokes = solid(COLORS.border); annotCard.strokeAlign = 'INSIDE'
  annotCard.cornerRadius = 8
  annotCard.primaryAxisSizingMode = 'AUTO'
  annotCard.counterAxisSizingMode = 'FIXED'
  annotCard.resize(380, 1)
  annotCard.primaryAxisSizingMode = 'AUTO'  // re-apply after resize()
  const aTitle = makeText(slide.annotation.title, 15, FONTS.semiBold, COLORS.textPrimary)
  appendFill(annotCard, aTitle)
  const aDesc = makeText(slide.annotation.description, 13, FONTS.regular, COLORS.textSecondary)
  appendFill(annotCard, aDesc)
  rightCol.appendChild(annotCard)

  mainRow.appendChild(rightCol)
  appendFill(frame, mainRow)
  return frame
}

/** 2-mockup structure — white bg, matches Pencil XJZAl */
function buildStructureDualSlide(
  slide: StructureDualSlide,
  guidelineTitle: string,
  index: number,
  slideNum: number
): FrameNode {
  const frame = makeFrame(`Estrutura - ${slide.title}`)
  frame.resize(SLIDE_WIDTH, SLIDE_HEIGHT)
  frame.fills = solid(COLORS.bg)
  frame.x = index * (SLIDE_WIDTH + SLIDE_GAP)

  const bar = makeHeaderBar(guidelineTitle, slideNum)
  appendFill(frame, bar)

  // Title + subtitle
  const topContent = makeFrame('Top')
  setAutoLayout(topContent, 'VERTICAL', 8, PAD.slideTop, 24, PAD.slideH, PAD.slideH)
  topContent.fills = []
  topContent.primaryAxisSizingMode = 'AUTO'
  topContent.counterAxisSizingMode = 'FIXED'
  topContent.resize(SLIDE_WIDTH, 1)
  topContent.primaryAxisSizingMode = 'AUTO'  // re-apply after resize()

  const titleNode = makeText(slide.title, 48, FONTS.bold, COLORS.textPrimary)
  titleNode.letterSpacing = { value: -1, unit: 'PIXELS' }
  appendFill(topContent, titleNode)
  if (slide.subtitle) {
    const subNode = makeText(slide.subtitle, 18, FONTS.regular, COLORS.textSecondary)
    appendFill(topContent, subNode)
  }
  appendFill(frame, topContent)

  // Main: left-annots | left-mockup | right-mockup | right-annots
  const mainRow = makeFrame('Main')
  setAutoLayout(mainRow, 'HORIZONTAL', 20, 0, 0, PAD.gapSmall, PAD.gapSmall)
  mainRow.counterAxisSizingMode = 'FIXED'
  mainRow.primaryAxisSizingMode = 'FIXED'
  mainRow.resize(SLIDE_WIDTH, 680)
  mainRow.counterAxisAlignItems = 'MIN'

  function makeAnnotCol(annotations: { name: string; description: string }[], width: number, side: 'left' | 'right'): FrameNode {
    const col = makeFrame(`Annot-${side}`)
    setAutoLayout(col, 'VERTICAL', 0, 0, 0, 0, 0)
    col.fills = []
    col.counterAxisSizingMode = 'FIXED'
    col.primaryAxisSizingMode = 'FIXED'
    col.resize(width, 680)
    const perItem = Math.max(1, Math.floor(680 / (annotations.length || 1)))
    annotations.forEach((ann) => {
      const row = makeFrame('ann')
      setAutoLayout(row, side === 'left' ? 'HORIZONTAL' : 'HORIZONTAL', 0, 0, 0, 0, 0)
      row.fills = []
      row.counterAxisSizingMode = 'FIXED'
      row.primaryAxisSizingMode = 'FIXED'
      row.resize(width, perItem)
      row.counterAxisAlignItems = 'CENTER'
      row.clipsContent = false
      const card = makeFrame('card')
      setAutoLayout(card, 'VERTICAL', 4, 8, 8, 12, 12)
      card.fills = solid(COLORS.bg)
      card.strokeWeight = 1; card.strokes = solid(COLORS.border); card.strokeAlign = 'INSIDE'
      card.cornerRadius = 6
      card.primaryAxisSizingMode = 'AUTO'
      card.counterAxisSizingMode = 'FIXED'
      card.resize(width - 8, 1)
      card.primaryAxisSizingMode = 'AUTO'  // re-apply after resize()
      card.appendChild(makeText(ann.name, 11, FONTS.semiBold, COLORS.accent))
      const dT = makeText(ann.description, 10, FONTS.regular, COLORS.textSecondary)
      appendFill(card, dT)
      row.appendChild(card)
      col.appendChild(row)
    })
    return col
  }

  function makeSlimMockup(label: string, blockHeights: number[]): FrameNode {
    const wrap = makeFrame(label)
    setAutoLayout(wrap, 'VERTICAL', 8, 0, 0, 0, 0)
    wrap.fills = []
    wrap.primaryAxisSizingMode = 'AUTO'
    wrap.counterAxisSizingMode = 'AUTO'
    const m = makeFrame('mockup')
    m.layoutMode = 'VERTICAL'
    m.itemSpacing = 0
    m.fills = solid(COLORS.bg)
    m.strokeWeight = 2; m.strokes = solid(COLORS.border); m.strokeAlign = 'INSIDE'
    m.cornerRadius = 12
    m.primaryAxisSizingMode = 'AUTO'
    m.counterAxisSizingMode = 'FIXED'
    m.resize(280, 1)
    m.primaryAxisSizingMode = 'AUTO'  // re-apply after resize()
    const fills = [COLORS.bgSection, COLORS.bgDetail, COLORS.bgComponent, COLORS.bgDetail, COLORS.bgComponent, COLORS.bgDetail]
    blockHeights.forEach((h, i) => {
      const b = makeFrame(`b${i}`); b.resize(280, h); b.fills = solid(fills[i % fills.length]); m.appendChild(b)
    })
    wrap.appendChild(m)
    wrap.appendChild(makeText(label, 12, FONTS.semiBold, COLORS.textSecondary))
    return wrap
  }

  mainRow.appendChild(makeAnnotCol(slide.leftAnnotations, 240, 'left'))
  mainRow.appendChild(makeSlimMockup(slide.leftLabel ?? 'Caso típico', [36, 52, 60, 160, 220, 80]))
  mainRow.appendChild(makeSlimMockup(slide.rightLabel ?? 'Caso com scroll', [36, 52, 60, 300, 140, 80]))
  mainRow.appendChild(makeAnnotCol(slide.rightAnnotations, 320, 'right'))

  appendFill(frame, mainRow)
  return frame
}
// ─────────────────────────────────────────────
// Image injection
// ─────────────────────────────────────────────

/**
 * After a slide frame is built, find its 'Mockup' or 'MockupArea' child and apply
 * the exported Figma screen as an image fill. Gracefully no-ops if anything fails.
 */
function applyMockupImages(frames: FrameNode[], slideFrameId: string | undefined, images: Record<string, number[]>): void {
  if (!slideFrameId || !images[slideFrameId]) return
  for (const frame of frames) {
    const mockup = frame.findOne((n) => (n.name === 'Mockup' || n.name === 'MockupArea') && n.type === 'FRAME') as FrameNode | null
    if (mockup) {
      try {
        const img = figma.createImage(new Uint8Array(images[slideFrameId]))
        mockup.fills = [{ type: 'IMAGE', imageHash: img.hash, scaleMode: 'FIT' }]
        for (const child of [...mockup.children]) child.remove()
      } catch {
        // Keep placeholder as-is — image fill failed silently
      }
      break
    }
  }
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
  // Required for documentAccess: "dynamic-page" — without this, appendChild() fails silently
  await page.loadAsync()

  let slideNum = 1
  const skipped: string[] = []
  const totalSlides = data.slides.length || 1

  reportProgress(options, 'Montando slides', 0.16)

  let outputSlideIndex = 0

  for (let i = 0; i < data.slides.length; i++) {
    ensureBuildNotAborted(options)
    const slide = data.slides[i]
    let frames: FrameNode[]

    reportProgress(
      options,
      `Criando slide ${i + 1}/${totalSlides}`,
      0.16 + ((i + 1) / totalSlides) * 0.78
    )

    try {
      switch (slide.type) {
        case 'cover':
          frames = [buildCoverSlide(slide, outputSlideIndex)]
          break
        case 'objective':
          frames = [buildObjectiveSlide(slide, data.title, outputSlideIndex, slideNum++)]
          break
        case 'glossary':
          frames = [buildGlossarySlide(slide, data.title, outputSlideIndex, slideNum++)]
          break
        case 'anatomy':
          frames = [buildAnatomySlide(slide, data.title, outputSlideIndex, slideNum++)]
          break
        case 'use_case_map':
          frames = [buildUseCaseMapSlide(slide, data.title, outputSlideIndex, slideNum++)]
          break
        case 'use_case':
          frames = [buildUseCaseSlide(slide, data.title, outputSlideIndex, slideNum++)]
          break
        case 'behavior':
          frames = [buildBehaviorSlide(slide, data.title, outputSlideIndex, slideNum++)]
          break
        case 'do_dont':
          frames = [buildDoDontSlide(slide, data.title, outputSlideIndex, slideNum++)]
          break
        case 'wording': {
          const wordingFrames = buildWordingSlide(slide, data.title, outputSlideIndex, slideNum)
          slideNum += wordingFrames.length
          frames = wordingFrames
          break
        }
        case 'contact':
          frames = [buildContactSlide(slide, data.title, outputSlideIndex, slideNum++)]
          break
        case 'before_after':
          frames = [buildBeforeAfterSlide(slide as BeforeAfterSlide, data.title, outputSlideIndex, slideNum++)]
          break
        case 'microinteraction':
          frames = [buildMicrointeractionSlide(slide as MicrointeractionSlide, data.title, outputSlideIndex, slideNum++)]
          break
        case 'index':
          frames = [buildIndexSlide(slide as IndexSlide, data.title, outputSlideIndex)]
          break
        case 'overview':
          frames = [buildOverviewSlide(slide as OverviewSlide, data.title, outputSlideIndex, slideNum++)]
          break
        case 'structure': {
          const structFrames = buildStructureSlide(slide as StructureSlide, data.title, outputSlideIndex, slideNum)
          slideNum += structFrames.length
          frames = structFrames
          break
        }
        case 'flow':
          frames = [buildFlowSlide(slide as FlowSlide, data.title, outputSlideIndex, slideNum++)]
          break
        case 'handoff':
          frames = [buildHandoffSlide(slide as HandoffSlide, data.title, outputSlideIndex, slideNum++)]
          break
        case 'section':
          frames = [buildSectionSlide(slide as SectionSlide, outputSlideIndex)]
          break
        case 'component_focus':
          frames = [buildComponentFocusSlide(slide as ComponentFocusSlide, data.title, outputSlideIndex, slideNum++)]
          break
        case 'structure_dual':
          frames = [buildStructureDualSlide(slide as StructureDualSlide, data.title, outputSlideIndex, slideNum++)]
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

    // Apply exported Figma screen to mockup placeholder if available
    if (options?.mockupImages && (slide as { mockupFrameId?: string }).mockupFrameId) {
      applyMockupImages(frames, (slide as { mockupFrameId?: string }).mockupFrameId, options.mockupImages)
    }

    ensureBuildNotAborted(options)
    for (const f of frames) {
      page.appendChild(f)
      outputSlideIndex++
    }
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

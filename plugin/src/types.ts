// ─── Slide types ───────────────────────────────────────────────

export interface CoverSlide {
  type: 'cover'
  title: string
  subtitle: string
  team: string
  version: string
}
export interface ObjectiveSlide {
  type: 'objective'
  body: string
}
export interface GlossarySlide {
  type: 'glossary'
  terms: { term: string; definition: string }[]
}
export interface AnatomySlide {
  type: 'anatomy'
  title: string
  body?: string
  components: { index: number; name: string; required: boolean }[]
  note?: string
  imageNote?: string
}
export interface UseCaseMapSlide {
  type: 'use_case_map'
  title: string
  caseNames: string[]
  rows: { component: string; cases: Record<string, boolean> }[]
}
export interface UseCaseSlide {
  type: 'use_case'
  title: string
  countries?: string[]
  body: string
  components: string[]
  imageNote?: string
}
export interface BehaviorSlide {
  type: 'behavior'
  title: string
  description?: string
  rows: { label: string; value: string }[]
  imageNote?: string
}
export interface DoDontSlide {
  type: 'do_dont'
  title: string
  // Simple variant (general best practices)
  do?: string[]
  dont?: string[]
  // Component variant (detailed, with mockup columns)
  componentName?: string
  description?: string
  variants?: {
    label: string        // "Sem ticket", "Com ticket"
    isGood: boolean
    blocks: { name: string; height: number; highlighted?: boolean }[]
    annotation?: string  // note shown next to this variant
  }[]
  annotations?: { title: string; description: string }[]
  dontRule?: string      // rule shown on Don't section
}
export interface WordingSlide {
  type: 'wording'
  title: string
  errors: {
    name: string
    objective: string
    variants: { country: string; flag: string; text: string }[]
    rationale?: string
  }[]
}
export interface ContactSlide {
  type: 'contact'
  channel: string
  links: { label: string; url: string }[]
}

// ─── Novos tipos ──────────────────────────────────────────────

export interface BeforeAfterSlide {
  type: 'before_after'
  title: string
  before: { label: string; points: string[] }
  after: { label: string; points: string[] }
  imageNote?: string
}

export interface MicrointeractionSlide {
  type: 'microinteraction'
  title: string
  description?: string
  behaviors: {
    name: string           // ex: "Cursor piscando"
    spec: string           // ex: "Alternância visível/invisível, duração nativa do sistema"
    trigger?: string       // ex: "Ao focar o Amount Field"
  }[]
  imageNote?: string
}

export interface IndexSlide {
  type: 'index'
  sections: {
    number: number
    title: string
    items: string[]        // sub-itens (ex: "Visão geral →", "Anatomia →")
  }[]
}

// ─── Novos tipos v2 ─────────────────────────────────────────

export interface OverviewSlide {
  type: 'overview'
  title: string
  sectionLabel?: string
  description: string
  bullets?: string[]
  links?: { label: string; arrow?: boolean }[]
  imageNote?: string
}

export interface StructureSlide {
  type: 'structure'
  title: string
  sectionLabel?: string
  description?: string
  specs: {
    name: string
    description: string
    variants?: { country?: string; flag?: string; value: string }[]
    note?: string
  }[]
  imageNote?: string
}

export interface FlowSlide {
  type: 'flow'
  title: string
  sectionLabel?: string
  description?: string
  steps: {
    label: string
    type?: 'screen' | 'decision' | 'action'
    note?: string
  }[]
  branches?: { condition: string; target: string }[]
}

export interface HandoffSlide {
  type: 'handoff'
  title: string
  country?: string
  figmaLinks?: { label: string; url: string }[]
  specs?: { label: string; value: string }[]
}

// ─── Andes X template types ──────────────────────────────────

/** Yellow section-break slide: number + big title + subtitle + nav bullets + mockup area */
export interface SectionSlide {
  type: 'section'
  number: string           // "01", "02" …
  title: string            // e.g. "CHO em passos"
  subtitle: string         // e.g. "Visão geral"
  bullets: string[]        // navigation items: "Antes e depois →"
}

/** Deep-dive into one component: breadcrumb + title + description + annotated mockup */
export interface ComponentFocusSlide {
  type: 'component_focus'
  breadcrumb: string[]     // ["Estrutura", "Listado de meios", "Tarea"]
  screenName: string       // screen/section name: "Listado de meios"
  componentTitle: string   // "1. Tarea (Título)"
  description: string
  annotation: { title: string; description: string }
  highlightPosition?: 'top' | 'middle' | 'bottom'  // where to highlight in the mockup
}

/** Structure slide with 2 mockup variants (typical vs scroll) */
export interface StructureDualSlide {
  type: 'structure_dual'
  title: string
  subtitle?: string
  leftLabel?: string       // "Caso típico"
  rightLabel?: string      // "Caso com scroll"
  leftAnnotations:  { name: string; description: string }[]
  rightAnnotations: { name: string; description: string }[]
}

export type Slide =
  | CoverSlide | ObjectiveSlide | GlossarySlide | AnatomySlide
  | UseCaseMapSlide | UseCaseSlide | BehaviorSlide | DoDontSlide
  | WordingSlide | ContactSlide
  | BeforeAfterSlide | MicrointeractionSlide | IndexSlide
  | OverviewSlide | StructureSlide | FlowSlide | HandoffSlide
  | SectionSlide | ComponentFocusSlide | StructureDualSlide

export interface GuidelineData {
  title: string
  team: string
  version: string
  slides: Slide[]
}

// ─── Plugin ↔ UI messages ────────────────────────────────────

export type PluginToUI =
  | { type: 'STORED_CREDENTIALS'; figmaToken: string; anthropicKey: string }
  | { type: 'STORED_GUIDELINE'; guideline: string }
  | { type: 'BUILD_STARTED'; requestId: string; totalSlides: number }
  | { type: 'BUILD_STAGE'; requestId: string; stage: string; progress?: number }
  | { type: 'BUILD_COMPLETE'; count: number; requestId?: string }
  | { type: 'BUILD_ERROR'; message: string; requestId?: string }

export type UIToPlugin =
  | { type: 'GET_CREDENTIALS' }
  | { type: 'SAVE_CREDENTIALS'; figmaToken: string; anthropicKey: string }
  | { type: 'SAVE_GUIDELINE'; guideline: string }
  | { type: 'GET_GUIDELINE' }
  | { type: 'BUILD_SLIDES'; data: GuidelineData; requestId?: string }
  | { type: 'CLOSE' }

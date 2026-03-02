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
  do: string[]
  dont: string[]
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

export type Slide =
  | CoverSlide | ObjectiveSlide | GlossarySlide | AnatomySlide
  | UseCaseMapSlide | UseCaseSlide | BehaviorSlide | DoDontSlide
  | WordingSlide | ContactSlide

export interface GuidelineData {
  title: string
  team: string
  version: string
  slides: Slide[]
}

// ─── Plugin ↔ UI messages ────────────────────────────────────

export type PluginToUI =
  | { type: 'STORED_CREDENTIALS'; figmaToken: string; anthropicKey: string }
  | { type: 'BUILD_COMPLETE'; count: number }
  | { type: 'BUILD_ERROR'; message: string }

export type UIToPlugin =
  | { type: 'GET_CREDENTIALS' }
  | { type: 'SAVE_CREDENTIALS'; figmaToken: string; anthropicKey: string }
  | { type: 'BUILD_SLIDES'; data: GuidelineData }
  | { type: 'CLOSE' }

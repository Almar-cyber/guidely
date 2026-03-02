import { z } from 'zod'

const CoverSlideSchema = z.object({
  type: z.literal('cover'),
  title: z.string(),
  subtitle: z.string(),
  team: z.string(),
  version: z.string(),
})

const ObjectiveSlideSchema = z.object({
  type: z.literal('objective'),
  body: z.string(),
})

const GlossarySlideSchema = z.object({
  type: z.literal('glossary'),
  terms: z.array(z.object({ term: z.string(), definition: z.string() })),
})

const AnatomySlideSchema = z.object({
  type: z.literal('anatomy'),
  title: z.string(),
  body: z.string().optional(),
  components: z.array(
    z.object({ index: z.number(), name: z.string(), required: z.boolean() })
  ),
  note: z.string().optional(),
})

const UseCaseMapSlideSchema = z.object({
  type: z.literal('use_case_map'),
  title: z.string(),
  caseNames: z.array(z.string()),
  rows: z.array(
    z.object({ component: z.string(), cases: z.record(z.boolean()) })
  ),
})

const UseCaseSlideSchema = z.object({
  type: z.literal('use_case'),
  title: z.string(),
  countries: z.array(z.string()).optional(),
  body: z.string(),
  components: z.array(z.string()),
})

const BehaviorSlideSchema = z.object({
  type: z.literal('behavior'),
  title: z.string(),
  description: z.string().optional(),
  rows: z.array(z.object({ label: z.string(), value: z.string() })),
})

const DoDontSlideSchema = z.object({
  type: z.literal('do_dont'),
  title: z.string(),
  do: z.array(z.string()),
  dont: z.array(z.string()),
})

const WordingSlideSchema = z.object({
  type: z.literal('wording'),
  title: z.string(),
  errors: z.array(
    z.object({
      name: z.string(),
      objective: z.string(),
      variants: z.array(
        z.object({ country: z.string(), flag: z.string(), text: z.string() })
      ),
      rationale: z.string().optional(),
    })
  ),
})

const ContactSlideSchema = z.object({
  type: z.literal('contact'),
  channel: z.string(),
  links: z.array(z.object({ label: z.string(), url: z.string() })),
})

export const SlideSchema = z.discriminatedUnion('type', [
  CoverSlideSchema,
  ObjectiveSlideSchema,
  GlossarySlideSchema,
  AnatomySlideSchema,
  UseCaseMapSlideSchema,
  UseCaseSlideSchema,
  BehaviorSlideSchema,
  DoDontSlideSchema,
  WordingSlideSchema,
  ContactSlideSchema,
])

export const GuidelineSchema = z.object({
  title: z.string(),
  team: z.string(),
  version: z.string(),
  slides: z.array(SlideSchema),
})

export type GuidelineOutput = z.infer<typeof GuidelineSchema>

// Tool definition for Anthropic function calling
export const GENERATE_GUIDELINE_TOOL = {
  name: 'generate_guideline',
  description:
    'Generate a complete guideline structure once enough information has been gathered from the designer.',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: { type: 'string', description: 'Name of the component or screen' },
      team: { type: 'string', description: 'Team name (e.g. CCAP, PX)' },
      version: { type: 'string', description: 'Version string (e.g. V1 · 2026)' },
      slides: {
        type: 'array',
        description: 'Ordered list of slides for the guideline',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: [
                'cover',
                'objective',
                'glossary',
                'anatomy',
                'use_case_map',
                'use_case',
                'behavior',
                'do_dont',
                'wording',
                'contact',
              ],
            },
          },
          required: ['type'],
        },
      },
    },
    required: ['title', 'team', 'version', 'slides'],
  },
}

import Anthropic from '@anthropic-ai/sdk'

export const config = { runtime: 'edge' }

// Fix #11 — restrict CORS to Figma plugin origins only
const ALLOWED_ORIGINS = [
  'https://www.figma.com',
  'null', // Figma plugin iframe has null origin
]

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : 'null'
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Anthropic-Key',
  }
}

function buildSystemPrompt(figmaContext: string): string {
  return `You are a UX Documentation Specialist at Mercado Pago, expert in creating complete guidelines for leadership and stakeholders following the Andes X design system.

${figmaContext ? `You have already read the designer's Figma files. Here is the extracted content:\n\n<figma_content>\n${figmaContext}\n</figma_content>\n\nUse this content as the primary source for generating the guideline. Only ask questions about information NOT clearly present in the Figma content.` : ''}

## Your process

1. Greet briefly and confirm what you found in the files (if context provided).
2. Ask **2–4 focused questions** — one or two at a time — to fill gaps not covered by the Figma content:
   - Countries/sites this applies to (MLB 🇧🇷, MLA 🇦🇷, MLM 🇲🇽)
   - Team name and version
   - Any use cases or behaviors NOT visible in the Figma file
   - Any specific wording/error rules
   - Do's and Don'ts the designer wants to document
3. When you have enough information (usually after 2–4 exchanges), call \`generate_guideline\`.
4. If the designer says "gerar", "generate", "pronto" or similar → generate immediately.

## Guideline structure (always include all relevant sections)

- **cover**: title, subtitle (what it is in one line), team, version
- **objective**: what this component is, why it exists, who owns it
- **glossary**: all key terms used in the document (extract from Figma content when possible)
- **anatomy**: numbered list of components (required vs optional), spacing specs note
- **use_case_map**: table — which components appear in which use cases
- **use_case**: one slide per use case (with countries, clear description from Figma, component list)
- **behavior**: one slide per behavior category (states, currency, breakpoints, visibility, helper, anticipo, thumbnail)
- **do_dont**: concrete rules extracted from the design + the designer's answers
- **wording**: error messages per country with emoji flags (if applicable)
- **contact**: slack channel and useful links

## Content quality rules

- Extract real content from <figma_content> — do NOT invent placeholder text
- For anatomy components, use the actual names from the Figma file
- For use cases, use the actual case names found in the file (PAGAMENTO PIX, PRESETS, etc.)
- For behavior rows, use: { label: "Estado zero", value: "Campo vazio, cursor posicionado no início" }
- For wording, always include country variants with flags
- For do_dont, make rules specific and actionable (not generic)
- Image placeholders: add a note field "imageNote" to slides that need mockups

## Language

Respond in the same language the designer uses (Portuguese or Spanish). Keep tone friendly and professional.`
}

const GENERATE_GUIDELINE_TOOL: Anthropic.Tool = {
  name: 'generate_guideline',
  description: 'Generate a complete guideline structure once enough information has been gathered.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Component/screen name' },
      team: { type: 'string', description: 'Team name (e.g. CCAP, PX)' },
      version: { type: 'string', description: 'Version (e.g. V1 · 2026)' },
      slides: {
        type: 'array',
        description: 'Complete ordered list of slides',
        items: {
          type: 'object',
          description: 'A slide. Shape varies by type.',
          properties: {
            type: {
              type: 'string',
              enum: ['cover','objective','glossary','anatomy','use_case_map','use_case','behavior','do_dont','wording','contact'],
            },
          },
          required: ['type'],
          additionalProperties: true,
        },
      },
    },
    required: ['title', 'team', 'version', 'slides'],
  },
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(req) })
  }

  // Access code sent by plugin — validate against env var
  const accessCode = req.headers.get('X-Anthropic-Key') ?? ''
  const validCode = process.env.ACCESS_CODE
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Backend não configurado. Fale com o admin.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (validCode && accessCode !== validCode) {
    return new Response(JSON.stringify({ error: 'Código de acesso inválido. Verifique com o admin da equipe.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { messages, figmaContext = '' } = await req.json() as {
    messages: Anthropic.MessageParam[]
    figmaContext?: string
  }

  const client = new Anthropic({ apiKey })

  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 8096,
    system: buildSystemPrompt(figmaContext),
    tools: [GENERATE_GUIDELINE_TOOL],
    messages,
  })

  const encoder = new TextEncoder()

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Stream error'
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`))
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      ...corsHeaders(req),
    },
  })
}

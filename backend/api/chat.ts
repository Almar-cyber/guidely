import Anthropic from '@anthropic-ai/sdk'

export const config = { runtime: 'edge' }

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Anthropic-Key',
  }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  })
}

function extractTextFromMessageContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content
    .map((block) => {
      if (!block || typeof block !== 'object') return ''
      const maybeText = (block as { text?: unknown }).text
      return typeof maybeText === 'string' ? maybeText : ''
    })
    .join(' ')
    .trim()
}

function shouldForceGuidelineTool(messages: Anthropic.MessageParam[]): boolean {
  const lastUser = [...messages]
    .reverse()
    .find((msg) => msg.role === 'user')

  if (!lastUser) return false

  const text = extractTextFromMessageContent((lastUser as { content?: unknown }).content).toLowerCase()
  if (!text) return false

  const explicitNegative = /\b(?:não|nao|not)\b[^.!?\n]{0,24}\b(?:gerar|gere|generate|finalizar|concluir|criar)\b/i
  if (explicitNegative.test(text)) return false

  return /(\bgerar\b|\bgere\b|\bgenerate\b|\bpronto\b|\bpode gerar\b|\bpode criar\b|\bgera agora\b|\bfinalizar\b|\bconcluir\b)/i.test(text)
}

const MAX_CONTEXT_CHARS = 70000
const MAX_MESSAGES = 16
const MAX_MESSAGE_TEXT_CHARS = 5000

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars - 1)}…`
}

function compactFigmaContext(context: string): string {
  if (context.length <= MAX_CONTEXT_CHARS) return context

  const headSize = Math.floor(MAX_CONTEXT_CHARS * 0.78)
  const tailSize = Math.floor(MAX_CONTEXT_CHARS * 0.16)
  const head = context.slice(0, headSize)
  const tail = context.slice(-tailSize)

  return `${head}\n\n[... contexto resumido automaticamente para evitar erro por payload grande ...]\n\n${tail}`
}

function compactMessageContent(content: Anthropic.MessageParam['content']): Anthropic.MessageParam['content'] {
  if (typeof content === 'string') {
    return truncateText(content, MAX_MESSAGE_TEXT_CHARS)
  }

  if (!Array.isArray(content)) return content

  return content.map((block) => {
    if (block && typeof block === 'object' && 'text' in block && typeof block.text === 'string') {
      return {
        ...block,
        text: truncateText(block.text, MAX_MESSAGE_TEXT_CHARS),
      }
    }

    return block
  })
}

function compactMessages(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  const sliced = messages.length > MAX_MESSAGES
    ? [messages[0], ...messages.slice(-(MAX_MESSAGES - 1))]
    : messages

  return sliced.map((msg) => ({
    ...msg,
    content: compactMessageContent(msg.content),
  }))
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

## Quick reply options (IMPORTANT)

When asking a question that has **predefined options** (yes/no, choice between values, select countries, etc.), append this tag at the very end of your message:

<options>["Option A", "Option B", "Option C"]</options>

Rules:
- Maximum 4 options
- Short labels (2–5 words each)
- Only for closed questions — not for open-ended ones
- Always in the same language as the conversation
- Examples: countries (["MLB 🇧🇷", "MLA 🇦🇷", "MLM 🇲🇽", "Todos"]), yes/no (["Sim, inclui", "Não, coming soon"]), versions (["V1", "Coming soon"])

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
  description: 'Generate a complete guideline structure once enough information has been gathered. IMPORTANT: You MUST call this tool to generate the guideline — do NOT return the JSON as text.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Component/screen name' },
      team: { type: 'string', description: 'Team name (e.g. CCAP, PX)' },
      version: { type: 'string', description: 'Version (e.g. V1 · 2026)' },
      slides: {
        type: 'array',
        description: 'Complete ordered list of slides. Each slide must include ALL required fields for its type.',
        items: {
          oneOf: [
            {
              type: 'object',
              description: 'Cover slide',
              properties: {
                type: { type: 'string', const: 'cover' },
                title: { type: 'string', description: 'Main title' },
                subtitle: { type: 'string', description: 'One-line description' },
                team: { type: 'string' },
                version: { type: 'string' },
              },
              required: ['type', 'title', 'subtitle', 'team', 'version'],
            },
            {
              type: 'object',
              description: 'Objective slide',
              properties: {
                type: { type: 'string', const: 'objective' },
                body: { type: 'string', description: 'Full objective text' },
              },
              required: ['type', 'body'],
            },
            {
              type: 'object',
              description: 'Glossary slide',
              properties: {
                type: { type: 'string', const: 'glossary' },
                terms: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { term: { type: 'string' }, definition: { type: 'string' } },
                    required: ['term', 'definition'],
                  },
                },
              },
              required: ['type', 'terms'],
            },
            {
              type: 'object',
              description: 'Anatomy slide — numbered component list',
              properties: {
                type: { type: 'string', const: 'anatomy' },
                title: { type: 'string' },
                body: { type: 'string' },
                components: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { index: { type: 'number' }, name: { type: 'string' }, required: { type: 'boolean' } },
                    required: ['index', 'name', 'required'],
                  },
                },
                note: { type: 'string' },
                imageNote: { type: 'string', description: 'Instruction for which mockup screenshot to insert' },
              },
              required: ['type', 'title', 'components'],
            },
            {
              type: 'object',
              description: 'Use-case map — table of components × cases',
              properties: {
                type: { type: 'string', const: 'use_case_map' },
                title: { type: 'string' },
                caseNames: { type: 'array', items: { type: 'string' }, description: 'Column headers (case names)' },
                rows: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      component: { type: 'string' },
                      cases: { type: 'object', description: 'Map of caseName → boolean' },
                    },
                    required: ['component', 'cases'],
                  },
                },
              },
              required: ['type', 'title', 'caseNames', 'rows'],
            },
            {
              type: 'object',
              description: 'Individual use-case slide',
              properties: {
                type: { type: 'string', const: 'use_case' },
                title: { type: 'string' },
                countries: { type: 'array', items: { type: 'string' } },
                body: { type: 'string' },
                components: { type: 'array', items: { type: 'string' } },
                imageNote: { type: 'string' },
              },
              required: ['type', 'title', 'body', 'components'],
            },
            {
              type: 'object',
              description: 'Behavior slide — state/condition table',
              properties: {
                type: { type: 'string', const: 'behavior' },
                title: { type: 'string' },
                description: { type: 'string' },
                rows: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { label: { type: 'string' }, value: { type: 'string' } },
                    required: ['label', 'value'],
                  },
                },
                imageNote: { type: 'string' },
              },
              required: ['type', 'title', 'rows'],
            },
            {
              type: 'object',
              description: 'Do/Don\'t slide',
              properties: {
                type: { type: 'string', const: 'do_dont' },
                title: { type: 'string' },
                do: { type: 'array', items: { type: 'string' }, description: 'List of recommended practices' },
                dont: { type: 'array', items: { type: 'string' }, description: 'List of practices to avoid' },
              },
              required: ['type', 'title', 'do', 'dont'],
            },
            {
              type: 'object',
              description: 'Wording slide — error messages per country',
              properties: {
                type: { type: 'string', const: 'wording' },
                title: { type: 'string' },
                errors: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      objective: { type: 'string' },
                      variants: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: { country: { type: 'string' }, flag: { type: 'string' }, text: { type: 'string' } },
                          required: ['country', 'flag', 'text'],
                        },
                      },
                      rationale: { type: 'string' },
                    },
                    required: ['name', 'objective', 'variants'],
                  },
                },
              },
              required: ['type', 'title', 'errors'],
            },
            {
              type: 'object',
              description: 'Contact slide',
              properties: {
                type: { type: 'string', const: 'contact' },
                channel: { type: 'string', description: 'Slack channel name' },
                links: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { label: { type: 'string' }, url: { type: 'string' } },
                    required: ['label', 'url'],
                  },
                },
              },
              required: ['type', 'channel', 'links'],
            },
          ],
        },
      },
    },
    required: ['title', 'team', 'version', 'slides'],
  },
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() })
  }

  try {
    // Token sent by plugin — can be:
    // 1. OAuth access token from claude.ai (starts with sk-ant-oat or similar)
    // 2. Team access code validated against env var
    const userToken = req.headers.get('X-Anthropic-Key') ?? ''
    const accessCode = process.env.ACCESS_CODE
    const backendKey = process.env.ANTHROPIC_API_KEY

    // If user sent a valid Anthropic key directly, use it; otherwise use backend key + validate access code
    const isUserKey = userToken.startsWith('sk-ant-') && userToken.length >= 40
    const apiKey = isUserKey ? userToken : backendKey

    if (!apiKey) {
      return jsonResponse({ error: 'Backend não configurado. Fale com o admin.' }, 500)
    }

    if (!isUserKey && accessCode && userToken !== accessCode) {
      return jsonResponse({ error: 'Código de acesso inválido. Verifique com o admin da equipe.' }, 401)
    }

    const { messages, figmaContext = '' } = await req.json() as {
      messages: Anthropic.MessageParam[]
      figmaContext?: string
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return jsonResponse({ error: 'Payload inválido: messages é obrigatório.' }, 400)
    }

    const compactedMessages = compactMessages(messages)
    const compactedFigmaContext = compactFigmaContext(figmaContext)
    const forceGuidelineTool = shouldForceGuidelineTool(compactedMessages)
    const client = new Anthropic({ apiKey })

    let stream: Awaited<ReturnType<typeof client.messages.stream>>
    try {
      stream = await client.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 8096,
        system: buildSystemPrompt(compactedFigmaContext),
        tools: [GENERATE_GUIDELINE_TOOL],
        tool_choice: forceGuidelineTool
          ? { type: 'tool', name: 'generate_guideline' }
          : { type: 'auto' },
        messages: compactedMessages,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao iniciar stream com Claude.'
      return jsonResponse({ error: message }, 502)
    }

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
        'Connection': 'keep-alive',
        ...corsHeaders(),
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro inesperado no endpoint de chat.'
    return jsonResponse({ error: message }, 500)
  }
}

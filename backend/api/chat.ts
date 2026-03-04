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

const MAX_CONTEXT_CHARS = 50000
const MAX_CONTEXT_CHARS_FOR_FORCED_GENERATION = 28000  // smaller = faster generation = fits in Vercel 30s limit
const MAX_MESSAGES = 16
const MAX_MESSAGES_FOR_FORCED_GENERATION = 10
const MAX_MESSAGE_TEXT_CHARS = 5000
const STREAM_INIT_TIMEOUT_MS = 90000

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars - 1)}…`
}

function compactFigmaContext(context: string, maxChars = MAX_CONTEXT_CHARS): string {
  if (context.length <= maxChars) return context

  const headSize = Math.floor(maxChars * 0.78)
  const tailSize = Math.floor(maxChars * 0.16)
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

function compactMessages(messages: Anthropic.MessageParam[], maxMessages = MAX_MESSAGES): Anthropic.MessageParam[] {
  const sliced = messages.length > maxMessages
    ? [messages[0], ...messages.slice(-(maxMessages - 1))]
    : messages

  return sliced.map((msg) => ({
    ...msg,
    content: compactMessageContent(msg.content),
  }))
}

function buildSystemPrompt(figmaContext: string, forceGenerationNow: boolean): string {
  return `You are a UX Documentation Specialist at Mercado Pago, expert in creating complete guidelines for leadership and stakeholders following the Andes X design system.

${figmaContext ? `You have already read the designer's Figma files. Here is the extracted content:\n\n<figma_content>\n${figmaContext}\n</figma_content>\n\nUse this content as the primary source for generating the guideline. Only ask questions about information NOT clearly present in the Figma content.` : ''}

${forceGenerationNow ? `## Generation mode (strict)

The user explicitly asked to generate now.

- Call \`generate_guideline\` in this response.
- Do NOT ask additional questions.
- **IMPORTANT: Keep the total number of slides under 15.** Merge similar slides if needed.
- Keep each slide's content concise — max 3-4 items per list, max 2 sentences per body.
- If any detail is missing, use "A confirmar" placeholders and continue.
- Prioritize completeness over verbosity.
` : ''}

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

## Guideline structure — padrão CHO Mercado Pago

Seguir o padrão visual e de conteúdo do CHO PX Guideline (referência interna do Mercado Pago).
Sempre incluir todas as seções relevantes, nessa ordem:

### 1. cover
- title: nome do componente/tela
- subtitle: uma frase descritiva ("Tela de entrada de valor de transações")
- team: time dono (ex: "CCAP / PX")
- version: versão e mês/ano (ex: "V1 · MAR 2026")

### 2. objective
- body: 2-3 parágrafos cobrindo:
  - O que é o componente/tela
  - Por que existe / qual problema resolve
  - Quem é owner (time responsável)
  - Contexto de uso (onde aparece no produto)

### 3. glossary
- Extrair do Figma: 8-12 termos domain-specific usados nos slides
- Incluir siglas técnicas reais: AM, TCMP, CHO, CDU, RyC, FS, etc.
- Cada definição: 1 frase clara, sem jargão desnecessário
- Formato: { term: "TCMP", definition: "Tarjeta de crédito Mercado Pago" }

### 4. anatomy
- title: "Estrutura base" ou "Anatomía"
- body: breve descrição de como a estrutura funciona
- components: lista numerada COM distinção required/optional
  - Usar nomes reais do Figma (Header, Amount Field, Helper, Anticipo, etc.)
  - Separar "obrigatório" de "optativo"
- note: specs de espaçamento se disponíveis no Figma
- imageNote: "Screenshot anotado mostrando os [N] componentes numerados e suas posições relativas"

### 5. use_case_map
- title: "Elementos de cada caso de uso"
- caseNames: nomes reais dos CDUs encontrados no Figma
- rows: cada componente (Header, Amount Field, etc.) com boolean por CDU
- Incluir TODOS os CDUs identificados no Figma, não inventar

### 6. use_case (um slide por CDU)
- title: nome em CAPS como no Figma (ex: "PAGAMENTO PIX", "PRESETS")
- countries: array com flags dos países aplicáveis (["MLB 🇧🇷"], ["MLA 🇦🇷"], etc.)
- body: descrição do que é exibido nesse CDU, seguindo este padrão:
  "Nesse caso de uso, exibimos:
  - [componente]: [o que faz]
  - [componente]: [o que faz]"
- components: lista dos componentes usados (ex: ["Header", "Amount Field", "Helper", "CTA"])
- imageNote: "Inserir screenshot da tela do CDU [nome] em estado [default/error]"

### 7. behavior (um slide por categoria)
- Categorias a incluir quando relevantes:
  - Estados (Estado zero, Monto cargado, Focus, Sufixo, Erro)
  - Currency (Pesos, Reais, Dólares — marcando qual site usa qual)
  - Visibilidade (seguir preferência da home page)
  - Breakpoints tipográficos (por número de dígitos)
  - Helper (com saldo / sem saldo)
  - Anticipo (Caution, Informative, Positive)
  - Thumbnail (com imagem, com ícone genérico)
- rows format: { label: "Estado zero", value: "Campo vazio, cursor piscando. CTA desabilitada." }
- description: contexto de quando/por que esse comportamento existe
- imageNote: "Inserir screenshots dos [N] estados lado a lado"

### 8. do_dont
- title: tema específico (ex: "Uso do Anticipo", "Hierarquia visual")
- do: array de regras positivas específicas ao componente (não genéricas)
  - ✅ Usar Anticipo Caution quando saldo é insuficiente para o valor inserido
- dont: array de regras negativas com impacto claro
  - ❌ Nunca mostrar dois Anticipos ao mesmo tempo no mesmo estado
- Mínimo 3 regras por lado, máximo 5

### 9. wording (quando aplicável)
- title: "Keys wording default" ou "Erros — Wording padrão"
- Para cada mensagem de erro/sucesso:
  - name: nome do tipo (ex: "Erro: Monto máximo superado")
  - objective: "Que o usuário ingresse um valor menor ao máximo possível"
  - variants: por país com flag emoji
    - { country: "MLA", flag: "🇦🇷", text: "Ingresa un monto menor a {$ X}." }
    - { country: "MLB", flag: "🇧🇷", text: "Insira um valor menor que {R$ X}." }
  - rationale: (opcional) justificativa da escolha de wording

### 10. contact
- channel: canal de Slack para dúvidas (ex: "#soporteux_cho_px")
- links: array de links relevantes
  - Figma do handoff
  - Documentação do design system (Andes X)
  - Banco de logos/assets relevantes

## Regras de qualidade de conteúdo

1. **Extrair do Figma**: Use APENAS conteúdo real da <figma_content> — nunca invente nomes de CDUs, componentes ou comportamentos
2. **Especificidade**: Cada descrição deve ser específica ao componente documentado, não genérica
3. **Padrão CHO**: Tom didático, contextual e prático — como um colega explicando para outro designer
4. **Países com flags**: Sempre marcar aplicabilidade geográfica com 🇧🇷 🇦🇷 🇲🇽
5. **imageNote obrigatório**: Todo slide de anatomy, use_case e behavior DEVE ter imageNote descrevendo exatamente o que inserir
6. **Nomenclatura consistente**: Usar os mesmos nomes do Figma e do design system — não renomear
7. **Fluxo lógico**: Os slides devem contar uma história: do geral (anatomia) para o específico (CDUs) para o técnico (comportamentos)
8. **Completude vs. velocidade**: Melhor gerar com "A confirmar" do que deixar campo vazio — stakeholders precisam ver a estrutura completa

## Checklist pré-geração

Antes de chamar generate_guideline, verificar:
- ✓ Glossário tem 6+ termos domain-specific reais
- ✓ Anatomy tem 4+ componentes com required/optional
- ✓ Pelo menos 2 use_case slides com countries
- ✓ Pelo menos 1 behavior slide com estados
- ✓ Do/dont com 3+ regras específicas
- ✓ Team name e version definidos

## Language

Responder no idioma do designer (Português ou Espanhol). Tom: direto, didático, profissional.`
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

    const { messages, figmaContext = '', requestId } = await req.json() as {
      messages: Anthropic.MessageParam[]
      figmaContext?: string
      requestId?: string
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return jsonResponse({ error: 'Payload inválido: messages é obrigatório.' }, 400)
    }

    const forceGuidelineTool = shouldForceGuidelineTool(messages)
    const compactedMessages = compactMessages(
      messages,
      forceGuidelineTool ? MAX_MESSAGES_FOR_FORCED_GENERATION : MAX_MESSAGES
    )
    const compactedFigmaContext = compactFigmaContext(
      figmaContext,
      forceGuidelineTool ? MAX_CONTEXT_CHARS_FOR_FORCED_GENERATION : MAX_CONTEXT_CHARS
    )
    const traceId = typeof requestId === 'string' && requestId.trim()
      ? requestId.trim()
      : `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const client = new Anthropic({ apiKey })

    const encoder = new TextEncoder()

    const readable = new ReadableStream({
      async start(controller) {
        const emitJson = (payload: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
        }

        let initTimeoutId: ReturnType<typeof setTimeout> | null = null

        try {
          emitJson({ type: 'meta', requestId: traceId, stage: 'accepted' })

          const initTimeoutPromise = new Promise<never>((_, reject) => {
            initTimeoutId = setTimeout(() => {
              reject(new Error(`Timeout ao iniciar stream (${Math.round(STREAM_INIT_TIMEOUT_MS / 1000)}s).`))
            }, STREAM_INIT_TIMEOUT_MS)
          })

          const stream = await Promise.race([
            client.messages.stream({
              model: 'claude-sonnet-4-6',
              max_tokens: 8096,
              system: buildSystemPrompt(compactedFigmaContext, forceGuidelineTool),
              tools: [GENERATE_GUIDELINE_TOOL],
              tool_choice: forceGuidelineTool
                ? { type: 'tool', name: 'generate_guideline' }
                : { type: 'auto' },
              messages: compactedMessages,
            }),
            initTimeoutPromise,
          ]) as Awaited<ReturnType<typeof client.messages.stream>>

          if (initTimeoutId) {
            clearTimeout(initTimeoutId)
            initTimeoutId = null
          }

          emitJson({ type: 'meta', requestId: traceId, stage: 'streaming' })

          for await (const event of stream) {
            emitJson(event)
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (err) {
          if (initTimeoutId) clearTimeout(initTimeoutId)
          const message = err instanceof Error ? err.message : 'Stream error'
          emitJson({ error: { message }, requestId: traceId })
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

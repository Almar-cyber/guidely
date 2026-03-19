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

function shouldForceGuidelineTool(messages: Anthropic.MessageParam[], isAdjustMode: boolean): boolean {
  const lastUser = [...messages]
    .reverse()
    .find((msg) => msg.role === 'user')

  if (!lastUser) return false

  const text = extractTextFromMessageContent((lastUser as { content?: unknown }).content).toLowerCase()
  if (!text) return false

  const explicitNegative = /\b(?:não|nao|not)\b[^.!?\n]{0,24}\b(?:gerar|gere|generate|finalizar|concluir|criar)\b/i
  if (explicitNegative.test(text)) return false

  // Initial audience-based generation
  if (/gere o guideline completo agora/i.test(text)) return true

  // Explicit generation keywords
  if (/(\bgerar\b|\bgere\b|\bgenerate\b|\bpronto\b|\bpode gerar\b|\bpode criar\b|\bgera agora\b|\bfinalizar\b|\bconcluir\b|\bgenerar\b|\bgenera\b|\blisto\b|\bgenera ahora\b|\bcrear slides\b|\bpuede generar\b)\b/i.test(text)) return true

  // In adjustment mode, any modification request should force re-generation
  if (isAdjustMode) {
    const adjustKeywords = /\b(adiciona|adicion|troca|muda|mude|coloca|coloque|remove|retira|tira|altera|alter|modifica|edita|inclui|exclui|acrescenta|adicione|tire|remov|corrig|expande|resumo|simplif|reescrev|renomei|renomea|reorden|reorganiz|apaga|deleta|cambia|cambi|elimina|agrega|añade|quita|actualiza|renombra|reorganiza|amplía|amplía|reduce|reescrib|borra|agreg|añad)\b/i
    if (adjustKeywords.test(text)) return true
  }

  return false
}

const MAX_CONTEXT_CHARS = 180000
const MAX_CONTEXT_CHARS_FOR_FORCED_GENERATION = 100000
const MAX_MESSAGES = 16
const MAX_MESSAGES_FOR_FORCED_GENERATION = 10
const MAX_MESSAGE_TEXT_CHARS = 5000
const STREAM_INIT_TIMEOUT_MS = 90000

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const sliced = `${text.slice(0, maxChars - 1)}…`
  // Fix headless surrogate pairs that cause Anthropic API to crash with 400 "Error"
  return typeof (sliced as any).toWellFormed === 'function' ? (sliced as any).toWellFormed() : sliced.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|([^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/g, '')
}

function compactFigmaContext(context: string, maxChars = MAX_CONTEXT_CHARS): string {
  if (context.length <= maxChars) return context

  const headSize = Math.floor(maxChars * 0.78)
  const tailSize = Math.floor(maxChars * 0.16)
  const head = context.slice(0, headSize)
  const tail = context.slice(-tailSize)

  const combined = `${head}\n\n[... contexto resumido automaticamente para evitar erro por payload grande ...]\n\n${tail}`
  // Clean surrogate pairs to prevent Anthropic failing
  return typeof (combined as any).toWellFormed === 'function' ? (combined as any).toWellFormed() : combined.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|([^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/g, '')
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
    : [...messages]

  // Ensure strict user/assistant alternation after slicing
  const sanitized: Anthropic.MessageParam[] = []
  for (const msg of sliced) {
    const prev = sanitized[sanitized.length - 1]
    if (prev && prev.role === msg.role) {
      // Merge consecutive same-role messages
      const prevText = typeof prev.content === 'string' ? prev.content : extractTextFromMessageContent(prev.content)
      const curText = typeof msg.content === 'string' ? msg.content : extractTextFromMessageContent(msg.content)
      prev.content = prevText + '\n\n' + curText
    } else {
      sanitized.push({ ...msg })
    }
  }

  // API requires first message to be 'user'
  if (sanitized.length > 0 && sanitized[0].role !== 'user') {
    sanitized.unshift({ role: 'user', content: '(contexto anterior resumido)' })
  }

  // API requires last message to be 'user'
  if (sanitized.length > 0 && sanitized[sanitized.length - 1].role !== 'user') {
    sanitized.push({ role: 'user', content: '(continuar)' })
  }

  // Drop empty content
  return sanitized
    .filter((msg) => {
      const text = typeof msg.content === 'string' ? msg.content : extractTextFromMessageContent(msg.content)
      return text.trim().length > 0
    })
    .map((msg) => ({
      ...msg,
      content: compactMessageContent(msg.content),
    }))
}

const MAX_GUIDELINE_CHARS = 60000

function buildSystemPrompt(figmaContext: string, forceGenerationNow: boolean, currentGuideline?: unknown, language: 'pt' | 'es' = 'pt'): string {
  let adjustSection = ''
  if (currentGuideline) {
    let guidelineJson = JSON.stringify(currentGuideline, null, 2)
    if (guidelineJson.length > MAX_GUIDELINE_CHARS) {
      guidelineJson = guidelineJson.slice(0, MAX_GUIDELINE_CHARS) + '\n... [truncado para manter estabilidade]'
    }
    adjustSection = `\n## Current guideline (Adjust & Pair Designer Mode)\n\nThe designer has already generated the following guideline. You are now acting as a proactive Pair Designer.\n\n<current_guideline>\n${guidelineJson}\n</current_guideline>\n`
  }
  return `You are a UX Documentation Specialist at Mercado Pago, expert in creating complete guidelines for leadership and stakeholders following the Andes X design system.

${figmaContext ? `You have already read the designer's Figma files. Here is the extracted content:\n\n<figma_content>\n${figmaContext}\n</figma_content>\n\nUse this content as the primary source for generating the guideline. Only ask questions about information NOT clearly present in the Figma content.` : ''}

${adjustSection}

${forceGenerationNow ? `## Generation mode (strict)

The user asked to generate now. Call \`generate_guideline\` immediately — do NOT ask any questions.

- **Respect the audience slide rules above** (prioritize/omit slides exactly as instructed for the selected audience).
- **Fill ALL fields completely** — no "A confirmar", no empty strings. Infer from Figma context when explicit data is missing.
- For each slide type, populate EVERY optional field that adds value: description, imageNote, note, rationale, variants, countries, bullets, specs, links.
- Lists: as many items as needed — every CDU, every behavior state, every wording variant per country.
- "imageNote" is mandatory on anatomy, use_case, behavior, before_after, microinteraction slides.
- "mockupFrameId" MUST be set on anatomy, use_case, behavior, before_after, microinteraction, overview, structure slides when a matching frame ID appears in "## Frames disponíveis para mockupFrameId". Match by frame name to the slide topic.
- Wording slides: include variants for each applicable country with exact UI copy strings.
- Behavior slides: enumerate ALL states found in Figma (zero, loaded, focus, error, disabled, etc.).
- Slide count: follow the audience recommendation (stakeholders: 10–14 · designers: 15–25 · devs: 12–18). If no audience, aim for 12–20.
- **index slide is MANDATORY** — always include it after objective so readers can navigate the guideline quickly.
` : ''}

## SLIDES OBRIGATÓRIOS — nunca omitir

These slides MUST always appear in every generated guideline, regardless of audience:

| Slide | Posição | Motivo |
|-------|---------|--------|
| **cover** | 1º slide | Identificação do guideline |
| **index** | logo após objective | Navegação rápida — leitores precisam encontrar seções sem ler tudo |
| **contact** | último slide | Referência para dúvidas |

NEVER omit \`index\`. Even if the guideline has few slides (8–10), the index is required. It is NOT optional and NOT counted against the slide budget.

## Your process

1. **Ask 1–2 focused questions** to fill critical gaps (e.g. countries, target audience, team name). Only ask what is NOT clearly present in the Figma content.
2. **Generate** when the designer answers or says "gerar", "generate", "pronto" or similar.

## Adjusting and Pair Designing

When the user asks to adjust the guideline after it was generated, DO NOT just blindly generate it right away unless explicitly asked to just "do it". Instead, act as a true Pair Designer:
1. **Analyze the request**: How does it impact the overall flow? Are there missing edge cases (empty states, loading, errors, edge cases) from the Figma context that the designer forgot to document?
2. **Validate & Suggest**: Before calling \`generate_guideline\`, reply to the user highlighting what you will change AND proactively suggest 1 or 2 quick improvements to make the presentation bullet-proof (e.g., "I will add the handoff slide. While I'm at it, I noticed we don't have a slide for the error state of the amount field. Should I add it too?"). 
3. **Conversational Feedback**: Ask closed/quick questions for them to agree. DO NOT call the generation tool until you agree on the scope.
4. **Generate**: When the user agrees or pushes just for the generation, call \`generate_guideline\` with the full updated structure.

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

### 11. before_after (quando há mudança de versão)
- Usar quando o componente tem uma versão anterior conhecida (ex: Andes Legacy → Andes X)
- before: { label: "Antes (versão anterior)", points: ["item 1", "item 2"] }
- after: { label: "Depois (nova versão)", points: ["item 1", "item 2"] }
- Máximo 4 points por coluna
- imageNote: "Screenshot lado a lado mostrando a diferença visual"

### 12. microinteraction (quando há animações documentadas)
- Usar quando o Figma documenta comportamentos de animação (cursor, transições, etc.)
- behaviors: array de { name, spec, trigger }
  - name: "Cursor piscando"
  - spec: "Alternância visível/invisível em loop. Duração: nativa do sistema."
  - trigger: "Ao focar o Amount Field"
- imageNote: "Inserir vídeo ou GIF do comportamento"

### 13. overview (Visión general — um slide por seção principal)
- Usar para introduzir cada grande seção antes de entrar nos detalhes
- sectionLabel: "1 · CHO en pasos" (mesmo padrão dos sections)
- title: "Visión general"
- description: 2-3 parágrafos explicando o contexto da seção
- bullets: pontos-chave resumidos
- links: links para sub-seções (ex: [{ label: "Listado de medios", arrow: true }])
- imageNote: "Inserir screenshot da tela principal desta seção"

### 14. structure (Estructura / Specs detalhados)
- Usar para documentar anatomia detalhada com specs de componentes
- sectionLabel: "Estructura · Medios · Tarea" (contexto)
- title: nome do componente/área
- description: breve descrição
- specs: array de specs detalhados com variantes por país
  - name: nome do spec (ex: "Título da tarea")
  - description: regra de conteúdo (ex: "Elige + cómo + {tarea del flujo}")
  - variants: [{ country: "MLB", flag: "🇧🇷", value: "Escolha como fazer seu Pix" }]
  - note: observação adicional (opcional)
- imageNote: "Inserir screenshot do componente com annotations"
- IMPORTANTE: gerar múltiplos slides structure quando há muitos specs

### 15. flow (Flows y lógicas)
- Usar para documentar fluxos de navegação e decision trees
- sectionLabel: "1 · CHO en pasos"
- title: "Flows y lógicas"
- description: contexto do fluxo
- steps: array de passos do fluxo em sequência
  - label: nome da tela/ação (ex: "Listado de medios")
  - type: "screen" | "decision" | "action"
  - note: descrição breve (opcional)
- branches: condições/ramificações do fluxo
  - condition: "SI" ou "NO" ou condição
  - target: para onde vai

### 16. handoff (links e specs de implementação)
- Usar no final de cada seção para links de Figma e specs
- title: "Handoff MLB 🇧🇷" ou "Handoff MLA 🇦🇷"
- country: tag do país
- figmaLinks: [{ label: "Protótipo Figma", url: "..." }]
- specs: [{ label: "Owner", value: "PX Team" }]

### 17. index (OBRIGATÓRIO — sempre incluir logo após o objective)
- Posicionar logo após o cover
- **Máximo 5 seções** — o slide tem altura fixa, mais de 5 estoura o limite visual
- Última seção deve ser sempre "Boas práticas e wording" (ou similar) — não incluir "Contato" no índice
- sections: cada seção principal do guideline com seus sub-itens
- Exemplo:
  ${'```'}
  { number: 1, title: "Estrutura base", items: ["Anatomia →", "Specs →"] }
  { number: 2, title: "Casos de uso", items: ["Mapa de CDUs →", "Pix →", "Presets →"] }
  ${'```'}

### 18. section (divisor de seção — slide amarelo com número + título grande)
- USAR OBRIGATORIAMENTE antes de cada grande seção do guideline (ex: antes de "Casos de uso", antes de "Comportamentos")
- number: "01", "02" etc (string com zero à esquerda)
- title: nome da seção (ex: "CHO em passos", "Casos de uso")
- subtitle: sub-tema da seção (ex: "Visão geral", "Anatomia")
- bullets: array com os sub-tópicos navegáveis (ex: ["Visão geral →", "Anatomia →", "Flows →"])
- Exemplo: { type: "section", number: "01", title: "Estrutura base", subtitle: "Visão geral", bullets: ["Anatomia →", "Specs →"] }

### 19. structure_dual (estrutura de tela com 2 variações lado a lado)
- USAR quando há 2 variações visuais de uma mesma tela (ex: "Caso típico" vs "Com scroll", "Sem ticket" vs "Com ticket")
- title: título do slide (ex: "Estrutura do Listado de Medios")
- subtitle: subtítulo opcional
- leftLabel: label da variação esquerda (ex: "Caso típico")
- rightLabel: label da variação direita (ex: "Caso com scroll")
- leftAnnotations: array { name: string, description: string } com os componentes anotados à esquerda
- rightAnnotations: array { name: string, description: string } com os componentes anotados à direita

### 20. component_focus (foco em um componente específico — slide cinza com breadcrumb)
- USAR para documentar um componente individual em profundidade (tarea, header, CTA, etc.)
- breadcrumb: array de strings com o caminho (ex: ["Estrutura", "Listado de medios", "Header"])
- screenName: nome da tela (ex: "Listado de medios")
- componentTitle: nome e número do componente (ex: "1. Tarea (Título)")
- description: o que o componente faz
- annotation: { title: string, description: string } — regra de conteúdo/spec do componente
- highlightPosition: onde o componente aparece no mockup ("top" | "middle" | "bottom")
- Gerar um slide component_focus para cada componente principal identificado no Figma

## Regras visual-first — PRIORIDADE MÁXIMA

Slides são apresentações visuais, não documentos. **Imagem > texto sempre.**

| Campo | Limite estrito |
|-------|---------------|
| body / description | MAX 2-3 frases curtas ou 4 bullet points. NUNCA parágrafos longos. |
| behavior.rows | MAX 6 linhas por slide — crie um segundo slide behavior se precisar de mais |
| anatomy.components | MAX 8 componentes |
| do / dont | MAX 4 itens por coluna |
| glossary.terms total | MAX 12 termos (6 por tabela) |
| wording.errors | MAX 3 erros por slide — paginate se precisar |
| objective.body | MAX 4 frases — foque nos 3 pontos principais, não escreva um ensaio |

**imageNote é o elemento mais importante do slide:**
- Obrigatório em: anatomy, use_case, behavior, before_after, microinteraction, overview, structure
- Formato: ação + tela + estado — ex: "Screenshot da tela Pagamento PIX em estado de erro com Amount Field preenchido"
- O designer vai substituir o placeholder por este screenshot — seja preciso

**Quando houver imageNote, reduza o texto ao mínimo.** A imagem conta a história, o texto rotula.

## Regras de qualidade de conteúdo

1. **Extrair do Figma**: Use APENAS conteúdo real da <figma_content> — nunca invente nomes de CDUs, componentes ou comportamentos
2. **Especificidade**: Cada descrição deve ser específica ao componente documentado, não genérica
3. **Padrão CHO**: Tom didático, contextual e prático — como um colega explicando para outro designer
4. **Países com flags**: Sempre marcar aplicabilidade geográfica com 🇧🇷 🇦🇷 🇲🇽
5. **Nomenclatura consistente**: Usar os mesmos nomes do Figma e do design system — não renomear
6. **Fluxo lógico**: Os slides devem contar uma história: do geral (anatomia) para o específico (CDUs) para o técnico (comportamentos)

## Checklist pré-geração

Antes de chamar generate_guideline, verificar:
- ✓ Glossário tem 6+ termos domain-specific reais
- ✓ Anatomy tem 4+ componentes com required/optional
- ✓ Pelo menos 2 use_case slides com countries
- ✓ Pelo menos 1 behavior slide com estados
- ✓ Do/dont com 3+ regras específicas
- ✓ Team name e version definidos

## Language

${language === 'es'
  ? 'MANDATORY: All responses, questions, and generated slide content MUST be in SPANISH. Never use Portuguese. Tone: direct, didactic, professional.'
  : 'MANDATORY: All responses, questions, and generated slide content MUST be in PORTUGUESE (Brazilian). Never use Spanish. Tone: direct, didactic, professional.'
}`
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
        description: 'Complete ordered list of slides. Each slide is an object with a "type" field that determines which other fields are required. See the system prompt for the full specification of each slide type. Valid types: cover, objective, glossary, anatomy, use_case_map, use_case, behavior, do_dont, wording, contact, before_after, microinteraction, index, overview, structure, flow, handoff, section, structure_dual, component_focus.',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', description: 'Slide type identifier' },
          },
          required: ['type'],
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

    const { messages, figmaContext = '', requestId, currentGuideline, language = 'pt' } = await req.json() as {
      messages: Anthropic.MessageParam[]
      figmaContext?: string
      requestId?: string
      currentGuideline?: unknown  // guideline previously generated — injected as context in adjust mode
      language?: 'pt' | 'es'
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return jsonResponse({ error: 'Payload inválido: messages é obrigatório.' }, 400)
    }

    const isAdjustMode = Boolean(currentGuideline)
    const forceGuidelineTool = shouldForceGuidelineTool(messages, isAdjustMode)
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
              max_tokens: 24000,
              // thinking is incompatible with forced tool_choice — only enable when tool_choice is auto
              ...(!forceGuidelineTool ? { thinking: { type: 'enabled', budget_tokens: 8000 } } : {}),
              system: buildSystemPrompt(compactedFigmaContext, forceGuidelineTool, currentGuideline, language),
              tools: [GENERATE_GUIDELINE_TOOL],
              tool_choice: forceGuidelineTool
                ? { type: 'tool', name: 'generate_guideline' }
                : { type: 'auto' },
              messages: compactedMessages,
            } as Parameters<typeof client.messages.stream>[0]),
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
          
          let finalMessage = err instanceof Error ? err.message : 'Stream error'
          // Extract specific human-readable message from Anthropic API 4xx/5xx raw string
          if (finalMessage.match(/^[45]\d\d\s+\{/)) {
            try {
              const parsed = JSON.parse(finalMessage.replace(/^[45]\d\d\s+/, ''))
              if (parsed?.error?.message) {
                finalMessage = parsed.error.message
              }
            } catch (e) {
              // fallback to original if unparsable
            }
          }

          const isApiError = err && typeof err === 'object' && 'status' in err
          const status = isApiError ? (err as { status: number }).status : undefined
          const errorBody = isApiError && 'error' in err ? (err as { error: unknown }).error : undefined
          
          console.error('[chat] API error', { status, finalMessage, errorBody, requestId: traceId, messageCount: compactedMessages.length })
          emitJson({ error: { message: finalMessage, status, detail: errorBody }, requestId: traceId })
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

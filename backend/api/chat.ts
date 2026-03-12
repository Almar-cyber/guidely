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

const MAX_CONTEXT_CHARS = 180000
const MAX_CONTEXT_CHARS_FOR_FORCED_GENERATION = 100000
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

type Audience = 'stakeholders' | 'designers' | 'devs' | undefined

function buildAudienceSection(audience: Audience): string {
  if (!audience) return ''

  if (audience === 'stakeholders') {
    return `
## Audiência: Lideranças / Stakeholders

Você está gerando um guideline para LIDERANÇAS E STAKEHOLDERS. Adapte todo o conteúdo e as perguntas a esta audiência.

### Slides a PRIORIZAR:
- **cover** — título impactante, subtítulo que comunica o valor do componente
- **objective** — 3 parágrafos: o que é, por que existe (impacto no negócio), quem é dono
- **index** — visão geral do que será coberto (máx. 5 seções)
- **section** — divisores de seção obrigatórios para organização
- **anatomy** — simplificado: nomes dos componentes sem specs técnicas
- **use_case_map** — tabela geral de CDUs (quais casos existem)
- **1–2 use_case** — apenas os CDUs mais importantes e de maior impacto
- **do_dont** — boas práticas de negócio e de UX, não regras técnicas
- **before_after** — se houver evolução de versão (Andes Legacy → Andes X)
- **contact** — canal Slack e link do Figma

### Slides a OMITIR ou SIMPLIFICAR:
- behavior: incluir APENAS se o comportamento tiver impacto visível para o negócio (ex: estado de erro crítico)
- wording: omitir tabelas detalhadas; citar no máximo 1–2 frases de erro mais importantes
- microinteraction: omitir
- handoff: omitir
- structure / structure_dual / component_focus: omitir detalhes técnicos de specs

### Tom e linguagem:
- Executivo, direto, orientado a impacto de produto e negócio
- Foco no "o que é" e "por que existe" — não no "como implementar"
- Sem jargões técnicos de front-end ou design system
- Total recomendado: **10–14 slides**

### Perguntas a fazer ao designer:
- Qual o impacto de produto deste componente? (ex: está no fluxo de pagamento de X milhões de usuários)
- Há alguma mudança de versão a destacar (antes/depois)?
- Quais os 2–3 casos de uso mais importantes para a liderança entender?
`
  }

  if (audience === 'designers') {
    return `
## Audiência: Designers

Você está gerando um guideline para DESIGNERS. Inclua máximo de detalhe visual, de uso e de design system.

### Slides a PRIORIZAR (todos relevantes):
- **cover, objective, index, section, glossary** — estrutura completa
- **anatomy** — detalhado com required/optional, specs de espaçamento
- **component_focus** — um slide por componente principal encontrado no Figma
- **structure_dual** — variações visuais lado a lado sempre que houver 2 estados
- **use_case_map + use_case** — todos os CDUs identificados no Figma
- **behavior** — todos os estados visuais (zero, focus, erro, disabled, loading, etc.)
- **do_dont** — regras visuais específicas com exemplos concretos ✅/❌
- **before_after** — se houver migração de versão (Andes Legacy → Andes X)
- **microinteraction** — animações, cursores, transições
- **wording** — copy completo por país com variações e rationale
- **overview** — contexto rico de cada seção
- **contact** — canal e links

### Ênfase de conteúdo:
- Nomear os componentes EXATAMENTE como aparecem no Figma e no design system
- imageNote obrigatório em todos os slides anatomy, use_case, behavior, structure
- Detalhar specs visuais: espaçamentos, tipografia, estados de cor
- Referenciar tokens Andes X quando aplicável (ex: "ax-color/yellow/500")
- Total recomendado: **15–25 slides**

### Perguntas a fazer ao designer:
- Há alguma animação ou microinteração documentada no Figma?
- Quais são as variações visuais principais (ex: sem scroll vs. com scroll)?
- Há estados especiais por país (ex: MLA usa moeda diferente de MLB)?
- Existe versão anterior? Há mudanças visuais a documentar?
`
  }

  if (audience === 'devs') {
    return `
## Audiência: Desenvolvedores

Você está gerando um guideline para DESENVOLVEDORES. Foque em especificações técnicas de implementação.

### Slides a PRIORIZAR:
- **cover, objective, glossary** — contexto e vocabulário técnico
- **anatomy** — TODOS os componentes com required/optional claramente marcados, incluindo nomes de tokens
- **behavior** — TODOS os estados: zero, loading, focus, sufixo, erro, disabled, vazio, preenchido
- **wording** — tabelas completas de copy com variantes por país, formato exato de strings e placeholders
- **handoff** — links de Figma por país + specs técnicos (owner, versão, token name)
- **structure** — specs com valores exatos e variantes por país (ex: "Escolha como fazer seu Pix" para MLB)
- **use_case** — detalhar quais componentes são renderizados em cada estado/CDU
- **flow** — lógica de navegação e decision trees
- **do_dont** — regras técnicas: o que NUNCA fazer na implementação

### Slides a OMITIR:
- before_after: omitir, a menos que seja migração de API/token
- microinteraction: incluir APENAS se tiver specs de timing específicos (ex: duração em ms)
- overview: omitir

### Tom e linguagem:
- Técnico e preciso — como uma especificação de engenharia
- Usar nomes exatos dos componentes no design system Andes X
- Formatar comportamentos como: "SE [condição] → ENTÃO [comportamento]"
- Incluir valores absolutos quando disponíveis (px, %, ms, tokens)
- Total recomendado: **12–18 slides**

### Perguntas a fazer ao designer:
- Qual o nome exato do componente no Andes X? Já está disponível ou é novo?
- Há estados de loading ou skeleton a implementar?
- Existem regras de validação de valor (mínimo/máximo) por país?
- Quais são os tokens exatos de cor e tipografia usados?
`
  }

  return ''
}

function buildSystemPrompt(figmaContext: string, forceGenerationNow: boolean, audience?: Audience): string {
  const audienceSection = buildAudienceSection(audience)
  return `You are a UX Documentation Specialist at Mercado Pago, expert in creating complete guidelines for leadership and stakeholders following the Andes X design system.

${figmaContext ? `You have already read the designer's Figma files. Here is the extracted content:\n\n<figma_content>\n${figmaContext}\n</figma_content>\n\nUse this content as the primary source for generating the guideline. Only ask questions about information NOT clearly present in the Figma content.` : ''}

${forceGenerationNow ? `## Generation mode (strict)

The user explicitly asked to generate now.

- Call \`generate_guideline\` in this response.
- Do NOT ask additional questions.
- **IMPORTANT: Keep the total number of slides between 10 and 25.** For simple components aim for 10–15; for complex ones (multiple CDUs, flows, specs) up to 25. Merge only if content is truly redundant.
- **Fill ALL fields completely** — do NOT use "A confirmar" or empty strings. Extract everything from the Figma context. If something is unclear, infer from context.
- For each slide type, populate EVERY optional field that adds value: description, imageNote, note, rationale, variants, countries, bullets, specs, links.
- Lists: include as many items as needed to be complete (no artificial limits). Every CDU, every behavior state, every wording variant per country.
- "imageNote" is mandatory on anatomy, use_case, behavior, before_after, microinteraction slides — describe exactly what screenshot to insert.
- Wording slides: always include variants for each applicable country with exact UI copy strings.
- Behavior slides: enumerate ALL states found in Figma (zero, loaded, focus, error, disabled, etc.).
` : ''}

${audienceSection}

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

### 17. index (opcional, para guidelines com mais de 8 slides)
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
            {
              type: 'object',
              description: 'Before/after comparison slide',
              properties: {
                type: { type: 'string', const: 'before_after' },
                title: { type: 'string' },
                before: {
                  type: 'object',
                  properties: {
                    label: { type: 'string', description: 'ex: "Antes (Andes Legacy)"' },
                    points: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['label', 'points'],
                },
                after: {
                  type: 'object',
                  properties: {
                    label: { type: 'string', description: 'ex: "Depois (Andes X)"' },
                    points: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['label', 'points'],
                },
                imageNote: { type: 'string' },
              },
              required: ['type', 'title', 'before', 'after'],
            },
            {
              type: 'object',
              description: 'Micro-interactions slide',
              properties: {
                type: { type: 'string', const: 'microinteraction' },
                title: { type: 'string' },
                description: { type: 'string' },
                behaviors: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string', description: 'ex: "Cursor piscando"' },
                      spec: { type: 'string', description: 'Especificação técnica da animação' },
                      trigger: { type: 'string', description: 'Quando ocorre' },
                    },
                    required: ['name', 'spec'],
                  },
                },
                imageNote: { type: 'string' },
              },
              required: ['type', 'title', 'behaviors'],
            },
            {
              type: 'object',
              description: 'Index / table of contents slide',
              properties: {
                type: { type: 'string', const: 'index' },
                sections: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      number: { type: 'number' },
                      title: { type: 'string' },
                      items: { type: 'array', items: { type: 'string' } },
                    },
                    required: ['number', 'title', 'items'],
                  },
                },
              },
              required: ['type', 'sections'],
            },
            {
              type: 'object',
              description: 'Overview / Visión general slide — introduces a section with description and mockup',
              properties: {
                type: { type: 'string', const: 'overview' },
                title: { type: 'string' },
                sectionLabel: { type: 'string', description: 'ex: "1 · CHO en pasos"' },
                description: { type: 'string' },
                bullets: { type: 'array', items: { type: 'string' } },
                links: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { label: { type: 'string' }, arrow: { type: 'boolean' } },
                    required: ['label'],
                  },
                },
                imageNote: { type: 'string' },
              },
              required: ['type', 'title', 'description'],
            },
            {
              type: 'object',
              description: 'Structure / Specs slide — detailed component specs with variants per country',
              properties: {
                type: { type: 'string', const: 'structure' },
                title: { type: 'string' },
                sectionLabel: { type: 'string' },
                description: { type: 'string' },
                specs: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      description: { type: 'string' },
                      variants: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: { country: { type: 'string' }, flag: { type: 'string' }, value: { type: 'string' } },
                          required: ['value'],
                        },
                      },
                      note: { type: 'string' },
                    },
                    required: ['name', 'description'],
                  },
                },
                imageNote: { type: 'string' },
              },
              required: ['type', 'title', 'specs'],
            },
            {
              type: 'object',
              description: 'Flow / Logic slide — navigation flows and decision trees',
              properties: {
                type: { type: 'string', const: 'flow' },
                title: { type: 'string' },
                sectionLabel: { type: 'string' },
                description: { type: 'string' },
                steps: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      label: { type: 'string' },
                      type: { type: 'string', enum: ['screen', 'decision', 'action'] },
                      note: { type: 'string' },
                    },
                    required: ['label'],
                  },
                },
                branches: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { condition: { type: 'string' }, target: { type: 'string' } },
                    required: ['condition', 'target'],
                  },
                },
              },
              required: ['type', 'title', 'steps'],
            },
            {
              type: 'object',
              description: 'Handoff slide — Figma links and implementation specs',
              properties: {
                type: { type: 'string', const: 'handoff' },
                title: { type: 'string' },
                country: { type: 'string' },
                figmaLinks: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { label: { type: 'string' }, url: { type: 'string' } },
                    required: ['label', 'url'],
                  },
                },
                specs: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { label: { type: 'string' }, value: { type: 'string' } },
                    required: ['label', 'value'],
                  },
                },
              },
              required: ['type', 'title'],
            },
            {
              type: 'object',
              description: 'Section break — yellow slide with large title, used before each major section',
              properties: {
                type: { type: 'string', const: 'section' },
                number: { type: 'string', description: 'Section number, zero-padded (ex: "01")' },
                title: { type: 'string', description: 'Section name (ex: "CHO em passos")' },
                subtitle: { type: 'string', description: 'Sub-topic (ex: "Visão geral")' },
                bullets: { type: 'array', items: { type: 'string' }, description: 'Navigable sub-topics (ex: "Anatomia →")' },
              },
              required: ['type', 'number', 'title', 'subtitle', 'bullets'],
            },
            {
              type: 'object',
              description: 'Dual structure slide — two screen variants side by side with annotations',
              properties: {
                type: { type: 'string', const: 'structure_dual' },
                title: { type: 'string' },
                subtitle: { type: 'string' },
                leftLabel: { type: 'string', description: 'Label for left variant (ex: "Caso típico")' },
                rightLabel: { type: 'string', description: 'Label for right variant (ex: "Com scroll")' },
                leftAnnotations: {
                  type: 'array',
                  items: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } }, required: ['name', 'description'] },
                },
                rightAnnotations: {
                  type: 'array',
                  items: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } }, required: ['name', 'description'] },
                },
              },
              required: ['type', 'title', 'leftAnnotations', 'rightAnnotations'],
            },
            {
              type: 'object',
              description: 'Component focus — gray slide with breadcrumb, drills into a single UI component',
              properties: {
                type: { type: 'string', const: 'component_focus' },
                breadcrumb: { type: 'array', items: { type: 'string' }, description: 'Navigation path (ex: ["Estrutura", "Medios", "Header"])' },
                screenName: { type: 'string', description: 'Name of the screen (ex: "Listado de medios")' },
                componentTitle: { type: 'string', description: 'Component name with number (ex: "1. Tarea (Título)")' },
                description: { type: 'string' },
                annotation: {
                  type: 'object',
                  properties: { title: { type: 'string' }, description: { type: 'string' } },
                  required: ['title', 'description'],
                },
                highlightPosition: { type: 'string', enum: ['top', 'middle', 'bottom'] },
              },
              required: ['type', 'breadcrumb', 'screenName', 'componentTitle', 'description', 'annotation'],
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

    const { messages, figmaContext = '', requestId, audience } = await req.json() as {
      messages: Anthropic.MessageParam[]
      figmaContext?: string
      requestId?: string
      audience?: 'stakeholders' | 'designers' | 'devs'
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
              model: 'claude-opus-4-6',
              max_tokens: 16000,
              system: buildSystemPrompt(compactedFigmaContext, forceGuidelineTool, audience),
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

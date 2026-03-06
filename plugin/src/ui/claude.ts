declare const __GUIDELY_BASE_URL__: string

const DEFAULT_BASE_URL = 'https://guidely-mu.vercel.app'
const BASE_URL = (
  typeof __GUIDELY_BASE_URL__ === 'string' && __GUIDELY_BASE_URL__.trim()
    ? __GUIDELY_BASE_URL__
    : DEFAULT_BASE_URL
).replace(/\/+$/, '')
const STREAM_TOTAL_TIMEOUT_MS = 300000
const STREAM_IDLE_TIMEOUT_MS = 120000
const STREAM_FIRST_BYTE_TIMEOUT_MS = 45000
const STREAM_MAX_TOTAL_TIMEOUT_MS = 1800000
const STREAM_MAX_IDLE_TIMEOUT_MS = 420000
const STREAM_MAX_FIRST_BYTE_TIMEOUT_MS = 120000
const STREAM_TIMEOUT_RETRY_LIMIT = 2
const RETRY_CONTEXT_LIMITS = [50000, 32000, 18000]

// Lightweight validation without pulling in zod — keeps bundle small and sandbox-compatible
function validateGuideline(data: unknown): { ok: true; data: unknown } | { ok: false; error: string } {
  const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object'
  const isStr = (v: unknown): v is string => typeof v === 'string'
  const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  const isBool = (v: unknown): v is boolean => typeof v === 'boolean'
  const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr)
  const nonEmpty = (v: unknown, fallback: string): string => {
    if (isStr(v) && v.trim()) return v.trim()
    return fallback
  }

  if (!isObj(data)) return { ok: false, error: 'Não é um objeto' }
  const source = isObj((data as { guideline?: unknown }).guideline)
    ? (data as { guideline: Record<string, unknown> }).guideline
    : isObj((data as { data?: unknown }).data)
      ? (data as { data: Record<string, unknown> }).data
      : data

  const d = source

  if (!Array.isArray(d.slides) || d.slides.length === 0) return { ok: false, error: 'Campo "slides" ausente ou vazio' }

  const validTypes = ['cover','objective','glossary','anatomy','use_case_map','use_case','behavior','do_dont','wording','contact','before_after','microinteraction','index']

  for (let i = 0; i < d.slides.length; i++) {
    const s = d.slides[i]
    if (!isObj(s) || !isStr(s.type) || !validTypes.includes(s.type)) {
      return { ok: false, error: `Slide ${i + 1}: tipo "${isObj(s) ? String(s.type) : 'desconhecido'}" inválido` }
    }

    switch (s.type) {
      case 'cover':
        if (!isStr(s.title) || !isStr(s.subtitle) || !isStr(s.team) || !isStr(s.version)) {
          return { ok: false, error: `Slide ${i + 1}: cover inválido` }
        }
        break

      case 'objective':
        if (!isStr(s.body)) return { ok: false, error: `Slide ${i + 1}: objective sem body` }
        break

      case 'glossary':
        if (!Array.isArray(s.terms) || !s.terms.every((t) => isObj(t) && isStr(t.term) && isStr(t.definition))) {
          return { ok: false, error: `Slide ${i + 1}: glossary inválido` }
        }
        break

      case 'anatomy':
        if (!isStr(s.title) || !Array.isArray(s.components)) {
          return { ok: false, error: `Slide ${i + 1}: anatomy inválido` }
        }
        // Normalize index (accept string or number) and required (accept string or boolean)
        s.components = (s.components as Record<string, unknown>[]).map((c, ci) => ({
          ...c,
          index: isNum(c.index) ? c.index : isStr(c.index) ? parseInt(c.index, 10) || ci + 1 : ci + 1,
          name: isStr(c.name) ? c.name : `Componente ${ci + 1}`,
          required: isBool(c.required) ? c.required : c.required === 'true' || c.required === 'Obrigatório',
        }))
        break

      case 'use_case_map':
        if (!isStr(s.title)) {
          return { ok: false, error: `Slide ${i + 1}: use_case_map sem title` }
        }
        // Normalize caseNames — accept array of strings or extract from rows
        if (!isStringArray(s.caseNames) || s.caseNames.length === 0) {
          if (Array.isArray(s.rows) && s.rows.length > 0) {
            const firstRow = s.rows[0] as Record<string, unknown>
            s.caseNames = firstRow?.cases ? Object.keys(firstRow.cases as Record<string, unknown>) : ['CDU']
          } else {
            s.caseNames = ['CDU']
          }
        }
        // Normalize rows — accept missing cases
        if (!Array.isArray(s.rows)) s.rows = []
        s.rows = (s.rows as Record<string, unknown>[]).map((r) => ({
          component: isStr(r.component) ? r.component : String(r.component ?? 'Componente'),
          cases: isObj(r.cases) ? r.cases : {},
        }))
        break

      case 'use_case':
        if (!isStr(s.title)) {
          return { ok: false, error: `Slide ${i + 1}: use_case sem title` }
        }
        // Normalize body and components
        if (!isStr(s.body)) s.body = ''
        if (!isStringArray(s.components)) s.components = []
        break

      case 'behavior':
        if (!isStr(s.title) || !Array.isArray(s.rows) || !s.rows.every((r) => isObj(r) && isStr(r.label) && isStr(r.value))) {
          return { ok: false, error: `Slide ${i + 1}: behavior inválido` }
        }
        break

      case 'do_dont':
        if (!isStr(s.title) || !isStringArray(s.do) || !isStringArray(s.dont)) {
          return { ok: false, error: `Slide ${i + 1}: do_dont inválido` }
        }
        break

      case 'wording':
        if (!isStr(s.title)) {
          return { ok: false, error: `Slide ${i + 1}: wording sem title` }
        }
        if (!Array.isArray(s.errors)) s.errors = []
        // Normalize each error entry
        s.errors = (s.errors as Record<string, unknown>[]).map((e) => ({
          name: isStr(e.name) ? e.name : 'Erro',
          objective: isStr(e.objective) ? e.objective : '',
          variants: Array.isArray(e.variants)
            ? (e.variants as Record<string, unknown>[]).map((v) => ({
                country: isStr(v.country) ? v.country : '',
                flag: isStr(v.flag) ? v.flag : '🌎',
                text: isStr(v.text) ? v.text : '',
              }))
            : [],
          rationale: isStr(e.rationale) ? e.rationale : undefined,
        }))
        break

      case 'contact':
        if (!isStr(s.channel) || !Array.isArray(s.links) || !s.links.every((l) => isObj(l) && isStr(l.label) && isStr(l.url))) {
          return { ok: false, error: `Slide ${i + 1}: contact inválido` }
        }
        break
    }
  }

  const coverSlide = d.slides.find((slide) => isObj(slide) && slide.type === 'cover') as Record<string, unknown> | undefined
  const normalized = {
    ...d,
    title: nonEmpty(d.title, nonEmpty(coverSlide?.title, 'Guideline A confirmar')),
    team: nonEmpty(d.team, nonEmpty(coverSlide?.team, 'A confirmar')),
    version: nonEmpty(d.version, nonEmpty(coverSlide?.version, 'A confirmar')),
  }

  return { ok: true, data: normalized }
}

// ─── Figma OAuth ─────────────────────────────────────────────

// ─── Anthropic OAuth ─────────────────────────────────────────

export async function startAnthropicOAuth(): Promise<{ url: string; state: string }> {
  const res = await fetch(`${BASE_URL}/api/auth/anthropic/start`)
  const data = await res.json() as { url?: string; state?: string; error?: string }
  if (!res.ok || !data.url) throw new Error(data.error ?? 'Falha ao iniciar autenticação Anthropic')
  return { url: data.url, state: data.state! }
}

export async function pollAnthropicKey(state: string): Promise<string | null> {
  const res = await fetch(`${BASE_URL}/api/auth/anthropic/poll?state=${state}`)
  const data = await res.json() as { status: 'pending' | 'done'; key?: string }
  return data.status === 'done' ? data.key! : null
}

// ─── Figma OAuth ─────────────────────────────────────────────

export async function startFigmaOAuth(): Promise<{ url: string; state: string }> {
  const res = await fetch(`${BASE_URL}/api/auth/start`)
  const data = await res.json() as { url?: string; state?: string; error?: string }
  if (!res.ok || !data.url) throw new Error(data.error ?? 'Falha ao iniciar autenticação')
  return { url: data.url, state: data.state! }
}

export async function pollFigmaToken(state: string): Promise<string | null> {
  const res = await fetch(`${BASE_URL}/api/auth/poll?state=${state}`)
  const data = await res.json() as { status: 'pending' | 'done'; token?: string }
  return data.status === 'done' ? data.token! : null
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface StreamCallbacks {
  onText: (delta: string) => void
  onGuideline: (data: unknown) => void
  onGenerating?: () => void
  onError: (msg: string) => void
  onDone: () => void
}

export interface StreamChatOptions {
  requestId?: string
}

function authHeaders(anthropicKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Anthropic-Key': anthropicKey,
  }
}

// Fix #9 — robust regex: handles query params, hash, trailing slashes
export function extractFileId(url: string): string | null {
  const match = url.match(/figma\.com\/(?:design|file|proto)\/([a-zA-Z0-9]+)/)
  return match?.[1] ?? null
}

// Read Figma files via backend proxy
export async function readFigmaFiles(
  figmaToken: string,
  anthropicKey: string,
  referenceFileId?: string,
  destinationFileId?: string
): Promise<string> {
  let res: Response
  try {
    res = await fetch(`${BASE_URL}/api/read-file`, {
      method: 'POST',
      headers: authHeaders(anthropicKey),
      body: JSON.stringify({ token: figmaToken, referenceFileId, destinationFileId }),
    })
  } catch (err) {
    // Network errors (Failed to fetch, etc)
    throw new Error('Erro de conexão. Verifique sua internet e tente novamente.')
  }

  const data = await res.json() as { context?: string; error?: string; truncated?: boolean }

  // Fix #8 — specific error messages
  if (res.status === 401) throw new Error('Token do Figma inválido ou sem permissão de leitura.')
  if (res.status === 403) throw new Error('Sem acesso ao arquivo. Verifique se o arquivo é público ou se o token tem permissão.')
  if (!res.ok || data.error) throw new Error(data.error ?? `Erro ao ler arquivo (${res.status})`)

  const context = data.context ?? ''
  if (!data.truncated) return context

  return `${context}\n\n[Nota do sistema: o contexto dos arquivos foi truncado por tamanho. Gere o guideline completo com o conteúdo disponível e sinalize lacunas como \"A confirmar\" sem interromper a geração.]`
}

function estimateMessageChars(messages: Message[]): number {
  return messages.reduce((sum, msg) => sum + msg.content.length, 0)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function compactContextForRetry(context: string, maxChars: number): string {
  if (context.length <= maxChars) return context

  const headSize = Math.floor(maxChars * 0.72)
  const tailSize = Math.floor(maxChars * 0.22)

  return `${context.slice(0, headSize)}\n\n[Nota do sistema: contexto resumido automaticamente para garantir a conclusão da geração em documentação extensa.]\n\n${context.slice(-tailSize)}`
}

function computeStreamTimeouts(
  figmaContext: string,
  messages: Message[]
): { firstByteMs: number; idleMs: number; totalMs: number } {
  const contextFactor = Math.ceil(figmaContext.length / 12000)
  const messageChars = estimateMessageChars(messages)

  const firstByteMs = clamp(
    STREAM_FIRST_BYTE_TIMEOUT_MS + contextFactor * 5000 + Math.floor(messageChars / 320),
    STREAM_FIRST_BYTE_TIMEOUT_MS,
    STREAM_MAX_FIRST_BYTE_TIMEOUT_MS
  )

  const idleMs = clamp(
    STREAM_IDLE_TIMEOUT_MS + contextFactor * 20000 + Math.floor(messageChars / 180),
    STREAM_IDLE_TIMEOUT_MS,
    STREAM_MAX_IDLE_TIMEOUT_MS
  )

  const totalMs = clamp(
    STREAM_TOTAL_TIMEOUT_MS + contextFactor * 60000 + Math.floor(messageChars / 40),
    STREAM_TOTAL_TIMEOUT_MS,
    STREAM_MAX_TOTAL_TIMEOUT_MS
  )

  return { firstByteMs, idleMs, totalMs }
}

// Stream chat — fix #1 (null body) + #5 (silent JSON) + specific error messages
export async function streamChat(
  messages: Message[],
  figmaContext: string,
  anthropicKey: string,
  cb: StreamCallbacks,
  options: StreamChatOptions = {},
  attempt = 0
): Promise<void> {
  const contextLimit = RETRY_CONTEXT_LIMITS[Math.min(attempt, RETRY_CONTEXT_LIMITS.length - 1)]
  const effectiveContext = compactContextForRetry(figmaContext, contextLimit)
  const { firstByteMs, idleMs, totalMs } = computeStreamTimeouts(effectiveContext, messages)
  const controller = new AbortController()
  let abortReason: 'first_byte' | 'idle' | 'total' | null = null
  let firstByteTimeout: ReturnType<typeof setTimeout> | null = null
  let totalTimeout: ReturnType<typeof setTimeout> | null = null
  let idleTimeout: ReturnType<typeof setTimeout> | null = null

  const clearWatchdogs = () => {
    if (firstByteTimeout) clearTimeout(firstByteTimeout)
    if (totalTimeout) clearTimeout(totalTimeout)
    if (idleTimeout) clearTimeout(idleTimeout)
  }

  const refreshIdleWatchdog = () => {
    if (idleTimeout) clearTimeout(idleTimeout)
    idleTimeout = setTimeout(() => {
      abortReason = 'idle'
      controller.abort()
    }, idleMs)
  }

  totalTimeout = setTimeout(() => {
    abortReason = 'total'
    controller.abort()
  }, totalMs)

  firstByteTimeout = setTimeout(() => {
    abortReason = 'first_byte'
    controller.abort()
  }, firstByteMs)

  let res: Response
  try {
    res = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: authHeaders(anthropicKey),
      body: JSON.stringify({ messages, figmaContext: effectiveContext, requestId: options.requestId }),
      signal: controller.signal,
    })
  } catch {
    clearWatchdogs()
    if (controller.signal.aborted) {
      const canRetry = attempt < STREAM_TIMEOUT_RETRY_LIMIT
      if (canRetry) {
        await streamChat(messages, figmaContext, anthropicKey, cb, options, attempt + 1)
        return
      }

      const attemptInfo = attempt > 0 ? ` após ${attempt + 1} tentativas automáticas` : ''
      if (abortReason === 'first_byte') {
        cb.onError(`A resposta não começou em ${Math.round(firstByteMs / 1000)}s${attemptInfo}. Tente gerar novamente.`)
        return
      }
      if (abortReason === 'total') {
        cb.onError(`Tempo limite da geração (${Math.round(totalMs / 1000)}s)${attemptInfo}. Clique em gerar novamente para continuar.`)
        return
      }
    }
    cb.onError('Sem conexão com o servidor. Verifique sua internet e tente novamente.')
    return
  }

  if (!res.ok) {
    clearWatchdogs()
    const err = await res.json().catch(() => ({})) as { error?: string }
    if (res.status === 401) {
      cb.onError('Chave da API Anthropic inválida. Verifique nas configurações do Guidely.')
    } else {
      cb.onError(err.error ?? `Erro do servidor (${res.status})`)
    }
    return
  }

  // Fix #1 — guard against null body
  if (!res.body) {
    clearWatchdogs()
    cb.onError('Resposta do servidor inválida. Tente novamente.')
    return
  }

  const reader = res.body.getReader()
  refreshIdleWatchdog()
  const decoder = new TextDecoder()
  let buffer = ''
  let toolInputDeltaAccum = ''
  let toolInputStart: unknown = null
  let inToolUse = false
  let hasReceivedData = false
  let guidelineEmitted = false
  let fullText = ''

  function parseJsonFromText(text: string): unknown | null {
    const candidates: string[] = []
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fenced?.[1]) candidates.push(fenced[1].trim())

    const firstBrace = text.indexOf('{')
    const lastBrace = text.lastIndexOf('}')
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      candidates.push(text.slice(firstBrace, lastBrace + 1).trim())
    }

    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate)
      } catch {
        // try next candidate
      }
    }

    return null
  }

  function parseToolUseInput(deltaJson: string, startInput: unknown): unknown {
    const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

    let parsedStart: unknown = null
    if (typeof startInput === 'string') {
      const trimmed = startInput.trim()
      if (trimmed) {
        try {
          parsedStart = JSON.parse(trimmed)
        } catch {
          parsedStart = startInput
        }
      }
    } else if (startInput !== undefined && startInput !== null) {
      parsedStart = startInput
    }

    const trimmedDelta = deltaJson.trim()
    if (trimmedDelta) {
      try {
        const parsedDelta = JSON.parse(trimmedDelta)
        if (isObj(parsedStart) && isObj(parsedDelta)) {
          return { ...parsedStart, ...parsedDelta }
        }
        return parsedDelta
      } catch {
        if (parsedStart !== null && parsedStart !== undefined) return parsedStart
        throw new Error('Tool input JSON incompleto')
      }
    }

    if (parsedStart !== null && parsedStart !== undefined) return parsedStart
    throw new Error('Tool input vazio')
  }

  // If Claude responded with text containing JSON instead of calling the tool, try to extract it
  function tryFallbackAndDone() {
    if (!guidelineEmitted && fullText.length > 200) {
      const raw = parseJsonFromText(fullText)
      if (raw) {
        const result = validateGuideline(raw)
        if (result.ok) {
          guidelineEmitted = true
          cb.onGuideline(result.data)
          return
        }
      }
    }
    cb.onDone()
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      hasReceivedData = true
      if (firstByteTimeout) {
        clearTimeout(firstByteTimeout)
        firstByteTimeout = null
      }
      refreshIdleWatchdog()
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const raw = line.slice(6).trim()
        if (raw === '[DONE]') {
          clearWatchdogs()
          tryFallbackAndDone()
          return
        }

        // Fix #5 — log parse failures instead of silently dropping
        let event: Record<string, unknown>
        try {
          event = JSON.parse(raw)
        } catch {
          continue // skip malformed SSE lines (ok to ignore)
        }

        const type = event.type as string

        if (type === 'content_block_start') {
          const block = event.content_block as Record<string, unknown>
          if (block?.type === 'tool_use' && block?.name === 'generate_guideline') {
            inToolUse = true
            toolInputDeltaAccum = ''
            toolInputStart = null
            const immediateInput = block.input
            if (immediateInput !== undefined && immediateInput !== null) {
              toolInputStart = immediateInput
            }
            cb.onGenerating?.()
          }
        }

        if (type === 'content_block_delta') {
          const delta = event.delta as Record<string, unknown>
          if (delta?.type === 'text_delta') { const t = delta.text as string; fullText += t; cb.onText(t) }
          if (delta?.type === 'input_json_delta') {
            toolInputDeltaAccum += (delta.partial_json as string) ?? ''
          }
        }

        if (type === 'content_block_stop' && inToolUse) {
          inToolUse = false
          try {
            const raw = parseToolUseInput(toolInputDeltaAccum, toolInputStart)
            const result = validateGuideline(raw)
            if (result.ok) {
              guidelineEmitted = true
              cb.onGuideline(result.data)
            } else {
              clearWatchdogs()
              cb.onError(`Guideline com campos inválidos: ${result.error}. Tente escrever "gerar" novamente.`)
              return
            }
          } catch (e) {
            const errMsg = String(e).slice(0, 120)
            const startLen = typeof toolInputStart === 'string'
              ? toolInputStart.length
              : toolInputStart ? JSON.stringify(toolInputStart).length : 0
            const jsonLen = toolInputDeltaAccum.length + startLen
            clearWatchdogs()
            cb.onError(`Erro ao processar guideline (${errMsg}) — JSON length: ${jsonLen}. Tente escrever "gerar" novamente.`)
            return
          }
        }

        if (event.error) {
          clearWatchdogs()
          cb.onError((event.error as Record<string, string>).message ?? 'Erro desconhecido da API.')
          return
        }
      }
    }
  } catch {
    clearWatchdogs()
    if (controller.signal.aborted) {
      const canRetry = attempt < STREAM_TIMEOUT_RETRY_LIMIT && !guidelineEmitted
      if (canRetry) {
        await streamChat(messages, figmaContext, anthropicKey, cb, options, attempt + 1)
        return
      }

      const attemptInfo = attempt > 0 ? ` após ${attempt + 1} tentativas automáticas` : ''
      if (abortReason === 'first_byte') {
        cb.onError(`A resposta não começou em ${Math.round(firstByteMs / 1000)}s${attemptInfo}. Tente gerar novamente.`)
        return
      }
      if (abortReason === 'idle') {
        cb.onError(`A geração ficou sem atividade por ${Math.round(idleMs / 1000)}s${attemptInfo}. Clique em gerar novamente para continuar.`)
        return
      }

      cb.onError(`Tempo limite da geração (${Math.round(totalMs / 1000)}s)${attemptInfo}. Clique em gerar novamente para continuar.`)
      return
    }
    // Network interruption — retry automatically (not just for timeouts)
    const canRetryNetwork = attempt < STREAM_TIMEOUT_RETRY_LIMIT && !guidelineEmitted
    if (canRetryNetwork) {
      await streamChat(messages, figmaContext, anthropicKey, cb, options, attempt + 1)
      return
    }
    const attemptInfo = attempt > 0 ? ` (${attempt + 1}ª tentativa)` : ''
    if (!hasReceivedData) {
      cb.onError(`Sem conexão com o servidor${attemptInfo}. Verifique sua internet.`)
    } else {
      cb.onError(`Conexão interrompida durante a geração${attemptInfo}. Tente escrever "gerar" novamente.`)
    }
    return
  }

  clearWatchdogs()
  tryFallbackAndDone()
}

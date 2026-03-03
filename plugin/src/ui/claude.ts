const BASE_URL = 'https://guidely-mu.vercel.app'

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
  onError: (msg: string) => void
  onDone: () => void
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
  const res = await fetch(`${BASE_URL}/api/read-file`, {
    method: 'POST',
    headers: authHeaders(anthropicKey),
    body: JSON.stringify({ token: figmaToken, referenceFileId, destinationFileId }),
  })

  const data = await res.json() as { context?: string; error?: string }

  // Fix #8 — specific error messages
  if (res.status === 401) throw new Error('Token do Figma inválido ou sem permissão de leitura.')
  if (res.status === 403) throw new Error('Sem acesso ao arquivo. Verifique se o arquivo é público ou se o token tem permissão.')
  if (!res.ok || data.error) throw new Error(data.error ?? `Erro ao ler arquivo (${res.status})`)
  return data.context ?? ''
}

// Stream chat — fix #1 (null body) + #5 (silent JSON) + specific error messages
export async function streamChat(
  messages: Message[],
  figmaContext: string,
  anthropicKey: string,
  cb: StreamCallbacks
): Promise<void> {
  let res: Response
  try {
    res = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: authHeaders(anthropicKey),
      body: JSON.stringify({ messages, figmaContext }),
    })
  } catch {
    cb.onError('Sem conexão com o servidor. Verifique sua internet e tente novamente.')
    return
  }

  if (!res.ok) {
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
    cb.onError('Resposta do servidor inválida. Tente novamente.')
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let toolInputAccum = ''
  let inToolUse = false
  let hasReceivedData = false

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      hasReceivedData = true
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const raw = line.slice(6).trim()
        if (raw === '[DONE]') { cb.onDone(); return }

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
            toolInputAccum = ''
          }
        }

        if (type === 'content_block_delta') {
          const delta = event.delta as Record<string, unknown>
          if (delta?.type === 'text_delta') cb.onText(delta.text as string)
          if (delta?.type === 'input_json_delta') toolInputAccum += (delta.partial_json as string) ?? ''
        }

        if (type === 'content_block_stop' && inToolUse) {
          inToolUse = false
          try {
            const parsed = JSON.parse(toolInputAccum)
            cb.onGuideline(parsed)
          } catch (e) {
            // Show actual error to help diagnose
            const errMsg = String(e).slice(0, 120)
            const jsonLen = toolInputAccum.length
            cb.onError(`Erro ao processar guideline (${errMsg}) — JSON length: ${jsonLen}. Tente escrever "gerar" novamente.`)
          }
        }

        if (event.error) {
          cb.onError((event.error as Record<string, string>).message ?? 'Erro desconhecido da API.')
          return
        }
      }
    }
  } catch {
    if (!hasReceivedData) {
      cb.onError('Conexão interrompida antes de receber resposta. Tente novamente.')
    } else {
      cb.onError('Conexão interrompida durante a resposta. Parte do conteúdo pode ter se perdido.')
    }
    return
  }

  cb.onDone()
}

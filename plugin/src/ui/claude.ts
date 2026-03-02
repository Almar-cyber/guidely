const BASE_URL = 'https://ux-guidelines-proxy.vercel.app'

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

// Read Figma files via backend proxy
export async function readFigmaFiles(
  token: string,
  referenceFileId: string,
  destinationFileId?: string
): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/read-file`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, referenceFileId, destinationFileId }),
  })

  const data = await res.json() as { context?: string; error?: string }
  if (!res.ok || data.error) throw new Error(data.error ?? `Erro ${res.status}`)
  return data.context ?? ''
}

// Stream chat with optional Figma context
export async function streamChat(
  messages: Message[],
  figmaContext: string,
  cb: StreamCallbacks
): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, figmaContext }),
  })

  if (!res.ok) {
    cb.onError(`Erro do servidor: ${res.status}`)
    return
  }

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let assistantText = ''
  let toolInputAccum = ''
  let inToolUse = false

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const raw = line.slice(6).trim()
      if (raw === '[DONE]') { cb.onDone(); return }

      let event: Record<string, unknown>
      try { event = JSON.parse(raw) } catch { continue }

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
        if (delta?.type === 'text_delta') {
          assistantText += delta.text as string
          cb.onText(delta.text as string)
        }
        if (delta?.type === 'input_json_delta') {
          toolInputAccum += delta.partial_json as string
        }
      }

      if (type === 'content_block_stop' && inToolUse) {
        inToolUse = false
        try {
          cb.onGuideline(JSON.parse(toolInputAccum))
        } catch {
          cb.onError('Falha ao processar o guideline. Tente novamente.')
        }
      }

      if (event.error) {
        cb.onError((event.error as Record<string, string>).message ?? 'Erro desconhecido')
        return
      }
    }
  }

  cb.onDone()
}

// Extract Figma file ID from URL
export function extractFileId(url: string): string | null {
  const match = url.match(/figma\.com\/(?:design|file)\/([a-zA-Z0-9]+)/)
  return match?.[1] ?? null
}

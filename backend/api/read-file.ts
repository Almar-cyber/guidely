export const config = { runtime: 'edge' }

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Anthropic-Key',
  }
}

// Skip only navigation/utility pages — keep all content pages including handoff pages
const CONTENT_PAGE_SKIP = /^(↓|←|→|↑|==|\s*$)/i
const MAX_PAGES = 25               // projetos com até 25 páginas
const MAX_TOP_FRAMES_PER_PAGE = 20 // até 20 frames por página
const MAX_LINES_PER_PAGE = 160
const MAX_PAGE_CHARS = 16000
const MAX_LINE_CHARS = 260
const MAX_CONTEXT_CHARS = 120000
const FILE_STRUCTURE_TIMEOUT_MS = 12000  // leitura da estrutura do arquivo
const NODES_BATCH_TIMEOUT_MS = 8000      // por página em paralelo

interface FigmaNode {
  id: string
  name: string
  type: string
  characters?: string
  children?: FigmaNode[]
}

function normalizeExtractedText(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= MAX_LINE_CHARS) return clean
  return `${clean.slice(0, MAX_LINE_CHARS - 1)}…`
}

function capContext(context: string): { context: string; truncated: boolean } {
  if (context.length <= MAX_CONTEXT_CHARS) return { context, truncated: false }

  const headSize = Math.floor(MAX_CONTEXT_CHARS * 0.75)
  const tailSize = Math.floor(MAX_CONTEXT_CHARS * 0.2)
  const head = context.slice(0, headSize)
  const tail = context.slice(-tailSize)
  const marker = '\n\n[... contexto truncado para manter estabilidade da geração ...]\n\n'

  return {
    context: `${head}${marker}${tail}`,
    truncated: true,
  }
}

function extractText(node: FigmaNode, depth = 0): string[] {
  const results: string[] = []
  const skip = ['VECTOR', 'RECTANGLE', 'ELLIPSE', 'LINE', 'POLYGON', 'STAR', 'BOOLEAN_OPERATION', 'REGULAR_POLYGON']

  if (node.type === 'TEXT' && node.characters?.trim()) {
    const clean = normalizeExtractedText(node.characters)
    if (clean.length > 2 && !clean.match(/^\d+$/) && !clean.match(/^[•\-–—]+$/)) {
      results.push(clean)
    }
  } else if (!skip.includes(node.type) && node.name && depth < 8) {
    // Include meaningful frame/section/component names for structural context
    const nameClean = node.name.trim()
    const isStructural = node.type === 'FRAME' || node.type === 'SECTION' || node.type === 'COMPONENT' || node.type === 'COMPONENT_SET' || node.type === 'GROUP'
    if (
      isStructural &&
      depth <= 3 &&
      nameClean.length > 2 &&
      !nameClean.match(/^\d+$/) &&
      !nameClean.match(/^Frame \d/) &&
      !nameClean.match(/^Group \d/) &&
      !nameClean.match(/^Rectangle/) &&
      !nameClean.startsWith('_')
    ) {
      results.push(`[${nameClean}]`)
    }
    for (const child of node.children ?? []) {
      results.push(...extractText(child, depth + 1))
    }
  }

  return results
}

function deduplicateTexts(texts: string[]): string[] {
  const seen = new Set<string>()
  return texts.filter((t) => {
    if (seen.has(t)) return false
    seen.add(t)
    return true
  })
}

function figmaFetch(url: string, token: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, {
    headers: { 'X-Figma-Token': token },
    signal: controller.signal,
  }).finally(() => clearTimeout(timer))
}

async function readFigmaFile(token: string, fileId: string): Promise<string> {
  // 1. Get file structure (pages + top-level frames)
  const fileRes = await figmaFetch(`https://api.figma.com/v1/files/${fileId}?depth=2`, token, FILE_STRUCTURE_TIMEOUT_MS)

  if (!fileRes.ok) {
    const err = await fileRes.json() as { err?: string; status?: number }
    throw new Error(err.err ?? `Figma API error: ${fileRes.status}`)
  }

  const file = await fileRes.json() as {
    name: string
    document: { children: FigmaNode[] }
  }

  const sections: string[] = [`# Arquivo: ${file.name}\n`]

  // 2. Filter to content pages only
  const contentPages = file.document.children.filter(
    (page) => !CONTENT_PAGE_SKIP.test(page.name)
  )

  // 3. Fetch all pages in parallel — each with individual timeout so slow pages don't block others
  async function fetchPage(page: FigmaNode): Promise<{ name: string; lines: string[]; frames: { id: string; name: string }[] } | null> {
    const topFrames = (page.children ?? []).slice(0, MAX_TOP_FRAMES_PER_PAGE)
    if (topFrames.length === 0) return null

    const ids = topFrames.map((f) => f.id).join(',')
    let nodesRes: Response
    try {
      nodesRes = await figmaFetch(
        `https://api.figma.com/v1/files/${fileId}/nodes?ids=${ids}&depth=4`,
        token,
        NODES_BATCH_TIMEOUT_MS
      )
    } catch {
      return null // timeout — skip page gracefully
    }

    if (!nodesRes.ok) return null

    const nodesData = await nodesRes.json() as { nodes: Record<string, { document: FigmaNode }> }
    const pageTexts: string[] = []

    for (const nodeData of Object.values(nodesData.nodes)) {
      pageTexts.push(...extractText(nodeData.document))
    }

    const unique = deduplicateTexts(pageTexts).filter(
      (t) => !t.startsWith('Loren ipsum') && !t.startsWith('[Descripción') && t !== 'Lorem' && t.length > 3
    )

    const limited: string[] = []
    let pageChars = 0
    for (const line of unique) {
      if (limited.length >= MAX_LINES_PER_PAGE) break
      if (pageChars + line.length + 1 > MAX_PAGE_CHARS) break
      limited.push(line)
      pageChars += line.length + 1
    }

    return limited.length > 0 ? { name: page.name, lines: limited, frames: topFrames.map((f) => ({ id: f.id, name: f.name })) } : null
  }

  // All pages run in parallel — total time ≈ NODES_BATCH_TIMEOUT_MS (not N × timeout)
  const pageResults = await Promise.allSettled(
    contentPages.slice(0, MAX_PAGES).map(fetchPage)
  )

  const allFrames: { id: string; name: string }[] = []
  for (const result of pageResults) {
    if (result.status === 'fulfilled' && result.value) {
      sections.push(`## Página: ${result.value.name}\n`)
      sections.push(result.value.lines.join('\n'))
      sections.push('')
      allFrames.push(...result.value.frames)
    }
  }

  // Append frame ID index so Claude can assign mockupFrameId
  if (allFrames.length > 0) {
    sections.push('\n## Frames disponíveis para mockupFrameId\n')
    sections.push(allFrames.slice(0, 80).map((f) => `- "${f.name}" → ${f.id}`).join('\n'))
  }

  return sections.join('\n')
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders(),
    })
  }

  const { token, referenceFileId, destinationFileId } = await req.json() as {
    token: string
    referenceFileId?: string
    destinationFileId?: string
  }

  if (!referenceFileId && !destinationFileId) {
    return new Response(JSON.stringify({ error: 'Informe ao menos um arquivo Figma.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  }

  try {
    const [refContent, destContent] = await Promise.all([
      referenceFileId ? readFigmaFile(token, referenceFileId) : Promise.resolve(''),
      destinationFileId && destinationFileId !== referenceFileId
        ? readFigmaFile(token, destinationFileId).catch(() => '')
        : Promise.resolve(''),
    ])

    const rawContext = [
      '=== ARQUIVO DE REFERÊNCIA (design do componente) ===',
      refContent,
      destContent
        ? ['=== ARQUIVO DE DESTINO (guideline em construção) ===', destContent].join('\n')
        : '',
    ]
      .filter(Boolean)
      .join('\n\n')

    const { context, truncated } = capContext(rawContext)

    return new Response(JSON.stringify({ context, truncated }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(),
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao ler arquivo'
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(),
      },
    })
  }
}

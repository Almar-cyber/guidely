export const config = { runtime: 'edge' }

const CONTENT_PAGE_SKIP = /^(↓|←|→|↑|--|==|MASTER|COMPONENT|LIBRARY|\s*$)/i

interface FigmaNode {
  id: string
  name: string
  type: string
  characters?: string
  children?: FigmaNode[]
}

function extractText(node: FigmaNode, depth = 0): string[] {
  const results: string[] = []
  const skip = ['VECTOR', 'RECTANGLE', 'ELLIPSE', 'LINE', 'POLYGON', 'STAR', 'BOOLEAN_OPERATION', 'REGULAR_POLYGON']

  if (node.type === 'TEXT' && node.characters?.trim()) {
    const clean = node.characters.replace(/\n+/g, ' ').trim()
    if (clean.length > 2 && !clean.match(/^\d+$/) && !clean.match(/^[•\-–—]+$/)) {
      results.push(clean)
    }
  } else if (!skip.includes(node.type) && node.name && depth < 8) {
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

async function readFigmaFile(token: string, fileId: string): Promise<string> {
  // 1. Get file structure (pages + top-level frames)
  const fileRes = await fetch(`https://api.figma.com/v1/files/${fileId}?depth=2`, {
    headers: { 'X-Figma-Token': token },
  })

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

  // 3. For each content page, get nodes at depth 8 to extract text
  for (const page of contentPages.slice(0, 6)) {
    const topFrames = (page.children ?? []).slice(0, 12)
    if (topFrames.length === 0) continue

    const ids = topFrames.map((f) => f.id).join(',')
    const nodesRes = await fetch(
      `https://api.figma.com/v1/files/${fileId}/nodes?ids=${ids}&depth=8`,
      { headers: { 'X-Figma-Token': token } }
    )

    if (!nodesRes.ok) continue

    const nodesData = await nodesRes.json() as { nodes: Record<string, { document: FigmaNode }> }
    const pageTexts: string[] = []

    for (const nodeData of Object.values(nodesData.nodes)) {
      const texts = extractText(nodeData.document)
      pageTexts.push(...texts)
    }

    const unique = deduplicateTexts(pageTexts).filter(
      (t) =>
        !t.startsWith('Loren ipsum') &&
        !t.startsWith('[Descripción') &&
        t !== 'Lorem' &&
        t.length > 3
    )

    if (unique.length > 0) {
      sections.push(`## Página: ${page.name}\n`)
      sections.push(unique.slice(0, 120).join('\n'))
      sections.push('')
    }
  }

  return sections.join('\n')
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
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
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  try {
    const [refContent, destContent] = await Promise.all([
      referenceFileId ? readFigmaFile(token, referenceFileId) : Promise.resolve(''),
      destinationFileId && destinationFileId !== referenceFileId
        ? readFigmaFile(token, destinationFileId).catch(() => '')
        : Promise.resolve(''),
    ])

    const context = [
      '=== ARQUIVO DE REFERÊNCIA (design do componente) ===',
      refContent,
      destContent
        ? ['=== ARQUIVO DE DESTINO (guideline em construção) ===', destContent].join('\n')
        : '',
    ]
      .filter(Boolean)
      .join('\n\n')

    return new Response(JSON.stringify({ context }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao ler arquivo'
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.default = handler;
exports.config = { runtime: 'edge' };
function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Anthropic-Key',
    };
}
const CONTENT_PAGE_SKIP = /^(↓|←|→|↑|--|==|MASTER|COMPONENT|LIBRARY|\s*$)/i;
const MAX_PAGES = 6;
const MAX_TOP_FRAMES_PER_PAGE = 12;
const MAX_LINES_PER_PAGE = 140;
const MAX_PAGE_CHARS = 14000;
const MAX_LINE_CHARS = 260;
const MAX_CONTEXT_CHARS = 90000;
function normalizeExtractedText(text) {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length <= MAX_LINE_CHARS)
        return clean;
    return `${clean.slice(0, MAX_LINE_CHARS - 1)}…`;
}
function capContext(context) {
    if (context.length <= MAX_CONTEXT_CHARS)
        return { context, truncated: false };
    const headSize = Math.floor(MAX_CONTEXT_CHARS * 0.75);
    const tailSize = Math.floor(MAX_CONTEXT_CHARS * 0.2);
    const head = context.slice(0, headSize);
    const tail = context.slice(-tailSize);
    const marker = '\n\n[... contexto truncado para manter estabilidade da geração ...]\n\n';
    return {
        context: `${head}${marker}${tail}`,
        truncated: true,
    };
}
function extractText(node, depth = 0) {
    const results = [];
    const skip = ['VECTOR', 'RECTANGLE', 'ELLIPSE', 'LINE', 'POLYGON', 'STAR', 'BOOLEAN_OPERATION', 'REGULAR_POLYGON'];
    if (node.type === 'TEXT' && node.characters?.trim()) {
        const clean = normalizeExtractedText(node.characters);
        if (clean.length > 2 && !clean.match(/^\d+$/) && !clean.match(/^[•\-–—]+$/)) {
            results.push(clean);
        }
    }
    else if (!skip.includes(node.type) && node.name && depth < 8) {
        for (const child of node.children ?? []) {
            results.push(...extractText(child, depth + 1));
        }
    }
    return results;
}
function deduplicateTexts(texts) {
    const seen = new Set();
    return texts.filter((t) => {
        if (seen.has(t))
            return false;
        seen.add(t);
        return true;
    });
}
async function readFigmaFile(token, fileId) {
    // 1. Get file structure (pages + top-level frames)
    const fileRes = await fetch(`https://api.figma.com/v1/files/${fileId}?depth=2`, {
        headers: { 'X-Figma-Token': token },
    });
    if (!fileRes.ok) {
        const err = await fileRes.json();
        throw new Error(err.err ?? `Figma API error: ${fileRes.status}`);
    }
    const file = await fileRes.json();
    const sections = [`# Arquivo: ${file.name}\n`];
    // 2. Filter to content pages only
    const contentPages = file.document.children.filter((page) => !CONTENT_PAGE_SKIP.test(page.name));
    // 3. For each content page, get nodes at depth 8 to extract text
    for (const page of contentPages.slice(0, MAX_PAGES)) {
        const topFrames = (page.children ?? []).slice(0, MAX_TOP_FRAMES_PER_PAGE);
        if (topFrames.length === 0)
            continue;
        const ids = topFrames.map((f) => f.id).join(',');
        const nodesRes = await fetch(`https://api.figma.com/v1/files/${fileId}/nodes?ids=${ids}&depth=8`, { headers: { 'X-Figma-Token': token } });
        if (!nodesRes.ok)
            continue;
        const nodesData = await nodesRes.json();
        const pageTexts = [];
        for (const nodeData of Object.values(nodesData.nodes)) {
            const texts = extractText(nodeData.document);
            pageTexts.push(...texts);
        }
        const unique = deduplicateTexts(pageTexts).filter((t) => !t.startsWith('Loren ipsum') &&
            !t.startsWith('[Descripción') &&
            t !== 'Lorem' &&
            t.length > 3);
        const limited = [];
        let pageChars = 0;
        for (const line of unique) {
            if (limited.length >= MAX_LINES_PER_PAGE)
                break;
            const nextSize = line.length + 1;
            if (pageChars + nextSize > MAX_PAGE_CHARS)
                break;
            limited.push(line);
            pageChars += nextSize;
        }
        if (limited.length > 0) {
            sections.push(`## Página: ${page.name}\n`);
            sections.push(limited.join('\n'));
            sections.push('');
        }
    }
    return sections.join('\n');
}
async function handler(req) {
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            headers: corsHeaders(),
        });
    }
    const { token, referenceFileId, destinationFileId } = await req.json();
    if (!referenceFileId && !destinationFileId) {
        return new Response(JSON.stringify({ error: 'Informe ao menos um arquivo Figma.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        });
    }
    try {
        const [refContent, destContent] = await Promise.all([
            referenceFileId ? readFigmaFile(token, referenceFileId) : Promise.resolve(''),
            destinationFileId && destinationFileId !== referenceFileId
                ? readFigmaFile(token, destinationFileId).catch(() => '')
                : Promise.resolve(''),
        ]);
        const rawContext = [
            '=== ARQUIVO DE REFERÊNCIA (design do componente) ===',
            refContent,
            destContent
                ? ['=== ARQUIVO DE DESTINO (guideline em construção) ===', destContent].join('\n')
                : '',
        ]
            .filter(Boolean)
            .join('\n\n');
        const { context, truncated } = capContext(rawContext);
        return new Response(JSON.stringify({ context, truncated }), {
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders(),
            },
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao ler arquivo';
        return new Response(JSON.stringify({ error: message }), {
            status: 400,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders(),
            },
        });
    }
}

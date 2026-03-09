console.log('[Guidely] main.ts loading...')

import { buildGuideline } from './builder'
import type { UIToPlugin } from './types'

const KEY_FIGMA = 'figma_token'
const KEY_ANTHROPIC = 'anthropic_key'
const KEY_GUIDELINE = 'last_guideline'
let activeBuildRequestId: string | null = null

function createRequestId(): string {
  return `build-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
  onTimeout?: () => void
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      onTimeout?.()
      reject(new Error(timeoutMessage))
    }, timeoutMs)
  })

  try {
    return await Promise.race([promise, timeoutPromise]) as T
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

console.log('[Guidely] about to showUI...')
figma.showUI(__html__, {
  width: 400,
  height: 640,
  title: 'Guidely',
  themeColors: true,
})
console.log('[Guidely] showUI done, setting up credential loader...')

// Send stored credentials to UI on open
async function sendStoredCredentials() {
  const [figmaToken, anthropicKey] = await Promise.all([
    figma.clientStorage.getAsync(KEY_FIGMA) as Promise<string | undefined>,
    figma.clientStorage.getAsync(KEY_ANTHROPIC) as Promise<string | undefined>,
  ])
  figma.ui.postMessage({
    type: 'STORED_CREDENTIALS',
    figmaToken: figmaToken ?? '',
    anthropicKey: anthropicKey ?? '',
  })
}
sendStoredCredentials()

console.log('[Guidely] setting up onmessage handler...')
figma.ui.onmessage = async (msg: UIToPlugin) => {
  console.log('[Guidely] received message:', msg.type)
  if (msg.type === 'GET_CREDENTIALS') {
    const [figmaToken, anthropicKey] = await Promise.all([
      figma.clientStorage.getAsync(KEY_FIGMA) as Promise<string | undefined>,
      figma.clientStorage.getAsync(KEY_ANTHROPIC) as Promise<string | undefined>,
    ])
    figma.ui.postMessage({
      type: 'STORED_CREDENTIALS',
      figmaToken: figmaToken ?? '',
      anthropicKey: anthropicKey ?? '',
    })
  }

  if (msg.type === 'SAVE_CREDENTIALS') {
    await Promise.all([
      figma.clientStorage.setAsync(KEY_FIGMA, msg.figmaToken),
      figma.clientStorage.setAsync(KEY_ANTHROPIC, msg.anthropicKey),
    ])
  }

  if (msg.type === 'SAVE_GUIDELINE') {
    await figma.clientStorage.setAsync(KEY_GUIDELINE, msg.guideline)
  }

  if (msg.type === 'GET_GUIDELINE') {
    const guideline = await figma.clientStorage.getAsync(KEY_GUIDELINE) as string | undefined
    figma.ui.postMessage({ type: 'STORED_GUIDELINE', guideline: guideline ?? '' })
  }

  if (msg.type === 'BUILD_SLIDES') {
    const requestId = msg.requestId ?? createRequestId()

    if (activeBuildRequestId) {
      const message = 'Ainda existe uma criação de slides em andamento. Aguarde alguns segundos antes de tentar novamente.'
      figma.ui.postMessage({ type: 'BUILD_ERROR', message, requestId })
      figma.notify(`⚠️ ${message}`, { timeout: 4200 })
      return
    }

    activeBuildRequestId = requestId
    const totalSlides = msg.data.slides?.length ?? 0
    const timeoutMs = Math.min(720000, Math.max(120000, totalSlides * 10000))
    let didTimeout = false

    figma.ui.postMessage({
      type: 'BUILD_STARTED',
      requestId,
      totalSlides,
    })

    figma.ui.postMessage({
      type: 'BUILD_STAGE',
      requestId,
      stage: 'Preparando criação dos slides',
      progress: 0.01,
    })

    const buildPromise = buildGuideline(msg.data, {
      onProgress: (stage, progress) => {
        figma.ui.postMessage({
          type: 'BUILD_STAGE',
          requestId,
          stage,
          progress,
        })
      },
      shouldAbort: () => didTimeout || activeBuildRequestId !== requestId,
    })

    try {
      await withTimeout(
        buildPromise,
        timeoutMs,
        `A criação dos slides excedeu ${Math.round(timeoutMs / 1000)}s e foi interrompida para evitar travamento.`,
        () => {
          didTimeout = true
          figma.ui.postMessage({
            type: 'BUILD_STAGE',
            requestId,
            stage: 'Tempo limite atingido. Encerrando criação anterior…',
            progress: 0.99,
          })
        }
      )

      figma.ui.postMessage({ type: 'BUILD_COMPLETE', count: msg.data.slides.length, requestId })
      figma.notify(`✅ ${msg.data.slides.length} slides criados!`, { timeout: 3000 })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      figma.ui.postMessage({ type: 'BUILD_ERROR', message, requestId })
      figma.notify(`❌ ${message}`, { error: true })
    } finally {
      if (didTimeout) {
        const releaseLock = () => {
          if (activeBuildRequestId === requestId) {
            activeBuildRequestId = null
          }
        }

        buildPromise
          .then(
            () => releaseLock(),
            () => releaseLock()
          )
      } else if (activeBuildRequestId === requestId) {
        activeBuildRequestId = null
      }
    }
  }

  if (msg.type === 'CLOSE') figma.closePlugin()

  // Debug: log UI errors to Figma console
  if ((msg as { type: string }).type === 'LOG_ERROR') {
    const m = msg as unknown as { message: string; stack: string }
    console.error('[UI ERROR]', m.message)
    if (m.stack) console.error('[STACK]', m.stack)
  }
}

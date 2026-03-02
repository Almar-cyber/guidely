import { buildGuideline } from './builder'
import type { UIToPlugin } from './types'

const KEY_FIGMA = 'figma_token'
const KEY_ANTHROPIC = 'anthropic_key'

figma.showUI(__html__, {
  width: 400,
  height: 640,
  title: 'Guidely',
  themeColors: true,
})

// Send stored credentials to UI on open
;(async () => {
  const [figmaToken, anthropicKey] = await Promise.all([
    figma.clientStorage.getAsync(KEY_FIGMA) as Promise<string | undefined>,
    figma.clientStorage.getAsync(KEY_ANTHROPIC) as Promise<string | undefined>,
  ])
  figma.ui.postMessage({
    type: 'STORED_CREDENTIALS',
    figmaToken: figmaToken ?? '',
    anthropicKey: anthropicKey ?? '',
  })
})()

figma.ui.onmessage = async (msg: UIToPlugin) => {
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

  if (msg.type === 'BUILD_SLIDES') {
    try {
      await buildGuideline(msg.data)
      figma.ui.postMessage({ type: 'BUILD_COMPLETE', count: msg.data.slides.length })
      figma.notify(`✅ ${msg.data.slides.length} slides criados!`, { timeout: 3000 })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      figma.ui.postMessage({ type: 'BUILD_ERROR', message })
      figma.notify(`❌ ${message}`, { error: true })
    }
  }

  if (msg.type === 'CLOSE') figma.closePlugin()
}

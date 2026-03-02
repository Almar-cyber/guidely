import { buildGuideline } from './builder'
import type { UIToPlugin } from './types'

const TOKEN_KEY = 'figma_token'

figma.showUI(__html__, {
  width: 400,
  height: 640,
  title: 'UX Guidelines AI',
  themeColors: true,
})

// Send stored token to UI on open
;(async () => {
  const token = await figma.clientStorage.getAsync(TOKEN_KEY) as string | undefined
  if (token) figma.ui.postMessage({ type: 'STORED_TOKEN', token })
})()

figma.ui.onmessage = async (msg: UIToPlugin) => {
  if (msg.type === 'GET_TOKEN') {
    const token = await figma.clientStorage.getAsync(TOKEN_KEY) as string | undefined
    figma.ui.postMessage({ type: 'STORED_TOKEN', token: token ?? '' })
  }

  if (msg.type === 'SAVE_TOKEN') {
    await figma.clientStorage.setAsync(TOKEN_KEY, msg.token)
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

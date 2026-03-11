console.log('[Guidely UI] v3 loaded at', new Date().toISOString())

import { createRoot } from 'react-dom/client'
import App from './App'

// Global error catcher — helps diagnose "(intermediate value) is not a function"
window.addEventListener('error', (e) => {
  const msg = `[GLOBAL ERROR] ${e.message} @ ${e.filename}:${e.lineno}:${e.colno}`
  console.error(msg, e.error?.stack)
  // Send to plugin for visibility
  parent.postMessage({ pluginMessage: { type: 'LOG_ERROR', message: msg, stack: e.error?.stack ?? '' } }, '*')
})

window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason instanceof Error ? e.reason.message : String(e.reason)
  const stack = e.reason instanceof Error ? e.reason.stack : ''
  const msg = `[UNHANDLED REJECTION] ${reason}`
  console.error(msg, stack)
  parent.postMessage({ pluginMessage: { type: 'LOG_ERROR', message: msg, stack: stack ?? '' } }, '*')
})

const root = document.getElementById('root')!
createRoot(root).render(<App />)

import { useState, useEffect, useRef, useCallback } from 'react'
import type { GuidelineData, Slide, PluginToUI } from '../types'
import { streamChat, readFigmaFiles, extractFileId, type Message } from './claude'
import { exportToMarkdown } from '../doc-exporter'

type Step = 'connect' | 'files' | 'analyzing' | 'questions' | 'preview' | 'output-figma' | 'output-doc'
type AnalyzeStatus = 'reading-ref' | 'reading-dest' | 'done'

const STEP_PROGRESS: Record<Step, number> = {
  connect: 20, files: 40, analyzing: 60,
  questions: 75, preview: 95,
  'output-figma': 100, 'output-doc': 100,
}

function slideName(s: Slide): string {
  if ('title' in s) return (s as { title: string }).title
  if (s.type === 'contact') return (s as { channel: string }).channel
  return s.type
}
function slideImageNote(s: Slide): string | undefined {
  return 'imageNote' in s ? (s as { imageNote?: string }).imageNote : undefined
}

export default function App() {
  const [step, setStep] = useState<Step>('connect')

  const [figmaToken, setFigmaToken] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [figmaVisible, setFigmaVisible] = useState(false)
  const [anthropicVisible, setAnthropicVisible] = useState(false)

  const [refUrl, setRefUrl] = useState('')
  const [destUrl, setDestUrl] = useState('')

  const [analyzeStatus, setAnalyzeStatus] = useState<AnalyzeStatus>('reading-ref')
  const [figmaContext, setFigmaContext] = useState('')
  const [analyzeError, setAnalyzeError] = useState('')

  const [messages, setMessages] = useState<Message[]>([])
  const [streamingText, setStreamingText] = useState('')
  const [chatInput, setChatInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)

  const [guideline, setGuideline] = useState<GuidelineData | null>(null)
  const [buildError, setBuildError] = useState('')
  const [docMarkdown, setDocMarkdown] = useState('')

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    parent.postMessage({ pluginMessage: { type: 'GET_CREDENTIALS' } }, '*')
  }, [])

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage as PluginToUI | undefined
      if (!msg) return
      if (msg.type === 'STORED_CREDENTIALS') {
        if (msg.figmaToken) setFigmaToken(msg.figmaToken)
        if (msg.anthropicKey) setAnthropicKey(msg.anthropicKey)
        if (msg.figmaToken && msg.anthropicKey) setStep('files')
      }
      if (msg.type === 'BUILD_COMPLETE') setStep('output-figma')
      if (msg.type === 'BUILD_ERROR') { setBuildError(msg.message); setStep('preview') }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(id)
  }, [messages, streamingText])

  const handleSaveCredentials = () => {
    if (!figmaToken.trim() || !anthropicKey.trim()) return
    parent.postMessage({ pluginMessage: { type: 'SAVE_CREDENTIALS', figmaToken: figmaToken.trim(), anthropicKey: anthropicKey.trim() } }, '*')
    setStep('files')
  }

  const handleAnalyze = async () => {
    const refId = extractFileId(refUrl) ?? undefined
    const destId = extractFileId(destUrl) ?? undefined
    if (refUrl.trim() && !refId) { setAnalyzeError('URL de referência inválida.'); return }
    if (destUrl.trim() && !destId) { setAnalyzeError('URL de destino inválida.'); return }
    if (!refId && !destId) { setAnalyzeError('Cole ao menos uma URL do Figma.'); return }

    setAnalyzeError('')
    setStep('analyzing')
    try {
      setAnalyzeStatus('reading-ref')
      const context = await readFigmaFiles(figmaToken, anthropicKey, refId ?? destId!, destId && destId !== refId ? destId : undefined)
      setAnalyzeStatus('done')
      setFigmaContext(context)
      await new Promise((r) => setTimeout(r, 300))
      setStep('questions')
      startConversation(context)
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Erro ao ler arquivo. Tente novamente.')
      setStep('files')
    }
  }

  const startConversation = useCallback((context: string) => {
    const init: Message = { role: 'user', content: 'Analisou os arquivos Figma. Faça as perguntas necessárias para criar o guideline.' }
    setMessages([init])
    setIsStreaming(true)
    setStreamingText('')
    let text = ''
    streamChat([init], context, anthropicKey, {
      onText: (d) => { text += d; setStreamingText(text) },
      onGuideline: (data) => {
        setGuideline(data as GuidelineData)
        setStreamingText('')
        setIsStreaming(false)
        setMessages((p) => [...p, { role: 'assistant', content: 'Guideline pronto.' }])
        setStep('preview')
      },
      onError: (m) => { setStreamingText(''); setIsStreaming(false); setMessages((p) => [...p, { role: 'assistant', content: m }]) },
      onDone: () => {
        if (text) { setMessages((p) => [...p, { role: 'assistant', content: text }]); setStreamingText('') }
        setIsStreaming(false)
      },
    })
  }, [anthropicKey])

  const sendMessage = useCallback((text: string) => {
    if (!text.trim() || isStreaming) return
    const userMsg: Message = { role: 'user', content: text.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setChatInput('')
    setIsStreaming(true)
    setStreamingText('')
    let assistantText = ''
    streamChat(newMessages, figmaContext, anthropicKey, {
      onText: (d) => { assistantText += d; setStreamingText(assistantText) },
      onGuideline: (data) => {
        setGuideline(data as GuidelineData)
        setStreamingText('')
        setIsStreaming(false)
        setMessages((p) => [...p, { role: 'assistant', content: 'Guideline pronto.' }])
        setStep('preview')
      },
      onError: (m) => { setStreamingText(''); setIsStreaming(false); setMessages((p) => [...p, { role: 'assistant', content: m }]) },
      onDone: () => {
        if (assistantText) { setMessages((p) => [...p, { role: 'assistant', content: assistantText }]); setStreamingText('') }
        setIsStreaming(false)
      },
    })
  }, [messages, isStreaming, figmaContext, anthropicKey])

  const handleBuildFigma = () => {
    if (!guideline) return
    setBuildError('')
    parent.postMessage({ pluginMessage: { type: 'BUILD_SLIDES', data: guideline } }, '*')
  }

  const handleExportDoc = () => {
    if (!guideline) return
    setDocMarkdown(exportToMarkdown(guideline))
    setStep('output-doc')
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(docMarkdown).catch(() => {
      const el = document.querySelector('.doc-textarea') as HTMLTextAreaElement
      el?.select(); document.execCommand('copy')
    })
  }

  const handleReset = () => {
    setStep('files')
    setMessages([])
    setGuideline(null)
    setStreamingText('')
    setChatInput('')
    setFigmaContext('')
    setAnalyzeError('')
    setBuildError('')
    setDocMarkdown('')
    setRefUrl('')
    setDestUrl('')
  }

  const credentialsValid = figmaToken.trim().length > 0 && anthropicKey.trim().length > 0

  return (
    <>
      {/* Topbar */}
      <div className="topbar">
        <div className="topbar-logo">✦</div>
        <span className="topbar-title">Guidely</span>
      </div>

      {/* Progress */}
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${STEP_PROGRESS[step]}%` }} />
      </div>

      {/* ── Credenciais ── */}
      {step === 'connect' && (
        <div className="scroll">
          <div className="step">
            <div className="step-title">Credenciais</div>

            <label>
              Token Figma
              <span className="hint">
                <span className="link" onClick={() => window.open('https://www.figma.com/settings', '_blank')}>
                  Obter token →
                </span>
              </span>
              <div className="token-wrap">
                <input type={figmaVisible ? 'text' : 'password'} placeholder="figd_..." value={figmaToken} onChange={(e) => setFigmaToken(e.target.value)} />
                <button className="token-toggle" onClick={() => setFigmaVisible(v => !v)}>{figmaVisible ? '🙈' : '👁️'}</button>
              </div>
            </label>

            <label>
              Chave Anthropic
              <span className="hint">
                <span className="link" onClick={() => window.open('https://console.anthropic.com/settings/keys', '_blank')}>
                  Criar chave →
                </span>
              </span>
              <div className="token-wrap">
                <input type={anthropicVisible ? 'text' : 'password'} placeholder="sk-ant-..." value={anthropicKey} onChange={(e) => setAnthropicKey(e.target.value)} />
                <button className="token-toggle" onClick={() => setAnthropicVisible(v => !v)}>{anthropicVisible ? '🙈' : '👁️'}</button>
              </div>
            </label>

            <button className="btn btn-primary" onClick={handleSaveCredentials} disabled={!credentialsValid}>
              Continuar
            </button>
          </div>
        </div>
      )}

      {/* ── Arquivos ── */}
      {step === 'files' && (
        <div className="scroll">
          <div className="step">
            <div className="step-title">Arquivos Figma</div>
            <div className="step-sub">Cole ao menos uma URL. A IA lê o conteúdo e faz perguntas para completar o guideline.</div>

            <label>
              Referência <span className="hint">(handoff do componente)</span>
              <input type="text" placeholder="https://www.figma.com/design/..." value={refUrl} onChange={(e) => setRefUrl(e.target.value)} />
            </label>

            <label>
              Destino <span className="hint">(onde criar o guideline)</span>
              <input type="text" placeholder="https://www.figma.com/design/..." value={destUrl} onChange={(e) => setDestUrl(e.target.value)} />
            </label>

            {analyzeError && <div className="error-card">{analyzeError}</div>}

            <button className="btn btn-primary" onClick={handleAnalyze} disabled={!refUrl.trim() && !destUrl.trim()}>
              Analisar
            </button>
            <button className="btn-ghost btn" onClick={() => setStep('connect')}>← Credenciais</button>
          </div>
        </div>
      )}

      {/* ── Analisando ── */}
      {step === 'analyzing' && (
        <div className="scroll">
          <div className="analyze-state">
            <div className="spinner" />
            <div className="analyze-title">Lendo arquivos…</div>
            <div className="analyze-steps">
              {([
                { id: 'reading-ref', label: 'Arquivo de referência' },
                { id: 'reading-dest', label: 'Arquivo de destino' },
                { id: 'done', label: 'Iniciando conversa' },
              ] as const)
                .filter((s) => s.id !== 'reading-dest' || destUrl)
                .map((s) => {
                  const order = ['reading-ref', 'reading-dest', 'done']
                  const cur = order.indexOf(analyzeStatus)
                  const idx = order.indexOf(s.id)
                  const cls = idx < cur ? 'done' : idx === cur ? 'active' : ''
                  return (
                    <div key={s.id} className={`analyze-step-row ${cls}`}>
                      <div className="step-dot" />
                      {s.label}{idx < cur ? ' ✓' : ''}
                    </div>
                  )
                })}
            </div>
          </div>
        </div>
      )}

      {/* ── Perguntas ── */}
      {step === 'questions' && (
        <>
          <div className="scroll">
            <div className="messages">
              {messages.map((msg, i) => (
                <div key={i} className={`bubble-wrap ${msg.role}`}>
                  <div className={`bubble ${msg.role}`}>{msg.content}</div>
                </div>
              ))}
              {streamingText && <div className="bubble-wrap assistant"><div className="bubble assistant">{streamingText}</div></div>}
              {isStreaming && !streamingText && <div className="bubble-wrap assistant"><div className="typing"><span /><span /><span /></div></div>}
              <div ref={messagesEndRef} />
            </div>
          </div>
          <div className="chat-input-bar">
            <textarea
              className="chat-textarea"
              placeholder={isStreaming ? 'Aguarde…' : 'Responda ou diga "gerar"'}
              value={chatInput}
              disabled={isStreaming}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(chatInput) } }}
              onInput={(e) => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 100)}px` }}
              rows={1}
            />
            <button className="send-btn" onClick={() => sendMessage(chatInput)} disabled={isStreaming || !chatInput.trim()}>
              <svg width="14" height="14" viewBox="0 0 14 14"><path d="M13 1L1 5.5L5.5 7.5L7.5 13L13 1Z" /></svg>
            </button>
          </div>
        </>
      )}

      {/* ── Preview ── */}
      {step === 'preview' && guideline && (
        <>
          <div className="preview-header">
            <span style={{ fontSize: 13, fontWeight: 600 }}>{guideline.title}</span>
            <span className="preview-count">{guideline.slides.length} slides</span>
          </div>
          <div className="scroll">
            <div className="slide-list">
              {guideline.slides.map((slide, i) => {
                const note = slideImageNote(slide)
                return (
                  <div key={i} className="slide-row">
                    <span className="slide-num">{i + 1}</span>
                    <div className="slide-info">
                      <span className="slide-name">{slideName(slide)}</span>
                      <span className="slide-type">{slide.type}</span>
                      {note && <span className="slide-img-note">📸 {note}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          {buildError && <div style={{ padding: '0 16px 8px' }}><div className="error-card">{buildError}</div></div>}
          <div className="preview-actions">
            <button className="btn btn-accent" onClick={handleBuildFigma}>✨ Criar slides no Figma</button>
            <div className="btn-row">
              <button className="btn btn-outline" onClick={handleExportDoc}>📄 Exportar doc</button>
              <button className="btn btn-outline" onClick={() => setStep('questions')}>✏️ Ajustar</button>
            </div>
            <button className="btn-ghost btn" onClick={handleReset}>Novo guideline</button>
          </div>
        </>
      )}

      {/* ── Concluído: Figma ── */}
      {step === 'output-figma' && (
        <div className="scroll">
          <div className="done-state">
            <div className="done-icon">🎉</div>
            <div className="done-title">{guideline?.slides.length} slides criados</div>
            <div className="done-sub">Adicione os mockups nos locais marcados com 📸.</div>
            {guideline && (
              <div style={{ width: '100%', marginTop: 8 }}>
                {guideline.slides.filter(slideImageNote).map((s, i) => (
                  <div key={i} className="info-card" style={{ marginBottom: 6 }}>
                    <span className="info-icon">📸</span>
                    <div className="info-body">
                      <div className="info-title">{slideName(s)}</div>
                      <div className="info-text">{slideImageNote(s)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="btn-row" style={{ marginTop: 8, width: '100%' }}>
              <button className="btn btn-outline" onClick={handleExportDoc}>📄 Exportar doc</button>
              <button className="btn btn-outline" onClick={handleReset}>Novo</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Concluído: Doc ── */}
      {step === 'output-doc' && (
        <div className="doc-output">
          <div className="doc-toolbar">
            <span className="doc-toolbar-title">Documento</span>
            <button className="doc-copy-btn" onClick={handleCopy}>Copiar</button>
          </div>
          <textarea className="doc-textarea" value={docMarkdown} readOnly />
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--color-border-2)' }}>
            <div className="btn-row">
              <button className="btn btn-outline" onClick={() => setStep('preview')}>← Voltar</button>
              <button className="btn btn-outline" onClick={handleReset}>Novo</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

import { useState, useEffect, useRef, useCallback } from 'react'
import type { GuidelineData, Slide, PluginToUI } from '../types'
import { streamChat, readFigmaFiles, extractFileId, startFigmaOAuth, pollFigmaToken, startAnthropicOAuth, pollAnthropicKey, type Message } from './claude'
import { exportToMarkdown } from '../doc-exporter'

type Step = 'onboarding' | 'connect' | 'files' | 'analyzing' | 'questions' | 'preview' | 'output-figma' | 'output-doc'
type AnalyzeStatus = 'reading-ref' | 'reading-dest' | 'done'

const STEP_PROGRESS: Record<Step, number> = {
  onboarding: 0, connect: 20, files: 40, analyzing: 60,
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
  const [step, setStep] = useState<Step>('onboarding')

  const [figmaToken, setFigmaToken] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [anthropicOAuthStatus, setAnthropicOAuthStatus] = useState<'idle' | 'waiting' | 'done' | 'error'>('idle')
  const [anthropicOAuthError, setAnthropicOAuthError] = useState('')
  const anthropicPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [oauthState, setOauthState] = useState<string | null>(null)
  const [oauthStatus, setOauthStatus] = useState<'idle' | 'waiting' | 'done' | 'error'>('idle')
  const [oauthError, setOauthError] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  // Cleanup polling on unmount
  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (anthropicPollRef.current) clearInterval(anthropicPollRef.current)
  }, [])

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
        // Skip onboarding and connect if already configured
        if (msg.figmaToken && msg.anthropicKey) setStep('files')
        else if (msg.figmaToken || msg.anthropicKey) setStep('connect')
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

  const handleConnectAnthropic = async () => {
    setAnthropicOAuthStatus('waiting')
    setAnthropicOAuthError('')
    try {
      const { url, state } = await startAnthropicOAuth()
      window.open(url, '_blank')

      let attempts = 0
      anthropicPollRef.current = setInterval(async () => {
        attempts++
        if (attempts > 150) {
          clearInterval(anthropicPollRef.current!)
          setAnthropicOAuthStatus('error')
          setAnthropicOAuthError('Tempo esgotado. Tente conectar novamente.')
          return
        }
        try {
          const key = await pollAnthropicKey(state)
          if (key) {
            clearInterval(anthropicPollRef.current!)
            setAnthropicKey(key)
            setAnthropicOAuthStatus('done')
          }
        } catch { /* keep polling */ }
      }, 2000)
    } catch (err) {
      setAnthropicOAuthStatus('error')
      setAnthropicOAuthError(err instanceof Error ? err.message : 'Erro ao conectar com Anthropic.')
    }
  }

  const handleConnectFigma = async () => {
    setOauthStatus('waiting')
    setOauthError('')
    try {
      const { url, state } = await startFigmaOAuth()
      setOauthState(state)
      window.open(url, '_blank')

      // Poll every 2s for up to 5 minutes
      let attempts = 0
      const MAX = 150
      pollRef.current = setInterval(async () => {
        attempts++
        if (attempts > MAX) {
          clearInterval(pollRef.current!)
          setOauthStatus('error')
          setOauthError('Tempo esgotado. Tente conectar novamente.')
          return
        }
        try {
          const token = await pollFigmaToken(state)
          if (token) {
            clearInterval(pollRef.current!)
            setFigmaToken(token)
            setOauthStatus('done')
          }
        } catch { /* keep polling */ }
      }, 2000)
    } catch (err) {
      setOauthStatus('error')
      setOauthError(err instanceof Error ? err.message : 'Erro ao conectar com Figma.')
    }
  }

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

  const figmaConnected = oauthStatus === 'done' || figmaToken.trim().length > 0
  const anthropicConnected = anthropicOAuthStatus === 'done' || (anthropicKey.trim().length > 20)
  const credentialsValid = figmaConnected && anthropicConnected

  return (
    <>
      {/* ── Onboarding (tela cheia, sem topbar) ── */}
      {step === 'onboarding' && (
        <div className="onboarding">
          <div className="onboarding-logo">✦</div>
          <div className="onboarding-title">Guidely</div>
          <div className="onboarding-tagline">Construa guidelines simples de entender.</div>

          <div className="onboarding-steps">
            {[
              { icon: '📂', label: 'Aponta para o arquivo Figma' },
              { icon: '🤖', label: 'A IA analisa e faz perguntas' },
              { icon: '✨', label: 'Gera slides prontos no canvas' },
            ].map(({ icon, label }) => (
              <div key={label} className="onboarding-step">
                <span className="onboarding-step-icon">{icon}</span>
                <span className="onboarding-step-label">{label}</span>
              </div>
            ))}
          </div>

          <button className="btn btn-primary onboarding-cta" onClick={() => setStep('connect')}>
            Começar
          </button>
          <div className="onboarding-note">Configuração rápida · Feito pela equipe CCAP</div>
        </div>
      )}

      {/* Topbar (oculta no onboarding) */}
      {step !== 'onboarding' && (
        <div className="topbar">
          <div className="topbar-logo">✦</div>
          <span className="topbar-title">Guidely</span>
        </div>
      )}

      {/* Progress (oculto no onboarding) */}
      {step !== 'onboarding' && (
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${STEP_PROGRESS[step]}%` }} />
        </div>
      )}

      {/* ── Credenciais ── */}
      {step === 'connect' && (
        <div className="scroll">
          <div className="step">
            <div className="step-title">Conectar contas</div>
            <div className="step-sub">Salvas só no seu computador. Nunca enviadas a terceiros.</div>

            {/* Figma OAuth */}
            {oauthStatus !== 'done' ? (
              <div className="oauth-block">
                <div className="oauth-label">Conta do Figma</div>
                <div className="oauth-hint">Para ler seus arquivos de design</div>
                {oauthStatus === 'waiting' ? (
                  <div className="oauth-waiting">
                    <div className="oauth-spinner" />
                    <span>Aguardando aprovação no browser…</span>
                  </div>
                ) : (
                  <button className="btn oauth-btn" onClick={handleConnectFigma}>
                    <svg width="16" height="16" viewBox="0 0 38 57" fill="none">
                      <path d="M19 28.5A9.5 9.5 0 1 1 28.5 19 9.5 9.5 0 0 1 19 28.5z" fill="#1ABCFE"/>
                      <path d="M9.5 47.5A9.5 9.5 0 0 1 19 38h9.5v9.5A9.5 9.5 0 0 1 9.5 47.5z" fill="#0ACF83"/>
                      <path d="M0 28.5A9.5 9.5 0 0 1 9.5 19H19v19H9.5A9.5 9.5 0 0 1 0 28.5z" fill="#FF7262"/>
                      <path d="M0 9.5A9.5 9.5 0 0 1 9.5 0H19v19H9.5A9.5 9.5 0 0 1 0 9.5z" fill="#F24E1E"/>
                      <path d="M19 0h9.5A9.5 9.5 0 0 1 28.5 19H19V0z" fill="#FF7262"/>
                    </svg>
                    Conectar com Figma
                  </button>
                )}
                {oauthStatus === 'error' && (
                  <div className="error-card" style={{ marginTop: 8, fontSize: 12 }}>{oauthError}</div>
                )}
              </div>
            ) : (
              <div className="oauth-connected">
                <span className="oauth-check">✅</span>
                <span>Figma conectado</span>
                <button className="link" style={{ marginLeft: 'auto', fontSize: 11 }} onClick={() => { setOauthStatus('idle'); setFigmaToken('') }}>Trocar</button>
              </div>
            )}

            {/* Anthropic OAuth */}
            {anthropicOAuthStatus !== 'done' ? (
              <div className="oauth-block">
                <div className="oauth-label">Conta do Claude</div>
                <div className="oauth-hint">Para gerar o guideline com IA</div>
                {anthropicOAuthStatus === 'waiting' ? (
                  <div className="oauth-waiting">
                    <div className="oauth-spinner" />
                    <span>Aguardando aprovação no browser…</span>
                  </div>
                ) : (
                  <button className="btn oauth-btn" onClick={handleConnectAnthropic}>
                    <svg width="16" height="16" viewBox="0 0 32 32" fill="none">
                      <path d="M23.5 8.9L16 4.5 8.5 8.9v8.8l7.5 4.4 7.5-4.4V8.9z" fill="#D97757"/>
                    </svg>
                    Conectar com Claude
                  </button>
                )}
                {anthropicOAuthStatus === 'error' && (
                  <div className="error-card" style={{ marginTop: 8, fontSize: 12 }}>{anthropicOAuthError}</div>
                )}
              </div>
            ) : (
              <div className="oauth-connected">
                <span className="oauth-check">✅</span>
                <span>Claude conectado</span>
                <button className="link" style={{ marginLeft: 'auto', fontSize: 11 }} onClick={() => { setAnthropicOAuthStatus('idle'); setAnthropicKey('') }}>Trocar</button>
              </div>
            )}

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
            <div className="step-sub">A IA lê o conteúdo e faz perguntas para montar o guideline. Ao menos um é necessário.</div>

            <label>
              Arquivo com o design
              <span className="hint">Cole a URL do handoff ou do componente</span>
              <input type="text" placeholder="https://www.figma.com/design/..." value={refUrl} onChange={(e) => setRefUrl(e.target.value)} />
            </label>

            <label>
              Arquivo destino <span className="hint">(opcional)</span>
              <span className="hint">Onde os slides serão criados</span>
              <input type="text" placeholder="https://www.figma.com/design/..." value={destUrl} onChange={(e) => setDestUrl(e.target.value)} />
            </label>

            {analyzeError && <div className="error-card">{analyzeError}</div>}

            <button className="btn btn-primary" onClick={handleAnalyze} disabled={!refUrl.trim() && !destUrl.trim()}>
              Analisar
            </button>
            <button className="btn-ghost btn" onClick={() => setStep('connect')}>← Voltar</button>
          </div>
        </div>
      )}

      {/* ── Analisando ── */}
      {step === 'analyzing' && (
        <div className="scroll">
          <div className="analyze-state">
            <div className="spinner" />
            <div className="analyze-title">Lendo arquivos…</div>
            <div className="analyze-sub">Isso pode levar alguns segundos.</div>
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
              placeholder={isStreaming ? 'Aguarde…' : 'Responda a pergunta ou escreva "gerar" para criar já'}
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
            <div className="done-title">{guideline?.slides.length} slides criados!</div>
            <div className="done-sub">Abra o Figma para ver os slides no canvas. Onde aparecer 📸, insira o print da tela correspondente.</div>
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

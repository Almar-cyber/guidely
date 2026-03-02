import { useState, useEffect, useRef, useCallback } from 'react'
import type { GuidelineData, Slide, PluginToUI } from '../types'
import { streamChat, readFigmaFiles, extractFileId, type Message } from './claude'
import { exportToMarkdown } from '../doc-exporter'

// ─── Types ───────────────────────────────────────────────────

type Step =
  | 'welcome'
  | 'connect'
  | 'files'
  | 'analyzing'
  | 'questions'
  | 'preview'
  | 'output-figma'
  | 'output-doc'

type AnalyzeStatus = 'reading-ref' | 'reading-dest' | 'processing' | 'done'

// ─── Helpers ─────────────────────────────────────────────────

const STEP_LABELS: Record<Step, string> = {
  welcome: '',
  connect: '1 de 5',
  files: '2 de 5',
  analyzing: '3 de 5',
  questions: '4 de 5',
  preview: '5 de 5',
  'output-figma': '',
  'output-doc': '',
}

const STEP_PROGRESS: Record<Step, number> = {
  welcome: 0,
  connect: 20,
  files: 40,
  analyzing: 60,
  questions: 75,
  preview: 95,
  'output-figma': 100,
  'output-doc': 100,
}

function slideName(slide: Slide): string {
  if ('title' in slide) return (slide as { title: string }).title
  if (slide.type === 'contact') return (slide as { channel: string }).channel
  return slide.type
}

function slideImageNote(slide: Slide): string | undefined {
  return 'imageNote' in slide ? (slide as { imageNote?: string }).imageNote : undefined
}

// ─── Main component ──────────────────────────────────────────

export default function App() {
  const [step, setStep] = useState<Step>('welcome')

  // Auth
  const [token, setToken] = useState('')
  const [tokenVisible, setTokenVisible] = useState(false)

  // Files
  const [refUrl, setRefUrl] = useState('')
  const [destUrl, setDestUrl] = useState('')

  // Analyze
  const [analyzeStatus, setAnalyzeStatus] = useState<AnalyzeStatus>('reading-ref')
  const [figmaContext, setFigmaContext] = useState('')
  const [analyzeError, setAnalyzeError] = useState('')

  // Questions (chat)
  const [messages, setMessages] = useState<Message[]>([])
  const [streamingText, setStreamingText] = useState('')
  const [chatInput, setChatInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)

  // Guideline
  const [guideline, setGuideline] = useState<GuidelineData | null>(null)

  // Output
  const [buildError, setBuildError] = useState('')
  const [docMarkdown, setDocMarkdown] = useState('')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatTextareaRef = useRef<HTMLTextAreaElement>(null)

  // Load stored token on mount
  useEffect(() => {
    parent.postMessage({ pluginMessage: { type: 'GET_TOKEN' } }, '*')
  }, [])

  // Listen for messages from main thread
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage as PluginToUI | undefined
      if (!msg) return

      if (msg.type === 'STORED_TOKEN' && msg.token) {
        setToken(msg.token)
        setStep('files') // skip connect if already have token
      }
      if (msg.type === 'BUILD_COMPLETE') {
        setStep('output-figma')
      }
      if (msg.type === 'BUILD_ERROR') {
        setBuildError(msg.message)
        setStep('preview') // go back to preview
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  // Scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  // ── Save token and proceed ──
  const handleSaveToken = () => {
    if (!token.trim()) return
    parent.postMessage({ pluginMessage: { type: 'SAVE_TOKEN', token: token.trim() } }, '*')
    setStep('files')
  }

  // ── Analyze Figma files ──
  const handleAnalyze = async () => {
    const refId = extractFileId(refUrl) ?? undefined
    const destId = extractFileId(destUrl) ?? undefined

    if (!refId && !destId) {
      setAnalyzeError('Cole ao menos uma URL de arquivo Figma.')
      return
    }

    setAnalyzeError('')
    setStep('analyzing')

    try {
      setAnalyzeStatus('reading-ref')
      await new Promise((r) => setTimeout(r, 600))

      if (destId) {
        setAnalyzeStatus('reading-dest')
        await new Promise((r) => setTimeout(r, 400))
      }

      setAnalyzeStatus('processing')
      const context = await readFigmaFiles(token, refId ?? destId!, destId !== refId ? destId : undefined)
      setFigmaContext(context)

      setAnalyzeStatus('done')
      await new Promise((r) => setTimeout(r, 500))

      // Start conversation — Claude greets and asks first question
      setStep('questions')
      startConversation(context)
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Erro ao ler arquivo Figma.')
      setStep('files')
    }
  }

  // ── Start conversation with context ──
  const startConversation = useCallback(
    (context: string) => {
      const initialMessage: Message = {
        role: 'user',
        content: 'Olá! Acabei de abrir os arquivos Figma. Pode começar analisando o conteúdo e fazendo as perguntas necessárias para criar o guideline.',
      }
      setMessages([initialMessage])
      setIsStreaming(true)
      setStreamingText('')

      let assistantText = ''

      streamChat([initialMessage], context, {
        onText: (delta) => {
          assistantText += delta
          setStreamingText(assistantText)
        },
        onGuideline: (data) => {
          setGuideline(data as GuidelineData)
          setStreamingText('')
          setIsStreaming(false)
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: '✅ Guideline gerado! Veja a prévia abaixo.' },
          ])
          setStep('preview')
        },
        onError: (msg) => {
          setStreamingText('')
          setIsStreaming(false)
          setMessages((prev) => [...prev, { role: 'assistant', content: `❌ ${msg}` }])
        },
        onDone: () => {
          if (assistantText) {
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', content: assistantText },
            ])
            setStreamingText('')
          }
          setIsStreaming(false)
        },
      })
    },
    []
  )

  // ── Send chat message ──
  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim() || isStreaming) return

      const userMsg: Message = { role: 'user', content: text.trim() }
      const newMessages = [...messages, userMsg]
      setMessages(newMessages)
      setChatInput('')
      setIsStreaming(true)
      setStreamingText('')

      let assistantText = ''

      streamChat(newMessages, figmaContext, {
        onText: (delta) => {
          assistantText += delta
          setStreamingText(assistantText)
        },
        onGuideline: (data) => {
          setGuideline(data as GuidelineData)
          setStreamingText('')
          setIsStreaming(false)
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: '✅ Guideline pronto! Veja a prévia.' },
          ])
          setStep('preview')
        },
        onError: (msg) => {
          setStreamingText('')
          setIsStreaming(false)
          setMessages((prev) => [...prev, { role: 'assistant', content: `❌ ${msg}` }])
        },
        onDone: () => {
          if (assistantText) {
            setMessages((prev) => [...prev, { role: 'assistant', content: assistantText }])
            setStreamingText('')
          }
          setIsStreaming(false)
        },
      })
    },
    [messages, isStreaming, figmaContext]
  )

  // ── Build in Figma ──
  const handleBuildFigma = () => {
    if (!guideline) return
    setBuildError('')
    parent.postMessage({ pluginMessage: { type: 'BUILD_SLIDES', data: guideline } }, '*')
  }

  // ── Export doc ──
  const handleExportDoc = () => {
    if (!guideline) return
    setDocMarkdown(exportToMarkdown(guideline))
    setStep('output-doc')
  }

  // ── Copy markdown ──
  const handleCopy = () => {
    navigator.clipboard.writeText(docMarkdown).catch(() => {
      const el = document.querySelector('.doc-textarea') as HTMLTextAreaElement
      el?.select()
      document.execCommand('copy')
    })
  }

  // ── Reset ──
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

  // ── Render ──
  return (
    <>
      {/* Topbar */}
      <div className="topbar">
        <div className="topbar-logo">✦</div>
        <span className="topbar-title">Guidely</span>
        {STEP_LABELS[step] && (
          <span className="topbar-step">{STEP_LABELS[step]}</span>
        )}
      </div>

      {/* Progress bar */}
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${STEP_PROGRESS[step]}%` }} />
      </div>

      {/* ── STEP: Welcome ── */}
      {step === 'welcome' && (
        <div className="scroll">
          <div className="step">
            <div>
              <div className="step-label">Bem-vindo</div>
              <div className="step-title" style={{ marginTop: 6 }}>
                Crie guidelines completos para lideranças
              </div>
              <div className="step-sub" style={{ marginTop: 8 }}>
                Leia seus arquivos Figma, responda algumas perguntas e gere os slides direto no canvas — ou exporte como documento.
              </div>
            </div>

            <div className="welcome-flow">
              {[
                ['Conecte seu Figma', 'Cole seu Personal Access Token do Figma (salvo com segurança no plugin).'],
                ['Indique os arquivos', 'URL do handoff de referência e/ou do arquivo destino do guideline.'],
                ['IA lê e pergunta', 'Analisa o conteúdo e faz 2–4 perguntas para preencher lacunas.'],
                ['Revise a estrutura', 'Veja todos os slides propostos antes de criar.'],
                ['Gere no Figma ou exporte', 'Slides direto no canvas ou documento Markdown.'],
              ].map(([title, desc], i) => (
                <div key={i} className="flow-step">
                  <div className="flow-num">{i + 1}</div>
                  <div className="flow-text">
                    <strong>{title}</strong>
                    {desc}
                  </div>
                </div>
              ))}
            </div>

            <button className="btn btn-primary" onClick={() => setStep('connect')}>
              Começar
            </button>
          </div>
        </div>
      )}

      {/* ── STEP: Connect ── */}
      {step === 'connect' && (
        <div className="scroll">
          <div className="step">
            <div>
              <div className="step-label">Passo 1</div>
              <div className="step-title" style={{ marginTop: 6 }}>Token do Figma</div>
              <div className="step-sub" style={{ marginTop: 8 }}>
                Usado para ler seus arquivos. Salvo localmente no plugin — nunca sai do seu computador.
              </div>
            </div>

            <label>
              Personal Access Token
              <span className="hint">Figma → Settings → Account → Personal Access Tokens</span>
              <div className="token-wrap">
                <input
                  type={tokenVisible ? 'text' : 'password'}
                  placeholder="figd_..."
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveToken()}
                />
                <button className="token-toggle" onClick={() => setTokenVisible((v) => !v)}>
                  {tokenVisible ? '🙈' : '👁️'}
                </button>
              </div>
            </label>

            <div className="info-card">
              <div className="info-icon">🔒</div>
              <div className="info-body">
                <div className="info-title">Como obter seu token</div>
                <div className="info-text">
                  No Figma Desktop: Menu → Settings → Account → Personal access tokens → Create new token.
                  Selecione permissão de leitura em "File content".
                </div>
              </div>
            </div>

            <button
              className="btn btn-primary"
              onClick={handleSaveToken}
              disabled={!token.trim()}
            >
              Salvar e continuar
            </button>
          </div>
        </div>
      )}

      {/* ── STEP: Files ── */}
      {step === 'files' && (
        <div className="scroll">
          <div className="step">
            <div>
              <div className="step-label">Passo 2</div>
              <div className="step-title" style={{ marginTop: 6 }}>Arquivos Figma</div>
              <div className="step-sub" style={{ marginTop: 8 }}>
                Cole as URLs dos arquivos. A IA lê o conteúdo e propõe o guideline baseado no que encontrar. Ao menos um dos dois é obrigatório.
              </div>
            </div>

            <label>
              Arquivo de referência <span className="hint">(opcional)</span>
              <span className="hint">Handoff / design do componente a documentar</span>
              <input
                type="text"
                placeholder="https://www.figma.com/design/..."
                value={refUrl}
                onChange={(e) => setRefUrl(e.target.value)}
              />
            </label>

            <label>
              Arquivo de destino <span className="hint">(opcional)</span>
              <span className="hint">Onde o guideline será criado</span>
              <input
                type="text"
                placeholder="https://www.figma.com/design/..."
                value={destUrl}
                onChange={(e) => setDestUrl(e.target.value)}
              />
            </label>

            {analyzeError && (
              <div className="error-card">{analyzeError}</div>
            )}

            <button
              className="btn btn-primary"
              onClick={handleAnalyze}
              disabled={!refUrl.trim() && !destUrl.trim()}
            >
              Analisar arquivos
            </button>

            <button className="btn-ghost btn" onClick={() => setStep('connect')}>
              ← Alterar token
            </button>
          </div>
        </div>
      )}

      {/* ── STEP: Analyzing ── */}
      {step === 'analyzing' && (
        <div className="scroll">
          <div className="analyze-state">
            <div className="spinner" />
            <div className="analyze-title">Lendo seus arquivos…</div>
            <div className="analyze-sub">A IA está extraindo o conteúdo do Figma</div>

            <div className="analyze-steps" style={{ marginTop: 8 }}>
              {[
                { id: 'reading-ref', label: 'Lendo arquivo de referência' },
                { id: 'reading-dest', label: 'Lendo arquivo de destino' },
                { id: 'processing', label: 'Processando conteúdo' },
                { id: 'done', label: 'Pronto! Iniciando conversa' },
              ]
                .filter((s) => s.id !== 'reading-dest' || destUrl)
                .map((s) => {
                  const statuses: AnalyzeStatus[] = ['reading-ref', 'reading-dest', 'processing', 'done']
                  const currentIdx = statuses.indexOf(analyzeStatus)
                  const thisIdx = statuses.indexOf(s.id as AnalyzeStatus)
                  const cls =
                    thisIdx < currentIdx ? 'done' :
                    thisIdx === currentIdx ? 'active' : ''
                  return (
                    <div key={s.id} className={`analyze-step-row ${cls}`}>
                      <div className="step-dot" />
                      {s.label}
                      {thisIdx < currentIdx && ' ✓'}
                    </div>
                  )
                })}
            </div>
          </div>
        </div>
      )}

      {/* ── STEP: Questions (chat) ── */}
      {step === 'questions' && (
        <>
          <div className="scroll">
            <div className="messages">
              {messages.map((msg, i) => (
                <div key={i} className={`bubble-wrap ${msg.role}`}>
                  <div className={`bubble ${msg.role}`}>{msg.content}</div>
                </div>
              ))}

              {streamingText && (
                <div className="bubble-wrap assistant">
                  <div className="bubble assistant">{streamingText}</div>
                </div>
              )}

              {isStreaming && !streamingText && (
                <div className="bubble-wrap assistant">
                  <div className="typing"><span /><span /><span /></div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          <div className="chat-input-bar">
            <textarea
              ref={chatTextareaRef}
              className="chat-textarea"
              placeholder={isStreaming ? 'Aguarde…' : 'Responda ou diga "gerar" para criar agora'}
              value={chatInput}
              disabled={isStreaming}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage(chatInput)
                }
              }}
              onInput={(e) => {
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = `${Math.min(el.scrollHeight, 100)}px`
              }}
              rows={1}
            />
            <button
              className="send-btn"
              onClick={() => sendMessage(chatInput)}
              disabled={isStreaming || !chatInput.trim()}
            >
              <svg width="14" height="14" viewBox="0 0 14 14">
                <path d="M13 1L1 5.5L5.5 7.5L7.5 13L13 1Z" />
              </svg>
            </button>
          </div>
        </>
      )}

      {/* ── STEP: Preview ── */}
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
                      {note && (
                        <span className="slide-img-note">📸 {note}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {buildError && (
            <div style={{ padding: '0 16px 8px' }}>
              <div className="error-card">{buildError}</div>
            </div>
          )}

          <div className="preview-actions">
            <button className="btn btn-accent" onClick={handleBuildFigma}>
              ✨ Criar slides no Figma
            </button>
            <div className="btn-row">
              <button className="btn btn-outline" onClick={handleExportDoc}>
                📄 Exportar como doc
              </button>
              <button className="btn btn-outline" onClick={() => setStep('questions')}>
                ✏️ Ajustar
              </button>
            </div>
            <button className="btn-ghost btn" onClick={handleReset}>
              Novo guideline
            </button>
          </div>
        </>
      )}

      {/* ── STEP: Output — Figma done ── */}
      {step === 'output-figma' && (
        <div className="scroll">
          <div className="done-state">
            <div className="done-icon">🎉</div>
            <div className="done-title">{guideline?.slides.length} slides criados!</div>
            <div className="done-sub">
              Os slides estão no canvas do Figma. Insira os mockups nos locais marcados com 📸 para completar o guideline.
            </div>

            {guideline && (
              <div style={{ width: '100%', marginTop: 8 }}>
                <div className="slide-list" style={{ padding: 0 }}>
                  {guideline.slides.filter((s) => slideImageNote(s)).map((s, i) => (
                    <div key={i} className="info-card" style={{ marginBottom: 6 }}>
                      <span className="info-icon">📸</span>
                      <div className="info-body">
                        <div className="info-title">{slideName(s)}</div>
                        <div className="info-text">{slideImageNote(s)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="btn-row" style={{ marginTop: 8, width: '100%' }}>
              <button className="btn btn-outline" onClick={handleExportDoc}>
                📄 Ver doc também
              </button>
              <button className="btn btn-outline" onClick={handleReset}>
                Novo guideline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP: Output — Doc ── */}
      {step === 'output-doc' && (
        <div className="doc-output">
          <div className="doc-toolbar">
            <span className="doc-toolbar-title">📄 Documento gerado</span>
            <button className="doc-copy-btn" onClick={handleCopy}>Copiar tudo</button>
          </div>
          <textarea
            className="doc-textarea"
            value={docMarkdown}
            readOnly
          />
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
            <div className="btn-row">
              <button className="btn btn-outline" onClick={() => setStep('preview')}>
                ← Voltar
              </button>
              <button className="btn btn-outline" onClick={handleReset}>
                Novo guideline
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

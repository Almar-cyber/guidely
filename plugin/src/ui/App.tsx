import { useState, useEffect, useRef, useCallback, memo } from 'react'

// Extract quick reply options from message
function extractOptions(text: string): { clean: string; options: string[] } {
  const match = text.match(/<options>([\s\S]*?)<\/options>/)
  if (!match) return { clean: text.trim(), options: [] }
  try {
    const options = JSON.parse(match[1]) as string[]
    const clean = text.replace(/<options>[\s\S]*?<\/options>/, '').trim()
    return { clean, options }
  } catch {
    return { clean: text.trim(), options: [] }
  }
}

// Simple markdown renderer
function md(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="background:rgba(255,255,255,0.1);padding:1px 4px;border-radius:3px;font-family:monospace;font-size:11px">$1</code>')
    .replace(/^### (.+)$/gm, '<strong style="font-size:13px">$1</strong>')
    .replace(/^## (.+)$/gm, '<strong style="font-size:14px">$1</strong>')
    .replace(/^- (.+)$/gm, '<span style="display:flex;gap:6px;margin:2px 0"><span style="opacity:.5;flex-shrink:0">•</span><span>$1</span></span>')
    .replace(/^\d+\. (.+)$/gm, '<span style="display:flex;gap:6px;margin:2px 0"><span style="opacity:.5;flex-shrink:0">–</span><span>$1</span></span>')
    .replace(/\n/g, '<br/>')
}

const Bubble = memo(({ role, content }: { role: string; content: string }) => (
  <div className={`bubble-wrap ${role}`}>
    <div
      className={`bubble ${role}`}
      dangerouslySetInnerHTML={{ __html: md(content) }}
    />
  </div>
))
import {
  Sparkles, FolderOpen, Bot, Wand2, Eye, EyeOff,
  CheckCircle2, Camera, FileText, Pencil, PartyPopper,
  ArrowLeft, ArrowRight, Send, Copy, RotateCcw,
  ChevronRight, Link2, Image, Layers
} from 'lucide-react'
import type { GuidelineData, Slide, PluginToUI } from '../types'
import { streamChat, readFigmaFiles, extractFileId, startFigmaOAuth, pollFigmaToken, startAnthropicOAuth, pollAnthropicKey, type Message } from './claude'
import { exportToMarkdown } from '../doc-exporter'

function GeneratingIndicator() {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const steps = [
    { at: 0, label: 'Organizando estrutura dos slides…' },
    { at: 8, label: 'Montando conteúdo de cada slide…' },
    { at: 20, label: 'Finalizando detalhes…' },
  ]
  const current = [...steps].reverse().find((s) => elapsed >= s.at)!
  const estimated = 30
  const pct = Math.min(95, Math.round((elapsed / estimated) * 100))
  return (
    <div className="bubble-wrap assistant">
      <div className="bubble assistant" style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 220 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="oauth-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
          <span style={{ fontWeight: 600 }}>{current.label}</span>
        </div>
        <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--color-primary)', borderRadius: 2, transition: 'width 1s linear' }} />
        </div>
        <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>
          {elapsed < estimated
            ? `~${estimated - elapsed}s restantes`
            : 'Quase pronto…'}
        </span>
      </div>
    </div>
  )
}

type Step = 'onboarding' | 'connect' | 'files' | 'analyzing' | 'questions' | 'preview' | 'output-figma' | 'output-doc'
type AnalyzeStatus = 'reading-ref' | 'reading-dest' | 'done'

const STEP_PROGRESS: Record<Step, number> = {
  onboarding: 0, connect: 20, files: 40, analyzing: 60,
  questions: 75, preview: 95,
  'output-figma': 100, 'output-doc': 100,
}

const STEP_LABEL: Record<Step, string> = {
  onboarding: '', connect: '1 de 5', files: '2 de 5', analyzing: '3 de 5',
  questions: '4 de 5', preview: '5 de 5',
  'output-figma': '5 de 5', 'output-doc': '5 de 5',
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
  const [accessCode, setAccessCode] = useState('')
  const [anthropicOAuthStatus, setAnthropicOAuthStatus] = useState<'idle' | 'waiting' | 'guide' | 'done' | 'error'>('idle')
  const [anthropicOAuthError, setAnthropicOAuthError] = useState('')
  const [cmdCopied, setCmdCopied] = useState(false)
  const anthropicPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const CLI_CMD = `security find-generic-password -s "Claude Code" -a "$(whoami)" -w | pbcopy`

  const handleCopyCmd = () => {
    // Figma plugin sandbox: clipboard API may be blocked, use execCommand fallback
    try {
      const el = document.createElement('textarea')
      el.value = CLI_CMD
      el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0'
      document.body.appendChild(el)
      el.focus()
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCmdCopied(true)
      setTimeout(() => setCmdCopied(false), 3000)
    } catch {
      navigator.clipboard?.writeText(CLI_CMD).catch(() => {})
      setCmdCopied(true)
      setTimeout(() => setCmdCopied(false), 3000)
    }
  }
  const [figmaManual, setFigmaManual] = useState(false)
  const [figmaTokenManual, setFigmaTokenManual] = useState('')
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
  const [isGenerating, setIsGenerating] = useState(false)
  const [quickOptions, setQuickOptions] = useState<string[]>([])

  const [guideline, setGuideline] = useState<GuidelineData | null>(null)
  const [buildError, setBuildError] = useState('')
  const [isBuilding, setIsBuilding] = useState(false)
  const [docMarkdown, setDocMarkdown] = useState('')
  const [docCopied, setDocCopied] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const buildTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup polling/timeouts on unmount
  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (anthropicPollRef.current) clearInterval(anthropicPollRef.current)
    if (buildTimeoutRef.current) clearTimeout(buildTimeoutRef.current)
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
        if (msg.anthropicKey) {
          setAnthropicKey(msg.anthropicKey)
          if (msg.anthropicKey.startsWith('sk-ant-') && msg.anthropicKey.length >= 40) {
            setAnthropicOAuthStatus('done')
          }
        }
        if (msg.figmaToken && msg.anthropicKey) setStep('files')
        else if (msg.figmaToken || msg.anthropicKey) setStep('connect')
      }
      if (msg.type === 'BUILD_COMPLETE') {
        if (buildTimeoutRef.current) clearTimeout(buildTimeoutRef.current)
        setIsBuilding(false)
        setStep('output-figma')
      }
      if (msg.type === 'BUILD_ERROR') {
        if (buildTimeoutRef.current) clearTimeout(buildTimeoutRef.current)
        setIsBuilding(false)
        setBuildError(msg.message)
        setStep('preview')
      }
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
          setAnthropicOAuthError('Tempo esgotado. Tente novamente.')
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
    } catch {
      // OAuth not available — fall back to access code
      setAnthropicOAuthStatus('idle')
    }
  }

  const handleConnectFigma = async () => {
    setOauthStatus('waiting')
    setOauthError('')
    try {
      const { url, state } = await startFigmaOAuth()
      setOauthState(state)
      window.open(url, '_blank')

      let attempts = 0
      pollRef.current = setInterval(async () => {
        attempts++
        if (attempts > 150) {
          clearInterval(pollRef.current!)
          setOauthStatus('idle')
          setFigmaManual(true) // fallback to manual token
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
    } catch {
      // Backend not deployed yet — fall back to manual token input
      setOauthStatus('idle')
      setFigmaManual(true)
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
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      setAnalyzeError(
        msg === 'Failed to fetch'
          ? 'Token do Figma inválido ou expirado. Vá em Credenciais e gere um novo token.'
          : msg
      )
      setStep('files')
    }
  }

  const startConversation = useCallback((context: string) => {
    const init: Message = { role: 'user', content: 'Analisou os arquivos Figma. Faça as perguntas necessárias para criar o guideline.' }
    setMessages([init])
    setIsStreaming(true)
    setIsGenerating(false)
    setStreamingText('')
    let text = ''
    streamChat([init], context, anthropicKey, {
      onText: (d) => { text += d; setStreamingText(text) },
      onGenerating: () => { setStreamingText(''); setIsGenerating(true) },
      onGuideline: (data) => {
        setGuideline(data as GuidelineData)
        setStreamingText('')
        setIsStreaming(false)
        setIsGenerating(false)
        setMessages((p) => [...p, { role: 'assistant', content: 'Guideline pronto.' }])
        setStep('preview')
      },
      onError: (m) => { setStreamingText(''); setIsStreaming(false); setIsGenerating(false); setMessages((p) => [...p, { role: 'assistant', content: m }]) },
      onDone: () => {
        if (text) {
          const { clean, options } = extractOptions(text)
          setMessages((p) => [...p, { role: 'assistant', content: clean }])
          setQuickOptions(options)
          setStreamingText('')
        }
        setIsStreaming(false)
        setIsGenerating(false)
      },
    })
  }, [anthropicKey])

  const sendMessage = useCallback((text: string) => {
    if (!text.trim() || isStreaming) return
    const userMsg: Message = { role: 'user', content: text.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setChatInput('')
    setQuickOptions([])
    setIsStreaming(true)
    setIsGenerating(false)
    setStreamingText('')
    let assistantText = ''
    let guidelineReceived = false
    streamChat(newMessages, figmaContext, anthropicKey, {
      onText: (d) => { assistantText += d; setStreamingText(assistantText) },
      onGenerating: () => { setStreamingText(''); setIsGenerating(true) },
      onGuideline: (data) => {
        guidelineReceived = true
        setGuideline(data as GuidelineData)
        setStreamingText('')
        setIsStreaming(false)
        setIsGenerating(false)
        setStep('preview')
      },
      onError: (m) => {
        setStreamingText('')
        setIsStreaming(false)
        setIsGenerating(false)
        setMessages((p) => [...p, { role: 'assistant', content: m }])
      },
      onDone: () => {
        if (guidelineReceived) {
          setIsStreaming(false)
          setIsGenerating(false)
          return
        }
        if (assistantText) {
          const { clean, options } = extractOptions(assistantText)
          setMessages((p) => [...p, { role: 'assistant', content: clean }])
          setQuickOptions(options)
          setStreamingText('')
        }
        setIsStreaming(false)
        setIsGenerating(false)
      },
    })
  }, [messages, isStreaming, figmaContext, anthropicKey])

  const handleBuildFigma = () => {
    if (!guideline || !guideline.slides?.length) {
      setBuildError('Nenhum slide para criar. Tente gerar novamente.')
      return
    }
    const slideCount = guideline.slides.length
    const timeoutMs = Math.min(480000, Math.max(90000, slideCount * 8000))

    setBuildError('')
    setIsBuilding(true)
    parent.postMessage({ pluginMessage: { type: 'BUILD_SLIDES', data: guideline } }, '*')

    // Safety timeout — adaptive to slide count to reduce false timeouts on larger guidelines
    if (buildTimeoutRef.current) clearTimeout(buildTimeoutRef.current)
    buildTimeoutRef.current = setTimeout(() => {
      setIsBuilding((current) => {
        if (current) {
          setBuildError(`A criação demorou mais que ${Math.round(timeoutMs / 1000)}s e ainda não houve confirmação do plugin. Aguarde alguns segundos: se nada aparecer no canvas, tente criar novamente.`)
          return false
        }
        return current
      })
    }, timeoutMs)
  }

  const handleExportDoc = () => {
    if (!guideline) return
    setDocMarkdown(exportToMarkdown(guideline))
    setStep('output-doc')
  }

  const handleCopy = () => {
    const el = document.createElement('textarea')
    el.value = docMarkdown
    el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0'
    document.body.appendChild(el)
    el.focus(); el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
    setDocCopied(true)
    setTimeout(() => setDocCopied(false), 3000)
  }

  const handleReset = () => {
    setStep('files')
    setMessages([])
    setGuideline(null)
    setIsStreaming(false)
    setIsGenerating(false)
    setStreamingText('')
    setChatInput('')
    setFigmaContext('')
    setAnalyzeError('')
    setBuildError('')
    setIsBuilding(false)
    if (buildTimeoutRef.current) clearTimeout(buildTimeoutRef.current)
    setDocMarkdown('')
    setRefUrl('')
    setDestUrl('')
  }

  const figmaConnected = oauthStatus === 'done' || figmaToken.trim().length > 0
  const anthropicConnected = anthropicOAuthStatus === 'done' && anthropicKey.length > 20
  const credentialsValid = figmaConnected && anthropicConnected

  return (
    <>
      {/* ── Onboarding ── */}
      {step === 'onboarding' && (
        <div className="onboarding">
          <div className="onboarding-logo"><Sparkles size={22} color="#fff" /></div>
          <div className="onboarding-title">Guidely</div>
          <div className="onboarding-tagline">Construa guidelines simples de entender.</div>

          <div className="onboarding-steps">
            {[
              { icon: <FolderOpen size={18} />, label: 'Aponta para o arquivo Figma' },
              { icon: <Bot size={18} />, label: 'A IA analisa e faz perguntas' },
              { icon: <Layers size={18} />, label: 'Receba slides prontos' },
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

      {/* Topbar */}
      {step !== 'onboarding' && (
        <div className="topbar">
          <div className="topbar-left">
            <div className="topbar-logo"><Sparkles size={13} color="#fff" /></div>
            <span className="topbar-title">Guidely</span>
          </div>
          <div className="topbar-right">
            <span className="topbar-badge">Beta</span>
            <span className="topbar-step">{STEP_LABEL[step]}</span>
          </div>
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

            {/* Figma — token manual */}
            {figmaToken ? (
              <div className="oauth-connected">
                <CheckCircle2 size={15} color="var(--mp-green)" />
                <span>Figma conectado</span>
                <button className="link" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-2)' }} onClick={() => { setFigmaToken(''); setFigmaTokenManual('') }}>Trocar</button>
              </div>
            ) : (
              <label>
                Token do Figma
                <span className="hint">
                  Settings → Account → Security → Personal Access Tokens → selecione escopo <strong>File content: Read</strong> &nbsp;
                  <span className="link" onClick={() => window.open('https://www.figma.com/settings', '_blank')}>Abrir <ArrowRight size={10} style={{ display: 'inline', verticalAlign: 'middle' }} /></span>
                </span>
                <input
                  type="text"
                  placeholder="figd_..."
                  value={figmaTokenManual}
                  onChange={(e) => {
                    const val = e.target.value.trim()
                    setFigmaTokenManual(e.target.value)
                    // Valid Figma tokens start with figd_ and are at least 40 chars
                    if (val.startsWith('figd_') && val.length >= 40) setFigmaToken(val)
                    else setFigmaToken('')
                  }}
                />
                {figmaTokenManual.length > 4 && !figmaToken && (
                  <span style={{ fontSize: 11, color: 'var(--color-danger)', marginTop: 4, display: 'block' }}>
                    Token inválido — deve começar com figd_
                  </span>
                )}
              </label>
            )}

            {/* Claude — chave via Terminal (uma vez só) */}
            {anthropicOAuthStatus === 'done' ? (
              <div className="oauth-connected">
                <CheckCircle2 size={15} color="var(--mp-green)" />
                <span>Claude conectado</span>
                <button className="link" style={{ marginLeft: 'auto', fontSize: 11 }}
                  onClick={() => { setAnthropicOAuthStatus('idle'); setAnthropicKey('') }}>
                  Trocar
                </button>
              </div>
            ) : anthropicOAuthStatus === 'guide' ? (
              <div className="oauth-block">
                <div className="oauth-label">Chave do Claude</div>

                <div className="key-guide">
                  <div className="key-guide-step">
                    <span className="key-step-num">1</span>
                    <span>Abra o <strong>Terminal</strong> <span style={{color:'var(--color-text-3)'}}>Cmd + Espaço → "Terminal"</span></span>
                  </div>
                  <div className="key-guide-step">
                    <span className="key-step-num">2</span>
                    <span>Copie e execute o comando abaixo</span>
                  </div>
                  <div className="key-guide-step">
                    <span className="key-step-num">3</span>
                    <span>A chave vai para o clipboard — cole no campo abaixo</span>
                  </div>
                </div>

                <div style={{ position: 'relative', marginTop: 4 }}>
                  <div style={{
                    background: 'var(--ax-dark-100)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--r)',
                    padding: '10px 12px 28px 12px',
                    fontFamily: '"SF Mono", "Fira Code", monospace',
                    fontSize: 11,
                    color: 'var(--color-text-2)',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}>
                    {CLI_CMD}
                  </div>
                  <button
                    onClick={handleCopyCmd}
                    style={{
                      position: 'absolute', right: 8, bottom: 6,
                      background: cmdCopied ? 'var(--mp-green)' : 'var(--color-primary)',
                      border: 'none', borderRadius: 'var(--r-sm)',
                      padding: '4px 10px', cursor: 'pointer',
                      fontSize: 11, fontWeight: 600, color: '#fff',
                      transition: 'background 0.2s',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                    {cmdCopied ? '✓ Copiado!' : 'Copiar'}
                  </button>
                </div>

                <input
                  type="password"
                  placeholder="Cole a chave aqui (sk-ant-...)"
                  value={anthropicKey}
                  autoFocus
                  style={{ marginTop: 4 }}
                  onChange={(e) => {
                    const val = e.target.value.trim()
                    setAnthropicKey(val)
                    if (val.startsWith('sk-ant-') && val.length >= 40) {
                      setAnthropicOAuthStatus('done')
                    }
                  }}
                />

                {anthropicKey.startsWith('sk-ant-') && anthropicKey.length >= 40 && (
                  <span style={{ fontSize: 11, color: 'var(--mp-green)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <CheckCircle2 size={12} /> Chave reconhecida — clique em Continuar
                  </span>
                )}
                {anthropicKey.length > 4 && !anthropicKey.startsWith('sk-ant-') && (
                  <span style={{ fontSize: 11, color: 'var(--color-danger)' }}>
                    Chave inválida — deve começar com sk-ant-
                  </span>
                )}

                <button className="btn-ghost btn" style={{ fontSize: 11, marginTop: 2 }}
                  onClick={() => setAnthropicOAuthStatus('idle')}>
                  ← Voltar
                </button>
              </div>
            ) : (
              <div className="oauth-block">
                <div className="oauth-label">Chave do Claude</div>
                <div className="oauth-hint">Configuração única — fica salva no plugin</div>
                <button className="btn oauth-btn" onClick={() => setAnthropicOAuthStatus('guide')}>
                  <svg width="16" height="16" viewBox="0 0 32 32" fill="none">
                    <path d="M23.5 8.9L16 4.5 8.5 8.9v8.8l7.5 4.4 7.5-4.4V8.9z" fill="#D97757"/>
                  </svg>
                  Configurar chave do Claude
                </button>
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
              <span className="hint">Onde os slides serão criados. Deixe vazio para criar no arquivo atual.</span>
              <input type="text" placeholder="https://www.figma.com/design/..." value={destUrl} onChange={(e) => setDestUrl(e.target.value)} />
            </label>

            {analyzeError && <div className="error-card">{analyzeError}</div>}

            <button className="btn btn-primary" onClick={handleAnalyze}
              disabled={!refUrl.trim() && !destUrl.trim()}>
              Analisar
            </button>
            <button className="btn-ghost btn" onClick={() => setStep('connect')}><ArrowLeft size={13} /> Voltar</button>
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
            {analyzeError && (
              <div style={{ width: '100%' }}>
                <div className="error-card">{analyzeError}</div>
                <button className="btn btn-outline" style={{ marginTop: 12 }}
                  onClick={() => { setStep('files') }}>
                  <ArrowLeft size={14} /> Voltar e corrigir
                </button>
              </div>
            )}
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
                      {s.label}{idx < cur ? <CheckCircle2 size={12} style={{display:'inline',marginLeft:4}} color="var(--mp-green)" /> : null}
                    </div>
                  )
                })}
            </div>
          </div>
        </div>
      )}

      {/* ── Perguntas ── */}
      {step === 'questions' && (
        <div className="chat-layout">
          <div className="scroll">
            <div className="messages">
              {messages.map((msg, i) => (
                <Bubble key={i} role={msg.role} content={msg.content} />
              ))}
              {streamingText && <Bubble role="assistant" content={streamingText} />}
              {isGenerating && <GeneratingIndicator />}
              {isStreaming && !streamingText && !isGenerating && <div className="bubble-wrap assistant"><div className="typing"><span /><span /><span /></div></div>}
              <div ref={messagesEndRef} />
            </div>
          </div>
          {messages.length >= 3 && !isStreaming && quickOptions.length === 0 && (
            <div style={{ padding: '4px 10px 0', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn-ghost btn" style={{ fontSize: 11, padding: '4px 8px' }}
                onClick={() => sendMessage('gerar')}>
                <Wand2 size={11} /> Gerar agora
              </button>
            </div>
          )}

          {quickOptions.length > 0 && !isStreaming && (
            <div className="quick-options">
              {quickOptions.map((opt) => (
                <button key={opt} className="quick-option-btn" onClick={() => sendMessage(opt)}>
                  {opt}
                </button>
              ))}
            </div>
          )}

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
              <Send size={14} color="#fff" />
            </button>
          </div>
        </div>
      )}

      {/* ── Preview ── */}
      {step === 'preview' && guideline && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
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
                      {note && <span className="slide-img-note"><Camera size={10} style={{display:'inline',marginRight:3}} />{note}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="preview-actions">
            {buildError && <div className="error-card">{buildError}</div>}
            <button className="btn btn-accent" disabled={isBuilding} onClick={() => {
              if (window.confirm(`Criar ${guideline?.slides.length} slides no arquivo Figma atual?`)) handleBuildFigma()
            }}>{isBuilding ? <><div className="oauth-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Criando slides…</> : <><Wand2 size={14} /> Criar slides no Figma</>}</button>
            <div className="btn-row">
              <button className="btn btn-outline" onClick={handleExportDoc}><FileText size={14} /> Exportar doc</button>
              <button className="btn btn-outline" onClick={() => setStep('questions')}><Pencil size={14} /> Ajustar</button>
            </div>
            <button className="btn-ghost btn" onClick={handleReset}><RotateCcw size={12} /> Novo guideline</button>
          </div>
        </div>
      )}

      {/* ── Concluído: Figma ── */}
      {step === 'output-figma' && (
        <div className="scroll">
          <div className="done-state">
            <div className="done-icon"><PartyPopper size={40} color="var(--color-primary)" /></div>
            <div className="done-title">{guideline?.slides.length} slides criados!</div>
            <div className="done-sub">Abra o Figma para ver os slides no canvas. Onde aparecer <Camera size={11} style={{display:'inline'}} />, insira o print da tela correspondente.</div>
            {guideline && (
              <div style={{ width: '100%', marginTop: 8 }}>
                {guideline.slides.filter(slideImageNote).map((s, i) => (
                  <div key={i} className="info-card" style={{ marginBottom: 6 }}>
                    <span className="info-icon"><Camera size={15} /></span>
                    <div className="info-body">
                      <div className="info-title">{slideName(s)}</div>
                      <div className="info-text">{slideImageNote(s)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="btn-row" style={{ marginTop: 8, width: '100%' }}>
              <button className="btn btn-outline" onClick={handleExportDoc}><FileText size={14} /> Exportar doc</button>
              <button className="btn btn-outline" onClick={handleReset}><RotateCcw size={14} /> Novo</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Concluído: Doc ── */}
      {step === 'output-doc' && (
        <div className="doc-output">
          <div className="doc-toolbar">
            <span className="doc-toolbar-title">Documento</span>
            <button className="doc-copy-btn" onClick={handleCopy}
              style={{ background: docCopied ? 'var(--color-success-bg)' : undefined,
                       color: docCopied ? 'var(--mp-green)' : undefined }}>
              <Copy size={11} style={{display:'inline',marginRight:4}} />
              {docCopied ? '✓ Copiado!' : 'Copiar'}
            </button>
          </div>
          <textarea className="doc-textarea" value={docMarkdown} readOnly />
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--color-border-2)' }}>
            <div className="btn-row">
              <button className="btn btn-outline" onClick={() => setStep('preview')}><ArrowLeft size={14} /> Voltar</button>
              <button className="btn btn-outline" onClick={handleReset}><RotateCcw size={14} /> Novo</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

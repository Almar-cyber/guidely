# Guidely — Figma Plugin

> Crie guidelines completos para lideranças direto no Figma, assistido por IA.

O Guidely lê seus arquivos Figma, faz perguntas contextuais e gera slides de apresentação — ou exporta um documento estruturado — sem você precisar escrever nada do zero.

---

## Como funciona

```
1. Cole o token do Figma
2. Informe as URLs dos arquivos (referência e/ou destino)
3. A IA lê o conteúdo e faz 2–4 perguntas para preencher lacunas
4. Revise a estrutura proposta
5. Gere os slides direto no canvas ou exporte como Markdown
```

## Estrutura do projeto

```
guidely/
├── plugin/          → Figma Plugin (React + TypeScript)
│   ├── src/
│   │   ├── main.ts          → Main thread (cria nós no Figma)
│   │   ├── builder.ts       → Lógica de criação de slides
│   │   ├── templates.ts     → Design tokens Andes X
│   │   ├── types.ts         → Tipos TypeScript
│   │   └── ui/              → Interface React do plugin
│   └── manifest.json
├── backend/         → Proxy Vercel (protege a API key)
│   └── api/
│       ├── chat.ts          → SSE proxy para Claude API
│       └── read-file.ts     → Lê arquivos Figma via API
└── shared/
    └── schema.ts            → Schema Zod dos slides
```

## Setup

### Pré-requisitos

- Node.js 18+
- Conta na [Vercel](https://vercel.com)
- API key da [Anthropic](https://console.anthropic.com)
- Token pessoal do Figma

---

### 1. Obter chave da API Anthropic

O Guidely usa o Claude (Anthropic) para gerar os guidelines. Você precisará de uma chave de API própria.

1. Acesse **https://console.anthropic.com/settings/keys**
2. Clique em **Create Key**
3. Copie a chave gerada (começa com `sk-ant-...`)

> A chave é usada apenas no seu servidor Vercel — nunca é exposta no plugin ou no repositório.

---

### 2. Backend (proxy Vercel)

```bash
cd backend
npm install
```

Crie o arquivo de variáveis de ambiente:
```bash
cp .env.example .env
# Edite .env e adicione sua ANTHROPIC_API_KEY
```

Deploy:
```bash
npx vercel deploy --prod
```

Quando solicitado, adicione a variável de ambiente na Vercel:
- **Name:** `ANTHROPIC_API_KEY`
- **Value:** sua chave `sk-ant-...`

Copie a URL gerada (ex: `https://guidely-proxy.vercel.app`).

---

### 2. Plugin

Atualize a URL do proxy em dois lugares:

**`plugin/manifest.json`**
```json
"networkAccess": {
  "allowedDomains": ["https://guidely-proxy.vercel.app"]
}
```

**`plugin/src/ui/claude.ts`** (linha 1)
```ts
const BASE_URL = 'https://guidely-proxy.vercel.app'
```

Instale e compile:
```bash
cd plugin
npm install
npm run build
```

---

### 3. Carregar no Figma

1. Figma Desktop → Menu → **Plugins → Development → Import plugin from manifest**
2. Selecione `plugin/manifest.json`
3. Pronto: **Plugins → Development → Guidely**

---

## Slides gerados

| Tipo | Descrição |
|---|---|
| `cover` | Capa com título, subtítulo e versão |
| `objective` | Objetivo e contexto do componente |
| `glossary` | Glossário de termos em 2 colunas |
| `anatomy` | Estrutura base com componentes obrigatórios/optativos |
| `use_case_map` | Tabela de elementos por caso de uso |
| `use_case` | Slide por caso de uso com países e componentes |
| `behavior` | Tabela de comportamentos e estados |
| `do_dont` | Regras de uso correto e incorreto |
| `wording` | Mensagens padrão de erro por país |
| `contact` | Slide final com canal Slack e links |

O visual dos slides segue o padrão do **CHO PX Guideline** com tokens **Andes X**:
- Header escuro `#0d0d1b`
- Fundo branco
- Accent MP green `#00a650` (cover)
- Labels e tags Andes X blue `#434be4`

---

## Desenvolvimento local

```bash
# Build com watch
cd plugin
npm run watch

# Backend local
cd backend
npx vercel dev
```

Para testar sem deploy, altere `BASE_URL` em `claude.ts` para `http://localhost:3000`.

---

## Variáveis de ambiente

| Variável | Onde | Descrição |
|---|---|---|
| `ANTHROPIC_API_KEY` | Vercel → Settings → Environment Variables | Chave da API Anthropic |

**Nunca commite o arquivo `.env`.**

---

## Design tokens

A interface do plugin usa os tokens oficiais do Andes X:

| Token | Valor | Uso |
|---|---|---|
| `ax-blue/700` | `#434be4` | Cor primária (botões, labels, progress) |
| `ax-dark-gray/200` | `#0d0d1b` | Background dark (topbar, botão primário) |
| `ax-gray/100` | `#f4f5f9` | Background surface |
| `ax-gray/300` | `#d0d4e6` | Bordas |
| `ax-gray/900` | `#282833` | Texto primário |
| `ax-gray/700` | `#646587` | Texto secundário |
| `al-green/500` | `#00a650` | MP green (cover accent, sucesso) |

Fonte: `Inter` — pesos 400, 600, 700 (`ax-font/weight/*`)

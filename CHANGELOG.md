# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

## [2.0.0] - 2026-03-04

### ✨ Melhorias Principais - Slides Profissionais

Esta atualização torna os slides do Guidely **prontos para apresentações a lideranças e stakeholders**, seguindo padrões profissionais de design corporativo.

### 🎯 Problema Resolvido

**Antes:** Slides com fontes 50-80% menores que padrões profissionais, formato obsoleto (1440x900), ilegíveis em projetores/Zoom.

**Depois:** Slides legíveis, profissionais, seguindo padrões modernos de apresentação corporativa.

### 📐 Changed - Especificações Técnicas

#### Dimensões do Slide
- **BREAKING:** `SLIDE_WIDTH`: 1440 → **1920** (formato 16:9 moderno)
- **BREAKING:** `SLIDE_HEIGHT`: 900 → **1080** (compatível com 99% projetores/TVs)
- `SLIDE_GAP`: 80 → **100**

#### Espaçamentos (PAD)
- `slideH`: 80 → **100px**
- `slideTop`: 64 → **80px**
- `slideBot`: 64 → **80px**
- `cardH`: 40 → **48px**
- `cardV`: 32 → **40px**
- `headerH`: 80 → **100px**
- `headerV`: 20 → **24px**
- `gap`: 24 → **32px**
- `gapSmall`: 12 → **16px**
- `gapLarge`: 40 → **48px**

### 🔤 Changed - Tipografia (Aumentos)

#### Cover Slide
- Label: 13px → **20px** (+54%)
- Título: 72px → **120px** (+67%)
- Subtítulo: 24px → **48px** (+100%)
- Metadados: 14px → **28px** (+100%)
- ✅ **Centralização** horizontal e vertical

#### Objective Slide
- Label: 13px → **20px** (+54%)
- Corpo: 20px → **36px** (+80%)

#### Glossary Slide
- Título: 40px → **72px** (+80%)
- Subtítulo: 16px → **28px** (+75%)
- Termo: 13px → **28px** (+115%)
- Definição: 13px → **24px** (+85%)
- ⚠️ **LIMITADO:** Máximo 6 termos por slide

#### Anatomy Slide
- Label seção: 12px → **20px** (+67%)
- Título: 40px → **72px** (+80%)
- Corpo: 16px → **28px** (+75%)
- Número componente: 14px → **28px** (+100%)
- Nome componente: 15px → **28px** (+87%)
- Nota: 13px → **24px** (+85%)
- ⚠️ **LIMITADO:** Máximo 4 componentes por slide
- 🗑️ **REMOVIDO:** Mockup placeholder vazio

#### Use Case Slide
- Label seção: 12px → **20px** (+67%)
- Título: 40px → **72px** (+80%)
- Corpo: 16px → **28px** (+75%)
- Componentes label: 12px → **20px** (+67%)
- Componentes items: 11px → **24px** (+118%)
- 🗑️ **REMOVIDO:** Mockup placeholder vazio

#### Behavior Slide
- Label seção: 12px → **20px** (+67%)
- Título: 40px → **72px** (+80%)
- Descrição: 16px → **28px** (+75%)
- ⚠️ **LIMITADO:** Máximo 4 linhas na tabela

#### Do/Dont Slide
- Título: 40px → **72px** (+80%)
- Header colunas: 16px → **32px** (+100%)
- Bullets dot: 14px → **28px** (+100%)
- Bullets texto: 15px → **28px** (+87%)
- ⚠️ **LIMITADO:** Máximo 3 itens por coluna

#### Wording Slide
- Label seção: 12px → **20px** (+67%)
- Título: 40px → **72px** (+80%)
- Nome erro: 16px → **32px** (+100%)
- Objetivo: 13px → **24px** (+85%)
- Variantes: 13px → **24px** (+85%)
- ⚠️ **LIMITADO:** Máximo 2 erros por slide

#### Contact Slide
- Título: 48px → **80px** (+67%)
- Subtítulo: 18px → **32px** (+78%)
- Canal: 20px → **36px** (+80%)
- Links título: 13px → **20px** (+54%)
- Links items: 15px → **28px** (+87%)
- Accent line: 60x4 → **100x6** (maior impacto)
- ✅ **Centralização** horizontal
- ⚠️ **LIMITADO:** Máximo 3 links

#### Header Bar & Components
- Header label: 12px → **18px** (+50%)
- Header número: 14px → **20px** (+43%)
- Tags: 11px → **24px** (+118%)
- Tag padding: 6/12px → **8/16px**

### 🎨 Changed - Layout & Visual

#### Cover Slide
- ✅ Conteúdo centralizado (horizontal + vertical)
- Gap entre elementos: 20px → **32px**
- Espaçador: 40px → **60px**
- Altura calculada ajustada: 300px → **500px**

#### Contact Slide
- ✅ Conteúdo centralizado horizontalmente
- Gap entre elementos: 24px → **48px**
- Espaçador: 16px → **32px**
- Altura calculada ajustada: 350px → **450px**

#### Anatomy, Glossary, Behavior
- Padding rows aumentado
- Stroke weight aumentado
- Border radius aumentado (8px → 12-16px)

### ⚠️ Changed - Densidade de Conteúdo (Limites)

Para garantir legibilidade, implementamos limites máximos:

| Tipo de Slide | Limite Anterior | Limite Novo | Razão |
|---------------|-----------------|-------------|-------|
| **Glossary** | Ilimitado | **6 termos** | Evita sobrecarga |
| **Anatomy** | Ilimitado | **4 componentes** | Mantém foco |
| **Behavior** | Ilimitado | **4 linhas** | Legibilidade |
| **Do/Dont** | Ilimitado | **3 itens/coluna** | Concisão |
| **Wording** | Ilimitado | **2 erros** | Clareza |
| **Contact** | Ilimitado | **3 links** | Simplicidade |

> Se o conteúdo exceder os limites, o plugin usa `.slice()` para truncar automaticamente.

### 🗑️ Removed - Mockup Placeholders

- **Removidos** placeholders vazios em Anatomy e Use Case slides
- **Razão:** Ocupavam espaço valioso sem agregar valor
- **Benefício:** Mais espaço para texto legível

### 📚 Added - Documentação

- ✅ **SLIDE_GUIDELINES.md** - Guia completo de design de slides
  - Especificações técnicas
  - Regras por tipo de slide
  - Paleta de cores
  - Checklist de QA
  - Comparativo antes/depois

- ✅ **README.md** atualizado com novas especificações

### 🔧 Technical Changes

**Arquivos modificados:**
- `plugin/src/templates.ts` - Dimensões e espaçamentos
- `plugin/src/builder.ts` - Fontes, layouts, limites de densidade
- `README.md` - Documentação atualizada
- `SLIDE_GUIDELINES.md` - Novo arquivo de guidelines
- `CHANGELOG.md` - Este arquivo

### 🎯 Impact Analysis

#### Legibilidade
| Contexto | Antes | Depois |
|----------|-------|--------|
| Projetor (3m distância) | ❌ Ilegível | ✅ Legível |
| Zoom/Teams | ❌ Difícil | ✅ Claro |
| TV/Monitor | ⚠️ Marginal | ✅ Excelente |
| Impressão | ⚠️ OK | ✅ Ótimo |

#### Profissionalismo
| Aspecto | Antes | Depois |
|---------|-------|--------|
| Formato | 16:10 (obsoleto) | 16:9 (moderno) ✅ |
| Tipografia | Abaixo padrão | Padrão profissional ✅ |
| Densidade | Alta | Otimizada ✅ |
| Hierarquia | Fraca | Forte ✅ |
| Impacto visual | Baixo | Alto ✅ |

### 📊 Metrics

**Antes (v1.x):**
- Formato: 1440x900 (16:10)
- Menor fonte: 11px ❌
- Maior fonte: 72px ⚠️
- Densidade: Ilimitada ❌
- Mockups vazios: Sim ❌
- Centralização: Não ❌

**Depois (v2.0):**
- Formato: 1920x1080 (16:9) ✅
- Menor fonte: 18px ✅
- Maior fonte: 120px ✅
- Densidade: Limitada ✅
- Mockups vazios: Removidos ✅
- Centralização: Cover + Contact ✅

### 🚀 Migration Guide

#### Para Usuários

1. **Atualizar plugin no Figma:**
   ```bash
   cd plugin
   npm install
   npm run build
   ```

2. **Reload no Figma:**
   - Plugins → Development → Guidely → Right click → Reload

3. **Gerar novos slides:**
   - Slides existentes permanecem em 1440x900
   - Novos slides serão 1920x1080 automaticamente

4. **Verificar compatibilidade:**
   - Testar em projetor/TV
   - Verificar legibilidade em Zoom

#### Para Desenvolvedores

```typescript
// Antes
export const SLIDE_WIDTH = 1440
export const SLIDE_HEIGHT = 900

// Depois
export const SLIDE_WIDTH = 1920   // 16:9 modern standard
export const SLIDE_HEIGHT = 1080

// Uso em builders - AUTOMÁTICO
// Todos os slides já usam SLIDE_WIDTH/HEIGHT constantes
```

### ⚙️ Breaking Changes

#### 1. Dimensões de Slide

**Breaking:** Slides gerados terão dimensões diferentes

```typescript
// v1.x
frame.resize(1440, 900)

// v2.0
frame.resize(1920, 1080)
```

**Impacto:**
- Slides antigos (1440x900) continuam funcionando
- Slides novos (1920x1080) não são compatíveis com decks antigos
- **Recomendação:** Regenerar deck completo na v2.0

#### 2. Limites de Densidade

**Breaking:** Conteúdo pode ser truncado

```typescript
// v1.x - Mostra todos os termos
slide.terms.forEach(...)

// v2.0 - Limita a 6
const displayTerms = slide.terms.slice(0, 6)
displayTerms.forEach(...)
```

**Impacto:**
- Glossaries com >6 termos: apenas 6 mostrados
- Anatomy com >4 componentes: apenas 4 mostrados
- **Solução:** Criar múltiplos slides ou priorizar conteúdo

### 🐛 Bug Fixes

- ✅ Fixado alinhamento de Cover slide (era esquerda, agora centralizado)
- ✅ Fixado alinhamento de Contact slide (centralizado)
- ✅ Removido espaço desperdiçado com mockups vazios
- ✅ Corrigido formato de slide para padrão moderno (16:9)

### 🎓 Learning & Rationale

#### Por que 1920x1080?

- **99% compatibilidade** com projetores modernos
- **Padrão YouTube/Vimeo** (compartilhamento fácil)
- **Padrão TV/Monitors** (4K downscales perfeitamente)
- **Zoom/Teams** renderiza melhor

#### Por que fontes maiores?

- **Legibilidade em projetor:** Mínimo 28px corpo, 72px títulos
- **Acessibilidade:** Melhor para pessoas com baixa visão
- **Profissionalismo:** Padrão corporativo global
- **Mobile:** Visualização em tablets/phones

#### Por que limitar densidade?

- **Cognitive load:** 3-4 itens por slide = melhor retenção
- **Legibilidade:** Menos conteúdo = fontes maiores
- **Apresentação:** Slide não é documento
- **Impacto:** Uma mensagem clara > muitas confusas

### 📝 Notes

- Todos os slides mantêm tokens Andes X
- Compatibilidade com temas dark/light preservada
- Performance não afetada (mesma estrutura de código)
- Fontes Inter necessárias (já eram requirement)

### 🔮 Future Improvements (v2.1+)

- [ ] Adicionar slide de "Section Break" entre seções
- [ ] Suporte a imagens reais (vs. mockups vazios)
- [ ] Exportar para PowerPoint (.pptx)
- [ ] Templates alternativos (Minimal, Bold, etc.)
- [ ] Animações sutis (fade-in, slide-in)
- [ ] Acessibilidade: Narrator text para cada slide

---

## [1.0.0] - Data inicial

### Added
- Release inicial do Guidely
- 10 tipos de slides
- Integração Claude AI
- Design system Andes X
- Formato 1440x900

---

**Formato:** [Semantic Versioning](https://semver.org/)
**Convenção:** [Keep a Changelog](https://keepachangelog.com/)

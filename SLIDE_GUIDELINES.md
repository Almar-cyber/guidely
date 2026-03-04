# Guidely - Slide Design Guidelines

> Diretrizes profissionais para slides legíveis e impactantes em apresentações a stakeholders

---

## 🎯 Objetivo

Garantir que todos os slides gerados pelo Guidely sejam:
- **Legíveis** em projetores, TVs, Zoom e dispositivos móveis
- **Profissionais** seguindo padrões corporativos modernos
- **Impactantes** com hierarquia visual clara
- **Acessíveis** com contraste adequado

---

## 📐 Especificações Técnicas

### Formato
- **Dimensões:** 1920x1080 (16:9)
- **Margem mínima:** 100px das bordas
- **Espaçamento entre slides:** 100px

### Tipografia (família Inter)

| Elemento | Tamanho | Peso | Uso |
|----------|---------|------|-----|
| **Título Cover** | 120px | Extra Bold (800) | Slide de abertura |
| **Subtítulo Cover** | 48px | Regular (400) | Slide de abertura |
| **Títulos principais** | 72px | Bold (700) | Títulos de slides internos |
| **Seção labels** | 20px | Semi Bold (600) | Labels de seção (UPPERCASE) |
| **Corpo de texto** | 28-36px | Regular (400) | Texto descritivo |
| **Itens de lista** | 28px | Regular (400) | Bullets, tabelas |
| **Tags/Labels** | 24px | Semi Bold (600) | Tags de componentes |
| **Header bar** | 18px | Semi Bold (600) | Cabeçalho dos slides |
| **Metadados** | 28px | Semi Bold (600) | Informações secundárias |

### Line Height
- **Títulos:** 1.1-1.2
- **Corpo:** 1.5-1.6

### Contraste de Cores (Andes X Tokens)

| Uso | Token | Valor | Contraste |
|-----|-------|-------|-----------|
| Texto primário | `ax-gray/900` | `#282833` | 14.8:1 (AAA) |
| Texto secundário | `ax-gray/700` | `#646587` | 5.2:1 (AA) |
| Texto em fundo escuro | White | `#ffffff` | 21:1 (AAA) |
| Accent | `ax-blue/700` | `#434be4` | 4.8:1 (AA) |
| MP Green | `al-green/500` | `#00a650` | 3.6:1 (AA Large) |

---

## 📋 Regras por Tipo de Slide

### 1. Cover Slide (Capa)

**Propósito:** Causar primeira impressão forte e profissional

**Estrutura:**
- ✅ Título centralizado: 120px
- ✅ Subtítulo centralizado: 48px
- ✅ Metadados centralizados: 28px
- ✅ Linha de accent (100x6px)
- ✅ Fundo escuro (`#0d0d1b`)
- ✅ Espaçamento generoso (gap: 32-60px)

**Hierarquia:**
```
Label "GUIDELINE" (20px, MP Green)
      ↓ 32px
Título (120px, Bold, Branco)
      ↓ 32px
Subtítulo (48px, Regular, Cinza)
      ↓ 60px
Metadados (28px, SemiBold, Cinza)
```

**❌ Evite:**
- Alinhar à esquerda (deve ser centralizado)
- Fontes menores que especificado
- Mais de 2 linhas no título

---

### 2. Objective Slide (Objetivo)

**Propósito:** Comunicar a razão do guideline de forma clara

**Estrutura:**
- ✅ Label: 20px (UPPERCASE)
- ✅ Corpo: 36px (máx 3-4 linhas)
- ✅ Fundo branco
- ✅ Header bar com título do guideline

**❌ Evite:**
- Parágrafos longos (máx 3-4 frases)
- Texto corrido sem quebras

---

### 3. Glossary Slide (Glossário)

**Propósito:** Definir termos importantes

**Estrutura:**
- ✅ Título: 72px
- ✅ Subtítulo: 28px
- ✅ Grid de 2 colunas
- ✅ Termo: 28px (SemiBold)
- ✅ Definição: 24px (Regular)
- ✅ **LIMITE: 6 termos máximo** (3 por coluna)

**Densidade:**
```
Se glossary.terms.length > 6:
  → Criar múltiplos slides
  → Máximo 6 termos por slide
```

**❌ Evite:**
- Mais de 6 termos em um slide
- Definições longas (máx 2 linhas)
- Fontes menores que 24px

---

### 4. Anatomy Slide (Anatomia)

**Propósito:** Mostrar estrutura de componentes

**Estrutura:**
- ✅ Label seção: 20px
- ✅ Título: 72px
- ✅ Corpo descritivo: 28px (opcional, máx 2 linhas)
- ✅ Lista de componentes: 28px
- ✅ Tags: 24px
- ✅ **LIMITE: 4 componentes máximo**

**Componente Row:**
```
[Número (28px)] [Nome (28px, grow)] [Tag (24px)]
     40px           variável            auto
```

**❌ Evite:**
- Mais de 4 componentes por slide
- Mockup placeholders vazios (removido)
- Descrições longas em cada componente

---

### 5. Use Case Slide (Caso de Uso)

**Propósito:** Demonstrar aplicação prática

**Estrutura:**
- ✅ Label seção: 20px
- ✅ Título + tags países: 72px + 24px
- ✅ **Descrição em bullets** (não parágrafo): 28px
- ✅ Lista componentes: 24px tags
- ✅ Mockup removido (economiza espaço)

**❌ Evite:**
- Parágrafos corridos (use bullets)
- Mais de 3-4 bullets
- Mockups vazios

---

### 6. Behavior Slide (Comportamento)

**Propósito:** Documentar estados e condições

**Estrutura:**
- ✅ Label seção: 20px
- ✅ Título: 72px
- ✅ Descrição (opcional): 28px
- ✅ Tabela: Headers 28px, Células 24px
- ✅ **LIMITE: 4 linhas máximo**

**❌ Evite:**
- Mais de 4 linhas na tabela
- Textos longos nas células

---

### 7. Do/Dont Slide (Boas Práticas)

**Propósito:** Orientar uso correto e incorreto

**Estrutura:**
- ✅ Título: 72px
- ✅ Header colunas: 32px
- ✅ Itens: 28px
- ✅ **LIMITE: 3 itens por coluna**
- ✅ Gap entre colunas: 48px

**Visual:**
```
DO (verde)          DONT (vermelho)
✅ Faça (32px)      ❌ Evite (32px)
• Item (28px)       • Item (28px)
• Item (28px)       • Item (28px)
• Item (28px)       • Item (28px)
```

**❌ Evite:**
- Mais de 3 itens por lado
- Itens com mais de 2 linhas

---

### 8. Wording Slide (Textos Padrão)

**Propósito:** Padronizar mensagens

**Estrutura:**
- ✅ Label seção: 20px
- ✅ Título: 72px
- ✅ Nome erro: 32px
- ✅ Objetivo: 24px
- ✅ Variantes: 24px em chips
- ✅ **LIMITE: 2 erros por slide**

**❌ Evite:**
- Mais de 2 erros por slide
- Mais de 3 variantes por erro

---

### 9. Contact Slide (Contato)

**Propósito:** Deixar impressão final forte e facilitar contato

**Estrutura:**
- ✅ Título centralizado: 80px
- ✅ Subtítulo centralizado: 32px
- ✅ Canal Slack: 36px
- ✅ Links: 28px
- ✅ **LIMITE: 3 links máximo**
- ✅ Fundo escuro (`#0d0d1b`)
- ✅ Linha de accent (100x6px)

**Hierarquia:**
```
Accent line (100x6px, Blue)
      ↓ 48px
Título (80px, ExtraBold, Branco)
      ↓ 48px
Subtítulo (32px, Regular, Cinza)
      ↓ 48px
Canal (36px, SemiBold, Blue)
      ↓ 32px
"LINKS ÚTEIS" (20px, UPPERCASE)
      ↓ 16px
Links (28px, cada)
```

**❌ Evite:**
- Alinhar à esquerda (deve ser centralizado)
- Mais de 3 links
- Fontes menores que 28px

---

## 🎨 Paleta de Cores (Andes X)

### Backgrounds
```typescript
bg:        #ffffff  // Slides claros
bgDark:    #0d0d1b  // Cover, Contact
bgSection: #f4f5f9  // Cards, componentes
```

### Text
```typescript
textPrimary:   #282833  // Títulos, corpo
textSecondary: #646587  // Descrições
textLight:     #ffffff  // Texto em fundo escuro
```

### Accent
```typescript
accent:    #434be4  // Andes X Blue (seções, tags)
mpGreen:   #00a650  // MP Green (cover, sucesso)
doGreen:   #defade  // Fundo "Faça"
dontRed:   #ffe5e9  // Fundo "Evite"
```

### Borders
```typescript
border:      #d0d4e6  // Bordas sutis
borderLight: #e7e9f3  // Bordas muito sutis
```

---

## ✅ Checklist de QA Pre-Export

Antes de gerar slides para stakeholders, verificar:

### Legibilidade
- [ ] Títulos ≥ 72px
- [ ] Corpo de texto ≥ 28px
- [ ] Tags/labels ≥ 24px
- [ ] Line height 1.1-1.6
- [ ] Contraste mínimo 4.5:1 (AA)

### Densidade
- [ ] Glossary: máx 6 termos
- [ ] Anatomy: máx 4 componentes
- [ ] Behavior: máx 4 linhas
- [ ] Do/Dont: máx 3 itens/coluna
- [ ] Wording: máx 2 erros
- [ ] Contact: máx 3 links
- [ ] Use Case: bullets (não parágrafos)

### Layout
- [ ] Dimensões: 1920x1080
- [ ] Margem mínima: 100px
- [ ] Cover/Contact: centralizados
- [ ] Espaçamento consistente
- [ ] Header bar em todos (exceto Cover/Contact)

### Visual
- [ ] Mockups placeholders removidos
- [ ] Cores seguem tokens Andes X
- [ ] Fontes Inter carregadas
- [ ] Sem texto cortado/overflow

---

## 📊 Comparativo: Antes vs Depois

| Elemento | Antes (1440x900) | Depois (1920x1080) | Melhoria |
|----------|------------------|---------------------|----------|
| **Formato** | 16:10 (obsoleto) | 16:9 (moderno) | ✅ Compatível |
| **Título Cover** | 72px | 120px | +67% |
| **Títulos internos** | 40px | 72px | +80% |
| **Corpo** | 16-20px | 28-36px | +75-80% |
| **Tags** | 11px | 24px | +118% |
| **Densidade** | Ilimitada | Limitada | ✅ Legível |
| **Mockups** | Vazios | Removidos | ✅ Foco |
| **Alinhamento** | Esquerda | Centralizado (Cover/Contact) | ✅ Impacto |

---

## 🚀 Implementação

### Arquivos Modificados

1. **`plugin/src/templates.ts`**
   - `SLIDE_WIDTH`: 1440 → 1920
   - `SLIDE_HEIGHT`: 900 → 1080
   - `PAD`: Aumentado proporcionalmente

2. **`plugin/src/builder.ts`**
   - Fontes aumentadas em TODOS os slides
   - Cover/Contact centralizados
   - Densidade limitada (slice)
   - Mockups removidos

### Como Testar

```bash
cd plugin
npm run build

# No Figma:
# 1. Reload plugin
# 2. Gere slides de teste
# 3. Verifique dimensões (1920x1080)
# 4. Teste em projetor/Zoom
```

---

## 📚 Referências

- [Professional Slide Design Standards](https://www.nngroup.com/articles/presentation-design/)
- [WCAG Contrast Guidelines](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)
- [Andes X Design Tokens](https://main-library.andesx.design/)
- [Typography Best Practices for Slides](https://www.duarte.com/presentation-skills-resources/slide-design/)

---

## 🤝 Contribuindo

Ao adicionar novos tipos de slides:

1. **Seguir tamanhos mínimos de fonte** (≥28px corpo, ≥72px títulos)
2. **Limitar densidade** (máx 3-4 itens por seção)
3. **Usar tokens Andes X** (não valores hardcoded)
4. **Testar legibilidade** em projetor real
5. **Atualizar esta documentação**

---

**Última atualização:** 2026-03-04
**Versão:** 2.0 (1920x1080 upgrade)

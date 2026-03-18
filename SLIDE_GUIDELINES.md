# Guidely — Padrões dos Slides Gerados

> Referência de estrutura visual predefinida pelo plugin Guidely baseada no **CALCU Playground / Andes X** (1920x1080, formato 16:9). Este arquivo guia a IA na concepção do conteúdo para cada slide.

---

## 📐 Especificações Técnicas (Andes X)

| Propriedade | Valor |
|---|---|
| **Dimensões** | 1920 × 1080px (16:9) |
| **Margens padrão** | Topo: 120px / Fundo: 80px / Laterais: 100px |
| **Fonte** | Inter (Regular, Semi Bold, Bold, Extra Bold) |
| **Design system** | Andes X tokens, Layout limpo com Gradient Blobs |

### Estilos Fixos de Texto (Já aplicados na geração visual)
- Título principal (Capa): **120px Extra Bold**
- Títulos de seção/destaque: **56px a 64px Extra Bold**
- Títulos internos (Componentes/Cards): **20px Semi Bold/Bold**
- Tags e Labels superiores: **16px Bold (Maiúsculo, ex: GUIDELINE - UX)**
- Corpo / Notas / Definições: **18px a 22px Regular**

---

## 🖼️ Sobre Mockups Automatizados

**O Guidely coleta as telas do Figma e insere automaticamente nos mockups.**
Sempre que você criar um slide que demonstre uma tela (ex: Anatomy, Use Case, Behavior, Structure), você deve fornecer a propriedade `"mockupFrameId"` indicando o Node ID exato da tela na sessão `## Frames disponíveis para mockupFrameId`.

### Como o Guidely fará:
1. Exportará a tela do Figma fornecida no ID em alta resolução (`scale=2`).
2. Removerá o placeholder (bloco vazio) e alinhará a imagem perfeita e escalada na direita ou na coluna correspondente, seguindo o Aspect Ratio intrínseco (Mobile-first, fones encapsulados).
3. O designer pode complementar no Figma (ex: dashed lines ou conectores de Fluxo) depois da geração base.

---

## 📋 Padrão de Conteúdo (Base Guideline)

### Cover
- Fundo: Yellow (`#ffe600`) com background decorativo (Blobs degradê)
- Elementos: Subtítulo (UX, Guideline), Título principal gigante, tag/selo branco.

### Objective
- Slide branco com blobs e header superior transparente.
- Duas colunas frontais e título `Objetivo do guideline`.
- Texto limpo explicando a razão.

### Glossary
- Grid dividido em tabelas claras.
- Termos de contexto / Siglas. Máx 10 termos formatados.

### Anatomy / Component Focus
- Layout split: Especificações descritivas na esquerda (Anotações numeradas com tags de "Obrigatório"/"Opcional").
- Coluna da direita: O MockupFrameId importado em evidência na altura total.

### Use Case
- Títulos grandes com os casos e "Notes" associados.
- Tags curtas marcando componentes visíveis no caso.

### Behavior & Wording
- Tabelas descritivas listadas com headers preenchidos.
- Wording: Cards estruturados listando "Mensagem", "Brasil", e "Razão / Objetivos".

### Estruturas de Comparação (Antes / Depois ou Duplo)
- Utilização focada de dois `mockupFrameId` paralelos, explicitando mudança comportamental na jornada em passos.

---

## ✅ Checklist do Designer pós-geração
- [ ] O mockup inserido atende o limite do zoom esperado no template?
- [ ] As notas ou setas de "Anatomy" estão corretamente apontadas caso inseridas por cima?
- [ ] Todos os labels extras inseridos estão corretos no idioma pretendido?
- [ ] Casos de uso complexos ou "Flow slides" que usam conectores complexos devem adotar setas via FigJam Connector Tool na etapa manual.

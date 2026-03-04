# Guidely — Padrões dos Slides Gerados

> Referência para designers e lideranças entenderem o que o Guidely gera, como completar, e como garantir qualidade para apresentações a stakeholders.

---

## 📐 Especificações Técnicas

| Propriedade | Valor |
|---|---|
| **Dimensões** | 1440 × 900px (16:10) |
| **Margem horizontal** | 80px |
| **Margem vertical** | 64px |
| **Gap entre slides no canvas** | 80px |
| **Fonte** | Inter (400, 600, 700, 800) |
| **Design system** | Andes X tokens |

### Tipografia — tamanhos usados

| Elemento | Tamanho | Peso |
|---|---|---|
| Título Cover | 72px | Extra Bold |
| Títulos de slides | 40px | Bold |
| Labels de seção | 12px | Semi Bold (UPPERCASE) |
| Corpo de texto | 16-20px | Regular |
| Células de tabela | 14px | Regular / Semi Bold |
| Tags e chips | 11px | Semi Bold |
| Header bar | 12px | Semi Bold |

---

## 🖼️ Sobre Mockups — Como Completar os Slides

**O Guidely gera a estrutura e o conteúdo textual dos slides, mas os mockups precisam ser inseridos manualmente pelo designer.**

Todo slide que precisa de imagem tem um placeholder cinza com o texto descrevendo o que inserir:

> _"Inserir tela do CDU Pix em estado default"_

### Como inserir mockups corretamente

1. **Exporte o frame do Figma**: selecione a tela relevante → Export → PNG 2x
2. **Localize o placeholder** no slide gerado (retângulo cinza à direita)
3. **Substitua**: clique no placeholder → selecione a imagem → ajuste o crop

### Quais slides precisam de mockup

| Tipo de slide | O que inserir |
|---|---|
| **Anatomy** | Screenshot anotado da tela com os componentes numerados |
| **Use Case** | Screenshot da tela no estado default do CDU |
| **Behavior** | Screenshots dos estados lado a lado (idle / focus / error) |
| **Wording** | Screenshot da tela onde a mensagem de erro aparece |

---

## 📋 Padrão de Conteúdo — Baseado no CHO PX Guideline

O Guidely segue o padrão de conteúdo do CHO PX Guideline do Mercado Pago. Cada tipo de slide tem um padrão específico:

### Cover
- Fundo escuro `#0d0d1b`
- Label "GUIDELINE" em verde MP `#00a650`
- Título grande + subtítulo + team · versão
- Linha de accent no topo (80×4px, verde)

### Objective
- Label de seção no topo
- Corpo em 2-3 parágrafos: o que é, por que existe, quem é owner
- **Máximo**: 4 frases por parágrafo

### Glossary
- Grid de 2 colunas
- Termos domain-specific reais (TCMP, AM, CDU, RyC…)
- **Máximo**: 10 termos por slide (se houver mais, divida em múltiplos slides)
- Definição: máximo 2 linhas

### Anatomy
- Lista numerada de componentes com tag Obrigatório/Optativo
- Placeholder de mockup anotado à direita
- Note de specs de espaçamento quando disponível no Figma
- **Máximo**: 9 componentes por slide

### Use Case Map
- Tabela com cabeçalho escuro
- Linhas zebra (branco/cinza)
- CDUs nas colunas, componentes nas linhas
- ✅ / — para presença/ausência

### Use Case (por CDU)
- Título em CAPS (ex: "PAGAMENTO PIX")
- Tags de países com flags (🇧🇷 🇦🇷 🇲🇽)
- Corpo no padrão:
  ```
  Nesse CDU exibimos:
  • Header com título e nome do recebedor
  • Amount Field para input do valor
  • ...
  ```
- Lista de componentes em chips/tags
- **Máximo**: 5 bullets no corpo
- Placeholder de mockup à direita

### Behavior (por categoria)
- Tabela de estados com header escuro
- Formato: **Estado/Condição** | **Descrição do que aparece na tela**
- Exemplo: `Estado zero | Campo vazio, cursor piscando. CTA desabilitada.`
- **Máximo**: 6 linhas na tabela
- Placeholder de mockup à direita

### Do/Dont
- Duas colunas: verde (✅ Faça) e vermelho (❌ Evite)
- Regras específicas ao componente — não genéricas
- **Máximo**: 4 regras por coluna
- Cada regra: máximo 2 linhas

### Wording
- Card por tipo de mensagem (erro, sucesso, etc.)
- Objetivo da mensagem (1 frase)
- Chips por país: 🇧🇷 `Insira um valor menor que {R$ X}.` | 🇦🇷 `Ingresa un monto menor a {$ X}.`
- Racional quando relevante (por que essa frase, não outra)

### Contact
- Fundo escuro `#0d0d1b`
- Canal de Slack em destaque
- Máximo 3-4 links úteis

---

## 🎨 Paleta de Cores — Tokens Andes X

| Uso | Token | Valor |
|---|---|---|
| Fundo geral | — | `#ffffff` |
| Fundo cards | `ax-gray/100` | `#f4f5f9` |
| Fundo dark (cover, contact) | `ax-dark-gray/200` | `#0d0d1b` |
| Texto primário | `ax-gray/900` | `#282833` |
| Texto secundário | `ax-gray/700` | `#646587` |
| Accent (labels, tags) | `ax-blue/700` | `#434be4` |
| MP Green (cover accent) | `al-green/500` | `#00a650` |
| Fundo "Faça" | `ax-green/100` | `#defade` |
| Fundo "Evite" | `ax-red/100` | `#ffe5e9` |
| Borda | `ax-gray/300` | `#d0d4e6` |

---

## ✅ Checklist — Antes de apresentar para lideranças

### Conteúdo
- [ ] Todos os termos do glossário são domain-specific (não genéricos)
- [ ] Os CDUs têm nomes reais do Figma (não "Caso de uso 1")
- [ ] Os países/sites estão corretos e atualizados
- [ ] Os comportamentos documentam estados reais (não hipotéticos)
- [ ] As regras de Do/Dont são específicas ao componente (não "seja consistente")
- [ ] O wording foi validado com copy/UX writing
- [ ] Versão e data na capa estão corretos

### Visual
- [ ] Todos os placeholders de mockup foram substituídos por screenshots reais
- [ ] Os mockups estão em estado default (a menos que o slide mostre outro estado)
- [ ] Mockups exportados em 2x para resolução adequada
- [ ] Nenhum texto cortado ou com overflow nos slides

### Apresentação
- [ ] Slides visualizados em 100% de zoom antes de apresentar
- [ ] Testado em tela de projetor ou TV (mínimo 1440px de largura)
- [ ] Links do slide de contato estão funcionando
- [ ] Número de slides está coerente com o tempo disponível

---

## ⚠️ Limitações atuais do Guidely

| Limitação | Workaround |
|---|---|
| Mockups são placeholders | Inserir screenshots manualmente após geração |
| Slides de flow/jornada não suportados | Criar manualmente no Figma como complement |
| Animações/microinterações não documentadas | Adicionar link para protótipo no slide de contato |
| Múltiplas variações do mesmo componente | Duplicar slides manualmente e editar |

---

## 🔄 Como atualizar o guideline

Quando o componente evoluir:

1. Abra o Guidely novamente com o arquivo Figma atualizado
2. Responda as perguntas com as mudanças
3. Gere uma nova versão — o Guidely criará slides novos no canvas
4. Atualize a versão na capa (ex: V1 → V2)
5. Archive a versão anterior (mova para uma página separada no Figma)

---

**Última atualização:** 2026-03-04
**Versão do Guidely:** 1.0

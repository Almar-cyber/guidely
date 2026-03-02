import type {
  GuidelineData, Slide, CoverSlide, ObjectiveSlide, GlossarySlide, AnatomySlide,
  UseCaseMapSlide, UseCaseSlide, BehaviorSlide, DoDontSlide, WordingSlide, ContactSlide,
} from './types'

function renderCover(s: CoverSlide) {
  return `# ${s.title}\n**${s.subtitle}**\n${s.team} · ${s.version}`
}

function renderObjective(s: ObjectiveSlide) {
  return `## Objetivo do guideline\n\n${s.body}`
}

function renderGlossary(s: GlossarySlide) {
  const rows = s.terms.map((t) => `| **${t.term}** | ${t.definition} |`).join('\n')
  return `## Glosário\n\n| Termo | Definição |\n|---|---|\n${rows}`
}

function renderAnatomy(s: AnatomySlide) {
  const comps = s.components
    .map((c) => `${c.index}. **${c.name}** — ${c.required ? 'Obrigatório' : 'Optativo'}`)
    .join('\n')
  return [
    `## ${s.title}`,
    s.body ?? '',
    comps,
    s.note ? `\n> ⚠️ ${s.note}` : '',
    '\n> 📸 _Inserir mockup anotado da estrutura base_',
  ].filter(Boolean).join('\n\n')
}

function renderUseCaseMap(s: UseCaseMapSlide) {
  const header = `| Componente | ${s.caseNames.join(' | ')} |`
  const sep = `|---|${s.caseNames.map(() => '---').join('|')}|`
  const rows = s.rows
    .map((r) => `| ${r.component} | ${s.caseNames.map((c) => (r.cases[c] ? '✅' : '—')).join(' | ')} |`)
    .join('\n')
  return `## ${s.title}\n\n${header}\n${sep}\n${rows}`
}

function renderUseCase(s: UseCaseSlide) {
  const countries = s.countries?.join(' ') ?? ''
  const comps = s.components.join(' · ')
  return [
    `## CDU: ${s.title}${countries ? ` ${countries}` : ''}`,
    s.body,
    `**Componentes:** ${comps}`,
    '> 📸 _Inserir tela do caso de uso_',
  ].join('\n\n')
}

function renderBehavior(s: BehaviorSlide) {
  const rows = s.rows.map((r) => `| **${r.label}** | ${r.value} |`).join('\n')
  return [
    `## ${s.title}`,
    s.description ?? '',
    `| Estado / Condição | Descrição |\n|---|---|\n${rows}`,
    '> 📸 _Inserir tela de exemplo_',
  ].filter(Boolean).join('\n\n')
}

function renderDoDont(s: DoDontSlide) {
  const doList = s.do.map((d) => `- ✅ ${d}`).join('\n')
  const dontList = s.dont.map((d) => `- ❌ ${d}`).join('\n')
  return `## ${s.title}\n\n### Faça\n${doList}\n\n### Evite\n${dontList}`
}

function renderWording(s: WordingSlide) {
  const errors = s.errors.map((e) => {
    const variants = e.variants.map((v) => `- ${v.flag} **${v.country}:** \`${v.text}\``).join('\n')
    return `### ${e.name}\n**Objetivo:** ${e.objective}\n\n${variants}${e.rationale ? `\n\n> ⚠️ ${e.rationale}` : ''}`
  }).join('\n\n---\n\n')
  return `## ${s.title}\n\n${errors}`
}

function renderContact(s: ContactSlide) {
  const links = s.links.map((l) => `- 🔗 [${l.label}](${l.url})`).join('\n')
  return `## Contato\n\n**Slack:** \`${s.channel}\`\n\n${links}`
}

function renderSlide(slide: Slide): string {
  switch (slide.type) {
    case 'cover': return renderCover(slide as CoverSlide)
    case 'objective': return renderObjective(slide as ObjectiveSlide)
    case 'glossary': return renderGlossary(slide as GlossarySlide)
    case 'anatomy': return renderAnatomy(slide as AnatomySlide)
    case 'use_case_map': return renderUseCaseMap(slide as UseCaseMapSlide)
    case 'use_case': return renderUseCase(slide as UseCaseSlide)
    case 'behavior': return renderBehavior(slide as BehaviorSlide)
    case 'do_dont': return renderDoDont(slide as DoDontSlide)
    case 'wording': return renderWording(slide as WordingSlide)
    case 'contact': return renderContact(slide as ContactSlide)
  }
}

export function exportToMarkdown(data: GuidelineData): string {
  const header = `<!-- Guideline gerado por UX Guidelines AI · ${new Date().toLocaleDateString('pt-BR')} -->\n\n`
  const slides = data.slides.map((s) => renderSlide(s)).join('\n\n---\n\n')
  return header + slides
}

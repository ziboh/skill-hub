import type { UiIconName } from '../components/UiIcon.vue'

export type SkillCategory = 'search' | 'content' | 'dev' | 'testing' | 'ops' | 'other'

export const SKILL_CATEGORIES: Record<SkillCategory, { label: string; labelEn: string; icon: UiIconName }> = {
  search: { label: '搜索', labelEn: 'Search', icon: 'search' },
  content: { label: '内容', labelEn: 'Content', icon: 'sparkles' },
  dev: { label: '开发', labelEn: 'Development', icon: 'wrench' },
  testing: { label: '测试', labelEn: 'Testing', icon: 'pencil' },
  ops: { label: '运维', labelEn: 'Ops', icon: 'rocket' },
  other: { label: '其他', labelEn: 'Other', icon: 'clipboard' },
}

export const ALL_CATEGORIES = Object.keys(SKILL_CATEGORIES) as SkillCategory[]

export function inferCategory(slug: string, description: string): SkillCategory {
  const text = `${slug} ${description}`.toLowerCase()
  if (/(test|lint|debug|playwright|screenshot|quality|validate|verify|check|jest|vitest|mocha|cypress|eslint|prettier|lint)/.test(text))
    return 'testing'
  if (
    /(deploy|vercel|docker|cloudflare|netlify|k8s|kubernetes|helm|terraform|ci[\s\/]|cd[\s\/]|monitor|ops|sentry|container|server|infra|cloud|netlify)/.test(
      text,
    )
  )
    return 'ops'
  if (/(search|web|crawl|scrape|research|lookup|find|query|browser|rss|feed|data|sql|chart|report|analy|crawl|scrape|rss)/.test(text))
    return 'search'
  if (
    /(generate|ai|image|video|art|prompt|llm|translation|speech|pptx|docx|pdf|xlsx|office|design|figma|canvas|brand|notepad|write|content|create|layout|responsive|media|photo|audio|voice|translate|summarize|write|blog|article|copy)/.test(
      text,
    )
  )
    return 'content'
  if (
    /(github|git|code|cli|dev|pr|api|sdk|mcp|plugin|template|boilerplate|starter|meta|extend|notion|linear|jira|ticket|kanban|sprint|manage|project|security|audit|auth|secret|encrypt|vulnerability|html|css|frontend|backend|openapi|swagger)/.test(
      text,
    )
  )
    return 'dev'
  return 'other'
}

export const CATEGORY_ICONS: Record<SkillCategory, UiIconName> = {
  search: 'search',
  content: 'sparkles',
  dev: 'wrench',
  testing: 'pencil',
  ops: 'rocket',
  other: 'clipboard',
}

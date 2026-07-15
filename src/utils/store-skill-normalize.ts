import type { Skill, SkillSource } from '../types'
import { inferCategory } from '../data/skill-categories'

export function slugifySkillName(name: string): string {
  return (name || 'unknown').toLowerCase().trim().replace(/\s+/g, '-')
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== 'string') continue
    const text = value.trim()
    if (text) return text
  }
  return ''
}

export function readStoreSkillDescription(entry: any): string {
  return firstText(
    entry?.description,
    entry?.summary,
    entry?.desc,
    entry?.shortDescription,
    entry?.short_description,
    entry?.tagline,
    entry?.manifest?.description,
    entry?.frontmatter?.description,
    entry?.metadata?.description,
    entry?.skill?.description,
  )
}

export function readStoreSkillTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((t) => String(t).trim()).filter(Boolean)
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
  }
  return []
}

export function completeStoreSkill(base: Partial<Skill> & Pick<Skill, 'id' | 'name' | 'source'>, entry: any = {}): Skill {
  const description = firstText(base.description, readStoreSkillDescription(entry))
  const tags = base.tags?.length ? base.tags : readStoreSkillTags(entry?.tags || entry?.manifest?.tags || entry?.frontmatter?.tags)
  const author = firstText(base.author, entry?.author, entry?.owner, entry?.publisher, entry?.manifest?.author, entry?.metadata?.author)
  const category = base.category || inferCategory(base.path || slugifySkillName(base.name), description)

  return {
    ...base,
    description,
    author,
    tags,
    category,
  } as Skill
}

export function makeStoreSkillId(sourceId: string, source: SkillSource, repo: string | undefined, name: string): string {
  const slug = slugifySkillName(name)
  if (repo) return `${repo}/${slug}`
  return `${sourceId || source}/${slug}`
}

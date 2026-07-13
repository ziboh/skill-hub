import type { Skill } from '../../types'
import { KEYS, README_TTL, dbGet, dbSet } from './core'

export const webCacheApi = {
  getWebCache(id: string): { skills: Skill[]; fetchedAt: number } | null {
    const all = dbGet<Record<string, { skills: Skill[]; fetchedAt: number }>>(KEYS.WEB_CACHE)
    return all?.[id] || null
  },
  saveWebSkills(id: string, skills: Skill[]): void {
    const all = dbGet<Record<string, { skills: Skill[]; fetchedAt: number }>>(KEYS.WEB_CACHE) || {}
    all[id] = { skills, fetchedAt: Date.now() }
    dbSet(KEYS.WEB_CACHE, all)
  },
  getAllWebCaches(): Record<string, { skills: Skill[]; fetchedAt: number }> {
    return dbGet<Record<string, { skills: Skill[]; fetchedAt: number }>>(KEYS.WEB_CACHE) || {}
  },
  saveWebSkillReadme(skill: Skill, readme: string): void {
    const all = dbGet<Record<string, { skills: Skill[]; fetchedAt: number }>>(KEYS.WEB_CACHE) || {}
    const sourceId = (skill as any).storeSourceId || 'unknown'
    if (!all[sourceId]) {
      all[sourceId] = { skills: [], fetchedAt: Date.now() }
    }
    const existing = all[sourceId].skills.find((s) => s.id === skill.id)
    if (existing) {
      existing.readme = readme
      existing.readmeCachedAt = Date.now()
    } else {
      all[sourceId].skills.push({ ...skill, readme, readmeCachedAt: Date.now() })
    }
    dbSet(KEYS.WEB_CACHE, all)
  },
  getCachedWebSkillReadme(skillId: string): string | null {
    const all = dbGet<Record<string, { skills: Skill[]; fetchedAt: number }>>(KEYS.WEB_CACHE) || {}
    for (const [, entry] of Object.entries(all)) {
      const skill = entry.skills.find((s) => s.id === skillId)
      if (skill?.readme) {
        if (!skill.readmeCachedAt || Date.now() - skill.readmeCachedAt > README_TTL) {
          delete skill.readme
          delete skill.readmeCachedAt
          dbSet(KEYS.WEB_CACHE, all)
          return null
        }
        return skill.readme
      }
    }
    return null
  },
  clearWebCache(id: string): void {
    const all = dbGet<Record<string, { skills: Skill[]; fetchedAt: number }>>(KEYS.WEB_CACHE) || {}
    delete all[id]
    dbSet(KEYS.WEB_CACHE, all)
  },
  clearAllWebCaches(): void {
    dbSet(KEYS.WEB_CACHE, {})
  },
}

import type { Skill } from '../../types'
import { KEYS, README_TTL, dbGet, dbSet } from './core'

export const githubCacheApi = {
  getGitHubCache(): Record<string, Skill> {
    const raw = dbGet<Record<string, any>>(KEYS.GITHUB_CACHE)
    if (!raw) return {}
    for (const val of Object.values(raw)) {
      if (val && typeof val === 'object' && Array.isArray((val as any).skills)) {
        const pool: Record<string, Skill> = {}
        for (const v of Object.values(raw)) {
          const entry = v as { skills: Skill[] }
          if (entry.skills) {
            for (const s of entry.skills) {
              if (s.description || s.shortDescription) pool[s.id] = s
            }
          }
        }
        dbSet(KEYS.GITHUB_CACHE, pool)
        return pool
      }
    }
    return raw as Record<string, Skill>
  },
  saveGitHubSkills(skills: Skill[]): void {
    const pool = githubCacheApi.getGitHubCache()
    for (const s of skills) {
      if (s.description || s.shortDescription || s.readme) {
        pool[s.id] = s
      }
    }
    dbSet(KEYS.GITHUB_CACHE, pool)
  },
  removeGitHubSkill(id: string): void {
    const pool = githubCacheApi.getGitHubCache()
    delete pool[id]
    dbSet(KEYS.GITHUB_CACHE, pool)
  },
  clearGitHubCache(): void {
    dbSet(KEYS.GITHUB_CACHE, {})
  },
  getCachedReadme(skillId: string): string | null {
    const pool = githubCacheApi.getGitHubCache()
    const cached = pool[skillId]
    if (!cached?.readme) return null
    if (!cached.readmeCachedAt || Date.now() - cached.readmeCachedAt > README_TTL) {
      delete cached.readme
      delete cached.readmeCachedAt
      dbSet(KEYS.GITHUB_CACHE, pool)
      return null
    }
    return cached.readme
  },
}

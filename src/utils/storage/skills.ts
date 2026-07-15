import type { Skill, SkillSource } from '../../types'
import { getSkillsRepoDir, getSkillsRepoDirUnder } from '../skill-path'
import {
  KEYS,
  PREFIX,
  cleanDescription,
  dbGet,
  dbSet,
  stripSkillFields,
  getDownloadedSkillsCache,
  setDownloadedSkillsCache,
  getDownloadedSetCache,
  setDownloadedSetCache,
  reseedDownloadedSkills,
  reseedDistributeRecords,
  invalidateDownloadedSkills,
} from './core'
import { distributeApi } from './distribute'

export const skillsApi = {
  getDownloadedSkills(): Skill[] {
    if (!getDownloadedSkillsCache()) {
      try {
        window.ztools.dbStorage.removeItem(PREFIX + KEYS.TRANSLATIONS + '_desc')
      } catch {
        /* ignore */
      }
      setDownloadedSkillsCache(dbGet<Skill[]>(KEYS.DOWNLOADED_SKILLS) || [])
    }
    return getDownloadedSkillsCache()!
  },
  saveDownloadedSkills(skills: Skill[], options?: { forceStoreSourceId?: boolean }): void {
    const existing = skillsApi.getDownloadedSkills()
    const map = new Map(existing.map((s) => [s.id, s]))
    const now = new Date().toISOString()
    for (const s of skills) {
      const copy = stripSkillFields(JSON.parse(JSON.stringify(s)) as Skill)
      copy.description = cleanDescription(copy.description)
      const existingSkill = map.get(copy.id)
      if (existingSkill) {
        if (!options?.forceStoreSourceId) {
          copy.storeSourceId = existingSkill.storeSourceId
        }
        copy.downloadedAt = existingSkill.downloadedAt || copy.downloadedAt
      } else {
        copy.downloadedAt = copy.downloadedAt || now
      }
      map.set(copy.id, copy)
    }
    const next = Array.from(map.values())
    reseedDownloadedSkills(next)
    dbSet(KEYS.DOWNLOADED_SKILLS, next)
  },
  replaceDownloadedSkills(skills: Skill[]): void {
    const next = skills.map((s) => {
      const copy = stripSkillFields(JSON.parse(JSON.stringify(s)) as Skill)
      copy.description = cleanDescription(copy.description)
      return copy
    })
    reseedDownloadedSkills(next)
    dbSet(KEYS.DOWNLOADED_SKILLS, next)
  },
  getFavoriteIds(): string[] {
    return skillsApi
      .getDownloadedSkills()
      .filter((s) => s.isFavorited)
      .map((s) => s.id)
  },
  toggleFavorite(id: string, meta?: { name?: string; description?: string; author?: string; tags?: string[]; source?: SkillSource }): void {
    const skills = skillsApi.getDownloadedSkills()
    let idx = skills.findIndex((s) => s.id === id)

    if (idx < 0 && meta?.name) {
      const normalizedName = meta.name.toLowerCase()
      idx = skills.findIndex((s) => s.name && s.name.toLowerCase() === normalizedName)
    }

    if (idx < 0) {
      const entry: Skill = {
        id,
        name: meta?.name || id,
        description: meta?.description || '',
        author: meta?.author || '',
        tags: meta?.tags || [],
        source: meta?.source || 'local',
        isFavorited: true,
      }
      skills.push(entry)
      reseedDownloadedSkills(skills)
      dbSet(KEYS.DOWNLOADED_SKILLS, skills)
      return
    }
    skills[idx] = { ...skills[idx], isFavorited: !skills[idx].isFavorited }
    reseedDownloadedSkills(skills)
    dbSet(KEYS.DOWNLOADED_SKILLS, skills)
  },
  saveSkillUserTags(skillId: string, userTags: string[]): void {
    const skills = skillsApi.getDownloadedSkills()
    const idx = skills.findIndex((s) => s.id === skillId)
    if (idx >= 0) {
      skills[idx] = { ...stripSkillFields(skills[idx]), userTags }
      reseedDownloadedSkills(skills)
      dbSet(KEYS.DOWNLOADED_SKILLS, skills)
    }
  },
  getSkillUserTags(skillId: string): string[] {
    const skills = skillsApi.getDownloadedSkills()
    const skill = skills.find((s) => s.id === skillId)
    return skill?.userTags || []
  },
  getDownloadedIds(): string[] {
    return skillsApi.getDownloadedSkills().map((s) => s.id)
  },
  getDownloadedSet(): Set<string> {
    if (!getDownloadedSetCache()) {
      setDownloadedSetCache(new Set(skillsApi.getDownloadedSkills().map((s) => s.id)))
    }
    return getDownloadedSetCache()!
  },
  addDownloadedId(id: string): void {
    const skills = skillsApi.getDownloadedSkills()
    if (skills.some((s) => s.id === id)) return
    skills.push({ id, name: id, description: '', author: '', tags: [], source: 'local' })
    reseedDownloadedSkills(skills)
    dbSet(KEYS.DOWNLOADED_SKILLS, skills)
  },
  removeDownloadedId(id: string): void {
    const skills = skillsApi.getDownloadedSkills()
    const filtered = skills.filter((s) => s.id !== id)
    if (filtered.length === skills.length) return
    reseedDownloadedSkills(filtered)
    dbSet(KEYS.DOWNLOADED_SKILLS, filtered)
  },
  isDownloaded(id: string): boolean {
    return skillsApi.getDownloadedSet().has(id)
  },
  enrichDownloadedDescriptions(): boolean {
    let changed = false
    const cached = skillsApi.getDownloadedSkills()
    for (const skill of cached) {
      try {
        const skillDir = getSkillsRepoDir(skill.id)
        if (!window.services.pathExists(skillDir)) continue
        if (skill.path) {
          const n = skill.path.replace(/\\/g, '/').toLowerCase()
          const t = skillDir.replace(/\\/g, '/').toLowerCase()
          if (n === t || n.includes('/skills-repo/')) {
            skill.path = undefined
            changed = true
          }
        }
        const files = window.services.readDir(skillDir)
        const skillMd = files.find((f: any) => f.name === 'SKILL.md' || f.name === 'skill.md')
        if (skillMd) {
          const parsed = window.services.parseSkillFile(skillMd.path)
          if (parsed?.manifest) {
            if (parsed.manifest.description && parsed.manifest.description !== skill.description) {
              skill.description = parsed.manifest.description
              changed = true
            }
            if (parsed.manifest.name && parsed.manifest.name !== skill.name) {
              skill.name = parsed.manifest.name
              changed = true
            }
            if (parsed.manifest.author && parsed.manifest.author !== skill.author) {
              skill.author = parsed.manifest.author
              changed = true
            }
            const nextTags = Array.isArray(parsed.manifest.tags) ? parsed.manifest.tags : []
            const prevTags = skill.tags || []
            if (nextTags.length && (prevTags.length !== nextTags.length || nextTags.some((t, i) => t !== prevTags[i]))) {
              skill.tags = nextTags
              changed = true
            }
            continue
          }
        }
      } catch {
        /* ignore per-skill errors */
      }
      const cleaned = cleanDescription(skill.description)
      if (cleaned !== skill.description) {
        skill.description = cleaned || ''
        changed = true
      }
    }
    if (changed) {
      skillsApi.replaceDownloadedSkills(cached)
    }
    return changed
  },
  cleanStaleDownloadedSkills(): void {
    const repoRoot = window.services.pathJoin(window.ztools.getPath('userData'), 'skills-repo')
    const cached = skillsApi.getDownloadedSkills()

    const alive = cached.filter((skill) => {
      try {
        const dir = getSkillsRepoDirUnder(repoRoot, skill.id)
        return window.services.pathExists(dir)
      } catch {
        return false
      }
    })
    if (alive.length !== cached.length) {
      reseedDownloadedSkills(alive)
      dbSet(KEYS.DOWNLOADED_SKILLS, alive)
    }

    const aliveIds = new Set(alive.map((s) => s.id))
    const prevDist = distributeApi.getDistributeRecords()
    const aliveDistributeRecords = prevDist.filter((r) => aliveIds.has(r.skillId))
    if (aliveDistributeRecords.length !== prevDist.length) {
      reseedDistributeRecords(aliveDistributeRecords)
      dbSet(KEYS.DISTRIBUTED_SKILLS, aliveDistributeRecords)
    }
  },
  updateChineseTags(): void {
    const skills = skillsApi.getDownloadedSkills()
    let changed = false
    for (const skill of skills) {
      const content = skill.description || ''
      const chineseChars = content.match(/[\u4e00-\u9fff]/g)
      const hasChinese = chineseChars && chineseChars.length / content.length > 0.1
      if (hasChinese && !skill.tags?.includes('中文')) {
        skill.tags = [...(skill.tags || []), '中文']
        changed = true
      }
    }
    if (changed) {
      dbSet(KEYS.DOWNLOADED_SKILLS, skills)
      invalidateDownloadedSkills()
    }
  },
  removeDownloadedSkill(skillId: string): void {
    const skills = skillsApi.getDownloadedSkills()
    const filtered = skills.filter((s) => s.id !== skillId)
    invalidateDownloadedSkills()
    dbSet(KEYS.DOWNLOADED_SKILLS, filtered)
  },
}

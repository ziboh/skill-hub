import type { DistributeRecord, Skill } from '../../types'

export const PREFIX = 'sm_'

export const KEYS = {
  DISTRIBUTED_SKILLS: 'distributed_skills',
  STORE_SOURCES: 'store_sources',
  PLATFORM_CONFIGS: 'platform_configs',
  PLATFORM_ORDER: 'platform_order',
  SETTINGS: 'settings',
  DOWNLOADED_SKILLS: 'downloaded_skills',
  OLD_CACHED_SKILLS: 'cached_skills',
  REGISTERED_PROJECTS: 'registered_projects',
  TRANSLATIONS: 'translations',
  FAILURE_RECORDS: 'failure_records',
  GITHUB_CACHE: 'github_cache',
  WEB_CACHE: 'web_cache',
  USER_ICONS: 'user_icons',
} as const

export const README_TTL = 43200000 // 12 小时

export function cleanDescription(desc: string): string {
  if (!desc) return desc
  if ((desc.startsWith('"') && desc.endsWith('"')) || (desc.startsWith("'") && desc.endsWith("'"))) {
    desc = desc.slice(1, -1)
  }
  if (desc.startsWith('[') && desc.endsWith(']')) {
    desc = desc.slice(1, -1).trim()
  }
  if (/^[\[\]{}()]+$/.test(desc)) return ''
  if (/^[>|][+-]?$/.test(desc)) return ''
  return desc
}

export function dbSet(key: string, value: any): void {
  try {
    window.ztools.dbStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch (e) {
    console.error(`[storage] dbSet failed for "${key}":`, e)
  }
}

export function dbGet<T = any>(key: string): T | null {
  try {
    const raw = window.ztools.dbStorage.getItem(PREFIX + key)
    if (raw === null || raw === undefined) return null
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw) as T
      } catch {
        return null
      }
    }
    return raw as T
  } catch (e) {
    console.error(`[storage] dbGet failed for "${key}":`, e)
    return null
  }
}

const STRIPPED_FIELDS: (keyof Skill)[] = [
  'shortDescription',
  'homepage',
  'readmeCachedAt',
  'installCount',
  'iconUrl',
  'canonicalId',
  'installUrl',
]

export function stripSkillFields(skill: Skill): Skill {
  const copy = { ...skill }
  for (const f of STRIPPED_FIELDS) delete copy[f]
  return copy
}

// Cache state (module-level)
let _distributeRecordsCache: DistributeRecord[] | null = null
let _distributedSkillSetCache: Set<string> | null = null
let _downloadedSkillsCache: Skill[] | null = null
let _downloadedSetCache: Set<string> | null = null

export function getDistributeRecordsCache() {
  return _distributeRecordsCache
}
export function setDistributeRecordsCache(v: DistributeRecord[] | null) {
  _distributeRecordsCache = v
}
export function getDistributedSkillSetCache() {
  return _distributedSkillSetCache
}
export function setDistributedSkillSetCache(v: Set<string> | null) {
  _distributedSkillSetCache = v
}
export function getDownloadedSkillsCache() {
  return _downloadedSkillsCache
}
export function setDownloadedSkillsCache(v: Skill[] | null) {
  _downloadedSkillsCache = v
}
export function getDownloadedSetCache() {
  return _downloadedSetCache
}
export function setDownloadedSetCache(v: Set<string> | null) {
  _downloadedSetCache = v
}

export function invalidateDistributeCache() {
  _distributeRecordsCache = null
  _distributedSkillSetCache = null
}
export function invalidateDownloadedSkills() {
  _downloadedSkillsCache = null
  _downloadedSetCache = null
}

export function reseedDownloadedSkills(skills: Skill[]) {
  _downloadedSkillsCache = skills
  _downloadedSetCache = new Set(skills.map((s) => s.id))
}

export function reseedDistributeRecords(records: DistributeRecord[]) {
  _distributeRecordsCache = records
  _distributedSkillSetCache = new Set(records.map((r) => r.skillId))
}

/** Clear module caches (tests / after bulk dbStorage.clear). */
export function resetStorageCaches() {
  invalidateDistributeCache()
  invalidateDownloadedSkills()
}

export interface SessionDownload {
  skillId: string
  skillName: string
  source: string
  downloadedAt: string
}

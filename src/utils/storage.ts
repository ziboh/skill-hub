import type { DistributeRecord, StoreSource, AppSettings, PlatformInfo, Skill, SkillSource, RegisteredProject, ModelConfig, FailureRecord, FailureType } from '../types'
import { BUILTIN_PROVIDERS } from '../data/ai-providers'

const PREFIX = 'sm_'

function cleanDescription(desc: string): string {
  if (!desc) return desc
  if (desc.startsWith('[') && desc.endsWith(']')) {
    desc = desc.slice(1, -1).trim()
  }
  if (/^[\[\]{}()]+$/.test(desc)) return ''
  if (/^[>|][+-]?$/.test(desc)) return ''
  return desc
}

function dbSet(key: string, value: any): void {
  try {
    window.ztools.dbStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch (e) {
    console.error(`[storage] dbSet failed for "${key}":`, e)
  }
}

function dbGet<T = any>(key: string): T | null {
  try {
    const raw = window.ztools.dbStorage.getItem(PREFIX + key)
    if (raw === null || raw === undefined) return null
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) as T } catch { return null }
    }
    return raw as T
  } catch (e) {
    console.error(`[storage] dbGet failed for "${key}":`, e)
    return null
  }
}

const STRIPPED_FIELDS: (keyof Skill)[] = ['shortDescription', 'homepage', 'readmeCachedAt', 'installCount', 'iconUrl', 'canonicalId', 'installUrl']

function stripSkillFields(skill: Skill): Skill {
  const copy = { ...skill }
  for (const f of STRIPPED_FIELDS) delete copy[f]
  return copy
}

function migrateOldCachedSkills(): void {
  try {
    const raw = window.ztools.dbStorage.getItem(PREFIX + KEYS.OLD_CACHED_SKILLS)
    if (!raw) return
    const old: Skill[] = JSON.parse(raw)
    const downloaded = old.filter(s => s.downloaded).map(s => stripSkillFields(s))
    if (downloaded.length > 0) {
      window.ztools.dbStorage.setItem(PREFIX + KEYS.DOWNLOADED_SKILLS, JSON.stringify(downloaded))
    }
    window.ztools.dbStorage.removeItem(PREFIX + KEYS.OLD_CACHED_SKILLS)
    console.log(`[storage] migrated ${old.length} cached skills → ${downloaded.length} downloaded skills`)
  } catch (e) {
    console.warn('[storage] migrateOldCachedSkills failed:', e)
  }
}

const KEYS = {
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
}

const README_TTL = 43200000 // 12 小时

interface SessionDownload {
  skillId: string
  skillName: string
  source: string
  downloadedAt: string
}

const _sessionDownloads: SessionDownload[] = []

// Cache state (module-level, survives between method calls)
let _distributeRecordsCache: DistributeRecord[] | null = null
let _distributedSkillSetCache: Set<string> | null = null
let _cachedSkillsCache: Skill[] | null = null

function invalidateDistributeCache() { _distributeRecordsCache = null; _distributedSkillSetCache = null }
function invalidateCachedSkills() { _cachedSkillsCache = null }

function initBuiltinProviders(): ModelConfig[] {
  return BUILTIN_PROVIDERS.map(p => ({
    id: `builtin-${p.id}`,
    name: p.name,
    provider: p.id,
    baseUrl: p.defaultBaseUrl,
    apiPath: p.defaultApiPath,
    apiKeys: [],
    model: '',
    isDefault: false,
    isBuiltin: true,
    enabled: false,
    models: [],
    icon: p.icon,
  }))
}

export const storage = {
  // === Session Downloads (temporary, cleared on app restart) ===
  getSessionDownloads(): SessionDownload[] {
    return _sessionDownloads
  },
  addSessionDownload(skillId: string, skillName: string, source: string): void {
    const download: SessionDownload = {
      skillId,
      skillName,
      source,
      downloadedAt: new Date().toISOString(),
    }
    _sessionDownloads.unshift(download)
  },

  // === Distribute Records (with Set cache) ===
  getDistributeRecords(): DistributeRecord[] {
    if (!_distributeRecordsCache) _distributeRecordsCache = dbGet<DistributeRecord[]>(KEYS.DISTRIBUTED_SKILLS) || []
    return _distributeRecordsCache
  },
  getDistributedSkillSet(): Set<string> {
    if (!_distributedSkillSetCache) _distributedSkillSetCache = new Set(this.getDistributeRecords().map(r => r.skillId))
    return _distributedSkillSetCache
  },
  saveDistributeRecord(record: DistributeRecord): void {
    const records = this.getDistributeRecords()
    const idx = records.findIndex(
      (r) => r.skillId === record.skillId && r.platformId === record.platformId && r.scope === record.scope
    )
    if (idx >= 0) records[idx] = record
    else records.push(record)
    invalidateDistributeCache()
    dbSet(KEYS.DISTRIBUTED_SKILLS, records)
  },
  removeDistributeRecord(skillId: string, platformId: string, scope?: string): void {
    const records = this.getDistributeRecords().filter(
      (r) => !(r.skillId === skillId && r.platformId === platformId && (scope === undefined || r.scope === scope))
    )
    invalidateDistributeCache()
    dbSet(KEYS.DISTRIBUTED_SKILLS, records)
  },
  removeAllForSkill(skillId: string): void {
    const records = this.getDistributeRecords().filter((r) => r.skillId !== skillId)
    invalidateDistributeCache()
    dbSet(KEYS.DISTRIBUTED_SKILLS, records)
  },
  getDistributedForPlatform(platformId: string): DistributeRecord[] {
    return this.getDistributeRecords().filter((r) => r.platformId === platformId)
  },
  getDistributedForSkill(skillId: string): DistributeRecord[] {
    return this.getDistributeRecords().filter((r) => r.skillId === skillId)
  },

  // === Store Sources ===
  getStoreSources(): StoreSource[] {
    const sources = dbGet<StoreSource[]>(KEYS.STORE_SOURCES) || []
    return sources
  },
  saveStoreSource(source: StoreSource): void {
    const sources = this.getStoreSources()
    const idx = sources.findIndex((s) => s.id === source.id)
    if (idx >= 0) sources[idx] = source
    else sources.push(source)
    dbSet(KEYS.STORE_SOURCES, sources)
  },
  removeStoreSource(id: string): void {
    const sources = this.getStoreSources().filter((s) => s.id !== id)
    dbSet(KEYS.STORE_SOURCES, sources)
    // 剥离引用该源的缓存技能的 storeSourceId，保留技能条目
    const cached = this.getCachedSkills()
    const updated = cached.map(s =>
      s.storeSourceId === id ? { ...s, storeSourceId: undefined } : s
    )
    if (updated.length !== cached.length || updated.some((s, i) => s.storeSourceId !== cached[i].storeSourceId)) {
      dbSet(KEYS.DOWNLOADED_SKILLS, updated)
      _cachedSkillsCache = updated
    }
    this.clearWebCache(id)
  },

  // === Platform Configs ===
  getPlatformConfigs(): PlatformInfo[] {
    return dbGet<PlatformInfo[]>(KEYS.PLATFORM_CONFIGS) || []
  },
  savePlatformConfigs(configs: PlatformInfo[]): void {
    dbSet(KEYS.PLATFORM_CONFIGS, configs)
  },

  // === Platform Order ===
  getPlatformOrder(): string[] {
    return dbGet<string[]>(KEYS.PLATFORM_ORDER) || []
  },
  savePlatformOrder(order: string[]): void {
    dbSet(KEYS.PLATFORM_ORDER, order)
  },

  // === Settings ===
  getSettings(): AppSettings {
    const defaults: AppSettings = {
      defaultInstallMode: 'copy',
      githubToken: '',
      theme: 'auto',
      themeMode: 'auto',
      themeColor: 'blue',
      fontSize: 'medium',
      motionPreference: 'standard',
      compactMode: false,
      aiModels: [],
      translationModelId: '',
      autoTranslate: false,
      translationTimeout: 300,
      resumeTranslation: true,
      showDataManagement: false,
      translationExtraBody: {},
    }
    let saved: Partial<AppSettings> | null = null
    try {
      saved = dbGet<Partial<AppSettings>>(KEYS.SETTINGS)
    } catch {
      console.warn('[storage] failed to read settings, using defaults')
    }
    // Clean up removed built-in providers from saved data
    if (saved?.aiModels) {
      const activeIds = new Set(BUILTIN_PROVIDERS.map(p => p.id))
      saved.aiModels = saved.aiModels.filter(m => !m.isBuiltin || activeIds.has(m.provider))
    }
    const merged = { ...defaults, ...(saved || {}) }
    // Initialize built-in providers if not present
    if (!Array.isArray(merged.aiModels) || merged.aiModels.length === 0) {
      merged.aiModels = initBuiltinProviders()
    } else {
      // Ensure built-in providers exist and have correct structure
      const existingIds = new Set(merged.aiModels.map(m => m.id))
      const builtinProviders = initBuiltinProviders()
      for (const bp of builtinProviders) {
        if (!existingIds.has(bp.id)) {
          merged.aiModels.push(bp)
        }
      }
    }
    return merged
  },
  saveSettings(settings: Partial<AppSettings>): void {
    const current = this.getSettings()
    const merged = { ...current, ...settings }
    dbSet(KEYS.SETTINGS, merged)
  },

  // === Downloaded Skills (已下载/已导入的技能) ===
  getCachedSkills(): Skill[] {
    if (!_cachedSkillsCache) {
      migrateOldCachedSkills()
      // 清理旧的描述翻译数据库（哈希算法已变，旧数据无法匹配）
      try { window.ztools.dbStorage.removeItem(PREFIX + KEYS.TRANSLATIONS + '_desc') } catch { /* ignore */ }
      _cachedSkillsCache = dbGet<Skill[]>(KEYS.DOWNLOADED_SKILLS) || []
    }
    return _cachedSkillsCache
  },
  saveCachedSkills(skills: Skill[], options?: { forceStoreSourceId?: boolean }): void {
    const existing = this.getCachedSkills()
    const map = new Map(existing.map((s) => [s.id, s]))
    for (const s of skills) {
      const copy = stripSkillFields(JSON.parse(JSON.stringify(s)) as Skill)
      copy.description = cleanDescription(copy.description)
      const existingSkill = map.get(copy.id)
      if (existingSkill) {
        if (!options?.forceStoreSourceId) {
          copy.storeSourceId = existingSkill.storeSourceId
        }
      }
      map.set(copy.id, copy)
    }
    invalidateCachedSkills()
    dbSet(KEYS.DOWNLOADED_SKILLS, Array.from(map.values()))
  },
  replaceCachedSkills(skills: Skill[]): void {
    invalidateCachedSkills()
    dbSet(KEYS.DOWNLOADED_SKILLS, skills.map(s => {
      const copy = stripSkillFields(JSON.parse(JSON.stringify(s)) as Skill)
      copy.description = cleanDescription(copy.description)
      return copy
    }))
  },

  // === GitHub Cache (扁平化描述池，所有 git 类源共用) ===
  // sm_github_cache -> Record<string, Skill>  (key = skill.id)
  getGitHubCache(): Record<string, Skill> {
    const raw = dbGet<Record<string, any>>(KEYS.GITHUB_CACHE)
    if (!raw) return {}
    // 检测旧结构 (Record<sourceId, { skills: Skill[] }>) 并迁移
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
    const pool = this.getGitHubCache()
    for (const s of skills) {
      if (s.description || s.shortDescription || s.readme) {
        pool[s.id] = s
      }
    }
    dbSet(KEYS.GITHUB_CACHE, pool)
  },
  removeGitHubSkill(id: string): void {
    const pool = this.getGitHubCache()
    delete pool[id]
    dbSet(KEYS.GITHUB_CACHE, pool)
  },
  clearGitHubCache(): void {
    dbSet(KEYS.GITHUB_CACHE, {})
  },

  // === Readme Cache (在 sm_github_cache 中用 readmeCachedAt 做 TTL 检查) ===
  getCachedReadme(skillId: string): string | null {
    const pool = this.getGitHubCache()
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

  // === Web Cache (统一缓存 marketplace + well-known 源) ===
  // sm_web_cache -> Record<string, { skills: Skill[]; fetchedAt: number }>
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
    const existing = all[sourceId].skills.find(s => s.id === skill.id)
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
      const skill = entry.skills.find(s => s.id === skillId)
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

  // === Favorites (stored as isFavorited on each Skill) ===
  getFavoriteIds(): string[] {
    return this.getCachedSkills().filter(s => s.isFavorited).map(s => s.id)
  },
  toggleFavorite(id: string, meta?: { name?: string; description?: string; author?: string; tags?: string[]; source?: SkillSource }): void {
    const skills = this.getCachedSkills()
    let idx = skills.findIndex(s => s.id === id)

    // 如果找不到当前ID，尝试通过name匹配已管理的技能（同步分发后的收藏状态）
    if (idx < 0 && meta?.name) {
      const normalizedName = meta.name.toLowerCase()
      idx = skills.findIndex(s => s.name && s.name.toLowerCase() === normalizedName)
    }

    if (idx < 0) {
      const entry: Skill = { id, name: meta?.name || id, description: meta?.description || '', author: meta?.author || '', tags: meta?.tags || [], source: meta?.source || 'local', isFavorited: true }
      skills.push(entry)
      invalidateCachedSkills()
      dbSet(KEYS.DOWNLOADED_SKILLS, skills)
      return
    }
    skills[idx] = { ...skills[idx], isFavorited: !skills[idx].isFavorited }
    invalidateCachedSkills()
    dbSet(KEYS.DOWNLOADED_SKILLS, skills)
  },
  migrateFavorites(): void {
    try {
      const raw = window.ztools.dbStorage.getItem(PREFIX + 'favorite_ids')
      if (!raw) return
      const oldIds: string[] = JSON.parse(raw)
      if (!oldIds.length) return
      const idSet = new Set(oldIds)
      const skills = this.getCachedSkills()
      let changed = false
      for (let i = 0; i < skills.length; i++) {
        if (idSet.has(skills[i].id) && !skills[i].isFavorited) {
          skills[i] = { ...skills[i], isFavorited: true }
          changed = true
        }
      }
      if (changed) {
        invalidateCachedSkills()
        dbSet(KEYS.DOWNLOADED_SKILLS, skills)
      }
      window.ztools.dbStorage.removeItem(PREFIX + 'favorite_ids')
      console.log(`[storage] migrated ${oldIds.length} favorite ids → isFavorited on skills`)
    } catch (e) {
      console.warn('[storage] migrateFavorites failed:', e)
    }
  },

  // === User Tags ===
  saveSkillUserTags(skillId: string, userTags: string[]): void {
    const skills = this.getCachedSkills()
    const idx = skills.findIndex((s) => s.id === skillId)
    if (idx >= 0) {
      skills[idx] = { ...stripSkillFields(skills[idx]), userTags }
      dbSet(KEYS.DOWNLOADED_SKILLS, skills)
    }
  },

  getSkillUserTags(skillId: string): string[] {
    const skills = this.getCachedSkills()
    const skill = skills.find((s) => s.id === skillId)
    return skill?.userTags || []
  },

  // === Downloaded Skills (all skills in this store are downloaded) ===
  getDownloadedIds(): string[] {
    return this.getCachedSkills().map(s => s.id)
  },
  getDownloadedSet(): Set<string> {
    return new Set(this.getDownloadedIds())
  },
  addDownloadedId(id: string): void {
    const skills = this.getCachedSkills()
    if (skills.some(s => s.id === id)) return
    skills.push({ id, name: id, description: '', author: '', tags: [], source: 'local' })
    invalidateCachedSkills()
    dbSet(KEYS.DOWNLOADED_SKILLS, skills)
  },
  removeDownloadedId(id: string): void {
    const skills = this.getCachedSkills()
    const filtered = skills.filter(s => s.id !== id)
    if (filtered.length === skills.length) return
    invalidateCachedSkills()
    dbSet(KEYS.DOWNLOADED_SKILLS, filtered)
  },
  isDownloaded(id: string): boolean {
    return this.getCachedSkills().some(s => s.id === id)
  },
  enrichDownloadedDescriptions(): boolean {
    let changed = false
    const userData = window.ztools.getPath('userData')
    const cached = this.getCachedSkills()
    for (const skill of cached) {
      try {
        const skillDir = window.services.pathJoin(userData, 'skills-repo', skill.id)
        const files = window.services.readDir(skillDir)
        const skillMd = files.find((f: any) => f.name === 'SKILL.md' || f.name === 'skill.md')
        if (skillMd) {
          const parsed = window.services.parseSkillFile(skillMd.path)
          if (parsed?.manifest?.description) {
            if (parsed.manifest.description !== skill.description) {
              skill.description = parsed.manifest.description
              changed = true
            }
            continue
          }
        }
      } catch { }
      const cleaned = cleanDescription(skill.description)
      if (cleaned !== skill.description) {
        skill.description = cleaned || ''
        changed = true
      }
    }
    if (changed) {
      this.replaceCachedSkills(cached)
    }
    return changed
  },
  cleanStaleCachedSkills(): void {
    const repoRoot = window.services.pathJoin(window.ztools.getPath('userData'), 'skills-repo')
    const cached = this.getCachedSkills()

    // 已下载的技能：目录必须存在，否则移除
    const alive = cached.filter(skill => {
      const dir = window.services.pathJoin(repoRoot, skill.id)
      return window.services.pathExists(dir)
    })
    if (alive.length !== cached.length) { dbSet(KEYS.DOWNLOADED_SKILLS, alive); invalidateCachedSkills() }

    const aliveIds = new Set(alive.map(s => s.id))
    const aliveDistributeRecords = this.getDistributeRecords().filter((r) => aliveIds.has(r.skillId))
    if (aliveDistributeRecords.length !== this.getDistributeRecords().length) dbSet(KEYS.DISTRIBUTED_SKILLS, aliveDistributeRecords)
  },

  updateChineseTags(): void {
    const skills = this.getCachedSkills()
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
    if (changed) { dbSet(KEYS.DOWNLOADED_SKILLS, skills); invalidateCachedSkills() }
  },

  // === Registered Projects ===
  getRegisteredProjects(): RegisteredProject[] {
    return dbGet<RegisteredProject[]>(KEYS.REGISTERED_PROJECTS) || []
  },
  saveRegisteredProjects(projects: RegisteredProject[]): void {
    dbSet(KEYS.REGISTERED_PROJECTS, projects)
  },
  updateRegisteredProject(id: string, patch: Partial<RegisteredProject>): void {
    const projects = this.getRegisteredProjects()
    const idx = projects.findIndex((p) => p.id === id)
    if (idx >= 0) {
      projects[idx] = { ...projects[idx], ...patch }
      this.saveRegisteredProjects(projects)
    }
  },

  // === Page State ===
  savePageState(pageId: string, state: Record<string, any>): void {
    const all = dbGet<Record<string, any>>('page_state') || {}
    all[pageId] = state
    dbSet('page_state', all)
  },
  getPageState(pageId: string): Record<string, any> | null {
    const all = dbGet<Record<string, any>>('page_state')
    return all?.[pageId] ?? null
  },
  getAllPageStates(): Record<string, any> {
    return dbGet<Record<string, any>>('page_state') || {}
  },

  // === Translation Cache (keyed by file hash) ===
  _readTranslationCache(): Record<string, { sourceContent?: string; translatedContent?: string; translatedDesc?: string; mode?: string; updatedAt: number; skillName?: string }> {
    let cache: Record<string, any> = {}
    try { cache = dbGet<Record<string, any>>(KEYS.TRANSLATIONS) || {} } catch {
      console.warn('[storage] failed to read translation cache')
    }
    return cache
  },
  _writeTranslationCache(cache: Record<string, any>): void {
    dbSet(KEYS.TRANSLATIONS, cache)
  },
  getTranslationByHash(hash: string): { sourceContent?: string; translatedContent?: string; translatedDesc?: string; mode?: string; updatedAt: number; skillName?: string } | null {
    const cache = this._readTranslationCache()
    return cache[hash] || null
  },
  saveTranslationByHash(hash: string, data: { sourceContent?: string; translatedContent?: string; translatedDesc?: string; mode?: string; skillName?: string }): void {
    const cache = this._readTranslationCache()
    const existing = cache[hash] || {}
    cache[hash] = { ...existing, ...data, updatedAt: Date.now() }
    this._writeTranslationCache(cache)
  },
  removeTranslationByHash(hash: string, type?: 'content' | 'desc'): void {
    const cache = this._readTranslationCache()
    const existing = cache[hash]
    if (!existing) return
    if (type === 'desc') {
      delete existing.translatedDesc
    } else if (type === 'content') {
      delete existing.sourceContent
      delete existing.translatedContent
      delete existing.mode
    } else {
      delete cache[hash]
      this._writeTranslationCache(cache)
      return
    }
    if (!existing.translatedDesc && !existing.translatedContent) {
      delete cache[hash]
    }
    this._writeTranslationCache(cache)
  },
  getTranslationCaches(): Record<string, { sourceContent?: string; translatedContent?: string; translatedDesc?: string; mode?: string; updatedAt: number; skillName?: string }> {
    return this._readTranslationCache()
  },
  // 描述翻译写入同一缓存（与内容翻译共用 hash key）
  saveDescTranslationByHash(hash: string, translatedDesc: string, skillName?: string): void {
    const cache = this._readTranslationCache()
    const existing = cache[hash] || {}
    cache[hash] = { ...existing, translatedDesc, updatedAt: Date.now(), skillName }
    this._writeTranslationCache(cache)
  },
  getDescTranslationByHash(hash: string): string | null {
    const cache = this._readTranslationCache()
    return cache[hash]?.translatedDesc || null
  },

  // === Remove Skill from All Caches ===
  removeSkillFromCache(skillId: string): void {
    const skills = this.getCachedSkills()
    const filtered = skills.filter((s) => s.id !== skillId)
    invalidateCachedSkills()
    dbSet(KEYS.DOWNLOADED_SKILLS, filtered)
  },

  // === Failure Records ===
  getFailureRecords(): FailureRecord[] {
    return dbGet<FailureRecord[]>(KEYS.FAILURE_RECORDS) || []
  },
  addFailureRecord(record: Omit<FailureRecord, 'id' | 'timestamp'>): FailureRecord {
    const records = this.getFailureRecords()
    const newRecord: FailureRecord = {
      ...record,
      id: `failure-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    }
    records.unshift(newRecord)
    // 只保留最近1000条失败记录
    if (records.length > 1000) {
      records.splice(1000)
    }
    dbSet(KEYS.FAILURE_RECORDS, records)
    return newRecord
  },
  removeFailureRecord(id: string): void {
    const records = this.getFailureRecords().filter((r) => r.id !== id)
    dbSet(KEYS.FAILURE_RECORDS, records)
  },
  clearFailureRecords(type?: FailureType): void {
    if (type) {
      const records = this.getFailureRecords().filter((r) => r.type !== type)
      dbSet(KEYS.FAILURE_RECORDS, records)
    } else {
      dbSet(KEYS.FAILURE_RECORDS, [])
    }
  },
}

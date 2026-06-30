import type { InstallRecord, StoreSource, AppSettings, PlatformInfo, Skill, RegisteredProject, ModelConfig, FailureRecord, FailureType } from '../types'
import { BUILTIN_PROVIDERS } from '../data/ai-providers'

const PREFIX = 'sm_'

export function cleanDescription(desc: string): string {
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

const KEYS = {
  INSTALLED_SKILLS: 'installed_skills',
  STORE_SOURCES: 'store_sources',
  PLATFORM_CONFIGS: 'platform_configs',
  PLATFORM_ORDER: 'platform_order',
  SETTINGS: 'settings',
  SCANNED_SKILLS: 'scanned_skills',
  CACHED_SKILLS: 'cached_skills',
  FAVORITE_IDS: 'favorite_ids',
  DOWNLOADED_IDS: 'downloaded_ids',
  REGISTERED_PROJECTS: 'registered_projects',
  TRANSLATIONS: 'translations',
  FAILURE_RECORDS: 'failure_records',
}

interface SessionDownload {
  skillId: string
  skillName: string
  source: string
  downloadedAt: string
}

const _sessionDownloads: SessionDownload[] = []
let _onSessionDownload: ((download: SessionDownload) => void) | null = null

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
    _onSessionDownload?.(download)
  },
  onSessionDownload(callback: (download: SessionDownload) => void): void {
    _onSessionDownload = callback
  },

  // === Install Records ===
  getInstallRecords(): InstallRecord[] {
    return dbGet<InstallRecord[]>(KEYS.INSTALLED_SKILLS) || []
  },
  saveInstallRecord(record: InstallRecord): void {
    const records = this.getInstallRecords()
    const idx = records.findIndex(
      (r) => r.skillId === record.skillId && r.platformId === record.platformId && r.scope === record.scope
    )
    if (idx >= 0) records[idx] = record
    else records.push(record)
    dbSet(KEYS.INSTALLED_SKILLS, records)
  },
  removeInstallRecord(skillId: string, platformId: string, scope?: string): void {
    const records = this.getInstallRecords().filter(
      (r) => !(r.skillId === skillId && r.platformId === platformId && (scope === undefined || r.scope === scope))
    )
    dbSet(KEYS.INSTALLED_SKILLS, records)
  },
  removeAllForSkill(skillId: string): void {
    const records = this.getInstallRecords().filter((r) => r.skillId !== skillId)
    dbSet(KEYS.INSTALLED_SKILLS, records)
  },
  getInstalledForPlatform(platformId: string): InstallRecord[] {
    return this.getInstallRecords().filter((r) => r.platformId === platformId)
  },
  getInstalledForSkill(skillId: string): InstallRecord[] {
    return this.getInstallRecords().filter((r) => r.skillId === skillId)
  },
  isSkillInstalled(skillId: string, platformId: string): boolean {
    return this.getInstallRecords().some(
      (r) => r.skillId === skillId && r.platformId === platformId
    )
  },

  // === Store Sources ===
  getStoreSources(): StoreSource[] {
    return dbGet<StoreSource[]>(KEYS.STORE_SOURCES) || []
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
  },

  // === Platform Configs ===
  getPlatformConfigs(): PlatformInfo[] {
    return dbGet<PlatformInfo[]>(KEYS.PLATFORM_CONFIGS) || []
  },
  savePlatformConfig(config: PlatformInfo): void {
    const configs = this.getPlatformConfigs()
    const idx = configs.findIndex((c) => c.id === config.id)
    if (idx >= 0) configs[idx] = config
    else configs.push(config)
    dbSet(KEYS.PLATFORM_CONFIGS, configs)
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
  initBuiltinProviders(): ModelConfig[] {
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
  },

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
      backgroundImage: '',
      backgroundImageEnabled: false,
      backgroundOpacity: 40,
      backgroundBlur: 14,
      aiModels: [],
      translationModelId: '',
      autoTranslate: false,
      translationTimeout: 60,
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
    if (merged.backgroundImage && saved && (saved as any).backgroundImageEnabled === undefined) {
      merged.backgroundImageEnabled = true
    }
    // Initialize built-in providers if not present
    if (!Array.isArray(merged.aiModels) || merged.aiModels.length === 0) {
      merged.aiModels = this.initBuiltinProviders()
    } else {
      // Ensure built-in providers exist and have correct structure
      const existingIds = new Set(merged.aiModels.map(m => m.id))
      const builtinProviders = this.initBuiltinProviders()
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

  // === Scanned Skills Cache ===
  getScannedSkills(): string[] {
    return dbGet<string[]>(KEYS.SCANNED_SKILLS) || []
  },
  setScannedSkills(paths: string[]): void {
    dbSet(KEYS.SCANNED_SKILLS, paths)
  },

  // === Cached Skills ===
  getCachedSkills(): Skill[] {
    return dbGet<Skill[]>(KEYS.CACHED_SKILLS) || []
  },
  saveCachedSkills(skills: Skill[]): void {
    const existing = this.getCachedSkills()
    const map = new Map(existing.map((s) => [s.id, s]))
    for (const s of skills) {
      const copy = JSON.parse(JSON.stringify(s)) as Skill
      copy.description = cleanDescription(copy.description)
      map.set(copy.id, copy)
    }
    dbSet(KEYS.CACHED_SKILLS, Array.from(map.values()))
  },

  // === Favorites ===
  getFavoriteIds(): string[] {
    return dbGet<string[]>(KEYS.FAVORITE_IDS) || []
  },
  toggleFavorite(id: string): void {
    const ids = this.getFavoriteIds()
    const idx = ids.indexOf(id)
    if (idx >= 0) ids.splice(idx, 1)
    else ids.push(id)
    dbSet(KEYS.FAVORITE_IDS, ids)
  },
  isFavorite(id: string): boolean {
    return this.getFavoriteIds().includes(id)
  },

  // === User Tags ===
  saveSkillUserTags(skillId: string, userTags: string[]): void {
    const skills = this.getCachedSkills()
    const skill = skills.find((s) => s.id === skillId)
    if (skill) {
      skill.userTags = userTags
      dbSet(KEYS.CACHED_SKILLS, skills)
    }
  },

  getSkillUserTags(skillId: string): string[] {
    const skills = this.getCachedSkills()
    const skill = skills.find((s) => s.id === skillId)
    return skill?.userTags || []
  },

  getAllUserTags(): string[] {
    const skills = this.getCachedSkills()
    const tagSet = new Set<string>()
    for (const s of skills) {
      if (s.userTags) s.userTags.forEach((t) => tagSet.add(t))
    }
    return Array.from(tagSet).sort()
  },

  // === Downloaded Skills ===
  getDownloadedIds(): string[] {
    return dbGet<string[]>(KEYS.DOWNLOADED_IDS) || []
  },
  addDownloadedId(id: string): void {
    const ids = this.getDownloadedIds()
    if (!ids.includes(id)) {
      ids.push(id)
      dbSet(KEYS.DOWNLOADED_IDS, ids)
    }
  },
  removeDownloadedId(id: string): void {
    const ids = this.getDownloadedIds().filter((i) => i !== id)
    dbSet(KEYS.DOWNLOADED_IDS, ids)
  },
  isDownloaded(id: string): boolean {
    return this.getDownloadedIds().includes(id)
  },
  cleanStaleCachedSkills(): void {
    const repoRoot = window.services.pathJoin(window.ztools.getPath('userData'), 'skills-repo')
    const cached = this.getCachedSkills()
    const ids = this.getDownloadedIds()
    const aliveCached = cached.filter((s) => {
      const dir = window.services.pathJoin(repoRoot, s.id)
      return window.services.pathExists(dir)
    })
    const aliveIds = aliveCached.map((s) => s.id)
    const aliveIdSet = new Set(aliveIds)
    const aliveInstallRecords = this.getInstallRecords().filter((r) => aliveIdSet.has(r.skillId))
    if (aliveCached.length !== cached.length) dbSet(KEYS.CACHED_SKILLS, aliveCached)
    if (aliveIds.length !== ids.length) dbSet(KEYS.DOWNLOADED_IDS, aliveIds)
    if (aliveInstallRecords.length !== this.getInstallRecords().length) dbSet(KEYS.INSTALLED_SKILLS, aliveInstallRecords)
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
    if (changed) dbSet(KEYS.CACHED_SKILLS, skills)
  },

  // === Registered Projects ===
  getRegisteredProjects(): RegisteredProject[] {
    return dbGet<RegisteredProject[]>(KEYS.REGISTERED_PROJECTS) || []
  },
  saveRegisteredProjects(projects: RegisteredProject[]): void {
    dbSet(KEYS.REGISTERED_PROJECTS, projects)
  },
  addRegisteredProject(project: RegisteredProject): void {
    const projects = this.getRegisteredProjects()
    projects.push(project)
    this.saveRegisteredProjects(projects)
  },
  removeRegisteredProject(id: string): void {
    const projects = this.getRegisteredProjects().filter((p) => p.id !== id)
    this.saveRegisteredProjects(projects)
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

  // === Translation Cache (keyed by contentHash / descHash) ===
  _readTranslationCache(): Record<string, { sourceContent: string; translatedContent: string; mode: string; updatedAt: number }> {
    let cache: Record<string, any> = {}
    try { cache = dbGet<Record<string, any>>(KEYS.TRANSLATIONS) || {} } catch {
      console.warn('[storage] failed to read translation cache')
    }
    return cache
  },
  _writeTranslationCache(cache: Record<string, any>): void {
    dbSet(KEYS.TRANSLATIONS, cache)
  },
  getTranslationByHash(hash: string): { sourceContent: string; translatedContent: string; mode: string; updatedAt: number; skillName?: string } | null {
    const cache = this._readTranslationCache()
    return cache[hash] || null
  },
  saveTranslationByHash(hash: string, data: { sourceContent: string; translatedContent: string; mode: string; skillName?: string }): void {
    const cache = this._readTranslationCache()
    cache[hash] = { ...data, updatedAt: Date.now() }
    this._writeTranslationCache(cache)
  },
  removeTranslationByHash(hash: string): void {
    const cache = this._readTranslationCache()
    delete cache[hash]
    this._writeTranslationCache(cache)
  },
  clearTranslations(): void {
    this._writeTranslationCache({})
  },

  // === Description Translation Cache (keyed by descHash) ===
  _readDescTranslationCache(): Record<string, { translatedDesc: string; updatedAt: number; skillName?: string }> {
    let cache: Record<string, any> = {}
    try { cache = dbGet<Record<string, any>>(KEYS.TRANSLATIONS + '_desc') || {} } catch { /* ignore */ }
    return cache
  },
  _writeDescTranslationCache(cache: Record<string, any>): void {
    dbSet(KEYS.TRANSLATIONS + '_desc', cache)
  },
  getDescTranslationByHash(hash: string): string | null {
    const cache = this._readDescTranslationCache()
    return cache[hash]?.translatedDesc || null
  },
  saveDescTranslationByHash(hash: string, translatedDesc: string, skillName?: string): void {
    const cache = this._readDescTranslationCache()
    cache[hash] = { translatedDesc, updatedAt: Date.now(), skillName }
    this._writeDescTranslationCache(cache)
  },
  removeDescTranslationByHash(hash: string): void {
    const cache = this._readDescTranslationCache()
    delete cache[hash]
    this._writeDescTranslationCache(cache)
  },

  // === Tags Translation Cache (keyed by contentHash) ===
  _readTagsTranslationCache(): Record<string, { translatedTags: string[]; updatedAt: number }> {
    let cache: Record<string, any> = {}
    try { cache = dbGet<Record<string, any>>(KEYS.TRANSLATIONS + '_tags') || {} } catch { /* ignore */ }
    return cache
  },
  _writeTagsTranslationCache(cache: Record<string, any>): void {
    dbSet(KEYS.TRANSLATIONS + '_tags', cache)
  },
  getTranslationTagsByHash(hash: string): string[] | null {
    const cache = this._readTagsTranslationCache()
    return cache[hash]?.translatedTags || null
  },
  saveTranslationTagsByHash(hash: string, translatedTags: string[]): void {
    const cache = this._readTagsTranslationCache()
    cache[hash] = { translatedTags, updatedAt: Date.now() }
    this._writeTagsTranslationCache(cache)
  },
  removeTranslationTagsByHash(hash: string): void {
    const cache = this._readTagsTranslationCache()
    delete cache[hash]
    this._writeTagsTranslationCache(cache)
  },

  // === Remove Skill from All Caches ===
  removeSkillFromCache(skillId: string): void {
    const skills = this.getCachedSkills()
    const filtered = skills.filter((s) => s.id !== skillId)
    dbSet(KEYS.CACHED_SKILLS, filtered)

    const favorites = this.getFavoriteIds()
    const favFiltered = favorites.filter((id) => id !== skillId)
    dbSet(KEYS.FAVORITE_IDS, favFiltered)
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

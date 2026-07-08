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
  WELLKNOWN_CACHE: 'wellknown_cache',
  WELLKNOWN_CACHE_VERSION: 'wellknown_cache_version',
  MARKETPLACE_CACHE: 'marketplace_cache',
}

const WELLKNOWN_CACHE_VERSION = 1

export const MARKETPLACE_TTL = 86400000 // 24 小时
export const WELL_KNOWN_TTL = 86400000 // 24 小时

interface SessionDownload {
  skillId: string
  skillName: string
  source: string
  downloadedAt: string
}

const _sessionDownloads: SessionDownload[] = []
let _onSessionDownload: ((download: SessionDownload) => void) | null = null

// Cache state (module-level, survives between method calls)
let _installRecordsCache: InstallRecord[] | null = null
let _installedSkillSetCache: Set<string> | null = null
let _cachedSkillsCache: Skill[] | null = null
let _downloadedIdsCache: string[] | null = null
let _downloadedSetCache: Set<string> | null = null
let _favoriteSetCache: Set<string> | null = null

function invalidateInstallCache() { _installRecordsCache = null; _installedSkillSetCache = null }
function invalidateCachedSkills() { _cachedSkillsCache = null }
function invalidateDownloadedCache() { _downloadedIdsCache = null; _downloadedSetCache = null }
function invalidateFavoriteCache() { _favoriteSetCache = null }

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

  // === Install Records (with Set cache) ===
  getInstallRecords(): InstallRecord[] {
    if (!_installRecordsCache) _installRecordsCache = dbGet<InstallRecord[]>(KEYS.INSTALLED_SKILLS) || []
    return _installRecordsCache
  },
  getInstalledSkillSet(): Set<string> {
    if (!_installedSkillSetCache) _installedSkillSetCache = new Set(this.getInstallRecords().map(r => r.skillId))
    return _installedSkillSetCache
  },
  saveInstallRecord(record: InstallRecord): void {
    const records = this.getInstallRecords()
    const idx = records.findIndex(
      (r) => r.skillId === record.skillId && r.platformId === record.platformId && r.scope === record.scope
    )
    if (idx >= 0) records[idx] = record
    else records.push(record)
    invalidateInstallCache()
    dbSet(KEYS.INSTALLED_SKILLS, records)
  },
  removeInstallRecord(skillId: string, platformId: string, scope?: string): void {
    const records = this.getInstallRecords().filter(
      (r) => !(r.skillId === skillId && r.platformId === platformId && (scope === undefined || r.scope === scope))
    )
    invalidateInstallCache()
    dbSet(KEYS.INSTALLED_SKILLS, records)
  },
  removeAllForSkill(skillId: string): void {
    const records = this.getInstallRecords().filter((r) => r.skillId !== skillId)
    invalidateInstallCache()
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
      dbSet(KEYS.CACHED_SKILLS, updated)
      _cachedSkillsCache = updated
    }
    // 清理 Well-Known 索引缓存
    const wkAll = dbGet<Record<string, any>>(KEYS.WELLKNOWN_CACHE)
    if (wkAll?.[id]) {
      delete wkAll[id]
      dbSet(KEYS.WELLKNOWN_CACHE, wkAll)
    }
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
      aiModels: [],
      translationModelId: '',
      autoTranslate: false,
      translationTimeout: 300,
      resumeTranslation: true,
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

  // === Cached Skills (with cache) ===
  getCachedSkills(): Skill[] {
    if (!_cachedSkillsCache) {
      _cachedSkillsCache = dbGet<Skill[]>(KEYS.CACHED_SKILLS) || []
    }
    return _cachedSkillsCache
  },
  saveCachedSkills(skills: Skill[], options?: { forceStoreSourceId?: boolean }): void {
    const existing = this.getCachedSkills()
    const map = new Map(existing.map((s) => [s.id, s]))
    for (const s of skills) {
      const copy = JSON.parse(JSON.stringify(s)) as Skill
      copy.description = cleanDescription(copy.description)
      if (!options?.forceStoreSourceId) {
        const existingSkill = map.get(copy.id)
        if (existingSkill && this.isDownloaded(copy.id)) {
          copy.storeSourceId = existingSkill.storeSourceId
        }
      }
      map.set(copy.id, copy)
    }
    invalidateCachedSkills()
    dbSet(KEYS.CACHED_SKILLS, Array.from(map.values()))
  },
  replaceCachedSkills(skills: Skill[]): void {
    invalidateCachedSkills()
    dbSet(KEYS.CACHED_SKILLS, skills.map(s => {
      const copy = JSON.parse(JSON.stringify(s)) as Skill
      copy.description = cleanDescription(copy.description)
      return copy
    }))
  },

  // === Marketplace Cache (stale-while-revalidate, independent from cached_skills) ===
  getMarketplaceCache(id: string): { skills: Skill[]; fetchedAt: number } | null {
    const all = dbGet<Record<string, { skills: Skill[]; fetchedAt: number }>>(KEYS.MARKETPLACE_CACHE)
    return all?.[id] || null
  },
  saveMarketplaceSkills(id: string, skills: Skill[]): void {
    const all = dbGet<Record<string, { skills: Skill[]; fetchedAt: number }>>(KEYS.MARKETPLACE_CACHE) || {}
    all[id] = { skills, fetchedAt: Date.now() }
    dbSet(KEYS.MARKETPLACE_CACHE, all)
  },

  // === Well-Known Index Cache (stale-while-revalidate) ===
  getWellKnownCache(id: string): { skills: Skill[]; fetchedAt: number } | null {
    const cachedVersion = dbGet<number>(KEYS.WELLKNOWN_CACHE_VERSION)
    if (cachedVersion !== WELLKNOWN_CACHE_VERSION) {
      dbSet(KEYS.WELLKNOWN_CACHE, {})
      dbSet(KEYS.WELLKNOWN_CACHE_VERSION, WELLKNOWN_CACHE_VERSION)
      return null
    }
    const all = dbGet<Record<string, { skills: Skill[]; fetchedAt: number }>>(KEYS.WELLKNOWN_CACHE)
    const cached = all?.[id]
    if (!cached) return null
    if (Date.now() - cached.fetchedAt >= WELL_KNOWN_TTL) {
      delete all[id]
      dbSet(KEYS.WELLKNOWN_CACHE, all)
      return null
    }
    return cached
  },
  saveWellKnownSkills(id: string, skills: Skill[]): void {
    const all = dbGet<Record<string, { skills: Skill[]; fetchedAt: number }>>(KEYS.WELLKNOWN_CACHE) || {}
    all[id] = { skills, fetchedAt: Date.now() }
    dbSet(KEYS.WELLKNOWN_CACHE, all)
    dbSet(KEYS.WELLKNOWN_CACHE_VERSION, WELLKNOWN_CACHE_VERSION)
  },

  // === Favorites (with Set cache for O(1) lookup) ===
  getFavoriteIds(): string[] {
    return dbGet<string[]>(KEYS.FAVORITE_IDS) || []
  },
  getFavoriteSet(): Set<string> {
    if (!_favoriteSetCache) _favoriteSetCache = new Set(this.getFavoriteIds())
    return _favoriteSetCache
  },
  toggleFavorite(id: string): void {
    const ids = this.getFavoriteIds()
    const idx = ids.indexOf(id)
    if (idx >= 0) ids.splice(idx, 1)
    else ids.push(id)
    invalidateFavoriteCache()
    dbSet(KEYS.FAVORITE_IDS, ids)
  },
  isFavorite(id: string): boolean {
    return this.getFavoriteSet().has(id)
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

  // === Downloaded Skills (with Set cache for O(1) lookup) ===
  getDownloadedIds(): string[] {
    if (!_downloadedIdsCache) _downloadedIdsCache = dbGet<string[]>(KEYS.DOWNLOADED_IDS) || []
    return _downloadedIdsCache
  },
  getDownloadedSet(): Set<string> {
    if (!_downloadedSetCache) _downloadedSetCache = new Set(this.getDownloadedIds())
    return _downloadedSetCache
  },
  addDownloadedId(id: string): void {
    const ids = this.getDownloadedIds()
    if (!ids.includes(id)) {
      const next = [...ids, id]
      _downloadedIdsCache = next
      if (_downloadedSetCache) _downloadedSetCache.add(id)
      dbSet(KEYS.DOWNLOADED_IDS, next)
    }
  },
  removeDownloadedId(id: string): void {
    const ids = this.getDownloadedIds().filter((i) => i !== id)
    invalidateDownloadedCache()
    dbSet(KEYS.DOWNLOADED_IDS, ids)
  },
  isDownloaded(id: string): boolean {
    return this.getDownloadedSet().has(id)
  },
  cleanStaleCachedSkills(): void {
    const repoRoot = window.services.pathJoin(window.ztools.getPath('userData'), 'skills-repo')
    const cached = this.getCachedSkills()
    const ids = this.getDownloadedIds()
    const downloadedSet = new Set(ids)

    // 已下载的技能：目录必须存在，否则清理
    const aliveDownloaded = ids.filter((id) => {
      const dir = window.services.pathJoin(repoRoot, id)
      return window.services.pathExists(dir)
    })
    const aliveDownloadedSet = new Set(aliveDownloaded)

    // 缓存技能：已下载的保留目录存在的，未下载的全部保留（用于商店浏览）
    const aliveCached = cached.filter((s) => {
      if (downloadedSet.has(s.id)) return aliveDownloadedSet.has(s.id)
      return true
    })

    const aliveInstallRecords = this.getInstallRecords().filter((r) => aliveDownloadedSet.has(r.skillId))

    if (aliveCached.length !== cached.length) { dbSet(KEYS.CACHED_SKILLS, aliveCached); invalidateCachedSkills() }
    if (aliveDownloaded.length !== ids.length) { dbSet(KEYS.DOWNLOADED_IDS, aliveDownloaded); invalidateDownloadedCache() }
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
    if (changed) { dbSet(KEYS.CACHED_SKILLS, skills); invalidateCachedSkills() }
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

  // === Translation Cache (keyed by file hash) ===
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
  getTranslationCaches(): Record<string, { sourceContent: string; translatedContent: string; mode: string; updatedAt: number; skillName?: string }> {
    return this._readTranslationCache()
  },
  getDescTranslationCaches(): Record<string, { translatedDesc: string; updatedAt: number; skillName?: string }> {
    return this._readDescTranslationCache()
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

  // === Tags Translation Cache (keyed by file hash) ===
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
    invalidateCachedSkills()
    dbSet(KEYS.CACHED_SKILLS, filtered)

    const favorites = this.getFavoriteIds()
    const favFiltered = favorites.filter((id) => id !== skillId)
    invalidateFavoriteCache()
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

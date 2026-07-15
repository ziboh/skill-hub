import { ref, computed, watch } from 'vue'
import type { Skill, StoreSource } from '../types'
import { storage } from '../utils/storage'
import { fetchGitHubRepoTree, detectSkillDirectories, setGitHubResponseCacheEnabled } from '../utils/github'
import { fetchGiteeRepoTree } from '../utils/gitee'
import { getRepositoryUrl, parseRepositoryUrl } from '../utils/repository'
import { parseFrontmatter } from '../utils/frontmatter'
import * as skillsSh from '../utils/skills-sh'
import { fetchWellKnownIndex } from '../utils/well-known'
import { SKILL_CATEGORIES, ALL_CATEGORIES, inferCategory } from '../data/skill-categories'
import { lookupBuiltinIcon, lookupBuiltinCategory } from '../data/skill-icons'
import { STORE_ICONS, getStoreIconFromSource } from '../data/store-icons'
import { useDownloadQueue } from './useDownloadQueue'
import { useTranslationQueue } from './useTranslationQueue'
import { isChineseContent } from '../utils/translate'
import { normalizeSkillNameKey, skillsShareIdentity } from '../utils/skill-identity'
import {
  completeStoreSkill,
  makeStoreSkillId,
  readStoreSkillDescription,
  readStoreSkillTags,
  slugifySkillName,
} from '../utils/store-skill-normalize'

export const PAGE_SIZE = 60

export interface PresetSource {
  id: string
  name: string
  url: string
  desc: string
  icon: string
  directory?: string
}

export const STORE_PRESETS: PresetSource[] = [
  { id: 'claude', name: 'Claude Code', url: 'github.com/anthropics/skills', desc: 'Anthropic 官方技能', icon: STORE_ICONS.claude },
  {
    id: 'codex',
    name: 'OpenAI Codex',
    url: 'github.com/openai/skills',
    desc: 'OpenAI Codex 官方技能',
    icon: STORE_ICONS.codex,
    directory: 'skills/.curated',
  },
  { id: 'skills-sh', name: 'skills.sh', url: '', desc: '社区技能市场', icon: STORE_ICONS['skills-sh'] },
]

/** Grow visible window by PAGE_SIZE, capped at maxCount. */
export function growVisible(current: number, maxCount: number, pageSize = PAGE_SIZE): number {
  if (current >= maxCount) return current
  return Math.min(current + pageSize, maxCount)
}

/** Local substring search over name / description / author / tags. Empty query returns all. */
export function filterLocalSearch(skills: Skill[], query: string): Skill[] {
  const q = query.trim().toLowerCase()
  if (!q) return skills
  return skills.filter((s) => {
    const nameMatch = s.name.toLowerCase().includes(q)
    const descMatch = (s.description || '').toLowerCase().includes(q)
    const authorMatch = (s.author || '').toLowerCase().includes(q)
    const tagMatch = s.tags?.some((t) => t.toLowerCase().includes(q))
    return nameMatch || descMatch || authorMatch || tagMatch
  })
}

export function buildCategoryCounts(skills: Skill[]): Record<string, number> {
  const counts: Record<string, number> = { all: skills.length }
  for (const s of skills) {
    const cat = s.category || 'other'
    counts[cat] = (counts[cat] || 0) + 1
  }
  return counts
}

export function parseMarketplaceEntries(entries: any[], source: StoreSource, presetId: string): Skill[] {
  return entries.map((entry: any) => {
    const name = entry.name || entry.title || '未知'
    const description = readStoreSkillDescription(entry)
    const author = entry.author || ''
    const tags = readStoreSkillTags(entry.tags || entry.manifest?.tags || entry.frontmatter?.tags)
    const dirName = slugifySkillName(name)
    const repo = entry.repo || entry.repository || ''
    let skillPath = dirName
    if (entry.homepage && repo) {
      const repoUrl = `https://github.com/${repo}/tree/`
      if (entry.homepage.startsWith(repoUrl)) {
        const afterBranch = entry.homepage.slice(repoUrl.length).split('/').slice(1).join('/')
        if (afterBranch) skillPath = afterBranch
      }
    }
    const skillId = makeStoreSkillId(source.id, 'marketplace-json', repo, name)
    return completeStoreSkill(
      {
        id: skillId,
        name,
        description,
        author,
        tags,
        source: 'marketplace-json',
        repo: repo || undefined,
        path: skillPath,
        storeSourceId: presetId,
        sourceUrl: entry.url || entry.sourceUrl || entry.homepage || entry.downloadUrl || source.url,
        iconUrl: entry.icon || entry.iconUrl,
      },
      entry,
    )
  })
}

export function findDownloadedSkillMatch(skill: Skill, downloadedIds: string[], cachedDownloaded: Skill[]): Skill | undefined {
  const ids = new Set(downloadedIds)
  return cachedDownloaded.find((cached) => ids.has(cached.id) && skillsShareIdentity(skill, cached))
}

export function splitImportedAndAvailable(opts: {
  sourceSkills: Skill[]
  allEntries: Skill[]
  downloadedIds: string[]
  cachedDownloaded: Skill[]
  activePresetId: string
  filterTab: string
}): { imported: Skill[]; available: Skill[] } {
  const { sourceSkills, allEntries, downloadedIds, cachedDownloaded, activePresetId, filterTab } = opts
  const ids = new Set(downloadedIds)
  const cachedMap = new Map(cachedDownloaded.map((s) => [s.id, s]))
  const findCached = (skill: Skill) => findDownloadedSkillMatch(skill, downloadedIds, cachedDownloaded)

  const idMap = new Map<string, Skill>()
  if (allEntries.length) {
    for (const s of allEntries) {
      const cs = ids.has(s.id) ? cachedMap.get(s.id) : findCached(s)
      if (!cs || cs.storeSourceId !== activePresetId) continue
      const merged = cs && !s.description && cs.description ? { ...s, description: cs.description } : s
      idMap.set(s.id, merged)
      idMap.set(cs.id, merged)
    }
  }
  for (const s of cachedDownloaded) {
    if (!ids.has(s.id)) continue
    if (s.storeSourceId !== activePresetId) continue
    if (!idMap.has(s.id)) idMap.set(s.id, s)
  }
  let imported = downloadedIds.filter((id) => idMap.has(id)).map((id) => idMap.get(id)!)
  if (filterTab !== 'all') imported = imported.filter((s) => s.category === filterTab)

  let available = sourceSkills.filter((s) => {
    const cs = ids.has(s.id) ? cachedMap.get(s.id) : findCached(s)
    return !cs || cs.storeSourceId !== activePresetId
  })
  if (filterTab !== 'all') available = available.filter((s) => s.category === filterTab)

  return { imported, available }
}

import type { ShowToast } from '../inject-keys'

export type { ShowToast }

export function useStoreSkills(opts: {
  storeId: () => string
  showToast?: ShowToast
  onNavigate?: (route: string, params?: { sub: string }) => void
}) {
  const showToast = opts.showToast || (() => {})
  const { isDownloading: isQueuedDownloading, queue: downloadQueue } = useDownloadQueue()
  const { cacheVersion: translationCacheVersion } = useTranslationQueue()

  const presets = STORE_PRESETS
  const _storeVersion = ref(0)

  const storeSources = computed(() => {
    void _storeVersion.value
    const builtin = [
      { id: 'claude', label: 'Claude Code', icon: STORE_ICONS.claude },
      { id: 'codex', label: 'Codex', icon: STORE_ICONS.codex },
      { id: 'skills-sh', label: 'skills.sh', icon: STORE_ICONS['skills-sh'] },
    ]
    const custom = storage
      .getStoreSources()
      .filter((s) => s.enabled)
      .map((s) => ({
        id: s.id,
        label: s.name,
        icon: getStoreIconFromSource(s),
        deletable: true,
      }))
    return [...builtin, ...custom]
  })

  const savedState = storage.getPageState('skill-store')
  const activePresetId = ref(savedState?.presetId || opts.storeId())
  const currentSource = computed(() => storeSources.value.find((s) => s.id === activePresetId.value))

  const searchQuery = ref('')
  const debouncedSearchQuery = ref('')
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null
  watch(searchQuery, (val) => {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
    searchDebounceTimer = setTimeout(() => {
      debouncedSearchQuery.value = val
    }, 300)
  })

  const filterTab = ref('all')
  const leaderboardFilter = ref('all')
  const searchActive = ref(false)
  const searchResults = ref<Skill[]>([])
  const allEntries = ref<Skill[]>([])
  const sourceSkills = ref<Skill[]>([])
  const totalCount = ref(0)
  const loading = ref(false)
  const error = ref('')
  const downloadedIds = ref<string[]>([])
  const storeScrollRef = ref<HTMLElement | null>(null)
  const skillsCache = ref<Record<string, Skill[]>>({})
  const totalCountCache = ref<Record<string, number>>({})
  const visibleCount = ref(PAGE_SIZE)

  // GitHub lazy-desc support (state only; observers stay in view)
  const githubManifestMap = new Map<string, string>()
  const githubRepoInfo = ref<{ provider: 'github' | 'gitee'; owner: string; repo: string; branch: string; presetId: string } | null>(null)
  const fetchedDescIds = ref<Set<string>>(new Set())
  const loadingDescIds = ref<Set<string>>(new Set())
  const failedDescIds = ref<Set<string>>(new Set())

  function resetDescriptionStates() {
    fetchedDescIds.value = new Set()
    loadingDescIds.value = new Set()
    failedDescIds.value = new Set()
  }

  function isStoreCacheEnabled() {
    return storage.getSettings().storeCacheEnabled !== false
  }

  const loadingDots = ref('.')
  let loadingDotsTimer: ReturnType<typeof setInterval> | null = null
  function startLoadingDots() {
    stopLoadingDots()
    const frames = ['.', '..', '...', '..', '.']
    let i = 0
    loadingDots.value = frames[0]
    loadingDotsTimer = setInterval(() => {
      i = (i + 1) % frames.length
      loadingDots.value = frames[i]
    }, 500)
  }
  function stopLoadingDots() {
    if (loadingDotsTimer) {
      clearInterval(loadingDotsTimer)
      loadingDotsTimer = null
    }
  }

  function getListMaxCount() {
    if (searchActive.value) return searchResults.value.length
    if (isLocalSearchActive.value) return localSearchResults.value.length
    return importedSkills.value.length + availableSkillsAll.value.length
  }

  function resetVisibleCount() {
    visibleCount.value = PAGE_SIZE
  }

  function growVisibleCount() {
    const maxCount = getListMaxCount()
    const next = growVisible(visibleCount.value, maxCount)
    if (next === visibleCount.value) return false
    visibleCount.value = next
    return true
  }

  function onStoreScroll(e: Event) {
    const el = e.currentTarget as HTMLElement
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 600) growVisibleCount()
  }

  function fillViewport() {
    const el = storeScrollRef.value
    if (!el) return
    let guard = 0
    while (el.scrollHeight <= el.clientHeight + 600 && growVisibleCount() && guard++ < 20) {
      /* fill viewport */
    }
  }

  function getActivePreset() {
    return presets.find((p) => p.id === activePresetId.value) || storage.getStoreSources().find((s) => s.id === activePresetId.value)
  }

  function resetGitHubDescriptionContext() {
    githubManifestMap.clear()
    githubRepoInfo.value = null
  }

  function restoreGitHubDescriptionContext(id: string, skills: Skill[]) {
    const source = presets.find((p) => p.id === id) || storage.getStoreSources().find((s) => s.id === id)
    if (!source?.url) {
      resetGitHubDescriptionContext()
      return
    }
    const info = parseRepositoryUrl(source.url)
    if (!info) {
      resetGitHubDescriptionContext()
      return
    }
    const branch = 'branch' in source && source.branch ? source.branch : info.defaultBranch
    githubManifestMap.clear()
    for (const skill of skills) {
      const manifestFile = skill.manifestFile || (skill.path === '.' ? 'SKILL.md' : skill.path ? `${skill.path}/SKILL.md` : '')
      if (manifestFile) githubManifestMap.set(skill.id, manifestFile)
    }
    githubRepoInfo.value = { provider: info.provider, owner: info.owner, repo: info.repo, branch, presetId: id }
  }

  function fetchCurrentSkills(force = false) {
    const id = activePresetId.value
    resetVisibleCount()
    resetDescriptionStates()
    if (storeScrollRef.value) storeScrollRef.value.scrollTop = 0
    if (!force && isStoreCacheEnabled() && skillsCache.value[id]) {
      allEntries.value = skillsCache.value[id]
      totalCount.value = totalCountCache.value[id] ?? allEntries.value.length
      sourceSkills.value = allEntries.value
      restoreGitHubDescriptionContext(id, allEntries.value)
      loading.value = false
      stopLoadingDots()
      error.value = ''
      return
    }
    const custom = storage.getStoreSources().find((s) => s.id === id)
    const preset = presets.find((p) => p.id === id)
    if (preset) {
      allEntries.value = []
      totalCount.value = 0
      resetGitHubDescriptionContext()
      startLoadingDots()
      if (id === 'skills-sh') fetchSkillsSh()
      else if (preset.url) fetchGitHubSkills(preset.url, preset.directory, undefined, force)
      return
    }
    if (!custom) {
      const first = storeSources.value[0]
      if (first && first.id !== id) {
        opts.onNavigate?.('store', { sub: first.id })
      } else {
        allEntries.value = []
        totalCount.value = 0
        sourceSkills.value = []
      }
      return
    }
    allEntries.value = []
    totalCount.value = 0
    resetGitHubDescriptionContext()
    startLoadingDots()
    if (custom.type === 'git-repo') fetchGitHubSkills(custom.url!, custom.directory, custom.branch, force)
    else if (custom.type === 'marketplace-json') fetchMarketplaceSkills(custom, force)
    else if (custom.type === 'well-known-index') fetchWellKnownIndexSkills(custom, force)
    else if (custom.type === 'local-dir') fetchLocalDirSkills(custom)
  }

  async function fetchSkillsSh() {
    const presetId = activePresetId.value
    resetDescriptionStates()
    loading.value = true
    error.value = ''
    allEntries.value = []
    sourceSkills.value = []
    try {
      const res = await skillsSh.fetchLeaderboard(leaderboardFilter.value)
      if (activePresetId.value !== presetId) return
      const skills = res.entries.map(skillsSh.leaderboardEntryToSkill)
      const descPool = isStoreCacheEnabled() ? storage.getGitHubCache() : {}
      skills.forEach((s) => {
        s.storeSourceId = presetId
        const cached = descPool[s.id.toLowerCase()] || descPool[s.id]
        if (cached) {
          if (!s.description && cached.description) s.description = cached.description
          if (!s.shortDescription && cached.shortDescription) s.shortDescription = cached.shortDescription
        }
      })
      allEntries.value = skills
      totalCount.value = res.totalCount
      sourceSkills.value = skills
      loading.value = false
      stopLoadingDots()
      if (isStoreCacheEnabled()) {
        skillsCache.value['skills-sh'] = allEntries.value
        totalCountCache.value['skills-sh'] = res.totalCount
      }
    } catch (err: any) {
      error.value = err.message
      loading.value = false
      stopLoadingDots()
    }
  }

  async function fetchGitHubSkills(url: string, directory?: string, branch?: string, _force = false) {
    const presetId = activePresetId.value
    resetDescriptionStates()
    setGitHubResponseCacheEnabled(isStoreCacheEnabled())
    error.value = ''
    const info = parseRepositoryUrl(url)
    if (!info) {
      error.value = 'Invalid GitHub or Gitee URL'
      loading.value = false
      stopLoadingDots()
      return
    }
    const repoKey = `${info.owner}/${info.repo}`
    const effectiveBranch = branch || info.defaultBranch

    loading.value = true
    startLoadingDots()

    const descPool = isStoreCacheEnabled() ? storage.getGitHubCache() : {}
    const hasFreshCache = Object.keys(descPool).length > 0

    try {
      const token =
        info.provider === 'gitee'
          ? storage.getSettings().giteeToken || undefined
          : storage.getSettings().githubToken || undefined
      const tree =
        info.provider === 'gitee'
          ? await fetchGiteeRepoTree(info.owner, info.repo, effectiveBranch, token)
          : await fetchGitHubRepoTree(info.owner, info.repo, effectiveBranch, token)
      if (activePresetId.value !== presetId) return
      const skillDirs = detectSkillDirectories(tree).filter((sd) =>
        directory ? sd.dir === directory || sd.dir.startsWith(directory + '/') : true,
      )

      githubManifestMap.clear()
      const skeletons: Skill[] = skillDirs.map((sd) => {
        const dirName = sd.dir === '.' ? info.repo : sd.dir.split('/').pop() || sd.dir
        const id = info.provider === 'gitee' ? `gitee/${repoKey}/${dirName}` : `${repoKey}/${dirName}`
        githubManifestMap.set(id, sd.manifestFile)
        const prev = descPool[id]
        const builtinCategory = lookupBuiltinCategory(repoKey, dirName)
        return completeStoreSkill({
          id,
          name: prev?.name || dirName,
          description: prev?.description || '',
          shortDescription: prev?.shortDescription || '',
          author: prev?.author || '',
          tags: prev?.tags || [],
          source: info.provider,
          sourceUrl: getRepositoryUrl(info),
          repo: repoKey,
          repositoryProvider: info.provider,
          sourceId: `${info.provider}:${repoKey.toLowerCase()}:${sd.dir.toLowerCase()}`,
          path: sd.dir,
          category: prev?.category || builtinCategory || inferCategory(dirName, ''),
          iconUrl: lookupBuiltinIcon(repoKey, dirName),
          readme: prev?.readme,
          canonicalId: prev?.canonicalId,
          manifestFile: sd.manifestFile,
          storeSourceId: presetId,
          branch: effectiveBranch,
        })
      })
      if (activePresetId.value !== presetId) return
      allEntries.value = skeletons
      sourceSkills.value = skeletons
      totalCount.value = skeletons.length
      loading.value = false
      stopLoadingDots()
      if (isStoreCacheEnabled()) {
        skillsCache.value[presetId] = skeletons
        totalCountCache.value[presetId] = skeletons.length
      }

      githubRepoInfo.value = { provider: info.provider, owner: info.owner, repo: repoKey.split('/')[1], branch: effectiveBranch, presetId }
      if (isStoreCacheEnabled()) storage.saveGitHubSkills(skeletons.filter((s) => s.description || s.shortDescription))
    } catch (err: any) {
      if (!hasFreshCache && !allEntries.value.length) error.value = err.message
      loading.value = false
      stopLoadingDots()
    }
  }

  function applyWellKnownIndexSkills(skills: Skill[], presetId: string) {
    skillsCache.value[presetId] = skills
    totalCountCache.value[presetId] = skills.length
    if (activePresetId.value === presetId) {
      allEntries.value = skills
      totalCount.value = skills.length
      sourceSkills.value = skills
    }
  }

  async function fetchWellKnownIndexSkills(source: StoreSource, force = false) {
    const presetId = activePresetId.value
    if (!force && skillsCache.value[presetId]) {
      applyWellKnownIndexSkills(skillsCache.value[presetId], presetId)
      loading.value = false
      error.value = ''
      return
    }
    loading.value = true
    error.value = ''
    try {
      const skills = await fetchWellKnownIndex(source.url!)
      if (activePresetId.value !== presetId) return
      skills.forEach((s) => (s.storeSourceId = presetId))

      allEntries.value = skills
      totalCount.value = skills.length
      sourceSkills.value = skills
      loading.value = false

      skillsCache.value[presetId] = skills
      totalCountCache.value[presetId] = skills.length
    } catch (err: any) {
      error.value = err.message || '加载 Well-Known 索引失败'
      loading.value = false
    }
  }

  function applyMarketplaceSkills(skills: Skill[], presetId: string) {
    skillsCache.value[presetId] = skills
    totalCountCache.value[presetId] = skills.length
    if (activePresetId.value === presetId) {
      allEntries.value = skills
      totalCount.value = skills.length
      sourceSkills.value = skills
    }
  }

  async function fetchMarketplaceSkills(source: StoreSource, force = false) {
    const presetId = activePresetId.value
    if (!force && skillsCache.value[presetId]) {
      applyMarketplaceSkills(skillsCache.value[presetId], presetId)
      loading.value = false
      error.value = ''
      return
    }
    loading.value = true
    error.value = ''
    try {
      const res = await fetch(source.url!)
      const data = await res.json()
      if (activePresetId.value !== presetId) return
      const entries = Array.isArray(data) ? data : data.skills || data.plugins || data.packages || []
      const skills = parseMarketplaceEntries(entries, source, presetId)

      allEntries.value = skills
      totalCount.value = skills.length
      sourceSkills.value = skills
      loading.value = false

      skillsCache.value[presetId] = skills
      totalCountCache.value[presetId] = skills.length
    } catch (err: any) {
      error.value = err.message || '加载 Marketplace 失败'
      loading.value = false
    }
  }

  async function fetchLocalDirSkills(source: StoreSource) {
    const presetId = activePresetId.value
    loading.value = true
    error.value = ''
    allEntries.value = []
    totalCount.value = 0
    sourceSkills.value = []
    try {
      await new Promise<void>((resolve, reject) => {
        try {
          const results = window.services.scanForSkills(source.url!)
          if (activePresetId.value !== presetId) return
          totalCount.value = results.length
          const skills: Skill[] = []
          for (const r of results) {
            if (activePresetId.value !== presetId) {
              return
            }
            const fm = r.manifest || parseFrontmatter(r.content)
            const dirName = r.name
            const fmTags = fm.tags as string | string[] | undefined
            const tags = fmTags
              ? Array.isArray(fmTags)
                ? fmTags
                : fmTags
                    .split(',')
                    .map((t: string) => t.trim())
                    .filter(Boolean)
              : []
            const category = inferCategory(dirName, fm.description || '')
            skills.push(completeStoreSkill({
              id: `local/${dirName}`,
              name: fm.name || dirName,
              description: fm.description || '',
              author: fm.author || '',
              tags,
              source: 'local',
              sourceUrl: source.url,
              path: r.dir,
              category,
              readme: r.content,
              storeSourceId: presetId,
            }))
          }
          if (activePresetId.value !== presetId) {
            return
          }
          allEntries.value = skills
          sourceSkills.value = skills
          loading.value = false
          stopLoadingDots()
          skillsCache.value[presetId] = skills
          totalCountCache.value[presetId] = skills.length
          storage.saveDownloadedSkills(skills)
          resolve()
        } catch (e) {
          reject(e)
        }
      })
    } catch (err: any) {
      error.value = err.message || '扫描本地目录失败'
      loading.value = false
      stopLoadingDots()
    }
  }

  function onLeaderboardFilterChange(key: string) {
    leaderboardFilter.value = key
    if (activePresetId.value === 'skills-sh') {
      sourceSkills.value = []
      fetchSkillsSh()
    }
  }

  const isLocalSearchActive = computed(() => debouncedSearchQuery.value.trim() !== '' && activePresetId.value !== 'skills-sh')

  const localSearchResults = computed(() => {
    if (!isLocalSearchActive.value) return []
    return filterLocalSearch(allEntries.value, debouncedSearchQuery.value)
  })

  const visibleSearchResults = computed(() => searchResults.value.slice(0, visibleCount.value))
  const visibleLocalSearchResults = computed(() => localSearchResults.value.slice(0, visibleCount.value))

  function getLanguageTags(skill: any): { showChineseTag: boolean; showTranslatedTag: boolean } {
    void translationCacheVersion.value
    const desc = skill.description || ''
    if (isChineseContent(desc)) return { showChineseTag: true, showTranslatedTag: false }
    try {
      const raw = skill.content || ''
      const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      const fh = window.services.hashContent(normalized)
      const hasTranslation = !!(fh && storage.getTranslationByHash(fh)?.translatedContent)
      return { showChineseTag: false, showTranslatedTag: hasTranslation }
    } catch {
      return { showChineseTag: false, showTranslatedTag: false }
    }
  }

  const downloadedIdSet = computed(() => new Set(downloadedIds.value))

  const importedSkills = computed(() => {
    const { imported } = splitImportedAndAvailable({
      sourceSkills: sourceSkills.value,
      allEntries: allEntries.value,
      downloadedIds: downloadedIds.value,
      cachedDownloaded: storage.getDownloadedSkills(),
      activePresetId: activePresetId.value,
      filterTab: filterTab.value,
    })
    return imported
  })

  const visibleImportedSkills = computed(() => importedSkills.value.slice(0, visibleCount.value))

  const availableSkillsAll = computed(() => {
    const { available } = splitImportedAndAvailable({
      sourceSkills: sourceSkills.value,
      allEntries: allEntries.value,
      downloadedIds: downloadedIds.value,
      cachedDownloaded: storage.getDownloadedSkills(),
      activePresetId: activePresetId.value,
      filterTab: filterTab.value,
    })
    return available
  })

  function getDownloadedElsewhereBadges(skill: Skill): { text: string; type: string }[] {
    const cached = findDownloadedSkillMatch(skill, downloadedIds.value, storage.getDownloadedSkills())
    if (!cached || cached.storeSourceId === activePresetId.value) return []
    return [{ text: '已下载', type: 'downloaded-elsewhere' }]
  }

  function getDownloadedSkill(skill: Skill): Skill | undefined {
    return findDownloadedSkillMatch(skill, downloadedIds.value, storage.getDownloadedSkills())
  }

  const availableSkills = computed(() => availableSkillsAll.value.slice(0, visibleCount.value))
  watch([filterTab, debouncedSearchQuery, searchActive], resetVisibleCount)

  const categoryCounts = computed(() => buildCategoryCounts(sourceSkills.value))

  function isDownloading(id: string) {
    if (isQueuedDownloading(id)) return true
    const skill =
      searchResults.value.find((item) => item.id === id) ||
      allEntries.value.find((item) => item.id === id) ||
      sourceSkills.value.find((item) => item.id === id)
    if (!skill) return false
    const nameKey = normalizeSkillNameKey(skill.name)
    return downloadQueue.value.some(
      (item) =>
        item.type === 'download' &&
        (item.status === 'pending' || item.status === 'running') &&
        nameKey !== '' &&
        normalizeSkillNameKey(item.skillName) === nameKey,
    )
  }

  async function onSearch() {
    if (activePresetId.value !== 'skills-sh') return
    const q = searchQuery.value.trim()
    if (!q) {
      exitSearch()
      return
    }
    loading.value = true
    error.value = ''
    try {
      const results = await skillsSh.searchSkillsSh(q)
      const skills = results.map(skillsSh.searchResultToSkill)
      const descPool = isStoreCacheEnabled() ? storage.getGitHubCache() : {}
      const cachedMap = new Map(storage.getDownloadedSkills().map((s) => [s.id, s]))
      skills.forEach((s) => {
        const fromPool = descPool[s.id]
        if (fromPool) {
          if (!s.description && fromPool.description) s.description = fromPool.description
          if (!s.shortDescription && fromPool.shortDescription) s.shortDescription = fromPool.shortDescription
        }
        const cached = cachedMap.get(s.id)
        if (cached) {
          if (!s.description && cached.description) s.description = cached.description
          if (!s.shortDescription && cached.shortDescription) s.shortDescription = cached.shortDescription
        }
        s.storeSourceId = 'skills-sh'
      })
      searchResults.value = skills
      searchActive.value = true
      fetchSearchDescriptions(skills)
    } catch (err: any) {
      error.value = err.message
    }
    loading.value = false
  }

  async function fetchSearchDescriptions(skills: Skill[]) {
    const promises = skills
      .filter((skill) => !(skill.description || skill.shortDescription) && !fetchedDescIds.value.has(skill.id))
      .map(async (skill) => {
        loadingDescIds.value = new Set([...loadingDescIds.value, skill.id])
        try {
          const desc = await skillsSh.fetchSkillDescriptionFromSh(skill)
          if (desc) {
            skill.shortDescription = desc
            if (isStoreCacheEnabled()) storage.saveGitHubSkills([{ ...skill, storeSourceId: 'skills-sh' }])
          }
          fetchedDescIds.value = new Set([...fetchedDescIds.value, skill.id])
        } catch {
          /* ignore desc fetch errors */
        }
        loadingDescIds.value = new Set([...loadingDescIds.value].filter((id) => id !== skill.id))
      })
    await Promise.all(promises)
  }

  function exitSearch() {
    searchActive.value = false
    searchQuery.value = ''
    searchResults.value = []
    error.value = ''
  }

  function isDownloaded(id: string) {
    if (downloadedIds.value.includes(id)) return true
    const skill =
      searchResults.value.find((item) => item.id === id) ||
      allEntries.value.find((item) => item.id === id) ||
      sourceSkills.value.find((item) => item.id === id)
    return Boolean(skill && getDownloadedSkill(skill))
  }

  function refreshDownloadedIds() {
    downloadedIds.value = storage.getDownloadedIds()
  }

  const sourceSubtitle = computed(() => {
    const preset = getActivePreset()
    if (!preset) return '浏览和下载技能'
    if ('desc' in preset && preset.desc) return preset.desc
    const typeLabels: Record<string, string> = {
      'marketplace-json': 'Marketplace JSON 源',
      'well-known-index': 'Well-Known 索引源',
      'git-repo': 'Git 仓库源',
      'local-dir': '本地目录源',
    }
    return typeLabels[(preset as StoreSource).type] || preset.name || '浏览和下载技能'
  })

  const sourceItems = computed(() =>
    storeSources.value.map((s) => ({
      id: s.id,
      label: s.label,
      deletable: (s as any).deletable,
    })),
  )

  function getSourceIcon(id: string): string | undefined {
    return storeSources.value.find((s) => s.id === id)?.icon
  }

  const isCurrentStoreCustom = computed(() => {
    void _storeVersion.value
    return storage.getStoreSources().some((s) => s.id === activePresetId.value)
  })

  function bumpStoreVersion() {
    _storeVersion.value++
  }

  function clearSearchDebounce() {
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer)
      searchDebounceTimer = null
    }
  }

  function selectStore(id: string) {
    activePresetId.value = id
    searchQuery.value = ''
    searchActive.value = false
    searchResults.value = []
    filterTab.value = 'all'
    leaderboardFilter.value = 'all'
    sourceSkills.value = []
    error.value = ''
    storage.savePageState('skill-store', { presetId: id })
    fetchCurrentSkills()
    opts.onNavigate?.('store', { sub: id })
  }

  // keep storeSources in sync when custom sources removed
  watch(
    storeSources,
    (list) => {
      if (list.length && !list.some((s) => s.id === activePresetId.value)) {
        const fallback = list[0].id
        activePresetId.value = fallback
        storage.savePageState('skill-store', { presetId: fallback })
        fetchCurrentSkills()
        opts.onNavigate?.('store', { sub: fallback })
      }
    },
    { immediate: true },
  )

  return {
    presets,
    STORE_PRESETS: presets,
    SKILL_CATEGORIES,
    ALL_CATEGORIES,
    PAGE_SIZE,
    _storeVersion,
    storeSources,
    activePresetId,
    currentSource,
    searchQuery,
    debouncedSearchQuery,
    filterTab,
    leaderboardFilter,
    searchActive,
    searchResults,
    allEntries,
    sourceSkills,
    totalCount,
    loading,
    error,
    downloadedIds,
    storeScrollRef,
    skillsCache,
    totalCountCache,
    visibleCount,
    githubManifestMap,
    githubRepoInfo,
    fetchedDescIds,
    loadingDescIds,
    failedDescIds,
    loadingDots,
    startLoadingDots,
    stopLoadingDots,
    resetVisibleCount,
    growVisibleCount,
    onStoreScroll,
    fillViewport,
    getActivePreset,
    fetchCurrentSkills,
    fetchSkillsSh,
    fetchGitHubSkills,
    onLeaderboardFilterChange,
    isLocalSearchActive,
    localSearchResults,
    visibleSearchResults,
    visibleLocalSearchResults,
    getLanguageTags,
    downloadedIdSet,
    importedSkills,
    visibleImportedSkills,
    availableSkillsAll,
    availableSkills,
    getDownloadedElsewhereBadges,
    getDownloadedSkill,
    categoryCounts,
    isDownloading,
    onSearch,
    fetchSearchDescriptions,
    exitSearch,
    isDownloaded,
    refreshDownloadedIds,
    sourceSubtitle,
    sourceItems,
    getSourceIcon,
    isCurrentStoreCustom,
    bumpStoreVersion,
    clearSearchDebounce,
    selectStore,
    showToast,
  }
}

export type UseStoreSkillsReturn = ReturnType<typeof useStoreSkills>

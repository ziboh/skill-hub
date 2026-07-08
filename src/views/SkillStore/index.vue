<script setup lang="ts">
import { ref, computed, onMounted, onActivated, onDeactivated, watch, inject, onUnmounted, nextTick } from 'vue'
import { KeyRefreshCounts, KeyShowToast } from '../../inject-keys'
import { storage, MARKETPLACE_TTL } from '../../utils/storage'
import { parseGitHubUrl, fetchGitHubRepoTree, fetchGitHubFile, detectSkillDirectories, getRateLimitState } from '../../utils/github'
import { parseFrontmatter } from '../../utils/frontmatter'
import * as skillsSh from '../../utils/skills-sh'
import type { Skill, StoreSource } from '../../types'

import { SKILL_CATEGORIES, ALL_CATEGORIES, inferCategory, CATEGORY_ICONS } from '../../data/skill-categories'
import type { SkillCategory } from '../../data/skill-categories'
import { lookupBuiltinIcon, lookupBuiltinCategory } from '../../data/skill-icons'
import { STORE_ICONS, getStoreIconFromSource, getIconRenderType, isProviderIcon, isStoreIconKey, resolveStoreIcon } from '../../data/store-icons'
import SkillDetailModal from '../../components/SkillDetailModal.vue'
import SkillPickModal from '../../components/SkillPickModal.vue'
import ConfirmModal from '../../components/ConfirmModal.vue'
import QuickSwitcher from '../../components/QuickSwitcher.vue'
import StoreConfigModal from '../../components/StoreConfigModal.vue'
import SkillCard from '../../components/SkillCard.vue'
import { getAvatarColor } from '../../utils/color'

import { defaultPlatforms } from '../../data/platforms'
import { useSettings } from '../../composables/useSettings'
import { useTheme } from '../../composables/useTheme'
import { useDownloadQueue } from '../../composables/useDownloadQueue'
import { useTranslationQueue } from '../../composables/useTranslationQueue'
import { loadRegistry, registerSkillFromStore, removeFromRegistry } from '../../utils/skill-registry'
import { isChineseContent, computeContentHash, computeDescriptionHash } from '../../utils/translate'

const props = defineProps<{ storeId: string }>()
const emit = defineEmits(['navigate'])
const refreshCounts = inject(KeyRefreshCounts)
const showToast = inject(KeyShowToast, () => {})

const { addDownload, updateItem } = useDownloadQueue()
const { queue: transQueue, addTranslation, cacheVersion: translationCacheVersion } = useTranslationQueue()
const { settings, updateSettings } = useSettings()
const { isDarkMode, toggleTheme } = useTheme()
const viewMode = ref<'grid' | 'list'>('grid')

interface PresetSource { id: string; name: string; url: string; desc: string; icon: string; directory?: string }
const presets: PresetSource[] = [
  { id: 'claude', name: 'Claude Code', url: 'github.com/anthropics/skills', desc: 'Anthropic 官方技能', icon: STORE_ICONS.claude },
  { id: 'codex', name: 'OpenAI Codex', url: 'github.com/openai/skills', desc: 'OpenAI Codex 官方技能', icon: STORE_ICONS.codex, directory: 'skills/.curated' },
  { id: 'skills-sh', name: 'skills.sh', url: '', desc: '社区技能市场', icon: STORE_ICONS['skills-sh'] },
]

const _storeVersion = ref(0)

const storeSources = computed(() => {
  void _storeVersion.value
  const builtin = [
    { id: 'claude', label: 'Claude Code', icon: STORE_ICONS.claude },
    { id: 'codex', label: 'Codex', icon: STORE_ICONS.codex },
    { id: 'skills-sh', label: 'skills.sh', icon: STORE_ICONS['skills-sh'] },
  ]
  const custom = storage.getStoreSources()
    .filter(s => s.enabled)
    .map(s => ({
      id: s.id,
      label: s.name,
      icon: getStoreIconFromSource(s),
      deletable: true,
    }))
  return [...builtin, ...custom]
})

const localIconCache = ref<Record<string, string>>({})

function loadLocalIcons() {
  for (const s of storeSources.value) {
    if (s.icon && getIconRenderType(s.icon) === 'local-path' && window.services) {
      const dataUri = window.services.readFileAsDataUri(s.icon)
      if (dataUri) localIconCache.value[s.id] = dataUri
    }
  }
}

const savedState = storage.getPageState('skill-store')
const activePresetId = ref(savedState?.presetId || props.storeId)
const fetchGitHubDesc = ref(savedState?.fetchGitHubDesc !== false)
const currentSource = computed(() => storeSources.value.find(s => s.id === activePresetId.value))
const showPickModal = ref(false)
const pickSkills = ref<{ name: string; description: string; dir: string }[]>([])
let pickSkillResolve: ((dir: string | null) => void) | null = null
const searchQuery = ref('')
const debouncedSearchQuery = ref('')
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null
watch(searchQuery, (val) => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => { debouncedSearchQuery.value = val }, 300)
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
const downloading = ref<Set<string>>(new Set())
const installRecords = ref(storage.getInstallRecords())
const storeScrollRef = ref<HTMLElement | null>(null)
const skillsCache = ref<Record<string, Skill[]>>({})
const totalCountCache = ref<Record<string, number>>({})
const selectedSkill = ref<Skill | null>(null)
const PAGE_SIZE = 60
const visibleCount = ref(PAGE_SIZE)
function ensureDescriptionObserver() {
  if (activePresetId.value === 'skills-sh') nextTick(setupDescriptionObserver)
}

function resetVisibleCount() { visibleCount.value = PAGE_SIZE; ensureDescriptionObserver() }
function growVisibleCount() {
  const maxCount = searchActive.value
    ? searchResults.value.length
    : isLocalSearchActive.value
      ? localSearchResults.value.length
      : importedSkills.value.length + availableSkillsAll.value.length
  if (visibleCount.value >= maxCount) return false
  visibleCount.value = Math.min(visibleCount.value + PAGE_SIZE, maxCount)
  ensureDescriptionObserver()
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
  while (el.scrollHeight <= el.clientHeight + 600 && growVisibleCount() && guard++ < 20) {}
}

const showConfirmDelete = ref(false)
const skillToDelete = ref<Skill | null>(null)
const showDeleteStoreConfirm = ref(false)
const storeToDelete = ref<{ id: string; name: string } | null>(null)
const showStoreConfigModal = ref(false)
const editingStoreSource = ref<StoreSource | null>(null)
const loadingDots = ref('.')
let loadingDotsTimer: ReturnType<typeof setInterval> | null = null
function startLoadingDots() {
  stopLoadingDots()
  const frames = ['.', '..', '...', '..', '.']
  let i = 0
  loadingDots.value = frames[0]
  loadingDotsTimer = setInterval(() => { i = (i + 1) % frames.length; loadingDots.value = frames[i] }, 500)
}
function stopLoadingDots() { if (loadingDotsTimer) { clearInterval(loadingDotsTimer); loadingDotsTimer = null } }

watch(() => props.storeId, (id) => {
  activePresetId.value = id
  searchQuery.value = ''
  searchActive.value = false
  searchResults.value = []
  filterTab.value = 'all'
  leaderboardFilter.value = 'all'
  sourceSkills.value = []
  error.value = ''
  loading.value = false
  resetVisibleCount()
  fetchCurrentSkills()
})

watch(storeSources, (list) => {
  loadLocalIcons()
  if (list.length && !list.some(s => s.id === activePresetId.value)) {
    const fallback = list[0].id
    activePresetId.value = fallback
    storage.savePageState('skill-store', { presetId: fallback })
    fetchCurrentSkills()
    emit('navigate', 'store', { sub: fallback })
  }
}, { immediate: true })

let scrollObserver: IntersectionObserver | null = null
const fetchedDescIds = ref<Set<string>>(new Set())
const loadingDescIds = ref<Set<string>>(new Set())

function setupDescriptionObserver() {
  if (scrollObserver) { scrollObserver.disconnect(); scrollObserver = null }
  if (!fetchGitHubDesc.value || activePresetId.value !== 'skills-sh') return
  scrollObserver = new IntersectionObserver(async (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const skillId = entry.target.getAttribute('data-skill-id')
      if (!skillId || fetchedDescIds.value.has(skillId)) continue
      const skill = allEntries.value.find(s => s.id === skillId) || searchResults.value.find(s => s.id === skillId) || importedSkills.value.find(s => s.id === skillId)
      if (!skill) continue
      if (skill.description || skill.shortDescription) { fetchedDescIds.value.add(skillId); continue }
      loadingDescIds.value = new Set([...loadingDescIds.value, skillId])
      skillsSh.fetchSkillDescriptionFromSh(skill).then(desc => {
        if (desc && activePresetId.value === 'skills-sh') {
          skill.shortDescription = desc
          fetchedDescIds.value = new Set([...fetchedDescIds.value, skillId])
          storage.saveCachedSkills([{ ...skill, storeSourceId: activePresetId.value }], { forceStoreSourceId: true })
        }
      }).catch(() => {}).finally(() => {
        loadingDescIds.value = new Set([...loadingDescIds.value].filter(id => id !== skillId))
      })
      scrollObserver?.unobserve(entry.target)
    }
  }, { root: storeScrollRef.value, threshold: 0.1 })
  nextTick(() => {
    if (!scrollObserver) return
    const container = storeScrollRef.value
    if (!container) return
    container.querySelectorAll('[data-skill-id]').forEach(el => scrollObserver?.observe(el))
  })
}

function onKeydown(e: KeyboardEvent) { if (e.key === 'Escape' && (searchActive.value || isLocalSearchActive.value)) { searchQuery.value = ''; exitSearch() } }
onMounted(() => { downloadedIds.value = storage.getDownloadedIds(); fetchCurrentSkills(); loadLocalIcons(); window.addEventListener('keydown', onKeydown); window.addEventListener('resize', fillViewport) })
onActivated(() => { downloadedIds.value = storage.getDownloadedIds(); if (props.storeId !== activePresetId.value) { activePresetId.value = props.storeId; storage.savePageState('skill-store', { presetId: props.storeId }); resetVisibleCount(); fetchCurrentSkills(); } else { exitSearch(); resetVisibleCount(); fetchCurrentSkills(); } window.addEventListener('keydown', onKeydown); window.addEventListener('resize', fillViewport); nextTick(fillViewport) })
onDeactivated(() => { stopLoadingDots(); if (scrollObserver) { scrollObserver.disconnect(); scrollObserver = null } window.removeEventListener('keydown', onKeydown); window.removeEventListener('resize', fillViewport); if (searchDebounceTimer) { clearTimeout(searchDebounceTimer); searchDebounceTimer = null } })
onUnmounted(() => { stopLoadingDots(); if (scrollObserver) { scrollObserver.disconnect(); scrollObserver = null } window.removeEventListener('keydown', onKeydown); window.removeEventListener('resize', fillViewport); if (searchDebounceTimer) { clearTimeout(searchDebounceTimer); searchDebounceTimer = null } })

function fetchCurrentSkills(force = false) {
  const id = activePresetId.value
  resetVisibleCount()
  if (storeScrollRef.value) storeScrollRef.value.scrollTop = 0
  // 检查内存缓存
  if (!force && skillsCache.value[id]) {
    allEntries.value = skillsCache.value[id]
    totalCount.value = totalCountCache.value[id] ?? allEntries.value.length
    sourceSkills.value = allEntries.value
    loading.value = false
    stopLoadingDots()
    error.value = ''
    if (id === 'skills-sh') setupDescriptionObserver()
    return
  }
  const custom = storage.getStoreSources().find(s => s.id === id)
  const preset = presets.find((p) => p.id === id)
  if (preset) {
    allEntries.value = []; totalCount.value = 0
    startLoadingDots()
    if (id === 'skills-sh') fetchSkillsSh()
    else if (preset.url) fetchGitHubSkills(preset.url, preset.directory)
    return
  }
  if (!custom) {
    const first = storeSources.value[0]
    if (first && first.id !== id) {
      emit('navigate', 'store', { sub: first.id })
    } else {
      allEntries.value = []; totalCount.value = 0; sourceSkills.value = []
    }
    return
  }
  allEntries.value = []; totalCount.value = 0
  startLoadingDots()
  if (custom.type === 'git-repo') fetchGitHubSkills(custom.url!, custom.directory, custom.branch)
  else if (custom.type === 'marketplace-json') fetchMarketplaceSkills(custom, force)
  else if (custom.type === 'local-dir') fetchLocalDirSkills(custom)
}

function getActivePreset() {
  return presets.find((p) => p.id === activePresetId.value)
    || storage.getStoreSources().find(s => s.id === activePresetId.value)
}

function getSkillUrl(skill: Skill): string | undefined {
  if (skill.sourceUrl) return skill.sourceUrl
  if (skill.homepage) return skill.homepage
  if (skill.repo) return `https://github.com/${skill.repo}`
  return undefined
}

async function fetchSkillsSh() {
  const presetId = activePresetId.value
  fetchedDescIds.value = new Set()
  loading.value = true; error.value = ''; allEntries.value = []; sourceSkills.value = []
  try {
    const res = await skillsSh.fetchLeaderboard(leaderboardFilter.value)
    if (activePresetId.value !== presetId) return
    const skills = res.entries.map(skillsSh.leaderboardEntryToSkill)
    const cachedMap = new Map(storage.getCachedSkills().map(s => [s.id, s]))
    skills.forEach(s => {
      s.storeSourceId = presetId
      const cached = cachedMap.get(s.id)
      if (cached) {
        if (!s.description && cached.description) s.description = cached.description
        if (!s.shortDescription && cached.shortDescription) s.shortDescription = cached.shortDescription
      }
    })
    allEntries.value = skills; totalCount.value = res.totalCount
    sourceSkills.value = skills
    loading.value = false; stopLoadingDots()
    skillsCache.value['skills-sh'] = allEntries.value; totalCountCache.value['skills-sh'] = res.totalCount
    setupDescriptionObserver()
  } catch (err: any) { error.value = err.message; loading.value = false; stopLoadingDots() }
}

async function fetchWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

function onLeaderboardFilterChange(key: string) { leaderboardFilter.value = key; if (activePresetId.value === 'skills-sh') { sourceSkills.value = []; fetchSkillsSh() } }

function onModalImported() { downloadedIds.value = storage.getDownloadedIds(); selectedSkill.value = null }




async function fetchGitHubSkills(url: string, directory?: string, branch?: string) {
  const presetId = activePresetId.value
  loading.value = true; error.value = ''; allEntries.value = []; totalCount.value = 0; sourceSkills.value = []
  try {
    const info = parseGitHubUrl(url)
    if (!info) { error.value = 'Invalid GitHub URL'; loading.value = false; stopLoadingDots(); return }
    const effectiveBranch = branch || info.defaultBranch
    const token = storage.getSettings().githubToken || undefined
    const tree = await fetchGitHubRepoTree(info.owner, info.repo, effectiveBranch, token)
    if (activePresetId.value !== presetId) return
    const dirPrefix = directory ? `${directory}/` : ''
    const skillDirs = detectSkillDirectories(tree).filter(
      (sd) => directory ? sd.dir === directory || sd.dir.startsWith(directory + '/') : true
    )
    totalCount.value = skillDirs.length
    loading.value = false; stopLoadingDots()
    for (let i = 0; i < skillDirs.length; ) {
      if (activePresetId.value !== presetId) { return }
      const { remaining } = getRateLimitState()
      const batchSize = remaining > 100 ? 8 : remaining > 30 ? 4 : remaining > 10 ? 2 : 1
      const batch = skillDirs.slice(i, i + batchSize)
      const results = await Promise.allSettled(batch.map(async (sd) => {
        const token = storage.getSettings().githubToken || undefined
        const content = await fetchWithTimeout(fetchGitHubFile(info.owner, info.repo, sd.manifestFile, effectiveBranch, token), 10000)
        const fm = parseFrontmatter(content)
        const dirName = sd.dir === '.' ? info.repo : sd.dir.split('/').pop() || sd.dir
        const tags = fm.tags ? fm.tags.split(',').map((t) => t.trim()).filter(Boolean) : []
        const builtinCategory = lookupBuiltinCategory(`${info.owner}/${info.repo}`, dirName)
        const category = builtinCategory || inferCategory(dirName, fm.description || '')
        const iconUrl = lookupBuiltinIcon(`${info.owner}/${info.repo}`, dirName)
        const skill: Skill = { id: `${info.owner}/${info.repo}/${dirName}`, name: fm.name || dirName, description: fm.description || '', author: fm.author || '', tags, source: 'github', sourceUrl: `https://github.com/${info.owner}/${info.repo}`, repo: `${info.owner}/${info.repo}`, path: sd.dir, category, iconUrl, readme: content, storeSourceId: presetId, branch: effectiveBranch }
        return skill
      }))
      if (activePresetId.value !== presetId) { return }
      const seen = new Map(allEntries.value.map(s => [s.id, s]))
      for (const r of results) {
        if (r.status === 'fulfilled' && !seen.has(r.value.id)) {
          seen.set(r.value.id, r.value)
        }
      }
      allEntries.value = Array.from(seen.values())
      sourceSkills.value = allEntries.value
      i += batchSize
    }
    if (activePresetId.value !== presetId) { return }
    skillsCache.value[presetId] = allEntries.value; totalCountCache.value[presetId] = allEntries.value.length
    storage.saveCachedSkills(allEntries.value)
  } catch (err: any) { error.value = err.message; loading.value = false; stopLoadingDots() }
}

function parseMarketplaceEntries(entries: any[], source: StoreSource, presetId: string): Skill[] {
  return entries.map((entry: any) => {
    const name = entry.name || entry.title || '未知'
    const description = entry.description || ''
    const author = entry.author || ''
    const tags = Array.isArray(entry.tags) ? entry.tags : (typeof entry.tags === 'string' ? entry.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [])
    const dirName = name.toLowerCase().replace(/\s+/g, '-')
    const category = inferCategory(dirName, description)
    const repo = entry.repo || entry.repository || ''
    let skillPath = dirName
    if (entry.homepage && repo) {
      const repoUrl = `https://github.com/${repo}/tree/`
      if (entry.homepage.startsWith(repoUrl)) {
        const afterBranch = entry.homepage.slice(repoUrl.length).split('/').slice(1).join('/')
        if (afterBranch) skillPath = afterBranch
      }
    }
    const skillId = repo ? `${repo}/${dirName}` : `${source.id}/${dirName}`
    return {
      id: skillId, name, description, author, tags,
      source: 'marketplace-json',
      repo: repo || undefined, path: skillPath,
      category, storeSourceId: presetId,
      sourceUrl: entry.url || entry.sourceUrl || entry.homepage || entry.downloadUrl || source.url,
      iconUrl: entry.icon || entry.iconUrl,
    } as Skill
  })
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
    loading.value = false; error.value = ''
    return
  }
  if (!force) {
    const stale = storage.getMarketplaceCache(presetId)
    if (stale) {
      applyMarketplaceSkills(stale.skills, presetId)
      loading.value = false; error.value = ''
      if (Date.now() - stale.fetchedAt >= MARKETPLACE_TTL) {
        fetch(source.url!).then(res => res.json()).then(data => {
          if (activePresetId.value !== presetId) return
          const entries = Array.isArray(data) ? data : (data.skills || data.plugins || data.packages || [])
          const skills = parseMarketplaceEntries(entries, source, presetId)
          applyMarketplaceSkills(skills, presetId)
          storage.saveMarketplaceSkills(presetId, skills)
        }).catch(() => {})
      }
      return
    }
  }
  loading.value = true; error.value = ''
  try {
    const res = await fetch(source.url!)
    const data = await res.json()
    if (activePresetId.value !== presetId) return
    const entries = Array.isArray(data) ? data : (data.skills || data.plugins || data.packages || [])
    const skills = parseMarketplaceEntries(entries, source, presetId)

    allEntries.value = skills
    totalCount.value = skills.length
    sourceSkills.value = skills
    loading.value = false

    skillsCache.value[presetId] = skills
    totalCountCache.value[presetId] = skills.length
    storage.saveMarketplaceSkills(presetId, skills)
  } catch (err: any) {
    error.value = err.message || '加载 Marketplace 失败'
    loading.value = false
  }
}

async function fetchLocalDirSkills(source: StoreSource) {
  const presetId = activePresetId.value
  loading.value = true; error.value = ''; allEntries.value = []; totalCount.value = 0; sourceSkills.value = []
  try {
    await new Promise<void>((resolve, reject) => {
      try {
        const results = window.services.scanForSkills(source.url!)
        if (activePresetId.value !== presetId) return
        totalCount.value = results.length
        const skills: Skill[] = []
        for (const r of results) {
          if (activePresetId.value !== presetId) { return }
          const fm = r.manifest || parseFrontmatter(r.content)
          const dirName = r.name
          const fmTags = fm.tags as string | string[] | undefined
          const tags = fmTags ? (Array.isArray(fmTags) ? fmTags : fmTags.split(',').map((t: string) => t.trim()).filter(Boolean)) : []
          const category = inferCategory(dirName, fm.description || '')
          skills.push({
            id: `local/${dirName}`, name: fm.name || dirName, description: fm.description || '',
            author: fm.author || '', tags,
            source: 'local', sourceUrl: source.url, path: r.dir,
            category, readme: r.content, storeSourceId: presetId,
          })
        }
        if (activePresetId.value !== presetId) { return }
        allEntries.value = skills
        sourceSkills.value = skills
        loading.value = false; stopLoadingDots()
        skillsCache.value[presetId] = skills; totalCountCache.value[presetId] = skills.length
        storage.saveCachedSkills(skills)
        resolve()
      } catch (e) { reject(e) }
    })
  } catch (err: any) { error.value = err.message || '扫描本地目录失败'; loading.value = false; stopLoadingDots() }
}

const isLocalSearchActive = computed(() => debouncedSearchQuery.value.trim() !== '' && activePresetId.value !== 'skills-sh')

const localSearchResults = computed(() => {
  if (!isLocalSearchActive.value) return []
  const q = debouncedSearchQuery.value.trim().toLowerCase()
  return allEntries.value.filter(s => {
    const nameMatch = s.name.toLowerCase().includes(q)
    const descMatch = (s.description || '').toLowerCase().includes(q)
    const authorMatch = (s.author || '').toLowerCase().includes(q)
    const tagMatch = s.tags?.some(t => t.toLowerCase().includes(q))
    return nameMatch || descMatch || authorMatch || tagMatch
  })
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
    const dh = computeDescriptionHash(desc)
    const hasTranslation = !!((storage.getDescTranslationByHash(dh) || storage.getDescTranslationByHash(fh)) && storage.getTranslationByHash(fh))
    return { showChineseTag: false, showTranslatedTag: hasTranslation }
  } catch {
    return { showChineseTag: false, showTranslatedTag: false }
  }
}

const importedSkills = computed(() => {
  const idMap = new Map<string, Skill>()
  const cached = storage.getCachedSkills()
  const cachedMap = new Map(cached.map(s => [s.id, s]))
  const ids = downloadedIdSet.value
  if (allEntries.value.length) {
    for (const s of allEntries.value) {
      if (!ids.has(s.id)) continue
      const cs = cachedMap.get(s.id)
      if (!cs || cs.storeSourceId !== activePresetId.value) continue
      idMap.set(s.id, s)
    }
  }
  for (const s of cached) {
    if (!ids.has(s.id)) continue
    if (s.storeSourceId !== activePresetId.value) continue
    if (!idMap.has(s.id)) idMap.set(s.id, s)
  }
  let list = downloadedIds.value.filter((id) => idMap.has(id)).map((id) => idMap.get(id)!)
  if (filterTab.value !== 'all') list = list.filter((s) => s.category === filterTab.value)
  return list
})
const visibleImportedSkills = computed(() => importedSkills.value.slice(0, visibleCount.value))

function getPresetOwnerRepo(storeId: string): string | null {
  const preset = presets.find(p => p.id === storeId)
  if (preset?.url) {
    const info = parseGitHubUrl(preset.url)
    if (info) return `${info.owner}/${info.repo}`
  }
  const source = storage.getStoreSources().find(s => s.id === storeId)
  if (source?.url) {
    const info = parseGitHubUrl(source.url)
    if (info) return `${info.owner}/${info.repo}`
  }
  return null
}

const downloadedIdSet = computed(() => new Set(downloadedIds.value))
const cachedSkillMap = computed(() => {
  const map = new Map<string, Skill>()
  for (const s of storage.getCachedSkills()) map.set(s.id, s)
  return map
})

const availableSkillsAll = computed(() => {
  let list = sourceSkills.value.filter((s) => {
    if (!downloadedIdSet.value.has(s.id)) return true
    const cs = cachedSkillMap.value.get(s.id)
    return !cs || cs.storeSourceId !== activePresetId.value
  })
  if (filterTab.value !== 'all') list = list.filter((s) => s.category === filterTab.value)
  return list
})

const availableSkills = computed(() => availableSkillsAll.value.slice(0, visibleCount.value))
watch([filterTab, debouncedSearchQuery, searchActive], resetVisibleCount)

const categoryCounts = computed(() => {
  const counts: Record<string, number> = { all: sourceSkills.value.length }
  for (const s of sourceSkills.value) {
    const cat = s.category || 'other'
    counts[cat] = (counts[cat] || 0) + 1
  }
  return counts
})

const downloadingSet = computed(() => new Set(downloading.value))
function isDownloading(id: string) { return downloadingSet.value.has(id) }

async function onSearch() {
  if (activePresetId.value !== 'skills-sh') return
  const q = searchQuery.value.trim()
  if (!q) { exitSearch(); return }
  loading.value = true; error.value = ''
  try {
    const results = await skillsSh.searchSkillsSh(q)
    const skills = results.map(skillsSh.searchResultToSkill)
    const cachedMap = new Map(storage.getCachedSkills().map(s => [s.id, s]))
    skills.forEach(s => {
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
  }
  catch (err: any) { error.value = err.message }
  loading.value = false
}

async function fetchSearchDescriptions(skills: Skill[]) {
  if (!fetchGitHubDesc.value) return
  const promises = skills
    .filter(skill => !(skill.description || skill.shortDescription) && !fetchedDescIds.value.has(skill.id))
    .map(async (skill) => {
      loadingDescIds.value = new Set([...loadingDescIds.value, skill.id])
      try {
        const desc = await skillsSh.fetchSkillDescriptionFromSh(skill)
        if (desc) {
          skill.shortDescription = desc
          fetchedDescIds.value = new Set([...fetchedDescIds.value, skill.id])
          storage.saveCachedSkills([{ ...skill, storeSourceId: 'skills-sh' }], { forceStoreSourceId: true })
        }
      } catch {}
      loadingDescIds.value = new Set([...loadingDescIds.value].filter(id => id !== skill.id))
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
  return downloadedIds.value.includes(id)
}



const platformNameMap = computed(() => {
  const map: Record<string, string> = {}
  for (const p of defaultPlatforms) map[p.id] = p.name
  return map
})

function getInstalledPlatforms(skillId: string) {
  return installRecords.value.filter((r) => r.skillId === skillId).map((r) => ({
    id: r.platformId,
    name: platformNameMap.value[r.platformId] || r.platformId,
  }))
}

function collectAllSkillDirs(root: string): string[] {
  const results: string[] = []
  const rootSkill = ['SKILL.md', 'skill.md'].find((f) => window.services.pathExists(window.services.pathJoin(root, f)))
  if (rootSkill) results.push(root)
  const items = window.services.readDir(root) || []
  for (const item of items) {
    if (!item.isDirectory) continue
    results.push(...collectAllSkillDirs(item.path))
  }
  return results
}

function readSkillDirMeta(dirPath: string): { name: string; description: string } {
  const skillFile = ['SKILL.md', 'skill.md']
    .map((f) => window.services.pathJoin(dirPath, f))
    .find((f) => window.services.pathExists(f))
  if (skillFile) {
    const content = window.services.readFile(skillFile)
    const fm = parseFrontmatter(content || '')
    return { name: fm.name || '', description: fm.description || '' }
  }
  return { name: '', description: '' }
}

function matchSkillDir(candidates: string[], targetName: string): string | null {
  if (candidates.length === 1) return candidates[0]
  if (!targetName) return candidates[0] || null
  const targetLower = targetName.toLowerCase()
  for (const dir of candidates) {
    const { name } = readSkillDirMeta(dir)
    if (name && name.toLowerCase() === targetLower) return dir
  }
  for (const dir of candidates) {
    const dirName = dir.split(/[\\/]/).pop()?.toLowerCase() || ''
    if (dirName === targetLower || dirName.includes(targetLower) || targetLower.includes(dirName)) return dir
  }
  return null
}

function pickSkillDir(candidates: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    pickSkills.value = candidates.map((dir) => {
      const { name, description } = readSkillDirMeta(dir)
      const dirName = dir.split(/[\\/]/).pop() || dir
      return { name: name || dirName, description, dir }
    })
    pickSkillResolve = resolve
    showPickModal.value = true
  })
}

function handlePickSelect(dir: string) {
  pickSkillResolve?.(dir)
  showPickModal.value = false
  pickSkillResolve = null
}

function handlePickCancel() {
  pickSkillResolve?.(null)
  showPickModal.value = false
  pickSkillResolve = null
}

async function downloadSkill(skill: Skill) {
  if (downloadedIds.value.includes(skill.id) || isDownloading(skill.id)) return
  if (!skill.repo) {
    showToast('该技能没有关联的 GitHub 仓库，无法下载', 'error')
    return
  }
  downloading.value.add(skill.id)
  const queueItem = addDownload(skill.id, skill.name, activePresetId.value || 'unknown')
  try {
    const gh = skillsSh.getGitHubRepo(skill)
    if (!gh) {
      showToast('无效的 GitHub 仓库地址', 'error')
      updateItem(queueItem.id, { status: 'error', error: '无效的 GitHub 仓库地址' })
      storage.addFailureRecord({ type: 'download', skillId: skill.id, skillName: skill.name, error: '无效的 GitHub 仓库地址' })
      downloading.value.delete(skill.id)
      return
    }
    const { owner, repo } = gh
    const skillPath = skill.path || skill.id
    const buffer = await window.services.downloadFile(`https://api.github.com/repos/${owner}/${repo}/zipball/${skill.branch || 'main'}`, storage.getSettings().githubToken || undefined)
    const tempDir = window.services.pathJoin(window.services.homeDir(), '.cache/skill-hub/')
    window.services.mkdir(tempDir)
    const extractDir = window.services.pathJoin(tempDir, `extract-${skill.id.replace(/\//g, '-')}`)
    window.services.removeFile(extractDir)
    window.services.extractBufferZip(buffer, extractDir)
    const extractedItems = window.services.readDir(extractDir)
    const rootDir = extractedItems.find((d: any) => d.isDirectory)
    const sourceRoot = rootDir ? rootDir.path : extractDir
    const pathCandidates = [
      skillPath,
      `skills/${skillPath}`,
      `agent-skills/${skillPath}`,
    ]
    let skillSourceDir: string | null = ''
    for (const p of pathCandidates) {
      const candidate = window.services.pathJoin(sourceRoot, p)
      if (window.services.pathExists(candidate)) { skillSourceDir = candidate; break }
    }
    if (!skillSourceDir) {
      const allSkillDirs = collectAllSkillDirs(sourceRoot)
      if (allSkillDirs.length === 0) {
        showToast('未找到技能文件', 'error')
        updateItem(queueItem.id, { status: 'error', error: '未找到技能文件' })
        storage.addFailureRecord({ type: 'download', skillId: skill.id, skillName: skill.name, error: '未找到技能文件' })
        downloading.value.delete(skill.id)
        return
      }
      skillSourceDir = matchSkillDir(allSkillDirs, skill.name) || (await pickSkillDir(allSkillDirs))
    }
    if (!skillSourceDir) {
      showToast('未找到技能文件', 'error')
      updateItem(queueItem.id, { status: 'error', error: '未找到技能文件' })
      storage.addFailureRecord({ type: 'download', skillId: skill.id, skillName: skill.name, error: '未找到技能文件' })
      downloading.value.delete(skill.id)
      return
    }
    const targetDir = window.services.pathJoin(window.ztools.getPath('userData'), 'skills-repo', skill.id)
    window.services.removeFile(targetDir); window.services.mkdir(targetDir); window.services.copyFile(skillSourceDir, targetDir)
    window.services.saveSkillMetaAfterDownload(skill.repo || '', skill.branch || 'main', storage.getSettings().githubToken || undefined, targetDir)
    window.services.removeFile(extractDir)
    const skillFile = ['SKILL.md', 'skill.md'].find((f) => window.services.pathExists(window.services.pathJoin(targetDir, f)))
    if (skillFile) {
      const parsed = window.services.parseSkillFile(window.services.pathJoin(targetDir, skillFile))
      if (parsed?.manifest) {
        if (parsed.manifest.name) skill.name = parsed.manifest.name
        if (parsed.manifest.description) skill.description = parsed.manifest.description
        storage.saveCachedSkills([{ ...skill, storeSourceId: activePresetId.value }], { forceStoreSourceId: true })
        const registry = loadRegistry()
        registerSkillFromStore(registry, skill.id, {
          name: skill.name,
          dir: targetDir,
          skillFile: window.services.pathJoin(targetDir, skillFile),
          content: '',
          manifest: parsed.manifest,
        }, activePresetId.value === 'skills-sh' ? 'skills-sh' : 'github', skill.repo || '')
      }
    }
    storage.addDownloadedId(skill.id); storage.addSessionDownload(skill.id, skill.name, activePresetId.value || 'unknown'); downloadedIds.value = storage.getDownloadedIds(); refreshCounts?.()
    autoTranslateSkill(skill, targetDir)
    updateItem(queueItem.id, { status: 'success' })
    showToast(`已导入 ${skill.name}`, 'success')
  } catch (err: any) {
    showToast('导入失败: ' + (err.message || '未知错误'), 'error')
    updateItem(queueItem.id, { status: 'error', error: err.message || '未知错误' })
    storage.addFailureRecord({ type: 'download', skillId: skill.id, skillName: skill.name, error: err.message || '未知错误' })
  }
  downloading.value.delete(skill.id)
}

function autoTranslateSkill(skill: Skill, targetDir: string) {
  const settings = storage.getSettings()
  if (!settings.autoTranslate) return
  if (!settings.translationModelId) return

  const desc = skill.description
  if (desc && !isChineseContent(desc)) {
    const dh = window.services.hashContent(desc)
    addTranslation(dh, 'desc', skill.name)
  }

  const skillFile = ['SKILL.md', 'skill.md'].find(f =>
    window.services.pathExists(window.services.pathJoin(targetDir, f))
  )
  if (skillFile) {
    const content = window.services.readFile(window.services.pathJoin(targetDir, skillFile))
    if (content && !isChineseContent(content)) {
      const ch = computeContentHash(content)
      addTranslation(ch, 'content', skill.name)
    }
  }
}

function confirmDelete(skill: Skill) {
  skillToDelete.value = skill
  showConfirmDelete.value = true
}

async function executeDelete() {
  const skill = skillToDelete.value
  if (!skill) return
  showConfirmDelete.value = false
  skillToDelete.value = null
  try {
    const targetDir = window.services.pathJoin(window.ztools.getPath('userData'), 'skills-repo', skill.id)
    window.services.removeFile(targetDir)
    storage.removeDownloadedId(skill.id)
    storage.removeAllForSkill(skill.id)
    storage.removeSkillFromCache(skill.id)
    const registry = loadRegistry()
    removeFromRegistry(registry, skill.name)
    downloadedIds.value = storage.getDownloadedIds()
    installRecords.value = storage.getInstallRecords()
    refreshCounts?.()
    showToast(`已删除 ${skill.name}`, 'info')
  } catch (err: any) {
    showToast('删除失败: ' + (err.message || '未知错误'), 'error')
  }
}

const sourceSubtitle = computed(() => {
  const preset = getActivePreset()
  if (!preset) return '浏览和下载技能'
  if ('desc' in preset && preset.desc) return preset.desc
  const typeLabels: Record<string, string> = { 'marketplace-json': 'Marketplace JSON 源', 'git-repo': 'Git 仓库源', 'local-dir': '本地目录源' }
  return typeLabels[(preset as StoreSource).type] || preset.name || '浏览和下载技能'
})

const sourceItems = computed(() =>
  storeSources.value.map((s) => ({
    id: s.id,
    label: s.label,
    deletable: (s as any).deletable,
  })),
)

function isSvgIcon(icon: string): boolean {
  return icon.startsWith('<svg')
}

function getSourceIcon(id: string): string | undefined {
  const icon = storeSources.value.find(s => s.id === id)?.icon
  if (!icon) return undefined
  if (isStoreIconKey(icon)) return resolveStoreIcon(icon)
  const renderType = getIconRenderType(icon)
  if (renderType === 'local-path') {
    return localIconCache.value[id] || icon
  }
  return icon
}

function onDeleteStore(id: string) {
  const source = storage.getStoreSources().find(s => s.id === id)
  if (source) {
    storeToDelete.value = { id, name: source.name }
    showDeleteStoreConfirm.value = true
  }
}

function openAddStoreModal() {
  editingStoreSource.value = null
  showStoreConfigModal.value = true
}

function openEditStoreModal(id: string) {
  const source = storage.getStoreSources().find(s => s.id === id)
  if (source) {
    editingStoreSource.value = source
    showStoreConfigModal.value = true
  }
}

function onStoreConfigSaved() {
  _storeVersion.value++
  if (!editingStoreSource.value) {
    const sources = storage.getStoreSources()
    if (sources.length) {
      const latest = sources[sources.length - 1]
      activePresetId.value = latest.id
      storage.savePageState('skill-store', { presetId: latest.id })
      fetchCurrentSkills()
      emit('navigate', 'store', { sub: latest.id })
    }
  }
}

const isCurrentStoreCustom = computed(() => {
  void _storeVersion.value
  return storage.getStoreSources().some(s => s.id === activePresetId.value)
})

function confirmDeleteStore() {
  if (!storeToDelete.value) return
  storage.removeStoreSource(storeToDelete.value.id)
  _storeVersion.value++
  showDeleteStoreConfirm.value = false
  storeToDelete.value = null
}
</script>

<template>
  <div class="skill-store">
    <div class="page-header">
      <div class="header-left">
        <div class="header-title-row">
          <h2>Skill 商店</h2>
          <span v-if="searchActive" class="count-badge">{{ searchResults.length }} 个结果</span>
          <span v-else class="count-badge">{{ totalCount || sourceSkills.length }}</span>
        </div>
        <p class="page-subtitle">{{ sourceSubtitle }}</p>
      </div>
      <div class="header-toolbar-wrapper">
        <div class="header-toolbar">
          <button v-if="isCurrentStoreCustom" class="toolbar-btn add-store-edit-btn" @click="openEditStoreModal(activePresetId)" title="编辑商店配置">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            编辑商店
          </button>
          <button class="add-store-btn" @click="openAddStoreModal" title="添加商店">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            添加商店
          </button>
          <div class="view-toggle">
            <button :class="{ active: viewMode === 'grid' }" @click="viewMode = 'grid'" title="网格视图">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
              </svg>
            </button>
            <button :class="{ active: viewMode === 'list' }" @click="viewMode = 'list'" title="列表视图">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
            </button>
          </div>
          <button class="toolbar-icon-btn" :class="{ active: fetchGitHubDesc }" @click="fetchGitHubDesc = !fetchGitHubDesc; storage.savePageState('skill-store', { presetId: activePresetId, fetchGitHubDesc: fetchGitHubDesc }); if (fetchGitHubDesc && activePresetId === 'skills-sh') setupDescriptionObserver(); else if (scrollObserver) { scrollObserver.disconnect(); scrollObserver = null }" :title="fetchGitHubDesc ? 'GitHub 描述：已开启' : 'GitHub 描述：已关闭'">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
          </button>
          <button class="toolbar-icon-btn" :disabled="loading" @click="fetchCurrentSkills(true)" title="刷新">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
          <button class="toolbar-icon-btn" @click="toggleTheme" :title="isDarkMode ? '切换亮色模式' : '切换暗色模式'">
            <svg v-if="isDarkMode" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
            </svg>
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <div class="ss-filter-row">
      <QuickSwitcher
        :items="sourceItems"
        :selected-id="activePresetId"
        placeholder="搜索商店..."
        add-label="添加商店"
        :show-add="true"
        @select="(id) => { activePresetId = id; searchQuery = ''; searchActive = false; searchResults = []; filterTab = 'all'; leaderboardFilter = 'all'; sourceSkills = []; error = ''; storage.savePageState('skill-store', { presetId: id }); fetchCurrentSkills(); emit('navigate', 'store', { sub: id }) }"
        @add="openAddStoreModal"
        @delete="onDeleteStore"
      >
        <template #trigger-prefix="{ item }">
          <span class="qs-trigger-icon" v-if="item">
            <ProviderIcon v-if="getSourceIcon(item.id) && isProviderIcon(getSourceIcon(item.id)!)" :icon="getSourceIcon(item.id)!" :size="16" />
            <img v-else-if="getSourceIcon(item.id) && !isSvgIcon(getSourceIcon(item.id)!)" :src="getSourceIcon(item.id)!" :alt="item.label" width="16" height="16" />
            <span v-else v-html="getSourceIcon(item.id)"></span>
          </span>
        </template>
        <template #item-prefix="{ item }">
          <span class="qs-item-icon">
            <ProviderIcon v-if="getSourceIcon(item.id) && isProviderIcon(getSourceIcon(item.id)!)" :icon="getSourceIcon(item.id)!" :size="16" />
            <img v-else-if="getSourceIcon(item.id) && !isSvgIcon(getSourceIcon(item.id)!)" :src="getSourceIcon(item.id)!" :alt="item.label" width="16" height="16" />
            <span v-else v-html="getSourceIcon(item.id)"></span>
          </span>
        </template>
      </QuickSwitcher>
      <div class="ss-search-wrapper">
        <div class="ss-search-inner">
          <svg class="ss-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input v-model="searchQuery" type="text" placeholder="搜索技能..." class="ss-search-input" @keyup.enter="activePresetId === 'skills-sh' ? onSearch() : null" />
          <button v-if="searchQuery" class="ss-search-clear" @click="searchQuery = ''; exitSearch()">×</button>
          <button class="ss-search-btn" @click="activePresetId === 'skills-sh' ? onSearch() : null">搜索</button>
        </div>
      </div>
    </div>

    <div v-if="activePresetId === 'skills-sh' && !searchActive" class="filter-tabs">
      <button v-for="f in skillsSh.LEADERBOARD_FILTERS" :key="f.key" class="tab-btn" :class="{ active: leaderboardFilter === f.key }" @click="onLeaderboardFilterChange(f.key)">
        {{ f.label }}
      </button>
    </div>
    <div v-else-if="activePresetId !== 'skills-sh'" class="filter-tabs">
      <button class="tab-btn" :class="{ active: filterTab === 'all' }" @click="filterTab = 'all'">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        全部
        <span class="tab-count">{{ categoryCounts.all }}</span>
      </button>
      <button v-for="cat in ALL_CATEGORIES" :key="cat" class="tab-btn" :class="{ active: filterTab === cat }" @click="filterTab = cat">
        {{ CATEGORY_ICONS[cat] }} {{ SKILL_CATEGORIES[cat].label }}
        <span class="tab-count">{{ categoryCounts[cat] || 0 }}</span>
      </button>
    </div>

    <div ref="storeScrollRef" class="ss-scroll" @scroll="onStoreScroll">
      <template v-if="searchActive">
        <div v-if="loading" class="section">
          <div class="section-header"><h3>搜索结果</h3><span class="section-count loading-dots">{{ loadingDots }}</span></div>
          <div class="load-more-hint"><div class="spinner small"></div><span>正在搜索...</span></div>
        </div>
        <div v-else-if="error" class="error-box">
          ⚠ {{ error }}
        </div>
        <div v-else class="section">
          <div class="section-header">
            <h3>搜索结果</h3>
            <span class="section-count">{{ searchResults.length }}</span>
            <button class="search-exit-btn" @click="exitSearch">← 返回</button>
          </div>
          <div v-if="!searchResults.length" class="empty-state">
            <div class="empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            </div>
            <h3 class="empty-title">未找到匹配的技能</h3>
            <p class="empty-desc">尝试其他关键词搜索。</p>
          </div>
          <div v-else class="skill-grid" :class="viewMode">
            <SkillCard
              v-for="(skill, idx) in visibleSearchResults"
              :key="skill.id"
              :data-skill-id="skill.id"
              :name="skill.name"
              :description="skill.description"
              :short-description="skill.shortDescription"
              :loading-description="loadingDescIds.has(skill.id)"
              :avatar-icon="skill.iconUrl"
              :source-tag="currentSource ? { label: currentSource.label || getActivePreset()?.name || '', icon: currentSource.icon || '', color: 'hsl(var(--primary))', bg: 'hsl(var(--primary) / 0.1)' } : null"
              @click="selectedSkill = skill"
            >
              <template #actions>
                <a v-if="getSkillUrl(skill)" :href="getSkillUrl(skill)" target="_blank" class="card-action-btn" title="打开链接" @click.stop>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>
                <button v-if="isDownloaded(skill.id)" class="card-action-btn danger" title="删除" @click.stop="confirmDelete(skill)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
                <button v-else class="card-action-btn" :disabled="isDownloading(skill.id) || !skillsSh.isGitHubSkill(skill)" @click.stop="downloadSkill(skill)">
                  <svg v-if="isDownloading(skill.id)" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </button>
              </template>
            </SkillCard>
          </div>
        </div>
      </template>

      <template v-else-if="isLocalSearchActive">
        <div class="section">
          <div class="section-header">
            <h3>搜索结果</h3>
            <span class="section-count">{{ localSearchResults.length }}</span>
            <button class="search-exit-btn" @click="searchQuery = ''">← 返回</button>
          </div>
          <div v-if="!localSearchResults.length" class="empty-state">
            <div class="empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            </div>
            <h3 class="empty-title">未找到匹配的技能</h3>
            <p class="empty-desc">尝试其他关键词搜索。</p>
          </div>
          <div v-else class="skill-grid" :class="viewMode">
            <SkillCard
              v-for="(skill, idx) in visibleLocalSearchResults"
              :key="skill.id"
              :name="skill.name"
              :description="skill.description"
              :short-description="skill.shortDescription"

              :avatar-icon="skill.iconUrl"
              :source-tag="currentSource ? { label: currentSource.label || getActivePreset()?.name || '', icon: currentSource.icon || '', color: 'hsl(var(--primary))', bg: 'hsl(var(--primary) / 0.1)' } : null"
              @click="selectedSkill = skill"
            >
              <template #actions>
                <a v-if="getSkillUrl(skill)" :href="getSkillUrl(skill)" target="_blank" class="card-action-btn" title="打开链接" @click.stop>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>
                <button v-if="isDownloaded(skill.id)" class="card-action-btn danger" title="删除" @click.stop="confirmDelete(skill)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
                <button v-else class="card-action-btn" :disabled="isDownloading(skill.id)" @click.stop="downloadSkill(skill)">
                  <svg v-if="isDownloading(skill.id)" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </button>
              </template>
            </SkillCard>
          </div>
        </div>
      </template>

      <template v-else>
        <div v-if="importedSkills.length" class="section">
          <div class="section-header"><h3>已导入</h3><span class="section-count">{{ importedSkills.length }}</span></div>
          <div class="skill-grid" :class="viewMode">
            <SkillCard
              v-for="(skill, idx) in visibleImportedSkills"
              :key="skill.id"
              :data-skill-id="skill.id"
              :name="skill.name"
              :description="skill.description"
              :short-description="skill.shortDescription"
              :loading-description="loadingDescIds.has(skill.id)"

              :avatar-icon="skill.iconUrl"
              :show-chinese-tag="isChineseContent(skill.description || '')"
              :show-translated-tag="getLanguageTags(skill).showTranslatedTag"
              :source-tag="currentSource ? { label: currentSource.label || getActivePreset()?.name || '', icon: currentSource.icon || '', color: 'hsl(142 50% 35%)', bg: 'hsl(142 50% 50% / 0.25)' } : null"
              @click="selectedSkill = skill"
            >
              <template #actions>
                <a v-if="getSkillUrl(skill)" :href="getSkillUrl(skill)" target="_blank" class="card-action-btn" title="打开链接" @click.stop>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>
                <button class="card-action-btn danger" title="删除" @click.stop="confirmDelete(skill)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </template>
            </SkillCard>
          </div>
        </div>

        <div v-if="error" class="error-box">
          ⚠ {{ error }}<br>
          <button v-if="error.includes('速率限制')" class="error-settings-link" @click="emit('navigate', 'settings', { anchor: 'github-token-section' })">前往设置 →</button>
        </div>
        <div v-else-if="!loading && !sourceSkills.length && !totalCount && !importedSkills.length" class="empty-state">
          <div class="empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </div>
          <h3 class="empty-title">暂无可用技能</h3>
          <p class="empty-desc">当前商店中没有找到技能，尝试切换商店源或调整筛选条件。</p>
        </div>

        <template v-else>
          <div class="section">
            <div class="section-header"><h3>可用</h3><span class="section-count">{{ availableSkillsAll.length }}</span></div>
            <div class="skill-grid" :class="viewMode">
              <SkillCard
                v-for="skill in availableSkills"
                :key="skill.id"
                :data-skill-id="skill.id"
              :name="skill.name"
              :description="skill.description"
              :short-description="skill.shortDescription"
              :loading-description="loadingDescIds.has(skill.id)"
              :avatar-icon="skill.iconUrl"
              :source-tag="currentSource ? { label: currentSource.label || getActivePreset()?.name || '', icon: currentSource.icon || '', color: 'hsl(var(--primary))', bg: 'hsl(var(--primary) / 0.1)' } : null"
              @click="selectedSkill = skill"
            >
              <template #actions>
                <a v-if="getSkillUrl(skill)" :href="getSkillUrl(skill)" target="_blank" class="card-action-btn" title="打开链接" @click.stop>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  </a>
                  <button class="card-action-btn" :disabled="isDownloading(skill.id) || !skillsSh.isGitHubSkill(skill)" @click.stop="downloadSkill(skill)">
                    <svg v-if="isDownloading(skill.id)" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  </button>
                </template>
              </SkillCard>
            </div>
          </div>

          <div v-if="loading" class="load-more-hint"><div class="spinner small"></div><span>正在加载内容...</span></div>
        </template>
      </template>
    </div>
  </div>
  <SkillDetailModal v-if="selectedSkill" :skill="selectedSkill" @close="selectedSkill = null" @imported="onModalImported" />
  <SkillPickModal v-if="showPickModal" :skills="pickSkills" @select="handlePickSelect" @close="handlePickCancel" />
  <ConfirmModal
    v-if="showDeleteStoreConfirm"
    title="删除商店"
    :message="`确定要删除商店 <strong>${storeToDelete?.name}</strong> 吗？`"
    @confirm="confirmDeleteStore"
    @cancel="showDeleteStoreConfirm = false; storeToDelete = null"
  />
  <StoreConfigModal
    v-if="showStoreConfigModal"
    :edit-source="editingStoreSource"
    @close="showStoreConfigModal = false; editingStoreSource = null"
    @saved="onStoreConfigSaved"
  />
  <div v-if="showConfirmDelete" class="modal-overlay" @click.self="showConfirmDelete = false">
    <div class="modal confirm-modal">
      <div class="modal-header">
        <h3 class="modal-title">确认删除</h3>
        <button class="modal-close" @click="showConfirmDelete = false">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <p class="confirm-modal-msg">确认删除 "<strong>{{ skillToDelete?.name }}</strong>"？<br>此操作将从本地移除该技能。</p>
      <div class="modal-footer">
        <button class="modal-btn cancel" @click="showConfirmDelete = false">取消</button>
        <button class="modal-btn confirm" @click="executeDelete">确认删除</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.skill-store { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 0; }

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 22px 28px 16px;
  background: hsl(var(--card));
  border-bottom: 1px solid hsl(var(--border));
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.header-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-left h2 {
  font-size: 22px;
  font-weight: 600;
  color: hsl(var(--foreground));
  margin: 0;
}

.page-subtitle {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
}

.count-badge {
  font-size: 11px;
  font-weight: 600;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--accent));
  padding: 2px 8px;
  border-radius: 10px;
}

.header-toolbar-wrapper {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.header-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.toolbar-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: hsl(var(--card));
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
}

.add-store-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
  white-space: nowrap;
}

.add-store-btn:hover {
  box-shadow: 0 4px 12px hsl(var(--primary) / 0.3);
}

.toolbar-icon-btn:hover {
  background: hsl(var(--accent));
  color: hsl(var(--foreground));
}

.toolbar-icon-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.toolbar-icon-btn.active {
  background: hsl(var(--primary) / 0.15);
  color: hsl(var(--primary));
  border-color: hsl(var(--primary) / 0.3);
}

.view-toggle {
  display: flex;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  overflow: hidden;
}

.view-toggle button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: hsl(var(--card));
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
}

.view-toggle button + button {
  border-left: 1px solid hsl(var(--border));
}

.view-toggle button:hover {
  background: hsl(var(--accent));
  color: hsl(var(--foreground));
}

.view-toggle button.active {
  background: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
}



.toolbar-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 8px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--card));
  color: hsl(var(--foreground));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
  white-space: nowrap;
}

.toolbar-btn:hover {
  background: hsl(var(--accent));
  border-color: hsl(var(--primary) / 0.3);
}

.toolbar-btn.add-store-edit-btn {
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  border-color: transparent;
}

.toolbar-btn.add-store-edit-btn:hover {
  background: hsl(var(--primary) / 0.9);
}

.ss-filter-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 28px 0;
  flex-wrap: wrap;
}

.ss-filter-row .quick-switcher {
  width: 240px;
  flex-shrink: 0;
}

.qs-item-icon {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.qs-item-icon img,
.qs-item-icon :deep(svg) {
  width: 18px;
  height: 18px;
  object-fit: contain;
  border-radius: 4px;
}

.qs-trigger-icon {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.qs-trigger-icon img,
.qs-trigger-icon :deep(svg) {
  width: 22px;
  height: 22px;
  object-fit: contain;
  border-radius: 4px;
}

.ss-search-wrapper {
  flex: 1;
  min-width: 200px;
}

.ss-search-inner {
  display: flex;
  align-items: center;
  gap: 0;
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
  background: hsl(var(--card));
  overflow: hidden;
  transition: all var(--duration-base) var(--ease-standard);
}

.ss-search-inner:focus-within {
  border-color: hsl(var(--ring));
  box-shadow: 0 0 0 3px hsl(var(--ring) / 0.12);
}

.ss-search-icon {
  margin-left: 12px;
  color: hsl(var(--muted-foreground));
  flex-shrink: 0;
}

.ss-search-input {
  flex: 1;
  padding: 8px 10px;
  font-size: 13px;
  border: none;
  background: transparent;
  color: hsl(var(--foreground));
  outline: none;
  font-family: inherit;
}

.ss-search-input::placeholder { color: hsl(var(--muted-foreground)); }

.ss-search-btn {
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  border: none;
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
}

.ss-search-btn:hover { opacity: 0.9; }

.ss-search-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-right: 4px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: hsl(var(--muted-foreground));
  font-size: 16px;
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
  flex-shrink: 0;
}

.ss-search-clear:hover {
  background: hsl(var(--accent));
  color: hsl(var(--foreground));
}

.filter-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 12px 12px 0 28px;
  flex-wrap: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
}

.filter-tabs::-webkit-scrollbar {
  display: none;
}

.tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
  white-space: nowrap;
  flex-shrink: 0;
}

.tab-btn:hover {
  background: hsl(var(--accent));
  color: hsl(var(--foreground));
}

.tab-btn.active {
  background: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
  font-weight: 600;
}

.tab-count {
  font-size: 11px;
  font-weight: 600;
  padding: 0 4px;
  border-radius: 6px;
  background: hsl(var(--muted) / 0.6);
  color: hsl(var(--muted-foreground));
  line-height: 1.6;
}

.tab-btn.active .tab-count {
  background: hsl(var(--primary) / 0.15);
  color: hsl(var(--primary));
}

.ss-scroll { flex: 1; overflow-y: auto; overscroll-behavior: contain; min-height: 0; padding: 20px 28px 28px; scrollbar-gutter: stable; }

.section { margin-bottom: 20px; }
.section-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.section-header h3 { font-size: 14px; font-weight: 700; color: hsl(var(--foreground)); margin: 0; }
.section-count { font-size: 10px; font-weight: 600; padding: 1px 8px; border-radius: 6px; background: hsl(var(--primary) / 0.1); color: hsl(var(--primary)); }
.section-count.loading-dots { min-width: 24px; text-align: center; font-variant-numeric: tabular-nums; letter-spacing: 1px; }
.search-exit-btn { margin-left: auto; font-size: 12px; padding: 4px 12px; border-radius: 6px; background: hsl(var(--primary) / 0.1); color: hsl(var(--primary)); border: none; cursor: pointer; transition: background var(--duration-base) var(--ease-standard); }
.search-exit-btn:hover { background: hsl(var(--primary) / 0.2); }

.skill-grid { display: grid; }
.skill-grid.grid { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
.skill-grid.list { grid-template-columns: 1fr; gap: 10px; }

.loading { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 32px; color: hsl(var(--muted-foreground)); font-size: 13px; }
.spinner { width: 16px; height: 16px; border: 2px solid hsl(var(--border)); border-top-color: hsl(var(--primary)); border-radius: 50%; animation: spin 0.7s linear infinite; }
.spinner.small { width: 12px; height: 12px; }
@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin 0.7s linear infinite; }

.scroll-sentinel { height: 1px; }
.load-more-hint { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 16px; color: hsl(var(--muted-foreground)); font-size: 12px; }
.error-box { text-align: center; padding: 16px; color: hsl(var(--destructive)); background: hsl(var(--destructive) / 0.08); border-radius: var(--radius); border: 1px solid hsl(var(--destructive) / 0.2); }
.error-settings-link { display: inline-block; margin-top: 8px; padding: 6px 16px; font-size: 13px; font-weight: 500; color: #fff; background: hsl(var(--primary)); border: none; border-radius: 8px; cursor: pointer; transition: opacity var(--duration-base) var(--ease-standard); }
.error-settings-link:hover { opacity: 0.85; }

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 28px;
  color: hsl(var(--muted-foreground));
  text-align: center;
}

.empty-icon { margin-bottom: 16px; color: hsl(var(--muted-foreground) / 0.5); }
.empty-title { font-size: 16px; font-weight: 600; color: hsl(var(--foreground)); margin: 0 0 8px; }
.empty-desc { font-size: 13px; color: hsl(var(--muted-foreground)); margin: 0 0 20px; max-width: 360px; line-height: 1.5; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: hsl(0 0% 0% / 0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(4px); }
.modal { width: 400px; max-width: 90vw; background: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: 20px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 24px 64px hsl(0 0% 0% / 0.2); }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 0; }
.modal-title { font-size: 18px; font-weight: 700; color: hsl(var(--foreground)); margin: 0; }
.modal-close { width: 32px; height: 32px; border-radius: 8px; border: none; background: transparent; color: hsl(var(--muted-foreground)); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all var(--duration-base) var(--ease-standard); }
.modal-close:hover { background: hsl(var(--muted)); color: hsl(var(--foreground)); }
.modal-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 16px 24px; border-top: 1px solid hsl(var(--border)); }
.modal-btn { padding: 9px 20px; font-size: 13px; font-weight: 600; border-radius: 10px; border: none; cursor: pointer; transition: all var(--duration-base) var(--ease-standard); display: flex; align-items: center; gap: 6px; }
.modal-btn.cancel { background: hsl(var(--muted)); color: hsl(var(--muted-foreground)); }
.modal-btn.cancel:hover { background: hsl(var(--muted) / 0.8); }
.modal-btn.confirm { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); }
.modal-btn.confirm:hover { opacity: 0.9; }
.confirm-modal { padding-bottom: 0; }
.confirm-modal-msg { font-size: 14px; line-height: 1.6; color: hsl(var(--foreground)); padding: 20px 24px; margin: 0; }
.confirm-modal-msg strong { color: hsl(var(--primary)); }
</style>

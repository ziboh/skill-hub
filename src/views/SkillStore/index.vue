<script setup lang="ts">
import { ref, onMounted, onActivated, onDeactivated, watch, inject, onUnmounted, nextTick } from 'vue'
import { KeyRefreshCounts, KeyShowToast, KeyBumpDownloadedSkillsVersion } from '../../inject-keys'
import { storage } from '../../utils/storage'
import { fetchGitHubFile, setGitHubResponseCacheEnabled } from '../../utils/github'
import { parseFrontmatter } from '../../utils/frontmatter'
import * as skillsSh from '../../utils/skills-sh'
import type { Skill, StoreSource } from '../../types'

import SkillDetailModal from '../../components/SkillDetailModal.vue'
import SkillPickModal from '../../components/SkillPickModal.vue'
import ConfirmModal from '../../components/ConfirmModal.vue'
import StoreConfigModal from '../../components/StoreConfigModal.vue'
import StoreHeader from '../../components/StoreHeader.vue'
import StoreFilters from '../../components/StoreFilters.vue'
import StoreSkillCard from '../../components/StoreSkillCard.vue'
import UiIcon from '../../components/UiIcon.vue'

import { useTheme } from '../../composables/useTheme'
import { useStoreSkills } from '../../composables/useStoreSkills'
import { useStoreDownload } from '../../composables/useStoreDownload'
import { withTimeout } from '../../utils/with-timeout'

const props = defineProps<{ storeId: string }>()
const emit = defineEmits(['navigate'])
const refreshCounts = inject(KeyRefreshCounts)
const showToast = inject(KeyShowToast, () => {})
const bumpDownloadedSkillsVersion = inject(KeyBumpDownloadedSkillsVersion, () => {})

const { isDarkMode, toggleTheme } = useTheme()
const viewMode = ref<'grid' | 'list'>('grid')
const cacheEnabled = ref(storage.getSettings().storeCacheEnabled !== false)

const {
  activePresetId,
  currentSource,
  getActivePreset,
  searchQuery,
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
  githubManifestMap,
  githubRepoInfo,
  fetchedDescIds,
  loadingDescIds,
  failedDescIds,
  loadingDots,
  stopLoadingDots,
  resetVisibleCount,
  growVisibleCount,
  fetchCurrentSkills: fetchSkillsCore,
  onLeaderboardFilterChange,
  isLocalSearchActive,
  localSearchResults,
  visibleSearchResults,
  visibleLocalSearchResults,
  getLanguageTags,
  importedSkills,
  visibleImportedSkills,
  availableSkills,
  availableSkillsAll,
  getDownloadedElsewhereBadges,
  getDownloadedSkill,
  categoryCounts,
  isDownloading,
  onSearch,
  exitSearch,
  isDownloaded,
  refreshDownloadedIds,
  sourceSubtitle,
  sourceItems,
  getSourceIcon,
  isCurrentStoreCustom,
  bumpStoreVersion,
  clearSearchDebounce,
} = useStoreSkills({
  storeId: () => props.storeId,
  showToast: showToast as any,
  onNavigate: (route, params) => emit('navigate', route, params),
})

const selectedSkill = ref<Skill | null>(null)
const showDeleteStoreConfirm = ref(false)
const storeToDelete = ref<{ id: string; name: string } | null>(null)
const showStoreConfigModal = ref(false)
const editingStoreSource = ref<StoreSource | null>(null)
type GitHubRepoInfo = NonNullable<typeof githubRepoInfo.value>

function locateInMySkills(skill: Skill) {
  emit('navigate', 'my', { targetSkillId: getDownloadedSkill(skill)?.id || skill.id })
}

const {
  showPickModal,
  pickSkills,
  handlePickSelect,
  handlePickCancel,
  showConfirmDelete,
  skillToDelete,
  confirmDelete,
  executeDelete,
  downloadSkill,
  getSkillUrl,
} = useStoreDownload({
  activePresetId,
  downloadedIds,
  isDownloading,
  refreshDownloadedIds,
  showToast: showToast as any,
  refreshCounts: refreshCounts as any,
  bumpDownloadedSkillsVersion: bumpDownloadedSkillsVersion as any,
})

function confirmMatchedDelete(skill: Skill) {
  confirmDelete(getDownloadedSkill(skill) || skill)
}

let scrollObserver: IntersectionObserver | null = null
let initialActivation = true
let visibleDescriptionTimer: ReturnType<typeof setTimeout> | null = null
let githubDescriptionRequestSeq = 0
const githubDescriptionRequestTokens = new Map<string, number>()

function beginGitHubDescriptionRequest(skillId: string): number {
  const token = ++githubDescriptionRequestSeq
  githubDescriptionRequestTokens.set(skillId, token)
  loadingDescIds.value = new Set([...loadingDescIds.value, skillId])
  return token
}

function isActiveGitHubDescriptionRequest(skillId: string, token: number): boolean {
  return githubDescriptionRequestTokens.get(skillId) === token
}

function finishGitHubDescriptionRequest(skillId: string, token: number) {
  if (!isActiveGitHubDescriptionRequest(skillId, token)) return
  githubDescriptionRequestTokens.delete(skillId)
  loadingDescIds.value = new Set([...loadingDescIds.value].filter((id) => id !== skillId))
}

function scheduleVisibleDescriptionRequest(retries = 2) {
  if (visibleDescriptionTimer) clearTimeout(visibleDescriptionTimer)
  visibleDescriptionTimer = setTimeout(() => {
    visibleDescriptionTimer = null
    const layoutReady = requestVisibleDescriptions()
    if (!layoutReady && retries > 0) scheduleVisibleDescriptionRequest(retries - 1)
    else if (!layoutReady) requestRenderedDescriptions()
  }, retries === 2 ? 0 : 80)
}

function ensureDescriptionObserver() {
  if (scrollObserver) {
    scrollObserver.disconnect()
    scrollObserver = null
  }
  if (activePresetId.value === 'skills-sh') {
    nextTick(setupDescriptionObserver)
  } else if (githubRepoInfo.value) {
    nextTick(setupGitHubDescriptionObserver)
  }
  nextTick(scheduleVisibleDescriptionRequest)
}

function stopDescriptionObserver() {
  if (scrollObserver) {
    scrollObserver.disconnect()
    scrollObserver = null
  }
  if (visibleDescriptionTimer) {
    clearTimeout(visibleDescriptionTimer)
    visibleDescriptionTimer = null
  }
}

function resetAndObserve() {
  resetVisibleCount()
  stopDescriptionObserver()
}

function growAndObserve() {
  const grew = growVisibleCount()
  if (grew) ensureDescriptionObserver()
  return grew
}

function onStoreScroll(e: Event) {
  const el = e.currentTarget as HTMLElement
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 600) growAndObserve()
  requestVisibleDescriptions()
}

function fillViewport() {
  const el = storeScrollRef.value
  if (!el) return
  let guard = 0
  while (el.scrollHeight <= el.clientHeight + 600 && growAndObserve() && guard++ < 20) {
    /* fill viewport */
  }
}

function fetchCurrentSkills(force = false) {
  resetAndObserve()
  fetchSkillsCore(force)
  nextTick(() => {
    if (activePresetId.value === 'skills-sh') setupDescriptionObserver()
    else if (githubRepoInfo.value) setupGitHubDescriptionObserver()
  })
}

watch(
  () => props.storeId,
  (id) => {
    if (id === activePresetId.value) return
    activePresetId.value = id
    searchQuery.value = ''
    searchActive.value = false
    searchResults.value = []
    filterTab.value = 'all'
    leaderboardFilter.value = 'all'
    sourceSkills.value = []
    error.value = ''
    loading.value = false
    resetAndObserve()
    fetchCurrentSkills()
  },
)

// After async loads finish, attach lazy-desc observers
watch([loading, allEntries], () => {
  if (loading.value) return
  ensureDescriptionObserver()
})

async function requestSkillsShDescription(skill: Skill): Promise<void> {
  const skillId = skill.id
  if (fetchedDescIds.value.has(skillId) || loadingDescIds.value.has(skillId) || skill.description || skill.shortDescription) return

  loadingDescIds.value = new Set([...loadingDescIds.value, skillId])
  try {
    const desc = await skillsSh.fetchSkillDescriptionFromSh(skill)
    if (desc && activePresetId.value === 'skills-sh') {
      skill.shortDescription = desc
      if (cacheEnabled.value) storage.saveGitHubSkills([{ ...skill, storeSourceId: activePresetId.value }])
    }
    if (activePresetId.value === 'skills-sh') fetchedDescIds.value = new Set([...fetchedDescIds.value, skillId])
  } catch {} finally {
    loadingDescIds.value = new Set([...loadingDescIds.value].filter((id) => id !== skillId))
  }
}

function requestVisibleDescriptions(): boolean {
  const container = storeScrollRef.value
  if (!container) return false
  const rootRect = container.getBoundingClientRect()
  if (rootRect.height <= 0) return false

  const cards = Array.from(container.querySelectorAll<HTMLElement>('[data-skill-id]'))
  if (!cards.length) return false

  let hasVisibleCard = false
  cards.forEach((card) => {
    const cardRect = card.getBoundingClientRect()
    if (cardRect.bottom <= rootRect.top || cardRect.top >= rootRect.bottom) return
    hasVisibleCard = true
    const skillId = card.getAttribute('data-skill-id')
    if (!skillId || fetchedDescIds.value.has(skillId) || loadingDescIds.value.has(skillId)) return

    if (activePresetId.value === 'skills-sh') {
      const skill = allEntries.value.find((item) => item.id === skillId) || searchResults.value.find((item) => item.id === skillId)
      if (skill) void requestSkillsShDescription(skill)
      return
    }
    if (githubRepoInfo.value) void retryDescription(skillId)
  })
  return hasVisibleCard
}

function requestRenderedDescriptions(limit = 12): boolean {
  const container = storeScrollRef.value
  if (!container) return false
  const cards = Array.from(container.querySelectorAll<HTMLElement>('[data-skill-id]')).slice(0, limit)
  let requested = false

  cards.forEach((card) => {
    const skillId = card.getAttribute('data-skill-id')
    if (!skillId || fetchedDescIds.value.has(skillId) || loadingDescIds.value.has(skillId)) return

    if (activePresetId.value === 'skills-sh') {
      const skill = allEntries.value.find((item) => item.id === skillId) || searchResults.value.find((item) => item.id === skillId)
      if (!skill || skill.description || skill.shortDescription) return
      requested = true
      void requestSkillsShDescription(skill)
      return
    }

    const skill = allEntries.value.find((item) => item.id === skillId)
    if (!githubRepoInfo.value || !skill || skill.description || skill.shortDescription) return
    requested = true
    void retryDescription(skillId)
  })

  return requested
}

function setupDescriptionObserver() {
  if (scrollObserver) {
    scrollObserver.disconnect()
    scrollObserver = null
  }
  if (activePresetId.value !== 'skills-sh') return
  scrollObserver = new IntersectionObserver(
    async (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const skillId = entry.target.getAttribute('data-skill-id')
        if (!skillId || fetchedDescIds.value.has(skillId) || loadingDescIds.value.has(skillId)) continue
        const skill =
          allEntries.value.find((s) => s.id === skillId) ||
          searchResults.value.find((s) => s.id === skillId) ||
          importedSkills.value.find((s) => s.id === skillId)
        if (!skill) continue
        if (skill.description || skill.shortDescription) {
          fetchedDescIds.value.add(skillId)
          continue
        }
        void requestSkillsShDescription(skill)
        scrollObserver?.unobserve(entry.target)
      }
    },
    { root: storeScrollRef.value, threshold: 0.1 },
  )
  nextTick(() => {
    if (!scrollObserver) return
    const container = storeScrollRef.value
    if (!container) return
    container.querySelectorAll('[data-skill-id]').forEach((el) => scrollObserver?.observe(el))
    requestVisibleDescriptions()
    scheduleVisibleDescriptionRequest()
  })
}

function setupGitHubDescriptionObserver() {
  if (scrollObserver) {
    scrollObserver.disconnect()
    scrollObserver = null
  }
  if (!githubRepoInfo.value) return
  scrollObserver = new IntersectionObserver(
    async (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const skillId = entry.target.getAttribute('data-skill-id')
        if (!skillId || fetchedDescIds.value.has(skillId) || loadingDescIds.value.has(skillId)) continue
        const skill = allEntries.value.find((s) => s.id === skillId)
        if (!skill) continue
        if (skill.description) {
          fetchedDescIds.value = new Set([...fetchedDescIds.value, skillId])
          continue
        }
        const requestToken = beginGitHubDescriptionRequest(skillId)
        let requestContext: GitHubRepoInfo | null = null
        try {
          const manifestFile = githubManifestMap.get(skillId)
          if (!manifestFile) {
            continue
          }
          if (!githubRepoInfo.value) {
            continue
          }
          const { owner, repo, branch } = githubRepoInfo.value
          requestContext = githubRepoInfo.value
          const tk = storage.getSettings().githubToken || undefined
          const content = await withTimeout(
            (signal) => fetchGitHubFile(owner, repo, manifestFile, branch, tk, signal),
            20000,
          )
          const currentSkill =
            isActiveGitHubDescriptionRequest(skillId, requestToken) &&
            githubRepoInfo.value === requestContext &&
            activePresetId.value === requestContext.presetId
              ? allEntries.value.find((s) => s.id === skillId)
              : undefined
          if (currentSkill) {
            const fm = parseFrontmatter(content)
            if (fm.name) currentSkill.name = fm.name
            currentSkill.description = fm.description || ''
            currentSkill.author = fm.author || currentSkill.author
            currentSkill.tags = fm.tags
              ? fm.tags
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean)
              : currentSkill.tags
            currentSkill.readme = content
            fetchedDescIds.value = new Set([...fetchedDescIds.value, skillId])
            if (cacheEnabled.value) storage.saveGitHubSkills(allEntries.value.filter((s) => s.description))
          }
        } catch {
          if (isActiveGitHubDescriptionRequest(skillId, requestToken) && githubRepoInfo.value === requestContext) {
            failedDescIds.value = new Set([...failedDescIds.value, skillId])
            showToast({ type: 'warning', message: '技能描述加载失败，点击卡片可重试' })
          }
        } finally {
          finishGitHubDescriptionRequest(skillId, requestToken)
        }
        scrollObserver?.unobserve(entry.target)
      }
    },
    { root: storeScrollRef.value, threshold: 0.1 },
  )
  nextTick(() => {
    if (!scrollObserver) return
    const container = storeScrollRef.value
    if (!container) return
    container.querySelectorAll('[data-skill-id]').forEach((el) => scrollObserver?.observe(el))
    requestVisibleDescriptions()
    scheduleVisibleDescriptionRequest()
  })
}

async function retryDescription(skillId: string) {
  if (!githubRepoInfo.value) return
  if (fetchedDescIds.value.has(skillId) || loadingDescIds.value.has(skillId)) return
  const skill = allEntries.value.find((s) => s.id === skillId)
  if (!skill) return
  const manifestFile = githubManifestMap.get(skillId)
  if (!manifestFile) return
  const { owner, repo, branch } = githubRepoInfo.value
  const requestContext = githubRepoInfo.value
  const tk = storage.getSettings().githubToken || undefined

  failedDescIds.value = new Set([...failedDescIds.value].filter((id) => id !== skillId))
  const requestToken = beginGitHubDescriptionRequest(skillId)

  try {
    const content = await withTimeout(
      (signal) => fetchGitHubFile(owner, repo, manifestFile, branch, tk, signal),
      20000,
    )
    const currentSkill =
      isActiveGitHubDescriptionRequest(skillId, requestToken) &&
      githubRepoInfo.value === requestContext &&
      activePresetId.value === requestContext.presetId
        ? allEntries.value.find((s) => s.id === skillId)
        : undefined
    if (currentSkill) {
      const fm = parseFrontmatter(content)
      if (fm.name) currentSkill.name = fm.name
      currentSkill.description = fm.description || ''
      currentSkill.author = fm.author || currentSkill.author
      currentSkill.tags = fm.tags
        ? fm.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : currentSkill.tags
      currentSkill.readme = content
      fetchedDescIds.value = new Set([...fetchedDescIds.value, skillId])
      if (cacheEnabled.value) storage.saveGitHubSkills(allEntries.value.filter((s) => s.description))
    }
  } catch {
    if (isActiveGitHubDescriptionRequest(skillId, requestToken) && githubRepoInfo.value === requestContext) {
      failedDescIds.value = new Set([...failedDescIds.value, skillId])
      showToast({ type: 'warning', message: '技能描述加载失败' })
    }
  } finally {
    finishGitHubDescriptionRequest(skillId, requestToken)
  }
}

function onCardClick(skill: Skill) {
  if (failedDescIds.value.has(skill.id)) retryDescription(skill.id)
  selectedSkill.value = skill
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && (searchActive.value || isLocalSearchActive.value)) {
    searchQuery.value = ''
    exitSearch()
  }
}

onMounted(() => {
  refreshDownloadedIds()
  fetchCurrentSkills()
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', fillViewport)
  storage.enrichDownloadedDescriptions()
})
onActivated(() => {
  refreshDownloadedIds()
  storage.enrichDownloadedDescriptions()
  if (initialActivation) {
    initialActivation = false
    window.addEventListener('keydown', onKeydown)
    window.addEventListener('resize', fillViewport)
    nextTick(fillViewport)
    return
  }
  if (props.storeId !== activePresetId.value) {
    activePresetId.value = props.storeId
    storage.savePageState('skill-store', { presetId: props.storeId })
    resetAndObserve()
    fetchCurrentSkills()
  } else {
    exitSearch()
    resetAndObserve()
    fetchCurrentSkills()
  }
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', fillViewport)
  nextTick(fillViewport)
})
onDeactivated(() => {
  stopLoadingDots()
  stopDescriptionObserver()
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', fillViewport)
  clearSearchDebounce()
})
onUnmounted(() => {
  stopLoadingDots()
  stopDescriptionObserver()
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', fillViewport)
  clearSearchDebounce()
})

function onModalImported() {
  refreshDownloadedIds()
  selectedSkill.value = null
}

function onSelectStore(id: string) {
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
  emit('navigate', 'store', { sub: id })
}

function onClearSearch() {
  searchQuery.value = ''
  exitSearch()
}

function onToggleCache() {
  cacheEnabled.value = !cacheEnabled.value
  storage.saveSettings({ storeCacheEnabled: cacheEnabled.value })
  setGitHubResponseCacheEnabled(cacheEnabled.value)
  fetchCurrentSkills(true)
  showToast(cacheEnabled.value ? '商店缓存已开启' : '商店缓存已关闭', 'info')
}

function buildSourceTag(mode: 'available' | 'imported') {
  if (!currentSource.value) return null
  if (mode === 'imported') {
    return {
      label: currentSource.value.label || getActivePreset()?.name || '',
      icon: currentSource.value.icon || '',
      color: 'hsl(142 50% 35%)',
      bg: 'hsl(142 50% 50% / 0.25)',
    }
  }
  return {
    label: currentSource.value.label || getActivePreset()?.name || '',
    icon: currentSource.value.icon || '',
    color: 'hsl(var(--primary))',
    bg: 'hsl(var(--primary) / 0.1)',
  }
}

function getEmptyDescriptionReason(skill: Skill) {
  if (skill.description || skill.shortDescription) return ''
  if (loadingDescIds.value.has(skill.id)) return '正在加载描述'
  if (failedDescIds.value.has(skill.id)) return '描述加载失败'

  const canLazyLoad = activePresetId.value === 'skills-sh' || Boolean(githubRepoInfo.value)
  if (canLazyLoad && !fetchedDescIds.value.has(skill.id)) return ''

  if (skill.source === 'github') return '描述已读取但未解析成功'
  if (skill.source === 'skills-sh') return '详情页描述已读取但未解析成功'
  if (skill.source === 'marketplace-json') return 'Marketplace 索引不包含描述，等待详情加载'
  if (skill.source === 'well-known-index') return 'Well-Known 索引不包含描述，等待详情加载'
  if (skill.source === 'local') return '本地描述未解析成功'
  return '当前来源暂未返回描述'
}

function onDeleteStore(id: string) {
  const source = storage.getStoreSources().find((s) => s.id === id)
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
  const source = storage.getStoreSources().find((s) => s.id === id)
  if (source) {
    editingStoreSource.value = source
    showStoreConfigModal.value = true
  }
}

function onStoreConfigSaved() {
  bumpStoreVersion()
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

function confirmDeleteStore() {
  if (!storeToDelete.value) return
  storage.removeStoreSource(storeToDelete.value.id)
  bumpStoreVersion()
  showDeleteStoreConfirm.value = false
  storeToDelete.value = null
}
</script>

<template>
  <div class="skill-store">
    <StoreHeader
      :search-active="searchActive"
      :result-count="searchResults.length"
      :total-count="totalCount || sourceSkills.length"
      :source-subtitle="sourceSubtitle"
      :is-current-store-custom="isCurrentStoreCustom"
      :view-mode="viewMode"
      :loading="loading"
      :is-dark-mode="isDarkMode"
      :cache-enabled="cacheEnabled"
      @edit-store="openEditStoreModal(activePresetId)"
      @add-store="openAddStoreModal"
      @refresh="fetchCurrentSkills(true)"
      @toggle-theme="toggleTheme"
      @toggle-cache="onToggleCache"
      @update:view-mode="viewMode = $event"
    />

    <StoreFilters
      :source-items="sourceItems"
      :active-preset-id="activePresetId"
      :search-query="searchQuery"
      :leaderboard-filter="leaderboardFilter"
      :filter-tab="filterTab"
      :category-counts="categoryCounts"
      :search-active="searchActive"
      :get-source-icon="getSourceIcon"
      @select-store="onSelectStore"
      @add-store="openAddStoreModal"
      @delete-store="onDeleteStore"
      @update:search-query="searchQuery = $event"
      @search="onSearch"
      @clear-search="onClearSearch"
      @update:leaderboard-filter="onLeaderboardFilterChange"
      @update:filter-tab="filterTab = $event"
    />

    <div ref="storeScrollRef" class="ss-scroll" @scroll="onStoreScroll">
      <template v-if="searchActive">
        <div v-if="loading" class="section">
          <div class="section-header">
            <h3>搜索结果</h3>
            <span class="section-count loading-dots">{{ loadingDots }}</span>
          </div>
          <div class="load-more-hint">
            <div class="spinner small" />
            <span>正在搜索...</span>
          </div>
        </div>
        <div v-else-if="error" class="error-box"><UiIcon name="alert-triangle" :size="15" /> {{ error }}</div>
        <div v-else class="section">
          <div class="section-header">
            <h3>搜索结果</h3>
            <span class="section-count">{{ searchResults.length }}</span>
            <button class="search-exit-btn" @click="exitSearch">← 返回</button>
          </div>
          <div v-if="!searchResults.length" class="empty-state">
            <div class="empty-icon">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </div>
            <h3 class="empty-title">未找到匹配的技能</h3>
            <p class="empty-desc">尝试其他关键词搜索。</p>
          </div>
          <div v-else class="skill-grid" :class="viewMode">
            <StoreSkillCard
              v-for="skill in visibleSearchResults"
              :key="skill.id"
              :skill="skill"
              :loading-description="loadingDescIds.has(skill.id)"
              :description-error="failedDescIds.has(skill.id)"
              :empty-description-reason="getEmptyDescriptionReason(skill)"
              :badges="getDownloadedElsewhereBadges(skill)"
              :source-tag="buildSourceTag('available')"
              :is-downloaded="isDownloaded(skill.id)"
              :is-downloading="isDownloading(skill.id)"
              :skill-url="getSkillUrl(skill)"
              @click="onCardClick(skill)"
              @locate="locateInMySkills(skill)"
              @download="downloadSkill(skill)"
              @delete="confirmMatchedDelete(skill)"
            />
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
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </div>
            <h3 class="empty-title">未找到匹配的技能</h3>
            <p class="empty-desc">尝试其他关键词搜索。</p>
          </div>
          <div v-else class="skill-grid" :class="viewMode">
            <StoreSkillCard
              v-for="skill in visibleLocalSearchResults"
              :key="skill.id"
              :skill="skill"
              :loading-description="loadingDescIds.has(skill.id)"
              :description-error="failedDescIds.has(skill.id)"
              :empty-description-reason="getEmptyDescriptionReason(skill)"
              :badges="getDownloadedElsewhereBadges(skill)"
              :source-tag="buildSourceTag('available')"
              :is-downloaded="isDownloaded(skill.id)"
              :is-downloading="isDownloading(skill.id)"
              :skill-url="getSkillUrl(skill)"
              @click="onCardClick(skill)"
              @locate="locateInMySkills(skill)"
              @download="downloadSkill(skill)"
              @delete="confirmMatchedDelete(skill)"
            />
          </div>
        </div>
      </template>

      <template v-else>
        <div v-if="importedSkills.length" class="section">
          <div class="section-header">
            <h3>已导入</h3>
            <span class="section-count">{{ importedSkills.length }}</span>
          </div>
          <div class="skill-grid" :class="viewMode">
            <StoreSkillCard
              v-for="skill in visibleImportedSkills"
              :key="skill.id"
              :skill="skill"
              mode="imported"
              :loading-description="loadingDescIds.has(skill.id)"
              :description-error="failedDescIds.has(skill.id)"
              :empty-description-reason="getEmptyDescriptionReason(skill)"
              :source-tag="buildSourceTag('imported')"
              :show-language-tags="true"
              :show-translated-tag="getLanguageTags(skill).showTranslatedTag"
              :skill-url="getSkillUrl(skill)"
               @click="onCardClick(skill)"
               @locate="locateInMySkills(skill)"
               @delete="confirmMatchedDelete(skill)"
            />
          </div>
        </div>

        <div v-if="error" class="error-box">
          <UiIcon name="alert-triangle" :size="15" /> {{ error }}<br />
          <button
            v-if="error.includes('速率限制')"
            class="error-settings-link"
            @click="emit('navigate', 'settings', { anchor: 'github-token-section' })"
          >
            前往设置 →
          </button>
        </div>
        <div v-else-if="!loading && !sourceSkills.length && !totalCount && !importedSkills.length" class="empty-state">
          <div class="empty-icon">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </div>
          <h3 class="empty-title">暂无可用技能</h3>
          <p class="empty-desc">当前商店中没有找到技能，尝试切换商店源或调整筛选条件。</p>
        </div>

        <template v-else>
          <div class="section">
            <div class="section-header">
              <h3>可用</h3>
              <span class="section-count">{{ availableSkillsAll.length }}</span>
            </div>
            <div class="skill-grid" :class="viewMode">
              <StoreSkillCard
                v-for="skill in availableSkills"
                :key="skill.id"
                :skill="skill"
                :loading-description="loadingDescIds.has(skill.id)"
                :description-error="failedDescIds.has(skill.id)"
                :empty-description-reason="getEmptyDescriptionReason(skill)"
                :badges="getDownloadedElsewhereBadges(skill)"
                :source-tag="buildSourceTag('available')"
                :is-downloaded="isDownloaded(skill.id)"
                :is-downloading="isDownloading(skill.id)"
                :skill-url="getSkillUrl(skill)"
                @click="onCardClick(skill)"
                @locate="locateInMySkills(skill)"
                @download="downloadSkill(skill)"
                @delete="confirmMatchedDelete(skill)"
              />
            </div>
          </div>

          <div v-if="loading" class="load-more-hint">
            <div class="spinner small" />
            <span>正在加载内容...</span>
          </div>
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
    @cancel="((showDeleteStoreConfirm = false), (storeToDelete = null))"
  />
  <StoreConfigModal
    v-if="showStoreConfigModal"
    :edit-source="editingStoreSource"
    @close="showStoreConfigModal = false"
    @saved="onStoreConfigSaved"
  />
  <div v-if="showConfirmDelete" class="modal-overlay">
    <div class="modal confirm-modal">
      <div class="modal-header">
        <h3>确认删除</h3>
        <button class="modal-close" @click="showConfirmDelete = false">×</button>
      </div>
      <p class="confirm-modal-msg">
        确认删除 "<strong>{{ skillToDelete?.name }}</strong
        >"？<br />此操作将从本地移除该技能。
      </p>
      <div class="modal-footer">
        <button class="modal-btn cancel" @click="showConfirmDelete = false">取消</button>
        <button class="modal-btn confirm" @click="executeDelete">确认删除</button>
      </div>
    </div>
  </div>
</template>

<style src="../../styles/skill-store.css"></style>

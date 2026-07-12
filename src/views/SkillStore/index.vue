<script setup lang="ts">
import { ref, onMounted, onActivated, onDeactivated, watch, inject, onUnmounted, nextTick } from 'vue'
import { KeyRefreshCounts, KeyShowToast, KeyBumpDownloadedSkillsVersion } from '../../inject-keys'
import { storage } from '../../utils/storage'
import { fetchGitHubFile } from '../../utils/github'
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

import { useTheme } from '../../composables/useTheme'
import { useStoreSkills } from '../../composables/useStoreSkills'
import { useStoreDownload } from '../../composables/useStoreDownload'

const props = defineProps<{ storeId: string }>()
const emit = defineEmits(['navigate'])
const refreshCounts = inject(KeyRefreshCounts)
const showToast = inject(KeyShowToast, () => {})
const bumpDownloadedSkillsVersion = inject(KeyBumpDownloadedSkillsVersion, () => {})

const { isDarkMode, toggleTheme } = useTheme()
const viewMode = ref<'grid' | 'list'>('grid')

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

let scrollObserver: IntersectionObserver | null = null

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
}

function resetAndObserve() {
  resetVisibleCount()
  ensureDescriptionObserver()
}

function growAndObserve() {
  const grew = growVisibleCount()
  if (grew) ensureDescriptionObserver()
  return grew
}

function onStoreScroll(e: Event) {
  const el = e.currentTarget as HTMLElement
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 600) growAndObserve()
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
        if (!skillId || fetchedDescIds.value.has(skillId)) continue
        const skill =
          allEntries.value.find((s) => s.id === skillId) ||
          searchResults.value.find((s) => s.id === skillId) ||
          importedSkills.value.find((s) => s.id === skillId)
        if (!skill) continue
        if (skill.description || skill.shortDescription) {
          fetchedDescIds.value.add(skillId)
          continue
        }
        loadingDescIds.value = new Set([...loadingDescIds.value, skillId])
        skillsSh
          .fetchSkillDescriptionFromSh(skill)
          .then((desc) => {
            if (desc && activePresetId.value === 'skills-sh') {
              skill.shortDescription = desc
              fetchedDescIds.value = new Set([...fetchedDescIds.value, skillId])
              storage.saveGitHubSkills([{ ...skill, storeSourceId: activePresetId.value }])
            }
          })
          .catch(() => {})
          .finally(() => {
            loadingDescIds.value = new Set([...loadingDescIds.value].filter((id) => id !== skillId))
          })
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
  })
}

async function fetchWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))])
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
        if (!skillId || fetchedDescIds.value.has(skillId)) continue
        const skill = allEntries.value.find((s) => s.id === skillId)
        if (!skill) continue
        if (skill.description) {
          fetchedDescIds.value = new Set([...fetchedDescIds.value, skillId])
          continue
        }
        loadingDescIds.value = new Set([...loadingDescIds.value, skillId])
        try {
          const manifestFile = githubManifestMap.get(skillId)
          if (!manifestFile) {
            loadingDescIds.value = new Set([...loadingDescIds.value].filter((id) => id !== skillId))
            continue
          }
          if (!githubRepoInfo.value) {
            loadingDescIds.value = new Set([...loadingDescIds.value].filter((id) => id !== skillId))
            continue
          }
          const { owner, repo, branch } = githubRepoInfo.value
          const tk = storage.getSettings().githubToken || undefined
          const content = await fetchWithTimeout(fetchGitHubFile(owner, repo, manifestFile, branch, tk), 20000)
          const fm = parseFrontmatter(content)
          if (fm.name) skill.name = fm.name
          skill.description = fm.description || ''
          skill.author = fm.author || skill.author
          skill.tags = fm.tags
            ? fm.tags
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean)
            : skill.tags
          skill.readme = content
          fetchedDescIds.value = new Set([...fetchedDescIds.value, skillId])
          storage.saveGitHubSkills(allEntries.value.filter((s) => s.description))
        } catch {
          failedDescIds.value = new Set([...failedDescIds.value, skillId])
          showToast('技能描述加载失败，点击卡片可重试', 'warning')
        }
        loadingDescIds.value = new Set([...loadingDescIds.value].filter((id) => id !== skillId))
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
  })
}

async function retryDescription(skillId: string) {
  if (!githubRepoInfo.value) return
  const skill = allEntries.value.find((s) => s.id === skillId)
  if (!skill) return
  const manifestFile = githubManifestMap.get(skillId)
  if (!manifestFile) return
  const { owner, repo, branch } = githubRepoInfo.value
  const tk = storage.getSettings().githubToken || undefined

  failedDescIds.value = new Set([...failedDescIds.value].filter((id) => id !== skillId))
  loadingDescIds.value = new Set([...loadingDescIds.value, skillId])

  try {
    const content = await fetchWithTimeout(fetchGitHubFile(owner, repo, manifestFile, branch, tk), 20000)
    const fm = parseFrontmatter(content)
    if (fm.name) skill.name = fm.name
    skill.description = fm.description || ''
    skill.author = fm.author || skill.author
    skill.tags = fm.tags
      ? fm.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : skill.tags
    skill.readme = content
    fetchedDescIds.value = new Set([...fetchedDescIds.value, skillId])
    storage.saveGitHubSkills(allEntries.value.filter((s) => s.description))
  } catch {
    failedDescIds.value = new Set([...failedDescIds.value, skillId])
    showToast('技能描述加载失败', 'warning')
  }
  loadingDescIds.value = new Set([...loadingDescIds.value].filter((id) => id !== skillId))
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
  if (scrollObserver) {
    scrollObserver.disconnect()
    scrollObserver = null
  }
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', fillViewport)
  clearSearchDebounce()
})
onUnmounted(() => {
  stopLoadingDots()
  if (scrollObserver) {
    scrollObserver.disconnect()
    scrollObserver = null
  }
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
      @edit-store="openEditStoreModal(activePresetId)"
      @add-store="openAddStoreModal"
      @refresh="fetchCurrentSkills(true)"
      @toggle-theme="toggleTheme"
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
        <div v-else-if="error" class="error-box">⚠ {{ error }}</div>
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
              :badges="getDownloadedElsewhereBadges(skill)"
              :source-tag="buildSourceTag('available')"
              :is-downloaded="isDownloaded(skill.id)"
              :is-downloading="isDownloading(skill.id)"
              :skill-url="getSkillUrl(skill)"
              @click="onCardClick(skill)"
              @download="downloadSkill(skill)"
              @delete="confirmDelete(skill)"
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
              :badges="getDownloadedElsewhereBadges(skill)"
              :source-tag="buildSourceTag('available')"
              :is-downloaded="isDownloaded(skill.id)"
              :is-downloading="isDownloading(skill.id)"
              :skill-url="getSkillUrl(skill)"
              @click="onCardClick(skill)"
              @download="downloadSkill(skill)"
              @delete="confirmDelete(skill)"
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
              :source-tag="buildSourceTag('imported')"
              :show-language-tags="true"
              :show-translated-tag="getLanguageTags(skill).showTranslatedTag"
              :skill-url="getSkillUrl(skill)"
              @click="onCardClick(skill)"
              @delete="confirmDelete(skill)"
            />
          </div>
        </div>

        <div v-if="error" class="error-box">
          ⚠ {{ error }}<br />
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
                :badges="getDownloadedElsewhereBadges(skill)"
                :source-tag="buildSourceTag('available')"
                :is-downloaded="isDownloaded(skill.id)"
                :is-downloading="isDownloading(skill.id)"
                :skill-url="getSkillUrl(skill)"
                @click="onCardClick(skill)"
                @download="downloadSkill(skill)"
                @delete="confirmDelete(skill)"
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
  <div v-if="showConfirmDelete" class="modal-overlay" @click.self="showConfirmDelete = false">
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

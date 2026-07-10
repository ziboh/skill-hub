<script setup lang="ts">
import { ref, computed, onMounted, onActivated, onUnmounted, inject, watch, nextTick, reactive } from 'vue'
import { storage } from '../../utils/storage'
import type { Skill, SkillIdentity } from '../../types'
import { defaultPlatforms } from '../../data/platforms'
import { useSettings } from '../../composables/useSettings'
import { useTheme } from '../../composables/useTheme'
import { useFilteredSkills, SKILL_CATEGORIES, CATEGORY_ICONS } from '../../composables/useFilteredSkills'
import DeployModal from '../../components/DeployModal.vue'
import BatchSyncModal from '../../components/BatchSyncModal.vue'
import ConfirmDeleteModal from '../../components/ConfirmDeleteModal.vue'
import ConfirmBatchDeleteModal from '../../components/ConfirmBatchDeleteModal.vue'
import { loadRegistry, getSourceLabel as getRegistrySourceLabel } from '../../utils/skill-registry'
import { getSourceInfo as getSourceInfoUtil } from '../../utils/source-info'
import { isChineseContent } from '../../utils/translate'
import SkillCard from '../../components/SkillCard.vue'
import { KeyFilterCategory, KeyFilterSource, KeyRefreshMySkills, KeyOpenImportModal, KeyCurrentRoute, KeyRefreshKey, KeyRefreshCounts } from '../../inject-keys'
import { cacheVersion as translationCacheVersion } from '../../composables/useTranslationQueue'

const emit = defineEmits(['navigate'])

const { settings, updateSettings } = useSettings()

const { isDarkMode, toggleTheme } = useTheme()

const filterCategory = inject(KeyFilterCategory, ref('all'))
const filterSource = inject(KeyFilterSource, ref(''))
const filterTag = ref('')
const refreshMySkills = inject(KeyRefreshMySkills, () => {})
const openImportModal = inject(KeyOpenImportModal, () => {})
const currentRoute = inject(KeyCurrentRoute, ref('my'))
const refreshCounts = inject(KeyRefreshCounts, () => {})

const allSkills = ref<Skill[]>([])
const distributeRecords = ref(storage.getDistributeRecords())
const downloadedIds = ref<string[]>([])
const registry = ref<Map<string, SkillIdentity>>(new Map())

onMounted(() => {
  refreshData()
  enrichLocalDescriptions()
})

onActivated(() => {
  refreshData()
  enrichLocalDescriptions()
})


const refreshKey = inject(KeyRefreshKey, ref(0))
watch(refreshKey, () => { if (currentRoute.value === 'my') refreshData() })

watch(currentRoute, (r) => {
  if (r === 'my') refreshData()
  else {
    batchMode.value = false
    selectedIds.value.clear()
  }
})

function refreshData() {
  allSkills.value = storage.getCachedSkills()
  downloadedIds.value = storage.getDownloadedIds()
  distributeRecords.value = storage.getDistributeRecords()
  registry.value = loadRegistry()
  refreshMySkills()
}

async function enrichLocalDescriptions() {
  if (storage.enrichDownloadedDescriptions()) {
    storage.updateChineseTags()
    allSkills.value = storage.getCachedSkills()
  }
}

const distributedSkillIds = computed(() => storage.getDistributedSkillSet())

const downloadedSkills = computed(() =>
  allSkills.value.filter((s) => storage.isDownloaded(s.id))
)

const downloadedSkillStats = computed(() => {
  const list = downloadedSkills.value
  const distSet = distributedSkillIds.value
  let favCount = 0
  let distCount = 0
  let pendCount = 0
  for (const s of list) {
    if (s.isFavorited) favCount++
    if (distSet.has(s.id)) distCount++
    else pendCount++
  }
  return { total: list.length, favCount, distCount, pendCount }
})
const totalDownloaded = computed(() => downloadedSkillStats.value.total)
const totalFavorites = computed(() => downloadedSkillStats.value.favCount)
const totalDistributed = computed(() => downloadedSkillStats.value.distCount)
const totalPending = computed(() => downloadedSkillStats.value.pendCount)

const sourceCounts = computed(() => {
  const map = new Map<string, number>()
  for (const s of downloadedSkills.value) {
    const src = getSourceLabel(s)
    map.set(src, (map.get(src) || 0) + 1)
  }
  return Array.from(map.entries())
})

const {
  filteredSkills,
  filteredBaseCount,
  allUserTags,
  getSkillCategory,
} = useFilteredSkills({
  downloadedSkills: () => downloadedSkills.value,
  filterSource: () => filterSource.value,
  filterCategory: () => filterCategory.value,
  filterTag: () => filterTag.value,
  distributedSkillIds: () => distributedSkillIds.value,
  getSourceLabel,
})

function getInstalledPlatforms(skillId: string): string[] {
  return distributeRecords.value
    .filter((r) => r.skillId === skillId && r.scope !== 'project')
    .map((r) => r.platformId)
}

const iconRowCounts = reactive<Record<string, number>>({})
const iconRowWidths = reactive<Record<string, number>>({})
const iconObservers = new Map<string, ResizeObserver>()

function getFirstRowIcons(skillId: string): string[] {
  const all = getInstalledPlatforms(skillId)
  const count = iconRowCounts[skillId]
  return count === undefined || count <= 0 ? all : all.slice(0, count)
}

function getSecondRowIcons(skillId: string): string[] {
  const all = getInstalledPlatforms(skillId)
  const count = iconRowCounts[skillId]
  if (count === undefined || count <= 0) return []
  return all.slice(count)
}

function hasSecondRow(skillId: string): boolean {
  const count = iconRowCounts[skillId]
  return count !== undefined && count > 0 && count < getInstalledPlatforms(skillId).length
}

function getSecondRowOffset(skillId: string): number {
  const count = iconRowCounts[skillId]
  const w = iconRowWidths[skillId]
  if (!count || !w) return 0
  const iconsW = count * 16 + (count - 1) * 4
  return Math.max(0, w - iconsW)
}

function observeIconContainer(skillId: string, el: any) {
  if (!el || !(el instanceof Element)) {
    if (!el) {
      iconObservers.get(skillId)?.disconnect()
      iconObservers.delete(skillId)
    }
    return
  }
  if (iconObservers.has(skillId)) return
  function update() {
    const w = el.clientWidth
    if (w <= 0) return
    iconRowWidths[skillId] = w
    const total = getInstalledPlatforms(skillId).length
    const maxFit = Math.max(1, Math.floor((w + 4) / (16 + 4)))
    iconRowCounts[skillId] = Math.min(maxFit, total)
  }
  const obs = new ResizeObserver(update)
  obs.observe(el)
  iconObservers.set(skillId, obs)
  update()
}

onUnmounted(() => {
  for (const obs of iconObservers.values()) obs.disconnect()
  iconObservers.clear()
})

function isFavorited(id: string) { return allSkills.value.find(s => s.id === id)?.isFavorited || false }
function toggleFavorite(id: string) { storage.toggleFavorite(id); allSkills.value = storage.getCachedSkills(); refreshMySkills() }
function deleteSkill(skill: Skill) {
  deleteSkillTarget.value = skill
  showDeleteModal.value = true
}

function onSkillDeleted() {
  showDeleteModal.value = false
  deleteSkillTarget.value = null
  downloadedIds.value = storage.getDownloadedIds()
  allSkills.value = storage.getCachedSkills()
  refreshMySkills()
  refreshCounts()
}

function getSourceLabel(skill: Skill): string {
  return getSourceInfo(skill).label
}

function getAllSourceLabels(skill: Skill): string[] {
  const identity = registry.value.get(skill.canonicalId || skill.id)
  if (identity) {
    return [...new Set(identity.sources.map(s => getRegistrySourceLabel(s)))]
  }
  return [getSourceInfo(skill).label]
}

function getSourceInfo(skill: Skill): { label: string; icon: string; color: string; bg: string } {
  return getSourceInfoUtil(skill, registry.value)
}

function getCategoryInfo(skill: Skill): { label: string; icon: string } {
  const cat = getSkillCategory(skill)
  return { label: SKILL_CATEGORIES[cat].label, icon: CATEGORY_ICONS[cat] }
}

const translatedSkillIds = computed(() => {
  // 引入 cacheVersion 作为依赖，翻译完成后触发重算
  void translationCacheVersion.value

  const caches = storage.getTranslationCaches()

  const contentNames = new Set(Object.values(caches).map((e: any) => e.skillName).filter(Boolean))

  const result = new Set<string>()
  for (const skill of allSkills.value) {
    if (!skill.description || isChineseContent(skill.description)) continue
    if (contentNames.has(skill.name)) {
      result.add(skill.id)
    }
  }
  return result
})



const showDeployModal = ref(false)
const deploySkill = ref<Skill | null>(null)
const showDeleteModal = ref(false)
const deleteSkillTarget = ref<Skill | null>(null)
const showBatchDeleteModal = ref(false)
const sourceDropdownStyle = ref<Record<string, string>>({})

function toggleSourceDropdown() {
  if (showSourceDropdown.value) {
    showSourceDropdown.value = false
  } else {
    const btn = sourceBtnRef.value
    if (btn) {
      const rect = btn.getBoundingClientRect()
      const dropdownWidth = 180
      let left = rect.left
      if (left + dropdownWidth > window.innerWidth - 12) {
        left = window.innerWidth - dropdownWidth - 12
      }
      sourceDropdownStyle.value = {
        top: `${rect.bottom + 6}px`,
        left: `${left}px`,
      }
    }
    showSourceDropdown.value = true
  }
}

function openDeploy(skill: Skill) {
  deploySkill.value = skill
  showDeployModal.value = true
}

const viewMode = ref<'grid' | 'list'>('grid')
const showSourceDropdown = ref(false)
const sourceBtnRef = ref<HTMLElement>()

const batchMode = ref(false)
const selectedIds = ref<Set<string>>(new Set())
const showBatchSyncModal = ref(false)
const batchSyncSkills = ref<Skill[]>([])

const totalSources = computed(() => sourceCounts.value.reduce((sum, [, c]) => sum + c, 0))

const sourceFilterCount = computed(() => {
  if (!filterSource.value) return totalDownloaded.value
  const entry = sourceCounts.value.find(([src]) => src === filterSource.value)
  return entry ? entry[1] : 0
})

const emptyMessage = computed(() => {
  switch (filterCategory.value) {
    case 'favorites': return '暂无收藏的技能'
    case 'distributed': return '暂无已分发的技能'
    case 'pending': return '暂无待分发的技能'
    default: return '暂无已下载的技能'
  }
})

const emptyHint = computed(() => {
  switch (filterCategory.value) {
    case 'favorites': return '在技能卡片上点击星标即可收藏'
    case 'distributed': return '在技能卡片上点击分发按钮即可分发到平台'
    case 'pending': return '所有已下载的技能均已分发'
    default: return null
  }
})

function toggleBatchMode() {
  batchMode.value = !batchMode.value
  selectedIds.value.clear()
}

function toggleSelectAll() {
  if (selectedIds.value.size === filteredSkills.value.length) {
    selectedIds.value.clear()
  } else {
    selectedIds.value = new Set(filteredSkills.value.map((s) => s.id))
  }
}

function toggleSelect(id: string) {
  const s = new Set(selectedIds.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selectedIds.value = s
}

const isAllSelected = computed(() => filteredSkills.value.length > 0 && selectedIds.value.size === filteredSkills.value.length)

const selectedAllFavorited = computed(() => {
  if (selectedIds.value.size === 0) return false
  return Array.from(selectedIds.value).every((id) => allSkills.value.find(s => s.id === id)?.isFavorited)
})

function batchToggleFavorite() {
  const shouldFavorite = !selectedAllFavorited.value
  for (const id of selectedIds.value) {
    const skill = allSkills.value.find(s => s.id === id)
    const isFav = skill?.isFavorited || false
    if (shouldFavorite && !isFav) storage.toggleFavorite(id)
    else if (!shouldFavorite && isFav) storage.toggleFavorite(id)
  }
  allSkills.value = storage.getCachedSkills()
  refreshMySkills()
  batchMode.value = false
}

function batchDelete() {
  showBatchDeleteModal.value = true
}

function onBatchDeleted() {
  showBatchDeleteModal.value = false
  downloadedIds.value = storage.getDownloadedIds()
  allSkills.value = storage.getCachedSkills()
  selectedIds.value.clear()
  batchMode.value = false
  refreshMySkills()
  refreshCounts()
}

function batchSyncToPlatform() {
  batchSyncSkills.value = downloadedSkills.value.filter((s) => selectedIds.value.has(s.id))
  showBatchSyncModal.value = true
}
</script>

<template>
  <div class="my-skills">
    <div class="page-header">
      <div class="header-left">
        <div class="header-title-row">
          <h2>我的 Skill</h2>
          <span class="count-badge">{{ totalDownloaded }}</span>
        </div>
        <p class="page-subtitle">管理已下载的技能库，支持收藏、分发与批量操作。</p>
      </div>
      <div class="header-toolbar">
        <button class="toolbar-btn add-skill-btn" title="新建 Skill" @click="openImportModal()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          新建
        </button>
        <button class="toolbar-btn" :class="{ 'batch-active': batchMode }" :disabled="!filteredSkills.length" @click="toggleBatchMode">
          <svg v-if="!batchMode" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
          </svg>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          批量管理
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
        <button class="toolbar-icon-btn" title="刷新" @click="refreshData">
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

    <div class="filter-tabs-row">
      <div class="filter-tabs">
        <button
          class="tab-btn"
          :class="{ active: filterCategory === 'all' }"
          @click="filterCategory = 'all'"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          全部 Skill
          <span class="tab-count">{{ totalDownloaded }}</span>
        </button>
        <button
          class="tab-btn"
          :class="{ active: filterCategory === 'favorites' }"
          @click="filterCategory = filterCategory === 'favorites' ? 'all' : 'favorites'"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          收藏
          <span class="tab-count">{{ totalFavorites }}</span>
        </button>
        <button
          class="tab-btn"
          :class="{ active: filterCategory === 'distributed' }"
          @click="filterCategory = filterCategory === 'distributed' ? 'all' : 'distributed'"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
          已分发
          <span class="tab-count">{{ totalDistributed }}</span>
        </button>
        <button
          class="tab-btn"
          :class="{ active: filterCategory === 'pending' }"
          @click="filterCategory = filterCategory === 'pending' ? 'all' : 'pending'"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          待分发
          <span class="tab-count">{{ totalPending }}</span>
        </button>
      </div>
      <div class="source-dropdown-wrap">
        <button
          ref="sourceBtnRef"
          class="tab-btn source-tab"
          :class="{ active: filterSource }"
          @click="toggleSourceDropdown"
        >
          {{ filterSource || '全部来源' }}
          <span class="tab-count">{{ sourceFilterCount }}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="showSourceDropdown" class="source-dropdown-overlay" @click="showSourceDropdown = false"></div>
      <div v-if="showSourceDropdown" class="source-dropdown" :style="sourceDropdownStyle">
        <button
          class="dropdown-item"
          :class="{ active: !filterSource }"
          @click="filterSource = ''; showSourceDropdown = false"
        >
          全部来源
          <span class="dropdown-count">{{ totalSources }}</span>
        </button>
        <button
          v-for="[src, cnt] in sourceCounts"
          :key="src"
          class="dropdown-item"
          :class="{ active: filterSource === src }"
          @click="filterSource = filterSource === src ? '' : src; showSourceDropdown = false"
        >
          {{ src }}
          <span class="dropdown-count">{{ cnt }}</span>
        </button>
      </div>
    </Teleport>

    <div class="category-inline-wrap">
      <button
        class="category-pill"
        :class="{ active: !filterTag }"
        @click="filterTag = ''"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        全部
        <span class="pill-count">{{ filteredBaseCount }}</span>
      </button>
      <button
        v-for="cat in allUserTags"
        :key="cat.id"
        class="category-pill"
        :class="{ active: filterTag === cat.id }"
        @click="filterTag = filterTag === cat.id ? '' : cat.id"
      >
        {{ cat.icon }} {{ cat.label }}
        <span class="pill-count">{{ cat.count }}</span>
      </button>
    </div>

    <div class="ms-scroll">
      <div v-if="batchMode" class="batch-bar">
      <div class="batch-left">
        <span class="batch-label">批量模式</span>
        <span class="batch-count">已选 {{ selectedIds.size }} 项</span>
      </div>
      <div class="batch-actions">
        <button class="batch-action-btn" @click="toggleSelectAll">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" :fill="isAllSelected ? 'currentColor' : 'none'"/>
            <polyline v-if="isAllSelected" points="9 11 12 14 22 4"/>
          </svg>
          全选
        </button>
        <button class="batch-action-btn" :disabled="selectedIds.size === 0" @click="batchToggleFavorite">
          <svg v-if="selectedAllFavorited" width="14" height="14" viewBox="0 0 24 24" fill="hsl(45 90% 55%)" stroke="hsl(45 90% 55%)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          {{ selectedAllFavorited ? '取消收藏' : '添加收藏' }}
        </button>
        <button class="batch-action-btn primary" :disabled="selectedIds.size === 0" @click="batchSyncToPlatform">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
          批量同步到平台
        </button>
        <button class="batch-action-btn danger" :disabled="selectedIds.size === 0" @click="batchDelete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
          </svg>
          删除
        </button>
      </div>
    </div>

    <div v-if="!filteredSkills.length" class="empty">
      <p>{{ emptyMessage }}</p>
      <p v-if="emptyHint" class="empty-hint">{{ emptyHint }}</p>
      <button v-if="filterCategory === 'all'" class="btn-primary" @click="emit('navigate', 'store')">浏览商店</button>
      <button v-else-if="filterCategory === 'favorites' && downloadedSkills.length" class="btn-primary" @click="filterCategory = 'all'">查看已下载技能</button>
      <button v-else-if="filterCategory === 'distributed'" class="btn-primary" @click="filterCategory = 'all'">查看已下载技能</button>
    </div>

    <div v-else class="skill-grid" :class="viewMode">
      <SkillCard
        v-for="(skill, idx) in filteredSkills"
        :key="skill.id"
        :name="skill.name"
        :description="skill.description || '暂无描述'"
        :selected="selectedIds.has(skill.id)"
        :show-batch-checkbox="batchMode"
        :show-platform-icons="true"
        :installed-platforms="getInstalledPlatforms(skill.id)"
        :source-tag="getSourceInfo(skill)"
        :category-tag="getCategoryInfo(skill)"
        :show-chinese-tag="isChineseContent(skill.description || '')"
        :show-translated-tag="translatedSkillIds.has(skill.id)"
        @click="batchMode ? toggleSelect(skill.id) : emit('navigate', 'detail', { skill, context: 'my' })"
        @select="toggleSelect(skill.id)"
      >
        <template #actions>
          <button class="card-action-btn" title="分发" @click.stop="openDeploy(skill)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
          <button class="card-action-btn" :class="{ filled: isFavorited(skill.id) }" :title="isFavorited(skill.id) ? '取消收藏' : '收藏'" @click.stop="toggleFavorite(skill.id)">
            <svg v-if="isFavorited(skill.id)" width="14" height="14" viewBox="0 0 24 24" fill="hsl(45 90% 55%)" stroke="hsl(45 90% 55%)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </button>
          <button class="card-action-btn danger" title="删除" @click.stop="deleteSkill(skill)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          </button>
        </template>
      </SkillCard>
    </div>
    </div>

    <DeployModal
      v-if="showDeployModal && deploySkill"
      :skill="deploySkill"
      @close="showDeployModal = false; deploySkill = null"
      @deployed="showDeployModal = false; deploySkill = null; refreshData()"
    />

    <BatchSyncModal
      v-if="showBatchSyncModal"
      :skills="batchSyncSkills"
      @close="showBatchSyncModal = false; batchSyncSkills = []"
      @deployed="showBatchSyncModal = false; batchSyncSkills = []; refreshData(); batchMode = false"
    />

    <ConfirmDeleteModal
      v-if="showDeleteModal && deleteSkillTarget"
      :skill="deleteSkillTarget"
      @close="showDeleteModal = false; deleteSkillTarget = null"
      @deleted="onSkillDeleted"
    />

    <ConfirmBatchDeleteModal
      v-if="showBatchDeleteModal"
      :skills="downloadedSkills.filter(s => selectedIds.has(s.id))"
      @close="showBatchDeleteModal = false"
      @deleted="onBatchDeleted"
    />

  </div>
</template>

<style scoped>
.my-skills { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 0; }
.ms-scroll { flex: 1; overflow-y: auto; overscroll-behavior: contain; min-height: 0; scrollbar-gutter: stable; }

/* Page header */
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

.header-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
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

.toolbar-btn.batch-active {
  background: hsl(var(--destructive) / 0.08);
  border-color: hsl(var(--destructive) / 0.3);
  color: hsl(var(--destructive));
}

.toolbar-btn.batch-active:hover {
  background: hsl(var(--destructive) / 0.15);
}

.toolbar-btn:disabled {
  opacity: 0.35;
  cursor: default;
  pointer-events: none;
}

.toolbar-btn.add-skill-btn {
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  border-color: transparent;
}

.toolbar-btn.add-skill-btn:hover {
  background: hsl(var(--primary) / 0.9);
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

.toolbar-icon-btn:hover {
  background: hsl(var(--accent));
  color: hsl(var(--foreground));
}

.toolbar-icon-btn:disabled {
  opacity: 0.35;
  cursor: default;
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

/* Batch bar */
.batch-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 28px;
  margin: 12px 28px 0;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
}

.batch-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
}

.batch-label {
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.batch-count {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.batch-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.batch-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
  background: hsl(var(--card));
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
  white-space: nowrap;
}

.batch-action-btn svg {
  color: hsl(var(--muted-foreground));
  flex-shrink: 0;
}

.batch-action-btn:hover:not(:disabled) {
  background: hsl(var(--accent));
  border-color: hsl(var(--primary) / 0.3);
  color: hsl(var(--foreground));
}

.batch-action-btn:hover:not(:disabled) svg {
  color: hsl(var(--primary));
}

.batch-action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.batch-action-btn.primary {
  background: hsl(var(--primary));
  border-color: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
}

.batch-action-btn.primary svg {
  color: hsl(var(--primary-foreground));
}

.batch-action-btn.primary:hover:not(:disabled) {
  background: hsl(var(--primary) / 0.85);
  border-color: hsl(var(--primary) / 0.85);
}

.batch-action-btn.primary:hover:not(:disabled) svg {
  color: hsl(var(--primary-foreground));
}

.batch-action-btn.danger {
  color: hsl(var(--destructive));
  border-color: hsl(var(--destructive) / 0.25);
  background: hsl(var(--destructive) / 0.04);
}

.batch-action-btn.danger svg {
  color: hsl(var(--destructive));
}

.batch-action-btn.danger:hover:not(:disabled) {
  background: hsl(var(--destructive) / 0.1);
  border-color: hsl(var(--destructive) / 0.4);
}

/* Filter tabs */
.filter-tabs-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 28px 0;
}

.filter-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1;
  min-width: 0;
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
  min-width: 20px;
  text-align: center;
  border-radius: 6px;
  background: hsl(var(--muted) / 0.6);
  color: hsl(var(--muted-foreground));
  line-height: 1.6;
}

.tab-btn.active .tab-count {
  background: hsl(var(--primary) / 0.15);
  color: hsl(var(--primary));
}

.tab-divider {
  width: 1px;
  height: 20px;
  background: hsl(var(--border));
  margin: 0 4px;
}

.source-tab {
  flex-shrink: 0;
}

.source-dropdown-wrap {
  position: relative;
}

.source-dropdown-overlay {
  position: fixed;
  inset: 0;
  z-index: 99;
}

.source-dropdown {
  position: fixed;
  min-width: 160px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
  z-index: 100;
  padding: 4px;
  overflow: hidden;
}

.dropdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: hsl(var(--foreground));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
  white-space: nowrap;
}

.dropdown-item:hover {
  background: hsl(var(--accent));
}

.dropdown-item.active {
  background: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
}

.dropdown-count {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 6px;
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
}

.dropdown-item.active .dropdown-count {
  background: hsl(var(--primary) / 0.15);
  color: hsl(var(--primary));
}

.category-inline-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 28px;
  overflow-x: auto;
  scrollbar-width: none;
  flex-wrap: nowrap;
  width: 100%;
  box-sizing: border-box;
}

.category-inline-wrap::-webkit-scrollbar {
  display: none;
}

.category-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all var(--duration-base) var(--ease-standard);
}

.category-pill:hover {
  background: hsl(var(--accent));
  color: hsl(var(--foreground));
}

.category-pill.active {
  background: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
  font-weight: 600;
}

.pill-count {
  font-size: 11px;
  font-weight: 600;
  padding: 0 4px;
  min-width: 18px;
  text-align: center;
  border-radius: 6px;
  background: hsl(var(--muted) / 0.6);
  color: hsl(var(--muted-foreground));
  line-height: 1.6;
}

.category-pill.active .pill-count {
  background: hsl(var(--primary) / 0.15);
  color: hsl(var(--primary));
}

/* Grid */
.skill-grid {
  display: grid;
  gap: 10px;
  padding: 20px 28px 28px;
}

.skill-grid.grid {
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
}

.skill-grid.list {
  grid-template-columns: 1fr;
}

.btn-primary {
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 10px;
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  border: none;
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
}

.btn-primary:hover { box-shadow: 0 4px 16px hsl(var(--primary) / 0.3); transform: translateY(-1px); }

.empty {
  text-align: center;
  padding: 64px 28px;
  color: hsl(var(--muted-foreground));
  font-size: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.empty-hint {
  color: hsl(var(--muted-foreground));
  font-size: 13px;
  opacity: 0.7;
  margin-top: -8px;
}
</style>

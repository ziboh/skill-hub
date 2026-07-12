<script setup lang="ts">
import { ref, computed, onMounted, onActivated, onDeactivated, inject, watch } from 'vue'
import { storage } from '../../utils/storage'
import { useSettings } from '../../composables/useSettings'
import type { DistributeRecord, ModelConfig, FailureRecord, FailureType, ErrorCategory } from '../../types'
import { defaultPlatforms } from '../../data/platforms'
import { KeyCurrentRoute } from '../../inject-keys'
import { useDownloadQueue } from '../../composables/useDownloadQueue'
import { useTranslationQueue } from '../../composables/useTranslationQueue'
import { getSourceInfo as getSourceInfoUtil } from '../../utils/source-info'

import type { Skill } from '../../types'
import ProviderIcon from '../../components/ProviderIcon.vue'

const _emit = defineEmits(['navigate'])

const _currentRoute = inject(KeyCurrentRoute, ref('my'))
const { settings, updateSettings } = useSettings()

const isDarkMode = computed(() => {
  if (settings.themeMode === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  return settings.themeMode === 'dark'
})

function toggleTheme() {
  const next = isDarkMode.value ? 'light' : 'dark'
  updateSettings({ themeMode: next })
}

const activeTab = ref<'downloads' | 'dist' | 'translations' | 'failures'>('downloads')

const { queue, activeCount, clearCompleted: _clearCompleted } = useDownloadQueue()
const { queue: translationQueue, cacheVersion, removeTranslation, clearAll: _clearAll } = useTranslationQueue()

const failureRecords = ref<FailureRecord[]>([])
const failureTypeFilter = ref<FailureType | 'all'>('all')

const sessionDownloads = computed(() => storage.getSessionDownloads())
const distributeRecords = ref<DistributeRecord[]>([])
const translations = ref<
  Record<
    string,
    { sourceContent?: string; translatedContent?: string; translatedDesc?: string; mode?: string; updatedAt: number; skillName?: string }
  >
>({})

function getSkillNameByHash(hash: string): string {
  const cache = storage.getTranslationByHash(hash)
  if (cache?.skillName) return cache.skillName
  const skills = storage.getDownloadedSkills()
  for (const s of skills) {
    if (s.readme) {
      if (window.services.hashContent(s.readme.replace(/\r\n/g, '\n').replace(/\r/g, '\n')) === hash) return s.name
    }
  }
  return hash.slice(0, 8) + '...'
}

const PAGE_SIZE_OPTIONS = [100, 50, 20, 10, 5]
const pageState = storage.getPageState('records') || {}
const pageSize = ref(pageState.pageSize || 20)
const currentPage = ref(1)
const showPageSizeDropdown = ref(false)
const sortDirection = ref<'asc' | 'desc'>('desc')

function toggleSort() {
  sortDirection.value = sortDirection.value === 'desc' ? 'asc' : 'desc'
  currentPage.value = 1
}

function setFailureTypeFilter(type: FailureType | 'all') {
  failureTypeFilter.value = type
  currentPage.value = 1
}

const showDeleteConfirm = ref(false)
const deleteTarget = ref<{ type: 'dist' | 'translation' | 'failure'; data: any } | null>(null)
const selectedItems = ref<Set<string>>(new Set())
const showBatchDeleteConfirm = ref(false)
const selectedFailureRecord = ref<FailureRecord | null>(null)
const showFailureDetail = ref(false)

onDeactivated(() => {
  selectedItems.value.clear()
})

/** Stable selection keys (platformId may contain `:`, e.g. project:…). */
function distRecordKey(r: Pick<DistributeRecord, 'skillId' | 'platformId' | 'scope'>): string {
  return JSON.stringify({ k: 'dist', skillId: r.skillId, platformId: r.platformId, scope: r.scope || '' })
}
function translationRecordKey(type: string, hash: string): string {
  return JSON.stringify({ k: 'translation', type, hash })
}
function failureRecordKey(id: string): string {
  return JSON.stringify({ k: 'failure', id })
}

function parseSelectionKey(
  key: string,
): { k: string; skillId?: string; platformId?: string; scope?: string; type?: string; hash?: string; id?: string } | null {
  try {
    const o = JSON.parse(key)
    if (o && typeof o === 'object' && o.k) return o
  } catch {
    /* legacy colon keys */
  }
  if (key.startsWith('content:') || key.startsWith('desc:')) {
    const type = key.startsWith('content:') ? 'content' : 'desc'
    return { k: 'translation', type, hash: key.slice(type.length + 1) }
  }
  if (key.startsWith('failure:')) {
    return { k: 'failure', id: key.slice(8) }
  }
  return null
}

function toggleSelect(key: string) {
  if (selectedItems.value.has(key)) {
    selectedItems.value.delete(key)
  } else {
    selectedItems.value.add(key)
  }
  selectedItems.value = new Set(selectedItems.value)
}

function isAllSelected(items: Array<{ key: string }>) {
  if (items.length === 0) return false
  return items.every((item) => selectedItems.value.has(item.key))
}

function toggleSelectAll(items: Array<{ key: string }>) {
  if (isAllSelected(items)) {
    items.forEach((item) => selectedItems.value.delete(item.key))
  } else {
    items.forEach((item) => selectedItems.value.add(item.key))
  }
  selectedItems.value = new Set(selectedItems.value)
}

function clearSelection() {
  selectedItems.value = new Set()
}

function confirmBatchDelete() {
  if (selectedItems.value.size === 0) return
  showBatchDeleteConfirm.value = true
}

function deleteBySelectionKey(key: string) {
  const parsed = parseSelectionKey(key)
  if (!parsed) return
  if (parsed.k === 'dist' && parsed.skillId != null && parsed.platformId != null) {
    storage.removeDistributeRecord(parsed.skillId, parsed.platformId, parsed.scope || undefined)
  } else if (parsed.k === 'translation' && parsed.hash && (parsed.type === 'content' || parsed.type === 'desc')) {
    storage.removeTranslationByHash(parsed.hash, parsed.type)
    removeTranslation(parsed.hash, parsed.type)
  } else if (parsed.k === 'failure' && parsed.id) {
    storage.removeFailureRecord(parsed.id)
  }
}

function executeBatchDelete() {
  for (const key of selectedItems.value) {
    deleteBySelectionKey(key)
  }
  clearSelection()
  loadData()
  showBatchDeleteConfirm.value = false
}

function confirmDeleteDist(record: DistributeRecord) {
  deleteTarget.value = { type: 'dist', data: record }
  showDeleteConfirm.value = true
}

function confirmDeleteTranslation(item: { skillId: string; type: string }) {
  deleteTarget.value = { type: 'translation', data: item }
  showDeleteConfirm.value = true
}

function confirmDeleteFailure(record: FailureRecord) {
  deleteTarget.value = { type: 'failure', data: record }
  showDeleteConfirm.value = true
}

function openFailureDetail(record: FailureRecord) {
  selectedFailureRecord.value = record
  showFailureDetail.value = true
}

function closeFailureDetail() {
  showFailureDetail.value = false
  selectedFailureRecord.value = null
}

function getErrorCategoryLabel(category?: ErrorCategory): string {
  if (!category) return '未知'
  const labels: Record<ErrorCategory, string> = {
    network: '网络错误',
    auth: '认证错误',
    api: 'API 错误',
    response: '响应错误',
    config: '配置错误',
    unknown: '未知错误',
  }
  return labels[category]
}

function getErrorCategoryColor(category?: ErrorCategory): string {
  if (!category) return 'var(--muted-foreground)'
  const colors: Record<ErrorCategory, string> = {
    network: 'hsl(38 90% 50%)',
    auth: 'hsl(0 80% 60%)',
    api: 'hsl(260 60% 55%)',
    response: 'hsl(210 80% 50%)',
    config: 'hsl(150 50% 45%)',
    unknown: 'var(--muted-foreground)',
  }
  return colors[category]
}

function executeDelete() {
  if (!deleteTarget.value) return
  if (deleteTarget.value.type === 'dist') {
    const r = deleteTarget.value.data as DistributeRecord
    storage.removeDistributeRecord(r.skillId, r.platformId, r.scope)
  } else if (deleteTarget.value.type === 'failure') {
    const r = deleteTarget.value.data as FailureRecord
    storage.removeFailureRecord(r.id)
  } else {
    const item = deleteTarget.value.data as { skillId: string; type: 'content' | 'desc' }
    storage.removeTranslationByHash(item.skillId, item.type)
    removeTranslation(item.skillId, item.type)
  }
  clearSelection()
  loadData()
  showDeleteConfirm.value = false
  deleteTarget.value = null
}

watch(pageSize, () => {
  currentPage.value = 1
  storage.savePageState('records', { pageSize: pageSize.value })
})

const platformMap = computed(() => {
  const map = new Map<string, string>()
  for (const p of defaultPlatforms) {
    map.set(p.id, p.name)
  }
  const saved = storage.getPlatformConfigs()
  for (const p of saved) {
    map.set(p.id, p.name)
  }
  return map
})

onMounted(() => {
  loadData()
})

onActivated(() => {
  loadData()
})

watch(cacheVersion, () => {
  loadData()
})

function loadData() {
  // New array/object refs so Vue always re-renders after delete
  distributeRecords.value = [...storage.getDistributeRecords()]
  translations.value = { ...storage.getTranslationCaches() }
  failureRecords.value = [...storage.getFailureRecords()]
}

function _getTranslationModel(): ModelConfig | null {
  const settings = storage.getSettings()
  if (!settings.translationModelId) return null
  const providers = settings.aiModels || []
  const sepIdx = settings.translationModelId.lastIndexOf('::')
  if (sepIdx >= 0) {
    const providerId = settings.translationModelId.substring(0, sepIdx)
    const modelId = settings.translationModelId.substring(sepIdx + 2)
    const provider = providers.find((m) => m.id === providerId)
    if (provider && provider.enabled !== false && provider.models?.some((m) => m.id === modelId && m.enabled)) {
      return { ...provider, model: modelId } as ModelConfig
    }
  } else {
    for (const provider of providers) {
      if (provider.models) {
        const model = provider.models.find((m) => m.id === settings.translationModelId && m.enabled)
        if (model && provider.enabled !== false) return { ...provider, model: model.id } as ModelConfig
      }
    }
  }
  return null
}

/** Cancel in-progress or pending translation (skillId field = content hash) */
function cancelTranslation(item: { skillId: string; type: 'content' | 'desc' }) {
  removeTranslation(item.skillId, item.type)
}

function _clearAllFailureRecords() {
  storage.clearFailureRecords()
  loadData()
}

const hasQueueItems = computed(() => translationQueue.value.length > 0)

function getSkillName(skillId: string): string {
  const cached = storage.getDownloadedSkills()
  const skill = cached.find((s) => s.id === skillId)
  return skill?.name || skillId
}

function formatTime(ts: number | string): string {
  if (!ts) return '—'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return '—'
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour} 小时前`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 7) return `${diffDay} 天前`
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function getSourceInfoForDownload(source: string): { label: string; icon: string; color: string; bg: string } {
  const skill: Skill = { id: '', name: '', description: '', author: '', tags: [], source: 'local' }
  if (source === 'skills-sh') {
    skill.source = 'skills-sh'
  } else if (source === 'claude') {
    skill.repo = 'anthropics/skills'
  } else if (source === 'codex') {
    skill.repo = 'openai/skills'
  } else if (source === 'import') {
    skill.repo = 'unknown'
  } else if (source === 'agent') {
    skill.source = 'local'
  } else if (source === 'local') {
    skill.source = 'local'
  } else if (source === 'marketplace') {
    skill.storeSourceId = 'skills-sh'
  } else if (source === 'project') {
    skill.source = 'local'
  } else {
    skill.storeSourceId = source
  }
  return getSourceInfoUtil(skill)
}

function getSourceLabel(source: string): string {
  return getSourceInfoForDownload(source).label
}

function _getProjectFileName(targetPath: string): string {
  if (!targetPath) return ''
  const parts = targetPath.replace(/\\/g, '/').split('/')
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i] === 'skills' && i + 1 < parts.length) return parts[i + 1]
  }
  return parts[parts.length - 1] || ''
}

function getProjectName(platformId: string): string {
  let pid = ''
  if (platformId.startsWith('project:')) {
    pid = platformId.split('/')[0]?.replace('project:', '') || ''
  } else if (platformId.startsWith('project-')) {
    pid = platformId
  }
  if (!pid) return ''
  const projects = storage.getRegisteredProjects()
  const project = projects.find((p) => p.id === pid)
  return project?.name || pid
}

function getDistPlatformId(record: DistributeRecord): string {
  const normalized = record.targetPath.replace(/\\/g, '/').toLowerCase()
  for (const p of defaultPlatforms) {
    if (p.projectPath && normalized.includes(p.projectPath.replace(/\\/g, '/').toLowerCase())) {
      return p.id
    }
  }
  if (normalized.includes('.agents/skills')) return '_generic'
  return record.platformId
}

function truncate(str: string, len: number): string {
  if (!str) return ''
  return str.length > len ? str.slice(0, len) + '...' : str
}

function getStatusIcon(status: string) {
  if (status === 'running') return 'M21 12a9 9 0 1 1-6.219-8.56'
  if (status === 'success') return 'M20 6 9 17 4 12'
  if (status === 'error') return 'M12 9v4m0 4h.01'
  return 'M12 8v4l3 3'
}

function getStatusColor(status: string) {
  if (status === 'running') return 'var(--primary)'
  if (status === 'success') return 'hsl(142 50% 45%)'
  if (status === 'error') return 'var(--destructive)'
  return 'var(--muted-foreground)'
}

function formatQueueTime(ms: number) {
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m${s % 60}s`
}

const downloadQueueItems = computed(() => queue.value.filter((item) => item.type === 'download'))
const downloadsList = computed(() => {
  const list: Array<{ skillId: string; skillName: string; source: string; downloadedAt: string; status?: string; error?: string }> = []
  for (const item of downloadQueueItems.value) {
    list.push({
      skillId: item.skillId,
      skillName: item.skillName,
      source: item.source || '商店',
      downloadedAt: new Date(item.startedAt).toISOString(),
      status: item.status,
      error: item.error,
    })
  }
  const queuedIds = new Set(downloadQueueItems.value.map((item) => item.skillId))
  for (const record of sessionDownloads.value) {
    if (!queuedIds.has(record.skillId)) {
      list.push(record)
    }
  }
  list.sort((a, b) => {
    const diff = new Date(a.downloadedAt).getTime() - new Date(b.downloadedAt).getTime()
    return sortDirection.value === 'asc' ? diff : -diff
  })
  return list
})
const downloadsTotal = computed(() => downloadsList.value.length)
const downloadsPages = computed(() => Math.max(1, Math.ceil(downloadsTotal.value / pageSize.value)))
const downloadsPaged = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return downloadsList.value.slice(start, start + pageSize.value)
})

const distTotal = computed(() => distributeRecords.value.length)
const distPages = computed(() => Math.max(1, Math.ceil(distTotal.value / pageSize.value)))
const distPaged = computed(() => {
  const sorted = [...distributeRecords.value].sort((a, b) => {
    const diff = new Date(a.distributedAt).getTime() - new Date(b.distributedAt).getTime()
    return sortDirection.value === 'asc' ? diff : -diff
  })
  const start = (currentPage.value - 1) * pageSize.value
  return sorted.slice(start, start + pageSize.value)
})

const translationsList = computed(() => {
  const list: Array<{
    skillId: string
    skillName: string
    type: 'content' | 'desc'
    preview: string
    status: 'translating' | 'pending' | 'done'
    updatedAt: number
  }> = []
  for (const item of translationQueue.value) {
    const isTranslating = item.status === 'translating'
    list.push({
      skillId: item.hash,
      skillName: item.skillName || getSkillNameByHash(item.hash),
      type: item.type,
      preview: isTranslating ? '翻译中...' : '排队中...',
      status: isTranslating ? 'translating' : 'pending',
      updatedAt: item.startedAt,
    })
  }
  for (const [hash, data] of Object.entries(translations.value)) {
    if (data.translatedContent) {
      list.push({
        skillId: hash,
        skillName: getSkillNameByHash(hash),
        type: 'content',
        preview: data.translatedContent,
        status: 'done',
        updatedAt: data.updatedAt || 0,
      })
    }
    if (data.translatedDesc) {
      list.push({
        skillId: hash,
        skillName: getSkillNameByHash(hash),
        type: 'desc',
        preview: data.translatedDesc,
        status: 'done',
        updatedAt: data.updatedAt || 0,
      })
    }
  }
  list.sort((a, b) => {
    const order: Record<string, number> = { translating: 0, pending: 1, done: 2 }
    const diff = order[a.status] - order[b.status]
    if (diff !== 0) return diff
    return b.updatedAt - a.updatedAt
  })
  return list
})
const translationsTotal = computed(() => translationsList.value.length)
const translationsPages = computed(() => Math.max(1, Math.ceil(translationsTotal.value / pageSize.value)))
const translationsPaged = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return translationsList.value.slice(start, start + pageSize.value)
})

const filteredFailureRecords = computed(() => {
  if (failureTypeFilter.value === 'all') return failureRecords.value
  return failureRecords.value.filter((r) => r.type === failureTypeFilter.value)
})
const failuresTotal = computed(() => filteredFailureRecords.value.length)
const failuresPages = computed(() => Math.max(1, Math.ceil(failuresTotal.value / pageSize.value)))
const failuresPaged = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredFailureRecords.value.slice(start, start + pageSize.value)
})

const currentTotal = computed(() => {
  if (activeTab.value === 'downloads') return downloadsTotal.value
  if (activeTab.value === 'dist') return distTotal.value
  if (activeTab.value === 'failures') return failuresTotal.value
  return translationsTotal.value
})

const currentPages = computed(() => {
  if (activeTab.value === 'downloads') return downloadsPages.value
  if (activeTab.value === 'dist') return distPages.value
  if (activeTab.value === 'failures') return failuresPages.value
  return translationsPages.value
})

function goToPage(page: number) {
  if (page >= 1 && page <= currentPages.value) {
    currentPage.value = page
  }
}

function selectPageSize(size: number) {
  pageSize.value = size
  showPageSizeDropdown.value = false
}

watch(activeTab, () => {
  currentPage.value = 1
})
</script>

<template>
  <div class="records-page">
    <div class="page-header">
      <div class="header-left">
        <div class="header-title-row">
          <h2>记录</h2>
        </div>
        <p class="page-subtitle">查看下载、分发与翻译的历史记录。</p>
      </div>
      <div class="header-toolbar">
        <button class="toolbar-icon-btn" @click="toggleTheme" :title="isDarkMode ? '切换亮色模式' : '切换暗色模式'">
          <svg
            v-if="isDarkMode"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="5" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
          <svg
            v-else
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
          </svg>
        </button>
      </div>
    </div>

    <div class="filter-tabs-row">
      <div class="filter-tabs">
        <button class="tab-btn" :class="{ active: activeTab === 'downloads' }" @click="activeTab = 'downloads'">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            :class="{ spinning: activeCount > 0 }"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          下载记录
          <span v-if="activeCount > 0" class="tab-count active">{{ activeCount }}</span>
          <span v-else class="tab-count">{{ downloadsTotal }}</span>
        </button>
        <button class="tab-btn" :class="{ active: activeTab === 'dist' }" @click="activeTab = 'dist'">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
          分发记录
          <span class="tab-count">{{ distTotal }}</span>
        </button>
        <button class="tab-btn" :class="{ active: activeTab === 'translations' }" @click="activeTab = 'translations'">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          翻译记录
          <span class="tab-count">{{ translationsTotal }}</span>
        </button>
        <button class="tab-btn" :class="{ active: activeTab === 'failures' }" @click="activeTab = 'failures'">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          失败记录
          <span v-if="failuresTotal > 0" class="tab-count error">{{ failuresTotal }}</span>
          <span v-else class="tab-count">{{ failuresTotal }}</span>
        </button>
      </div>
    </div>

    <div class="records-content">
      <div v-if="activeTab === 'downloads'" class="records-list">
        <div v-if="downloadsTotal === 0 && downloadQueueItems.length === 0" class="empty">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            style="color: hsl(var(--muted-foreground) / 0.4)"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <p>暂无下载记录</p>
          <p class="empty-hint">从商店下载 Skill 时，进度将显示在这里</p>
        </div>
        <template v-else>
          <div class="record-table downloads-table">
            <div class="record-row header-row">
              <div class="col-status" />
              <div class="col-name">Skill 名称</div>
              <div class="col-source">来源</div>
              <div class="col-time sortable" @click="toggleSort">
                时间
                <span class="sort-indicator" :class="{ active: true }">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path v-if="sortDirection === 'desc'" d="M7 10l5 5 5-5" />
                    <path v-else d="M7 14l5-5 5 5" />
                  </svg>
                </span>
              </div>
            </div>
            <div class="record-table-body">
              <div v-for="(record, idx) in downloadsPaged" :key="idx" class="record-row">
                <div class="col-status">
                  <svg
                    v-if="record.status"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    :stroke="getStatusColor(record.status)"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    :class="{ spinning: record.status === 'running' }"
                  >
                    <path :d="getStatusIcon(record.status)" />
                  </svg>
                  <svg
                    v-else
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="hsl(142 50% 45%)"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M20 6 9 17 4 12" />
                  </svg>
                </div>
                <div class="col-name">
                  <span class="skill-name">{{ record.skillName }}</span>
                  <span class="skill-id">{{ record.skillId }}</span>
                </div>
                <div class="col-source">
                  <span
                    class="source-badge"
                    :style="{
                      color: getSourceInfoForDownload(record.source).color,
                      background: getSourceInfoForDownload(record.source).bg,
                    }"
                  >
                    <svg
                      v-if="getSourceInfoForDownload(record.source).icon === 'multi'"
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                    <svg
                      v-else-if="getSourceInfoForDownload(record.source).icon === 'git'"
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <circle cx="18" cy="18" r="3" />
                      <circle cx="6" cy="6" r="3" />
                      <path d="M13 6h3a2 2 0 0 1 2 2v7" />
                      <line x1="6" y1="9" x2="6" y2="21" />
                    </svg>
                    <ProviderIcon
                      v-else-if="getSourceInfoForDownload(record.source).icon"
                      :icon="getSourceInfoForDownload(record.source).icon"
                      :size="10"
                    />
                    {{ getSourceLabel(record.source) }}
                  </span>
                </div>
                <div class="col-time">
                  {{
                    record.status === 'running' ? formatQueueTime(new Date(record.downloadedAt).getTime()) : formatTime(record.downloadedAt)
                  }}
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <div v-else-if="activeTab === 'dist'" class="records-list">
        <div v-if="distTotal === 0" class="empty">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            style="color: hsl(var(--muted-foreground) / 0.4)"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
          <p>暂无分发记录</p>
          <p class="empty-hint">将 Skill 分发到平台后，记录将显示在这里</p>
        </div>
        <template v-else>
          <div class="record-table dist-table">
            <div class="record-row header-row">
              <div class="col-check">
                <label class="checkbox-wrap">
                  <input
                    type="checkbox"
                    :checked="isAllSelected(distPaged.map((r) => ({ key: distRecordKey(r) })))"
                    @change="toggleSelectAll(distPaged.map((r) => ({ key: distRecordKey(r) })))"
                  />
                  <span class="checkbox-custom" />
                </label>
              </div>
              <div class="col-name">Skill 名称</div>
              <div class="col-platform">目标平台</div>
              <div class="col-mode">模式</div>
              <div class="col-time sortable" @click="toggleSort">
                时间
                <span class="sort-indicator" :class="{ active: true }">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path v-if="sortDirection === 'desc'" d="M7 10l5 5 5-5" />
                    <path v-else d="M7 14l5-5 5 5" />
                  </svg>
                </span>
              </div>
              <div class="col-action" />
            </div>
            <div class="record-table-body">
              <div
                v-for="(record, idx) in distPaged"
                :key="idx"
                class="record-row"
                :class="{ selected: selectedItems.has(distRecordKey(record)) }"
              >
                <div class="col-check">
                  <label class="checkbox-wrap">
                    <input
                      type="checkbox"
                      :checked="selectedItems.has(distRecordKey(record))"
                      @change="toggleSelect(distRecordKey(record))"
                    />
                    <span class="checkbox-custom" />
                  </label>
                </div>
                <div class="col-name">
                  <span class="skill-name">{{ getSkillName(record.skillId) }}</span>
                  <span class="skill-id">{{ record.skillId }}</span>
                </div>
                <div class="col-platform">
                  <div class="platform-info">
                    <ProviderIcon :icon="getDistPlatformId(record)" :size="16" variant="mono" />
                    <span v-if="record.scope === 'project'" class="platform-label">{{ getProjectName(record.platformId) }}</span>
                    <span v-else class="platform-label">{{ platformMap.get(record.platformId) || record.platformId }}</span>
                  </div>
                </div>
                <div class="col-mode">
                  <span class="mode-badge" :class="record.mode">{{ record.mode === 'symlink' ? '链接' : '复制' }}</span>
                </div>
                <div class="col-time">
                  {{ formatTime(record.distributedAt) }}
                </div>
                <div class="col-action">
                  <button type="button" class="delete-btn" @click.stop="confirmDeleteDist(record)" title="删除">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <div v-else-if="activeTab === 'translations'" class="records-list">
        <div v-if="hasQueueItems" class="stuck-bar">
          <span class="stuck-bar-text">{{ translationQueue.length }} 项翻译在队列中</span>
        </div>
        <div v-if="translationsTotal === 0" class="empty">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            style="color: hsl(var(--muted-foreground) / 0.4)"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          <p>暂无翻译记录</p>
          <p class="empty-hint">翻译 Skill 内容后，记录将显示在这里</p>
        </div>
        <template v-else>
          <div class="record-table trans-table">
            <div class="record-row header-row">
              <div class="col-check">
                <label class="checkbox-wrap">
                  <input
                    type="checkbox"
                    :checked="
                      isAllSelected(
                        translationsPaged.filter((i) => i.status === 'done').map((i) => ({ key: translationRecordKey(i.type, i.skillId) })),
                      )
                    "
                    @change="
                      toggleSelectAll(
                        translationsPaged.filter((i) => i.status === 'done').map((i) => ({ key: translationRecordKey(i.type, i.skillId) })),
                      )
                    "
                  />
                  <span class="checkbox-custom" />
                </label>
              </div>
              <div class="col-name">Skill 名称</div>
              <div class="col-type">翻译类型</div>
              <div class="col-preview">内容预览</div>
              <div class="col-time">时间</div>
              <div class="col-action" />
            </div>
            <div class="record-table-body">
              <div
                v-for="(item, idx) in translationsPaged"
                :key="idx"
                class="record-row"
                :class="{
                  'in-progress': item.status !== 'done',
                  translating: item.status === 'translating',
                  pending: item.status === 'pending',
                  selected: selectedItems.has(translationRecordKey(item.type, item.skillId)),
                }"
              >
                <div class="col-check">
                  <label v-if="item.status === 'done'" class="checkbox-wrap">
                    <input
                      type="checkbox"
                      :checked="selectedItems.has(translationRecordKey(item.type, item.skillId))"
                      @change="toggleSelect(translationRecordKey(item.type, item.skillId))"
                    />
                    <span class="checkbox-custom" />
                  </label>
                </div>
                <div class="col-name">
                  <span class="skill-name">{{ item.skillName }}</span>
                  <span class="skill-id">{{ item.skillId }}</span>
                </div>
                <div class="col-type">
                  <span class="type-badge" :class="item.type">{{ item.type === 'content' ? '内容翻译' : '描述翻译' }}</span>
                </div>
                <div class="col-preview">
                  <span v-if="item.status === 'translating'" class="preview-text translating-preview">
                    <svg class="spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    翻译中...
                  </span>
                  <span v-else-if="item.status === 'pending'" class="preview-text pending-preview"> 排队中... </span>
                  <span v-else class="preview-text">{{ truncate(item.preview, 80) }}</span>
                </div>
                <div class="col-time">
                  <span class="time-text">{{ item.updatedAt ? formatTime(item.updatedAt) : '—' }}</span>
                </div>
                <div class="col-action">
                  <button
                    v-if="item.status === 'done'"
                    type="button"
                    class="delete-btn"
                    title="删除"
                    @click.stop="confirmDeleteTranslation(item)"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                  </button>
                  <button
                    v-else
                    type="button"
                    class="stuck-clear-btn"
                    title="取消翻译"
                    @click.stop="cancelTranslation(item)"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <div v-else-if="activeTab === 'failures'" class="records-list">
        <div class="failure-filters">
          <button class="filter-btn" :class="{ active: failureTypeFilter === 'all' }" @click="setFailureTypeFilter('all')">全部</button>
          <button class="filter-btn" :class="{ active: failureTypeFilter === 'translation' }" @click="setFailureTypeFilter('translation')">
            翻译
          </button>
          <button class="filter-btn" :class="{ active: failureTypeFilter === 'download' }" @click="setFailureTypeFilter('download')">
            下载
          </button>
          <button
            class="filter-btn"
            :class="{ active: failureTypeFilter === 'distribution' }"
            @click="setFailureTypeFilter('distribution')"
          >
            分发
          </button>
        </div>
        <div v-if="failuresTotal === 0" class="empty">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            style="color: hsl(var(--muted-foreground) / 0.4)"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p>暂无失败记录</p>
          <p class="empty-hint">翻译、下载或分发失败时，记录将显示在这里</p>
        </div>
        <template v-else>
          <div class="record-table failures-table">
            <div class="record-row header-row">
              <div class="col-check">
                <label class="checkbox-wrap">
                  <input
                    type="checkbox"
                    :checked="isAllSelected(failuresPaged.map((r) => ({ key: failureRecordKey(r.id) })))"
                    @change="toggleSelectAll(failuresPaged.map((r) => ({ key: failureRecordKey(r.id) })))"
                  />
                  <span class="checkbox-custom" />
                </label>
              </div>
              <div class="col-type">类型</div>
              <div class="col-name">Skill 名称</div>
              <div class="col-error">错误信息</div>
              <div class="col-time">时间</div>
              <div class="col-action" />
            </div>
            <div class="record-table-body">
              <div
                v-for="(record, idx) in failuresPaged"
                :key="idx"
                class="record-row clickable"
                :class="{ selected: selectedItems.has(failureRecordKey(record.id)) }"
                @click="openFailureDetail(record)"
              >
                <div class="col-check">
                  <label class="checkbox-wrap">
                    <input
                      type="checkbox"
                      :checked="selectedItems.has(failureRecordKey(record.id))"
                      @change="toggleSelect(failureRecordKey(record.id))"
                    />
                    <span class="checkbox-custom" />
                  </label>
                </div>
                <div class="col-type">
                  <span class="failure-type-badge" :class="record.type">
                    {{ record.type === 'translation' ? '翻译' : record.type === 'download' ? '下载' : '分发' }}
                  </span>
                </div>
                <div class="col-name">
                  <span class="skill-name">{{ record.skillName }}</span>
                  <span class="skill-id">{{ record.skillId }}</span>
                </div>
                <div class="col-error">
                  <span
                    v-if="record.errorCategory"
                    class="error-category-badge"
                    :style="{ color: getErrorCategoryColor(record.errorCategory) }"
                  >
                    {{ getErrorCategoryLabel(record.errorCategory) }}
                  </span>
                  <span class="error-text">{{ truncate(record.error, 60) }}</span>
                </div>
                <div class="col-time">
                  {{ formatTime(record.timestamp) }}
                </div>
                <div class="col-action">
                  <button class="delete-btn" @click.stop="confirmDeleteFailure(record)" title="删除">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <div v-if="currentTotal > 0" class="page-footer">
      <div class="footer-left">
        <div v-if="selectedItems.size > 0" class="batch-toolbar">
          <span class="batch-count">已选择 {{ selectedItems.size }} 项</span>
          <button class="batch-delete-btn" @click="confirmBatchDelete">批量删除</button>
          <button class="batch-cancel-btn" @click="clearSelection">取消选择</button>
        </div>
        <span v-else class="footer-total">共 {{ currentTotal }} 条</span>
      </div>
      <div class="footer-right">
        <span class="footer-label">每页</span>
        <div class="page-size-dropdown-wrap">
          <button class="page-size-btn" @click="showPageSizeDropdown = !showPageSizeDropdown">
            {{ pageSize }}
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
          <div v-if="showPageSizeDropdown" class="page-size-dropdown">
            <button
              v-for="size in PAGE_SIZE_OPTIONS"
              :key="size"
              class="page-size-option"
              :class="{ active: pageSize === size }"
              @click="selectPageSize(size)"
            >
              {{ size }}
            </button>
          </div>
        </div>
        <span class="footer-label">条</span>
        <div class="footer-pagination">
          <button class="page-btn" :disabled="currentPage <= 1" @click="goToPage(currentPage - 1)">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span class="page-info">{{ currentPage }} / {{ currentPages }}</span>
          <button class="page-btn" :disabled="currentPage >= currentPages" @click="goToPage(currentPage + 1)">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="showDeleteConfirm" class="confirm-overlay" @click="showDeleteConfirm = false">
      <div class="confirm-modal" @click.stop>
        <div class="confirm-title">确认删除</div>
        <div class="confirm-message">
          确定要删除这条{{ deleteTarget?.type === 'dist' ? '分发' : deleteTarget?.type === 'failure' ? '失败' : '翻译' }}记录吗？
        </div>
        <div class="confirm-actions">
          <button type="button" class="confirm-cancel" @click="showDeleteConfirm = false">取消</button>
          <button type="button" class="confirm-ok" @click.stop="executeDelete">删除</button>
        </div>
      </div>
    </div>
    <div v-if="showBatchDeleteConfirm" class="confirm-overlay" @click="showBatchDeleteConfirm = false">
      <div class="confirm-modal" @click.stop>
        <div class="confirm-title">批量删除</div>
        <div class="confirm-message">确定要删除选中的 {{ selectedItems.size }} 条记录吗？此操作不可撤销。</div>
        <div class="confirm-actions">
          <button type="button" class="confirm-cancel" @click="showBatchDeleteConfirm = false">取消</button>
          <button type="button" class="confirm-ok" @click.stop="executeBatchDelete">删除 {{ selectedItems.size }} 项</button>
        </div>
      </div>
    </div>
    <div v-if="showFailureDetail && selectedFailureRecord" class="confirm-overlay" @click="closeFailureDetail">
      <div class="failure-detail-modal" @click.stop>
        <div class="failure-detail-header">
          <h3 class="failure-detail-title">错误详情</h3>
          <button class="panel-close" @click="closeFailureDetail">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div class="failure-detail-content">
          <div class="detail-section">
            <div class="detail-row">
              <span class="detail-label">类型</span>
              <span class="failure-type-badge" :class="selectedFailureRecord.type">
                {{ selectedFailureRecord.type === 'translation' ? '翻译' : selectedFailureRecord.type === 'download' ? '下载' : '分发' }}
              </span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Skill</span>
              <span class="detail-value">{{ selectedFailureRecord.skillName }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">时间</span>
              <span class="detail-value">{{ formatTime(selectedFailureRecord.timestamp) }}</span>
            </div>
          </div>

          <div class="detail-section">
            <div class="detail-row">
              <span class="detail-label">错误信息</span>
              <span class="detail-value error-message">{{ selectedFailureRecord.error }}</span>
            </div>
            <div v-if="selectedFailureRecord.details" class="detail-row">
              <span class="detail-label">详情</span>
              <span class="detail-value">{{ selectedFailureRecord.details }}</span>
            </div>
          </div>

          <div
            v-if="selectedFailureRecord.errorCategory || selectedFailureRecord.model || selectedFailureRecord.provider"
            class="detail-section"
          >
            <h4 class="section-title">技术信息</h4>
            <div v-if="selectedFailureRecord.errorCategory" class="detail-row">
              <span class="detail-label">错误分类</span>
              <span class="error-category-badge" :style="{ color: getErrorCategoryColor(selectedFailureRecord.errorCategory) }">
                {{ getErrorCategoryLabel(selectedFailureRecord.errorCategory) }}
              </span>
            </div>
            <div v-if="selectedFailureRecord.model" class="detail-row">
              <span class="detail-label">模型</span>
              <span class="detail-value mono">{{ selectedFailureRecord.model }}</span>
            </div>
            <div v-if="selectedFailureRecord.provider" class="detail-row">
              <span class="detail-label">供应商</span>
              <span class="detail-value mono">{{ selectedFailureRecord.provider }}</span>
            </div>
            <div v-if="selectedFailureRecord.endpoint" class="detail-row">
              <span class="detail-label">端点</span>
              <span class="detail-value mono small">{{ selectedFailureRecord.endpoint }}</span>
            </div>
            <div v-if="selectedFailureRecord.statusCode" class="detail-row">
              <span class="detail-label">HTTP 状态码</span>
              <span class="detail-value mono">{{ selectedFailureRecord.statusCode }}</span>
            </div>
            <div v-if="selectedFailureRecord.requestId" class="detail-row">
              <span class="detail-label">请求 ID</span>
              <span class="detail-value mono small">{{ selectedFailureRecord.requestId }}</span>
            </div>
            <div v-if="selectedFailureRecord.duration" class="detail-row">
              <span class="detail-label">耗时</span>
              <span class="detail-value">{{ selectedFailureRecord.duration }}ms</span>
            </div>
          </div>

          <div v-if="selectedFailureRecord.metadata?.rawResponse" class="detail-section">
            <h4 class="section-title">原始响应</h4>
            <pre class="raw-response">{{ selectedFailureRecord.metadata.rawResponse }}</pre>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.records-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
}

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

.toolbar-icon-btn:hover {
  background: hsl(var(--accent));
  color: hsl(var(--foreground));
}

.filter-tabs-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  align-self: stretch;
  width: 100%;
  box-sizing: border-box;
  gap: 4px;
  padding: 10px 28px 0;
  margin: 0;
}
/* Override global page-common .filter-tabs padding so tabs stay left-aligned with header */
.filter-tabs {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: 2px;
  flex: 1;
  min-width: 0;
  width: auto;
  padding: 0 !important;
  margin: 0;
}

.tab-btn {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
  white-space: nowrap;
  text-align: left;
}
.tab-btn:hover {
  background: hsl(var(--accent));
  color: hsl(var(--foreground));
  border-color: hsl(var(--border));
}
.tab-btn.active {
  background: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
  font-weight: 600;
  border-color: hsl(var(--primary) / 0.2);
}

.tab-count {
  font-size: 11px;
  font-weight: 600;
  padding: 0 6px;
  min-width: 22px;
  text-align: center;
  border-radius: 10px;
  background: hsl(var(--muted) / 0.7);
  color: hsl(var(--muted-foreground));
  line-height: 1.8;
}
.tab-btn.active .tab-count {
  background: hsl(var(--primary) / 0.15);
  color: hsl(var(--primary));
}
.tab-count.active {
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
}

.records-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 0 28px 16px;
}

.records-list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.empty {
  text-align: center;
  padding: 72px 32px;
  color: hsl(var(--muted-foreground));
  font-size: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}
.empty-hint {
  font-size: 13px;
  color: hsl(var(--muted-foreground) / 0.7);
}

.record-table {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
  width: 100%;
  margin-top: 16px;
  box-shadow: var(--shadow-sm);
}

.record-table-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: hsl(var(--muted-foreground) / 0.55) hsl(var(--border) / 0.6);
}
.record-table-body::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.record-table-body::-webkit-scrollbar-track {
  background: hsl(var(--border) / 0.6);
  border-radius: 99px;
}
.record-table-body::-webkit-scrollbar-thumb {
  background: hsl(var(--muted-foreground) / 0.55);
  border-radius: 99px;
}
.record-table-body::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--muted-foreground) / 0.75);
}

.record-table-body .record-row:last-child {
  border-radius: 0 0 12px 12px;
}

.record-row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 0.7fr 1.2fr;
  gap: 14px;
  align-items: center;
  padding: 14px 18px;
  border-bottom: 1px solid hsl(var(--border));
  font-size: 13px;
  color: hsl(var(--foreground));
  transition: background var(--duration-base) var(--ease-standard);
  min-width: 0;
}

.downloads-table .record-row {
  grid-template-columns: 28px 2fr 1fr 1.2fr;
}
.downloads-table .col-status {
  justify-content: flex-start;
}
.downloads-table .col-source {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  text-align: left;
}
.downloads-table .col-name,
.downloads-table .col-time {
  text-align: left;
}

.dist-table .record-row {
  grid-template-columns: 36px 2fr 2fr 1fr 1.2fr 40px;
}
.record-row:last-child {
  border-bottom: none;
}
.record-row:not(.header-row):hover {
  background: hsl(var(--accent) / 0.4);
}
.record-row.selected {
  background: hsl(var(--primary) / 0.06);
}

.header-row {
  flex-shrink: 0;
  background: hsl(var(--muted));
  font-weight: 600;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  border-radius: 12px 12px 0 0;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  /* match record-table-body scrollbar-gutter (8px) so columns stay aligned */
  padding-right: 26px;
}

.col-action {
  width: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sortable {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  user-select: none;
}
.sortable:hover {
  color: hsl(var(--foreground));
}
.sort-indicator {
  display: inline-flex;
  align-items: center;
  color: hsl(var(--muted-foreground));
  transition: color var(--duration-base) var(--ease-standard);
}
.sortable:hover .sort-indicator {
  color: hsl(var(--foreground));
}
.sort-indicator.active {
  color: hsl(var(--primary));
}

.trans-table .record-row {
  grid-template-columns: 36px 2fr 1fr 2fr 1fr 40px;
}

.col-time {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.col-status {
  width: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.col-name,
.col-source,
.col-time,
.col-platform,
.col-mode,
.col-scope,
.col-type,
.col-preview {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skill-name {
  font-weight: 500;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.skill-id {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  display: block;
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-badge,
.platform-badge {
  font-size: 11px;
  font-weight: 500;
  padding: 3px 10px;
  border-radius: 6px;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.platform-info {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.platform-label {
  font-size: 12px;
  font-weight: 500;
  color: hsl(var(--foreground));
}

.tag-icon-svg {
  display: inline-flex;
  align-items: center;
}
.tag-icon-svg svg {
  width: 10px;
  height: 10px;
}

.delete-btn {
  width: 30px;
  height: 30px;
  border: none;
  background: transparent;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-base) var(--ease-standard);
  opacity: 0.45;
  pointer-events: auto;
}
.record-row:hover .delete-btn,
.record-row.selected .delete-btn {
  opacity: 1;
}
.delete-btn:hover {
  background: hsl(var(--destructive) / 0.1);
  color: hsl(var(--destructive));
  opacity: 1;
}

.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}
.confirm-modal {
  width: 380px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 14px;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.confirm-title {
  padding: 18px 22px 0;
  font-weight: 600;
  font-size: 16px;
}
.confirm-message {
  padding: 14px 22px;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  line-height: 1.5;
}
.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 22px 18px;
}
.confirm-cancel {
  padding: 8px 18px;
  font-size: 13px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: transparent;
  color: hsl(var(--foreground));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
}
.confirm-cancel:hover {
  background: hsl(var(--accent));
}
.confirm-ok {
  padding: 8px 18px;
  font-size: 13px;
  border: none;
  border-radius: 8px;
  background: hsl(var(--destructive));
  color: hsl(var(--destructive-foreground));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
}
.confirm-ok:hover {
  opacity: 0.9;
}

.mode-badge {
  font-size: 11px;
  font-weight: 500;
  padding: 3px 10px;
  border-radius: 6px;
  white-space: nowrap;
}
.mode-badge.symlink {
  background: hsl(142 60% 44% / 0.1);
  color: hsl(142 60% 44%);
}
.mode-badge.copy {
  background: hsl(210 80% 50% / 0.1);
  color: hsl(210 80% 50%);
}

.type-badge {
  font-size: 11px;
  font-weight: 500;
  padding: 3px 10px;
  border-radius: 6px;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.type-badge.content {
  background: hsl(260 60% 55% / 0.1);
  color: hsl(260 60% 55%);
}
.type-badge.desc {
  background: hsl(38 90% 50% / 0.1);
  color: hsl(38 90% 50%);
}
.type-badge.translating {
  background: hsl(210 80% 50% / 0.1);
  color: hsl(210 80% 50%);
}
.record-row.in-progress {
  background: hsl(210 80% 50% / 0.03);
}
.record-row.translating {
  background: hsl(210 80% 50% / 0.06);
}
.record-row.pending {
  background: hsl(38 90% 50% / 0.05);
}

.col-preview {
  overflow: hidden;
}
.preview-text {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.translating-preview {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: hsl(210 80% 50%);
}
.pending-preview {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: hsl(38 90% 50%);
}

.col-check {
  width: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.checkbox-wrap {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}
.checkbox-wrap input[type='checkbox'] {
  display: none;
}
.checkbox-custom {
  width: 16px;
  height: 16px;
  border: 1.5px solid hsl(var(--border));
  border-radius: 4px;
  background: hsl(var(--card));
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-base) var(--ease-standard);
}

[data-theme='dark'] .checkbox-custom {
  border-color: hsl(250 15% 22%);
  box-shadow: 0 0 0 1px hsl(250 15% 14%);
}
.checkbox-wrap input[type='checkbox']:checked + .checkbox-custom {
  background: hsl(var(--primary));
  border-color: hsl(var(--primary));
}
.checkbox-wrap input[type='checkbox']:checked + .checkbox-custom::after {
  content: '';
  width: 8px;
  height: 5px;
  border-left: 2px solid white;
  border-bottom: 2px solid white;
  transform: rotate(-45deg) translateY(-1px);
}
.checkbox-wrap:hover .checkbox-custom {
  border-color: hsl(var(--primary) / 0.5);
}

[data-theme='dark'] .checkbox-wrap:hover .checkbox-custom {
  border-color: hsl(var(--primary) / 0.6);
  box-shadow: 0 0 0 1px hsl(var(--primary) / 0.2);
}

.batch-toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
}
.batch-count {
  font-size: 13px;
  font-weight: 500;
  color: hsl(var(--primary));
}
.batch-delete-btn {
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 500;
  border: none;
  border-radius: 7px;
  background: hsl(var(--destructive));
  color: hsl(var(--destructive-foreground));
  cursor: pointer;
  transition: opacity var(--duration-base) var(--ease-standard);
}
.batch-delete-btn:hover {
  opacity: 0.9;
}
.batch-cancel-btn {
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid hsl(var(--border));
  border-radius: 7px;
  background: transparent;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
}
.batch-cancel-btn:hover {
  background: hsl(var(--accent));
  color: hsl(var(--foreground));
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.spinning {
  animation: spin 1s linear infinite;
}
.spin {
  animation: spin 0.7s linear infinite;
}

.queue-list {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
  overflow: hidden;
}
.queue-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  border-bottom: 1px solid hsl(var(--border));
  background: hsl(var(--muted) / 0.3);
}
.queue-title {
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--foreground));
}
.queue-clear-btn {
  font-size: 12px;
  padding: 5px 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
  background: transparent;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
}
.queue-clear-btn:hover {
  background: hsl(var(--accent));
  color: hsl(var(--foreground));
}

.clear-bar {
  display: flex;
  justify-content: flex-end;
  padding: 12px 0 0;
}
.clear-btn {
  font-size: 12px;
  padding: 6px 14px;
  border: 1px solid hsl(var(--border));
  border-radius: 7px;
  background: transparent;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
}
.clear-btn:hover {
  background: hsl(var(--accent));
  color: hsl(var(--foreground));
}

.queue-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 18px;
  border-bottom: 1px solid hsl(var(--border));
  transition: background var(--duration-base) var(--ease-standard);
}
.queue-item:last-child {
  border-bottom: none;
}
.queue-item:hover {
  background: hsl(var(--accent) / 0.4);
}
.queue-item-icon {
  flex-shrink: 0;
}
.queue-item-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.queue-item-name {
  font-size: 13px;
  font-weight: 500;
  color: hsl(var(--foreground));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.queue-item-meta {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}
.queue-item.success .queue-item-name {
  color: hsl(142 50% 40%);
}
.queue-item.error .queue-item-name {
  color: hsl(var(--destructive));
}
.queue-item-error {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  font-size: 11px;
  font-weight: 700;
  border-radius: 50%;
  background: hsl(var(--destructive));
  color: hsl(var(--destructive-foreground));
  flex-shrink: 0;
}

.page-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 28px;
  border-top: 1px solid hsl(var(--border));
  background: hsl(var(--card));
  flex-shrink: 0;
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.footer-total {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}
.footer-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.footer-label {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.footer-pagination {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 10px;
  padding-left: 14px;
  border-left: 1px solid hsl(var(--border));
}

.page-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: hsl(var(--card));
  color: hsl(var(--foreground));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
}
.page-btn:hover:not(:disabled) {
  background: hsl(var(--accent));
  border-color: hsl(var(--primary) / 0.3);
}
.page-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.page-info {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  min-width: 50px;
  text-align: center;
}

.page-size-dropdown-wrap {
  position: relative;
}

.page-size-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  font-size: 13px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: hsl(var(--card));
  color: hsl(var(--foreground));
  cursor: pointer;
  outline: none;
  transition: border-color var(--duration-base) var(--ease-standard);
  width: 52px;
  justify-content: center;
}
.page-size-btn:hover {
  border-color: hsl(var(--primary) / 0.5);
}

.page-size-dropdown {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-bottom: 6px;
  min-width: 84px;
  background: hsl(var(--app-settings-card-bg));
  border: 1px solid hsl(var(--app-settings-card-border));
  border-radius: 10px;
  box-shadow: var(--app-settings-card-shadow);
  z-index: 100;
  padding: 4px;
  overflow: hidden;
}

.page-size-option {
  display: block;
  width: 100%;
  padding: 7px 14px;
  font-size: 13px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: hsl(var(--foreground));
  cursor: pointer;
  text-align: left;
  transition: background var(--duration-base) var(--ease-standard);
}
.page-size-option:hover {
  background: hsl(var(--accent));
}
.page-size-option.active {
  background: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
  font-weight: 600;
}

.stuck-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 18px;
  margin-top: 16px;
  flex-shrink: 0;
  background: hsl(38 90% 50% / 0.08);
  border: 1px solid hsl(38 90% 50% / 0.2);
  border-radius: 12px;
  font-size: 13px;
}
.stuck-bar-text {
  flex: 1;
  color: hsl(38 90% 40%);
  font-weight: 500;
}
.stuck-clear-btn {
  width: 30px;
  height: 30px;
  border: none;
  background: transparent;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-base) var(--ease-standard);
}
.stuck-clear-btn:hover {
  background: hsl(var(--destructive) / 0.1);
  color: hsl(var(--destructive));
}

.failure-filters {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 0 0;
}
.filter-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 12px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
  white-space: nowrap;
}
.filter-btn:hover {
  background: hsl(var(--accent));
  color: hsl(var(--foreground));
  border-color: hsl(var(--border));
}
.filter-btn.active {
  background: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
  font-weight: 600;
  border-color: hsl(var(--primary) / 0.2);
}

.failures-table .record-row {
  grid-template-columns: 36px 100px 2fr 2fr 1.2fr 40px;
}

.failure-type-badge {
  font-size: 11px;
  font-weight: 500;
  padding: 3px 10px;
  border-radius: 6px;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.failure-type-badge.translation {
  background: hsl(260 60% 55% / 0.1);
  color: hsl(260 60% 55%);
}
.failure-type-badge.download {
  background: hsl(210 80% 50% / 0.1);
  color: hsl(210 80% 50%);
}
.failure-type-badge.distribution {
  background: hsl(142 60% 44% / 0.1);
  color: hsl(142 60% 44%);
}

.col-error {
  overflow: hidden;
}
.error-text {
  font-size: 12px;
  color: hsl(var(--destructive));
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.error-category-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 5px;
  display: inline-block;
  margin-bottom: 3px;
  background: hsl(var(--muted));
}

.tab-count.error {
  background: hsl(var(--destructive) / 0.15);
  color: hsl(var(--destructive));
}

.clickable {
  cursor: pointer;
}
.clickable:hover {
  background: hsl(var(--accent) / 0.6);
}

.failure-detail-modal {
  width: 580px;
  max-width: 95vw;
  max-height: 80vh;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 14px;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.failure-detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px;
  border-bottom: 1px solid hsl(var(--border));
}

.failure-detail-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.panel-close {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-base) var(--ease-standard);
}
.panel-close:hover {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
}

.failure-detail-content {
  flex: 1;
  overflow-y: auto;
  padding: 18px 22px;
}

.detail-section {
  margin-bottom: 18px;
  padding-bottom: 18px;
  border-bottom: 1px solid hsl(var(--border));
}
.detail-section:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: hsl(var(--muted-foreground));
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.detail-row {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 10px;
}
.detail-row:last-child {
  margin-bottom: 0;
}

.detail-label {
  font-size: 12px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  min-width: 84px;
  flex-shrink: 0;
  padding-top: 2px;
}

.detail-value {
  font-size: 13px;
  color: hsl(var(--foreground));
  word-break: break-word;
}
.detail-value.mono {
  font-family: monospace;
  font-size: 12px;
}
.detail-value.small {
  font-size: 11px;
}
.detail-value.error-message {
  color: hsl(var(--destructive));
  font-weight: 500;
}

.raw-response {
  font-family: monospace;
  font-size: 11px;
  line-height: 1.6;
  background: hsl(var(--muted));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  padding: 12px 14px;
  margin: 0;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 160px;
  overflow-y: auto;
}
</style>

<script setup lang="ts">
import { ref, computed, onMounted, inject, watch } from 'vue'
import { storage } from '../../utils/storage'
import type { InstallRecord } from '../../types'
import { defaultPlatforms } from '../../data/platforms'
import { KeyCurrentRoute } from '../../inject-keys'
import { useDownloadQueue } from '../../composables/useDownloadQueue'
import { getSourceInfo as getSourceInfoUtil } from '../../utils/source-info'
import type { Skill } from '../../types'
import PlatformIcon from '../../components/PlatformIcon.vue'

const emit = defineEmits(['navigate'])

const currentRoute = inject(KeyCurrentRoute, ref('my'))
const activeTab = ref<'downloads' | 'dist' | 'translations'>('downloads')

const { queue, activeCount, clearCompleted } = useDownloadQueue()

const sessionDownloads = computed(() => storage.getSessionDownloads())
const installRecords = ref<InstallRecord[]>([])
const translations = ref<Record<string, { sourceContent: string; translatedContent: string; mode: string }>>({})
const descTranslations = ref<Record<string, string>>({})

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

const showDeleteConfirm = ref(false)
const deleteTarget = ref<{ type: 'dist' | 'translation'; data: any } | null>(null)

function confirmDeleteDist(record: InstallRecord) {
  deleteTarget.value = { type: 'dist', data: record }
  showDeleteConfirm.value = true
}

function confirmDeleteTranslation(item: { skillId: string; type: string }) {
  deleteTarget.value = { type: 'translation', data: item }
  showDeleteConfirm.value = true
}

function executeDelete() {
  if (!deleteTarget.value) return
  if (deleteTarget.value.type === 'dist') {
    const r = deleteTarget.value.data
    storage.removeInstallRecord(r.skillId, r.platformId, r.scope)
  } else {
    const item = deleteTarget.value.data
    if (item.type === 'content') storage.removeTranslation(item.skillId)
    else storage.removeTranslationDesc(item.skillId)
  }
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

function loadData() {
  installRecords.value = storage.getInstallRecords()
  const cacheRaw = storage._readTranslationCache()
  translations.value = cacheRaw
  const descRaw = storage._readDescTranslationCache()
  descTranslations.value = descRaw
}

function getSkillName(skillId: string): string {
  const cached = storage.getCachedSkills()
  const skill = cached.find(s => s.id === skillId)
  return skill?.name || skillId
}

function getSourceInfoForDownload(source: string): { label: string; icon: string; color: string; bg: string } {
  const skill: Skill = { id: '', name: '', description: '', author: '', tags: [], format: 'opencode', source: 'local' }
  if (source === 'skills-sh') { skill.source = 'skills-sh' }
  else if (source === 'claude') { skill.repo = 'anthropics/skills' }
  else if (source === 'codex') { skill.repo = 'openai/skills' }
  else if (source === 'import') { skill.repo = 'unknown' }
  else if (source === 'agent') { skill.source = 'local' }
  else if (source === 'local') { skill.source = 'local' }
  else if (source === 'marketplace') { skill.storeSourceId = 'skills-sh' }
  else if (source === 'project') { skill.source = 'local' }
  else { skill.storeSourceId = source }
  return getSourceInfoUtil(skill)
}

function getSourceLabel(source: string): string {
  return getSourceInfoForDownload(source).label
}

function getProjectFileName(targetPath: string): string {
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
  const project = projects.find(p => p.id === pid)
  return project?.name || pid
}

function getDistPlatformId(record: InstallRecord): string {
  const normalized = record.targetPath.replace(/\\/g, '/').toLowerCase()
  for (const p of defaultPlatforms) {
    if (p.projectPath && normalized.includes(p.projectPath.replace(/\\/g, '/').toLowerCase())) {
      return p.id
    }
  }
  if (normalized.includes('.agents/skills')) return '_generic'
  return record.platformId
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return iso
  }
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

const downloadQueueItems = computed(() => queue.value.filter(item => item.type === 'download'))
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
  const queuedIds = new Set(downloadQueueItems.value.map(item => item.skillId))
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

const distTotal = computed(() => installRecords.value.length)
const distPages = computed(() => Math.max(1, Math.ceil(distTotal.value / pageSize.value)))
const distPaged = computed(() => {
  const sorted = [...installRecords.value].sort((a, b) => {
    const diff = new Date(a.installedAt).getTime() - new Date(b.installedAt).getTime()
    return sortDirection.value === 'asc' ? diff : -diff
  })
  const start = (currentPage.value - 1) * pageSize.value
  return sorted.slice(start, start + pageSize.value)
})

const translationsList = computed(() => {
  const list: Array<{ skillId: string; type: 'content' | 'desc'; preview: string }> = []
  for (const [skillId, data] of Object.entries(translations.value)) {
    list.push({ skillId, type: 'content', preview: data.translatedContent })
  }
  for (const [skillId, desc] of Object.entries(descTranslations.value)) {
    list.push({ skillId, type: 'desc', preview: desc })
  }
  return list
})
const translationsTotal = computed(() => translationsList.value.length)
const translationsPages = computed(() => Math.max(1, Math.ceil(translationsTotal.value / pageSize.value)))
const translationsPaged = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return translationsList.value.slice(start, start + pageSize.value)
})

const currentTotal = computed(() => {
  if (activeTab.value === 'downloads') return downloadsTotal.value
  if (activeTab.value === 'dist') return distTotal.value
  return translationsTotal.value
})

const currentPages = computed(() => {
  if (activeTab.value === 'downloads') return downloadsPages.value
  if (activeTab.value === 'dist') return distPages.value
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
    </div>

    <div class="filter-tabs-row">
      <div class="filter-tabs">
        <button class="tab-btn" :class="{ active: activeTab === 'downloads' }" @click="activeTab = 'downloads'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :class="{ spinning: activeCount > 0 }">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          下载记录
          <span v-if="activeCount > 0" class="tab-count active">{{ activeCount }}</span>
          <span v-else class="tab-count">{{ downloadsTotal }}</span>
        </button>
        <button class="tab-btn" :class="{ active: activeTab === 'dist' }" @click="activeTab = 'dist'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
          分发记录
          <span class="tab-count">{{ distTotal }}</span>
        </button>
        <button class="tab-btn" :class="{ active: activeTab === 'translations' }" @click="activeTab = 'translations'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          翻译记录
          <span class="tab-count">{{ translationsTotal }}</span>
        </button>
      </div>
    </div>

    <div class="records-content">
      <div v-if="activeTab === 'downloads'" class="records-list">
        <div v-if="downloadsTotal === 0 && downloadQueueItems.length === 0" class="empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: hsl(var(--muted-foreground) / 0.4)">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <p>暂无下载记录</p>
          <p class="empty-hint">从商店下载 Skill 时，进度将显示在这里</p>
        </div>
        <template v-else>
          <div class="record-table downloads-table">
            <div class="record-row header-row">
              <div class="col-status"></div>
              <div class="col-name">Skill 名称</div>
              <div class="col-source">来源</div>
              <div class="col-time sortable" @click="toggleSort">
                时间
                <span class="sort-indicator" :class="{ active: true }">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path v-if="sortDirection === 'desc'" d="M7 10l5 5 5-5"/>
                    <path v-else d="M7 14l5-5 5 5"/>
                  </svg>
                </span>
              </div>
            </div>
            <div v-for="(record, idx) in downloadsPaged" :key="idx" class="record-row">
              <div class="col-status">
                <svg v-if="record.status" width="14" height="14" viewBox="0 0 24 24" fill="none" :stroke="getStatusColor(record.status)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :class="{ spinning: record.status === 'running' }">
                  <path :d="getStatusIcon(record.status)" />
                </svg>
                <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="hsl(142 50% 45%)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 6 9 17 4 12"/>
                </svg>
              </div>
              <div class="col-name">
                <span class="skill-name">{{ record.skillName }}</span>
                <span class="skill-id">{{ record.skillId }}</span>
              </div>
              <div class="col-source">
                <span class="source-badge" :style="{ color: getSourceInfoForDownload(record.source).color, background: getSourceInfoForDownload(record.source).bg }">
                  <svg v-if="getSourceInfoForDownload(record.source).icon === 'multi'" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="2" y1="12" x2="22" y2="12"/>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                  </svg>
                  <img v-else-if="getSourceInfoForDownload(record.source).icon.startsWith('http') || getSourceInfoForDownload(record.source).icon.includes('/')" :src="getSourceInfoForDownload(record.source).icon" width="10" height="10" alt="" style="border-radius: 2px;" />
                  <span v-else-if="getSourceInfoForDownload(record.source).icon.startsWith('<')" v-html="getSourceInfoForDownload(record.source).icon" class="tag-icon-svg"></span>
                  <svg v-else-if="getSourceInfoForDownload(record.source).icon === 'git'" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="18" cy="18" r="3"/>
                    <circle cx="6" cy="6" r="3"/>
                    <path d="M13 6h3a2 2 0 0 1 2 2v7"/>
                    <line x1="6" y1="9" x2="6" y2="21"/>
                  </svg>
                  {{ getSourceLabel(record.source) }}
                </span>
              </div>
              <div class="col-time">{{ record.status === 'running' ? formatQueueTime(new Date(record.downloadedAt).getTime()) : formatTime(record.downloadedAt) }}</div>
            </div>
          </div>
          <div v-if="queue.some(i => i.status === 'success' || i.status === 'error')" class="clear-bar">
            <button class="clear-btn" @click="clearCompleted">清除已完成</button>
          </div>
        </template>
      </div>

      <div v-else-if="activeTab === 'dist'" class="records-list">
        <div v-if="distTotal === 0" class="empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: hsl(var(--muted-foreground) / 0.4)">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
          <p>暂无分发记录</p>
          <p class="empty-hint">将 Skill 分发到平台后，记录将显示在这里</p>
        </div>
        <template v-else>
          <div class="record-table dist-table">
            <div class="record-row header-row">
              <div class="col-name">Skill 名称</div>
              <div class="col-platform">目标平台</div>
              <div class="col-mode">模式</div>
              <div class="col-time sortable" @click="toggleSort">
                时间
                <span class="sort-indicator" :class="{ active: true }">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path v-if="sortDirection === 'desc'" d="M7 10l5 5 5-5"/>
                    <path v-else d="M7 14l5-5 5 5"/>
                  </svg>
                </span>
              </div>
              <div class="col-action"></div>
            </div>
            <div v-for="(record, idx) in distPaged" :key="idx" class="record-row">
              <div class="col-name">
                <span class="skill-name">{{ getSkillName(record.skillId) }}</span>
                <span class="skill-id">{{ record.skillId }}</span>
              </div>
              <div class="col-platform">
                <div class="platform-info">
                  <PlatformIcon :platform-id="getDistPlatformId(record)" :size="16" />
                  <span v-if="record.scope === 'project'" class="platform-label">{{ getProjectName(record.platformId) }}</span>
                  <span v-else class="platform-label">{{ platformMap.get(record.platformId) || record.platformId }}</span>
                </div>
              </div>
              <div class="col-mode">
                <span class="mode-badge" :class="record.mode">{{ record.mode === 'symlink' ? '链接' : '复制' }}</span>
              </div>
              <div class="col-time">{{ formatTime(record.installedAt) }}</div>
              <div class="col-action">
                <button class="delete-btn" @click.stop="confirmDeleteDist(record)" title="删除">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>

      <div v-else-if="activeTab === 'translations'" class="records-list">
        <div v-if="translationsTotal === 0" class="empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: hsl(var(--muted-foreground) / 0.4)">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          <p>暂无翻译记录</p>
          <p class="empty-hint">翻译 Skill 内容后，记录将显示在这里</p>
        </div>
        <template v-else>
          <div class="record-table trans-table">
            <div class="record-row header-row">
              <div class="col-name">Skill 名称</div>
              <div class="col-type">翻译类型</div>
              <div class="col-preview">内容预览</div>
              <div class="col-action"></div>
            </div>
            <div v-for="(item, idx) in translationsPaged" :key="idx" class="record-row">
              <div class="col-name">
                <span class="skill-name">{{ getSkillName(item.skillId) }}</span>
                <span class="skill-id">{{ item.skillId }}</span>
              </div>
              <div class="col-type">
                <span class="type-badge" :class="item.type">{{ item.type === 'content' ? '内容翻译' : '描述翻译' }}</span>
              </div>
              <div class="col-preview">
                <span class="preview-text">{{ truncate(item.preview, 80) }}</span>
              </div>
              <div class="col-action">
                <button class="delete-btn" @click.stop="confirmDeleteTranslation(item)" title="删除">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <div class="page-footer">
      <span class="footer-total">共 {{ currentTotal }} 条</span>
      <div class="footer-right">
        <span class="footer-label">每页</span>
        <div class="page-size-dropdown-wrap">
          <button class="page-size-btn" @click="showPageSizeDropdown = !showPageSizeDropdown">
            {{ pageSize }}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
          <div v-if="showPageSizeDropdown" class="page-size-dropdown">
            <button v-for="size in PAGE_SIZE_OPTIONS" :key="size" class="page-size-option" :class="{ active: pageSize === size }" @click="selectPageSize(size)">
              {{ size }}
            </button>
          </div>
        </div>
        <span class="footer-label">条</span>
        <div class="footer-pagination">
          <button class="page-btn" :disabled="currentPage <= 1" @click="goToPage(currentPage - 1)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span class="page-info">{{ currentPage }} / {{ currentPages }}</span>
          <button class="page-btn" :disabled="currentPage >= currentPages" @click="goToPage(currentPage + 1)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
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
          确定要删除这条{{ deleteTarget?.type === 'dist' ? '分发' : '翻译' }}记录吗？
        </div>
        <div class="confirm-actions">
          <button class="confirm-cancel" @click="showDeleteConfirm = false">取消</button>
          <button class="confirm-ok" @click="executeDelete">删除</button>
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

.header-left { display: flex; flex-direction: column; gap: 6px; }
.header-title-row { display: flex; align-items: center; gap: 10px; }
.header-left h2 { font-size: 22px; font-weight: 600; color: hsl(var(--foreground)); margin: 0; }
.page-subtitle { font-size: 13px; color: hsl(var(--muted-foreground)); margin: 0; }

.filter-tabs-row { display: flex; align-items: center; gap: 4px; padding: 10px 28px 0; }
.filter-tabs { display: flex; align-items: center; gap: 2px; }

.tab-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 6px 10px; font-size: 13px; font-weight: 500;
  border: none; border-radius: 6px; background: transparent;
  color: hsl(var(--muted-foreground)); cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard); white-space: nowrap;
}
.tab-btn:hover { background: hsl(var(--accent)); color: hsl(var(--foreground)); }
.tab-btn.active { background: hsl(var(--primary) / 0.1); color: hsl(var(--primary)); font-weight: 600; }

.tab-count {
  font-size: 11px; font-weight: 600; padding: 0 4px; min-width: 20px;
  text-align: center; border-radius: 6px;
  background: hsl(var(--muted) / 0.6); color: hsl(var(--muted-foreground)); line-height: 1.6;
}
.tab-btn.active .tab-count { background: hsl(var(--primary) / 0.15); color: hsl(var(--primary)); }
.tab-count.active { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); }

.records-content {
  flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
  padding: 0 28px 12px;
}

.empty {
  text-align: center; padding: 64px 28px; color: hsl(var(--muted-foreground));
  font-size: 14px; display: flex; flex-direction: column; align-items: center; gap: 12px;
}
.empty-hint { font-size: 12px; color: hsl(var(--muted-foreground) / 0.7); }

.record-table {
  background: hsl(var(--card)); border: 1px solid hsl(var(--border));
  border-radius: 12px; width: 100%; margin-top: 16px;
}

.record-table .record-row:first-child { border-radius: 12px 12px 0 0; }
.record-table .record-row:last-child { border-radius: 0 0 12px 12px; }
.record-table .record-row:only-child { border-radius: 12px; }

.record-row {
  display: grid; grid-template-columns: 2fr 1fr 1fr 0.7fr 1.2fr;
  gap: 12px; align-items: center; padding: 12px 16px;
  border-bottom: 1px solid hsl(var(--border)); font-size: 13px;
  color: hsl(var(--foreground)); transition: background var(--duration-base) var(--ease-standard);
  min-width: 0;
}

.downloads-table .record-row {
  grid-template-columns: 28px 2fr 1fr 1.2fr;
}

.dist-table .record-row {
  grid-template-columns: 2fr 2fr 1fr 1.2fr 40px;
}
.record-row:last-child { border-bottom: none; }
.record-row:not(.header-row):hover { background: hsl(var(--accent) / 0.5); }

.header-row {
  background: hsl(var(--muted)); font-weight: 600; font-size: 12px; color: hsl(var(--muted-foreground));
  position: sticky; top: 0; z-index: 2;
}

.col-action { width: 40px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

.sortable { cursor: pointer; display: inline-flex; align-items: center; gap: 3px; user-select: none; }
.sortable:hover { color: hsl(var(--foreground)); }
.sort-indicator { display: inline-flex; align-items: center; color: hsl(var(--muted-foreground)); transition: color var(--duration-base) var(--ease-standard); }
.sortable:hover .sort-indicator { color: hsl(var(--foreground)); }
.sort-indicator.active { color: hsl(var(--primary)); }

.trans-table .record-row {
  grid-template-columns: 2fr 1fr 2fr 40px;
}

.col-status { width: 28px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

.col-name, .col-source, .col-time, .col-platform, .col-mode, .col-scope, .col-type, .col-preview {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.skill-name { font-weight: 500; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.skill-id { font-size: 11px; color: hsl(var(--muted-foreground)); display: block; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.source-badge, .platform-badge {
  font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: 6px;
  white-space: nowrap; display: inline-flex; align-items: center; gap: 4px;
}

.platform-info { display: flex; align-items: center; gap: 6px; width: 100%; }
.platform-label { font-size: 12px; font-weight: 500; color: hsl(var(--foreground)); }

.tag-icon-svg { display: inline-flex; align-items: center; }
.tag-icon-svg svg { width: 10px; height: 10px; }

.delete-btn {
  width: 28px; height: 28px; border: none; background: transparent;
  color: hsl(var(--muted-foreground)); cursor: pointer; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  transition: all var(--duration-base) var(--ease-standard); opacity: 0;
}
.record-row:hover .delete-btn { opacity: 1; }
.delete-btn:hover { background: hsl(var(--destructive) / 0.1); color: hsl(var(--destructive)); }

.confirm-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;
}
.confirm-modal {
  width: 360px; background: hsl(var(--card));
  border: 1px solid hsl(var(--border)); border-radius: 12px;
  box-shadow: var(--shadow-lg); overflow: hidden;
}
.confirm-title { padding: 16px 20px 0; font-weight: 600; font-size: 15px; }
.confirm-message { padding: 12px 20px; font-size: 13px; color: hsl(var(--muted-foreground)); }
.confirm-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 20px 16px; }
.confirm-cancel {
  padding: 7px 16px; font-size: 13px; border: 1px solid hsl(var(--border));
  border-radius: 8px; background: transparent; color: hsl(var(--foreground));
  cursor: pointer; transition: all var(--duration-base) var(--ease-standard);
}
.confirm-cancel:hover { background: hsl(var(--accent)); }
.confirm-ok {
  padding: 7px 16px; font-size: 13px; border: none;
  border-radius: 8px; background: hsl(var(--destructive));
  color: hsl(var(--destructive-foreground)); cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
}
.confirm-ok:hover { opacity: 0.9; }

.mode-badge { font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: 6px; white-space: nowrap; }
.mode-badge.symlink { background: hsl(142 60% 44% / 0.1); color: hsl(142 60% 44%); }
.mode-badge.copy { background: hsl(210 80% 50% / 0.1); color: hsl(210 80% 50%); }

.type-badge { font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: 6px; white-space: nowrap; }
.type-badge.content { background: hsl(260 60% 55% / 0.1); color: hsl(260 60% 55%); }
.type-badge.desc { background: hsl(38 90% 50% / 0.1); color: hsl(38 90% 50%); }

.col-preview { overflow: hidden; }
.preview-text { font-size: 12px; color: hsl(var(--muted-foreground)); display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

@keyframes spin { to { transform: rotate(360deg); } }
.spinning { animation: spin 1s linear infinite; }

.queue-list { background: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: 12px; overflow: hidden; }
.queue-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid hsl(var(--border)); background: hsl(var(--muted) / 0.3); }
.queue-title { font-size: 13px; font-weight: 600; color: hsl(var(--foreground)); }
.queue-clear-btn { font-size: 12px; padding: 4px 10px; border: 1px solid hsl(var(--border)); border-radius: 6px; background: transparent; color: hsl(var(--muted-foreground)); cursor: pointer; transition: all var(--duration-base) var(--ease-standard); }
.queue-clear-btn:hover { background: hsl(var(--accent)); color: hsl(var(--foreground)); }

.clear-bar { display: flex; justify-content: flex-end; padding: 10px 0 0; }
.clear-btn { font-size: 12px; padding: 5px 12px; border: 1px solid hsl(var(--border)); border-radius: 6px; background: transparent; color: hsl(var(--muted-foreground)); cursor: pointer; transition: all var(--duration-base) var(--ease-standard); }
.clear-btn:hover { background: hsl(var(--accent)); color: hsl(var(--foreground)); }

.queue-item { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid hsl(var(--border)); transition: background var(--duration-base) var(--ease-standard); }
.queue-item:last-child { border-bottom: none; }
.queue-item:hover { background: hsl(var(--accent) / 0.5); }
.queue-item-icon { flex-shrink: 0; }
.queue-item-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.queue-item-name { font-size: 13px; font-weight: 500; color: hsl(var(--foreground)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.queue-item-meta { font-size: 11px; color: hsl(var(--muted-foreground)); }
.queue-item.success .queue-item-name { color: hsl(142 50% 40%); }
.queue-item.error .queue-item-name { color: hsl(var(--destructive)); }
.queue-item-error { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; font-size: 11px; font-weight: 700; border-radius: 50%; background: hsl(var(--destructive)); color: hsl(var(--destructive-foreground)); flex-shrink: 0; }

.page-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 28px; border-top: 1px solid hsl(var(--border));
  background: hsl(var(--card)); flex-shrink: 0;
}

.footer-total { font-size: 13px; color: hsl(var(--muted-foreground)); }
.footer-right { display: flex; align-items: center; gap: 8px; }
.footer-label { font-size: 13px; color: hsl(var(--muted-foreground)); }

.footer-pagination {
  display: flex; align-items: center; gap: 4px; margin-left: 8px; padding-left: 12px;
  border-left: 1px solid hsl(var(--border));
}

.page-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border: 1px solid hsl(var(--border));
  border-radius: 6px; background: hsl(var(--card)); color: hsl(var(--foreground));
  cursor: pointer; transition: all var(--duration-base) var(--ease-standard);
}
.page-btn:hover:not(:disabled) { background: hsl(var(--accent)); border-color: hsl(var(--primary) / 0.3); }
.page-btn:disabled { opacity: 0.35; cursor: default; }

.page-info { font-size: 13px; color: hsl(var(--muted-foreground)); min-width: 50px; text-align: center; }

.page-size-dropdown-wrap {
  position: relative;
}

.page-size-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 8px; font-size: 13px; border: 1px solid hsl(var(--border));
  border-radius: 6px; background: hsl(var(--card)); color: hsl(var(--foreground));
  cursor: pointer; outline: none; transition: border-color var(--duration-base) var(--ease-standard);
  width: 50px; justify-content: center;
}
.page-size-btn:hover { border-color: hsl(var(--primary) / 0.5); }

.page-size-dropdown {
  position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%);
  margin-bottom: 4px; min-width: 80px;
  background: hsl(var(--app-settings-card-bg)); border: 1px solid hsl(var(--app-settings-card-border));
  border-radius: 8px; box-shadow: var(--app-settings-card-shadow); z-index: 100;
  padding: 4px; overflow: hidden;
}

.page-size-option {
  display: block; width: 100%; padding: 6px 12px; font-size: 13px;
  border: none; border-radius: 4px; background: transparent;
  color: hsl(var(--foreground)); cursor: pointer; text-align: left;
  transition: background var(--duration-base) var(--ease-standard);
}
.page-size-option:hover { background: hsl(var(--accent)); }
.page-size-option.active { background: hsl(var(--primary) / 0.1); color: hsl(var(--primary)); font-weight: 600; }
</style>

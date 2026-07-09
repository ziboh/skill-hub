<script setup lang="ts">
import { ref, computed, inject } from 'vue'
import { storage } from '../../utils/storage'
import { KeyShowToast } from '../../inject-keys'
import ConfirmModal from '../../components/ConfirmModal.vue'
import type { Skill, InstallRecord, StoreSource, FailureRecord } from '../../types'

const showToast = inject(KeyShowToast, () => {})

function getSizeBytes(data: any): number {
  try { return new Blob([JSON.stringify(data)]).size } catch { return 0 }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function estimateSize(data: any): string {
  return formatBytes(getSizeBytes(data))
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): { key: string; count: number }[] {
  const map = new Map<string, number>()
  for (const item of items) {
    const k = keyFn(item)
    map.set(k, (map.get(k) || 0) + 1)
  }
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
}

function formatDetailValue(val: any): string {
  if (val === null || val === undefined) return '-'
  if (typeof val === 'boolean') return val ? '✓' : '✗'
  if (Array.isArray(val)) return val.join(', ')
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

interface BucketDef {
  key: string
  label: string
  getData: () => any
  viewType: 'table' | 'json' | 'kv'
  groupKey?: string
  groupLabel?: string
  columns?: { key: string; label: string; width?: string; render?: (v: any, row?: any, i?: number) => string }[]
  filterKey?: string
  filterLabel?: string
}

const buckets: BucketDef[] = [
  {
    key: 'cached_skills', label: '缓存技能',
    getData: () => storage.getCachedSkills(),
    viewType: 'table',
    groupKey: 'source', groupLabel: '来源',
    columns: [
      { key: 'name', label: '名称', width: 'minmax(100px,1fr)' },
      { key: 'author', label: '作者', width: '100px' },
      { key: 'source', label: '类型', width: '100px' },
      { key: 'storeSourceId', label: '商店源', width: '120px' },
      { key: 'tags', label: '标签', width: '120px', render: (v: string[]) => v?.join(', ') || '' },
      { key: 'userTags', label: '用户标签', width: '100px', render: (v: string[]) => v?.join(', ') || '' },
    ],
    filterKey: 'source', filterLabel: '来源',
  },
  {
    key: 'github_cache', label: 'GitHub 缓存',
    getData: () => {
      const all = storage.getAllGitHubCaches()
      const rows: any[] = []
      for (const [sourceId, cache] of Object.entries(all)) {
        for (const skill of cache.skills) {
          rows.push({ ...skill, _source: sourceId, _fetchedAt: new Date(cache.fetchedAt).toLocaleString() })
        }
      }
      return rows
    },
    viewType: 'table',
    groupKey: '_source', groupLabel: '源',
    columns: [
      { key: '_source', label: '源', width: '100px' },
      { key: 'name', label: '名称', width: 'minmax(100px,1fr)' },
      { key: 'description', label: '描述', width: 'minmax(120px,2fr)', render: (v: string) => v?.slice(0, 80) || '暂无描述' },
      { key: 'author', label: '作者', width: '100px' },
      { key: 'tags', label: '标签', width: '120px', render: (v: string[]) => v?.join(', ') || '' },
      { key: '_fetchedAt', label: '缓存时间', width: '140px' },
    ],
    filterKey: '_source', filterLabel: '源',
  },
  {
    key: 'install_records', label: '安装记录',
    getData: () => storage.getInstallRecords(),
    viewType: 'table',
    columns: [
      { key: 'skillId', label: 'Skill ID', width: 'minmax(80px,1fr)' },
      { key: 'platformId', label: '平台', width: '100px' },
      { key: 'mode', label: '模式', width: '60px' },
      { key: 'installedAt', label: '安装时间', width: '140px' },
    ],
  },
  {
    key: 'downloaded_ids', label: '已下载 ID',
    getData: () => storage.getDownloadedIds(),
    viewType: 'table',
    columns: [
      { key: 'index', label: '序号', width: '60px', render: (_v: any, _row: any, i?: number) => `#${(i ?? 0) + 1}` },
      { key: 'value', label: 'ID', width: '1fr' }
    ],
  },
  {
    key: 'favorite_ids', label: '收藏 ID',
    getData: () => storage.getFavoriteIds(),
    viewType: 'table',
    columns: [
      { key: 'index', label: '序号', width: '60px', render: (_v: any, _row: any, i?: number) => `#${(i ?? 0) + 1}` },
      { key: 'value', label: 'ID', width: '1fr' }
    ],
  },
  {
    key: 'store_sources', label: '商店源',
    getData: () => storage.getStoreSources(),
    viewType: 'table',
    columns: [
      { key: 'name', label: '名称', width: 'minmax(80px,1fr)' },
      { key: 'type', label: '类型', width: '100px' },
      { key: 'url', label: 'URL', width: 'minmax(100px,2fr)', render: (v: string) => v?.replace(/^https?:\/\//, '') || '-' },
      { key: 'enabled', label: '启用', width: '50px', render: (v: boolean) => v ? '✓' : '✗' },
    ],
  },
  {
    key: 'platform_configs', label: '平台配置',
    getData: () => storage.getPlatformConfigs(),
    viewType: 'table',
    columns: [
      { key: 'name', label: '名称', width: 'minmax(80px,1fr)' },
      { key: 'id', label: 'ID', width: '80px' },
      { key: 'enabled', label: '启用', width: '50px', render: (v: boolean) => v ? '✓' : '✗' },
      { key: 'detected', label: '已检测', width: '60px', render: (v: boolean) => v ? '✓' : '✗' },
    ],
  },
  {
    key: 'scanned_skills', label: '扫描技能路径',
    getData: () => storage.getScannedSkills(),
    viewType: 'json',
  },
  {
    key: 'translations', label: '翻译缓存',
    getData: () => storage.getTranslationCaches(),
    viewType: 'kv',
  },
  {
    key: 'desc_translations', label: '描述翻译缓存',
    getData: () => storage.getDescTranslationCaches(),
    viewType: 'kv',
  },
  {
    key: 'failure_records', label: '失败记录',
    getData: () => storage.getFailureRecords(),
    viewType: 'table',
    groupKey: 'type', groupLabel: '类型',
    columns: [
      { key: 'type', label: '类型', width: '80px' },
      { key: 'skillName', label: '技能', width: 'minmax(80px,1fr)' },
      { key: 'error', label: '错误', width: 'minmax(100px,2fr)' },
      { key: 'timestamp', label: '时间', width: '140px', render: (v: number) => v ? new Date(v).toLocaleString() : '-' },
    ],
    filterKey: 'type', filterLabel: '类型',
  },
]

// ===== Summary helpers =====
function getSummary(bucket: BucketDef): { label: string; count: number }[] {
  const data = bucket.getData()
  if (!data || !Array.isArray(data)) return []
  if (bucket.groupKey && data.length > 0) {
    return groupBy(data, (item: any) => item[bucket.groupKey!] || '未知').map(g => ({ label: g.key, count: g.count }))
  }
  return []
}

function getCountInfo(bucket: BucketDef): string {
  const data = bucket.getData()
  if (!data) return '0'
  if (Array.isArray(data)) return `${data.length}`
  if (typeof data === 'object') return `${Object.keys(data).length}`
  return `${data}`
}

// ===== Modal state =====
const modalBucket = ref<BucketDef | null>(null)
const showJsonModal = ref(false)

// For table modal
const tableFilter = ref('all')
const tableSearch = ref('')
const tableSelected = ref<Set<number>>(new Set())
const tableDetailItem = ref<any>(null)

function openModal(bucket: BucketDef) {
  modalBucket.value = bucket
  tableFilter.value = 'all'
  tableSearch.value = ''
  tableSelected.value = new Set()
  tableDetailItem.value = null
  showJsonModal.value = true
}

function closeModal() {
  showJsonModal.value = false
  modalBucket.value = null
}

// ===== Table data =====
const tableData = computed(() => {
  const bucket = modalBucket.value
  if (!bucket) return []
  const data = bucket.getData()
  if (!Array.isArray(data)) return Object.entries(data || {}).map(([k, v]) => ({ key: k, value: v }))
  
  // 处理原始值数组（如字符串数组）
  if (data.length > 0 && typeof data[0] !== 'object') {
    return data.map((item: any, index: number) => ({ index, value: item }))
  }
  
  let items = data as any[]
  if (bucket.filterKey && tableFilter.value !== 'all') {
    items = items.filter((item: any) => (item[bucket.filterKey!] || '') === tableFilter.value)
  }
  if (tableSearch.value) {
    const q = tableSearch.value.toLowerCase()
    items = items.filter((item: any) =>
      Object.values(item).some(v => String(v ?? '').toLowerCase().includes(q))
    )
  }
  return items
})

type ColumnDef = NonNullable<BucketDef['columns']>[number]
const tableColumnDefs = computed<ColumnDef[]>(() => {
  const bucket = modalBucket.value
  if (!bucket) return []
  if (bucket.columns?.length) return bucket.columns as any
  const data = bucket.getData()
  if (!Array.isArray(data) || data.length === 0) return []
  
  // 如果数据是原始值数组，返回默认列配置
  if (data.length > 0 && typeof data[0] !== 'object') {
    return [
      { key: 'index', label: '序号', width: '60px' },
      { key: 'value', label: '值', width: '1fr' }
    ]
  }
  
  return Object.keys(data[0]).map(k => ({ key: k, label: k, width: 'minmax(80px,1fr)' }))
})

const filterOptions = computed(() => {
  const bucket = modalBucket.value
  if (!bucket || !bucket.filterKey) return []
  const data = bucket.getData()
  if (!Array.isArray(data)) return []
  const keys = new Set(data.map((item: any) => item[bucket.filterKey!] || '未知'))
  return Array.from(keys).sort()
})

const allSelected = computed(() =>
  tableData.value.length > 0 && tableSelected.value.size === tableData.value.length
)

function toggleAll() {
  if (allSelected.value) tableSelected.value = new Set()
  else tableSelected.value = new Set(tableData.value.map((_, i) => i))
}

// ===== Delete operations =====
const confirmDelete = ref<{ title: string; message: string; onConfirm: () => void } | null>(null)

function deleteSelectedItems() {
  const bucket = modalBucket.value
  if (!bucket) return
  const allData = bucket.getData()
  if (!Array.isArray(allData)) return

  const indices = Array.from(tableSelected.value).sort((a, b) => b - a)
  const count = indices.length

  const labels: Record<string, string> = {
    cached_skills: '缓存技能',
    github_cache: 'GitHub 缓存',
    install_records: '安装记录',
    failure_records: '失败记录',
    downloaded_ids: '已下载 ID',
  }
  const label = labels[bucket.key] || bucket.label

  confirmDelete.value = {
    title: `删除 ${label}`,
    message: `确定要删除选中的 <strong>${count}</strong> 条记录吗？此操作不可撤销。`,
    onConfirm: () => {
      doDelete(bucket, indices)
      confirmDelete.value = null
    },
  }
}

function doDelete(bucket: BucketDef, indices: number[]) {
  const allData = bucket.getData()
  if (bucket.key === 'cached_skills') {
    const idsToRemove = indices.map(i => (tableData.value[i] as Skill).id)
    const remaining = (allData as Skill[]).filter(s => !idsToRemove.includes(s.id))
    storage.replaceCachedSkills(remaining)
  } else if (bucket.key === 'install_records') {
    const records = allData as InstallRecord[]
    for (const i of indices) {
      storage.removeInstallRecord(records[i].skillId, records[i].platformId)
    }
  } else if (bucket.key === 'failure_records') {
    const records = allData as FailureRecord[]
    for (const i of indices) {
      storage.removeFailureRecord(records[i].id)
    }
  } else if (bucket.key === 'github_cache') {
    const rows = tableData.value
    const toRemove: Record<string, string[]> = {}
    for (const i of indices) {
      const row = rows[i]
      const src = row._source
      if (!toRemove[src]) toRemove[src] = []
      toRemove[src].push(row.id)
    }
    for (const [src, ids] of Object.entries(toRemove)) {
      storage.clearGitHubCacheSkills(src, ids)
    }
  } else if (bucket.key === 'downloaded_ids') {
    for (const i of indices) {
      storage.removeDownloadedId(tableData.value[i].value)
    }
  }
  tableSelected.value = new Set()
  // Force reactive update
  modalBucket.value = { ...bucket }
  refreshSummary()
}

const manageableBucketKeys = ['cached_skills','github_cache','install_records','failure_records','downloaded_ids','translations','desc_translations']

const dataSummary = computed(() => {
  summaryVersion.value
  const totalItems = buckets.reduce((sum, bucket) => sum + Number(getCountInfo(bucket) || 0), 0)
  const totalBytes = buckets.reduce((sum, bucket) => sum + getSizeBytes(bucket.getData()), 0)
  const cleanableItems = buckets
    .filter(bucket => manageableBucketKeys.includes(bucket.key))
    .reduce((sum, bucket) => sum + Number(getCountInfo(bucket) || 0), 0)
  return [
    { label: '数据集', value: String(buckets.length), hint: '本地存储分类' },
    { label: '记录数', value: String(totalItems), hint: '全部缓存条目' },
    { label: '占用', value: formatBytes(totalBytes), hint: '估算本地体积' },
    { label: '可清理', value: String(cleanableItems), hint: '支持批量清空' },
  ]
})

const summaryVersion = ref(0)
function refreshSummary() { summaryVersion.value++ }

const cleanupMessage = ref('')
function cleanupOrphanedIds() {
  const removed = storage.cleanOrphanedDownloadedIds()
  if (removed > 0) {
    cleanupMessage.value = `已清理 ${removed} 个孤儿 ID`
    refreshSummary()
  } else {
    cleanupMessage.value = '没有需要清理的孤儿 ID'
  }
  setTimeout(() => cleanupMessage.value = '', 3000)
}

// ===== Cleanup by source =====
function confirmCleanupBySource(source: string) {
  const skills = storage.getCachedSkills().filter(s => s.source === source)
  confirmDelete.value = {
    title: `清理 ${source} 缓存`,
    message: `确定要删除所有 <strong>${source}</strong> 来源的缓存技能吗？共 <strong>${skills.length}</strong> 个。此操作不可撤销。`,
    onConfirm: () => {
      const remaining = storage.getCachedSkills().filter(s => s.source !== source)
      storage.replaceCachedSkills(remaining)
      refreshSummary()
      closeModal()
    }
  }
}

function confirmCleanupByStoreSource(storeSourceId: string) {
  const skills = storage.getCachedSkills().filter(s => s.storeSourceId === storeSourceId)
  confirmDelete.value = {
    title: `清理商店源缓存`,
    message: `确定要删除商店源 <strong>${storeSourceId}</strong> 的所有缓存技能吗？共 <strong>${skills.length}</strong> 个。此操作不可撤销。`,
    onConfirm: () => {
      const remaining = storage.getCachedSkills().filter(s => s.storeSourceId !== storeSourceId)
      storage.replaceCachedSkills(remaining)
      refreshSummary()
      if (modalBucket.value) modalBucket.value = { ...modalBucket.value }
    }
  }
}

function confirmClearAll(bucket: BucketDef) {
  const label = bucket.label
  confirmDelete.value = {
    title: `清空 ${label}`,
    message: `确定要清空所有 <strong>${label}</strong> 吗？此操作不可撤销。`,
    onConfirm: () => {
      if (bucket.key === 'cached_skills') {
        storage.replaceCachedSkills([])
      } else if (bucket.key === 'install_records') {
        const records = storage.getInstallRecords()
        for (const r of records) storage.removeInstallRecord(r.skillId, r.platformId)
      } else if (bucket.key === 'failure_records') {
        storage.clearFailureRecords()
      } else if (bucket.key === 'github_cache') {
        storage.clearAllGitHubCaches()
      } else if (bucket.key === 'downloaded_ids') {
        storage.getDownloadedIds().forEach(id => storage.removeDownloadedId(id))
      } else if (bucket.key === 'translations') {
        const keys = Object.keys(storage.getTranslationCaches())
        keys.forEach(h => storage.removeTranslationByHash(h))
      } else if (bucket.key === 'desc_translations') {
        const keys = Object.keys(storage.getDescTranslationCaches())
        keys.forEach(h => storage.removeDescTranslationByHash(h))
      }
      refreshSummary()
      closeModal()
    }
  }
}

function confirmKeepOnlyDownloaded() {
  const all = storage.getCachedSkills()
  const downloaded = all.filter(s => storage.isDownloaded(s.id))
  const toRemove = all.length - downloaded.length
  if (toRemove === 0) {
    showToast('没有非已下载的缓存技能需要清理', 'info')
    return
  }
  confirmDelete.value = {
    title: '保留我的 Skill',
    message: `将删除 <strong>${toRemove}</strong> 个非已下载的缓存技能，保留 <strong>${downloaded.length}</strong> 个。此操作不可撤销。`,
    onConfirm: () => {
      storage.replaceCachedSkills(downloaded)
      refreshSummary()
      closeModal()
    }
  }
}
</script>

<template>
  <div class="settings-scroll">
    <h1 class="settings-page-title">数据管理</h1>
    <p class="settings-page-desc">查看和管理本地缓存的应用数据</p>

    <!-- Summary -->
    <div class="setting-section">
      <h3 class="setting-section-title">数据概览</h3>
      <div class="setting-card">
        <div class="setting-row" v-for="item in dataSummary" :key="item.label">
          <div class="setting-row-info">
            <div class="setting-row-label">{{ item.label }}</div>
            <div class="setting-row-desc">{{ item.hint }}</div>
          </div>
          <span class="dm-stat-value">{{ item.value }}</span>
        </div>
      </div>
    </div>

    <!-- Buckets -->
    <div class="setting-section">
      <h3 class="setting-section-title">缓存数据一览</h3>
      <div class="setting-card">
        <div
          v-for="bucket in buckets"
          :key="`${bucket.key}-${summaryVersion}`"
          class="setting-row"
        >
          <div class="setting-row-info">
            <div class="setting-row-label">{{ bucket.label }}</div>
            <div class="setting-row-desc">
              {{ getCountInfo(bucket) }} 条 · {{ estimateSize(bucket.getData()) }}
            </div>


          </div>

          <div class="dm-row-actions">
            <button class="btn" @click="openModal(bucket)">查看</button>
            <button
              v-if="bucket.key === 'downloaded_ids'"
              class="btn"
              @click="cleanupOrphanedIds"
            >清理孤儿ID</button>
            <button
              v-if="manageableBucketKeys.includes(bucket.key)"
              class="btn btn-danger"
              @click="confirmClearAll(bucket)"
            >清空</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Cleanup message -->
    <Teleport to="body">
      <div v-if="cleanupMessage" class="dm-cleanup-toast">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        <span>{{ cleanupMessage }}</span>
      </div>
    </Teleport>

    <!-- ===== Modal (table / json / kv) ===== -->
    <Teleport to="body">
      <div v-if="showJsonModal && modalBucket" class="dm-overlay" @click.self="closeModal">
        <div class="dm-modal">
          <div class="dm-modal-header">
            <div>
              <h3 class="dm-modal-title">{{ modalBucket.label }}</h3>
              <p class="dm-modal-subtitle">{{ tableData.length }} 条记录 · {{ estimateSize(modalBucket.getData()) }}</p>
            </div>
            <div class="dm-modal-header-btn">
              <button class="dm-btn-close" @click="closeModal">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>

          <div class="dm-modal-body">
            <!-- Table view -->
            <template v-if="modalBucket.viewType === 'table'">
              <!-- Fixed toolbar -->
              <div class="dm-toolbar">
                <!-- Filter bar -->
                <div v-if="filterOptions.length > 0 || modalBucket.key === 'cached_skills'" class="dm-filter-row">
                  <select v-if="filterOptions.length > 0" v-model="tableFilter" class="dm-select">
                    <option value="all">全部{{ modalBucket.filterLabel ? ` ${modalBucket.filterLabel}` : '' }}</option>
                    <option v-for="opt in filterOptions" :key="opt" :value="opt">{{ opt }}</option>
                  </select>
                  <div class="dm-search-box">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input v-model="tableSearch" type="text" placeholder="搜索..." class="dm-search-input" />
                  </div>
                  <span class="dm-filter-spacer"></span>
                  <button
                    v-if="modalBucket.key === 'cached_skills'"
                    class="btn btn-primary"
                    @click="confirmKeepOnlyDownloaded"
                  >保留我的 Skill</button>
                </div>
                <!-- Batch actions -->
                <div class="dm-batch-row">
                  <label class="dm-batch-check">
                    <input type="checkbox" :checked="allSelected" @change="toggleAll" />
                    全选
                  </label>
                  <span class="dm-batch-info">已选 {{ tableSelected.size }} / {{ tableData.length }}</span>
                  <span class="dm-batch-spacer"></span>
                  <button
                    class="btn btn-danger btn-sm"
                    :class="{ 'dm-btn-visible': tableSelected.size > 0 }"
                    @click="deleteSelectedItems"
                  >删除选中</button>
                </div>
              </div>

              <!-- Scrollable table -->
              <div class="dm-table-scroll">
                <table class="dm-table">
                  <thead>
                    <tr>
                      <th class="dm-th-check"></th>
                      <th v-for="col in tableColumnDefs" :key="col.key" class="dm-th" :style="{ width: col.width }">{{ col.label }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, i) in tableData" :key="i" class="dm-tr" :class="{ selected: tableSelected.has(i) }" @click="tableDetailItem = row">
                      <td class="dm-td-check" @click.stop>
                        <input
                          type="checkbox"
                          :checked="tableSelected.has(i)"
                          @change="tableSelected.has(i) ? tableSelected.delete(i) : tableSelected.add(i); tableSelected = new Set(tableSelected)"
                        />
                      </td>
                      <td v-for="col in tableColumnDefs" :key="col.key" class="dm-td">
                        <span v-if="(col as any).render">{{ (col as any).render(row[col.key], row, i) }}</span>
                        <span v-else-if="Array.isArray(row[col.key])">{{ row[col.key].join(', ') }}</span>
                        <span v-else-if="typeof row[col.key] === 'boolean'">{{ row[col.key] ? '✓' : '✗' }}</span>
                        <span v-else-if="row[col.key] === null || row[col.key] === undefined">-</span>
                        <span v-else>{{ String(row[col.key]) }}</span>
                      </td>
                    </tr>
                    <tr v-if="tableData.length === 0">
                      <td :colspan="tableColumnDefs.length + 1" class="dm-empty">无数据</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>

            <!-- KV view for translations -->
            <template v-else-if="modalBucket.viewType === 'kv'">
              <div class="dm-kv-list">
                <div v-for="(val, key) in modalBucket.getData()" :key="key" class="dm-kv-item">
                  <span class="dm-kv-key">{{ key }}</span>
                  <pre class="dm-kv-val">{{ JSON.stringify(val, null, 2) }}</pre>
                </div>
                <div v-if="Object.keys(modalBucket.getData() || {}).length === 0" class="dm-empty">无数据</div>
              </div>
            </template>

            <!-- JSON view (fallback) -->
            <template v-else>
              <pre class="dm-json">{{ JSON.stringify(modalBucket.getData(), null, 2) }}</pre>
            </template>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Row detail overlay -->
    <Teleport to="body">
      <div v-if="tableDetailItem" class="dm-detail-fixed" @click.self="tableDetailItem = null">
        <div class="dm-detail-card">
          <div class="dm-detail-card-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <span class="dm-detail-card-title">行详情</span>
            <button class="dm-btn-close" @click="tableDetailItem = null">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="dm-detail-card-body">
            <div v-for="(val, key) in tableDetailItem" :key="key" class="dm-detail-field">
              <div class="dm-detail-field-key">{{ key }}</div>
              <div class="dm-detail-field-val">{{ formatDetailValue(val) }}</div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Confirm modal -->
    <Teleport to="body">
      <div v-if="confirmDelete" class="dm-confirm-override">
        <ConfirmModal
          :title="confirmDelete.title"
          :message="confirmDelete.message"
          confirm-text="确定"
          @confirm="confirmDelete.onConfirm(); confirmDelete = null"
          @cancel="confirmDelete = null"
        />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* 共享的 settings 基础样式（标题/卡片/行/按钮）统一使用全局 src/styles/settings.css，
   此处只保留数据管理特有的 dm-* 样式。 */

/* Stat value (right side of summary rows) */
.dm-stat-value {
  font-size: 13px;
  font-weight: 700;
  color: hsl(var(--foreground));
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

/* Bucket row chips (source breakdown) */
.dm-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}
.dm-chip {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  padding: 2px 6px;
  border-radius: 4px;
  background: hsl(var(--muted) / 0.5);
  white-space: nowrap;
}
.dm-chip-sub {
  color: hsl(var(--muted-foreground) / 0.8);
}
.dm-row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.dm-btn-close:focus-visible,
.dm-select:focus-visible,
.dm-search-input:focus-visible {
  outline: 2px solid hsl(var(--ring) / 0.7);
  outline-offset: 2px;
}
.btn-danger.btn-sm {
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
}
.btn-danger.dm-btn-visible {
  opacity: 1;
  pointer-events: auto;
  visibility: visible;
}

/* Modal */
.dm-overlay {
  position: fixed;
  inset: 0;
  background: hsl(0 0% 0% / 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(6px);
}
.dm-modal {
  width: min(1100px, 94vw);
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 16px;
  box-shadow: 0 32px 80px hsl(0 0% 0% / 0.25), 0 0 0 1px hsl(var(--border) / 0.5);
  overflow: hidden;
  animation: dm-modal-in 0.2s ease-out;
}
@keyframes dm-modal-in {
  from {
    opacity: 0;
    transform: scale(0.97) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
.dm-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid hsl(var(--border));
  gap: 12px;
  background: hsl(var(--muted) / 0.3);
}
.dm-modal-title {
  font-size: 15px;
  font-weight: 700;
  color: hsl(var(--foreground));
  margin: 0;
}
.dm-modal-subtitle {
  margin: 4px 0 0;
  font-size: 11px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  letter-spacing: 0.02em;
}
.dm-modal-header-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  justify-content: flex-end;
}
.dm-btn-close {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-base) var(--ease-standard);
  flex-shrink: 0;
}
.dm-btn-close:hover {
  background: hsl(var(--muted));
  border-color: hsl(var(--border));
  color: hsl(var(--foreground));
}
.dm-modal-body {
  flex: 1;
  overflow: hidden;
  padding: 0;
  display: flex;
  flex-direction: column;
}

/* Toolbar (fixed at top of modal body) */
.dm-toolbar {
  position: sticky;
  top: 0;
  z-index: 10;
  background: hsl(var(--card));
  padding: 16px 20px 12px;
  border-bottom: 1px solid hsl(var(--border));
}
.dm-filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.dm-filter-spacer {
  flex: 1;
  min-width: 0;
}
.dm-batch-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  background: hsl(var(--primary) / 0.06);
  border: 1px solid hsl(var(--primary) / 0.15);
  min-height: 38px;
}
.dm-batch-spacer {
  flex: 1;
}
.dm-select {
  min-height: 32px;
  padding: 6px 28px 6px 10px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: hsl(var(--card));
  color: hsl(var(--foreground));
  outline: none;
  cursor: pointer;
  transition: border-color var(--duration-base) var(--ease-standard);
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
}
.dm-select:hover {
  border-color: hsl(var(--ring) / 0.6);
}
.dm-select:focus {
  border-color: hsl(var(--ring));
}
.dm-search-box {
  min-height: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--card));
  flex: 1;
  max-width: 280px;
  transition: border-color var(--duration-base) var(--ease-standard);
}
.dm-search-box:focus-within {
  border-color: hsl(var(--ring));
  background: hsl(var(--background));
}
.dm-search-input {
  border: none;
  background: none;
  outline: none;
  font-size: 12px;
  color: hsl(var(--foreground));
  width: 100%;
}
.dm-search-input::placeholder {
  color: hsl(var(--muted-foreground) / 0.7);
}

/* Batch check */
.dm-batch-check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: hsl(var(--foreground));
  cursor: pointer;
  user-select: none;
}
.dm-batch-check input {
  accent-color: hsl(var(--primary));
  width: 14px;
  height: 14px;
}
.dm-batch-info {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  padding: 2px 8px;
  background: hsl(var(--muted) / 0.5);
  border-radius: 4px;
}

/* Scrollable table */
.dm-table-scroll {
  flex: 1;
  overflow: auto;
  margin: 12px 20px 20px;
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
  background: hsl(var(--card));
}

/* Table */
.dm-table {
  width: 100%;
  min-width: 720px;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 12px;
}
.dm-th {
  position: sticky;
  top: 0;
  z-index: 10;
  text-align: left;
  font-weight: 700;
  font-size: 11px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
  padding: 10px 12px;
  border-bottom: 2px solid hsl(var(--border));
  background: hsl(var(--muted));
  white-space: nowrap;
}
.dm-th-check {
  position: sticky;
  top: 0;
  z-index: 11;
  width: 36px;
  padding: 10px 8px;
  border-bottom: 2px solid hsl(var(--border));
  background: hsl(var(--muted));
}
.dm-th-check input, .dm-td-check input {
  accent-color: hsl(var(--primary));
  width: 14px;
  height: 14px;
  cursor: pointer;
}
.dm-tr {
  transition: background var(--duration-base) var(--ease-standard);
}
.dm-tr:hover {
  background: hsl(var(--muted) / 0.4);
}
.dm-tr.selected {
  background: hsl(var(--primary) / 0.08);
}
.dm-td {
  padding: 10px 12px;
  border-bottom: 1px solid hsl(var(--border) / 0.4);
  color: hsl(var(--foreground));
  vertical-align: middle;
  word-break: break-word;
  line-height: 1.5;
}
.dm-td-check {
  padding: 10px 8px;
  border-bottom: 1px solid hsl(var(--border) / 0.4);
}
.dm-empty {
  padding: 48px 24px;
  text-align: center;
  color: hsl(var(--muted-foreground));
  font-size: 13px;
  background: hsl(var(--muted) / 0.15);
}

/* KV view */
.dm-kv-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dm-kv-item {
  padding: 8px 10px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: hsl(var(--background));
}
.dm-kv-key {
  font-size: 11px;
  font-weight: 600;
  color: hsl(var(--primary));
  display: block;
  margin-bottom: 4px;
  font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace;
}
.dm-kv-val {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: hsl(var(--foreground));
  white-space: pre-wrap;
  word-break: break-all;
  font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace;
}

/* Confirm override z-index */
.dm-confirm-override {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
}

/* Cleanup toast */
.dm-cleanup-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
  box-shadow: 0 8px 24px hsl(0 0% 0% / 0.15);
  z-index: 1300;
  font-size: 13px;
  font-weight: 500;
  color: hsl(var(--foreground));
  animation: dm-toast-in 0.2s ease-out;
}
.dm-cleanup-toast svg {
  color: hsl(var(--primary));
  flex-shrink: 0;
}
@keyframes dm-toast-in {
  from { opacity: 0; transform: translateX(-50%) translateY(8px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

/* JSON view */
.dm-json {
  margin: 0;
  font-size: 11px;
  font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace;
  line-height: 1.6;
  color: hsl(var(--foreground));
  white-space: pre-wrap;
  word-break: break-all;
}

/* Row detail overlay */
.dm-detail-fixed {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: hsl(0 0% 0% / 0.35);
  backdrop-filter: blur(3px);
}
.dm-detail-card {
  width: min(620px, 92vw);
  max-height: 78vh;
  display: flex;
  flex-direction: column;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 16px;
  box-shadow: 0 24px 64px hsl(0 0% 0% / 0.2);
  overflow: hidden;
}
.dm-detail-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid hsl(var(--border));
  color: hsl(var(--foreground));
}
.dm-detail-card-header svg {
  flex-shrink: 0;
  color: hsl(var(--primary));
}
.dm-detail-card-title {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
}
.dm-detail-card-body {
  flex: 1;
  overflow: auto;
  padding: 4px 0;
  display: flex;
  flex-direction: column;
}
.dm-detail-field {
  display: flex;
  border-bottom: 1px solid hsl(var(--border) / 0.3);
}
.dm-detail-field:last-child {
  border-bottom: none;
}
.dm-detail-field-key {
  flex: 0 0 150px;
  padding: 8px 14px;
  font-size: 11px;
  font-weight: 600;
  color: hsl(var(--muted-foreground));
  font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace;
  background: hsl(var(--muted) / 0.2);
  word-break: break-all;
}
.dm-detail-field-val {
  flex: 1;
  padding: 8px 14px;
  font-size: 12px;
  color: hsl(var(--foreground));
  word-break: break-all;
  line-height: 1.5;
}
@media (max-width: 760px) {
  .setting-row {
    flex-direction: column;
    align-items: stretch;
  }
  .dm-row-actions {
    justify-content: flex-end;
  }
  .dm-modal {
    width: 96vw;
    max-height: 90vh;
  }
  .dm-search-box {
    max-width: none;
    width: 100%;
  }
  .dm-detail-field-key {
    flex-basis: auto;
  }
}
</style>

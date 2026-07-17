<script setup lang="ts">
import { ref, computed, onMounted, watch, inject } from 'vue'
import ProviderIcon from './ProviderIcon.vue'
import { AVAILABLE_ICONS } from '../data/ai-providers'
import { listRegisteredIconIds } from '../icons'
import { defaultPlatforms } from '../data/platforms'

import { storage } from '../utils/storage'
import type { UserIconEntry } from '../types'
import { KeyShowToast } from '../inject-keys'
import { isValidHttpUrl } from '../utils/input-validation'

/** Which built-in icon set the library tab shows. */
export type IconLibraryPreset = 'providers' | 'platforms' | 'all'

const props = withDefaults(
  defineProps<{
    modelValue?: string
    defaultIcon?: string
    previewSize?: number
    /** providers = AI 供应商；platforms = Agent 平台；all = 两者 */
    library?: IconLibraryPreset
  }>(),
  {
    modelValue: '',
    defaultIcon: '',
    previewSize: 32,
    library: 'providers',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
const showToast = inject(KeyShowToast, () => {})

type Tab = 'library' | 'my-icons' | 'url'
const activeTab = ref<Tab>('library')
const searchQuery = ref('')
const urlInput = ref('')
const userIcons = ref<UserIconEntry[]>([])

const platformNameById = computed(() => {
  const map = new Map<string, string>()
  for (const p of defaultPlatforms) map.set(p.id, p.name)
  map.set('kilo-light', 'Kilo')
  map.set('codebuddy-light', 'CodeBuddy')
  map.set('skills-sh', 'skills.sh')
  return map
})

/** Keys that represent the "default" tile — never list again in the grid. */
const DEFAULT_ICON_ALIASES = new Set(['', '_generic', 'generic', 'platforms:generic', 'platforms:_generic'])

function bareIconId(name: string): string {
  if (!name) return ''
  if (name.includes(':')) return name.split(':').pop() || name
  return name
}

function isDefaultLibraryIcon(name: string): boolean {
  if (DEFAULT_ICON_ALIASES.has(name)) return true
  const bare = bareIconId(name)
  if (bare === 'generic' || bare === '_generic') return true
  const def = props.defaultIcon || ''
  if (!def) return false
  return name === def || bareIconId(name) === bareIconId(def)
}

/** Resolved key used only for preview of the default tile. */
const resolvedDefaultIcon = computed(() => {
  if (props.defaultIcon) return props.defaultIcon
  if (props.library === 'platforms') return '_generic'
  return 'store:git-repo'
})

/** Platform asset ids from registry + stable aliases used as platform.id (no default/generic). */
const platformLibraryIds = computed(() => {
  const ids = listRegisteredIconIds('platforms').filter((id) => id !== 'skills-sh-favicon')
  const out = new Set<string>()
  for (const id of ids) {
    if (id === 'generic' || id === '_generic') continue
    if (id.endsWith('-light')) {
      out.add(id.replace(/-light$/, ''))
      continue
    }
    out.add(id)
  }
  for (const id of ['kilo', 'codebuddy', 'trae-cn']) out.add(id)
  return [...out].filter((id) => !isDefaultLibraryIcon(id)).sort((a, b) => a.localeCompare(b))
})

const libraryIcons = computed(() => {
  let list: string[]
  if (props.library === 'platforms') {
    // 平台图标库也提供供应商图标，方便自定义平台直接复用现有品牌图标。
    list = [...new Set([...platformLibraryIds.value, ...AVAILABLE_ICONS])]
  } else if (props.library === 'all') list = [...new Set([...AVAILABLE_ICONS, ...platformLibraryIds.value])]
  else list = [...AVAILABLE_ICONS]
  // Never show the default icon again under another name
  return list.filter((name) => !isDefaultLibraryIcon(name))
})

const filteredIcons = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return libraryIcons.value
  return libraryIcons.value.filter((name) => {
    const label = iconLabel(name).toLowerCase()
    return name.toLowerCase().includes(q) || label.includes(q)
  })
})

function iconLabel(name: string): string {
  if (props.library === 'platforms' || name.startsWith('platforms:')) {
    const bare = bareIconId(name)
    return platformNameById.value.get(bare) || bare
  }
  return name
}

const previewIcon = computed(() => props.modelValue || resolvedDefaultIcon.value)

const librarySearchPlaceholder = computed(() => {
  if (props.library === 'platforms') return '搜索 Agent 平台图标...'
  if (props.library === 'all') return '搜索图标...'
  return '搜索图标...'
})

/** Store-source shortcuts belong only in the combined icon library. */
const storeShortcutIcons = computed(() => {
  if (props.library !== 'all') return [] as { id: string; label: string }[]
  const all = [
    { id: 'store:git-repo', label: 'Git' },
    { id: 'store:marketplace-json', label: 'Market' },
    { id: 'store:well-known-index', label: 'Well-Known' },
    { id: 'store:local-dir', label: 'Folder' },
    { id: 'store:claude', label: 'Claude' },
    { id: 'store:codex', label: 'Codex' },
    { id: 'store:skills-sh', label: 'skills.sh' },
  ]
  return all.filter((s) => !isDefaultLibraryIcon(s.id))
})

function loadUserIcons() {
  userIcons.value = storage.getUserIcons()
}

onMounted(() => {
  loadUserIcons()
})

watch(activeTab, (tab) => {
  if (tab === 'my-icons') loadUserIcons()
})

function selectIcon(name: string) {
  emit('update:modelValue', name)
}

function selectDefault() {
  emit('update:modelValue', '')
}

function applyUrl() {
  const url = urlInput.value.trim()
  if (!url) return
  if (!isValidHttpUrl(url)) {
    showToast({ type: 'error', message: '图标地址必须是 HTTP 或 HTTPS URL。' })
    return
  }
  emit('update:modelValue', url)
}

async function importIcon() {
  const dialog = window.ztools?.showOpenDialog
  if (!dialog) return
  const files = dialog({
    properties: ['openFile'],
    title: '选择图标文件',
    filters: [{ name: '图片文件', extensions: ['svg', 'png', 'jpg', 'jpeg', 'gif', 'ico'] }],
  })
  if (!files?.length) return
  const filePath = files[0]
  const ext = filePath.split('.').pop()?.toLowerCase()
  const name = filePath.split(/[\\/]/).pop() || filePath

  let savedPath: string
  if (ext === 'svg') {
    const content = window.services.readFile(filePath)
    if (!content) return
    savedPath = window.services.writeSvgFile(content)
  } else {
    savedPath = window.services.saveIconFile(filePath)
  }

  storage.addUserIcon(savedPath, name)
  loadUserIcons()
  emit('update:modelValue', savedPath)
}

function deleteUserIcon(id: string) {
  const icon = storage.findUserIconById(id)
  if (!icon) return
  storage.removeUserIcon(id)
  if (props.modelValue === icon.path) {
    emit('update:modelValue', '')
  }
  if (window.services?.removeFile) {
    window.services.removeFile(icon.path)
  }
  loadUserIcons()
}

function clearIcon() {
  emit('update:modelValue', '')
  urlInput.value = ''
}
</script>

<template>
  <div class="store-icon-picker">
    <div class="sip-preview">
      <div class="sip-preview-icon">
        <ProviderIcon :icon="previewIcon" :size="previewSize" variant="mono" />
      </div>
      <span class="sip-preview-hint">{{ modelValue ? '当前图标' : '使用默认图标' }}</span>
      <button v-if="modelValue" class="sip-clear" title="清除图标" @click="clearIcon">
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
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
        清除
      </button>
    </div>

    <div class="sip-tabs">
      <button :class="['sip-tab', { active: activeTab === 'library' }]" @click="activeTab = 'library'">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path
            d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
          />
        </svg>
        图标库
      </button>
      <button :class="['sip-tab', { active: activeTab === 'my-icons' }]" @click="activeTab = 'my-icons'">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        我的导入
      </button>
      <button :class="['sip-tab', { active: activeTab === 'url' }]" @click="activeTab = 'url'">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
        URL
      </button>
    </div>

    <div class="sip-body">
      <!-- 图标库 -->
      <template v-if="activeTab === 'library'">
        <div class="sip-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input v-model="searchQuery" type="text" class="sip-search-input" :placeholder="librarySearchPlaceholder" />
        </div>
        <div class="sip-grid">
          <!-- 始终第一项：默认（清空自定义 = 使用 defaultIcon） -->
          <button
            type="button"
            class="sip-grid-item"
            :class="{ active: !modelValue }"
            :aria-pressed="!modelValue"
            title="默认"
            @click="selectDefault"
          >
            <span class="sip-grid-icon"><ProviderIcon :icon="resolvedDefaultIcon" :size="40" variant="mono" /></span>
            <span class="sip-grid-label">默认</span>
          </button>
          <button
            v-for="s in storeShortcutIcons"
            :key="s.id"
            type="button"
            class="sip-grid-item"
            :class="{ active: modelValue === s.id }"
            :aria-pressed="modelValue === s.id"
            :title="s.label"
            @click="selectIcon(s.id)"
          >
            <span class="sip-grid-icon"><ProviderIcon :icon="s.id" :size="40" variant="mono" /></span>
            <span class="sip-grid-label">{{ s.label }}</span>
          </button>
          <button
            v-for="name in filteredIcons"
            :key="name"
            type="button"
            class="sip-grid-item"
            :class="{ active: modelValue === name || modelValue === `platforms:${name}` }"
            :aria-pressed="modelValue === name || modelValue === `platforms:${name}`"
            :title="iconLabel(name)"
            @click="selectIcon(name)"
          >
            <span class="sip-grid-icon"><ProviderIcon :icon="name" :size="40" variant="mono" /></span>
            <span class="sip-grid-label">{{ iconLabel(name) }}</span>
          </button>
        </div>
      </template>

      <!-- 我的导入 -->
      <template v-if="activeTab === 'my-icons'">
        <div class="sip-import-actions">
          <button class="sip-upload-btn" @click="importIcon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>导入图标</span>
          </button>
        </div>
        <div v-if="userIcons.length" class="sip-grid">
          <div v-for="icon in userIcons" :key="icon.id" class="sip-user-icon">
            <button
              type="button"
              class="sip-grid-item"
              :class="{ active: modelValue === icon.path }"
              :aria-pressed="modelValue === icon.path"
              :title="icon.name"
              @click="selectIcon(icon.path)"
            >
              <span class="sip-grid-icon"><ProviderIcon :icon="icon.path" :size="40" variant="mono" /></span>
              <span class="sip-grid-label">{{ icon.name }}</span>
            </button>
            <button type="button" class="sip-user-icon-del" title="删除" @click="deleteUserIcon(icon.id)">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
        <div v-else class="sip-empty">
          <span>还没有导入的图标</span>
          <span class="sip-empty-hint">点击上方按钮导入本地图片文件</span>
        </div>
      </template>

      <!-- URL -->
      <template v-if="activeTab === 'url'">
        <div class="sip-url">
          <input
            v-model="urlInput"
            type="text"
            class="sip-url-input"
            placeholder="https://example.com/icon.png"
            @keydown.enter="applyUrl"
          />
          <button class="sip-url-apply" :disabled="!urlInput.trim()" @click="applyUrl">应用</button>
        </div>
        <div class="sip-url-hint">粘贴图标的网络地址</div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.store-icon-picker {
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: 100%;
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
  background: hsl(var(--muted));
  overflow: hidden;
}

.sip-clear {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  font-size: 11px;
  color: hsl(var(--destructive));
  background: transparent;
  border: 1px solid hsl(var(--destructive) / 0.2);
  border-radius: 6px;
  cursor: pointer;
  transition: opacity 0.15s;
}

.sip-clear:hover {
  background: hsl(var(--destructive) / 0.1);
  border-color: hsl(var(--destructive) / 0.4);
}

.sip-preview {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-top: 1px solid hsl(var(--border) / 0.5);
  border-bottom: 1px solid hsl(var(--border) / 0.5);
  flex-shrink: 0;
}

.sip-preview-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border-radius: 10px;
  flex-shrink: 0;
  overflow: hidden;
  color: hsl(var(--foreground));
}

.sip-preview-hint {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.sip-tabs {
  display: flex;
  gap: 2px;
  padding: 8px 10px 0;
  flex-shrink: 0;
}

.sip-tab {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 12px;
  font-size: 12px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  background: transparent;
  border: none;
  border-radius: 8px 8px 0 0;
  cursor: pointer;
  transition: all 0.15s;
}

.sip-tab:hover {
  color: hsl(var(--foreground));
  background: hsl(var(--card));
}

.sip-tab.active {
  color: hsl(var(--primary));
  background: hsl(var(--card));
}

.sip-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  padding: 10px;
  overflow: hidden;
}

.sip-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  margin-bottom: 8px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--card));
  flex-shrink: 0;
}

.sip-search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 12px;
  color: hsl(var(--foreground));
}

.sip-search-input::placeholder {
  color: hsl(var(--muted-foreground));
}

.sip-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  grid-auto-rows: 92px;
  align-content: start;
  gap: 8px;
  flex: 1;
  min-height: 160px;
  max-height: none;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  padding: 2px;
  -webkit-overflow-scrolling: touch;
}

.sip-grid-item {
  appearance: none;
  width: 100%;
  min-width: 0;
  height: 92px;
  display: grid;
  grid-template-rows: 48px minmax(0, auto);
  align-items: center;
  justify-items: center;
  gap: 6px;
  padding: 9px 8px 8px;
  color: hsl(var(--foreground));
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    box-shadow 0.15s;
  position: relative;
}

.sip-grid-item:hover {
  background: hsl(var(--accent) / 0.55);
  border-color: hsl(var(--ring) / 0.55);
}

.sip-grid-item.active {
  background: hsl(var(--primary) / 0.1);
  border-color: hsl(var(--primary));
  box-shadow: 0 0 0 1px hsl(var(--primary));
}

.sip-grid-item:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}

.sip-grid-icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: hsl(var(--foreground));
}

.sip-grid-icon :deep(.pi-avatar),
.sip-preview-icon :deep(.pi-avatar) {
  background: transparent;
}

.sip-grid-icon :deep(.pi-avatar-icon svg),
.sip-preview-icon :deep(.pi-avatar-icon svg) {
  transform: none;
}

.sip-grid-label {
  width: 100%;
  min-width: 0;
  font-size: 12px;
  color: hsl(var(--foreground));
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sip-import-actions {
  display: flex;
  margin-bottom: 8px;
}

.sip-upload-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 500;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 0.08);
  border: 1.5px dashed hsl(var(--primary) / 0.3);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
}

.sip-upload-btn:hover {
  background: hsl(var(--primary) / 0.14);
  border-color: hsl(var(--primary) / 0.5);
}

.sip-user-icon-del {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: hsl(var(--destructive));
  color: white;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
}

.sip-user-icon {
  position: relative;
  min-width: 0;
}

.sip-user-icon:hover .sip-user-icon-del,
.sip-user-icon:focus-within .sip-user-icon-del {
  opacity: 1;
}

.sip-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 24px 16px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  text-align: center;
}

.sip-empty-hint {
  font-size: 11px;
  opacity: 0.6;
}

.sip-url {
  display: flex;
  gap: 8px;
}

.sip-url-input {
  flex: 1;
  padding: 8px 12px;
  font-size: 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: hsl(var(--card));
  color: hsl(var(--foreground));
  outline: none;
  transition: all 0.15s;
}

.sip-url-input:focus {
  border-color: hsl(var(--primary));
  box-shadow: 0 0 0 2px hsl(var(--primary) / 0.1);
}

.sip-url-input::placeholder {
  color: hsl(var(--muted-foreground) / 0.6);
}

.sip-url-apply {
  padding: 8px 14px;
  font-size: 12px;
  font-weight: 500;
  color: hsl(var(--primary-foreground));
  background: hsl(var(--primary));
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
}

.sip-url-apply:hover:not(:disabled) {
  box-shadow: 0 2px 8px hsl(var(--primary) / 0.3);
}

.sip-url-apply:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.sip-url-hint {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  margin-top: 8px;
}
</style>

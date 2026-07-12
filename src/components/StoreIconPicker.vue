<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import ProviderIcon from './ProviderIcon.vue'
import { AVAILABLE_ICONS } from '../data/ai-providers'

import { storage } from '../utils/storage'
import type { UserIconEntry } from '../types'

const props = withDefaults(
  defineProps<{
    modelValue?: string
    defaultIcon?: string
  }>(),
  {
    modelValue: '',
    defaultIcon: '',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

type Tab = 'library' | 'my-icons' | 'url'
const activeTab = ref<Tab>('library')
const searchQuery = ref('')
const urlInput = ref('')
const userIcons = ref<UserIconEntry[]>([])

const filteredIcons = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return AVAILABLE_ICONS
  return AVAILABLE_ICONS.filter((name) => name.includes(q))
})

const previewIcon = computed(() => props.modelValue || props.defaultIcon || 'store:git-repo')

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
  if (url) {
    emit('update:modelValue', url)
  }
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
    <div class="sip-header">
      <span class="sip-label">图标</span>
      <button class="sip-clear" :class="{ hidden: !modelValue }" title="清除图标" @click="clearIcon">
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

    <div class="sip-preview">
      <div class="sip-preview-icon">
        <ProviderIcon :icon="previewIcon" :size="32" />
      </div>
      <span class="sip-preview-hint">{{ modelValue ? '当前图标' : '使用默认图标' }}</span>
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
          <input v-model="searchQuery" type="text" class="sip-search-input" placeholder="搜索图标..." />
        </div>
        <div class="sip-grid">
          <div class="sip-grid-item" :class="{ active: !modelValue }" title="默认（根据类型自动选择）" @click="selectDefault">
            <ProviderIcon :icon="defaultIcon || 'store:git-repo'" :size="24" />
            <span class="sip-grid-label">默认</span>
          </div>
          <div
            class="sip-grid-item"
            :class="{ active: modelValue === 'store:git-repo' }"
            title="Git 仓库"
            @click="selectIcon('store:git-repo')"
          >
            <ProviderIcon icon="store:git-repo" :size="24" />
            <span class="sip-grid-label">Git</span>
          </div>
          <div
            class="sip-grid-item"
            :class="{ active: modelValue === 'store:marketplace-json' }"
            title="Marketplace"
            @click="selectIcon('store:marketplace-json')"
          >
            <ProviderIcon icon="store:marketplace-json" :size="24" />
            <span class="sip-grid-label">Market</span>
          </div>
          <div
            class="sip-grid-item"
            :class="{ active: modelValue === 'store:well-known-index' }"
            title="Well-Known"
            @click="selectIcon('store:well-known-index')"
          >
            <ProviderIcon icon="store:well-known-index" :size="24" />
            <span class="sip-grid-label">Well-Known</span>
          </div>
          <div
            class="sip-grid-item"
            :class="{ active: modelValue === 'store:local-dir' }"
            title="本地目录"
            @click="selectIcon('store:local-dir')"
          >
            <ProviderIcon icon="store:local-dir" :size="24" />
            <span class="sip-grid-label">Folder</span>
          </div>
          <div
            class="sip-grid-item"
            :class="{ active: modelValue === 'store:claude' }"
            title="Claude Code"
            @click="selectIcon('store:claude')"
          >
            <ProviderIcon icon="store:claude" :size="24" />
            <span class="sip-grid-label">Claude</span>
          </div>
          <div class="sip-grid-item" :class="{ active: modelValue === 'store:codex' }" title="Codex" @click="selectIcon('store:codex')">
            <ProviderIcon icon="store:codex" :size="24" />
            <span class="sip-grid-label">Codex</span>
          </div>
          <div
            class="sip-grid-item"
            :class="{ active: modelValue === 'store:skills-sh' }"
            title="skills.sh"
            @click="selectIcon('store:skills-sh')"
          >
            <ProviderIcon icon="store:skills-sh" :size="24" />
            <span class="sip-grid-label">skills.sh</span>
          </div>
          <div
            v-for="name in filteredIcons"
            :key="name"
            class="sip-grid-item"
            :class="{ active: modelValue === name }"
            :title="name"
            @click="selectIcon(name)"
          >
            <ProviderIcon :icon="name" :size="24" />
            <span class="sip-grid-label">{{ name }}</span>
          </div>
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
          <div
            v-for="icon in userIcons"
            :key="icon.id"
            class="sip-grid-item sip-user-icon"
            :class="{ active: modelValue === icon.path }"
            :title="icon.name"
            @click="selectIcon(icon.path)"
          >
            <ProviderIcon :icon="icon.path" :size="24" />
            <span class="sip-grid-label">{{ icon.name }}</span>
            <button class="sip-user-icon-del" title="删除" @click.stop="deleteUserIcon(icon.id)">
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
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
  background: hsl(var(--muted));
  overflow: hidden;
}

.sip-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
}

.sip-label {
  font-size: 12px;
  font-weight: 600;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.sip-clear {
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

.sip-clear.hidden {
  visibility: hidden;
  pointer-events: none;
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
}

.sip-preview-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: hsl(var(--card));
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
  padding: 10px;
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
  grid-template-columns: repeat(auto-fill, minmax(56px, 1fr));
  gap: 4px;
  max-height: 260px;
  overflow-y: auto;
  padding: 4px;
}

.sip-grid-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 6px 4px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.1s;
  position: relative;
}

.sip-grid-item:hover {
  background: hsl(var(--accent));
}

.sip-grid-item.active {
  background: hsl(var(--primary) / 0.12);
  outline: 2px solid hsl(var(--primary));
  outline-offset: -2px;
}

.sip-grid-label {
  font-size: 9px;
  color: hsl(var(--muted-foreground));
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 50px;
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

.sip-user-icon:hover .sip-user-icon-del {
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

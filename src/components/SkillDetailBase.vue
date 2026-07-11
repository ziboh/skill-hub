<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import type { Skill } from '../types'
import { useSettings } from '../composables/useSettings'
import SkillFileEditor from './SkillFileEditor.vue'
import SkillPreviewPanel from './SkillPreviewPanel.vue'
import { storage } from '../utils/storage'
import { getAvatarColor } from '../utils/color'
import { SKILL_CATEGORIES, ALL_CATEGORIES, inferCategory, CATEGORY_ICONS, type SkillCategory } from '../data/skill-categories'
import { getSourceInfo, isSvgIcon, isImageUrl } from '../utils/source-info'

const props = withDefaults(
  defineProps<{
    skill: Skill
    skillName: string
    skillDesc: string
    skillContent: string
    isFavorited: boolean
    isEditing: boolean
    editedContent: string
    copyStatus: Record<string, boolean>
    context?: 'my' | 'store' | 'project' | 'agent'
    skillDir?: string
    showFavorite?: boolean
    canFavorite?: boolean
  }>(),
  {
    showFavorite: true,
    canFavorite: true,
  },
)

const emit = defineEmits<{
  navigate: [code: string, params?: any]
  'toggle-favorite': []
  'copy-content': [text: string, key: string]
  'toggle-edit': []
  'save-content': []
  'update:editedContent': [value: string]
  delete: []
}>()

const activeTab = defineModel<'preview' | 'source' | 'files'>('activeTab', { default: 'preview' })
const sidePanelCollapsed = ref(false)

const sourceInfo = computed(() => getSourceInfo(props.skill))

const _debugFields = computed(() => {
  const s = props.skill as any
  return [
    { key: 'id', label: 'ID', value: s.id },
    { key: 'name', label: '名称', value: s.name },
    { key: 'description', label: '描述', value: s.description || '—' },
    { key: 'author', label: '作者', value: s.author || '—' },
    { key: 'tags', label: '标签', value: s.tags?.length ? s.tags.join(', ') : '—' },
    { key: 'source', label: '来源', value: s.source || '—' },
    { key: 'sourceUrl', label: '来源URL', value: s.sourceUrl || '—' },
    { key: 'repo', label: '仓库', value: s.repo || '—' },
    { key: 'path', label: '路径', value: s.path || '—' },
    { key: 'homepage', label: '主页', value: s.homepage || '—' },
    { key: 'category', label: '分类', value: s.category || '—' },
    { key: 'installCount', label: '下载数', value: s.installCount ?? '—' },
    { key: 'iconUrl', label: '图标URL', value: s.iconUrl || '—' },
    { key: 'userTags', label: '用户标签', value: s.userTags?.length ? s.userTags.join(', ') : '—' },
    { key: 'storeSourceId', label: '商店来源ID', value: s.storeSourceId || '—' },
    { key: 'canonicalId', label: '规范ID', value: s.canonicalId || '—' },
    { key: 'readme', label: 'Readme', value: s.readme ? s.readme.slice(0, 200) + (s.readme.length > 200 ? '...' : '') : '—' },
    { key: 'skillDir', label: 'Skill目录', value: s.skillDir || '—' },
  ]
})

// === Theme ===
const { settings, updateSettings } = useSettings()
const isDarkMode = computed(() => {
  if (settings.themeMode === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  return settings.themeMode === 'dark'
})
function toggleTheme() {
  updateSettings({ themeMode: isDarkMode.value ? 'light' : 'dark' })
}

// === User Tags (Category) ===
const userTags = ref<string[]>([])
const editingTags = ref(false)
const selectedCategory = ref<SkillCategory>('other')

const currentCategory = computed(() => {
  const cat = (userTags.value[0] as SkillCategory) || inferCategory(props.skill.name, props.skill.description || '')
  return { id: cat, label: SKILL_CATEGORIES[cat].label, icon: CATEGORY_ICONS[cat] }
})

function loadUserTags() {
  userTags.value = storage.getSkillUserTags(props.skill.id)
}

function saveUserTags() {
  storage.saveSkillUserTags(props.skill.id, userTags.value)
}

function startEditTags() {
  editingTags.value = true
  selectedCategory.value = (userTags.value[0] as SkillCategory) || inferCategory(props.skill.name, props.skill.description || '')
}

function cancelEditTags() {
  editingTags.value = false
}

function saveCategoryTag() {
  userTags.value = [selectedCategory.value]
  saveUserTags()
  editingTags.value = false
}

onMounted(() => {
  loadUserTags()
})

watch([() => props.skill.id], () => {
  loadUserTags()
})

function openSource() {
  if (props.skill.repo) {
    const url = props.skill.sourceUrl || `https://github.com/${props.skill.repo}`
    window.open(url, '_blank')
  } else if (props.skillDir) {
    window.services.openFolder(props.skillDir)
  }
}
</script>

<template>
  <div class="skill-detail">
    <!-- Header -->
    <div class="page-header">
      <div class="header-left">
        <div class="header-title-row">
          <button
            class="back-btn"
            @click="
              emit(
                'navigate',
                context === 'project' ? 'project-skills' : context === 'store' ? 'store' : context === 'agent' ? 'agent-skills' : 'my',
              )
            "
          >
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
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
          <div class="header-icon" :style="{ background: getAvatarColor(skill.name) }">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
              />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          </div>
          <div class="header-title-info">
            <h2>{{ skillName || skill.name }}</h2>
            <div class="header-tags">
              <span class="header-tag source-tag" :style="{ background: sourceInfo.bg, color: sourceInfo.color }">
                <svg
                  v-if="sourceInfo.icon === 'multi'"
                  width="12"
                  height="12"
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
                <img
                  v-else-if="isImageUrl(sourceInfo.icon)"
                  :src="sourceInfo.icon"
                  width="12"
                  height="12"
                  alt=""
                  style="border-radius: 2px"
                />
                <span v-else-if="isSvgIcon(sourceInfo.icon)" v-html="sourceInfo.icon" class="tag-icon-svg" />
                <svg
                  v-else-if="sourceInfo.icon === 'git'"
                  width="12"
                  height="12"
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
                <svg
                  v-else
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                {{ sourceInfo.label }}
              </span>
              <span class="header-tag category-tag">{{ currentCategory.icon }} {{ currentCategory.label }}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="header-toolbar">
        <slot name="header-toolbar-start" />
        <slot name="header-actions">
          <button
            v-if="showFavorite"
            class="toolbar-icon-btn"
            :class="{ favorited: isFavorited, disabled: !canFavorite }"
            :disabled="!canFavorite"
            :title="!canFavorite ? '下载后可收藏' : isFavorited ? '取消收藏' : '收藏'"
            @click="canFavorite && emit('toggle-favorite')"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              :fill="isFavorited ? 'currentColor' : 'none'"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
          <button v-if="context === 'my'" class="toolbar-icon-btn delete-btn" title="删除" @click="emit('delete')">
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
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
          </button>
          <button
            v-else
            class="toolbar-icon-btn close-btn"
            title="关闭"
            @click="
              emit(
                'navigate',
                context === 'project' ? 'project-skills' : context === 'store' ? 'store' : context === 'agent' ? 'agent-skills' : 'my',
              )
            "
          >
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
        </slot>
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
        <slot name="header-toolbar-end" />
      </div>
    </div>

    <!-- Tab bar -->
    <div class="detail-tabs-row">
      <button :class="{ active: activeTab === 'preview' }" @click="activeTab = 'preview'">
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
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
        预览
        <div v-if="activeTab === 'preview'" class="tab-indicator" />
      </button>
      <button :class="{ active: activeTab === 'source' }" @click="activeTab = 'source'">
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
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
        源码/内容
        <div v-if="activeTab === 'source'" class="tab-indicator" />
      </button>
      <button :class="{ active: activeTab === 'files' }" @click="activeTab = 'files'">
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
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        文件
        <div v-if="activeTab === 'files'" class="tab-indicator" />
      </button>
      <div class="tabs-spacer" />
      <slot name="tab-bar-actions" />
      <button
        v-if="$slots['context-panel']"
        class="side-collapse-btn"
        :class="{ collapsed: sidePanelCollapsed }"
        :title="sidePanelCollapsed ? '展开侧面板' : '收起侧面板'"
        @click="sidePanelCollapsed = !sidePanelCollapsed"
      >
        <svg
          v-if="sidePanelCollapsed"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="15" y1="3" x2="15" y2="21" />
        </svg>
        <svg
          v-else
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="9" y1="3" x2="9" y2="21" />
        </svg>
      </button>
    </div>

    <!-- Scrollable content -->
    <div class="detail-scroll">
      <!-- ═══════════ Preview Tab ═══════════ -->
      <template v-if="activeTab === 'preview'">
        <div class="preview-layout" :class="{ collapsed: sidePanelCollapsed }">
          <!-- Left column: shared -->
          <div class="preview-main">
            <SkillPreviewPanel
              :skill="skill"
              :skill-name="skillName"
              :skill-desc="skillDesc"
              :skill-content="skillContent"
              :is-editing="isEditing"
              :edited-content="editedContent"
              :copy-status="copyStatus"
              @copy-content="(...args) => emit('copy-content', ...args)"
              @toggle-edit="emit('toggle-edit')"
              @save-content="emit('save-content')"
              @update:edited-content="(v) => emit('update:editedContent', v)"
            />
          </div>

          <!-- Right column: context-specific (slot) -->
          <div v-if="$slots['context-panel'] || context === 'my'" v-show="!sidePanelCollapsed" class="preview-side space-y-6">
            <!-- User Tags (only for 'my' context) -->
            <div v-if="context === 'my'" class="side-panel-section">
              <h3 class="side-panel-heading">分类</h3>
              <div class="panel-card tags-panel">
                <div v-if="!editingTags" class="tags-display">
                  <div class="tags-list">
                    <span v-if="currentCategory" class="user-tag category-selected">
                      {{ currentCategory.icon }} {{ currentCategory.label }}
                    </span>
                    <span v-else class="tags-empty">未分类</span>
                  </div>
                  <button class="heading-btn" @click="startEditTags">
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    修改
                  </button>
                </div>
                <div v-else class="tags-editing">
                  <div class="category-grid">
                    <button
                      v-for="cat in ALL_CATEGORIES"
                      :key="cat"
                      class="category-option"
                      :class="{ active: selectedCategory === cat }"
                      @click="selectedCategory = cat"
                    >
                      <span class="category-icon">{{ CATEGORY_ICONS[cat] }}</span>
                      <span class="category-label">{{ SKILL_CATEGORIES[cat].label }}</span>
                    </button>
                  </div>
                  <div class="tag-input-row">
                    <button class="heading-btn primary" @click="saveCategoryTag">保存</button>
                    <button class="heading-btn" @click="cancelEditTags">取消</button>
                  </div>
                </div>
              </div>
            </div>
            <slot name="context-panel" />
          </div>
        </div>
      </template>

      <!-- ═══════════ Source Tab ═══════════ -->
      <template v-else-if="activeTab === 'source'">
        <div class="source-tab-content space-y-8 animate-fade-in">
          <!-- Metadata -->
          <section class="space-y-4">
            <h3 class="section-heading">元数据</h3>
            <div class="metadata-cards">
              <div class="metadata-card">
                <div class="metadata-icon">
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
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <div class="metadata-content">
                  <span class="metadata-label">作者</span>
                  <span class="metadata-value">{{ skill.author || '未知' }}</span>
                </div>
              </div>
              <div class="metadata-card">
                <div class="metadata-icon">
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
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <div class="metadata-content">
                  <span class="metadata-label">ID</span>
                  <span class="metadata-value mono">{{ skill.id }}</span>
                </div>
              </div>
            </div>
          </section>

          <!-- Source link -->
          <section class="space-y-4">
            <div class="source-card" @click="openSource">
              <div class="source-icon">
                <svg
                  v-if="skill.repo"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path
                    d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"
                  />
                </svg>
                <svg
                  v-else
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div class="source-info">
                <span class="source-name">{{ skill.repo ? '访问技能仓库' : '本地技能' }}</span>
                <span class="source-path">{{ skill.repo || skillDir || '未知路径' }}</span>
              </div>
              <svg
                class="source-arrow"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>
          </section>

          <!-- SKILL.md raw content -->
          <section class="space-y-4">
            <div class="code-editor">
              <div class="code-header">
                <span class="code-filename">SKILL.md</span>
                <div class="code-actions">
                  <button class="code-action-btn" @click="emit('copy-content', skillContent, 'source-md')">
                    <svg
                      v-if="copyStatus['source-md']"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="3"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <svg
                      v-else
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    {{ copyStatus['source-md'] ? '已复制' : '复制' }}
                  </button>
                </div>
              </div>
              <div class="code-content">
                <pre class="code-block"><code>{{ skillContent }}</code></pre>
              </div>
            </div>
          </section>
        </div>
      </template>

      <!-- ═══════════ Files Tab ═══════════ -->
      <template v-else-if="activeTab === 'files'">
        <div class="files-tab-content animate-fade-in">
          <slot name="files-panel">
            <SkillFileEditor v-if="skillDir" :skill-dir="skillDir" class="file-editor-container" />
            <div v-else class="empty-state">
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
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <p>此技能暂无本地文件</p>
            </div>
          </slot>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.skill-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ═══ Page Header (matches MySkills) ═══ */
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 22px 28px 16px;
  background: hsl(var(--card));
  border-bottom: 1px solid hsl(var(--border));
  flex-shrink: 0;
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.header-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
  box-shadow: 0 4px 12px hsl(var(--primary) / 0.2);
}

.header-title-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.header-title-info h2 {
  font-size: 22px;
  font-weight: 600;
  color: hsl(var(--foreground));
  margin: 0;
}

.header-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.header-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 10px;
  border-radius: 6px;
  white-space: nowrap;
}

.header-tag.source-tag {
  background: transparent;
  color: transparent;
}

.header-tag.category-tag {
  background: hsl(var(--accent) / 0.6);
  color: hsl(var(--accent-foreground));
}

.header-tag svg {
  opacity: 0.7;
  flex-shrink: 0;
}

.tag-icon-svg {
  display: inline-flex;
  align-items: center;
}
.tag-icon-svg svg {
  width: 12px;
  height: 12px;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--card));
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
  flex-shrink: 0;
}
.back-btn:hover {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
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
.toolbar-icon-btn:disabled {
  opacity: 0.35;
  cursor: default;
}
.toolbar-icon-btn.disabled {
  opacity: 0.35;
  cursor: not-allowed;
  pointer-events: none;
}
.toolbar-icon-btn.favorited {
  color: #f59e0b;
  border-color: hsl(48 96% 50% / 0.4);
}
.toolbar-icon-btn.close-btn:hover {
  color: hsl(var(--destructive));
  border-color: hsl(var(--destructive) / 0.3);
  background: hsl(var(--destructive) / 0.06);
}
.toolbar-icon-btn.delete-btn:hover {
  color: hsl(var(--destructive));
  border-color: hsl(var(--destructive) / 0.3);
  background: hsl(var(--destructive) / 0.06);
}

/* ═══ Tab bar ═══ */
.detail-tabs-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 28px;
  border-bottom: 1px solid hsl(var(--border));
  background: hsl(var(--accent) / 0.2);
  flex-shrink: 0;
}
.detail-tabs-row button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 8px;
  font-size: 13px;
  font-weight: 600;
  border: none;
  background: none;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  position: relative;
  transition: color var(--duration-base) var(--ease-standard);
}
.detail-tabs-row button:hover {
  color: hsl(var(--foreground));
}
.detail-tabs-row button.active {
  color: hsl(var(--primary));
}
.tab-indicator {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: hsl(var(--primary));
  border-radius: 1px 1px 0 0;
}
.tabs-spacer {
  flex: 1;
}
.detail-tabs-row:has(.tabs-spacer) {
  gap: 0;
}

/* ═══ Scroll ═══ */
.detail-scroll {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 20px 28px 48px;
}
.space-y-4 > * + * {
  margin-top: 16px;
}
.space-y-6 > * + * {
  margin-top: 24px;
}

/* ═══ Preview two-column ═══ */
.preview-layout {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 20px;
  align-items: start;
  transition: grid-template-columns var(--duration-smooth) var(--ease-standard);
}
.preview-layout.collapsed {
  grid-template-columns: 1fr;
}
.preview-main {
  min-width: 0;
}
.preview-side {
  min-width: 0;
  animation: slideInRight var(--duration-smooth) var(--ease-standard);
}
@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.side-collapse-btn {
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
  flex-shrink: 0;
}
.side-collapse-btn:hover {
  background: hsl(var(--accent));
  color: hsl(var(--foreground));
  border-color: hsl(var(--primary) / 0.3);
}
.side-collapse-btn.collapsed {
  background: hsl(var(--primary) / 0.1);
  border-color: hsl(var(--primary) / 0.3);
  color: hsl(var(--primary));
}
@media (max-width: 640px) {
  .preview-layout {
    grid-template-columns: 1fr;
  }
}

/* ═══ Side panel section ═══ */
.side-panel-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.side-panel-heading {
  font-size: 11px;
  font-weight: 700;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase;
  letter-spacing: 0.2em;
  white-space: nowrap;
  margin: 0;
}

/* ═══ Panel cards ═══ */
.panel-card {
  border-radius: 16px;
  border: 1px solid hsl(var(--border));
  padding: 20px;
}

/* Heading buttons */
.heading-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 8px;
  border: none;
  background: hsl(var(--accent) / 0.6);
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
  white-space: nowrap;
  flex-shrink: 0;
}
.heading-btn:hover {
  background: hsl(var(--accent));
  color: hsl(var(--foreground));
}
.heading-btn.primary {
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
}
.heading-btn.primary:hover {
  opacity: 0.9;
}

/* User Tags */
.tags-panel {
  padding: 14px 16px;
}
.tags-display {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
  min-width: 0;
}
.user-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 8px;
  background: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
  transition: all var(--duration-base) var(--ease-standard);
}
.user-tag:hover {
  background: hsl(var(--primary) / 0.15);
}
.user-tag.category-selected {
  background: hsl(var(--primary) / 0.15);
  font-size: 13px;
  padding: 6px 14px;
}
.tags-empty {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  font-style: italic;
}
.tags-editing {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.tag-input-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.heading-btn.primary {
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
}
.heading-btn.primary:hover {
  opacity: 0.9;
}

.category-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.category-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 8px;
  border-radius: 10px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--card));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
}
.category-option:hover {
  border-color: hsl(var(--primary) / 0.3);
  background: hsl(var(--primary) / 0.03);
}
.category-option.active {
  border-color: hsl(var(--primary));
  background: hsl(var(--primary) / 0.08);
}
.category-icon {
  font-size: 20px;
}
.category-label {
  font-size: 11px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
}
.category-option.active .category-label {
  color: hsl(var(--primary));
  font-weight: 600;
}

/* ═══ Source tab ═══ */
.animate-fade-in {
  animation: fadeIn var(--duration-base) var(--ease-standard) both;
}
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.metadata-cards {
  display: flex;
  gap: 12px;
}
@media (max-width: 640px) {
  .metadata-cards {
    flex-direction: column;
  }
}
.metadata-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: hsl(var(--accent) / 0.3);
  border: 1px solid hsl(var(--border) / 0.5);
  border-radius: 12px;
  flex: 1;
}
.metadata-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: hsl(var(--primary) / 0.1);
  border-radius: 8px;
  color: hsl(var(--primary));
  flex-shrink: 0;
}
.metadata-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.metadata-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: hsl(var(--muted-foreground));
}
.metadata-value {
  font-size: 13px;
  font-weight: 500;
  color: hsl(var(--foreground));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.metadata-value.mono {
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 12px;
}

.source-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  border-radius: 12px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--card));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
}
.source-card:hover {
  background: hsl(var(--accent) / 0.5);
  border-color: hsl(var(--primary) / 0.3);
}
.source-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: hsl(var(--primary) / 0.1);
  border-radius: 10px;
  color: hsl(var(--primary));
  flex-shrink: 0;
}
.source-info {
  flex: 1;
  min-width: 0;
}
.source-name {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--foreground));
}
.source-path {
  display: block;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.source-arrow {
  color: hsl(var(--muted-foreground));
  flex-shrink: 0;
}

.code-editor {
  border-radius: 12px;
  border: 1px solid hsl(var(--border));
  overflow: hidden;
  background: hsl(var(--card));
}
.code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: hsl(var(--accent) / 0.3);
  border-bottom: 1px solid hsl(var(--border) / 0.5);
}
.code-filename {
  font-size: 12px;
  font-weight: 600;
  color: hsl(var(--foreground));
}
.code-actions {
  display: flex;
  gap: 8px;
}
.code-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 6px;
  border: none;
  background: hsl(var(--accent) / 0.6);
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
}
.code-action-btn:hover {
  background: hsl(var(--accent));
  color: hsl(var(--foreground));
}
.code-content {
  padding: 0;
}
.code-block {
  display: block;
  padding: 16px;
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  color: hsl(var(--foreground) / 0.85);
  max-height: 60vh;
  overflow-y: auto;
  margin: 0;
  background: hsl(var(--background));
}
.code-block code {
  font-family: inherit;
}

/* ═══ Files tab ═══ */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 0;
  color: hsl(var(--muted-foreground));
  opacity: 0.35;
  text-align: center;
}
.empty-state p {
  margin-top: 12px;
  font-size: 14px;
}
.file-editor-container {
  height: calc(100vh - 180px);
  min-height: 500px;
}
</style>

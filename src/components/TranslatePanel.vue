<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { storage } from '../utils/storage'
import { useTranslationQueue } from '../composables/useTranslationQueue'
import { isChineseContent, stripFrontmatter } from '../utils/translate'
import type { ModelConfig, Skill } from '../types'
import QuickSwitcher, { type QuickSwitcherItem } from './QuickSwitcher.vue'

const emit = defineEmits<{
  close: []
  'navigate': [route: string]
}>()

const props = defineProps<{
  currentRoute?: string
  currentSkills?: Skill[]
  allSkills?: Skill[]
}>()

const { queue, addTranslation, isTranslating: isInQueue } = useTranslationQueue()

const translateScope = ref<'current' | 'all'>('all')
const translateType = ref<'desc' | 'content' | 'both'>('both')

const allEnabledProviders = computed(() => {
  const settings = storage.getSettings()
  return settings.aiModels.filter(m => m.enabled && m.models?.length)
})

const translationModelItems = computed<QuickSwitcherItem[]>(() => {
  const items: QuickSwitcherItem[] = []
  for (const provider of allEnabledProviders.value) {
    for (const model of (provider.models || []).filter(m => m.enabled)) {
      items.push({
        id: `${provider.id}::${model.id}`,
        label: model.name || model.id,
        subtitle: provider.name || '',
      })
    }
  }
  return items
})

const localModelId = ref(storage.getSettings().translationModelId)

function onModelChange(modelId: string) {
  localModelId.value = modelId
  storage.saveSettings({ translationModelId: modelId })
}

const hashCache = new Map<string, { contentHash: string | null; descHash: string | null }>()
const contentCache = new Map<string, string | null>()

function getSkillDir(skill: Skill): string {
  const downloadedIds = storage.getDownloadedIds()
  if (downloadedIds.includes(skill.id)) {
    return window.services.pathJoin(window.ztools.getPath('userData'), 'skills-repo', skill.id)
  }
  return skill.path || ''
}

function getSkillContent(skill: Skill): string | null {
  const dir = getSkillDir(skill)
  if (contentCache.has(dir)) return contentCache.get(dir)!
  const skillFile = ['SKILL.md', 'skill.md'].find(f =>
    window.services.pathExists(window.services.pathJoin(dir, f))
  )
  const content = skillFile
    ? window.services.readFile(window.services.pathJoin(dir, skillFile))
    : (skill.readme || null)
  // Normalize line endings and strip frontmatter to match detail page handling
  const processed = content
    ? stripFrontmatter(content.replace(/\r\n/g, '\n').replace(/\r/g, '\n'))
    : null
  contentCache.set(dir, processed)
  return processed
}

function getCachedHashes(skill: Skill) {
  const id = skill.id || skill.name
  let entry = hashCache.get(id)
  if (!entry) {
    entry = {
      contentHash: skill.contentHash || null,
      descHash: skill.description ? window.services.hashContent(skill.description) : null
    }
    hashCache.set(id, entry)
  }
  if (!entry.contentHash) {
    const content = getSkillContent(skill)
    if (content) entry.contentHash = window.services.hashContent(content)
  }
  return entry
}

function getContentHash(skill: Skill): string | null {
  return getCachedHashes(skill).contentHash
}

function getDescHash(skill: Skill): string | null {
  return getCachedHashes(skill).descHash
}

function getSkillKey(skill: Skill): string {
  const ch = getContentHash(skill)
  if (ch) return 'c:' + ch
  const identity = [
    skill.name,
    skill.description || '',
    skill.author || '',
    (skill.tags || []).slice().sort().join(','),
    skill.sourceUrl || skill.repo || skill.path || '',
  ].join('|')
  return 'i:' + window.services.hashContent(identity)
}

function isSkillInQueue(skill: Skill): boolean {
  const ch = getContentHash(skill)
  const dh = getDescHash(skill)
  return !!(ch && isInQueue(ch, 'content')) || !!(ch && isInQueue(ch, 'desc')) ||
         !!(dh && isInQueue(dh, 'content')) || !!(dh && isInQueue(dh, 'desc'))
}

function hasTranslatingItem(hash: string) {
  return queue.value.some(i => i.hash === hash && i.status === 'translating')
}

const translationModel = computed((): ModelConfig | null => {
  if (!localModelId.value) return null
  const settings = storage.getSettings()
  const sepIdx = localModelId.value.lastIndexOf('::')
  if (sepIdx >= 0) {
    const providerId = localModelId.value.substring(0, sepIdx)
    const modelId = localModelId.value.substring(sepIdx + 2)
    const provider = settings.aiModels.find(m => m.id === providerId)
    if (provider && provider.models?.some(m => m.id === modelId)) {
      return { ...provider, model: modelId } as ModelConfig
    }
  } else {
    for (const provider of settings.aiModels) {
      if (provider.models) {
        const model = provider.models.find(m => m.id === localModelId.value)
        if (model) return { ...provider, model: model.id } as ModelConfig
      }
    }
  }
  return null
})

const filteredSkills = computed(() => {
  const source = translateScope.value === 'all'
    ? (props.allSkills || storage.getCachedSkills())
    : (props.currentSkills || storage.getCachedSkills())
  const seen = new Set<string>()
  return source.filter(skill => {
    const key = getSkillKey(skill)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
})


let debounceTimer: ReturnType<typeof setTimeout> | null = null
const statusCountsReady = ref(true)

watch([translateScope, translateType], () => {
  statusCountsReady.value = false
  hashCache.clear()
  contentCache.clear()
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    statusCountsReady.value = true
  }, 30)
})

const statusCounts = computed(() => {
  if (!statusCountsReady.value) return { pending: 0, translating: 0, queued: 0, done: 0, chinese: 0 }
  const counts = { pending: 0, translating: 0, queued: 0, done: 0, chinese: 0 }
  const translationCache = storage._readTranslationCache()
  const descTranslationCache = storage._readDescTranslationCache()
  for (const skill of filteredSkills.value) {
    counts[getTranslationStatusWithCache(skill, translationCache, descTranslationCache)]++
  }
  return counts
})

const pendingCount = computed(() => statusCounts.value.pending)

function translateSkill(skill: Skill) {
  if (!translationModel.value) return

  const types: ('desc' | 'content')[] = []
  if (translateType.value === 'desc' || translateType.value === 'both') types.push('desc')
  if (translateType.value === 'content' || translateType.value === 'both') types.push('content')

  for (const type of types) {
    const hash = type === 'content' ? getContentHash(skill) : getDescHash(skill)
    if (!hash) continue
    if (isInQueue(hash, type)) continue
    if (type === 'desc' && storage.getDescTranslationByHash(hash)) continue
    if (type === 'content' && storage.getTranslationByHash(hash)) continue

    const text = type === 'content' ? (getSkillContent(skill) ?? undefined) : skill.description
    addTranslation(hash, type, skill.name, text)
  }
}

function translateAll() {
  for (const skill of filteredSkills.value) {
    const ch = getContentHash(skill)
    const dh = getDescHash(skill)

    if (translateType.value === 'desc' || translateType.value === 'both') {
      if (dh && !isChineseContent(skill.description) && !storage.getDescTranslationByHash(dh) && !isInQueue(dh, 'desc')) {
        addTranslation(dh, 'desc', skill.name, skill.description)
      }
    }
    if (translateType.value === 'content' || translateType.value === 'both') {
      if (ch && !isInQueue(ch, 'content')) {
        const cached = storage.getTranslationByHash(ch)
        if (!cached && !isChineseContent(getSkillContent(skill) || '')) {
          addTranslation(ch, 'content', skill.name, getSkillContent(skill) ?? undefined)
        }
      }
    }
  }
}

function isSkillChinese(skill: Skill): boolean {
  const needDesc = translateType.value === 'desc' || translateType.value === 'both'
  const needContent = translateType.value === 'content' || translateType.value === 'both'

  let descResult: boolean | null = null
  let contentResult: boolean | null = null

  if (needDesc && skill.description) {
    descResult = isChineseContent(skill.description)
  }

  if (needContent) {
    const content = getSkillContent(skill)
    if (content) {
      contentResult = isChineseContent(content)
    }
  }

  const results = [descResult, contentResult].filter(r => r !== null)
  if (results.length === 0) return false
  return results.every(r => r === true)
}

function getTranslationStatus(skill: Skill): 'pending' | 'translating' | 'queued' | 'done' | 'chinese' {
  const ch = getContentHash(skill)
  const dh = getDescHash(skill)

  if ((ch && hasTranslatingItem(ch)) || (dh && hasTranslatingItem(dh))) return 'translating'
  if ((ch && isInQueue(ch, 'content')) || (dh && isInQueue(dh, 'desc')) || (ch && isInQueue(ch, 'desc')) || (dh && isInQueue(dh, 'content'))) return 'queued'

  const contentValid = ch ? storage.getTranslationByHash(ch) : null
  const descTranslated = dh ? storage.getDescTranslationByHash(dh) : null

  const needDesc = translateType.value === 'desc' || translateType.value === 'both'
  const needContent = translateType.value === 'content' || translateType.value === 'both'

  const descDone = !needDesc || !!descTranslated
  const contentDone = !needContent || !!contentValid
  if (descDone && contentDone) return 'done'

  if (isSkillChinese(skill)) return 'chinese'

  return 'pending'
}

function getTranslationStatusWithCache(
  skill: Skill,
  translationCache: Record<string, any>,
  descTranslationCache: Record<string, any>
): 'pending' | 'translating' | 'queued' | 'done' | 'chinese' {
  const ch = getContentHash(skill)
  const dh = getDescHash(skill)

  if ((ch && hasTranslatingItem(ch)) || (dh && hasTranslatingItem(dh))) return 'translating'
  if ((ch && isInQueue(ch, 'content')) || (dh && isInQueue(dh, 'desc')) || (ch && isInQueue(ch, 'desc')) || (dh && isInQueue(dh, 'content'))) return 'queued'

  const contentValid = ch ? translationCache[ch] : null
  const descTranslated = dh ? descTranslationCache[dh]?.translatedDesc : null

  const needDesc = translateType.value === 'desc' || translateType.value === 'both'
  const needContent = translateType.value === 'content' || translateType.value === 'both'

  const descDone = !needDesc || !!descTranslated
  const contentDone = !needContent || !!contentValid
  if (descDone && contentDone) return 'done'

  if (isSkillChinese(skill)) return 'chinese'

  return 'pending'
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'pending': return '待翻译'
    case 'translating': return '翻译中'
    case 'queued': return '排队中'
    case 'done': return '已翻译'
    case 'chinese': return '中文'
    default: return ''
  }
}
</script>

<template>
  <div class="translate-panel-overlay" @click.self="emit('close')">
    <div class="translate-panel">
      <div class="panel-header">
        <div class="panel-title-group">
          <div class="panel-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m5 8 6 6"/>
              <path d="m4 14 6-6 2-3"/>
              <path d="M2 5h12"/>
              <path d="M7 2h1"/>
              <path d="m22 22-5-10-5 10"/>
              <path d="M14 18h6"/>
            </svg>
          </div>
          <h3 class="panel-title">批量翻译</h3>
        </div>
        <div class="header-model-select">
          <QuickSwitcher
            :items="translationModelItems"
            :selectedId="localModelId"
            placeholder="选择翻译模型"
            @select="onModelChange($event)"
          />
        </div>
        <div class="status-summary" v-if="filteredSkills.length > 0">
          <span class="status-summary-total">{{ filteredSkills.length }} 个技能</span>
          <span class="status-summary-divider"></span>
          <span class="status-summary-item pending" v-if="statusCounts.pending">
            <span class="status-dot"></span>
            {{ statusCounts.pending }} 待翻译
          </span>
          <span class="status-summary-item translating" v-if="statusCounts.translating">
            <span class="status-dot"></span>
            {{ statusCounts.translating }} 翻译中
          </span>
          <span class="status-summary-item queued" v-if="statusCounts.queued">
            <span class="status-dot"></span>
            {{ statusCounts.queued }} 排队中
          </span>
          <span class="status-summary-item done" v-if="statusCounts.done">
            <span class="status-dot"></span>
            {{ statusCounts.done }} 已完成
          </span>
        </div>
        <button class="panel-close" @click="emit('close')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="panel-content">
        <div class="option-group">
          <label class="option-label">翻译范围</label>
          <div class="segmented-control">
            <button
              class="segment-btn"
              :class="{ active: translateScope === 'all' }"
              @click="translateScope = 'all'"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <span>所有技能</span>
            </button>
            <button
              class="segment-btn"
              :class="{ active: translateScope === 'current' }"
              @click="translateScope = 'current'"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
              <span>当前页面</span>
            </button>
          </div>
        </div>

        <div class="option-group">
          <label class="option-label">翻译内容</label>
          <div class="segmented-control">
            <button
              class="segment-btn"
              :class="{ active: translateType === 'desc' }"
              @click="translateType = 'desc'"
            >
              <span>描述</span>
            </button>
            <button
              class="segment-btn"
              :class="{ active: translateType === 'content' }"
              @click="translateType = 'content'"
            >
              <span>内容</span>
            </button>
            <button
              class="segment-btn"
              :class="{ active: translateType === 'both' }"
              @click="translateType = 'both'"
            >
              <span>描述和内容</span>
            </button>
          </div>
        </div>

        <div class="panel-actions">
          <button
            class="translate-all-btn"
            @click="translateAll"
            :disabled="!translationModel"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>
            <span>{{ pendingCount ? `翻译所有 (${pendingCount})` : '翻译所有' }}</span>
          </button>
          <div v-if="!translationModel" class="no-model-hint">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span>请先在设置中配置翻译模型</span>
          </div>
        </div>

        <div v-if="filteredSkills.length === 0" class="empty-state">
          <div class="empty-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="m5 8 6 6"/>
              <path d="m4 14 6-6 2-3"/>
              <path d="M2 5h12"/>
              <path d="M7 2h1"/>
              <path d="m22 22-5-10-5 10"/>
              <path d="M14 18h6"/>
            </svg>
          </div>
          <p class="empty-title">暂无已下载的技能</p>
          <p class="empty-desc">去商店看看，下载感兴趣的技能吧</p>
        </div>

        <div v-else class="skills-list">
          <div
            v-for="(skill, index) in filteredSkills"
            :key="skill.id"
            class="skill-item"
            :class="[`status-${getTranslationStatus(skill)}`]"
            :style="{ animationDelay: `${index * 30}ms` }"
          >
            <div class="skill-status-bar"></div>
            <div class="skill-body">
              <div class="skill-info">
                <div class="skill-name">{{ skill.name }}</div>
                <div class="skill-meta">
                  <span class="skill-status-badge" :class="getTranslationStatus(skill)">
                    {{ getStatusLabel(getTranslationStatus(skill)) }}
                  </span>
                </div>
              </div>
              <button
                v-if="getTranslationStatus(skill) === 'done'"
                class="translate-btn retranslate-btn"
                @click="translateSkill(skill)"
                :disabled="!translationModel"
                title="重新翻译"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6"/><path d="M21.34 15.57a10 10 0 1 1-.57-8.38"/></svg>
              </button>
              <button
                v-else
                class="translate-btn"
                :class="{ active: getTranslationStatus(skill) === 'translating' }"
                @click="translateSkill(skill)"
                :disabled="getTranslationStatus(skill) !== 'pending' || !translationModel"
                :title="getTranslationStatus(skill) === 'translating' ? '翻译中...' : getTranslationStatus(skill) === 'queued' ? '排队中' : getTranslationStatus(skill) === 'chinese' ? '已是中文，无需翻译' : '翻译此技能'"
              >
                <svg v-if="getTranslationStatus(skill) === 'translating'" class="spin-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.translate-panel-overlay {
  position: fixed;
  inset: 0;
  background: hsl(0 0% 0% / 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
  padding: 20px;
  animation: overlay-in var(--duration-smooth) var(--ease-enter);
}

@keyframes overlay-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.translate-panel {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 16px;
  width: 720px;
  max-width: 95vw;
  max-height: calc(100vh - 40px);
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
  animation: panel-in var(--duration-smooth) var(--ease-enter);
}

@keyframes panel-in {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid hsl(var(--border));
}

.panel-title-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.panel-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
  display: flex;
  align-items: center;
  justify-content: center;
}

.panel-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.panel-close {
  width: 28px;
  height: 28px;
  border-radius: 6px;
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

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.option-group {
  margin-bottom: 16px;
}

.option-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.segmented-control {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 12px;
  background: hsl(var(--muted));
}

.segment-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
}

.segment-btn:hover {
  color: hsl(var(--foreground));
}

.segment-btn.active {
  background: hsl(var(--card));
  color: hsl(var(--foreground));
  box-shadow: var(--shadow-sm);
  font-weight: 600;
}

.header-model-select {
  flex-shrink: 0;
  width: 200px;
  margin-inline: auto;
}

.panel-actions {
  margin-bottom: 16px;
}

.translate-all-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground, #fff));
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
}

.translate-all-btn:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px hsl(var(--primary) / 0.3);
}

.translate-all-btn:active:not(:disabled) {
  transform: translateY(0);
}

.translate-all-btn:disabled {
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.no-model-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding: 10px 12px;
  font-size: 12px;
  color: hsl(var(--warning));
  background: hsl(var(--warning) / 0.1);
  border-radius: 8px;
  border: 1px solid hsl(var(--warning) / 0.2);
}

.status-summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-left: auto;
  margin-right: 8px;
  font-size: 11px;
}

.status-summary-total {
  font-weight: 600;
  color: hsl(var(--foreground));
}

.status-summary-divider {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: hsl(var(--muted-foreground) / 0.4);
}

.status-summary-item {
  display: flex;
  align-items: center;
  gap: 4px;
  color: hsl(var(--muted-foreground));
}

.status-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: hsl(var(--muted-foreground) / 0.5);
}

.status-summary-item.pending .status-dot { background: hsl(var(--warning)); }
.status-summary-item.translating .status-dot { background: hsl(217 91% 60%); }
.status-summary-item.queued .status-dot { background: hsl(var(--muted-foreground) / 0.5); }
.status-summary-item.done .status-dot { background: hsl(var(--success)); }

.empty-state {
  text-align: center;
  padding: 40px 20px;
}

.empty-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 16px;
  border-radius: 16px;
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-title {
  font-size: 14px;
  font-weight: 500;
  color: hsl(var(--foreground));
  margin: 0 0 4px;
}

.empty-desc {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  margin: 0;
}

.skills-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.skill-item {
  display: flex;
  align-items: stretch;
  background: hsl(var(--muted) / 0.5);
  border-radius: 10px;
  overflow: hidden;
  animation: skill-in var(--duration-smooth) var(--ease-enter) both;
}

@keyframes skill-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.skill-status-bar {
  width: 3px;
  flex-shrink: 0;
  background: hsl(var(--muted-foreground) / 0.3);
  transition: background var(--duration-base) var(--ease-standard);
}

.skill-item.status-pending .skill-status-bar { background: hsl(var(--warning)); }
.skill-item.status-translating .skill-status-bar { background: hsl(217 91% 60%); }
.skill-item.status-queued .skill-status-bar { background: hsl(var(--muted-foreground) / 0.5); }
.skill-item.status-done .skill-status-bar { background: hsl(var(--success)); }
.skill-item.status-chinese .skill-status-bar { background: hsl(var(--muted-foreground) / 0.3); }

.skill-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  min-width: 0;
}

.skill-info {
  flex: 1;
  min-width: 0;
}

.skill-name {
  font-weight: 500;
  font-size: 13px;
  color: hsl(var(--foreground));
  margin-bottom: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skill-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.skill-status-badge {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 4px;
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
}

.skill-status-badge.pending {
  background: hsl(var(--warning) / 0.15);
  color: hsl(var(--warning));
}

.skill-status-badge.translating {
  background: hsl(217 91% 60% / 0.15);
  color: hsl(217 91% 60%);
}

.skill-status-badge.queued {
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
}

.skill-status-badge.done {
  background: hsl(var(--success) / 0.15);
  color: hsl(var(--success));
}

.skill-status-badge.chinese {
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
}

.translate-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
  flex-shrink: 0;
}

.translate-btn:hover:not(:disabled) {
  background: hsl(var(--primary) / 0.1);
  border-color: hsl(var(--primary) / 0.3);
  color: hsl(var(--primary));
  transform: scale(1.05);
}

.translate-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.translate-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.translate-btn.active {
  background: hsl(217 91% 60% / 0.1);
  border-color: hsl(217 91% 60% / 0.3);
  color: hsl(217 91% 60%);
}

.translate-btn.retranslate-btn {
  background: hsl(var(--success) / 0.1);
  border-color: hsl(var(--success) / 0.3);
  color: hsl(var(--success));
}

.translate-btn.retranslate-btn:hover:not(:disabled) {
  background: hsl(var(--success) / 0.2);
  border-color: hsl(var(--success) / 0.5);
  color: hsl(var(--success));
}

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (max-width: 480px) {
  .translate-panel-overlay {
    padding: 0;
  }

  .translate-panel {
    width: 100%;
    max-width: 100%;
    height: 100vh;
    max-height: 100vh;
    border-radius: 0;
    border: none;
  }

  .skills-list {
    grid-template-columns: 1fr;
  }

  .segment-btn {
    padding: 10px 8px;
    font-size: 12px;
  }
}
</style>

<script setup lang="ts">
import { ref, computed, inject, onMounted, watch } from 'vue'
import { KeyShowToast } from '../inject-keys'
import type { Skill } from '../types'
import { useSettings } from '../composables/useSettings'
import { stripFrontmatter, renderImmersiveSegments, isChineseContent } from '../utils/translate'
import type { TranslationMode } from '../utils/translate'
import { storage } from '../utils/storage'
import { useTranslationQueue } from '../composables/useTranslationQueue'
import MarkdownRenderer from './MarkdownRenderer.vue'

const props = withDefaults(defineProps<{
  skill: Skill
  skillName: string
  skillDesc: string
  skillContent: string
  isEditing: boolean
  editedContent: string
  copyStatus: Record<string, boolean>
}>(), {})

const emit = defineEmits<{
  'copy-content': [text: string, key: string]
  'toggle-edit': []
  'save-content': []
  'update:editedContent': [value: string]
}>()

const showToast = inject(KeyShowToast, () => {})
const { settings } = useSettings()
const { addTranslation, isTranslating: isTranslatingInQueue, findInQueueByHash, cacheVersion: translationCacheVersion } = useTranslationQueue()

// === Content translation ===
const isTranslating = ref(false)
const isPendingInQueue = ref(false)
const showTranslation = ref(false)
const translatedContent = ref('')
const translationMode = ref<TranslationMode>('full')
const isContentChinese = ref(false)

// === Description translation ===
const isTranslatingDesc = ref(false)
const isPendingDescInQueue = ref(false)
const descTranslationDone = ref(false)
const showDescTranslation = ref(false)
const translatedDesc = ref('')
const isDescChinese = ref(false)

const fileHash = computed(() => {
  const isDownloaded = storage.getDownloadedIds().includes(props.skill.id)
  if (isDownloaded) {
    const dir = window.services.pathJoin(window.ztools.getPath('userData'), 'skills-repo', props.skill.id)
    const skillFile = ['SKILL.md', 'skill.md'].find(f => window.services.pathExists(window.services.pathJoin(dir, f)))
    if (skillFile) {
      const raw = window.services.readFile(window.services.pathJoin(dir, skillFile))
      if (raw) return window.services.hashContent(raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n'))
    }
  }
  const readme = props.skill.readme || ''
  return readme ? window.services.hashContent(readme.replace(/\r\n/g, '\n').replace(/\r/g, '\n')) : ''
})

const translationModel = computed(() => {
  if (!settings.translationModelId) {
    return settings.aiModels.find((m) => m.isDefault && m.enabled) || null
  }
  const sepIdx = settings.translationModelId.lastIndexOf('::')
  if (sepIdx >= 0) {
    const providerId = settings.translationModelId.substring(0, sepIdx)
    const modelId = settings.translationModelId.substring(sepIdx + 2)
    const provider = settings.aiModels.find(m => m.id === providerId)
    if (provider && provider.models?.some(m => m.id === modelId && m.enabled)) {
      return { ...provider, model: modelId }
    }
  } else {
    const byProvider = settings.aiModels.find((m) => m.id === settings.translationModelId && m.enabled)
    if (byProvider) return byProvider
    for (const provider of settings.aiModels) {
      const matchedModel = provider.models?.find(
        (m) => m.id === settings.translationModelId && m.enabled,
      )
      if (matchedModel) {
        return { ...provider, model: matchedModel.id }
      }
    }
  }
  return null
})

function loadTranslationCache() {
  const fh = fileHash.value

  const cached = fh ? storage.getTranslationByHash(fh) : null
  if (cached) {
    translatedContent.value = cached.translatedContent || ''
    translationMode.value = cached.mode as TranslationMode
    showTranslation.value = true
  } else {
    translatedContent.value = ''
    showTranslation.value = false
  }
  isContentChinese.value = isChineseContent(props.skillContent)
  if (isContentChinese.value) {
    showTranslation.value = true
  }

  const cachedDesc = fh ? storage.getDescTranslationByHash(fh) : null
  if (cachedDesc) {
    translatedDesc.value = cachedDesc
    descTranslationDone.value = true
    showDescTranslation.value = true
  } else {
    translatedDesc.value = ''
    descTranslationDone.value = false
    showDescTranslation.value = false
  }
  isDescChinese.value = isChineseContent(props.skillDesc || props.skill.description || '')
  if (isDescChinese.value && !cachedDesc) {
    translatedDesc.value = props.skillDesc || props.skill.description || ''
    descTranslationDone.value = true
    showDescTranslation.value = true
  }
}

function restoreTranslatingState() {
  const fh = fileHash.value
  isTranslating.value = false
  isPendingInQueue.value = false
  isTranslatingDesc.value = false
  isPendingDescInQueue.value = false

  if (fh && isTranslatingInQueue(fh, 'content')) {
    const items = findInQueueByHash(fh)
    const contentItem = items.find(i => i.type === 'content')
    if (contentItem?.status === 'pending') {
      isPendingInQueue.value = true
    } else {
      isTranslating.value = true
    }
  }
  if (fh && isTranslatingInQueue(fh, 'desc')) {
    const items = findInQueueByHash(fh)
    const descItem = items.find(i => i.type === 'desc')
    if (descItem?.status === 'pending') {
      isPendingDescInQueue.value = true
    } else {
      isTranslatingDesc.value = true
    }
  }
}

onMounted(() => {
  loadTranslationCache()
  restoreTranslatingState()
})

watch(() => fileHash.value, () => {
  loadTranslationCache()
  restoreTranslatingState()
})

watch(translationCacheVersion, () => {
  restoreTranslatingState()
  loadTranslationCache()
})

function getVisibleContent(): string {
  if (showTranslation.value && translatedContent.value) {
    return stripFrontmatter(translatedContent.value)
  }
  return props.skillContent
}

function handleTranslate() {
  if (!props.skillContent.trim()) return

  isContentChinese.value = isChineseContent(props.skillContent)

  if (isContentChinese.value) {
    translatedContent.value = props.skillContent
    showTranslation.value = true
    return
  }

  if (translatedContent.value) {
    showTranslation.value = !showTranslation.value
    return
  }
  if (!translationModel.value) {
    showToast('请先在设置中配置 AI 模型', 'error')
    return
  }
  const ch = fileHash.value
  if (!ch) return

  const cached = storage.getTranslationByHash(ch)
  if (cached) {
    translatedContent.value = cached.translatedContent || ''
    showTranslation.value = true
    showToast(`${props.skillName || props.skill.name} 内容翻译完成`, 'success')
    return
  }

  const item = addTranslation(ch, 'content', props.skill.name || props.skillName, props.skillContent)
  if (item?.status === 'pending') {
    isPendingInQueue.value = true
  } else {
    isTranslating.value = true
  }

  const unwatch = watch(translationCacheVersion, () => {
    const cached = storage.getTranslationByHash(ch)
    if (cached) {
      translatedContent.value = cached.translatedContent || ''
      showTranslation.value = true
      isTranslating.value = false
      isPendingInQueue.value = false
      showToast(`${props.skillName || props.skill.name} 内容翻译完成`, 'success')
      unwatch()
    } else if (!isTranslatingInQueue(ch, 'content')) {
      isTranslating.value = false
      isPendingInQueue.value = false
      showToast('内容翻译失败', 'error')
      unwatch()
    }
  })
}

function handleReTranslate() {
  if (!props.skillContent.trim()) return

  isContentChinese.value = isChineseContent(props.skillContent)
  if (isContentChinese.value) {
    translatedContent.value = props.skillContent
    showTranslation.value = true
    return
  }

  if (!translationModel.value) { showToast('请先在设置中配置 AI 模型', 'error'); return }
  const ch = fileHash.value
  if (!ch) return

  storage.removeTranslationByHash(ch, 'content')
  translatedContent.value = ''
  showTranslation.value = false

  const item = addTranslation(ch, 'content', props.skill.name || props.skillName, props.skillContent)
  if (item?.status === 'pending') {
    isPendingInQueue.value = true
  } else {
    isTranslating.value = true
  }

  const unwatch = watch(translationCacheVersion, () => {
    const cached = storage.getTranslationByHash(ch)
    if (cached) {
      translatedContent.value = cached.translatedContent || ''
      showTranslation.value = true
      isTranslating.value = false
      isPendingInQueue.value = false
      showToast(`${props.skillName || props.skill.name} 内容翻译完成`, 'success')
      unwatch()
    } else if (!isTranslatingInQueue(ch, 'content')) {
      isTranslating.value = false
      isPendingInQueue.value = false
      showToast('内容翻译失败', 'error')
      unwatch()
    }
  })
}

function handleTranslateDesc() {
  const desc = props.skillDesc || props.skill.description
  if (!desc) return

  isDescChinese.value = isChineseContent(desc)

  if (isDescChinese.value) {
    translatedDesc.value = desc
    descTranslationDone.value = true
    showDescTranslation.value = true
    return
  }

  if (descTranslationDone.value) {
    showDescTranslation.value = !showDescTranslation.value
    return
  }

  if (!translationModel.value) {
    showToast('请先在设置中配置 AI 模型', 'error')
    return
  }

  const fh = fileHash.value
  if (!fh) return

  const cached = storage.getDescTranslationByHash(fh)
  if (cached) {
    translatedDesc.value = cached
    descTranslationDone.value = true
    showDescTranslation.value = true
    showToast(`${props.skillName || props.skill.name} 描述翻译完成`, 'success')
    return
  }

  const item = addTranslation(fh, 'desc', props.skill.name || props.skillName, props.skillDesc || props.skill.description)
  if (item?.status === 'pending') {
    isPendingDescInQueue.value = true
  } else {
    isTranslatingDesc.value = true
  }

  const unwatch = watch(translationCacheVersion, () => {
    const cached = storage.getDescTranslationByHash(fh)
    if (cached) {
      translatedDesc.value = cached
      descTranslationDone.value = true
      showDescTranslation.value = true
      isTranslatingDesc.value = false
      isPendingDescInQueue.value = false
      showToast(`${props.skillName || props.skill.name} 描述翻译完成`, 'success')
      unwatch()
    } else if (!isTranslatingInQueue(fh, 'desc')) {
      isTranslatingDesc.value = false
      isPendingDescInQueue.value = false
      showToast('描述翻译失败', 'error')
      unwatch()
    }
  })
}

function handleReTranslateDesc() {
  const desc = props.skillDesc || props.skill.description
  if (!desc) return

  isDescChinese.value = isChineseContent(desc)

  if (isDescChinese.value) {
    translatedDesc.value = desc
    descTranslationDone.value = true
    showDescTranslation.value = true
    return
  }

  if (!translationModel.value) {
    showToast('请先在设置中配置 AI 模型', 'error')
    return
  }

  const fh = fileHash.value
  if (!fh) return

  storage.removeTranslationByHash(fh, 'desc')
  translatedDesc.value = ''
  descTranslationDone.value = false

  const item = addTranslation(fh, 'desc', props.skill.name || props.skillName, props.skillDesc || props.skill.description)
  if (item?.status === 'pending') {
    isPendingDescInQueue.value = true
  } else {
    isTranslatingDesc.value = true
  }

  const unwatch = watch(translationCacheVersion, () => {
    const cached = storage.getDescTranslationByHash(fh)
    if (cached) {
      translatedDesc.value = cached
      descTranslationDone.value = true
      showDescTranslation.value = true
      isTranslatingDesc.value = false
      isPendingDescInQueue.value = false
      showToast(`${props.skillName || props.skill.name} 描述翻译完成`, 'success')
      unwatch()
    } else if (!isTranslatingInQueue(fh, 'desc')) {
      isTranslatingDesc.value = false
      isPendingDescInQueue.value = false
      showToast('描述翻译失败', 'error')
      unwatch()
    }
  })
}
</script>

<template>
  <div class="preview-panel space-y-8">
    <!-- Description -->
    <section class="content-section">
      <div class="section-header-row">
        <h3 class="section-heading mb-0">SKILL 描述</h3>
        <div class="section-actions">
          <template v-if="isDescChinese && descTranslationDone">
            <span class="already-chinese-hint">此描述已是中文</span>
          </template>
          <template v-else>
            <span v-if="descTranslationDone && !isDescChinese" class="translation-success-badge">翻译成功</span>
            <button v-if="descTranslationDone" class="heading-btn" @click="handleReTranslateDesc" :disabled="isTranslatingDesc || isPendingDescInQueue">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/><path d="M21 3v9h-9"/></svg>
              重新翻译
            </button>
            <button class="heading-btn" :class="{ active: descTranslationDone && showDescTranslation }" @click="handleTranslateDesc" :disabled="isTranslatingDesc || isPendingDescInQueue">
              <svg v-if="isTranslatingDesc || isPendingDescInQueue" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>
              {{ isPendingDescInQueue ? '排队中...' : isTranslatingDesc ? '翻译中...' : descTranslationDone ? (showDescTranslation ? '显示原文' : '显示译文') : '翻译描述' }}
            </button>
          </template>
        </div>
      </div>
      <div class="panel-card desc-panel">
        <p class="desc-text">{{ descTranslationDone && showDescTranslation ? translatedDesc : (skillDesc || skill.description || '暂无描述') }}</p>
      </div>
    </section>

    <!-- Content / Instructions -->
    <section class="content-section">
      <div class="section-header-row">
        <h3 class="section-heading mb-0">
          SKILL 内容
        </h3>
        <div class="section-actions">
          <template v-if="isContentChinese">
            <span class="already-chinese-hint">此内容已是中文</span>
          </template>
          <template v-else>
            <span v-if="translatedContent && !isContentChinese" class="translation-success-badge">翻译成功</span>
            <button v-if="translatedContent" class="heading-btn" @click="handleReTranslate" :disabled="isTranslating || isPendingInQueue">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/><path d="M21 3v9h-9"/></svg>
              重新翻译
            </button>
            <button class="heading-btn" :class="{ active: showTranslation && translatedContent }" @click="handleTranslate" :disabled="isTranslating || isPendingInQueue">
              <svg v-if="isTranslating || isPendingInQueue" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>
              {{ isPendingInQueue ? '排队中...' : isTranslating ? '翻译中...' : showTranslation && translatedContent ? '显示原文' : translatedContent ? '显示译文' : '翻译内容' }}
            </button>
          </template>
        </div>
      </div>
      <div class="panel-card content-panel">
        <button class="copy-md-btn" @click="emit('copy-content', isEditing ? editedContent : skillContent, 'instr')" :title="copyStatus['instr'] ? '已复制' : '复制 MD'">
          <svg v-if="copyStatus['instr']" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <template v-if="isEditing">
          <textarea :value="editedContent" @input="emit('update:editedContent', ($event.target as HTMLTextAreaElement).value)" class="content-editor" />
          <div class="editor-toolbar">
            <button class="editor-toolbar-btn" @click="emit('toggle-edit')">取消</button>
            <button class="editor-toolbar-btn primary" @click="emit('save-content')">保存</button>
          </div>
        </template>
        <template v-else>
          <div v-if="getVisibleContent()" class="skill-markdown-body p-6">
            <template v-if="showTranslation && translatedContent && translationMode === 'immersive'">
              <div v-for="(seg, i) in renderImmersiveSegments(stripFrontmatter(translatedContent))" :key="i">
                <div v-if="seg.type === 'translation'" class="translation-segment"><MarkdownRenderer :content="seg.text" /></div>
                <div v-else><MarkdownRenderer :content="seg.text" /></div>
              </div>
            </template>
            <template v-else>
              <MarkdownRenderer :content="getVisibleContent()" />
            </template>
          </div>
          <div v-else class="empty-content">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            <p>暂无内容</p>
          </div>
        </template>
      </div>
    </section>
  </div>
</template>

<style scoped>
.preview-panel { min-width: 0; }
.space-y-8 > * + * { margin-top: 32px; }
.mb-0 { margin-bottom: 0; }

/* Section heading */
.section-heading { font-size: 11px; font-weight: 700; color: hsl(var(--muted-foreground)); text-transform: uppercase; letter-spacing: 0.2em; white-space: nowrap; }
.section-header-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.section-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.already-chinese-hint { font-size: 12px; color: hsl(var(--muted-foreground)); font-style: italic; }
.translation-success-badge { font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: 6px; background: hsl(142 60% 44% / 0.1); color: hsl(142 60% 44%); white-space: nowrap; }

/* Panel cards */
.panel-card { border-radius: 16px; border: 1px solid hsl(var(--border)); padding: 20px; }
.desc-panel { background: hsl(var(--card)); }
.content-panel { background: hsl(var(--card)); box-shadow: 0 1px 3px hsl(0 0% 0% / 0.04); overflow: hidden; min-height: 200px; display: flex; flex-direction: column; position: relative; }
.copy-md-btn { position: absolute; top: 12px; right: 12px; z-index: 2; display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 8px; border: 1px solid hsl(var(--border)); background: hsl(var(--card)); color: hsl(var(--muted-foreground)); cursor: pointer; transition: all var(--duration-base) var(--ease-standard); opacity: 0; }
.content-panel:hover .copy-md-btn { opacity: 1; }
.copy-md-btn:hover { background: hsl(var(--accent)); color: hsl(var(--foreground)); }
.content-section { display: flex; flex-direction: column; gap: 16px; }

/* Description */
.desc-text { font-size: 14px; line-height: 1.7; color: hsl(var(--foreground) / 0.9); white-space: pre-line; margin-bottom: 14px; }

/* Heading buttons */
.heading-btn { display: inline-flex; align-items: center; gap: 5px; padding: 4px 12px; font-size: 12px; font-weight: 500; border-radius: 8px; border: none; background: hsl(var(--accent) / 0.6); color: hsl(var(--muted-foreground)); cursor: pointer; transition: all var(--duration-base) var(--ease-standard); white-space: nowrap; flex-shrink: 0; }
.heading-btn:hover { background: hsl(var(--accent)); color: hsl(var(--foreground)); }
.heading-btn.active { background: hsl(var(--primary) / 0.12); color: hsl(var(--primary)); }
.heading-btn:disabled { opacity: 0.6; cursor: not-allowed; }

/* Content / Markdown */
.skill-markdown-body { flex: 1; }
.content-editor { width: 100%; min-height: 300px; padding: 20px; background: transparent; border: none; font-family: 'SF Mono', Consolas, monospace; font-size: 13px; line-height: 1.6; color: hsl(var(--foreground)); resize: vertical; outline: none; flex: 1; }
.editor-toolbar { display: flex; justify-content: flex-end; gap: 8px; padding: 10px 16px; border-top: 1px solid hsl(var(--border)); background: hsl(var(--accent) / 0.3); }
.editor-toolbar-btn { padding: 6px 16px; font-size: 12px; font-weight: 500; border-radius: 8px; border: 1px solid hsl(var(--border)); background: hsl(var(--card)); color: hsl(var(--muted-foreground)); cursor: pointer; transition: all var(--duration-base) var(--ease-standard); }
.editor-toolbar-btn:hover { background: hsl(var(--muted)); }
.editor-toolbar-btn.primary { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); border-color: hsl(var(--primary)); }

.empty-content { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px 0; color: hsl(var(--muted-foreground)); opacity: 0.35; flex: 1; }
.empty-content p { margin-top: 10px; font-size: 13px; }

/* Translation */
.translation-segment { border-left: 2px solid hsl(var(--primary) / 0.4); padding-left: 12px; margin: 8px 0; color: hsl(var(--primary) / 0.7); font-style: italic; font-size: 12px; }

@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin 0.7s linear infinite; }
</style>

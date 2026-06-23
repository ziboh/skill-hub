<script setup lang="ts">
import { ref, onMounted, watch, inject, computed } from 'vue'
import { fetchSkillDetailFromSkill } from '../utils/skills-sh'
import { storage } from '../utils/storage'
import { parseFrontmatter } from '../utils/frontmatter'
import type { Skill } from '../types'
import SkillPickModal from './SkillPickModal.vue'
import { useSettings } from '../composables/useSettings'
import { translateContent } from '../utils/translate'
import type { TranslationMode } from '../utils/translate'
import { SKILL_CATEGORIES, inferCategory, CATEGORY_ICONS } from '../data/skill-categories'
import { getSourceInfo } from '../utils/source-info'

const props = defineProps<{ skill: Skill }>()
const emit = defineEmits(['close', 'imported'])
const showToast = inject<(msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void>('showToast', () => {})
const refreshCounts = inject<() => void>('refreshCounts')

const { settings } = useSettings()

const loading = ref(true)
const skillName = ref('')
const skillDesc = ref('')
const skillContent = ref('')
const importing = ref(false)

const isDownloaded = computed(() => storage.getDownloadedIds().includes(props.skill.id))

const showPickModal = ref(false)
const pickSkills = ref<{ name: string; description: string; dir: string }[]>([])
let pickSkillResolve: ((dir: string | null) => void) | null = null

const isTranslating = ref(false)
const showTranslation = ref(false)
const translatedContent = ref('')
const translationMode = ref<TranslationMode>('immersive')

const avatarColors = ['#7c3aed', '#f59e0b', '#e11d48', '#059669', '#0891b2', '#f97316', '#8b5cf6', '#db2777']
function getAvatarColor(name: string) { let hash = 0; for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash); return avatarColors[Math.abs(hash) % avatarColors.length] }

const sourceInfo = computed(() => getSourceInfo(props.skill))

const currentCategory = computed(() => {
  const cat = (props.skill.category as any) || inferCategory(props.skill.name, props.skill.description || '')
  return { id: cat, label: SKILL_CATEGORIES[cat as keyof typeof SKILL_CATEGORIES]?.label || '其他', icon: CATEGORY_ICONS[cat as keyof typeof CATEGORY_ICONS] || '📋' }
})

async function fetchContent() {
  loading.value = true
  try {
    // Use cached readme if available
    if (props.skill.readme) {
      const fm = parseFrontmatter(props.skill.readme)
      const normalized = props.skill.readme.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      const bodyMatch = normalized.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/)
      skillName.value = props.skill.name
      skillDesc.value = fm.description || props.skill.description || ''
      skillContent.value = bodyMatch ? bodyMatch[1].trim() : props.skill.readme
      loading.value = false
      return
    }
    if (props.skill.repo) {
      const result = await fetchSkillDetailFromSkill(props.skill)
      if (result) {
        skillName.value = props.skill.name
        skillDesc.value = result.description
        skillContent.value = result.content
        loading.value = false
        return
      }
    }
    skillName.value = props.skill.name
    skillDesc.value = props.skill.description || ''
    skillContent.value = ''
  } catch {}
  loading.value = false
}

onMounted(fetchContent)
watch(() => props.skill?.id, fetchContent)

function renderMarkdown(md: string): string {
  if (!md) return ''
  return md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^---$/gm, '<hr/>')
    .replace(/^\- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .split('\n').filter(l => l.trim()).join('\n')
}

const translationModel = computed(() => {
  if (!settings.translationModelId) {
    return settings.aiModels.find((m) => m.isDefault && m.enabled) || null
  }
  const byProvider = settings.aiModels.find((m) => m.id === settings.translationModelId)
  if (byProvider) return byProvider
  for (const provider of settings.aiModels) {
    const matchedModel = provider.models?.find(
      (m) => m.id === settings.translationModelId && m.enabled,
    )
    if (matchedModel) {
      return { ...provider, model: matchedModel.id }
    }
  }
  return null
})

async function handleTranslate() {
  if (!skillContent.value.trim()) return
  if (translatedContent.value) { showTranslation.value = !showTranslation.value; return }
  if (!translationModel.value) { showToast('AI 模型未配置', 'error'); return }
  isTranslating.value = true
  try {
    translatedContent.value = await translateContent(skillContent.value, translationModel.value, translationMode.value)
    showTranslation.value = true
    showToast('翻译完成', 'success')
  } catch (err: any) {
    const msg = err.message === 'AI_NOT_CONFIGURED' ? 'AI 模型未配置' :
                err.message === 'AI_AUTH_ERROR' ? 'API 认证失败，请检查 API Key' :
                err.message || '翻译失败'
    showToast(msg, 'error')
  }
  isTranslating.value = false
}

function collectAllSkillDirs(root: string): string[] {
  const results: string[] = []
  const items = window.services.readDir(root) || []
  for (const item of items) {
    if (!item.isDirectory) continue
    const skillPath = window.services.pathJoin(item.path, 'SKILL.md')
    const skillPathLower = window.services.pathJoin(item.path, 'skill.md')
    if (window.services.pathExists(skillPath) || window.services.pathExists(skillPathLower)) {
      results.push(item.path)
    }
    results.push(...collectAllSkillDirs(item.path))
  }
  return results
}

function readSkillDirMeta(dirPath: string): { name: string; description: string } {
  const skillFile = ['SKILL.md', 'skill.md']
    .map((f) => window.services.pathJoin(dirPath, f))
    .find((f) => window.services.pathExists(f))
  if (skillFile) {
    const content = window.services.readFile(skillFile)
    const fm = parseFrontmatter(content)
    return { name: fm.name || '', description: fm.description || '' }
  }
  return { name: '', description: '' }
}

function matchSkillDir(candidates: string[], targetName: string): string | null {
  if (candidates.length === 1) return candidates[0]
  if (!targetName) return candidates[0] || null
  const targetLower = targetName.toLowerCase()
  for (const dir of candidates) {
    const { name } = readSkillDirMeta(dir)
    if (name && name.toLowerCase() === targetLower) return dir
  }
  for (const dir of candidates) {
    const dirName = dir.split(/[\\/]/).pop()?.toLowerCase() || ''
    if (dirName === targetLower || dirName.includes(targetLower) || targetLower.includes(dirName)) return dir
  }
  return null
}

function pickSkillDir(candidates: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    pickSkills.value = candidates.map((dir) => {
      const { name, description } = readSkillDirMeta(dir)
      const dirName = dir.split(/[\\/]/).pop() || dir
      return { name: name || dirName, description, dir }
    })
    pickSkillResolve = resolve
    showPickModal.value = true
  })
}

function handlePickSelect(dir: string) {
  pickSkillResolve?.(dir)
  showPickModal.value = false
  pickSkillResolve = null
}

function handlePickCancel() {
  pickSkillResolve?.(null)
  showPickModal.value = false
  pickSkillResolve = null
}

async function handleImport() {
  if (!props.skill.repo || isDownloaded.value) return
  importing.value = true
  try {
    const gh = props.skill.repo.split('/')
    const buffer = await window.services.downloadFile(`https://api.github.com/repos/${gh[0]}/${gh[1]}/zipball/main`)
    const tempDir = window.services.pathJoin(window.services.homeDir(), '.cache/skill-hub/')
    window.services.mkdir(tempDir)
    const extractDir = window.services.pathJoin(tempDir, `extract-${props.skill.id.replace(/\//g, '-')}`)
    window.services.removeFile(extractDir)
    window.services.extractBufferZip(buffer as any, extractDir)
    const extractedItems = window.services.readDir(extractDir)
    const rootDir = extractedItems.find((d: any) => d.isDirectory)
    const sourceRoot = rootDir ? rootDir.path : extractDir
    const candidates = [props.skill.path, `skills/${props.skill.path}`, `agent-skills/${props.skill.path}`]
    let sourceDir = ''
    for (const p of candidates) {
      const candidate = window.services.pathJoin(sourceRoot, p)
      if (window.services.pathExists(candidate)) { sourceDir = candidate; break }
    }
    if (!sourceDir) {
      const allSkillDirs = collectAllSkillDirs(sourceRoot)
      if (allSkillDirs.length === 0) { showToast('未找到技能文件', 'error'); importing.value = false; return }
      sourceDir = matchSkillDir(allSkillDirs, props.skill.name) || await pickSkillDir(allSkillDirs)
    }
    if (!sourceDir) { showToast('未找到技能文件', 'error'); importing.value = false; return }
    const targetDir = window.services.pathJoin(window.ztools.getPath('userData'), 'skills-repo', props.skill.id)
    window.services.removeFile(targetDir); window.services.mkdir(targetDir); window.services.copyFile(sourceDir, targetDir)
    window.services.removeFile(extractDir)
    const skillFile = ['SKILL.md', 'skill.md'].find((f) => window.services.pathExists(window.services.pathJoin(targetDir, f)))
    if (skillFile) {
      const parsed = window.services.parseSkillFile(window.services.pathJoin(targetDir, skillFile))
      if (parsed?.manifest?.description) {
        // Update cached description if parsed from SKILL.md
        storage.saveCachedSkills([{ ...props.skill, description: parsed.manifest.description, storeSourceId: props.skill.storeSourceId }])
      }
    }
    storage.addDownloadedId(props.skill.id)
    refreshCounts?.()
    emit('imported')
    showToast(`已导入 ${props.skill.name}`, 'success')
  } catch (err: any) {
    showToast('导入失败: ' + (err.message || '未知错误'), 'error')
  }
  importing.value = false
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-card">
      <!-- Header -->
      <div class="modal-header">
        <div class="header-left">
          <div class="skill-avatar" :style="{ background: getAvatarColor(skillName || skill.name) }">{{ (skillName || skill.name).charAt(0).toUpperCase() }}</div>
          <div class="header-info">
            <h2 class="skill-name">{{ skillName || skill.name }}</h2>
            <p class="skill-desc">{{ skillDesc || skill.description || '暂无描述' }}</p>
            <div class="skill-tags">
              <span class="tag source-tag" :style="{ background: sourceInfo.bg, color: sourceInfo.color }">
                <svg v-if="sourceInfo.icon === 'multi'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
                <img v-else-if="sourceInfo.icon.startsWith('http') || sourceInfo.icon.startsWith('/src')" :src="sourceInfo.icon" width="12" height="12" alt="" style="border-radius: 2px;" />
                <svg v-else-if="sourceInfo.icon === 'git'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="18" cy="18" r="3"/>
                  <circle cx="6" cy="6" r="3"/>
                  <path d="M13 6h3a2 2 0 0 1 2 2v7"/>
                  <line x1="6" y1="9" x2="6" y2="21"/>
                </svg>
                <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                {{ sourceInfo.label }}
              </span>
              <span class="tag category-tag">{{ currentCategory.icon }} {{ currentCategory.label }}</span>
            </div>
            <div class="skill-meta">
              <span class="author"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> {{ skill.author || '未知' }}</span>
            </div>
          </div>
        </div>
        <button class="close-btn" @click="emit('close')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <!-- Content -->
      <div class="modal-body">
        <div v-if="loading" class="loading">
          <div class="spinner"></div>
          <span>加载中...</span>
        </div>
        <template v-else>
          <button class="translate-btn" :disabled="isTranslating" @click="handleTranslate">
            <svg v-if="isTranslating" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>
            {{ isTranslating ? '翻译中...' : showTranslation ? '显示原文' : 'AI 翻译' }}
          </button>
          <div class="content-body" v-html="renderMarkdown(showTranslation && translatedContent ? translatedContent : skillContent)"></div>
          <div v-if="!skillContent" class="empty-content">暂无内容</div>
        </template>
      </div>

      <!-- Footer -->
      <div class="modal-footer">
        <div v-if="isDownloaded" class="import-btn imported">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          已在我的 Skill 中
        </div>
        <button v-else class="import-btn" :disabled="importing || loading" @click="handleImport">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          {{ importing ? '导入中...' : '导入到我的 Skill' }}
        </button>
      </div>
    </div>
  </div>
  <SkillPickModal v-if="showPickModal" :skills="pickSkills" @select="handlePickSelect" @close="handlePickCancel" />
</template>

<style scoped>
.modal-overlay { position: fixed; inset: 0; background: hsl(0 0% 0% / 0.45); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; }
.modal-card { background: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: 20px; width: 640px; max-width: 100%; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 24px 64px hsl(0 0% 0% / 0.25); overflow: hidden; }

/* Header */
.modal-header { display: flex; align-items: flex-start; gap: 16px; padding: 24px 24px 0; flex-shrink: 0; }
.header-left { display: flex; gap: 14px; flex: 1; min-width: 0; }
.skill-avatar { width: 48px; height: 48px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 700; color: #fff; flex-shrink: 0; }
.header-info { flex: 1; min-width: 0; }
.skill-name { font-size: 18px; font-weight: 700; color: hsl(var(--foreground)); margin: 0 0 6px; }
.skill-desc { font-size: 13px; line-height: 1.5; color: hsl(var(--muted-foreground)); margin: 0 0 10px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.skill-tags { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.tag { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 500; padding: 2px 10px; border-radius: 6px; white-space: nowrap; }
.tag.source-tag { background: transparent; color: transparent; }
.tag.category-tag { background: hsl(var(--accent) / 0.6); color: hsl(var(--accent-foreground)); }
.tag svg { opacity: 0.7; flex-shrink: 0; }
.skill-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.author { display: flex; align-items: center; gap: 4px; font-size: 12px; color: hsl(var(--muted-foreground)); }
.author svg { opacity: 0.5; }
.close-btn { width: 32px; height: 32px; border-radius: 8px; border: 1px solid hsl(var(--border)); background: hsl(var(--card)); color: hsl(var(--muted-foreground)); cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all var(--duration-base) var(--ease-standard); }
.close-btn:hover { background: hsl(var(--destructive) / 0.1); color: hsl(var(--destructive)); border-color: hsl(var(--destructive) / 0.3); }

/* Body */
.modal-body { flex: 1; overflow-y: auto; overscroll-behavior: contain; padding: 20px 24px; min-height: 0; position: relative; }
.loading { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 48px; color: hsl(var(--muted-foreground)); font-size: 13px; }
.spinner { width: 20px; height: 20px; border: 2px solid hsl(var(--border)); border-top-color: hsl(var(--primary)); border-radius: 50%; animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin 0.7s linear infinite; }

.translate-btn { position: sticky; top: 0; float: right; display: inline-flex; align-items: center; gap: 5px; padding: 6px 14px; font-size: 12px; font-weight: 500; border-radius: 6px; border: 1px solid hsl(var(--border)); background: hsl(var(--card)); color: hsl(var(--muted-foreground)); cursor: pointer; transition: all var(--duration-base) var(--ease-standard); z-index: 1; }
.translate-btn:hover { border-color: hsl(var(--primary) / 0.4); color: hsl(var(--primary)); background: hsl(var(--primary) / 0.04); }
.translate-btn:disabled { opacity: 0.5; cursor: default; }

.content-body { font-size: 14px; line-height: 1.75; color: hsl(var(--foreground) / 0.9); }
.content-body :deep(h1) { font-size: 18px; font-weight: 700; margin: 20px 0 10px; color: hsl(var(--foreground)); }
.content-body :deep(h2) { font-size: 16px; font-weight: 700; margin: 16px 0 8px; color: hsl(var(--foreground)); }
.content-body :deep(h3) { font-size: 14px; font-weight: 600; margin: 14px 0 6px; color: hsl(var(--foreground)); }
.content-body :deep(p) { margin: 8px 0; }
.content-body :deep(ul), .content-body :deep(ol) { padding-left: 20px; margin: 8px 0; }
.content-body :deep(li) { margin: 3px 0; }
.content-body :deep(code) { background: hsl(var(--muted)); padding: 2px 6px; border-radius: 5px; font-size: 13px; font-family: 'SF Mono', Consolas, monospace; }
.content-body :deep(pre) { background: hsl(var(--muted)); border: 1px solid hsl(var(--border)); border-radius: 10px; padding: 14px; overflow-x: auto; margin: 10px 0; }
.content-body :deep(pre code) { background: none; padding: 0; font-size: 13px; line-height: 1.6; }
.content-body :deep(hr) { border: none; border-top: 1px solid hsl(var(--border)); margin: 14px 0; }
.content-body :deep(strong) { font-weight: 600; color: hsl(var(--foreground)); }
.content-body :deep(blockquote) { border-left: 3px solid hsl(var(--primary)); padding-left: 14px; margin: 10px 0; color: hsl(var(--muted-foreground)); }
.empty-content { display: flex; align-items: center; justify-content: center; padding: 48px; color: hsl(var(--muted-foreground)); font-size: 13px; }

/* Footer */
.modal-footer { padding: 16px 24px 20px; border-top: 1px solid hsl(var(--border)); display: flex; justify-content: flex-end; flex-shrink: 0; }
.import-btn { display: inline-flex; align-items: center; gap: 8px; padding: 12px 28px; font-size: 14px; font-weight: 600; border-radius: 12px; border: none; background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); cursor: pointer; box-shadow: 0 4px 16px hsl(var(--primary) / 0.25); transition: all var(--duration-base) var(--ease-standard); }
.import-btn:hover:not(:disabled) { box-shadow: 0 6px 24px hsl(var(--primary) / 0.35); transform: translateY(-1px); }
.import-btn:disabled { opacity: 0.5; cursor: default; }
.import-btn.imported { background: rgb(222, 242, 231); color: #166534; box-shadow: none; cursor: default; }
</style>

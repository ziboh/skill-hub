<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, inject, computed } from 'vue'
import { KeyShowToast, KeyRefreshCounts } from '../inject-keys'
import { fetchSkillDetailFromSkill } from '../utils/skills-sh'
import { storage } from '../utils/storage'
import { parseFrontmatter, extractChineseSummary } from '../utils/frontmatter'
import type { Skill } from '../types'
import SkillPickModal from './SkillPickModal.vue'
import SkillPreviewPanel from './SkillPreviewPanel.vue'
import { useSettings } from '../composables/useSettings'
import { getAvatarColor } from '../utils/color'
import { SKILL_CATEGORIES, inferCategory, CATEGORY_ICONS } from '../data/skill-categories'
import { getSourceInfo, isSvgIcon, isImageUrl } from '../utils/source-info'
import { isWellKnownSkill, downloadSkillFromWebsite, downloadDirectFromStore, type WellKnownSkillResult } from '../utils/well-known'

const props = defineProps<{ skill: Skill }>()
const emit = defineEmits(['close', 'imported'])
const showToast = inject(KeyShowToast, () => {})
const refreshCounts = inject(KeyRefreshCounts)

const { settings } = useSettings()

const loading = ref(true)
const skillName = ref('')
const skillDesc = ref('')
const skillContent = ref('')
const rawContent = ref('')
const importing = ref(false)

const isDownloaded = computed(() => storage.getDownloadedIds().includes(props.skill.id))

const showPickModal = ref(false)
const pickSkills = ref<{ name: string; description: string; dir: string }[]>([])
let pickSkillResolve: ((dir: string | null) => void) | null = null

// 当前显示的收藏状态（用于在toggleFavorite后立即更新UI）
const currentFavoriteState = ref<boolean>(false)

// 监听skill变化，同步收藏状态
watch(() => props.skill?.isFavorited, (val) => {
  currentFavoriteState.value = val ?? false
}, { immediate: true })

const isFavorited = computed(() => currentFavoriteState.value)
function toggleFavorite() {
  if (!props.skill) return
  // 记录当前收藏状态，toggleFavorite会翻转它
  const wasFavorited = currentFavoriteState.value
  storage.toggleFavorite(props.skill.id, { name: props.skill.name, description: props.skill.description, author: props.skill.author, tags: props.skill.tags, source: props.skill.source })
  // 手动更新当前显示的状态
  currentFavoriteState.value = !wasFavorited
}

const copyStatus = ref<Record<string, boolean>>({})
let copyTimers: Record<string, ReturnType<typeof setTimeout>> = {}
function handleCopy(text: string, key: string) {
  navigator.clipboard.writeText(text).catch(() => {})
  copyStatus.value[key] = true
  if (copyTimers[key]) clearTimeout(copyTimers[key])
  copyTimers[key] = setTimeout(() => { copyStatus.value[key] = false }, 2000)
}

onUnmounted(() => { Object.values(copyTimers).forEach(clearTimeout) })



const sourceInfo = computed(() => getSourceInfo(props.skill))

const currentCategory = computed(() => {
  const cat = (props.skill.category as any) || inferCategory(props.skill.name, props.skill.description || '')
  return { id: cat, label: SKILL_CATEGORIES[cat as keyof typeof SKILL_CATEGORIES]?.label || '其他', icon: CATEGORY_ICONS[cat as keyof typeof CATEGORY_ICONS] || '📋' }
})

async function fetchContent() {
  loading.value = true
  try {
    // 优先从本地磁盘读取（与 TranslatePanel 一致）
    const isDownloaded = storage.getDownloadedIds().includes(props.skill.id)
    if (isDownloaded) {
      const dir = window.services.pathJoin(window.ztools.getPath('userData'), 'skills-repo', props.skill.id)
      const skillFile = ['SKILL.md', 'skill.md'].find(f => window.services.pathExists(window.services.pathJoin(dir, f)))
      if (skillFile) {
        const raw = window.services.readFile(window.services.pathJoin(dir, skillFile))
        if (raw) {
          const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
          const fm = parseFrontmatter(normalized)
          const bodyMatch = normalized.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/)
          skillName.value = props.skill.name
          skillDesc.value = fm.description || extractChineseSummary(normalized) || props.skill.description || ''
          rawContent.value = normalized
          skillContent.value = bodyMatch ? bodyMatch[1].trim() : normalized
          loading.value = false
          return
        }
      }
    }
    // Use cached readme if available
    if (props.skill.readme) {
      const fm = parseFrontmatter(props.skill.readme)
      const normalized = props.skill.readme.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      const bodyMatch = normalized.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/)
      skillName.value = props.skill.name
      skillDesc.value = fm.description || extractChineseSummary(props.skill.readme) || ''
      rawContent.value = normalized
      skillContent.value = bodyMatch ? bodyMatch[1].trim() : props.skill.readme
    loading.value = false
    return
  }
    // Well-known / marketplace-json 技能优先从 web 缓存读取 readme
    const isWebSkill = isWellKnownSkill(props.skill) || (props.skill.source === 'marketplace-json' && !props.skill.repo && props.skill.sourceUrl)
    if (isWebSkill) {
      const webCachedReadme = storage.getCachedWebSkillReadme(props.skill.id)
      if (webCachedReadme) {
        props.skill.readme = webCachedReadme
        const fm = parseFrontmatter(webCachedReadme)
        if (fm.description) props.skill.description = fm.description
        const normalized = webCachedReadme.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        const bodyMatch = normalized.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/)
        skillName.value = props.skill.name
        skillDesc.value = fm.description || extractChineseSummary(webCachedReadme) || ''
        rawContent.value = normalized
        skillContent.value = bodyMatch ? bodyMatch[1].trim() : webCachedReadme
        loading.value = false
        return
      }
    }

    // Check persistent readme cache (24h TTL)
    const cachedContent = storage.getCachedReadme(props.skill.id)
    if (cachedContent) {
      props.skill.readme = cachedContent
      const fm = parseFrontmatter(cachedContent)
      if (fm.description) props.skill.description = fm.description
      const normalized = cachedContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      const bodyMatch = normalized.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/)
      skillName.value = props.skill.name
      skillDesc.value = fm.description || extractChineseSummary(cachedContent) || props.skill.description || ''
      rawContent.value = normalized
      skillContent.value = bodyMatch ? bodyMatch[1].trim() : cachedContent
      loading.value = false
      return
    }
  const pageState = storage.getPageState('skill-store')
  const shouldFetchFromGitHub = pageState?.fetchGitHubDesc !== false
  if (shouldFetchFromGitHub && props.skill.repo) {
    const result = await fetchSkillDetailFromSkill(props.skill, storage.getSettings().githubToken || undefined)
    if (result) {
      props.skill.readme = result.content
      props.skill.readmeCachedAt = Date.now()
      if (result.description) props.skill.description = result.description
      storage.saveGitHubSkills([props.skill])
      skillName.value = props.skill.name
      skillDesc.value = result.description
      const normalized2 = result.content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      const bodyMatch2 = normalized2.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/)
      rawContent.value = normalized2
      skillContent.value = bodyMatch2 ? bodyMatch2[1].trim() : result.content
      loading.value = false
      return
    }
  }
    if (props.skill.sourceUrl) {
      try {
        const rawUrl = props.skill.sourceUrl
          .replace('https://github.com/', 'https://raw.githubusercontent.com/')
          .replace('/tree/', '/')
        const resp = await fetch(`${rawUrl}/SKILL.md`)
        if (resp.ok) {
          const text = await resp.text()
          if (text && (text.includes('#') || text.includes('---'))) {
            const fm = parseFrontmatter(text)
            props.skill.readme = text
            props.skill.readmeCachedAt = Date.now()
            if (fm.description) props.skill.description = fm.description
            storage.saveGitHubSkills([props.skill])
            skillName.value = props.skill.name
            skillDesc.value = fm.description || props.skill.description || ''
            const normalized3 = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
            const bodyMatch3 = normalized3.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/)
            rawContent.value = normalized3
            skillContent.value = bodyMatch3 ? bodyMatch3[1].trim() : text
            loading.value = false
            return
          }
        }
      } catch {}
    }
    // Well-known skill: try to fetch from website's .well-known endpoint
    if (isWellKnownSkill(props.skill)) {
      const result = await downloadSkillFromWebsite(props.skill)
      if (result) {
        props.skill.readme = result.skillMd
        props.skill.readmeCachedAt = Date.now()
        storage.saveWebSkillReadme(props.skill, result.skillMd)
        const normalized = result.skillMd.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        const fm = parseFrontmatter(normalized)
        if (fm.description) props.skill.description = fm.description
        const bodyMatch = normalized.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/)
        skillName.value = props.skill.name
        skillDesc.value = fm.description || extractChineseSummary(normalized) || props.skill.description || ''
        rawContent.value = normalized
        skillContent.value = bodyMatch ? bodyMatch[1].trim() : result.skillMd
        loading.value = false
        return
      }
    }
    // Marketplace-json 技能：尝试从 store 源直接获取
    if (props.skill.source === 'marketplace-json' && !props.skill.repo && props.skill.sourceUrl) {
      const result = await downloadDirectFromStore(props.skill)
      if (result) {
        props.skill.readme = result.skillMd
        props.skill.readmeCachedAt = Date.now()
        storage.saveWebSkillReadme(props.skill, result.skillMd)
        const normalized = result.skillMd.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        const fm = parseFrontmatter(normalized)
        if (fm.description) props.skill.description = fm.description
        const bodyMatch = normalized.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/)
        skillName.value = props.skill.name
        skillDesc.value = fm.description || extractChineseSummary(normalized) || props.skill.description || ''
        rawContent.value = normalized
        skillContent.value = bodyMatch ? bodyMatch[1].trim() : result.skillMd
        loading.value = false
        return
      }
    }
    skillName.value = props.skill.name
    skillDesc.value = props.skill.description || ''
    rawContent.value = ''
    skillContent.value = ''
  } catch {}
  loading.value = false
}

onMounted(() => { fetchContent() })
watch(() => props.skill?.id, () => { fetchContent() })

function collectAllSkillDirs(root: string): string[] {
  const results: string[] = []
  const rootSkill = ['SKILL.md', 'skill.md'].find((f) => window.services.pathExists(window.services.pathJoin(root, f)))
  if (rootSkill) results.push(root)
  const items = window.services.readDir(root) || []
  for (const item of items) {
    if (!item.isDirectory) continue
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
    const fm = parseFrontmatter(content || '')
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

async function writeImportFiles(result: WellKnownSkillResult) {
  const targetDir = window.services.pathJoin(window.ztools.getPath('userData'), 'skills-repo', props.skill.id)
  window.services.removeFile(targetDir)
  window.services.mkdir(targetDir)
  for (const [filePath, content] of result.files) {
    const fullPath = window.services.pathJoin(targetDir, filePath)
    const dir = fullPath.substring(0, fullPath.lastIndexOf('/') || fullPath.lastIndexOf('\\'))
    if (dir && !window.services.pathExists(dir)) {
      window.services.mkdir(dir)
    }
    window.services.writeFile(fullPath, content)
  }
  const parsed = window.services.parseSkillFile(window.services.pathJoin(targetDir, 'SKILL.md'))
  const description = parsed?.manifest?.description || props.skill.description || ''
  storage.saveCachedSkills([{ ...props.skill, description, storeSourceId: props.skill.storeSourceId }])
  storage.addDownloadedId(props.skill.id)
  storage.addSessionDownload(props.skill.id, props.skill.name, 'skills-sh')
  refreshCounts?.()
  emit('imported')
  showToast(`已导入 ${props.skill.name}`, 'success')
}

async function handleImport() {
  if (isDownloaded.value) return
  importing.value = true
  try {
    let result: WellKnownSkillResult | null = null

    // 1. Well-known (网站类) 技能：尝试 .well-known 端点下载
    if (isWellKnownSkill(props.skill)) {
      result = await downloadSkillFromWebsite(props.skill)
    }

    // 2. marketplace-json 技能（无 GitHub repo）：尝试从 store 源直接下载
    if (!result && props.skill.source === 'marketplace-json' && !props.skill.repo && props.skill.sourceUrl) {
      result = await downloadDirectFromStore(props.skill)
    }

    if (result) {
      await writeImportFiles(result)
      importing.value = false
      return
    }

    // GitHub 技能
    if (!props.skill.repo) {
      showToast('该技能没有关联的 GitHub 仓库，无法导入', 'error')
      importing.value = false
      return
    }
    const gh = props.skill.repo.split('/')
    const buffer = await window.services.downloadFile(`https://api.github.com/repos/${gh[0]}/${gh[1]}/zipball/${props.skill.branch || 'main'}`, storage.getSettings().githubToken || undefined)
    const tempDir = window.services.pathJoin(window.services.homeDir(), '.cache/skill-hub/')
    window.services.mkdir(tempDir)
    const extractDir = window.services.pathJoin(tempDir, `extract-${props.skill.id.replace(/\//g, '-')}`)
    window.services.removeFile(extractDir)
    window.services.extractBufferZip(buffer as any, extractDir)
    const extractedItems = window.services.readDir(extractDir)
    const rootDir = extractedItems.find((d: any) => d.isDirectory)
    const sourceRoot = rootDir ? rootDir.path : extractDir
    const candidates = [props.skill.path, `skills/${props.skill.path}`, `agent-skills/${props.skill.path}`].filter(Boolean) as string[]
    let sourceDir: string | null = ''
    for (const p of candidates) {
      const candidate = window.services.pathJoin(sourceRoot, p)
      if (window.services.pathExists(candidate)) { sourceDir = candidate; break }
    }
    if (!sourceDir) {
      const allSkillDirs = collectAllSkillDirs(sourceRoot)
      if (allSkillDirs.length === 0) { showToast('未找到技能文件', 'error'); importing.value = false; return }
      sourceDir = matchSkillDir(allSkillDirs, props.skill.name) || (await pickSkillDir(allSkillDirs))
    }
    if (!sourceDir) { showToast('未找到技能文件', 'error'); importing.value = false; return }
    const targetDir = window.services.pathJoin(window.ztools.getPath('userData'), 'skills-repo', props.skill.id)
    window.services.removeFile(targetDir); window.services.mkdir(targetDir); window.services.copyFile(sourceDir, targetDir)
    window.services.saveSkillMetaAfterDownload(props.skill.repo, props.skill.branch || 'main', storage.getSettings().githubToken || undefined, targetDir)
    window.services.removeFile(extractDir)
    const skillFile = ['SKILL.md', 'skill.md'].find((f) => window.services.pathExists(window.services.pathJoin(targetDir, f)))
    if (skillFile) {
      const parsed = window.services.parseSkillFile(window.services.pathJoin(targetDir, skillFile))
      const description = parsed?.manifest?.description || props.skill.description || ''
      storage.saveCachedSkills([{ ...props.skill, description, storeSourceId: props.skill.storeSourceId }])
    }
    storage.addDownloadedId(props.skill.id)
    storage.addSessionDownload(props.skill.id, props.skill.name, 'marketplace')
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
      <!-- Header (aligned with SkillDetailBase) -->
      <div class="modal-header">
        <div class="header-left">
          <div class="header-title-row">
            <div class="header-icon" :style="{ background: getAvatarColor(skillName || skill.name) }">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
            </div>
            <div class="header-title-info">
              <h2>{{ skillName || skill.name }}</h2>
              <div class="header-tags">
                <span class="header-tag source-tag" :style="{ background: sourceInfo.bg, color: sourceInfo.color }">
                  <svg v-if="sourceInfo.icon === 'multi'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="2" y1="12" x2="22" y2="12"/>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                  </svg>
                  <img v-else-if="isImageUrl(sourceInfo.icon)" :src="sourceInfo.icon" width="12" height="12" alt="" style="border-radius: 2px;" />
                  <span v-else-if="isSvgIcon(sourceInfo.icon)" v-html="sourceInfo.icon" class="tag-icon-svg"></span>
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
                <span class="header-tag category-tag">{{ currentCategory.icon }} {{ currentCategory.label }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="header-toolbar">
          <button v-if="isDownloaded" class="toolbar-icon-btn" :class="{ favorited: isFavorited }" :title="isFavorited ? '取消收藏' : '收藏'" @click="toggleFavorite()">
            <svg width="16" height="16" viewBox="0 0 24 24" :fill="isFavorited ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </button>
          <button class="toolbar-icon-btn close-btn" title="关闭" @click="emit('close')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      <!-- Content (aligned with SkillDetailBase preview tab) -->
      <div class="modal-body">
        <div v-if="loading" class="loading">
          <div class="spinner"></div>
          <span>加载中...</span>
        </div>
        <template v-else>
          <div class="preview-content">
            <SkillPreviewPanel
              :skill="skill"
              :skill-name="skillName"
              :skill-desc="skillDesc"
              :skill-content="skillContent"
              :is-editing="false"
              :edited-content="''"
              :copy-status="copyStatus"
              @copy-content="(text, key) => handleCopy(text, key)"
            />
          </div>
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

/* ═══ Header (aligned with SkillDetailBase) ═══ */
.modal-header { display: flex; align-items: flex-start; justify-content: space-between; padding: 22px 24px 16px; flex-shrink: 0; }
.header-left { display: flex; flex-direction: column; gap: 6px; }
.header-title-row { display: flex; align-items: center; gap: 10px; }
.header-icon { width: 48px; height: 48px; border-radius: 14px; display: flex; align-items: center; justify-content: center; color: #fff; flex-shrink: 0; box-shadow: 0 4px 12px hsl(var(--primary) / 0.2); }
.header-title-info { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.header-title-info h2 { font-size: 22px; font-weight: 600; color: hsl(var(--foreground)); margin: 0; }
.header-tags { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.header-tag { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 500; padding: 2px 10px; border-radius: 6px; white-space: nowrap; }
.header-tag.source-tag { background: transparent; color: transparent; }
.header-tag.category-tag { background: hsl(var(--accent) / 0.6); color: hsl(var(--accent-foreground)); }
.header-tag svg { opacity: 0.7; flex-shrink: 0; }
.tag-icon-svg { display: inline-flex; align-items: center; }
.tag-icon-svg svg { width: 12px; height: 12px; }

.header-toolbar { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.toolbar-icon-btn { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: 1px solid hsl(var(--border)); border-radius: 8px; background: hsl(var(--card)); color: hsl(var(--muted-foreground)); cursor: pointer; transition: all var(--duration-base) var(--ease-standard); }
.toolbar-icon-btn:hover { background: hsl(var(--accent)); color: hsl(var(--foreground)); }
.toolbar-icon-btn:disabled { opacity: 0.35; cursor: default; }
.toolbar-icon-btn.disabled { opacity: 0.35; cursor: not-allowed; pointer-events: none; }
.toolbar-icon-btn.favorited { color: #f59e0b; border-color: hsl(48 96% 50% / 0.4); }
.toolbar-icon-btn.close-btn:hover { color: hsl(var(--destructive)); border-color: hsl(var(--destructive) / 0.3); background: hsl(var(--destructive) / 0.06); }

/* ═══ Body ═══ */
.modal-body { flex: 1; overflow-y: auto; overscroll-behavior: contain; padding: 0 24px 20px; min-height: 0; }
.loading { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 48px; color: hsl(var(--muted-foreground)); font-size: 13px; }
.spinner { width: 20px; height: 20px; border: 2px solid hsl(var(--border)); border-top-color: hsl(var(--primary)); border-radius: 50%; animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.preview-content { padding: 20px 0; }

/* ═══ Footer ═══ */
.modal-footer { padding: 16px 24px 20px; border-top: 1px solid hsl(var(--border)); display: flex; justify-content: flex-end; flex-shrink: 0; }
.import-btn { display: inline-flex; align-items: center; gap: 8px; padding: 12px 28px; font-size: 14px; font-weight: 600; border-radius: 12px; border: none; background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); cursor: pointer; box-shadow: 0 4px 16px hsl(var(--primary) / 0.25); transition: all var(--duration-base) var(--ease-standard); }
.import-btn:hover:not(:disabled) { box-shadow: 0 6px 24px hsl(var(--primary) / 0.35); transform: translateY(-1px); }
.import-btn:disabled { opacity: 0.5; cursor: default; }
.import-btn.imported { background: rgb(222, 242, 231); color: #166534; box-shadow: none; cursor: default; }
</style>

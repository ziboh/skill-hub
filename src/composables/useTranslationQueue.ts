import { ref, watch } from 'vue'
import { translateContent, translateDescription, translateTags, isChineseContent, isChineseText, stripFrontmatter } from '../utils/translate'
import { AIError } from '../utils/ai'
import { storage } from '../utils/storage'
import type { ModelConfig, Skill } from '../types'

export interface TranslationQueueItem {
  hash: string
  skillId?: string
  skillName?: string
  type: 'content' | 'desc'
  status: 'pending' | 'translating'
  startedAt: number
  text?: string
}

export const MAX_CONCURRENT = 2
const STALE_MS = 2 * 60 * 1000
const HEARTBEAT_MS = 60 * 1000

const QUEUE_KEY = 'sm_translation_queue'

function loadQueue(): TranslationQueueItem[] {
  try {
    const raw = window.ztools.dbStorage.getItem(QUEUE_KEY)
    if (raw) return JSON.parse(raw) as TranslationQueueItem[]
  } catch {}
  return []
}

function saveQueue(items: TranslationQueueItem[]): void {
  try {
    window.ztools.dbStorage.setItem(QUEUE_KEY, JSON.stringify(items))
  } catch {}
}

const queue = ref<TranslationQueueItem[]>([])
export const cacheVersion = ref(0)
export const processingHashes = new Set<string>()

function cleanStaleItems() {
  const now = Date.now()
  const stale = queue.value.filter(i => i.status === 'translating' && (now - i.startedAt) > STALE_MS)
  if (stale.length === 0) return
  for (const item of stale) {
    processingHashes.delete(`${item.hash}:${item.type}`)
    item.status = 'pending'
  }
  saveQueue(queue.value)
  promoteNext()
  cacheVersion.value++
}

queue.value = loadQueue()
cleanStaleItems()

let heartbeatTimer: ReturnType<typeof setInterval> | undefined
function startHeartbeat() {
  if (heartbeatTimer) return
  heartbeatTimer = setInterval(() => {
    const hadStale = queue.value.some(i => i.status === 'translating' && (Date.now() - i.startedAt) > STALE_MS)
    if (hadStale) cleanStaleItems()
  }, HEARTBEAT_MS)
}
startHeartbeat()

let lastHiddenAt: number | null = null
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    lastHiddenAt = Date.now()
  } else if (lastHiddenAt !== null) {
    const hiddenDuration = Date.now() - lastHiddenAt
    lastHiddenAt = null
    if (hiddenDuration > 30_000) {
      cleanStaleItems()
    }
  }
})

function promoteNext() {
  while (true) {
    const translatingCount = queue.value.filter(i => i.status === 'translating').length
    if (translatingCount >= MAX_CONCURRENT) break
    const pendingItems = queue.value
      .filter(i => i.status === 'pending')
      .sort((a, b) => a.startedAt - b.startedAt)
    if (pendingItems.length === 0) break
    pendingItems[0].status = 'translating'
    cacheVersion.value++
  }
  saveQueue(queue.value)
}

// ─── 队列操作 ─────────────────────────────────────────

function addTranslation(hash: string, type: 'content' | 'desc', skillName?: string, text?: string) {
  const existing = queue.value.find((item) => item.hash === hash && item.type === type)
  if (existing) return existing

  const translatingCount = queue.value.filter(i => i.status === 'translating').length
  const status = translatingCount >= MAX_CONCURRENT ? 'pending' : 'translating'

  const item: TranslationQueueItem = {
    hash,
    skillName,
    type,
    status,
    startedAt: Date.now(),
    text,
  }
  queue.value.push(item)
  saveQueue(queue.value)
  cacheVersion.value++
  return item
}

function removeTranslation(hash: string, type: 'content' | 'desc') {
  const idx = queue.value.findIndex((item) => item.hash === hash && item.type === type)
  if (idx === -1) return
  processingHashes.delete(`${hash}:${type}`)
  queue.value.splice(idx, 1)
  promoteNext()
  saveQueue(queue.value)
  cacheVersion.value++
}

// ─── 统一翻译处理器 ─────────────────────────────────────

function getTranslationModel(): ModelConfig | null {
  const settings = storage.getSettings()
  const modelId = settings.translationModelId
  if (!modelId) return null
  const providers = settings.aiModels || []
  const sepIdx = modelId.lastIndexOf('::')
  if (sepIdx >= 0) {
    const providerId = modelId.substring(0, sepIdx)
    const mId = modelId.substring(sepIdx + 2)
    const provider = providers.find(m => m.id === providerId)
    if (provider && provider.enabled !== false && provider.models?.some(m => m.id === mId && m.enabled)) {
      return { ...provider, model: mId } as ModelConfig
    }
  } else {
    for (const provider of providers) {
      if (provider.models) {
        const model = provider.models.find(m => m.id === modelId && m.enabled)
        if (model && provider.enabled !== false) return { ...provider, model: model.id } as ModelConfig
      }
    }
  }
  return null
}

function getSkillDir(skill: Skill): string {
  const downloadedIds = storage.getDownloadedIds()
  if (downloadedIds.includes(skill.id)) {
    return window.services.pathJoin(window.ztools.getPath('userData'), 'skills-repo', skill.id)
  }
  return skill.path || ''
}

function readSkillFileContent(dir: string): string | null {
  if (!dir) return null
  const skillFile = ['SKILL.md', 'skill.md'].find(f =>
    window.services.pathExists(window.services.pathJoin(dir, f))
  )
  if (!skillFile) return null
  const content = window.services.readFile(window.services.pathJoin(dir, skillFile))
  return content ? content.replace(/\r\n/g, '\n').replace(/\r/g, '\n') : null
}

function readSkillContent(skill: Skill): string | null {
  const dir = getSkillDir(skill)
  const content = readSkillFileContent(dir) || skill.readme || null
  return content ? stripFrontmatter(content) : null
}

function findSkillByHash(skills: Skill[], hash: string, type: 'content' | 'desc'): Skill | null {
  for (const s of skills) {
    // 使用整个 SKILL.md 文件的哈希
    if (s.readme) {
      if (window.services.hashContent(s.readme.replace(/\r\n/g, '\n').replace(/\r/g, '\n')) === hash) return s
    }
    const dir = getSkillDir(s)
    const raw = readSkillFileContent(dir)
    if (raw) {
      if (window.services.hashContent(raw) === hash) return s
    }
  }
  return null
}

async function processQueueItem(item: TranslationQueueItem, model: ModelConfig | null) {
  if (!model) throw new Error('翻译模型不可用，对应的供应商或模型已关闭')

  const cachedSkills = storage.getCachedSkills()
  const skill = findSkillByHash(cachedSkills, item.hash, item.type)
  if (!skill && !item.text) return

  if (item.type === 'desc') {
    if (storage.getDescTranslationByHash(item.hash)) return
    const descText = skill?.description || item.text
    if (descText && !isChineseContent(descText)) {
      const translatedDesc = await translateDescription(descText, model)
      storage.saveDescTranslationByHash(item.hash, translatedDesc, skill?.name || item.skillName)
    }
    if (skill) {
      const tags = skill.tags || []
      if (tags.length > 0 && !tags.every(t => isChineseText(t))) {
        const translatedTags = await translateTags(tags, model)
        storage.saveTranslationTagsByHash(item.hash, translatedTags)
      }
    }
  } else {
    if (storage.getTranslationByHash(item.hash)) return
    const contentText = skill ? readSkillContent(skill) : (item.text || '')
    if (contentText && !isChineseContent(contentText)) {
      const translatedContent = await translateContent(contentText, model, 'full')
      storage.saveTranslationByHash(item.hash, {
        sourceContent: contentText,
        translatedContent,
        mode: 'full',
        skillName: skill?.name || item.skillName || '',
      })
    }
  }
}

// 全局唯一翻译处理 watch
watch(cacheVersion, () => {
  const model = getTranslationModel()
  for (const item of [...queue.value]) {
    if (item.status !== 'translating') continue
    const key = `${item.hash}:${item.type}`
    if (processingHashes.has(key)) continue
    processingHashes.add(key)

    processQueueItem(item, model)
      .catch((e) => {
        const errorDetails = e instanceof AIError ? e.details : null
        storage.addFailureRecord({
          type: 'translation',
          skillId: item.hash,
          skillName: item.skillName || '',
          error: errorDetails?.message || (e instanceof Error ? e.message : '未知错误'),
          details: `翻译${item.type === 'content' ? '内容' : '描述'}失败`,
          errorCategory: errorDetails?.category || 'unknown',
          model: errorDetails?.model,
          provider: errorDetails?.provider,
          endpoint: errorDetails?.endpoint,
          statusCode: errorDetails?.statusCode,
          requestId: errorDetails?.requestId,
          duration: errorDetails?.duration,
          metadata: errorDetails?.rawResponse ? { rawResponse: errorDetails.rawResponse } : undefined,
        })
      })
      .finally(() => {
        processingHashes.delete(key)
        removeTranslation(item.hash, item.type)
      })
  }
}, { immediate: true })

// ─── 导出 ──────────────────────────────────────────────

export function useTranslationQueue() {
  function isTranslating(hash: string, type: 'content' | 'desc') {
    return queue.value.some((item) => item.hash === hash && item.type === type)
  }

  function findInQueueByHash(hash: string): TranslationQueueItem[] {
    return queue.value.filter((item) => item.hash === hash)
  }

  function waitForTurn(hash: string, type: 'content' | 'desc') {
    return new Promise<void>((resolve) => {
      const item = queue.value.find(i => i.hash === hash && i.type === type)
      if (!item || item.status === 'translating') {
        resolve()
        return
      }
      const stop = watch(cacheVersion, () => {
        const current = queue.value.find(i => i.hash === hash && i.type === type)
        if (!current || current.status === 'translating') {
          stop()
          resolve()
        }
      })
    })
  }

  function notifyCacheChanged() {
    cacheVersion.value++
  }

  function clearAll() {
    queue.value = []
    processingHashes.clear()
    saveQueue(queue.value)
    cacheVersion.value++
  }

  async function resumeAll(model: ModelConfig) {
    const items = [...queue.value]
    for (const item of items) {
      const key = `${item.hash}:${item.type}`
      if (processingHashes.has(key)) continue
      processingHashes.add(key)

      const cachedSkills = storage.getCachedSkills()
      const skill = cachedSkills.find(s => {
        // 使用整个 SKILL.md 文件的哈希
        if (s.readme) {
          if (window.services.hashContent(s.readme.replace(/\r\n/g, '\n').replace(/\r/g, '\n')) === item.hash) return true
        }
        const dir = getSkillDir(s)
        const raw = readSkillFileContent(dir)
        if (raw) {
          return window.services.hashContent(raw) === item.hash
        }
        return false
      })
      if (!skill) {
        processingHashes.delete(key)
        // 找不到技能时保留项目，状态改回 pending
        item.status = 'pending'
        saveQueue(queue.value)
        cacheVersion.value++
        continue
      }
      try {
        if (item.type === 'desc') {
          if (skill.description && !isChineseContent(skill.description)) {
            const translatedDesc = await translateDescription(skill.description, model)
            storage.saveDescTranslationByHash(item.hash, translatedDesc, skill.name)
          }
          const tags = skill.tags || []
          if (tags.length > 0 && !tags.every(t => isChineseText(t))) {
            const translatedTags = await translateTags(tags, model)
            storage.saveTranslationTagsByHash(item.hash, translatedTags)
          }
        } else {
          const downloadedIds = storage.getDownloadedIds()
          const skillDir = downloadedIds.includes(skill.id)
            ? window.services.pathJoin(window.ztools.getPath('userData'), 'skills-repo', skill.id)
            : skill.path || ''
          const skillFile = ['SKILL.md', 'skill.md'].find(f =>
            window.services.pathExists(window.services.pathJoin(skillDir, f))
          )
          if (skillFile) {
            const content = window.services.readFile(window.services.pathJoin(skillDir, skillFile))
            if (content && !isChineseContent(content)) {
              const translatedContent = await translateContent(content, model, 'full')
              storage.saveTranslationByHash(item.hash, {
                sourceContent: content,
                translatedContent,
                mode: 'full',
                skillName: skill.name,
              })
            }
          }
        }
        processingHashes.delete(key)
        removeTranslation(item.hash, item.type)
      } catch (error) {
        console.error('继续翻译失败:', error)
        const errorDetails = error instanceof AIError ? error.details : null
        storage.addFailureRecord({
          type: 'translation',
          skillId: item.hash,
          skillName: skill.name,
          error: errorDetails?.message || (error instanceof Error ? error.message : '未知错误'),
          details: `翻译${item.type === 'content' ? '内容' : '描述'}失败`,
          errorCategory: errorDetails?.category || 'unknown',
          model: errorDetails?.model,
          provider: errorDetails?.provider,
          endpoint: errorDetails?.endpoint,
          statusCode: errorDetails?.statusCode,
          requestId: errorDetails?.requestId,
          duration: errorDetails?.duration,
          metadata: errorDetails?.rawResponse ? { rawResponse: errorDetails.rawResponse } : undefined,
        })
        processingHashes.delete(key)
        removeTranslation(item.hash, item.type)
      }
    }
  }

  return {
    queue,
    cacheVersion,
    addTranslation,
    removeTranslation,
    isTranslating,
    findInQueueByHash,
    waitForTurn,
    notifyCacheChanged,
    clearAll,
    resumeAll,
  }
}

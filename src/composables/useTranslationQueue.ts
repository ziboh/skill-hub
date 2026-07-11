import { ref, watch } from 'vue'
import { translateContent, translateDescription, isChineseContent, stripFrontmatter } from '../utils/translate'
import { AIError } from '../utils/ai'
import { storage } from '../utils/storage'
import type { ModelConfig, Skill } from '../types'
import { getSkillsRepoDir } from '../utils/skill-path'

export interface TranslationQueueItem {
  hash: string
  skillId?: string
  skillName?: string
  type: 'content' | 'desc'
  status: 'pending' | 'translating'
  startedAt: number
  text?: string
  /** consecutive failures; after MAX_RETRIES item is dropped */
  retries?: number
  lastError?: string
}

export const MAX_CONCURRENT = 2
export const MAX_RETRIES = 3
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
  const stale = queue.value.filter((i) => i.status === 'translating' && now - i.startedAt > STALE_MS)
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
// On load, any "translating" is stale (process restarted)
for (const item of queue.value) {
  if (item.status === 'translating') {
    item.status = 'pending'
    processingHashes.delete(`${item.hash}:${item.type}`)
  }
}
saveQueue(queue.value)
cleanStaleItems()

let heartbeatTimer: ReturnType<typeof setInterval> | undefined
function startHeartbeat() {
  if (heartbeatTimer) return
  heartbeatTimer = setInterval(() => {
    const hadStale = queue.value.some((i) => i.status === 'translating' && Date.now() - i.startedAt > STALE_MS)
    if (hadStale) cleanStaleItems()
  }, HEARTBEAT_MS)
}
startHeartbeat()

let lastHiddenAt: number | null = null
if (typeof document !== 'undefined') {
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
}

function promoteNext() {
  while (true) {
    const translatingCount = queue.value.filter((i) => i.status === 'translating').length
    if (translatingCount >= MAX_CONCURRENT) break
    const pendingItems = queue.value.filter((i) => i.status === 'pending').sort((a, b) => a.startedAt - b.startedAt)
    if (pendingItems.length === 0) break
    const next = pendingItems[0]
    next.status = 'translating'
    next.startedAt = Date.now()
  }
  saveQueue(queue.value)
}

// ─── 队列操作 ─────────────────────────────────────────

/**
 * Enqueue a translation job.
 * @param hash content hash (sha256 of SKILL.md or description source)
 * @param type content | desc
 * @param skillName display name
 * @param text optional source text (when skill dir unavailable)
 * @param skillId optional skill id for failure records / lookup
 */
function addTranslation(hash: string, type: 'content' | 'desc', skillName?: string, text?: string, skillId?: string) {
  if (!hash || (type !== 'content' && type !== 'desc')) {
    console.warn('[translation-queue] invalid addTranslation args', { hash, type })
    return null
  }

  const existing = queue.value.find((item) => item.hash === hash && item.type === type)
  if (existing) {
    if (skillName && !existing.skillName) existing.skillName = skillName
    if (text && !existing.text) existing.text = text
    if (skillId && !existing.skillId) existing.skillId = skillId
    // re-queue if was stuck pending with failures under limit
    if (existing.status === 'pending') {
      promoteNext()
      cacheVersion.value++
    }
    return existing
  }

  const translatingCount = queue.value.filter((i) => i.status === 'translating').length
  const status = translatingCount >= MAX_CONCURRENT ? 'pending' : 'translating'

  const item: TranslationQueueItem = {
    hash,
    skillId,
    skillName,
    type,
    status,
    startedAt: Date.now(),
    text,
    retries: 0,
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
    const provider = providers.find((m) => m.id === providerId)
    if (provider && provider.enabled !== false && provider.models?.some((m) => m.id === mId && m.enabled)) {
      return { ...provider, model: mId } as ModelConfig
    }
  } else {
    for (const provider of providers) {
      if (provider.models) {
        const model = provider.models.find((m) => m.id === modelId && m.enabled)
        if (model && provider.enabled !== false) return { ...provider, model: model.id } as ModelConfig
      }
    }
  }
  return null
}

function getSkillDir(skill: Skill): string {
  const downloadedIds = storage.getDownloadedIds()
  if (downloadedIds.includes(skill.id)) {
    try {
      return getSkillsRepoDir(skill.id)
    } catch {
      return skill.path || ''
    }
  }
  return skill.path || ''
}

function readSkillFileContent(dir: string): string | null {
  if (!dir) return null
  const skillFile = ['SKILL.md', 'skill.md'].find((f) => window.services.pathExists(window.services.pathJoin(dir, f)))
  if (!skillFile) return null
  const content = window.services.readFile(window.services.pathJoin(dir, skillFile))
  return content ? content.replace(/\r\n/g, '\n').replace(/\r/g, '\n') : null
}

function readSkillContent(skill: Skill): string | null {
  const dir = getSkillDir(skill)
  const content = readSkillFileContent(dir) || skill.readme || null
  return content ? stripFrontmatter(content) : null
}

function findSkillByHash(skills: Skill[], hash: string): Skill | null {
  for (const s of skills) {
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

function recordTranslationFailure(item: TranslationQueueItem, e: unknown, skillName?: string) {
  const errorDetails = e instanceof AIError ? e.details : null
  storage.addFailureRecord({
    type: 'translation',
    skillId: item.skillId || item.hash,
    skillName: skillName || item.skillName || '',
    error: errorDetails?.message || (e instanceof Error ? e.message : '未知错误'),
    details: `翻译${item.type === 'content' ? '内容' : '描述'}失败 (hash: ${item.hash.slice(0, 12)}…)`,
    errorCategory: errorDetails?.category || 'unknown',
    model: errorDetails?.model,
    provider: errorDetails?.provider,
    endpoint: errorDetails?.endpoint,
    statusCode: errorDetails?.statusCode,
    requestId: errorDetails?.requestId,
    duration: errorDetails?.duration,
    metadata: errorDetails?.rawResponse ? { rawResponse: errorDetails.rawResponse } : undefined,
  })
}

/**
 * Process one queue item. Returns:
 * - 'done' success or nothing to do → remove from queue
 * - 'retry' failed, keep for retry
 * - 'skip' temporarily unavailable (no model / no skill yet), stay pending
 */
async function processQueueItem(item: TranslationQueueItem, model: ModelConfig | null): Promise<'done' | 'retry' | 'skip'> {
  if (!model) return 'skip'

  const cachedSkills = storage.getCachedSkills()
  const skill = findSkillByHash(cachedSkills, item.hash)
  if (!skill && !item.text) return 'skip'

  if (skill?.id && !item.skillId) item.skillId = skill.id

  try {
    if (item.type === 'desc') {
      if (storage.getDescTranslationByHash(item.hash)) return 'done'
      const descText = skill?.description || item.text
      if (!descText || isChineseContent(descText)) return 'done'
      const translatedDesc = await translateDescription(descText, model)
      storage.saveDescTranslationByHash(item.hash, translatedDesc, skill?.name || item.skillName)
    } else {
      if (storage.getTranslationByHash(item.hash)?.translatedContent) return 'done'
      const contentText = skill ? readSkillContent(skill) : item.text || ''
      if (!contentText || isChineseContent(contentText)) return 'done'
      const translatedContent = await translateContent(contentText, model, 'full')
      storage.saveTranslationByHash(item.hash, {
        sourceContent: contentText,
        translatedContent,
        mode: 'full',
        skillName: skill?.name || item.skillName || '',
      })
    }
    return 'done'
  } catch (e) {
    item.lastError = e instanceof Error ? e.message : String(e)
    recordTranslationFailure(item, e, skill?.name)
    return 'retry'
  }
}

// 全局唯一翻译处理 watch（唯一 worker）
watch(
  cacheVersion,
  () => {
    const model = getTranslationModel()
    for (const item of [...queue.value]) {
      if (item.status !== 'translating') continue
      const key = `${item.hash}:${item.type}`
      if (processingHashes.has(key)) continue
      processingHashes.add(key)

      processQueueItem(item, model)
        .then((result) => {
          processingHashes.delete(key)
          if (result === 'done') {
            removeTranslation(item.hash, item.type)
            return
          }
          // retry or skip: back to pending (or drop after max retries)
          const current = queue.value.find((i) => i.hash === item.hash && i.type === item.type)
          if (!current) return
          if (result === 'retry') {
            current.retries = (current.retries || 0) + 1
            if (current.retries >= MAX_RETRIES) {
              removeTranslation(item.hash, item.type)
              return
            }
          }
          current.status = 'pending'
          saveQueue(queue.value)
          promoteNext()
          cacheVersion.value++
        })
        .catch((e) => {
          console.error('[translation-queue] unexpected', e)
          processingHashes.delete(key)
          const current = queue.value.find((i) => i.hash === item.hash && i.type === item.type)
          if (current) {
            current.status = 'pending'
            current.retries = (current.retries || 0) + 1
            saveQueue(queue.value)
            promoteNext()
            cacheVersion.value++
          }
        })
    }
  },
  { immediate: true },
)

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
      const item = queue.value.find((i) => i.hash === hash && i.type === type)
      if (!item || item.status === 'translating') {
        resolve()
        return
      }
      const stop = watch(cacheVersion, () => {
        const current = queue.value.find((i) => i.hash === hash && i.type === type)
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

  /**
   * Resume stuck jobs after app restart / model available.
   * Does NOT run translations itself — only re-queues and lets the watch worker run.
   */
  function resumeAll(_model?: ModelConfig) {
    let changed = false
    for (const item of queue.value) {
      const key = `${item.hash}:${item.type}`
      // release any stuck processing locks
      if (processingHashes.has(key) && item.status !== 'translating') {
        processingHashes.delete(key)
      }
      if (item.status === 'translating') {
        // if not actually processing, reset
        if (!processingHashes.has(key)) {
          item.status = 'pending'
          changed = true
        }
      }
      // reset retry budget for explicit resume
      if ((item.retries || 0) > 0) {
        item.retries = 0
        changed = true
      }
    }
    if (changed) saveQueue(queue.value)
    promoteNext()
    cacheVersion.value++
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

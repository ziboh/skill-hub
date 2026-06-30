import { ref, watch } from 'vue'

export interface TranslationQueueItem {
  hash: string
  skillId?: string
  skillName?: string
  type: 'content' | 'desc'
  status: 'pending' | 'translating'
  startedAt: number
}

export const MAX_CONCURRENT = 2

const queue = ref<TranslationQueueItem[]>([])
const cacheVersion = ref(0)

function promoteNext() {
  const translatingCount = queue.value.filter(i => i.status === 'translating').length
  if (translatingCount >= MAX_CONCURRENT) return
  const pendingItems = queue.value
    .filter(i => i.status === 'pending')
    .sort((a, b) => a.startedAt - b.startedAt)
  if (pendingItems.length === 0) return
  pendingItems[0].status = 'translating'
  cacheVersion.value++
}

export function useTranslationQueue() {
  function addTranslation(hash: string, type: 'content' | 'desc', skillName?: string) {
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
    }
    queue.value.push(item)
    cacheVersion.value++
    return item
  }

  function removeTranslation(hash: string, type: 'content' | 'desc') {
    const idx = queue.value.findIndex((item) => item.hash === hash && item.type === type)
    if (idx === -1) return
    queue.value.splice(idx, 1)
    promoteNext()
    cacheVersion.value++
  }

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
  }
}

import { ref } from 'vue'

export interface TranslationQueueItem {
  skillId: string
  skillName: string
  type: 'content' | 'desc'
  status: 'translating'
  startedAt: number
}

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

const queue = ref<TranslationQueueItem[]>(loadQueue())
const cacheVersion = ref(0)

export function useTranslationQueue() {
  function addTranslation(skillId: string, skillName: string, type: 'content' | 'desc') {
    const existing = queue.value.find((item) => item.skillId === skillId && item.type === type)
    if (existing) return existing

    const item: TranslationQueueItem = {
      skillId,
      skillName,
      type,
      status: 'translating',
      startedAt: Date.now(),
    }
    queue.value.push(item)
    saveQueue(queue.value)
    return item
  }

  function removeTranslation(skillId: string, type: 'content' | 'desc') {
    queue.value = queue.value.filter((item) => !(item.skillId === skillId && item.type === type))
    saveQueue(queue.value)
    cacheVersion.value++
  }

  function isTranslating(skillId: string, type: 'content' | 'desc') {
    return queue.value.some((item) => item.skillId === skillId && item.type === type)
  }

  function notifyCacheChanged() {
    cacheVersion.value++
  }

  return {
    queue,
    cacheVersion,
    addTranslation,
    removeTranslation,
    isTranslating,
    notifyCacheChanged,
  }
}

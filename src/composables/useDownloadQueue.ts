import { ref, computed } from 'vue'

export interface QueueItem {
  id: string
  skillId: string
  skillName: string
  type: 'download' | 'install'
  source?: string
  platformNames?: string[]
  status: 'pending' | 'running' | 'success' | 'error'
  progress?: string
  error?: string
  startedAt: number
}

/** Max parallel skill downloads (GitHub / well-known). */
export const MAX_CONCURRENT_DOWNLOADS = 2

const queue = ref<QueueItem[]>([])
const isExpanded = ref(false)
const runners = new Map<string, () => Promise<void>>()

function downloadRunningCount(): number {
  return queue.value.filter((i) => i.type === 'download' && i.status === 'running').length
}

async function runDownloadItem(item: QueueItem) {
  const runner = runners.get(item.id)
  if (!runner) {
    updateItem(item.id, { status: 'error', error: '任务丢失' })
    return
  }

  updateItem(item.id, { status: 'running' })
  try {
    await runner()
    const cur = queue.value.find((i) => i.id === item.id)
    // Runner may have already set success/error via updateItem
    if (cur && cur.status === 'running') {
      updateItem(item.id, { status: 'success' })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const cur = queue.value.find((i) => i.id === item.id)
    if (cur && cur.status === 'running') {
      updateItem(item.id, { status: 'error', error: msg || '未知错误' })
    }
  } finally {
    runners.delete(item.id)
    pumpDownloads()
  }
}

function pumpDownloads() {
  while (downloadRunningCount() < MAX_CONCURRENT_DOWNLOADS) {
    const next = queue.value.find((i) => i.type === 'download' && i.status === 'pending')
    if (!next) break
    // mark running synchronously so loop doesn't pick same item
    next.status = 'running'
    void runDownloadItem(next)
  }
}

function updateItem(id: string, patch: Partial<QueueItem>) {
  const idx = queue.value.findIndex((item) => item.id === id)
  if (idx >= 0) {
    queue.value[idx] = { ...queue.value[idx], ...patch }
  }
}

export function useDownloadQueue() {
  /**
   * Legacy: UI-only entry that starts as running (install progress / tests).
   * Prefer enqueueDownload for real downloads.
   */
  function addDownload(skillId: string, skillName: string, source?: string) {
    const item: QueueItem = {
      id: `dl-${skillId}-${Date.now()}`,
      skillId,
      skillName,
      type: 'download',
      source,
      status: 'running',
      startedAt: Date.now(),
    }
    queue.value.push(item)
    return item
  }

  /**
   * FIFO download with concurrency limit.
   * runner should perform the download and call updateItem for progress/error/success when needed.
   * If runner throws, item becomes error; if it returns while still running, becomes success.
   */
  function enqueueDownload(skillId: string, skillName: string, source: string | undefined, runner: () => Promise<void>): QueueItem {
    const existing = queue.value.find(
      (i) => i.type === 'download' && i.skillId === skillId && (i.status === 'pending' || i.status === 'running'),
    )
    if (existing) return existing

    const item: QueueItem = {
      id: `dl-${skillId}-${Date.now()}`,
      skillId,
      skillName,
      type: 'download',
      source,
      status: 'pending',
      startedAt: Date.now(),
    }
    queue.value.push(item)
    runners.set(item.id, runner)
    pumpDownloads()
    return item
  }

  function addInstall(skillId: string, skillName: string, platformNames: string[]) {
    const item: QueueItem = {
      id: `inst-${skillId}-${Date.now()}`,
      skillId,
      skillName,
      type: 'install',
      platformNames,
      status: 'running',
      startedAt: Date.now(),
    }
    queue.value.push(item)
    return item
  }

  function removeItem(id: string) {
    runners.delete(id)
    queue.value = queue.value.filter((item) => item.id !== id)
    pumpDownloads()
  }

  function clearCompleted() {
    queue.value = queue.value.filter((item) => item.status === 'running' || item.status === 'pending')
  }

  function isDownloading(skillId: string): boolean {
    return queue.value.some((i) => i.type === 'download' && i.skillId === skillId && (i.status === 'pending' || i.status === 'running'))
  }

  const activeCount = computed(
    () => queue.value.filter((item) => item.type === 'download' && (item.status === 'running' || item.status === 'pending')).length,
  )
  const hasItems = computed(() => queue.value.length > 0)
  const pendingCount = computed(() => queue.value.filter((i) => i.type === 'download' && i.status === 'pending').length)

  return {
    queue,
    isExpanded,
    activeCount,
    pendingCount,
    hasItems,
    addDownload,
    enqueueDownload,
    addInstall,
    updateItem,
    removeItem,
    clearCompleted,
    isDownloading,
  }
}

import { describe, test, expect, beforeEach, vi } from 'vitest'
import { useDownloadQueue, MAX_CONCURRENT_DOWNLOADS } from '../useDownloadQueue'

beforeEach(() => {
  const { queue, isExpanded } = useDownloadQueue()
  queue.value = []
  isExpanded.value = false
})

describe('useDownloadQueue', () => {
  test('initial state is empty', () => {
    const { queue, hasItems, activeCount } = useDownloadQueue()
    expect(queue.value).toEqual([])
    expect(hasItems.value).toBe(false)
    expect(activeCount.value).toBe(0)
  })

  test('addDownload adds a download item as running (legacy)', () => {
    const { addDownload, queue } = useDownloadQueue()
    addDownload('skill-1', 'Test Skill')
    expect(queue.value).toHaveLength(1)
    expect(queue.value[0]).toMatchObject({
      skillId: 'skill-1',
      skillName: 'Test Skill',
      type: 'download',
      status: 'running',
    })
  })

  test('addDownload returns the created item', () => {
    const { addDownload } = useDownloadQueue()
    const item = addDownload('s1', 'S1')
    expect(item.skillId).toBe('s1')
    expect(item.id).toContain('dl-s1-')
  })

  test('addInstall adds an install item to queue', () => {
    const { addInstall, queue } = useDownloadQueue()
    addInstall('skill-1', 'Test Skill', ['claude', 'cursor'])
    expect(queue.value).toHaveLength(1)
    expect(queue.value[0]).toMatchObject({
      skillId: 'skill-1',
      skillName: 'Test Skill',
      type: 'install',
      status: 'running',
      platformNames: ['claude', 'cursor'],
    })
  })

  test('updateItem modifies existing item fields', () => {
    const { addDownload, updateItem, queue } = useDownloadQueue()
    const item = addDownload('s1', 'S1')
    updateItem(item.id, { status: 'success' })
    expect(queue.value[0].status).toBe('success')
  })

  test('updateItem does nothing for non-existent id', () => {
    const { updateItem, queue } = useDownloadQueue()
    updateItem('nonexistent', { status: 'success' })
    expect(queue.value).toHaveLength(0)
  })

  test('removeItem removes item by id', () => {
    const { addDownload, removeItem, queue } = useDownloadQueue()
    const item = addDownload('s1', 'S1')
    addDownload('s2', 'S2')
    removeItem(item.id)
    expect(queue.value).toHaveLength(1)
    expect(queue.value[0].skillId).toBe('s2')
  })

  test('clearCompleted removes success and error items', () => {
    const { addDownload, updateItem, clearCompleted, queue } = useDownloadQueue()
    const dl1 = addDownload('s1', 'S1')
    const dl2 = addDownload('s2', 'S2')
    const _dl3 = addDownload('s3', 'S3')
    updateItem(dl1.id, { status: 'success' })
    updateItem(dl2.id, { status: 'error', error: 'fail' })
    clearCompleted()
    expect(queue.value).toHaveLength(1)
    expect(queue.value[0].skillId).toBe('s3')
  })

  test('activeCount counts only running/pending download items', () => {
    const { addDownload, addInstall, updateItem, activeCount } = useDownloadQueue()
    const dl1 = addDownload('s1', 'S1')
    addInstall('s2', 'S2', ['claude'])
    addDownload('s3', 'S3')
    updateItem(dl1.id, { status: 'success' })
    expect(activeCount.value).toBe(1)
  })

  test('hasItems is true when queue has items', () => {
    const { addDownload, hasItems } = useDownloadQueue()
    expect(hasItems.value).toBe(false)
    addDownload('s1', 'S1')
    expect(hasItems.value).toBe(true)
  })

  test('enqueueDownload limits concurrency (FIFO pending)', async () => {
    const { enqueueDownload, queue, activeCount } = useDownloadQueue()
    // Never-resolving runners so we can inspect steady-state concurrency
    for (let i = 0; i < MAX_CONCURRENT_DOWNLOADS + 3; i++) {
      enqueueDownload(`s${i}`, `Skill ${i}`, 'test', () => new Promise(() => {}))
    }

    await Promise.resolve()
    expect(queue.value.filter((i) => i.status === 'running')).toHaveLength(MAX_CONCURRENT_DOWNLOADS)
    expect(queue.value.filter((i) => i.status === 'pending')).toHaveLength(3)
    expect(activeCount.value).toBe(MAX_CONCURRENT_DOWNLOADS + 3)
    // FIFO: first items running, later pending
    expect(queue.value.slice(0, MAX_CONCURRENT_DOWNLOADS).every((i) => i.status === 'running')).toBe(true)
    expect(queue.value.slice(MAX_CONCURRENT_DOWNLOADS).every((i) => i.status === 'pending')).toBe(true)
  })

  test('finishing a download promotes next pending', async () => {
    const { enqueueDownload, queue } = useDownloadQueue()
    let resolveFirst!: () => void
    enqueueDownload(
      'first',
      'First',
      'test',
      () =>
        new Promise<void>((r) => {
          resolveFirst = r
        }),
    )
    enqueueDownload('second', 'Second', 'test', async () => {})
    // fill concurrent slots if MAX > 1
    for (let i = 0; i < MAX_CONCURRENT_DOWNLOADS - 1; i++) {
      enqueueDownload(`fill-${i}`, `Fill ${i}`, 'test', () => new Promise(() => {}))
    }
    enqueueDownload('third', 'Third', 'test', async () => {})

    await Promise.resolve()
    const thirdBefore = queue.value.find((i) => i.skillId === 'third')
    // third may be pending if slots full
    if (thirdBefore?.status === 'pending') {
      resolveFirst()
      await vi.waitFor(() => {
        const third = queue.value.find((i) => i.skillId === 'third')
        expect(third?.status === 'running' || third?.status === 'success').toBe(true)
      })
    } else {
      // slots available — third already started; just ensure first can finish
      resolveFirst()
      await vi.waitFor(() => {
        expect(queue.value.find((i) => i.skillId === 'first')?.status).toBe('success')
      })
    }
  })

  test('enqueueDownload dedupes same skillId while active', () => {
    const { enqueueDownload, queue } = useDownloadQueue()
    const runner = async () => {
      await new Promise(() => {}) // never resolves
    }
    enqueueDownload('same', 'A', 'src', runner)
    enqueueDownload('same', 'A', 'src', runner)
    expect(queue.value.filter((i) => i.skillId === 'same')).toHaveLength(1)
  })

  test('isDownloading reflects pending and running', () => {
    const { enqueueDownload, isDownloading } = useDownloadQueue()
    expect(isDownloading('x')).toBe(false)
    enqueueDownload('x', 'X', undefined, async () => {
      await new Promise(() => {})
    })
    expect(isDownloading('x')).toBe(true)
  })
})

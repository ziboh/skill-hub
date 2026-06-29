import { describe, test, expect, beforeEach, vi } from 'vitest'
import { useDownloadQueue } from '../useDownloadQueue'

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

  test('addDownload adds a download item to queue', () => {
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
    const dl3 = addDownload('s3', 'S3')
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
})

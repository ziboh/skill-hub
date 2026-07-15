import { describe, test, expect, beforeEach, vi } from 'vitest'
import { useTranslationQueue, processingHashes, MAX_CONCURRENT } from '../useTranslationQueue'

beforeEach(() => {
  processingHashes.clear()
  window.ztools.dbStorage.clear()
  window.ztools.dbStorage.setItem(
    'sm_settings',
    JSON.stringify({
      translationModelId: 'test-provider::test-model',
      aiModels: [{ id: 'test-provider', enabled: true, models: [{ id: 'test-model', enabled: true }] }],
    }),
  )
  const { clearAll } = useTranslationQueue()
  clearAll()
})

describe('useTranslationQueue', () => {
  test('initial queue is empty', () => {
    const { queue } = useTranslationQueue()
    expect(queue.value).toEqual([])
  })

  test('addTranslation uses (hash, type, skillName?) signature', () => {
    const { addTranslation, queue } = useTranslationQueue()
    addTranslation('abc123hash', 'content', 'Test Skill')
    expect(queue.value).toHaveLength(1)
    expect(queue.value[0]).toMatchObject({
      hash: 'abc123hash',
      skillName: 'Test Skill',
      type: 'content',
      status: 'translating',
    })
    expect(queue.value[0].skillId).toBeUndefined()
  })

  test('blocks a task after discovering that no translation model is configured', async () => {
    const { addTranslation, queue } = useTranslationQueue()
    window.ztools.dbStorage.removeItem('sm_settings')
    addTranslation('no-model', 'content', 'No Model')
    await vi.waitFor(() => {
      expect(queue.value[0]).toMatchObject({ status: 'pending', blocked: true })
    })
  })

  test('does not promote a blocked task when another task leaves the queue', () => {
    const { queue, removeTranslation } = useTranslationQueue()
    queue.value = [
      { hash: 'blocked', type: 'content', status: 'pending', startedAt: 1, blocked: true },
      { hash: 'running', type: 'content', status: 'translating', startedAt: 2 },
    ]

    removeTranslation('running', 'content')

    expect(queue.value[0]).toMatchObject({ hash: 'blocked', status: 'pending', blocked: true })
  })

  test('addTranslation persists to dbStorage', () => {
    const { addTranslation } = useTranslationQueue()
    addTranslation('hash-s1', 'desc', 'S1')
    const raw = window.ztools.dbStorage.getItem('sm_translation_queue')
    expect(raw).toBeTruthy()
    const saved = JSON.parse(raw!)
    expect(saved).toHaveLength(1)
    expect(saved[0].hash).toBe('hash-s1')
    expect(saved[0].type).toBe('desc')
  })

  test('addTranslation dedupes same hash+type', () => {
    const { addTranslation, queue } = useTranslationQueue()
    addTranslation('h1', 'content', 'A')
    addTranslation('h1', 'content', 'A')
    expect(queue.value).toHaveLength(1)
  })

  test('removeTranslation removes item from queue', () => {
    const { addTranslation, removeTranslation, queue } = useTranslationQueue()
    addTranslation('h1', 'content', 'S1')
    addTranslation('h2', 'desc', 'S2')
    removeTranslation('h1', 'content')
    expect(queue.value).toHaveLength(1)
    expect(queue.value[0].hash).toBe('h2')
  })

  test('removeTranslation updates dbStorage', () => {
    const { addTranslation, removeTranslation } = useTranslationQueue()
    addTranslation('h1', 'content', 'S1')
    removeTranslation('h1', 'content')
    const saved = JSON.parse(window.ztools.dbStorage.getItem('sm_translation_queue')!)
    expect(saved).toHaveLength(0)
  })

  test('isTranslating returns correct status', () => {
    const { addTranslation, isTranslating } = useTranslationQueue()
    expect(isTranslating('h1', 'content')).toBe(false)
    addTranslation('h1', 'content', 'S1')
    expect(isTranslating('h1', 'content')).toBe(true)
    expect(isTranslating('h1', 'desc')).toBe(false)
  })

  test('notifyCacheChanged increments cacheVersion', () => {
    const { notifyCacheChanged, cacheVersion } = useTranslationQueue()
    const before = cacheVersion.value
    notifyCacheChanged()
    expect(cacheVersion.value).toBe(before + 1)
  })

  test('respects MAX_CONCURRENT when enqueueing', () => {
    const { addTranslation, queue } = useTranslationQueue()
    for (let i = 0; i < MAX_CONCURRENT + 2; i++) {
      addTranslation(`hash-${i}`, 'content', `S${i}`)
    }
    const translating = queue.value.filter((i) => i.status === 'translating')
    const pending = queue.value.filter((i) => i.status === 'pending')
    expect(translating.length).toBe(MAX_CONCURRENT)
    expect(pending.length).toBe(2)
  })

  test('resumeAll is sync and re-promotes pending', () => {
    const { addTranslation, queue, resumeAll } = useTranslationQueue()
    addTranslation('h1', 'content', 'S1')
    addTranslation('h2', 'content', 'S2')
    addTranslation('h3', 'content', 'S3')
    for (const item of queue.value) {
      item.status = 'pending'
      processingHashes.delete(`${item.hash}:${item.type}`)
    }
    resumeAll()
    const translating = queue.value.filter((i) => i.status === 'translating')
    expect(translating.length).toBeLessThanOrEqual(MAX_CONCURRENT)
    expect(translating.length).toBeGreaterThan(0)
  })

  test('rejects invalid type at runtime', () => {
    const { addTranslation, queue } = useTranslationQueue()
    const result = addTranslation('h1', 'Test Skill' as 'content' | 'desc', 'content')
    expect(result).toBeNull()
    expect(queue.value).toHaveLength(0)
  })
})

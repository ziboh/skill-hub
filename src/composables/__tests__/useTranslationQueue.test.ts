import { describe, test, expect, beforeEach } from 'vitest'
import { useTranslationQueue } from '../useTranslationQueue'

beforeEach(() => {
  const { queue, cacheVersion } = useTranslationQueue()
  queue.value = []
  cacheVersion.value = 0
  window.ztools.dbStorage.clear()
})

describe('useTranslationQueue', () => {
  test('initial queue is empty', () => {
    const { queue } = useTranslationQueue()
    expect(queue.value).toEqual([])
  })

  test('addTranslation adds item to queue', () => {
    const { addTranslation, queue } = useTranslationQueue()
    addTranslation('skill-1', 'Test Skill', 'content')
    expect(queue.value).toHaveLength(1)
    expect(queue.value[0]).toMatchObject({
      skillId: 'skill-1',
      skillName: 'Test Skill',
      type: 'content',
      status: 'translating',
    })
  })

  test('addTranslation persists to dbStorage', () => {
    const { addTranslation } = useTranslationQueue()
    addTranslation('s1', 'S1', 'desc')
    const saved = JSON.parse(window.ztools.dbStorage.getItem('sm_translation_queue')!)
    expect(saved).toHaveLength(1)
    expect(saved[0].skillId).toBe('s1')
  })

  test('removeTranslation removes item from queue', () => {
    const { addTranslation, removeTranslation, queue } = useTranslationQueue()
    addTranslation('s1', 'S1', 'content')
    addTranslation('s2', 'S2', 'desc')
    removeTranslation('s1', 'content')
    expect(queue.value).toHaveLength(1)
    expect(queue.value[0].skillId).toBe('s2')
  })

  test('removeTranslation updates dbStorage', () => {
    const { addTranslation, removeTranslation } = useTranslationQueue()
    addTranslation('s1', 'S1', 'content')
    removeTranslation('s1', 'content')
    const saved = JSON.parse(window.ztools.dbStorage.getItem('sm_translation_queue')!)
    expect(saved).toHaveLength(0)
  })

  test('isTranslating returns correct status', () => {
    const { addTranslation, isTranslating } = useTranslationQueue()
    expect(isTranslating('s1', 'content')).toBe(false)
    addTranslation('s1', 'S1', 'content')
    expect(isTranslating('s1', 'content')).toBe(true)
    expect(isTranslating('s1', 'desc')).toBe(false)
  })

  test('notifyCacheChanged increments cacheVersion', () => {
    const { notifyCacheChanged, cacheVersion } = useTranslationQueue()
    const before = cacheVersion.value
    notifyCacheChanged()
    expect(cacheVersion.value).toBe(before + 1)
  })


})

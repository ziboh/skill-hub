import { describe, test, expect, beforeEach, vi } from 'vitest'
import { storage, resetStorageCaches } from '../storage'

describe('storage cache consistency', () => {
  beforeEach(() => {
    window.ztools.dbStorage.clear()
    resetStorageCaches()
    vi.mocked(window.services.pathExists).mockReturnValue(true)
    vi.mocked(window.services.pathJoin).mockImplementation((...parts: string[]) => parts.join('/'))
  })

  test('saveDownloadedSkills reseeds cache so getDownloadedSkills returns new data without stale miss', () => {
    storage.saveDownloadedSkills([{ id: 'a', name: 'A', description: '', author: '', tags: [], source: 'local' }])
    expect(storage.getDownloadedSkills().map((s) => s.id)).toEqual(['a'])

    storage.saveDownloadedSkills([{ id: 'b', name: 'B', description: '', author: '', tags: [], source: 'local' }])
    expect(storage.getDownloadedSkills().map((s) => s.id).sort()).toEqual(['a', 'b'])
  })

  test('getDownloadedSet shares cache until invalidate', () => {
    storage.saveDownloadedSkills([{ id: 'x', name: 'X', description: '', author: '', tags: [], source: 'local' }])
    const s1 = storage.getDownloadedSet()
    const s2 = storage.getDownloadedSet()
    expect(s1).toBe(s2)
    expect(s1.has('x')).toBe(true)

    storage.addDownloadedId('y')
    const s3 = storage.getDownloadedSet()
    expect(s3).not.toBe(s1)
    expect(s3.has('y')).toBe(true)
  })

  test('isDownloaded uses set cache', () => {
    storage.addDownloadedId('z')
    expect(storage.isDownloaded('z')).toBe(true)
    expect(storage.isDownloaded('nope')).toBe(false)
  })

  test('removeDownloadedId updates set cache', () => {
    storage.addDownloadedId('rm')
    storage.removeDownloadedId('rm')
    expect(storage.isDownloaded('rm')).toBe(false)
    expect(storage.getDownloadedSet().has('rm')).toBe(false)
  })

  test('saveDistributeRecord reseeds and updates skill set', () => {
    storage.saveDistributeRecord({
      skillId: 's1',
      platformId: 'cursor',
      mode: 'copy',
      scope: 'global',
      targetPath: '/t',
      sourceDir: '/s',
      distributedAt: new Date().toISOString(),
    })
    expect(storage.getDistributedSkillSet().has('s1')).toBe(true)
    expect(storage.getDistributeRecords()).toHaveLength(1)
  })

  test('cleanStaleDownloadedSkills invalidates distribute cache when pruning', () => {
    storage.saveDownloadedSkills([
      { id: 'keep', name: 'Keep', description: '', author: '', tags: [], source: 'local' },
      { id: 'gone', name: 'Gone', description: '', author: '', tags: [], source: 'local' },
    ])
    storage.saveDistributeRecord({
      skillId: 'gone',
      platformId: 'cursor',
      mode: 'copy',
      scope: 'global',
      targetPath: '/t/gone',
      sourceDir: '/s',
      distributedAt: new Date().toISOString(),
    })
    storage.saveDistributeRecord({
      skillId: 'keep',
      platformId: 'cursor',
      mode: 'copy',
      scope: 'global',
      targetPath: '/t/keep',
      sourceDir: '/s',
      distributedAt: new Date().toISOString(),
    })

    vi.mocked(window.services.pathExists).mockImplementation((p: string) => String(p).includes('keep') || String(p).endsWith('skills-repo'))
    vi.mocked(window.services.pathJoin).mockImplementation((...parts: string[]) => parts.join('/'))

    storage.cleanStaleDownloadedSkills()

    expect(storage.getDownloadedIds()).toEqual(['keep'])
    expect(storage.getDistributeRecords().map((r) => r.skillId)).toEqual(['keep'])
    expect(storage.getDistributedSkillSet().has('gone')).toBe(false)
  })

  test('saveSkillUserTags updates cached skill', () => {
    storage.saveDownloadedSkills([{ id: 't1', name: 'T', description: '', author: '', tags: [], source: 'local' }])
    storage.saveSkillUserTags('t1', ['自定义'])
    expect(storage.getSkillUserTags('t1')).toEqual(['自定义'])
    expect(storage.getDownloadedSkills().find((s) => s.id === 't1')?.userTags).toEqual(['自定义'])
  })
})

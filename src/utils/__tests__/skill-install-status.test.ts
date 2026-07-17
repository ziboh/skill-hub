import { describe, test, expect, vi, beforeEach } from 'vitest'
import { skillMatchesFolder, findPhysicallyInstalledPlatforms, uninstallPathAndRecord } from '../skill-install-status'
import { clearSkillLifecycleHooks, registerSkillLifecycleHook } from '../skill-lifecycle'
import { storage, resetStorageCaches } from '../storage'

describe('skillMatchesFolder', () => {
  test('matches by exact directory folder name', () => {
    expect(
      skillMatchesFolder({ dir: '/home/.cursor/skills/my-skill', manifest: { name: 'Other' }, name: 'Other' }, 'my-skill', 'My Skill'),
    ).toBe(true)
  })

  test('matches by manifest name case-insensitive', () => {
    expect(skillMatchesFolder({ dir: '/x/other', manifest: { name: 'My Skill' }, name: 'x' }, 'my-skill', 'My Skill')).toBe(true)
  })

  test('no match', () => {
    expect(skillMatchesFolder({ dir: '/x/other', manifest: { name: 'Other' }, name: 'Other' }, 'my-skill', 'My Skill')).toBe(false)
  })
})

describe('findPhysicallyInstalledPlatforms', () => {
  beforeEach(() => {
    vi.mocked(window.services.pathExists).mockReset()
    vi.mocked(window.services.scanForSkillFiles).mockReset()
  })

  test('returns platform ids where skill exists on disk', () => {
    vi.mocked(window.services.pathExists).mockReturnValue(true)
    vi.mocked(window.services.scanForSkillFiles).mockImplementation((dirs: string[]) => {
      if (dirs[0] === '/cursor/skills') {
        return [{ dir: '/cursor/skills/my-skill', name: 'my-skill', manifest: { name: 'My Skill' } }] as any
      }
      return []
    })

    const result = findPhysicallyInstalledPlatforms({
      platforms: [
        { id: 'cursor', basePath: '/cursor/skills' },
        { id: 'claude', basePath: '/claude/skills' },
      ],
      skillFolder: 'my-skill',
      skillName: 'My Skill',
    })
    expect([...result]).toEqual(['cursor'])
  })

  test('skips missing base path', () => {
    vi.mocked(window.services.pathExists).mockReturnValue(false)
    const result = findPhysicallyInstalledPlatforms({
      platforms: [{ id: 'cursor', basePath: '/missing' }],
      skillFolder: 'my-skill',
      skillName: 'My Skill',
    })
    expect(result.size).toBe(0)
    expect(window.services.scanForSkillFiles).not.toHaveBeenCalled()
  })
})

describe('uninstallPathAndRecord', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearSkillLifecycleHooks()
    window.ztools.dbStorage.clear()
    resetStorageCaches()
    vi.mocked(window.services.pathExists).mockReturnValue(true)
    vi.mocked(window.services.removeFile).mockImplementation(() => {})
    vi.mocked(window.services.uninstallPlatformSkill).mockReturnValue({ handled: false })
  })

  test('removes path and distribute record', () => {
    storage.saveDistributeRecord({
      skillId: 's1',
      platformId: 'cursor',
      mode: 'copy',
      scope: 'global',
      targetPath: '/dest/s1',
      sourceDir: '/src',
      distributedAt: new Date().toISOString(),
    })

    let exists = true
    vi.mocked(window.services.pathExists).mockImplementation(() => {
      const v = exists
      exists = false
      return v
    })
    vi.mocked(window.services.removeFile).mockImplementation(() => {
      exists = false
    })

    const result = uninstallPathAndRecord({
      targetPath: '/dest/s1',
      skillId: 's1',
      platformId: 'cursor',
      scope: 'global',
    })
    expect(result.ok).toBe(true)
    expect(storage.getDistributeRecords().length).toBe(0)
  })

  test('uses platform uninstall adapter when available', () => {
    vi.mocked(window.services.uninstallPlatformSkill).mockReturnValue({ handled: true })
    const result = uninstallPathAndRecord({
      targetPath: '/platforms/cherry/skills/TestSkill',
      skillId: 's1',
      platformId: 'cherry-studio',
    })
    expect(result.ok).toBe(true)
    expect(window.services.removeFile).not.toHaveBeenCalled()
    expect(window.services.uninstallPlatformSkill).toHaveBeenCalledWith({
      platformId: 'cherry-studio',
      targetDir: '/platforms/cherry/skills/TestSkill',
    })
  })

  test('returns error when remove fails', () => {
    vi.mocked(window.services.pathExists).mockReturnValue(true)
    vi.mocked(window.services.removeFile).mockImplementation(() => {
      throw new Error('permission denied')
    })

    const result = uninstallPathAndRecord({
      targetPath: '/dest/s1',
      skillId: 's1',
      platformId: 'cursor',
      scope: 'global',
    })
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })

  test('runs uninstall hooks with the final result', () => {
    const before = vi.fn()
    const after = vi.fn()
    vi.mocked(window.services.uninstallPlatformSkill).mockReturnValue({ handled: true })
    registerSkillLifecycleHook('beforeUninstall', before)
    registerSkillLifecycleHook('afterUninstall', after)

    const result = uninstallPathAndRecord({
      targetPath: '/dest/s1',
      skillId: 's1',
      skillName: 'Test Skill',
      platformId: 'cursor',
      scope: 'global',
    })

    expect(result.ok).toBe(true)
    expect(before).toHaveBeenCalledWith(expect.objectContaining({ phase: 'before', skillName: 'Test Skill' }))
    expect(after).toHaveBeenCalledWith(expect.objectContaining({ phase: 'after', result: expect.objectContaining({ ok: true }) }))
  })

  test('blocks uninstall when before hook fails and preserves path', () => {
    const after = vi.fn()
    registerSkillLifecycleHook('beforeUninstall', () => {
      throw new Error('protected')
    })
    registerSkillLifecycleHook('afterUninstall', after)

    const result = uninstallPathAndRecord({
      targetPath: '/dest/s1',
      skillId: 's1',
      platformId: 'cursor',
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('protected')
    expect(window.services.removeFile).not.toHaveBeenCalled()
    expect(after).toHaveBeenCalledWith(expect.objectContaining({ result: expect.objectContaining({ ok: false }) }))
  })

  test('keeps uninstall successful when after hook fails and returns warnings', () => {
    vi.mocked(window.services.uninstallPlatformSkill).mockReturnValue({ handled: true })
    registerSkillLifecycleHook('afterUninstall', () => {
      throw new Error('post uninstall failed')
    })

    const result = uninstallPathAndRecord({
      targetPath: '/dest/s1',
      skillId: 's1',
      platformId: 'cursor',
    })

    expect(result.ok).toBe(true)
    expect(result.warnings).toEqual(['post uninstall failed'])
  })
})

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { getSkillFolderName, makeProjectPlatformKey, hasSkillMd, deploySkillToTarget, resolveSkillSourceDir } from '../skill-deploy'
import { storage, resetStorageCaches } from '../storage'
import { clearSkillLifecycleHooks, registerSkillLifecycleHook } from '../skill-lifecycle'
import type { Skill } from '../../types'

vi.mock('../skill-path', () => ({
  getSkillsRepoDir: vi.fn((id: string) => `/mock/path/skills-repo/${id}`),
}))

const sampleSkill: Skill = {
  id: 'owner/repo/my-skill',
  name: 'My Skill',
  path: 'skills/my-skill',
  description: '',
  tags: [],
}

describe('getSkillFolderName', () => {
  test('uses last path segment', () => {
    expect(getSkillFolderName({ name: 'My Skill', path: 'skills/my-skill' })).toBe('my-skill')
  })

  test('uses the skill name when the repository path ends in a generic skill directory', () => {
    expect(getSkillFolderName({ name: 'agent-reach', path: 'agent_reach/skill' })).toBe('agent-reach')
  })

  test('falls back to name', () => {
    expect(getSkillFolderName({ name: 'My Skill', path: '' })).toBe('My Skill')
    expect(getSkillFolderName({ name: 'My Skill', path: '.' })).toBe('My Skill')
  })

  test('normalizes backslashes', () => {
    expect(getSkillFolderName({ name: 'X', path: 'a\\b\\c' })).toBe('c')
  })

  test('uses name when path is absolute', () => {
    expect(getSkillFolderName({ name: 'My Skill', path: 'D:/userData/skills-repo/local/foo' })).toBe('My Skill')
    expect(getSkillFolderName({ name: 'My Skill', path: '/home/user/skills-repo/local/foo' })).toBe('My Skill')
  })
})

describe('makeProjectPlatformKey', () => {
  test('formats project key', () => {
    expect(makeProjectPlatformKey('p1', '.claude/skills')).toBe('project:p1/.claude/skills')
  })
})

describe('hasSkillMd', () => {
  beforeEach(() => {
    vi.mocked(window.services.pathExists).mockReset()
    vi.mocked(window.services.readDir).mockReset()
  })

  test('true when SKILL.md present', () => {
    vi.mocked(window.services.pathExists).mockReturnValue(true)
    vi.mocked(window.services.readDir).mockReturnValue([
      { name: 'SKILL.md', path: '/x/SKILL.md', isDirectory: false, isFile: true, isSymlink: false },
    ])
    expect(hasSkillMd('/x')).toBe(true)
  })

  test('false when missing', () => {
    vi.mocked(window.services.pathExists).mockReturnValue(true)
    vi.mocked(window.services.readDir).mockReturnValue([])
    expect(hasSkillMd('/x')).toBe(false)
  })
})

describe('deploySkillToTarget', () => {
  beforeEach(() => {
    window.ztools.dbStorage.clear()
    resetStorageCaches()
    clearSkillLifecycleHooks()
    vi.clearAllMocks()
    vi.mocked(window.services.pathExists).mockReturnValue(true)
    vi.mocked(window.services.readDir).mockReturnValue([
      { name: 'SKILL.md', path: '/src/SKILL.md', isDirectory: false, isFile: true, isSymlink: false },
    ])
    vi.mocked(window.services.mkdir).mockImplementation(() => {})
    vi.mocked(window.services.copyFile).mockImplementation(() => {})
    vi.mocked(window.services.createSymlink).mockImplementation(() => '/target')
    vi.mocked(window.services.deployPlatformSkill).mockReturnValue({ handled: false })
  })

  test('copies and saves record without pre-mkdir target', () => {
    const result = deploySkillToTarget({
      skill: sampleSkill,
      sourceDir: '/src',
      targetDir: '/dest/my-skill',
      platformId: 'cursor',
      mode: 'copy',
      scope: 'global',
    })
    expect(result.ok).toBe(true)
    expect(window.services.mkdir).not.toHaveBeenCalled()
    expect(window.services.copyFile).toHaveBeenCalledWith('/src', '/dest/my-skill')
    const records = storage.getDistributeRecords()
    expect(records).toHaveLength(1)
    expect(records[0].platformId).toBe('cursor')
    expect(records[0].mode).toBe('copy')
  })

  test('symlink mode', () => {
    const result = deploySkillToTarget({
      skill: sampleSkill,
      sourceDir: '/src',
      targetDir: '/dest/my-skill',
      platformId: 'cursor',
      mode: 'symlink',
      scope: 'global',
    })
    expect(result.ok).toBe(true)
    expect(window.services.createSymlink).toHaveBeenCalled()
  })

  test('uses platform adapter target and skips generic copy', () => {
    vi.mocked(window.services.deployPlatformSkill).mockReturnValue({ handled: true, targetDir: '/dest/My_Skill' })
    const result = deploySkillToTarget({
      skill: sampleSkill,
      sourceDir: '/src',
      targetDir: '/dest/My Skill',
      platformId: 'cherry-studio',
      mode: 'copy',
      scope: 'global',
    })

    expect(result.ok).toBe(true)
    expect(result.targetDir).toBe('/dest/My_Skill')
    expect(window.services.copyFile).not.toHaveBeenCalled()
    expect(storage.getDistributeRecords()[0].targetPath).toBe('/dest/My_Skill')
  })

  test('skipIfRecorded', () => {
    deploySkillToTarget({
      skill: sampleSkill,
      sourceDir: '/src',
      targetDir: '/dest/my-skill',
      platformId: 'cursor',
      mode: 'copy',
      scope: 'global',
    })
    vi.mocked(window.services.copyFile).mockClear()
    const second = deploySkillToTarget({
      skill: sampleSkill,
      sourceDir: '/src',
      targetDir: '/dest/my-skill',
      platformId: 'cursor',
      mode: 'copy',
      scope: 'global',
      skipIfRecorded: true,
    })
    expect(second.skipped).toBe(true)
    expect(window.services.copyFile).not.toHaveBeenCalled()
  })

  test('fails when no source', () => {
    vi.mocked(window.services.pathExists).mockReturnValue(false)
    const result = deploySkillToTarget({
      skill: sampleSkill,
      sourceDir: '/missing',
      targetDir: '/dest',
      platformId: 'cursor',
      mode: 'copy',
      scope: 'global',
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/源文件/)
  })

  test('runs install hooks with the final result', () => {
    const before = vi.fn()
    const after = vi.fn()
    registerSkillLifecycleHook('beforeInstall', before)
    registerSkillLifecycleHook('afterInstall', after)

    const result = deploySkillToTarget({
      skill: sampleSkill,
      sourceDir: '/src',
      targetDir: '/dest/my-skill',
      platformId: 'cursor',
      mode: 'copy',
      scope: 'global',
    })

    expect(result.ok).toBe(true)
    expect(before).toHaveBeenCalledWith(expect.objectContaining({ phase: 'before', targetPath: '/dest/my-skill' }))
    expect(after).toHaveBeenCalledWith(expect.objectContaining({ phase: 'after', result: expect.objectContaining({ ok: true }) }))
  })

  test('blocks install when before hook fails and still runs after hook', () => {
    const after = vi.fn()
    registerSkillLifecycleHook('beforeInstall', () => {
      throw new Error('not allowed')
    })
    registerSkillLifecycleHook('afterInstall', after)

    const result = deploySkillToTarget({
      skill: sampleSkill,
      sourceDir: '/src',
      targetDir: '/dest/my-skill',
      platformId: 'cursor',
      mode: 'copy',
      scope: 'global',
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('not allowed')
    expect(window.services.copyFile).not.toHaveBeenCalled()
    expect(after).toHaveBeenCalledWith(expect.objectContaining({ result: expect.objectContaining({ ok: false }) }))
    expect(storage.getDistributeRecords()).toHaveLength(0)
  })

  test('keeps install successful when after hook fails and returns warnings', () => {
    registerSkillLifecycleHook('afterInstall', () => {
      throw new Error('post install failed')
    })

    const result = deploySkillToTarget({
      skill: sampleSkill,
      sourceDir: '/src',
      targetDir: '/dest/my-skill',
      platformId: 'cursor',
      mode: 'copy',
      scope: 'global',
    })

    expect(result.ok).toBe(true)
    expect(result.warnings).toEqual(['post install failed'])
    expect(storage.getDistributeRecords()).toHaveLength(1)
  })
})

describe('resolveSkillSourceDir', () => {
  beforeEach(() => {
    vi.mocked(window.services.pathExists).mockReset()
  })

  test('prefers skills-repo', () => {
    vi.mocked(window.services.pathExists).mockImplementation((p: string) => p.includes('skills-repo'))
    expect(resolveSkillSourceDir(sampleSkill)).toContain('skills-repo')
  })
})

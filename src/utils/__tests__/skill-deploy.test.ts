import { describe, test, expect, vi, beforeEach } from 'vitest'
import { getSkillFolderName, makeProjectPlatformKey, hasSkillMd, deploySkillToTarget, resolveSkillSourceDir } from '../skill-deploy'
import { storage, resetStorageCaches } from '../storage'
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

  test('falls back to name', () => {
    expect(getSkillFolderName({ name: 'My Skill', path: '' })).toBe('My Skill')
    expect(getSkillFolderName({ name: 'My Skill', path: '.' })).toBe('My Skill')
  })

  test('normalizes backslashes', () => {
    expect(getSkillFolderName({ name: 'X', path: 'a\\b\\c' })).toBe('c')
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
    vi.clearAllMocks()
    vi.mocked(window.services.pathExists).mockReturnValue(true)
    vi.mocked(window.services.readDir).mockReturnValue([
      { name: 'SKILL.md', path: '/src/SKILL.md', isDirectory: false, isFile: true, isSymlink: false },
    ])
    vi.mocked(window.services.mkdir).mockImplementation(() => {})
    vi.mocked(window.services.copyFile).mockImplementation(() => {})
    vi.mocked(window.services.createSymlink).mockImplementation(() => '/target')
  })

  test('copies and saves record', () => {
    const result = deploySkillToTarget({
      skill: sampleSkill,
      sourceDir: '/src',
      targetDir: '/dest/my-skill',
      platformId: 'cursor',
      mode: 'copy',
      scope: 'global',
    })
    expect(result.ok).toBe(true)
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

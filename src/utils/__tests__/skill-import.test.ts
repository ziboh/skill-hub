import { describe, test, expect, vi, beforeEach } from 'vitest'
import { importScanResultToMySkills, resolveImportSourceType, finalizeImportedSkill } from '../skill-import'
import type { SkillScanResult } from '../../types'
import { storage } from '../storage'

function makeScan(overrides: Partial<SkillScanResult> = {}): SkillScanResult {
  return {
    name: 'folder-name',
    dir: '/agent/skills/My Skill',
    skillFile: '/agent/skills/My Skill/SKILL.md',
    content: '# My Skill',
    manifest: {
      name: 'My Skill',
      description: 'desc',
      author: 'me',
      tags: ['t1'],
      language: 'en',
    },
    ...overrides,
  }
}

beforeEach(() => {
  window.ztools.dbStorage.clear()
  localStorage.clear()
  vi.mocked(window.services.copyFile).mockClear()
  vi.mocked(window.services.pathExists).mockReset()
  vi.mocked(window.services.parseSkillFile).mockReset()
  vi.mocked(window.services.pathJoin).mockImplementation((...parts: string[]) => parts.join('/'))
  vi.mocked(window.services.pathExists).mockImplementation((p: string) => p.endsWith('SKILL.md') || p.includes('skills-repo'))
  vi.mocked(window.services.parseSkillFile).mockReturnValue({
    content: '# My Skill',
    manifest: {
      name: 'My Skill',
      description: 'desc',
      author: 'me',
      tags: ['t1'],
      language: 'en',
    },
  })
})

describe('resolveImportSourceType', () => {
  test('maps local-dir to local', () => {
    expect(resolveImportSourceType('local-dir')).toBe('local')
  })

  test('keeps remote source types', () => {
    expect(resolveImportSourceType('skills-sh')).toBe('skills-sh')
    expect(resolveImportSourceType('github')).toBe('github')
    expect(resolveImportSourceType('marketplace-json')).toBe('marketplace-json')
  })
})

describe('importScanResultToMySkills', () => {
  test('agent and project use same id and copy target with sourceType local', () => {
    const skill = makeScan()

    const agentResult = importScanResultToMySkills({ skill, sessionSource: 'agent' })
    expect(agentResult.id).toBe('My Skill')
    expect(agentResult.source).toBe('local')
    expect(agentResult.path).toBe('/agent/skills/My Skill')
    expect(window.services.copyFile).toHaveBeenCalledWith('/agent/skills/My Skill', '/mock/path/skills-repo/My Skill')

    vi.mocked(window.services.copyFile).mockClear()
    const projectResult = importScanResultToMySkills({
      skill: makeScan({ dir: '/project/.claude/skills/My Skill' }),
      sessionSource: 'project',
    })
    expect(projectResult.id).toBe('My Skill')
    expect(projectResult.source).toBe('local')
    expect(window.services.copyFile).toHaveBeenCalledWith('/project/.claude/skills/My Skill', '/mock/path/skills-repo/My Skill')

    expect(storage.getDownloadedIds()).toContain('My Skill')
  })

  test('does not slugify skill id', () => {
    const skill = makeScan({
      manifest: {
        name: 'Foo Bar!',
        description: '',
        author: '',
        tags: [],
        language: 'en',
      },
    })
    const result = importScanResultToMySkills({ skill, sessionSource: 'agent' })
    expect(result.id).toBe('Foo Bar!')
    expect(window.services.copyFile).toHaveBeenCalledWith(skill.dir, '/mock/path/skills-repo/Foo Bar!')
  })

  test('records distinct sessionSource for agent vs project', () => {
    const addSession = vi.spyOn(storage, 'addSessionDownload')
    importScanResultToMySkills({ skill: makeScan(), sessionSource: 'agent' })
    expect(addSession).toHaveBeenCalledWith('My Skill', 'My Skill', 'agent')

    addSession.mockClear()
    importScanResultToMySkills({
      skill: makeScan({ dir: '/p/skills/My Skill' }),
      sessionSource: 'project',
    })
    expect(addSession).toHaveBeenCalledWith('My Skill', 'My Skill', 'project')
    addSession.mockRestore()
  })

  test('throws when skill has no id', () => {
    expect(() =>
      importScanResultToMySkills({
        skill: makeScan({ name: '', manifest: { name: '', description: '', author: '', tags: [], language: 'en' } }),
        sessionSource: 'agent',
      }),
    ).toThrow(/skill id is required/)
  })
})

describe('finalizeImportedSkill sourceType', () => {
  test('saves imported skills to downloaded list', () => {
    const skill = {
      id: 'x',
      name: 'x',
      description: '',
      author: '',
      tags: [] as string[],
      source: 'local' as const,
      path: '/src/x',
    }
    finalizeImportedSkill({
      skill,
      targetDir: '/mock/path/skills-repo/x',
      sourceType: 'local',
      location: '/src/x',
      sessionSource: 'project',
    })
    expect(storage.getDownloadedIds()).toContain('x')
  })

  test('persists canonical id from the parsed SKILL.md name for repository skills', () => {
    const result = finalizeImportedSkill({
      skill: {
        id: 'vercel-labs/agent-skills/react-best-practices',
        name: 'react-best-practices',
        description: '',
        author: '',
        tags: [],
        source: 'github',
        repo: 'vercel-labs/agent-skills',
        path: 'skills/react-best-practices',
      },
      targetDir: '/mock/path/skills-repo/react-best-practices',
      sourceType: 'github',
      location: 'vercel-labs/agent-skills',
    })

    expect(result.canonicalId).toBe('vercel-labs/agent-skills/My Skill')
    expect(storage.getDownloadedSkills().find((skill) => skill.id === 'vercel-labs/agent-skills/react-best-practices')?.canonicalId).toBe(
      'vercel-labs/agent-skills/My Skill',
    )
  })
})

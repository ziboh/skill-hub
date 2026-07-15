import { describe, test, expect } from 'vitest'
import {
  normalizeSkillNameKey,
  getSkillDisplayName,
  getSkillIdentityKey,
  getSkillSourceId,
  getConfirmedSkillId,
  skillsShareIdentity,
  dedupeByNameKey,
  skillMatchesInstalled,
} from '../skill-identity'

describe('normalizeSkillNameKey', () => {
  test('lowercases and trims', () => {
    expect(normalizeSkillNameKey('  My Skill  ')).toBe('my skill')
  })

  test('empty becomes empty string', () => {
    expect(normalizeSkillNameKey('')).toBe('')
    expect(normalizeSkillNameKey(null as any)).toBe('')
    expect(normalizeSkillNameKey(undefined as any)).toBe('')
  })
})

describe('getSkillDisplayName', () => {
  test('prefers manifest.name over name', () => {
    expect(getSkillDisplayName({ name: 'folder', manifest: { name: 'Display' } })).toBe('Display')
  })

  test('falls back to name', () => {
    expect(getSkillDisplayName({ name: 'folder', manifest: null })).toBe('folder')
    expect(getSkillDisplayName({ name: 'folder' })).toBe('folder')
  })

  test('empty when both missing', () => {
    expect(getSkillDisplayName({})).toBe('')
  })
})

describe('canonical skill identity', () => {
  test('creates different source ids for GitHub and Gitee mirrors', () => {
    expect(
      getSkillSourceId({ repositoryProvider: 'github', repo: 'Acme/Skills', path: 'skills/demo' }),
    ).toBe('github:acme/skills:skills/demo')
    expect(
      getSkillSourceId({ repositoryProvider: 'gitee', repo: 'Acme/Skills', path: 'skills/demo' }),
    ).toBe('gitee:acme/skills:skills/demo')
  })

  test('does not treat same-named GitHub and Gitee skills as the same without proof', () => {
    expect(
      skillsShareIdentity(
        {
          id: 'github/acme/skills/demo',
          repo: 'acme/skills',
          path: 'skills/demo',
          repositoryProvider: 'github',
          canonicalId: 'acme/skills/Demo',
        },
        {
          id: 'gitee/acme/skills/demo',
          repo: 'acme/skills',
          path: 'skills/demo',
          repositoryProvider: 'gitee',
          canonicalId: 'acme/skills/Demo',
        },
      ),
    ).toBe(false)
  })

  test('uses normalized content hash as the confirmed cross-source skill id', () => {
    const githubSkill = {
      id: 'github/acme/skills/demo',
      repositoryProvider: 'github' as const,
      repo: 'acme/skills',
      path: 'skills/demo',
      contentHash: 'ABC123',
    }
    const giteeSkill = {
      id: 'gitee/acme/skills/demo',
      repositoryProvider: 'gitee' as const,
      repo: 'acme/skills',
      path: 'skills/demo',
      contentHash: 'abc123',
    }

    expect(getConfirmedSkillId(githubSkill)).toBe('content:abc123')
    expect(skillsShareIdentity(githubSkill, giteeSkill)).toBe(true)
  })

  test('uses an explicit logical repository id when mirrored paths differ', () => {
    const githubSkill = {
      id: 'github/acme/skills/demo',
      repositoryProvider: 'github' as const,
      repositoryId: 'acme/skills',
      path: 'skills/demo',
    }
    const giteeSkill = {
      id: 'gitee/acme/skills/demo-cn',
      repositoryProvider: 'gitee' as const,
      repositoryId: 'acme/skills',
      path: 'skills/demo-cn',
    }

    expect(getConfirmedSkillId(githubSkill)).toBe('repository:acme/skills:skills/demo')
    expect(skillsShareIdentity(githubSkill, giteeSkill)).toBe(false)
  })

  test('matches confirmed mirrors through the same logical repository and path', () => {
    const githubSkill = {
      id: 'github/acme/skills/demo',
      repositoryProvider: 'github' as const,
      repositoryId: 'acme/skills',
      path: 'skills/demo',
    }
    const giteeSkill = {
      id: 'gitee/acme/skills/demo',
      repositoryProvider: 'gitee' as const,
      repositoryId: 'acme/skills',
      path: 'skills/demo',
    }

    expect(skillsShareIdentity(githubSkill, giteeSkill)).toBe(true)
  })

  test('matches source-specific ids through canonicalId', () => {
    const githubSkill = {
      id: 'vercel-labs/agent-skills/react-best-practices',
      canonicalId: 'vercel-labs/agent-skills/vercel-react-best-practices',
    }
    const skillsShSkill = { id: 'vercel-labs/agent-skills/vercel-react-best-practices' }

    expect(getSkillIdentityKey(githubSkill)).toBe('vercel-labs/agent-skills/vercel-react-best-practices')
    expect(skillsShareIdentity(githubSkill, skillsShSkill)).toBe(true)
  })

  test('matches an unresolved GitHub folder id to a prefixed SKILL.md name in the same repository', () => {
    const githubCard = {
      id: 'vercel-labs/agent-skills/react-best-practices',
      repo: 'vercel-labs/agent-skills',
      path: 'skills/react-best-practices',
    }
    const skillsShDownload = {
      id: 'vercel-labs/agent-skills/vercel-react-best-practices',
      canonicalId: 'vercel-labs/agent-skills/vercel-react-best-practices',
      repo: 'vercel-labs/agent-skills',
    }

    expect(skillsShareIdentity(githubCard, skillsShDownload)).toBe(true)
  })

  test('does not fuzzy-match aliases from different repositories', () => {
    expect(
      skillsShareIdentity(
        {
          id: 'other/repo/react-best-practices',
          repo: 'other/repo',
        },
        {
          id: 'vercel-labs/agent-skills/vercel-react-best-practices',
          repo: 'vercel-labs/agent-skills',
        },
      ),
    ).toBe(false)
  })
})

describe('dedupeByNameKey', () => {
  test('keeps first occurrence by name key', () => {
    const items = [
      { id: '1', name: 'Foo' },
      { id: '2', name: 'foo' },
      { id: '3', name: 'Bar' },
      { id: '4', name: ' FOO ' },
    ]
    expect(dedupeByNameKey(items, (s) => s.name).map((s) => s.id)).toEqual(['1', '3'])
  })

  test('works with scan-like getName', () => {
    const scans = [
      { dir: '/a', name: 'x', manifest: { name: 'Alpha' } },
      { dir: '/b', name: 'y', manifest: { name: 'alpha' } },
    ]
    expect(dedupeByNameKey(scans, (s) => getSkillDisplayName(s))).toHaveLength(1)
  })

  test('skips empty keys after first empty', () => {
    const items = [{ name: '' }, { name: '  ' }, { name: 'ok' }]
    expect(dedupeByNameKey(items, (s) => s.name).map((s) => s.name)).toEqual(['', 'ok'])
  })
})

describe('skillMatchesInstalled', () => {
  test('matches by dir containing folder', () => {
    expect(
      skillMatchesInstalled({ dir: '/home/.cursor/skills/my-skill', name: 'Other', manifest: { name: 'Other' } }, 'my-skill', 'My Skill'),
    ).toBe(true)
  })

  test('matches by display name case-insensitive', () => {
    expect(skillMatchesInstalled({ dir: '/x/other', name: 'x', manifest: { name: 'My Skill' } }, 'my-skill', 'My Skill')).toBe(true)
  })

  test('no match', () => {
    expect(skillMatchesInstalled({ dir: '/x/other', name: 'Other', manifest: { name: 'Other' } }, 'my-skill', 'My Skill')).toBe(false)
  })
})

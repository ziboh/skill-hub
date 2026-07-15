import { describe, test, expect } from 'vitest'
import { getSkillUrl, matchSkillDirByMeta, collectPathCandidates, getRepoRelativeSkillPath } from '../useStoreDownload'
import type { Skill } from '../../types'

describe('useStoreDownload pure helpers', () => {
  test('getSkillUrl prefers sourceUrl then homepage then repo', () => {
    expect(getSkillUrl({ sourceUrl: 'https://a.com' } as Skill)).toBe('https://a.com')
    expect(getSkillUrl({ homepage: 'https://b.com' } as Skill)).toBe('https://b.com')
    expect(getSkillUrl({ repo: 'o/r' } as Skill)).toBe('https://github.com/o/r')
    expect(getSkillUrl({} as Skill)).toBeUndefined()
  })

  test('matchSkillDirByMeta matches by meta name then dir name', () => {
    const candidates = [
      { dir: '/tmp/foo', name: 'Foo Skill', description: '' },
      { dir: '/tmp/bar', name: 'Bar', description: '' },
    ]
    expect(matchSkillDirByMeta(candidates, 'Foo Skill')).toBe('/tmp/foo')
    expect(matchSkillDirByMeta(candidates, 'bar')).toBe('/tmp/bar')
    expect(matchSkillDirByMeta([{ dir: '/only', name: 'x', description: '' }], 'anything')).toBe('/only')
    expect(matchSkillDirByMeta([], 'x')).toBeNull()
  })

  test('collectPathCandidates builds common skill path variants', () => {
    expect(collectPathCandidates('my-skill')).toEqual(['my-skill', 'skills/my-skill', 'agent-skills/my-skill'])
    expect(collectPathCandidates('owner/repo/path')).toEqual([
      'owner/repo/path',
      'skills/owner/repo/path',
      'agent-skills/owner/repo/path',
    ])
  })

  test('derives the actual repository path from an extracted skill directory', () => {
    expect(
      getRepoRelativeSkillPath(
        'C:\\temp\\agent-skills-main',
        'C:\\temp\\agent-skills-main\\skills\\react-best-practices',
      ),
    ).toBe('skills/react-best-practices')
  })
})

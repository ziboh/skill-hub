import { describe, test, expect } from 'vitest'
import { getFilterByKey, leaderboardEntryToSkill, searchResultToSkill, getGitHubRepo } from '../skills-sh'
import type { LeaderboardEntry, PublicSearchResult } from '../skills-sh'

describe('getFilterByKey', () => {
  test('returns matching filter for known key', () => {
    const result = getFilterByKey('trending')
    expect(result.key).toBe('trending')
    expect(result.label).toBe('趋势')
  })

  test('returns all filter for unknown key', () => {
    const result = getFilterByKey('unknown')
    expect(result.key).toBe('all')
  })

  test('returns default filter for undefined key', () => {
    const result = getFilterByKey(undefined as unknown as string)
    expect(result.key).toBe('all')
  })
})

describe('leaderboardEntryToSkill', () => {
  test('converts leaderboard entry to Skill object', () => {
    const entry: LeaderboardEntry = {
      owner: 'testuser',
      repo: 'test-repo',
      skillName: 'My Skill',
      detailPath: '/testuser/test-repo/my-skill',
      detailUrl: 'https://skills.sh/testuser/test-repo/my-skill',
      installs: 42,
    }
    const result = leaderboardEntryToSkill(entry)
    expect(result).toMatchObject({
      name: 'My Skill',
      author: 'testuser',
      source: 'skills-sh',
      repo: 'testuser/test-repo',
      installCount: 42,
    })
    expect(result.id).toContain('testuser/test-repo')
  })

  test('handles entry with empty detailPath', () => {
    const entry: LeaderboardEntry = {
      owner: 'user',
      repo: 'repo',
      skillName: 'test-skill',
      detailPath: '/user/repo/',
      detailUrl: '',
      installs: 0,
    }
    const result = leaderboardEntryToSkill(entry)
    expect(result.path).toBeTruthy()
  })
})

describe('searchResultToSkill', () => {
  test('converts search result to Skill object', () => {
    const result: PublicSearchResult = {
      id: 'owner/repo/my-skill',
      name: 'Test Skill',
      source: 'owner/repo',
      installs: 10,
      skillId: 'my-skill',
    }
    const skill = searchResultToSkill(result)
    expect(skill).toMatchObject({
      name: 'Test Skill',
      author: 'owner',
      source: 'skills-sh',
      repo: 'owner/repo',
      installCount: 10,
      sourceUrl: 'https://skills.sh/owner/repo/my-skill',
    })
  })

  test('handles search result without skillId', () => {
    const result: PublicSearchResult = {
      name: 'My Skill',
      source: 'user/repo',
      installs: 5,
    }
    const skill = searchResultToSkill(result)
    expect(skill.path).toBe('my-skill')
  })

  test('adds site/ prefix for domain-based (non-GitHub) source', () => {
    const result: PublicSearchResult = {
      id: 'open.feishu.cn/lark-approval',
      name: 'lark-approval',
      source: 'open.feishu.cn',
      installs: 100,
      skillId: 'lark-approval',
    }
    const skill = searchResultToSkill(result)
    expect(skill.sourceUrl).toBe('https://skills.sh/site/open.feishu.cn/lark-approval')
    expect(skill.id).toBe('open.feishu.cn/lark-approval')
  })
})

describe('getGitHubRepo', () => {
  test('extracts owner and repo from valid repo string', () => {
    const result = getGitHubRepo({ repo: 'owner/repo' } as any)
    expect(result).toEqual({ owner: 'owner', repo: 'repo' })
  })

  test('returns null for invalid repo string', () => {
    expect(getGitHubRepo({ repo: 'single' } as any)).toBeNull()
  })

  test('returns null for missing repo', () => {
    expect(getGitHubRepo({} as any)).toBeNull()
    expect(getGitHubRepo({ repo: '' } as any)).toBeNull()
  })
})

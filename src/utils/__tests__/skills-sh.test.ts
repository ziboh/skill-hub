import { afterEach, describe, test, expect, vi } from 'vitest'
import {
  getFilterByKey,
  leaderboardEntryToSkill,
  searchResultToSkill,
  getGitHubRepo,
  fetchLeaderboard,
  fetchAllSkillsFromSitemap,
  parseSkillsSitemap,
  clearSkillsCatalogCache,
  decodeDownloadText,
  searchSkillsSh,
  fetchSkillDetailFromSkill,
  SKILLS_SITEMAP_URLS,
} from '../skills-sh'
import * as github from '../github'
import type { LeaderboardEntry, PublicSearchResult } from '../skills-sh'

afterEach(() => {
  clearSkillsCatalogCache()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

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

describe('fetchSkillDetailFromSkill', () => {
  test('builds canonical id from the SKILL.md name without changing the source id', async () => {
    const treeSpy = vi.spyOn(github, 'fetchGitHubRepoTree').mockResolvedValue([
      { path: 'skills/react-best-practices/SKILL.md', type: 'blob' },
    ])
    const fileSpy = vi
      .spyOn(github, 'fetchGitHubFile')
      .mockResolvedValue('---\nname: vercel-react-best-practices\ndescription: React guidance\n---\n# Guide')

    try {
      const result = await fetchSkillDetailFromSkill({
        id: 'vercel-labs/agent-skills/react-best-practices',
        name: 'react-best-practices',
        description: '',
        author: '',
        tags: [],
        source: 'github',
        repo: 'vercel-labs/agent-skills',
        path: 'skills/react-best-practices',
      })

      expect(result?.canonicalId).toBe('vercel-labs/agent-skills/vercel-react-best-practices')
    } finally {
      treeSpy.mockRestore()
      fileSpy.mockRestore()
    }
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


describe('parseSkillsSitemap', () => {
  test('extracts skill name and repo from loc URLs', () => {
    const xml = `<?xml version="1.0"?>
      <urlset>
        <url><loc>https://www.skills.sh/vercel-labs/skills/find-skills</loc></url>
        <url><loc>https://skills.sh/anthropics/skills/frontend-design</loc></url>
        <url><loc>https://www.skills.sh/vercel-labs</loc></url>
      </urlset>`
    const entries = parseSkillsSitemap(xml)
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({
      owner: 'vercel-labs',
      repo: 'skills',
      skillName: 'find-skills',
      detailUrl: 'https://skills.sh/vercel-labs/skills/find-skills',
    })
    expect(entries[1].skillName).toBe('frontend-design')
  })

  test('dedupes identical locs and skips agent pages', () => {
    const xml = `
      <url><loc>https://www.skills.sh/owner/repo/skill-a</loc></url>
      <url><loc>https://www.skills.sh/owner/repo/skill-a</loc></url>
      <url><loc>https://www.skills.sh/agent/claude-code/something</loc></url>`
    expect(parseSkillsSitemap(xml)).toHaveLength(1)
  })
})

describe('decodeDownloadText', () => {
  test('decodes string, ArrayBuffer, TypedArray, and Buffer-shaped objects', () => {
    expect(decodeDownloadText('hello')).toBe('hello')
    expect(decodeDownloadText(new TextEncoder().encode('ab').buffer)).toBe('ab')
    expect(decodeDownloadText(new TextEncoder().encode('cd'))).toBe('cd')
    expect(decodeDownloadText({ type: 'Buffer', data: [101, 102] })).toBe('ef')
  })
})

describe('skills.sh network transport', () => {
  test('fetchAllSkillsFromSitemap uses public skill sitemaps, not /api', async () => {
    const xml1 =
      '<?xml version="1.0"?><urlset><url><loc>https://www.skills.sh/a/b/skill-one</loc></url></urlset>'
    const xml2 =
      '<?xml version="1.0"?><urlset><url><loc>https://www.skills.sh/c/d/skill-two</loc></url></urlset>'
    const downloadFile = vi.spyOn(window.services, 'downloadFile').mockImplementation(async (url: string) => {
      if (url.includes('sitemap-skills-1')) return xml1
      if (url.includes('sitemap-skills-2')) return xml2
      throw new Error(`unexpected url ${url}`)
    })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const result = await fetchAllSkillsFromSitemap()

    expect(downloadFile).toHaveBeenCalledWith(SKILLS_SITEMAP_URLS[0])
    expect(downloadFile).toHaveBeenCalledWith(SKILLS_SITEMAP_URLS[1])
    expect(downloadFile.mock.calls.every(([url]) => !String(url).includes('/api/'))).toBe(true)
    expect(result.totalCount).toBe(2)
    expect(result.entries.map((e) => e.skillName).sort()).toEqual(['skill-one', 'skill-two'])
  })

  test('fetchAllSkillsFromSitemap does not cache empty results', async () => {
    const downloadFile = vi.spyOn(window.services, 'downloadFile').mockResolvedValue('not-xml')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const empty = await fetchAllSkillsFromSitemap()
    expect(empty.totalCount).toBe(0)

    downloadFile.mockResolvedValue(
      '<?xml version="1.0"?><urlset><url><loc>https://www.skills.sh/o/r/skill</loc></url></urlset>',
    )
    const next = await fetchAllSkillsFromSitemap()
    expect(next.totalCount).toBe(1)
  })

  test('fetchAllSkillsFromSitemap memoizes results until force refresh', async () => {
    const xml =
      '<?xml version="1.0"?><urlset><url><loc>https://www.skills.sh/owner/repo/cached-skill</loc></url></urlset>'
    const downloadFile = vi.spyOn(window.services, 'downloadFile').mockResolvedValue(xml)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const first = await fetchAllSkillsFromSitemap()
    const second = await fetchAllSkillsFromSitemap()
    expect(first.entries).toHaveLength(1)
    expect(second.entries[0].skillName).toBe('cached-skill')
    expect(downloadFile).toHaveBeenCalledTimes(SKILLS_SITEMAP_URLS.length)

    await fetchAllSkillsFromSitemap(true)
    expect(downloadFile).toHaveBeenCalledTimes(SKILLS_SITEMAP_URLS.length * 2)
  })

  test('uses the preload download bridge for leaderboard HTML', async () => {
    const html = '<a href="/owner/repo/my-skill"><h3>My Skill</h3></a>'
    const downloadFile = vi.spyOn(window.services, 'downloadFile').mockResolvedValue(
      new TextEncoder().encode(html).buffer,
    )
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const result = await fetchLeaderboard()

    expect(downloadFile).toHaveBeenCalledWith('https://skills.sh/')
    expect(result.entries[0]).toMatchObject({ owner: 'owner', repo: 'repo', skillName: 'My Skill' })
  })

  test('uses the preload download bridge for trending leaderboard HTML', async () => {
    const html = '<a href="/owner/repo/my-skill"><h3>My Skill</h3></a>'
    const downloadFile = vi.spyOn(window.services, 'downloadFile').mockResolvedValue(
      new TextEncoder().encode(html).buffer,
    )
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const result = await fetchLeaderboard('trending')

    expect(downloadFile).toHaveBeenCalledWith('https://skills.sh/trending')
    expect(result.entries[0]).toMatchObject({ owner: 'owner', repo: 'repo', skillName: 'My Skill' })
  })

  test('uses the preload download bridge for search JSON', async () => {
    const payload = { skills: [{ name: 'My Skill', source: 'owner/repo', installs: 1, skillId: 'my-skill' }] }
    const downloadFile = vi.spyOn(window.services, 'downloadFile').mockResolvedValue(
      new TextEncoder().encode(JSON.stringify(payload)).buffer,
    )
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const result = await searchSkillsSh('my skill')

    expect(downloadFile).toHaveBeenCalledWith('https://skills.sh/api/search?q=my%20skill')
    expect(result).toEqual(payload.skills)
  })
})


import { afterEach, describe, test, expect, vi } from 'vitest'
import {
  getFilterByKey,
  filterKeyToApiView,
  leaderboardEntryToSkill,
  searchResultToSkill,
  getGitHubRepo,
  fetchLeaderboard,
  fetchSkillsPage,
  fetchAllSkillsFromSitemap,
  parseSkillsSitemap,
  parseSkillsSitemapIndex,
  parseLeaderboardHtml,
  mergeLeaderboardWithCatalog,
  clearSkillsCatalogCache,
  decodeDownloadText,
  searchSkillsSh,
  fetchSkillDetailFromSkill,
  fetchSkillDescriptionFromSh,
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

  test('maps UI filter keys to official API views', () => {
    expect(filterKeyToApiView('all')).toBe('all-time')
    expect(filterKeyToApiView('trending')).toBe('trending')
    expect(filterKeyToApiView('hot')).toBe('hot')
    expect(filterKeyToApiView(undefined)).toBe('all-time')
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

describe('parseSkillsSitemapIndex', () => {
  test('extracts only skill sitemap urls', () => {
    const xml = `<?xml version="1.0"?>
      <sitemapindex>
        <sitemap><loc>https://www.skills.sh/sitemap-misc.xml</loc></sitemap>
        <sitemap><loc>https://www.skills.sh/sitemap-skills-1.xml</loc></sitemap>
        <sitemap><loc>https://skills.sh/sitemap-skills-2.xml</loc></sitemap>
      </sitemapindex>`
    expect(parseSkillsSitemapIndex(xml)).toEqual([
      'https://www.skills.sh/sitemap-skills-1.xml',
      'https://www.skills.sh/sitemap-skills-2.xml',
    ])
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

describe('parseLeaderboardHtml rank order', () => {
  test('prefers embedded JSON so #26 is lark-approval including collapsed group members', () => {
    const skills = [
      ['vercel-labs/skills', 'find-skills', 100],
      ['anthropics/skills', 'frontend-design', 99],
      ['mattpocock/skills', 'grill-me', 98],
      ['vercel-labs/agent-skills', 'vercel-react-best-practices', 97],
      ['vercel-labs/agent-browser', 'agent-browser', 96],
      ['mattpocock/skills', 'grill-with-docs', 95],
      ['mattpocock/skills', 'improve-codebase-architecture', 94],
      ['mattpocock/skills', 'tdd', 93],
      ['vercel-labs/agent-skills', 'web-design-guidelines', 92],
      ['microsoft/azure-skills', 'microsoft-foundry', 91],
      ['microsoft/azure-skills', 'azure-ai', 90],
      ['microsoft/azure-skills', 'azure-deploy', 89],
      ['microsoft/azure-skills', 'azure-diagnostics', 88],
      ['microsoft/azure-skills', 'azure-prepare', 87],
      ['microsoft/azure-skills', 'azure-storage', 86],
      ['microsoft/azure-skills', 'azure-validate', 85],
      ['microsoft/azure-skills', 'entra-app-registration', 84],
      ['microsoft/azure-skills', 'appinsights-instrumentation', 83],
      ['microsoft/azure-skills', 'azure-compliance', 82],
      ['microsoft/azure-skills', 'azure-resource-lookup', 81],
      ['microsoft/azure-skills', 'azure-aigateway', 80],
      ['microsoft/azure-skills', 'azure-kusto', 79],
      ['microsoft/azure-skills', 'azure-resource-visualizer', 78],
      ['microsoft/azure-skills', 'azure-rbac', 77],
      ['microsoft/azure-skills', 'azure-messaging', 76],
      ['open.feishu.cn', 'lark-approval', 75],
    ] as const
    const embedded = skills
      .map(
        ([source, id, installs]) =>
          String.raw`\"source\":\"${source}\",\"skillId\":\"${id}\",\"name\":\"${id}\",\"installs\":${installs}`,
      )
      .join(',')
    const html = `<html><script>self.__next_f.push([1,"${embedded}"])</script>
      <a href="/vercel-labs/skills/find-skills"><span class="font-mono">1</span><h3>find-skills</h3></a>
      <a href="/site/open.feishu.cn/lark-approval"><span class="font-mono">26</span><h3>lark-approval</h3></a>
    </html>`
    const { entries } = parseLeaderboardHtml(html)
    expect(entries[0].skillName).toBe('find-skills')
    expect(entries[9].skillName).toBe('microsoft-foundry')
    expect(entries[25].skillName).toBe('lark-approval')
    expect(entries[25]).toMatchObject({
      owner: 'site',
      repo: 'open.feishu.cn',
      detailPath: '/site/open.feishu.cn/lark-approval',
      installs: 75,
    })
  })

  test('falls back to visible rank numbers when no embedded JSON', () => {
    const html = `
      <a href="/vercel-labs/skills/find-skills"><span class="font-mono">1</span><h3>find-skills</h3></a>
      <a href="/site/open.feishu.cn/lark-approval"><span class="text-sm font-mono">26</span><h3>lark-approval</h3></a>
      <a href="/anthropics/skills/frontend-design"><span class="font-mono">2</span><h3>frontend-design</h3></a>
    `
    const { entries } = parseLeaderboardHtml(html)
    expect(entries.map((e) => e.skillName)).toEqual(['find-skills', 'frontend-design', 'lark-approval'])
  })
})

describe('mergeLeaderboardWithCatalog', () => {
  test('keeps leaderboard order and appends unique sitemap entries', () => {
    const board = [
      {
        owner: 'a',
        repo: 'r',
        skillName: 'one',
        detailPath: '/a/r/one',
        detailUrl: 'https://skills.sh/a/r/one',
        installs: 0,
      },
      {
        owner: 'site',
        repo: 'open.feishu.cn',
        skillName: 'lark-approval',
        detailPath: '/site/open.feishu.cn/lark-approval',
        detailUrl: 'https://skills.sh/site/open.feishu.cn/lark-approval',
        installs: 0,
      },
    ]
    const catalog = [
      {
        owner: 'z',
        repo: 'r',
        skillName: 'tail',
        detailPath: '/z/r/tail',
        detailUrl: 'https://skills.sh/z/r/tail',
        installs: 0,
      },
      {
        owner: 'a',
        repo: 'r',
        skillName: 'one',
        detailPath: '/a/r/one',
        detailUrl: 'https://skills.sh/a/r/one',
        installs: 0,
      },
    ]
    const merged = mergeLeaderboardWithCatalog(board, catalog)
    expect(merged.map((e) => e.skillName)).toEqual(['one', 'lark-approval', 'tail'])
  })
})

describe('skills.sh network transport', () => {
  function mockDownload(map: Record<string, string | object>) {
    return vi.spyOn(window.services, 'downloadFile').mockImplementation(async (url: string) => {
      for (const [key, body] of Object.entries(map)) {
        if (url.includes(key)) {
          return typeof body === 'string' ? body : JSON.stringify(body)
        }
      }
      throw new Error(`unexpected url ${url}`)
    })
  }

  test('fetchSkillsPage uses official /api/skills/{view}/{page} like the website', async () => {
    const payload = {
      skills: [
        { source: 'vercel-labs/skills', skillId: 'find-skills', name: 'find-skills', installs: 100 },
        {
          source: 'open.feishu.cn',
          skillId: 'lark-approval',
          name: 'lark-approval',
          installs: 50,
        },
      ],
      hasMore: true,
    }
    // pad to make index 25 = lark when we care about full page in other tests
    const downloadFile = mockDownload({
      '/api/skills/all-time/0': payload,
    })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const result = await fetchSkillsPage('all-time', 0)

    expect(downloadFile).toHaveBeenCalledWith('https://skills.sh/api/skills/all-time/0')
    expect(result.hasMore).toBe(true)
    expect(result.entries[0].skillName).toBe('find-skills')
    expect(result.entries[1]).toMatchObject({
      skillName: 'lark-approval',
      owner: 'site',
      repo: 'open.feishu.cn',
      detailPath: '/site/open.feishu.cn/lark-approval',
      installs: 50,
    })
  })

  test('fetchSkillsPage page index 25 maps to lark-approval for a full first page', async () => {
    const skills = Array.from({ length: 26 }, (_, i) => {
      if (i === 25) {
        return {
          source: 'open.feishu.cn',
          skillId: 'lark-approval',
          name: 'lark-approval',
          installs: 442961,
        }
      }
      return {
        source: 'owner/repo',
        skillId: `skill-${i + 1}`,
        name: `skill-${i + 1}`,
        installs: 1000 - i,
      }
    })
    mockDownload({
      '/api/skills/all-time/0': { skills, hasMore: true },
    })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const result = await fetchSkillsPage('all-time', 0)
    expect(result.entries[25].skillName).toBe('lark-approval')
  })

  test('fetchLeaderboard prefers API page 0 over HTML scraping', async () => {
    const downloadFile = mockDownload({
      '/api/skills/all-time/0': {
        skills: [
          { source: 'vercel-labs/skills', skillId: 'find-skills', name: 'find-skills', installs: 1 },
        ],
        hasMore: true,
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const result = await fetchLeaderboard('all')
    expect(downloadFile).toHaveBeenCalledWith('https://skills.sh/api/skills/all-time/0')
    expect(result.entries[0].skillName).toBe('find-skills')
    // should not need homepage HTML when API works
    expect(downloadFile.mock.calls.every(([url]) => !String(url).endsWith('skills.sh/'))).toBe(true)
  })

  test('fetchLeaderboard falls back to HTML when API fails', async () => {
    const html =
      '<a href="/owner/repo/my-skill"><span class="font-mono">1</span><h3>My Skill</h3></a>'
    const downloadFile = vi.spyOn(window.services, 'downloadFile').mockImplementation(async (url: string) => {
      if (String(url).includes('/api/skills/')) throw new Error('api down')
      return new TextEncoder().encode(html).buffer
    })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const result = await fetchLeaderboard()
    expect(downloadFile).toHaveBeenCalledWith('https://skills.sh/')
    expect(result.entries[0]).toMatchObject({ owner: 'owner', repo: 'repo', skillName: 'My Skill' })
  })

  test('uses the preload download bridge for trending leaderboard via API', async () => {
    const downloadFile = mockDownload({
      '/api/skills/trending/0': {
        skills: [{ source: 'owner/repo', skillId: 'my-skill', name: 'My Skill', installs: 1 }],
        hasMore: false,
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const result = await fetchLeaderboard('trending')
    expect(downloadFile).toHaveBeenCalledWith('https://skills.sh/api/skills/trending/0')
    expect(result.entries[0]).toMatchObject({ owner: 'owner', repo: 'repo', skillName: 'My Skill' })
  })

  test('searchSkillsSh uses official /api/search like the website', async () => {
    const payload = {
      skills: [{ name: 'My Skill', source: 'owner/repo', installs: 1, skillId: 'my-skill' }],
    }
    const downloadFile = mockDownload({
      '/api/search?q=': payload,
    })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const result = await searchSkillsSh('my skill')
    expect(downloadFile.mock.calls.some(([url]) => String(url).includes('/api/search?q='))).toBe(true)
    expect(result).toEqual(payload.skills)
  })

  test('fetchAllSkillsFromSitemap still works from public sitemaps', async () => {
    const index =
      '<?xml version="1.0"?><sitemapindex><sitemap><loc>https://www.skills.sh/sitemap-skills-1.xml</loc></sitemap></sitemapindex>'
    const xml =
      '<?xml version="1.0"?><urlset><url><loc>https://www.skills.sh/a/b/skill-one</loc></url></urlset>'
    const downloadFile = mockDownload({
      'sitemap.xml': index,
      'sitemap-skills-1': xml,
    })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const result = await fetchAllSkillsFromSitemap()
    expect(downloadFile.mock.calls.every(([url]) => !String(url).includes('/api/skills/'))).toBe(true)
    expect(result.totalCount).toBe(1)
    expect(SKILLS_SITEMAP_URLS.length).toBeGreaterThan(0)
  })

  test('fetchSkillDescriptionFromSh parses ld+json and meta description from detail HTML', async () => {
    const html = `
      <html><head>
        <meta name="description" content="Helps users discover agent skills when they ask &quot;how do I do X&quot;"/>
        <script type="application/ld+json">{"@context":"https://schema.org","@type":"SoftwareApplication","name":"find-skills","description":"Helps users discover and install agent skills."}</script>
      </head><body><h1>find-skills</h1></body></html>`
    vi.spyOn(window.services, 'downloadFile').mockResolvedValue(html)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const desc = await fetchSkillDescriptionFromSh({
      id: 'vercel-labs/skills/find-skills',
      name: 'find-skills',
      description: '',
      author: 'vercel-labs',
      tags: [],
      source: 'skills-sh',
      sourceUrl: 'https://skills.sh/vercel-labs/skills/find-skills',
      repo: 'vercel-labs/skills',
      path: 'find-skills',
    })

    expect(desc).toContain('Helps users discover and install agent skills')
  })
})

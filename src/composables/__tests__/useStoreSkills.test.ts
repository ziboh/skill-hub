import { describe, test, expect, vi } from 'vitest'
import {
  PAGE_SIZE,
  growVisible,
  filterLocalSearch,
  splitImportedAndAvailable,
  buildCategoryCounts,
  parseMarketplaceEntries,
  findDownloadedSkillMatch,
  useStoreSkills,
} from '../useStoreSkills'
import type { Skill, StoreSource } from '../../types'
import * as skillsSh from '../../utils/skills-sh'
import * as github from '../../utils/github'
import { fetchWellKnownIndex } from '../../utils/well-known'

function makeSkill(overrides: Partial<Skill> & { name: string }): Skill {
  return {
    id: overrides.id || overrides.name.toLowerCase().replace(/\s+/g, '-'),
    name: overrides.name,
    description: overrides.description || '',
    author: overrides.author || '',
    tags: overrides.tags || [],
    source: overrides.source || 'local',
    ...overrides,
  }
}

describe('useStoreSkills pure helpers', () => {
  test('loading skills.sh "全部" uses official API page 0 with correct rank #26', async () => {
    const skills = Array.from({ length: 26 }, (_, i) => {
      if (i === 25) {
        return {
          owner: 'site',
          repo: 'open.feishu.cn',
          skillName: 'lark-approval',
          detailPath: '/site/open.feishu.cn/lark-approval',
          detailUrl: 'https://skills.sh/site/open.feishu.cn/lark-approval',
          installs: 442961,
        }
      }
      return {
        owner: 'owner',
        repo: 'repo',
        skillName: `skill-${i + 1}`,
        detailPath: `/owner/repo/skill-${i + 1}`,
        detailUrl: `https://skills.sh/owner/repo/skill-${i + 1}`,
        installs: 1000 - i,
      }
    })
    const pageSpy = vi.spyOn(skillsSh, 'fetchSkillsPage').mockResolvedValue({
      entries: skills,
      hasMore: true,
      page: 0,
      view: 'all-time',
    })
    const treeSpy = vi.spyOn(github, 'fetchGitHubRepoTree').mockResolvedValue([])
    const store = useStoreSkills({ storeId: () => 'skills-sh' })
    store.leaderboardFilter.value = 'all'

    try {
      await store.fetchSkillsSh()
      expect(treeSpy).not.toHaveBeenCalled()
      expect(pageSpy).toHaveBeenCalledWith('all-time', 0)
      expect(store.allEntries.value[25].name).toBe('lark-approval')
      expect(store.allEntries.value).toHaveLength(26)
    } finally {
      store.stopLoadingDots()
      pageSpy.mockRestore()
      treeSpy.mockRestore()
    }
  })

  test('loading skills.sh trending uses API view trending page 0', async () => {
    const pageSpy = vi.spyOn(skillsSh, 'fetchSkillsPage').mockResolvedValue({
      entries: [
        {
          owner: 'vercel-labs',
          repo: 'skills',
          skillName: 'find-skills',
          detailPath: '/vercel-labs/skills/find-skills',
          detailUrl: 'https://skills.sh/vercel-labs/skills/find-skills',
          installs: 10,
        },
      ],
      hasMore: false,
      page: 0,
      view: 'trending',
    })
    const store = useStoreSkills({ storeId: () => 'skills-sh' })
    store.leaderboardFilter.value = 'trending'

    try {
      await store.fetchSkillsSh()
      expect(pageSpy).toHaveBeenCalledWith('trending', 0)
      expect(store.allEntries.value[0].name).toBe('find-skills')
    } finally {
      store.stopLoadingDots()
      pageSpy.mockRestore()
    }
  })

  test('skills.sh loadMore appends page 1 like the official site', async () => {
    const pageSpy = vi.spyOn(skillsSh, 'fetchSkillsPage').mockImplementation(async (view, page) => {
      if (page === 0) {
        return {
          entries: [
            {
              owner: 'a',
              repo: 'r',
              skillName: 'first',
              detailPath: '/a/r/first',
              detailUrl: 'https://skills.sh/a/r/first',
              installs: 2,
            },
          ],
          hasMore: true,
          page: 0,
          view,
        }
      }
      return {
        entries: [
          {
            owner: 'b',
            repo: 'r',
            skillName: 'second',
            detailPath: '/b/r/second',
            detailUrl: 'https://skills.sh/b/r/second',
            installs: 1,
          },
        ],
        hasMore: false,
        page: 1,
        view,
      }
    })
    const store = useStoreSkills({ storeId: () => 'skills-sh' })
    store.leaderboardFilter.value = 'all'

    try {
      await store.fetchSkillsSh()
      expect(store.allEntries.value.map((s) => s.name)).toEqual(['first'])
      await (store as any).loadMoreSkillsSh()
      expect(pageSpy).toHaveBeenCalledWith('all-time', 1)
      expect(store.allEntries.value.map((s) => s.name)).toEqual(['first', 'second'])
    } finally {
      store.stopLoadingDots()
      pageSpy.mockRestore()
    }
  })

  test('skills.sh search uses official /api/search', async () => {
    const searchSpy = vi.spyOn(skillsSh, 'searchSkillsSh').mockResolvedValue([
      { name: 'find-skills', source: 'owner/repo', installs: 1, skillId: 'find-skills' },
    ])
    const store = useStoreSkills({ storeId: () => 'skills-sh' })
    store.searchQuery.value = 'find'

    try {
      await store.onSearch()
      expect(searchSpy).toHaveBeenCalledWith('find')
      expect(store.searchActive.value).toBe(true)
      expect(store.searchResults.value.map((s) => s.name)).toEqual(['find-skills'])
    } finally {
      store.stopLoadingDots()
      searchSpy.mockRestore()
    }
  })

  test('non-skills-sh search only runs on submit, not while typing', async () => {
    const store = useStoreSkills({ storeId: () => 'claude' })
    store.allEntries.value = [
      { id: 'a', name: 'alpha-skill', description: '', path: '', source: 'claude' } as any,
      { id: 'b', name: 'beta-tool', description: '', path: '', source: 'claude' } as any,
    ]

    try {
      store.searchQuery.value = 'alpha'
      expect(store.searchActive.value).toBe(false)
      expect(store.searchResults.value).toEqual([])

      await store.onSearch()
      expect(store.searchActive.value).toBe(true)
      expect(store.searchResults.value.map((s) => s.id)).toEqual(['a'])
    } finally {
      store.stopLoadingDots()
    }
  })

  test('GitHub cards do not show description loading before a card request starts', async () => {
    const treeSpy = vi.spyOn(github, 'fetchGitHubRepoTree').mockResolvedValue([{ path: 'skills/demo/SKILL.md', type: 'blob' }])
    const store = useStoreSkills({ storeId: () => 'claude' })

    try {
      await store.fetchGitHubSkills('github.com/example/skills')

      expect(store.allEntries.value).toHaveLength(1)
      expect(store.loadingDescIds.value.size).toBe(0)
    } finally {
      store.stopLoadingDots()
      treeSpy.mockRestore()
    }
  })

  test('refetching a GitHub store clears stale description states', async () => {
    const treeSpy = vi.spyOn(github, 'fetchGitHubRepoTree').mockResolvedValue([{ path: 'skills/demo/SKILL.md', type: 'blob' }])
    const store = useStoreSkills({ storeId: () => 'claude' })
    store.fetchedDescIds.value = new Set(['example/skills/demo'])
    store.loadingDescIds.value = new Set(['example/skills/demo'])
    store.failedDescIds.value = new Set(['example/skills/demo'])

    try {
      await store.fetchGitHubSkills('github.com/example/skills')

      expect(store.fetchedDescIds.value.size).toBe(0)
      expect(store.loadingDescIds.value.size).toBe(0)
      expect(store.failedDescIds.value.size).toBe(0)
    } finally {
      store.stopLoadingDots()
      treeSpy.mockRestore()
    }
  })

  test('growVisible grows by PAGE_SIZE and caps at max', () => {
    expect(growVisible(0, 100)).toBe(PAGE_SIZE)
    expect(growVisible(PAGE_SIZE, 100)).toBe(Math.min(PAGE_SIZE * 2, 100))
    expect(growVisible(90, 100)).toBe(100)
    expect(growVisible(100, 100)).toBe(100)
  })

  test('growVisible returns same when already at max', () => {
    expect(growVisible(50, 50)).toBe(50)
  })

  test('filterLocalSearch matches name, description, author, tags', () => {
    const skills = [
      makeSkill({ name: 'Alpha Tool', description: 'search stuff', author: 'bob', tags: ['dev'], id: 'a' }),
      makeSkill({ name: 'Beta', description: 'other', author: 'alice', tags: ['ops'], id: 'b' }),
      makeSkill({ name: 'Gamma', description: 'x', author: 'carol', tags: ['search'], id: 'c' }),
    ]
    expect(filterLocalSearch(skills, 'alpha').map((s) => s.id)).toEqual(['a'])
    expect(filterLocalSearch(skills, 'search').map((s) => s.id).sort()).toEqual(['a', 'c'])
    expect(filterLocalSearch(skills, 'alice').map((s) => s.id)).toEqual(['b'])
    expect(filterLocalSearch(skills, '  ').map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })

  test('splitImportedAndAvailable splits by downloaded + storeSourceId', () => {
    const active = 'store-a'
    const sourceSkills = [
      makeSkill({ name: 'S1', id: 's1' }),
      makeSkill({ name: 'S2', id: 's2' }),
      makeSkill({ name: 'S3', id: 's3' }),
    ]
    const downloadedIds = ['s1', 's2', 's4']
    const cached: Skill[] = [
      makeSkill({ name: 'S1', id: 's1', storeSourceId: active, description: 'from cache' }),
      makeSkill({ name: 'S2', id: 's2', storeSourceId: 'other-store' }),
      makeSkill({ name: 'S4', id: 's4', storeSourceId: active }),
    ]
    const { imported, available } = splitImportedAndAvailable({
      sourceSkills,
      allEntries: sourceSkills,
      downloadedIds,
      cachedDownloaded: cached,
      activePresetId: active,
      filterTab: 'all',
    })
    expect(imported.map((s) => s.id)).toEqual(['s1', 's4'])
    expect(imported.find((s) => s.id === 's1')?.description).toBe('from cache')
    expect(available.map((s) => s.id).sort()).toEqual(['s2', 's3'])
  })

  test('recognizes the same downloaded skill through canonicalId', () => {
    const sourceSkills = [
      makeSkill({
        name: 'react-best-practices',
        id: 'vercel-labs/agent-skills/react-best-practices',
        canonicalId: 'vercel-labs/agent-skills/vercel-react-best-practices',
        storeSourceId: 'github-store',
      }),
    ]
    const cached = [
      makeSkill({
        name: 'vercel-react-best-practices',
        id: 'vercel-labs/agent-skills/vercel-react-best-practices',
        storeSourceId: 'github-store',
      }),
    ]

    const { imported, available } = splitImportedAndAvailable({
      sourceSkills,
      allEntries: sourceSkills,
      downloadedIds: [cached[0].id],
      cachedDownloaded: cached,
      activePresetId: 'github-store',
      filterTab: 'all',
    })

    expect(imported).toHaveLength(1)
    expect(imported[0].canonicalId).toBe(cached[0].id)
    expect(available).toHaveLength(0)
  })

  test('finds a skills.sh download for an unresolved GitHub card id', () => {
    const githubCard = makeSkill({
      id: 'vercel-labs/agent-skills/react-best-practices',
      name: 'react-best-practices',
      source: 'github',
      repo: 'vercel-labs/agent-skills',
      path: 'skills/react-best-practices',
    })
    const downloaded = makeSkill({
      id: 'vercel-labs/agent-skills/vercel-react-best-practices',
      canonicalId: 'vercel-labs/agent-skills/vercel-react-best-practices',
      name: 'vercel-react-best-practices',
      source: 'skills-sh',
      repo: 'vercel-labs/agent-skills',
      storeSourceId: 'skills-sh',
    })

    expect(findDownloadedSkillMatch(githubCard, [downloaded.id], [downloaded])).toBe(downloaded)
  })

  test('splitImportedAndAvailable filters by category tab', () => {
    const active = 'store-a'
    const sourceSkills = [
      makeSkill({ name: 'S1', id: 's1', category: 'dev' }),
      makeSkill({ name: 'S2', id: 's2', category: 'ops' }),
    ]
    const cached = sourceSkills.map((s) => ({ ...s, storeSourceId: active }))
    const { imported, available } = splitImportedAndAvailable({
      sourceSkills,
      allEntries: sourceSkills,
      downloadedIds: ['s1'],
      cachedDownloaded: cached,
      activePresetId: active,
      filterTab: 'ops',
    })
    expect(imported).toHaveLength(0)
    expect(available.map((s) => s.id)).toEqual(['s2'])
  })

  test('buildCategoryCounts counts all and per category', () => {
    const skills = [
      makeSkill({ name: 'A', id: 'a', category: 'dev' }),
      makeSkill({ name: 'B', id: 'b', category: 'dev' }),
      makeSkill({ name: 'C', id: 'c', category: 'ops' }),
      makeSkill({ name: 'D', id: 'd' }),
    ]
    const counts = buildCategoryCounts(skills)
    expect(counts.all).toBe(4)
    expect(counts.dev).toBe(2)
    expect(counts.ops).toBe(1)
    expect(counts.other).toBe(1)
  })

  test('parseMarketplaceEntries maps entries to skills', () => {
    const source = {
      id: 'm1',
      name: 'Market',
      type: 'marketplace-json',
      url: 'https://example.com/skills.json',
      enabled: true,
    } as StoreSource
    const entries = [
      {
        name: 'My Skill',
        description: 'desc',
        author: 'me',
        tags: 'a, b',
        repo: 'owner/repo',
        homepage: 'https://github.com/owner/repo/tree/main/skills/my-skill',
      },
      { title: 'No Repo', description: 'x' },
    ]
    const skills = parseMarketplaceEntries(entries, source, 'm1')
    expect(skills).toHaveLength(2)
    expect(skills[0].id).toBe('owner/repo/my-skill')
    expect(skills[0].name).toBe('My Skill')
    expect(skills[0].path).toBe('skills/my-skill')
    expect(skills[0].storeSourceId).toBe('m1')
    expect(skills[0].tags).toEqual(['a', 'b'])
    expect(skills[1].id).toBe('m1/no-repo')
    expect(skills[1].name).toBe('No Repo')
  })

  test('parseMarketplaceEntries normalizes alternate description fields', () => {
    const source = {
      id: 'm1',
      name: 'Market',
      type: 'marketplace-json',
      url: 'https://example.com/skills.json',
      enabled: true,
    } as StoreSource

    const skills = parseMarketplaceEntries(
      [
        { name: 'Summary Skill', summary: 'summary desc' },
        { name: 'Manifest Skill', manifest: { description: 'manifest desc' } },
      ],
      source,
      'm1',
    )

    expect(skills[0].description).toBe('summary desc')
    expect(skills[1].description).toBe('manifest desc')
  })

  test('fetchWellKnownIndex normalizes alternate description fields', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        skills: [{ name: 'demo', summary: 'well known summary', url: './demo/SKILL.md' }],
      }),
    } as Response)

    try {
      const skills = await fetchWellKnownIndex('https://example.com/.well-known/agent-skills/index.json')

      expect(skills[0].description).toBe('well known summary')
      expect(skills[0].source).toBe('well-known-index')
    } finally {
      fetchSpy.mockRestore()
    }
  })
})

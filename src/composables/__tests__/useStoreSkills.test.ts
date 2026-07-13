import { describe, test, expect } from 'vitest'
import {
  PAGE_SIZE,
  growVisible,
  filterLocalSearch,
  splitImportedAndAvailable,
  buildCategoryCounts,
  parseMarketplaceEntries,
} from '../useStoreSkills'
import type { Skill, StoreSource } from '../../types'

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
})

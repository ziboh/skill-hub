import { describe, test, expect } from 'vitest'
import { useFilteredSkills } from '../useFilteredSkills'
import type { Skill } from '../../types'

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

const baseOpts = {
  filterSource: () => '',
  filterCategory: () => '',
  filterTag: () => '',
  distributedSkillIds: () => new Set<string>(),
  getSourceLabel: () => '',
}

describe('useFilteredSkills', () => {
  const skills: Skill[] = [
    makeSkill({ name: 'Search Tool', description: 'A search utility', tags: ['search'], id: 's1', isFavorited: true }),
    makeSkill({ name: 'Code Helper', description: 'Helps with coding', tags: ['dev'], id: 's2' }),
    makeSkill({ name: 'Test Runner', description: 'Runs tests', tags: ['testing'], id: 's3', isFavorited: true }),
  ]

  test('returns all skills with no filters', () => {
    const { filteredSkills } = useFilteredSkills({
      ...baseOpts,
      downloadedSkills: () => skills,
    })
    expect(filteredSkills.value).toHaveLength(3)
  })

  test('filters by category favorites', () => {
    const { filteredSkills } = useFilteredSkills({
      ...baseOpts,
      downloadedSkills: () => skills,
      filterCategory: () => 'favorites',
    })
    expect(filteredSkills.value).toHaveLength(2)
    expect(filteredSkills.value.map((s) => s.id)).toEqual(['s1', 's3'])
  })

  test('filters by category distributed', () => {
    const { filteredSkills } = useFilteredSkills({
      ...baseOpts,
      downloadedSkills: () => skills,
      filterCategory: () => 'distributed',
      distributedSkillIds: () => new Set(['s2']),
    })
    expect(filteredSkills.value).toHaveLength(1)
    expect(filteredSkills.value[0].id).toBe('s2')
  })

  test('filters by category pending', () => {
    const { filteredSkills } = useFilteredSkills({
      ...baseOpts,
      downloadedSkills: () => skills,
      filterCategory: () => 'pending',
      distributedSkillIds: () => new Set(['s2']),
    })
    expect(filteredSkills.value).toHaveLength(2)
  })

  test('filters by source', () => {
    const { filteredSkills } = useFilteredSkills({
      ...baseOpts,
      downloadedSkills: () => skills,
      filterSource: () => 'GitHub',
      getSourceLabel: (s) => (s.source === 'github' ? 'GitHub' : 'Local'),
    })
    expect(filteredSkills.value).toHaveLength(0)
  })

  test('filters by tag', () => {
    const { filteredSkills } = useFilteredSkills({
      ...baseOpts,
      downloadedSkills: () => skills,
      filterTag: () => 'dev',
    })
    expect(filteredSkills.value).toHaveLength(1)
    expect(filteredSkills.value[0].name).toBe('Code Helper')
  })

  test('filteredBaseCount returns count before tag filter', () => {
    const { filteredBaseCount } = useFilteredSkills({
      ...baseOpts,
      downloadedSkills: () => skills,
      filterCategory: () => 'favorites',
    })
    expect(filteredBaseCount.value).toBe(2)
  })

  test('allUserTags returns tags with counts', () => {
    const { allUserTags } = useFilteredSkills({
      ...baseOpts,
      downloadedSkills: () => skills,
    })
    expect(allUserTags.value.length).toBeGreaterThan(0)
  })

  test('getSkillCategory returns category from tags or inferred', () => {
    const { getSkillCategory } = useFilteredSkills({
      ...baseOpts,
      downloadedSkills: () => [],
    })
    const skill = makeSkill({ name: 'Search Tool', description: 'search utility', tags: ['search'] })
    expect(getSkillCategory(skill)).toBe('search')
  })

  test('getSkillCategory prefers source tags over name inference', () => {
    const { getSkillCategory } = useFilteredSkills({
      ...baseOpts,
      downloadedSkills: () => [],
    })
    // name/desc would infer "search", but tags say "dev"
    const skill = makeSkill({ name: 'Search Tool', description: 'search utility', tags: ['dev'] })
    expect(getSkillCategory(skill)).toBe('dev')
  })

  test('getSkillCategory matches Chinese category labels in tags', () => {
    const { getSkillCategory } = useFilteredSkills({
      ...baseOpts,
      downloadedSkills: () => [],
    })
    const skill = makeSkill({ name: 'Foo', description: '', tags: ['开发'] })
    expect(getSkillCategory(skill)).toBe('dev')
  })
})

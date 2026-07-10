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

describe('useFilteredSkills', () => {
  const skills: Skill[] = [
    makeSkill({ name: 'Search Tool', description: 'A search utility', tags: ['search'], id: 's1' }),
    makeSkill({ name: 'Code Helper', description: 'Helps with coding', tags: ['dev'], id: 's2' }),
    makeSkill({ name: 'Test Runner', description: 'Runs tests', tags: ['testing'], id: 's3' }),
  ]

  test('returns all skills with no filters', () => {
    const { filteredSkills } = useFilteredSkills({
      downloadedSkills: () => skills,
      filterSource: () => '',
      filterCategory: () => '',
      filterTag: () => '',
      favoriteIds: () => [],
      distributedSkillIds: () => new Set(),
      getSourceLabel: () => '',
    })
    expect(filteredSkills.value).toHaveLength(3)
  })

  test('filters by category favorites', () => {
    const { filteredSkills } = useFilteredSkills({
      downloadedSkills: () => skills,
      filterSource: () => '',
      filterCategory: () => 'favorites',
      filterTag: () => '',
      favoriteIds: () => ['s1', 's3'],
      distributedSkillIds: () => new Set(),
      getSourceLabel: () => '',
    })
    expect(filteredSkills.value).toHaveLength(2)
    expect(filteredSkills.value.map((s) => s.id)).toEqual(['s1', 's3'])
  })

  test('filters by category distributed', () => {
    const { filteredSkills } = useFilteredSkills({
      downloadedSkills: () => skills,
      filterSource: () => '',
      filterCategory: () => 'distributed',
      filterTag: () => '',
      favoriteIds: () => [],
      distributedSkillIds: () => new Set(['s2']),
      getSourceLabel: () => '',
    })
    expect(filteredSkills.value).toHaveLength(1)
    expect(filteredSkills.value[0].id).toBe('s2')
  })

  test('filters by category pending', () => {
    const { filteredSkills } = useFilteredSkills({
      downloadedSkills: () => skills,
      filterSource: () => '',
      filterCategory: () => 'pending',
      filterTag: () => '',
      favoriteIds: () => [],
      distributedSkillIds: () => new Set(['s2']),
      getSourceLabel: () => '',
    })
    expect(filteredSkills.value).toHaveLength(2)
  })

  test('filters by source', () => {
    const { filteredSkills } = useFilteredSkills({
      downloadedSkills: () => skills,
      filterSource: () => 'GitHub',
      filterCategory: () => '',
      filterTag: () => '',
      favoriteIds: () => [],
      distributedSkillIds: () => new Set(),
      getSourceLabel: (s) => s.source === 'github' ? 'GitHub' : 'Local',
    })
    expect(filteredSkills.value).toHaveLength(0)
  })

  test('filters by tag', () => {
    const { filteredSkills } = useFilteredSkills({
      downloadedSkills: () => skills,
      filterSource: () => '',
      filterCategory: () => '',
      filterTag: () => 'dev',
      favoriteIds: () => [],
      distributedSkillIds: () => new Set(),
      getSourceLabel: () => '',
    })
    expect(filteredSkills.value).toHaveLength(1)
    expect(filteredSkills.value[0].name).toBe('Code Helper')
  })

  test('filteredBaseCount returns count before tag filter', () => {
    const { filteredBaseCount } = useFilteredSkills({
      downloadedSkills: () => skills,
      filterSource: () => '',
      filterCategory: () => 'favorites',
      filterTag: () => '',
      favoriteIds: () => ['s1'],
      distributedSkillIds: () => new Set(),
      getSourceLabel: () => '',
    })
    expect(filteredBaseCount.value).toBe(1)
  })

  test('allUserTags returns tags with counts', () => {
    const { allUserTags } = useFilteredSkills({
      downloadedSkills: () => skills,
      filterSource: () => '',
      filterCategory: () => '',
      filterTag: () => '',
      favoriteIds: () => [],
      distributedSkillIds: () => new Set(),
      getSourceLabel: () => '',
    })
    expect(allUserTags.value.length).toBeGreaterThan(0)
  })

  test('getSkillCategory returns category from tags or inferred', () => {
    const { getSkillCategory } = useFilteredSkills({
      downloadedSkills: () => [],
      filterSource: () => '',
      filterCategory: () => '',
      filterTag: () => '',
      favoriteIds: () => [],
      distributedSkillIds: () => new Set(),
      getSourceLabel: () => '',
    })
    const skill = makeSkill({ name: 'Search Tool', description: 'search utility', tags: ['search'] })
    const category = getSkillCategory(skill)
    expect(category).toBe('search')
  })
})

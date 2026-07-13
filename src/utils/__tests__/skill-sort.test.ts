import { describe, expect, test } from 'vitest'
import type { Skill } from '../../types'
import { sortSkills } from '../skill-sort'

function skill(partial: Partial<Skill> & { id: string; name: string }): Skill {
  return {
    description: '',
    author: '',
    tags: [],
    source: 'local',
    ...partial,
  }
}

describe('sortSkills', () => {
  const list = [
    skill({ id: '1', name: 'Zebra', downloadedAt: '2024-01-01T00:00:00.000Z' }),
    skill({ id: '2', name: 'Alpha', downloadedAt: '2025-06-01T00:00:00.000Z' }),
    skill({ id: '3', name: 'Middle' }),
    skill({ id: '4', name: 'Beta', downloadedAt: '2025-01-01T00:00:00.000Z' }),
  ]

  test('default keeps original order', () => {
    expect(sortSkills(list, 'default').map((s) => s.id)).toEqual(['1', '2', '3', '4'])
  })

  test('name-asc sorts by name', () => {
    expect(sortSkills(list, 'name-asc').map((s) => s.name)).toEqual(['Alpha', 'Beta', 'Middle', 'Zebra'])
  })

  test('name-desc sorts by name reverse', () => {
    expect(sortSkills(list, 'name-desc').map((s) => s.name)).toEqual(['Zebra', 'Middle', 'Beta', 'Alpha'])
  })

  test('recent-desc puts newest first and missing last', () => {
    expect(sortSkills(list, 'recent-desc').map((s) => s.id)).toEqual(['2', '4', '1', '3'])
  })

  test('recent-asc puts oldest first and missing last', () => {
    expect(sortSkills(list, 'recent-asc').map((s) => s.id)).toEqual(['1', '4', '2', '3'])
  })
})

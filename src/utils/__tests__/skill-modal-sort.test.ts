import { describe, expect, it } from 'vitest'
import { sortProcessedSkillsLast } from '../skill-modal-sort'

describe('sortProcessedSkillsLast', () => {
  it('keeps available skills first and moves processed skills to the end', () => {
    const skills = [
      { id: 'installed', name: 'Installed' },
      { id: 'available-a', name: 'Available A' },
      { id: 'available-b', name: 'Available B' },
    ]

    expect(sortProcessedSkillsLast(skills, (skill) => skill.id === 'installed').map((skill) => skill.id)).toEqual([
      'available-a',
      'available-b',
      'installed',
    ])
  })

  it('preserves the original order within each status group', () => {
    const skills = [{ id: 'processed-a' }, { id: 'available' }, { id: 'processed-b' }]

    expect(sortProcessedSkillsLast(skills, (skill) => skill.id.startsWith('processed')).map((skill) => skill.id)).toEqual([
      'available',
      'processed-a',
      'processed-b',
    ])
  })
})

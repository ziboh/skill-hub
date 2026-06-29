import { describe, test, expect } from 'vitest'
import { getAvatarColor } from '../color'

describe('getAvatarColor', () => {
  test('returns a color from the palette for a given name', () => {
    const color = getAvatarColor('Alice')
    expect(['#7c3aed', '#f59e0b', '#e11d48', '#059669', '#0891b2', '#f97316', '#8b5cf6', '#db2777']).toContain(color)
  })

  test('returns consistent color for the same name', () => {
    expect(getAvatarColor('Bob')).toBe(getAvatarColor('Bob'))
  })

  test('returns different colors for different names', () => {
    const colors = new Set(Array.from({ length: 20 }, (_, i) => getAvatarColor(`User${i}`)))
    expect(colors.size).toBeGreaterThan(1)
  })

  test('handles empty string', () => {
    const color = getAvatarColor('')
    expect(['#7c3aed', '#f59e0b', '#e11d48', '#059669', '#0891b2', '#f97316', '#8b5cf6', '#db2777']).toContain(color)
  })
})

import { describe, test, expect } from 'vitest'
import { hexToHsl } from '../theme'

describe('hexToHsl', () => {
  test('converts red hex to correct HSL', () => {
    const result = hexToHsl('#ff0000')
    expect(result).toEqual({ h: 0, s: 100, l: 50 })
  })

  test('converts green hex to correct HSL', () => {
    const result = hexToHsl('#00ff00')
    expect(result).toEqual({ h: 120, s: 100, l: 50 })
  })

  test('converts blue hex to correct HSL', () => {
    const result = hexToHsl('#0000ff')
    expect(result).toEqual({ h: 240, s: 100, l: 50 })
  })

  test('converts white to HSL', () => {
    const result = hexToHsl('#ffffff')
    expect(result).toEqual({ h: 0, s: 0, l: 100 })
  })

  test('converts black to HSL', () => {
    const result = hexToHsl('#000000')
    expect(result).toEqual({ h: 0, s: 0, l: 0 })
  })

  test('converts gray to HSL', () => {
    const result = hexToHsl('#808080')
    expect(result!.s).toBe(0)
    expect(result!.l).toBe(50)
  })

  test('handles hex without hash', () => {
    const result = hexToHsl('ff0000')
    expect(result).toEqual({ h: 0, s: 100, l: 50 })
  })

  test('returns null for invalid hex', () => {
    expect(hexToHsl('xyz')).toBeNull()
  })

  test('returns null for empty string', () => {
    expect(hexToHsl('')).toBeNull()
  })
})

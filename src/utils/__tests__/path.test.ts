import { describe, test, expect } from 'vitest'
import { normalizePath } from '../path'

describe('normalizePath', () => {
  test('converts backslashes to forward slashes', () => {
    expect(normalizePath('foo\\bar\\baz')).toBe('foo/bar/baz')
  })

  test('collapses multiple consecutive slashes', () => {
    expect(normalizePath('foo//bar///baz')).toBe('foo/bar/baz')
  })

  test('removes trailing slash', () => {
    expect(normalizePath('foo/bar/')).toBe('foo/bar')
  })

  test('removes leading dot-slash', () => {
    expect(normalizePath('./foo/bar')).toBe('foo/bar')
  })

  test('handles empty string', () => {
    expect(normalizePath('')).toBe('')
  })

  test('handles undefined or null', () => {
    expect(normalizePath(undefined as unknown as string)).toBe('')
    expect(normalizePath(null as unknown as string)).toBe('')
  })

  test('handles already normalized path', () => {
    expect(normalizePath('foo/bar/baz')).toBe('foo/bar/baz')
  })

  test('combines all transformations', () => {
    expect(normalizePath('./foo\\bar//baz/')).toBe('foo/bar/baz')
  })

  test('handles root path', () => {
    expect(normalizePath('/')).toBe('')
    expect(normalizePath('///')).toBe('')
    expect(normalizePath('C:\\')).toBe('C:')
  })
})

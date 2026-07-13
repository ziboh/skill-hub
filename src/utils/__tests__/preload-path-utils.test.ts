import { describe, test, expect } from 'vitest'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { safeResolveWithin, expandPath, homeDir } = require('../../../public/preload/lib/path-utils.js')

describe('preload path-utils', () => {
  test('safeResolveWithin joins under base', () => {
    const base = path.resolve('/tmp/skill-base')
    const full = safeResolveWithin(base, 'a', 'b.txt')
    expect(full).toBe(path.resolve(base, 'a', 'b.txt'))
  })

  test('safeResolveWithin rejects absolute escape', () => {
    const base = path.resolve('/tmp/skill-base')
    expect(() => safeResolveWithin(base, '/etc/passwd')).toThrow(/escapes/)
  })

  test('safeResolveWithin rejects .. escape', () => {
    const base = path.resolve('/tmp/skill-base')
    expect(() => safeResolveWithin(base, '..', 'outside')).toThrow(/escapes/)
  })

  test('expandPath expands leading tilde', () => {
    const expanded = expandPath('~/foo')
    expect(expanded.startsWith(homeDir())).toBe(true)
    expect(expanded.includes('foo')).toBe(true)
  })
})

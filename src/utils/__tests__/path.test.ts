import { describe, test, expect } from 'vitest'
import { normalizePath, safeJoin, expandHomePath, isValidGlobalSkillPath, isValidProjectRelativePath } from '../path'

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

describe('safeJoin', () => {
  test('joins normal relative paths', () => {
    expect(safeJoin('/data/skills-repo/x', 'SKILL.md')).toBe('/data/skills-repo/x/SKILL.md')
    expect(safeJoin('/data/skills-repo/x', 'scripts', 'run.js')).toBe('/data/skills-repo/x/scripts/run.js')
  })

  test('allows nested skill id style segments when used as base parts via pathJoin first', () => {
    expect(safeJoin('/data/skills-repo/owner/repo/skill', 'refs/foo.md')).toBe('/data/skills-repo/owner/repo/skill/refs/foo.md')
  })

  test('rejects parent directory escape', () => {
    expect(() => safeJoin('/data/skills-repo/x', '../y')).toThrow(/escapes/)
    expect(() => safeJoin('/data/skills-repo/x', 'a/../../b')).toThrow(/escapes/)
    expect(() => safeJoin('/data/skills-repo/x', '..', 'y')).toThrow(/escapes/)
  })

  test('rejects absolute relative segments', () => {
    expect(() => safeJoin('/data/skills-repo/x', '/etc/passwd')).toThrow(/escapes/)
    expect(() => safeJoin('/data/skills-repo/x', 'C:\\Windows\\system32')).toThrow(/escapes/)
  })

  test('allows internal .. that stays under base', () => {
    expect(safeJoin('/data/skills-repo/x', 'a/b/../c')).toBe('/data/skills-repo/x/a/c')
  })

  test('requires base', () => {
    expect(() => safeJoin('', 'a')).toThrow(/base/)
  })
})

describe('platform path validation', () => {
  test('expands only the home shorthand', () => {
    expect(expandHomePath('~/skills', '/home/user')).toBe('/home/user/skills')
    expect(expandHomePath('~other/skills', '/home/user')).toBe('~other/skills')
  })

  test('accepts absolute or home-based global paths', () => {
    expect(isValidGlobalSkillPath('~/agent/skills')).toBe(true)
    expect(isValidGlobalSkillPath('D:/agent/skills', 'win32')).toBe(true)
    expect(isValidGlobalSkillPath('\\\\server\\share\\skills', 'win32')).toBe(true)
    expect(isValidGlobalSkillPath('/home/user/agent/skills', 'linux')).toBe(true)
    expect(isValidGlobalSkillPath('/a/d/v', 'win32')).toBe(false)
    expect(isValidGlobalSkillPath('D:/agent/skills', 'linux')).toBe(false)
    expect(isValidGlobalSkillPath('agent/skills', 'linux')).toBe(false)
  })

  test('accepts project-relative paths and rejects escapes', () => {
    expect(isValidProjectRelativePath('./skills')).toBe(true)
    expect(isValidProjectRelativePath('./')).toBe(true)
    expect(isValidProjectRelativePath('.agent/skills')).toBe(true)
    expect(isValidProjectRelativePath('agent/skills')).toBe(true)
    expect(isValidProjectRelativePath('../skills')).toBe(false)
    expect(isValidProjectRelativePath('agent/../../skills')).toBe(false)
    expect(isValidProjectRelativePath('/tmp/skills')).toBe(false)
    expect(isValidProjectRelativePath('~/skills')).toBe(false)
  })
})

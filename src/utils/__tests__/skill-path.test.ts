import { describe, test, expect } from 'vitest'
import { skillIdSegments, assertSafeSkillId, skillIdSlug, isRegisteredSkillsRepoFolder } from '../skill-path'

describe('skillIdSegments', () => {
  test('splits nested github-style ids', () => {
    expect(skillIdSegments('owner/repo/skill')).toEqual(['owner', 'repo', 'skill'])
  })

  test('normalizes backslashes', () => {
    expect(skillIdSegments('a\\b\\c')).toEqual(['a', 'b', 'c'])
  })

  test('rejects empty', () => {
    expect(() => skillIdSegments('')).toThrow(/required/)
    expect(() => skillIdSegments('   ')).toThrow(/required/)
  })

  test('rejects parent segments', () => {
    expect(() => skillIdSegments('../evil')).toThrow(/Invalid/)
    expect(() => skillIdSegments('a/../b')).toThrow(/Invalid/)
    expect(() => skillIdSegments('..')).toThrow(/Invalid/)
  })

  test('rejects absolute paths', () => {
    expect(() => skillIdSegments('/etc/passwd')).toThrow(/absolute/)
    expect(() => skillIdSegments('C:\\Windows\\x')).toThrow(/absolute/)
  })

  test('rejects reserved windows names', () => {
    expect(() => skillIdSegments('con')).toThrow(/reserved/)
    expect(() => skillIdSegments('owner/nul/x')).toThrow(/reserved/)
  })
})

describe('assertSafeSkillId', () => {
  test('returns trimmed id', () => {
    expect(assertSafeSkillId('  a/b  ')).toBe('a/b')
  })
})

describe('skillIdSlug', () => {
  test('joins with dashes for temp dirs', () => {
    expect(skillIdSlug('owner/repo/skill')).toBe('owner-repo-skill')
  })
})

describe('isRegisteredSkillsRepoFolder', () => {
  test('matches first segment of nested id', () => {
    expect(isRegisteredSkillsRepoFolder('owner', ['owner/repo/skill'])).toBe(true)
    expect(isRegisteredSkillsRepoFolder('other', ['owner/repo/skill'])).toBe(false)
  })

  test('skips tmp/bak leftovers', () => {
    expect(isRegisteredSkillsRepoFolder('skill.tmp.123', [])).toBe(true)
    expect(isRegisteredSkillsRepoFolder('skill.bak.456', [])).toBe(true)
  })
})

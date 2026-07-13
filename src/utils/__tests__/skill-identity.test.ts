import { describe, test, expect } from 'vitest'
import {
  normalizeSkillNameKey,
  getSkillDisplayName,
  dedupeByNameKey,
  skillMatchesInstalled,
} from '../skill-identity'

describe('normalizeSkillNameKey', () => {
  test('lowercases and trims', () => {
    expect(normalizeSkillNameKey('  My Skill  ')).toBe('my skill')
  })

  test('empty becomes empty string', () => {
    expect(normalizeSkillNameKey('')).toBe('')
    expect(normalizeSkillNameKey(null as any)).toBe('')
    expect(normalizeSkillNameKey(undefined as any)).toBe('')
  })
})

describe('getSkillDisplayName', () => {
  test('prefers manifest.name over name', () => {
    expect(getSkillDisplayName({ name: 'folder', manifest: { name: 'Display' } })).toBe('Display')
  })

  test('falls back to name', () => {
    expect(getSkillDisplayName({ name: 'folder', manifest: null })).toBe('folder')
    expect(getSkillDisplayName({ name: 'folder' })).toBe('folder')
  })

  test('empty when both missing', () => {
    expect(getSkillDisplayName({})).toBe('')
  })
})

describe('dedupeByNameKey', () => {
  test('keeps first occurrence by name key', () => {
    const items = [
      { id: '1', name: 'Foo' },
      { id: '2', name: 'foo' },
      { id: '3', name: 'Bar' },
      { id: '4', name: ' FOO ' },
    ]
    expect(dedupeByNameKey(items, (s) => s.name).map((s) => s.id)).toEqual(['1', '3'])
  })

  test('works with scan-like getName', () => {
    const scans = [
      { dir: '/a', name: 'x', manifest: { name: 'Alpha' } },
      { dir: '/b', name: 'y', manifest: { name: 'alpha' } },
    ]
    expect(dedupeByNameKey(scans, (s) => getSkillDisplayName(s))).toHaveLength(1)
  })

  test('skips empty keys after first empty', () => {
    const items = [{ name: '' }, { name: '  ' }, { name: 'ok' }]
    expect(dedupeByNameKey(items, (s) => s.name).map((s) => s.name)).toEqual(['', 'ok'])
  })
})

describe('skillMatchesInstalled', () => {
  test('matches by dir containing folder', () => {
    expect(
      skillMatchesInstalled({ dir: '/home/.cursor/skills/my-skill', name: 'Other', manifest: { name: 'Other' } }, 'my-skill', 'My Skill'),
    ).toBe(true)
  })

  test('matches by display name case-insensitive', () => {
    expect(skillMatchesInstalled({ dir: '/x/other', name: 'x', manifest: { name: 'My Skill' } }, 'my-skill', 'My Skill')).toBe(true)
  })

  test('no match', () => {
    expect(skillMatchesInstalled({ dir: '/x/other', name: 'Other', manifest: { name: 'Other' } }, 'my-skill', 'My Skill')).toBe(false)
  })
})

import { describe, test, expect } from 'vitest'
import { isChineseContent } from '../translate'
import { addChineseTag, getSourceLabel } from '../skill-registry'
import type { SkillSourceLocation } from '../../types'

describe('isChineseContent', () => {
  test('returns true for text with >10% Chinese characters', () => {
    expect(isChineseContent('这是一段中文')).toBe(true)
  })

  test('returns true for mixed content with enough Chinese', () => {
    expect(isChineseContent('hello 世界 你好 今天 天气 不错')).toBe(true)
  })

  test('returns false for pure English text', () => {
    expect(isChineseContent('Hello world this is English')).toBe(false)
  })

  test('returns false for text with few Chinese characters', () => {
    expect(isChineseContent('a b c d e f g h i j k 中')).toBe(false)
  })

  test('returns false for empty string', () => {
    expect(isChineseContent('')).toBe(false)
  })

  test('returns false for null or undefined', () => {
    expect(isChineseContent(null as unknown as string)).toBe(false)
    expect(isChineseContent(undefined as unknown as string)).toBe(false)
  })
})

describe('addChineseTag', () => {
  test('adds 中文 tag when content has Chinese', () => {
    const result = addChineseTag(['test'], '这是一段中文')
    expect(result).toEqual(['test', '中文'])
  })

  test('does not duplicate 中文 tag', () => {
    const result = addChineseTag(['test', '中文'], '这是一段中文')
    expect(result).toEqual(['test', '中文'])
  })

  test('does not add 中文 tag for English content', () => {
    const result = addChineseTag(['test'], 'English content')
    expect(result).toEqual(['test'])
  })

  test('handles undefined content', () => {
    const result = addChineseTag(['test'])
    expect(result).toEqual(['test'])
  })
})

describe('getSourceLabel', () => {
  test('returns GitHub for github type', () => {
    expect(getSourceLabel({ type: 'github', location: 'repo' })).toBe('GitHub')
  })

  test('returns skills.sh for skills-sh type', () => {
    expect(getSourceLabel({ type: 'skills-sh', location: 'url' })).toBe('skills.sh')
  })

  test('returns Agent label for local type with platformId', () => {
    const source: SkillSourceLocation = { type: 'local', location: '/path', platformId: 'claude' }
    expect(getSourceLabel(source)).toBe('Agent (claude)')
  })

  test('returns Agent for local type without platformId', () => {
    const source: SkillSourceLocation = { type: 'local', location: '/path' }
    expect(getSourceLabel(source)).toBe('Agent')
  })

  test('returns Project for local-dir type with projectId', () => {
    const source: SkillSourceLocation = { type: 'local-dir', location: '/path', projectId: 'proj1' }
    expect(getSourceLabel(source)).toBe('Project')
  })

  test('returns Local for local-dir type without projectId', () => {
    const source: SkillSourceLocation = { type: 'local-dir', location: '/path' }
    expect(getSourceLabel(source)).toBe('Local')
  })

  test('returns Well-Known for well-known-index type', () => {
    expect(getSourceLabel({ type: 'well-known-index', location: '/path' })).toBe('Well-Known')
  })

  test('returns Git Repo for git-repo type', () => {
    expect(getSourceLabel({ type: 'git-repo', location: '/path' })).toBe('Git Repo')
  })

  test('returns Built-in for builtin type', () => {
    expect(getSourceLabel({ type: 'builtin', location: '' })).toBe('Built-in')
  })

  test('returns the type string for unknown types', () => {
    expect(getSourceLabel({ type: 'custom-type' as any, location: '' })).toBe('custom-type')
  })
})

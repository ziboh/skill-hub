import { describe, expect, test } from 'vitest'
import { isValidApiPath, isValidHttpUrl, isValidRelativeRepositoryPath, validateGitSourceOptions } from '../input-validation'

describe('input validation helpers', () => {
  test('accepts only http and https URLs', () => {
    expect(isValidHttpUrl('https://api.example.com')).toBe(true)
    expect(isValidHttpUrl('ftp://api.example.com')).toBe(false)
    expect(isValidHttpUrl('not a URL')).toBe(false)
  })

  test('requires API paths to be relative to the configured host', () => {
    expect(isValidApiPath('/v1/chat/completions')).toBe(true)
    expect(isValidApiPath('v1/chat/completions')).toBe(false)
    expect(isValidApiPath('https://other.example.com/api')).toBe(false)
  })

  test('rejects repository paths that escape their root', () => {
    expect(isValidRelativeRepositoryPath('.')).toBe(true)
    expect(isValidRelativeRepositoryPath('skills/my-skill')).toBe(true)
    expect(isValidRelativeRepositoryPath('../outside')).toBe(false)
    expect(isValidRelativeRepositoryPath('/absolute/path')).toBe(false)
  })

  test('validates optional Git branch and directory fields', () => {
    expect(validateGitSourceOptions('feature/new-ui', 'skills/.curated')).toBeNull()
    expect(validateGitSourceOptions('main', '../outside')).toContain('目录')
    expect(validateGitSourceOptions('bad branch', '')).toContain('分支')
  })
})

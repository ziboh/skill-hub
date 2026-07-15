import { describe, expect, test } from 'vitest'
import { parseRepositoryUrl } from '../repository'

describe('repository URL parsing', () => {
  test('recognizes a Gitee repository URL', () => {
    expect(parseRepositoryUrl('https://gitee.com/acme/skills')).toEqual({
      provider: 'gitee',
      owner: 'acme',
      repo: 'skills',
      defaultBranch: 'main',
    })
  })

  test('recognizes a GitHub repository URL', () => {
    expect(parseRepositoryUrl('github.com/acme/skills.git')).toEqual({
      provider: 'github',
      owner: 'acme',
      repo: 'skills',
      defaultBranch: 'main',
    })
  })
})

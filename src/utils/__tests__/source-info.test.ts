import { describe, expect, test } from 'vitest'
import { getSourceInfo } from '../source-info'

describe('skill source info', () => {
  test('uses the dedicated Gitee icon for Gitee repositories', () => {
    const info = getSourceInfo({
      id: 'acme/skills/demo',
      name: 'Demo',
      description: '',
      author: '',
      tags: [],
      source: 'gitee',
      repositoryProvider: 'gitee',
      repo: 'acme/skills',
    })

    expect(info.label).toBe('Gitee')
    expect(info.icon).toBe('store:gitee')
  })
})

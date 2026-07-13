import { describe, test, expect, vi, beforeEach } from 'vitest'

const configs: any[] = []

vi.mock('../../utils/storage', () => ({
  storage: {
    getPlatformConfigs: () => configs,
    getPlatformOrder: () => [],
  },
}))

import {
  getAllPlatformDefinitions,
  platformDisplayIcon,
  createCustomPlatformId,
  isBuiltinPlatformId,
  mergePlatformConfig,
  defaultPlatforms,
} from '../platforms'

describe('custom platforms', () => {
  beforeEach(() => {
    configs.length = 0
  })

  test('getAllPlatformDefinitions includes custom from storage', () => {
    configs.push({
      id: 'custom-foo-abc123',
      name: 'Foo Agent',
      defaultPath: '~/.foo/skills',
      projectPath: '.foo/skills/',
      enabled: true,
      detected: false,
      isCustom: true,
      icon: 'openai',
    })
    const all = getAllPlatformDefinitions()
    expect(all.some((p) => p.id === 'claude')).toBe(true)
    const custom = all.find((p) => p.id === 'custom-foo-abc123')
    expect(custom).toBeTruthy()
    expect(custom!.name).toBe('Foo Agent')
    expect(custom!.isCustom).toBe(true)
    expect(custom!.icon).toBe('openai')
  })

  test('builtin enabled override merges', () => {
    configs.push({
      id: 'claude',
      name: 'Claude Code',
      defaultPath: '~/.claude/skills/',
      enabled: false,
      detected: false,
    })
    const claude = getAllPlatformDefinitions().find((p) => p.id === 'claude')
    expect(claude!.enabled).toBe(false)
  })

  test('platformDisplayIcon prefers icon field', () => {
    expect(platformDisplayIcon({ id: 'claude' })).toBe('claude')
    expect(platformDisplayIcon({ id: 'custom-x', icon: 'openai' })).toBe('openai')
    expect(platformDisplayIcon({ id: 'custom-x' })).toBe('_generic')
    expect(platformDisplayIcon({ id: 'legacy-agent' })).toBe('_generic')
  })

  test('isBuiltinPlatformId', () => {
    expect(isBuiltinPlatformId('claude')).toBe(true)
    expect(isBuiltinPlatformId('custom-x')).toBe(false)
  })

  test('createCustomPlatformId is unique and prefixed', () => {
    const id = createCustomPlatformId('My Agent')
    expect(id.startsWith('custom-')).toBe(true)
    expect(isBuiltinPlatformId(id)).toBe(false)
  })

  test('mergePlatformConfig keeps builtin name', () => {
    const base = defaultPlatforms[0]
    const merged = mergePlatformConfig(base, { ...base, enabled: false, name: 'Hacked' })
    expect(merged.name).toBe(base.name)
    expect(merged.enabled).toBe(false)
  })
})

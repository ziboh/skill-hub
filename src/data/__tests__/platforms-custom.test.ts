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
  detectPlatforms,
  getPlatformPath,
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

  test('keeps a valid but uninstalled custom platform out of detected platforms', () => {
    configs.push({
      id: 'custom-foo-abc123',
      name: 'Foo Agent',
      defaultPath: '~/.foo/skills',
      enabled: true,
      detected: false,
      isCustom: true,
    })
    const platform = detectPlatforms().find((p) => p.id === 'custom-foo-abc123')
    expect(platform?.detected).toBe(false)
    expect(getPlatformPath(platform!, 'global')).toBe('/home/user/.foo/skills')
  })

  test('detects a custom platform when its global path is an existing directory', () => {
    configs.push({
      id: 'custom-installed-abc123',
      name: 'Installed Agent',
      defaultPath: '~/.installed/skills',
      enabled: true,
      detected: false,
      isCustom: true,
    })
    ;(window.services.stat as any).mockImplementation((p: string) => ({
      exists: p === '/home/user/.installed/skills',
      isDirectory: p === '/home/user/.installed/skills',
    }))

    expect(detectPlatforms().find((p) => p.id === 'custom-installed-abc123')?.detected).toBe(true)
  })

  test('does not detect a custom platform with a project-relative global path', () => {
    configs.push({
      id: 'custom-relative-abc123',
      name: 'Relative Agent',
      defaultPath: '.agent/skills',
      enabled: true,
      detected: false,
      isCustom: true,
    })
    ;(window.services.stat as any).mockReturnValue({ exists: true, isDirectory: true })

    expect(detectPlatforms().find((p) => p.id === 'custom-relative-abc123')?.detected).toBe(false)
  })
})

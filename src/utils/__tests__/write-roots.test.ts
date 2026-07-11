import { describe, test, expect, vi, beforeEach } from 'vitest'
import { collectWriteRoots, syncAllowedWriteRoots } from '../write-roots'
import { storage } from '../storage'
import type { RegisteredProject, PlatformInfo } from '../../types'

vi.mock('../storage', () => ({
  storage: {
    getRegisteredProjects: vi.fn(() => []),
    getPlatformConfigs: vi.fn(() => []),
  },
}))

describe('collectWriteRoots', () => {
  beforeEach(() => {
    vi.mocked(storage.getRegisteredProjects).mockReturnValue([])
    vi.mocked(storage.getPlatformConfigs).mockReturnValue([])
  })

  test('includes userData from ztools', () => {
    const roots = collectWriteRoots({ projects: [], platforms: [] })
    expect(roots.some((r) => r.includes('mock') || r.includes('path'))).toBe(true)
  })

  test('includes project rootDir and scanPaths', () => {
    const projects: RegisteredProject[] = [
      {
        id: 'p1',
        name: 'Demo',
        rootDir: 'D:/work/demo',
        scanPaths: ['D:/work/demo/extra-skills'],
        skills: [],
        createdAt: '',
      },
    ]
    const roots = collectWriteRoots({ projects, platforms: [] })
    expect(roots).toContain('D:/work/demo')
    expect(roots).toContain('D:/work/demo/extra-skills')
  })

  test('includes platform global skills path', () => {
    const platforms: PlatformInfo[] = [
      {
        id: 'cursor',
        name: 'Cursor',
        rootDir: { darwin: '~/.cursor', win32: '~/.cursor', linux: '~/.cursor' },
        skillsRelativePath: 'skills',
        defaultPath: '~/.cursor/skills/',
        enabled: true,
        detected: true,
      },
    ]
    const roots = collectWriteRoots({ projects: [], platforms })
    expect(roots.some((r) => r.includes('.cursor'))).toBe(true)
  })
})

describe('syncAllowedWriteRoots', () => {
  test('calls setAllowedWriteRoots on services', () => {
    const set = vi.fn()
    ;(window.services as any).setAllowedWriteRoots = set
    syncAllowedWriteRoots({
      projects: [
        {
          id: 'p1',
          name: 'Demo',
          rootDir: '/proj/a',
          scanPaths: [],
          skills: [],
          createdAt: '',
        },
      ],
      platforms: [],
    })
    expect(set).toHaveBeenCalled()
    const arg = set.mock.calls[0][0] as string[]
    expect(arg).toContain('/proj/a')
  })
})

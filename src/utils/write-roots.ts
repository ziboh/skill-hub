import { defaultPlatforms, detectPlatforms, getPlatformPath } from '../data/platforms'
import { storage } from './storage'
import type { PlatformInfo, RegisteredProject } from '../types'

/**
 * Collect absolute paths that mutating FS APIs may write under.
 * Bootstrap roots (userData, ~/.cache/skill-hub) are always allowed in preload.
 */
export function collectWriteRoots(opts?: { projects?: RegisteredProject[]; platforms?: PlatformInfo[] }): string[] {
  const roots = new Set<string>()
  const add = (p?: string | null) => {
    if (!p || !String(p).trim()) return
    roots.add(String(p).trim())
  }

  try {
    const ud = typeof window !== 'undefined' ? window.ztools?.getPath?.('userData') : null
    if (ud) add(ud)
  } catch {}

  try {
    const home = typeof window !== 'undefined' ? window.services?.homeDir?.() : null
    if (home) {
      add(`${home}/.cache/skill-hub`)
      add(`${home}\\.cache\\skill-hub`)
    }
  } catch {}

  const projects = opts?.projects ?? storage.getRegisteredProjects()
  for (const p of projects) {
    add(p.rootDir)
    for (const sp of p.scanPaths || []) add(sp)
  }

  const platforms =
    opts?.platforms ??
    (() => {
      try {
        return detectPlatforms()
      } catch {
        return defaultPlatforms
      }
    })()

  const savedConfigs = storage.getPlatformConfigs()
  for (const p of platforms) {
    const cfg = savedConfigs.find((c) => c.id === p.id)
    const merged: PlatformInfo = cfg
      ? { ...p, customPath: cfg.customPath, customProjectPath: cfg.customProjectPath, enabled: cfg.enabled ?? p.enabled }
      : p
    add(getPlatformPath(merged, 'global'))
    // Platform root (parent of skills) — deploy may mkdir intermediate dirs
    if (merged.rootDir) {
      try {
        const svc = typeof window !== 'undefined' ? window.services : null
        const osKey = svc?.isWindows?.() ? 'win32' : svc?.isMacOS?.() ? 'darwin' : 'linux'
        const root = merged.rootDir[osKey as 'darwin' | 'win32' | 'linux'] || merged.rootDir.linux
        if (root) {
          const expanded = root.replace(/^~/, svc?.homeDir?.() || '~')
          add(expanded)
        }
      } catch {}
    }
    if (merged.customPath) add(merged.customPath.replace(/^~/, window.services?.homeDir?.() || '~'))
    if (merged.defaultPath) add(merged.defaultPath.replace(/^~/, window.services?.homeDir?.() || '~'))
  }

  return [...roots]
}

/** Push current roots into preload whitelist. Safe no-op if API missing. */
export function syncAllowedWriteRoots(opts?: { projects?: RegisteredProject[]; platforms?: PlatformInfo[] }): void {
  const svc = typeof window !== 'undefined' ? window.services : null
  if (!svc?.setAllowedWriteRoots) return
  try {
    svc.setAllowedWriteRoots(collectWriteRoots(opts))
  } catch (err) {
    console.error('[write-roots] sync failed', err)
  }
}

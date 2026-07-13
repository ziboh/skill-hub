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
  } catch (e) {
    console.warn('[write-roots] getPath userData failed:', e)
  }

  try {
    const home = typeof window !== 'undefined' ? window.services?.homeDir?.() : null
    if (home) {
      add(`${home}/.cache/skill-hub`)
      add(`${home}\\.cache\\skill-hub`)
    }
  } catch (e) {
    console.warn('[write-roots] homeDir failed:', e)
  }

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
      } catch (e) {
        console.warn('[write-roots] detectPlatforms failed:', e)
        return defaultPlatforms
      }
    })()

  for (const p of platforms) {
    add(getPlatformPath(p, 'global'))
    // Platform root (parent of skills) — deploy may mkdir intermediate dirs
    if (p.rootDir) {
      try {
        const svc = typeof window !== 'undefined' ? window.services : null
        const osKey = svc?.isWindows?.() ? 'win32' : svc?.isMacOS?.() ? 'darwin' : 'linux'
        const root = p.rootDir[osKey as 'darwin' | 'win32' | 'linux'] || p.rootDir.linux
        if (root) {
          const expanded = root.replace(/^~/, svc?.homeDir?.() || '~')
          add(expanded)
        }
      } catch (e) {
        console.warn('[write-roots] expand platform root failed:', p.id, e)
      }
    }
    if (p.customPath) add(p.customPath.replace(/^~/, window.services?.homeDir?.() || '~'))
    if (p.defaultPath) add(p.defaultPath.replace(/^~/, window.services?.homeDir?.() || '~'))
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

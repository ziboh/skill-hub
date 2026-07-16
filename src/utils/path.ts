export function normalizePath(p: string): string {
  if (!p) return ''
  return p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/+$/, '').replace(/^\.\//, '')
}

export function isAbsolutePathSegment(s: string): boolean {
  return s.startsWith('/') || s.startsWith('\\') || /^[a-zA-Z]:[\\/]/.test(s) || s.startsWith('\\\\')
}

/** Expand the current user's home shorthand without treating `~someone` as `~`. */
export function expandHomePath(p: string, homeDir: string): string {
  if (!p) return ''
  return p.replace(/^~(?=$|[\\/])/, homeDir)
}

export type PathPlatform = 'win32' | 'darwin' | 'linux'

function getCurrentPathPlatform(): PathPlatform {
  const svc = typeof window !== 'undefined' ? window.services : null
  if (svc?.isWindows?.()) return 'win32'
  if (svc?.isMacOS?.()) return 'darwin'
  return 'linux'
}

/** Global skill directories must be absolute paths or use the current user's `~` shorthand. */
export function isValidGlobalSkillPath(p: string, platform: PathPlatform = getCurrentPathPlatform()): boolean {
  const value = String(p || '').trim()
  if (!value) return false
  if (value === '~' || /^~[\\/]/.test(value)) return true
  if (platform === 'win32') return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\')
  return value.startsWith('/')
}

/** Project skill directories are relative to the project root and cannot escape it. */
export function isValidProjectRelativePath(p: string): boolean {
  const value = String(p || '').trim()
  if (!value || isAbsolutePathSegment(value) || value === '~' || /^~[\\/]/.test(value)) return false
  if (value === './') return true

  const segments = value.replace(/\\/g, '/').split('/').filter(Boolean)
  if (!segments.length || segments.some((segment) => segment === '..')) return false
  return value.startsWith('./') || !value.startsWith('/')
}

function splitPathSegments(p: string): string[] {
  const norm = normalizePath(p)
  if (!norm) return []
  return norm.split('/').filter((s) => s !== '' && s !== '.')
}

/**
 * Join base + relative parts and reject path escape (Zip Slip / .. / absolute segments).
 * Pure string logic for tests and renderer; preload uses Node path for real FS.
 */
export function safeJoin(base: string, ...parts: string[]): string {
  if (!base) throw new Error('safeJoin: base is required')

  for (const part of parts) {
    if (part == null || part === '') continue
    const s = String(part)
    if (isAbsolutePathSegment(s)) {
      throw new Error(`Path escapes base directory: "${s}"`)
    }
  }

  const baseNorm = normalizePath(base)
  const baseSegs = splitPathSegments(baseNorm)
  if (!baseSegs.length && !baseNorm) {
    throw new Error('safeJoin: base is required')
  }

  const out = [...baseSegs]
  const rel = parts
    .filter((p) => p != null && p !== '')
    .map(String)
    .join('/')
  for (const seg of splitPathSegments(rel)) {
    if (seg === '..') {
      if (out.length <= baseSegs.length) {
        throw new Error(`Path escapes base directory: "${rel}"`)
      }
      out.pop()
      continue
    }
    out.push(seg)
  }

  const joined = out.join('/')
  // Preserve leading slash for POSIX absolute bases
  if (baseNorm.startsWith('/') || base.startsWith('/') || base.startsWith('\\')) {
    return '/' + joined.replace(/^\/+/, '')
  }
  return joined
}

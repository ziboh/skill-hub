/**
 * FS helpers with fallbacks when preload is an older build
 * (missing atomicReplaceDir / atomicWriteDir / safeJoin).
 */

export interface RemovePathResult {
  ok: boolean
  /** path was already absent before remove */
  alreadyGone?: boolean
  error?: string
}

/**
 * Remove a file/dir. Treats "already missing" as success.
 * Does NOT throw — caller decides whether to update storage / toast.
 */
export function safeRemovePath(targetPath: string): RemovePathResult {
  if (!targetPath) return { ok: true, alreadyGone: true }
  const svc = window.services
  try {
    if (!svc.pathExists(targetPath)) {
      return { ok: true, alreadyGone: true }
    }
    svc.removeFile(targetPath)
    if (svc.pathExists(targetPath)) {
      return { ok: false, error: `删除后路径仍存在: ${targetPath}` }
    }
    return { ok: true }
  } catch (e) {
    // Race: another process deleted it
    if (!svc.pathExists(targetPath)) {
      return { ok: true, alreadyGone: true }
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

export function safeJoin(base: string, ...parts: string[]): string {
  const svc = window.services
  if (typeof svc.safeJoin === 'function') {
    return svc.safeJoin(base, ...parts)
  }
  for (const p of parts) {
    if (p == null || p === '') continue
    const s = String(p)
    if (s.includes('..') || s.startsWith('/') || s.startsWith('\\') || /^[a-zA-Z]:[\\/]/.test(s)) {
      throw new Error(`Path escapes base directory: "${s}"`)
    }
  }
  return svc.pathJoin(base, ...parts.filter((p) => p != null && p !== ''))
}

function iterFiles(files: Map<string, string> | Record<string, string> | Iterable<[string, string]>): Iterable<[string, string]> {
  if (files instanceof Map) return files.entries()
  if (files && typeof (files as any)[Symbol.iterator] === 'function' && !Array.isArray(files)) {
    return files as Iterable<[string, string]>
  }
  return Object.entries(files as Record<string, string>)
}

export function atomicReplaceDir(sourceDir: string, targetDir: string): void {
  const svc = window.services
  if (typeof svc.atomicReplaceDir === 'function') {
    svc.atomicReplaceDir(sourceDir, targetDir)
    return
  }
  try {
    if (svc.pathExists(targetDir)) svc.removeFile(targetDir)
  } catch {}
  svc.mkdir(targetDir)
  svc.copyFile(sourceDir, targetDir)
}

export function atomicWriteDir(targetDir: string, files: Map<string, string> | Record<string, string> | Iterable<[string, string]>): void {
  const svc = window.services
  if (typeof svc.atomicWriteDir === 'function') {
    svc.atomicWriteDir(targetDir, files)
    return
  }
  try {
    if (svc.pathExists(targetDir)) svc.removeFile(targetDir)
  } catch {}
  svc.mkdir(targetDir)
  for (const [rel, content] of iterFiles(files)) {
    if (rel == null || rel === '') continue
    const relStr = String(rel)
    if (relStr.includes('..') || relStr.startsWith('/') || relStr.startsWith('\\') || /^[a-zA-Z]:[\\/]/.test(relStr)) {
      throw new Error(`Path escapes base directory: "${relStr}"`)
    }
    const fullPath = typeof svc.safeJoin === 'function' ? svc.safeJoin(targetDir, relStr) : svc.pathJoin(targetDir, relStr)
    svc.writeFile(fullPath, content)
  }
}

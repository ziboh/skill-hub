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
  if (typeof svc.renamePath !== 'function') throw new Error('当前 Preload 不支持安全目录替换，请重新加载插件')
  const tempDir = `${targetDir}.skill-hub-tmp-${Date.now()}`
  const backupDir = `${targetDir}.skill-hub-backup-${Date.now()}`
  try {
    svc.copyFile(sourceDir, tempDir)
    if (svc.pathExists(targetDir)) svc.renamePath(targetDir, backupDir)
    svc.renamePath(tempDir, targetDir)
    if (svc.pathExists(backupDir)) svc.removeFile(backupDir)
  } catch (e) {
    if (svc.pathExists(tempDir)) svc.removeFile(tempDir)
    if (!svc.pathExists(targetDir) && svc.pathExists(backupDir)) svc.renamePath(backupDir, targetDir)
    throw e
  }
}

export function atomicWriteDir(targetDir: string, files: Map<string, string> | Record<string, string> | Iterable<[string, string]>): void {
  const svc = window.services
  if (typeof svc.atomicWriteDir === 'function') {
    svc.atomicWriteDir(targetDir, files)
    return
  }
  if (typeof svc.renamePath !== 'function') throw new Error('当前 Preload 不支持安全目录写入，请重新加载插件')
  const tempDir = `${targetDir}.skill-hub-tmp-${Date.now()}`
  const backupDir = `${targetDir}.skill-hub-backup-${Date.now()}`
  svc.mkdir(tempDir)
  for (const [rel, content] of iterFiles(files)) {
    if (rel == null || rel === '') continue
    const relStr = String(rel)
    if (relStr.includes('..') || relStr.startsWith('/') || relStr.startsWith('\\') || /^[a-zA-Z]:[\\/]/.test(relStr)) {
      throw new Error(`Path escapes base directory: "${relStr}"`)
    }
    const fullPath = typeof svc.safeJoin === 'function' ? svc.safeJoin(tempDir, relStr) : svc.pathJoin(tempDir, relStr)
    svc.writeFile(fullPath, content)
  }
  const skillPath = typeof svc.safeJoin === 'function' ? svc.safeJoin(tempDir, 'SKILL.md') : svc.pathJoin(tempDir, 'SKILL.md')
  const lowerSkillPath = typeof svc.safeJoin === 'function' ? svc.safeJoin(tempDir, 'skill.md') : svc.pathJoin(tempDir, 'skill.md')
  if (!svc.pathExists(skillPath) && !svc.pathExists(lowerSkillPath)) {
    svc.removeFile(tempDir)
    throw new Error('SKILL.md not found in downloaded files')
  }
  try {
    if (svc.pathExists(targetDir)) svc.renamePath(targetDir, backupDir)
    svc.renamePath(tempDir, targetDir)
    if (svc.pathExists(backupDir)) svc.removeFile(backupDir)
  } catch (e) {
    if (svc.pathExists(tempDir)) svc.removeFile(tempDir)
    if (!svc.pathExists(targetDir) && svc.pathExists(backupDir)) svc.renamePath(backupDir, targetDir)
    throw e
  }
}

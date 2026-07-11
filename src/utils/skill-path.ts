/**
 * Safe skill.id → skills-repo directory path.
 * - Rejects empty, absolute segments, and ".." / "." path segments
 * - Preserves nested GitHub-style ids (owner/repo/skill) as multi-level dirs
 * - Legacy data under the same layout remains readable
 */

export function skillIdSegments(id: string): string[] {
  if (id == null || String(id).trim() === '') {
    throw new Error('skill id is required')
  }
  const raw = String(id).trim()
  // Reject absolute / drive paths
  if (raw.startsWith('/') || raw.startsWith('\\') || /^[a-zA-Z]:[\\/]/.test(raw) || raw.startsWith('\\\\')) {
    throw new Error(`Invalid skill id (absolute path): "${id}"`)
  }

  const parts = raw
    .replace(/\\/g, '/')
    .split('/')
    .filter((s) => s !== '')
  if (!parts.length) {
    throw new Error(`Invalid skill id: "${id}"`)
  }

  for (const seg of parts) {
    if (seg === '.' || seg === '..') {
      throw new Error(`Invalid skill id segment: "${seg}" in "${id}"`)
    }
    if (seg.includes('\0')) {
      throw new Error(`Invalid skill id (null byte): "${id}"`)
    }
    // Windows reserved device names as a whole segment
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(seg)) {
      throw new Error(`Invalid skill id (reserved name): "${seg}"`)
    }
  }
  return parts
}

export function assertSafeSkillId(id: string): string {
  skillIdSegments(id)
  return String(id).trim()
}

/** Flat slug for temp extract dirs (not used as skills-repo layout). */
export function skillIdSlug(id: string): string {
  return skillIdSegments(id)
    .join('-')
    .replace(/[^\w.\-]+/g, '_')
    .slice(0, 180)
}

/**
 * Absolute path: userData/skills-repo/<segments...>
 * Uses window.services when available.
 */
export function getSkillsRepoDir(skillId: string): string {
  const segs = skillIdSegments(skillId)
  const userData = window.ztools.getPath('userData')
  return window.services.pathJoin(userData, 'skills-repo', ...segs)
}

/** Join under an existing skills-repo root (for storage helpers). */
export function getSkillsRepoDirUnder(repoRoot: string, skillId: string): string {
  const segs = skillIdSegments(skillId)
  return window.services.pathJoin(repoRoot, ...segs)
}

/**
 * Whether a top-level folder under skills-repo belongs to a registered skill id.
 * Nested ids (owner/repo/skill) register the first segment as the top-level folder.
 */
export function isRegisteredSkillsRepoFolder(folderName: string, registeredIds: Iterable<string>): boolean {
  if (!folderName || folderName.startsWith('.')) return true // skip meta / hidden
  // staging leftovers from atomic ops
  if (/\.(tmp|bak)\.\d+$/.test(folderName)) return true

  for (const id of registeredIds) {
    try {
      const segs = skillIdSegments(id)
      if (segs[0] === folderName) return true
      if (skillIdSlug(id) === folderName) return true
    } catch {
      // ignore bad ids in registry
    }
  }
  return false
}

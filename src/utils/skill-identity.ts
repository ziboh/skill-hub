/** Shared skill name identity: normalize, display name, dedupe, install match. */

export function normalizeSkillNameKey(name: string | null | undefined): string {
  if (name == null) return ''
  return String(name).trim().toLowerCase()
}

export interface SkillIdentityLike {
  id: string
  canonicalId?: string
  repo?: string
  path?: string
  sourceUrl?: string
  source?: string
  repositoryProvider?: 'github' | 'gitee'
  sourceId?: string
  repositoryId?: string
  contentHash?: string
  identityId?: string
}

function normalizePath(path: string | null | undefined): string {
  return normalizeSkillNameKey(path)
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '')
}

function normalizeRepository(repo: string | null | undefined): string {
  return normalizePath(repo)
}

/**
 * Identity of one concrete provider/repository/path.
 * Provider is intentionally part of the key: equal GitHub/Gitee URLs are not
 * considered mirrors until a logical identity or content hash proves it.
 */
export function getSkillSourceId(skill: Pick<SkillIdentityLike, 'id' | 'repo' | 'path' | 'source' | 'repositoryProvider' | 'sourceUrl'>): string {
  const provider = normalizeSkillNameKey(skill.repositoryProvider || skill.source || 'local')
  const repo = normalizeRepository(skill.repo)
  const path = normalizePath(skill.path)
  if (repo) return `${provider}:${repo}:${path || normalizeSkillNameKey(skill.id)}`
  return `${provider}:${path || normalizeSkillNameKey(skill.id)}`
}

/**
 * Returns an identity that is safe to use for cross-source deduplication.
 * A provider-local source id is still useful, but cannot merge two providers.
 */
export function getConfirmedSkillId(skill: SkillIdentityLike): string {
  const explicit = normalizeSkillNameKey(skill.identityId)
  if (explicit) return `identity:${explicit}`

  const hash = normalizeSkillNameKey(skill.contentHash)
  if (hash) return `content:${hash}`

  const repositoryId = normalizeRepository(skill.repositoryId)
  const path = normalizePath(skill.path)
  if (repositoryId && path) return `repository:${repositoryId}:${path}`

  if (skill.repositoryProvider || skill.sourceId) return `source:${skill.sourceId || getSkillSourceId(skill)}`

  // Legacy records without provider metadata can still use their explicit
  // canonical id. Do not apply this fallback to provider-tagged records.
  const canonical = normalizeSkillNameKey(skill.canonicalId)
  if (canonical) return `canonical:${canonical}`
  return normalizeSkillNameKey(skill.id)
}

export function getSkillIdentityKey(skill: SkillIdentityLike): string {
  return normalizeSkillNameKey(skill.canonicalId || skill.id)
}

export function skillsShareIdentity(a: SkillIdentityLike, b: SkillIdentityLike): boolean {
  const aConfirmed = getConfirmedSkillId(a)
  const bConfirmed = getConfirmedSkillId(b)
  if (aConfirmed && bConfirmed && aConfirmed === bConfirmed) return true

  // 带来源标识的记录必须匹配具体身份或已确认的逻辑身份，不能只比较 canonicalId。
  const hasLegacyRecord = (skill: SkillIdentityLike) =>
    !skill.repositoryProvider && !skill.sourceId && !skill.repositoryId && !skill.contentHash && !skill.identityId
  if ((a.repositoryProvider || b.repositoryProvider) && aConfirmed !== bConfirmed && !hasLegacyRecord(a) && !hasLegacyRecord(b)) return false

  const aKey = getSkillIdentityKey(a)
  const bKey = getSkillIdentityKey(b)
  if (aKey && bKey && aKey === bKey) return true

  const aRepo = normalizeSkillNameKey(a.repo)
  const bRepo = normalizeSkillNameKey(b.repo)
  if (!aRepo || aRepo !== bRepo) return false

  const getSlug = (skill: SkillIdentityLike) => {
    const value = skill.path || skill.canonicalId || skill.id
    return normalizeSkillNameKey(value.split(/[\\/]/).pop())
      .replace(/[_\s]+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
  }
  const aSlug = getSlug(a)
  const bSlug = getSlug(b)
  if (!aSlug || !bSlug) return false
  if (aSlug === bSlug) return true

  const shorter = aSlug.length <= bSlug.length ? aSlug : bSlug
  const longer = aSlug.length > bSlug.length ? aSlug : bSlug
  return shorter.length >= 8 && shorter.includes('-') && (longer.startsWith(`${shorter}-`) || longer.endsWith(`-${shorter}`))
}

export interface SkillNameSource {
  name?: string
  manifest?: { name?: string } | null
}

export function getSkillDisplayName(skill: SkillNameSource): string {
  return skill.manifest?.name || skill.name || ''
}

/** Keep first item per name key; empty keys still dedupe among themselves. */
export function dedupeByNameKey<T>(items: T[], getName: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = normalizeSkillNameKey(getName(item))
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export interface ScanSkillLike {
  dir: string
  name?: string
  manifest?: { name?: string } | null
}

/** Match a scanned skill to a folder name and/or display name (same rules as skillMatchesFolder). */
export function skillMatchesInstalled(skill: ScanSkillLike, skillFolder: string, skillName: string): boolean {
  const name = normalizeSkillNameKey(getSkillDisplayName(skill))
  return skill.dir.includes(skillFolder) || name === normalizeSkillNameKey(skillName)
}

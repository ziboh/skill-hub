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
}

export function getSkillIdentityKey(skill: SkillIdentityLike): string {
  return normalizeSkillNameKey(skill.canonicalId || skill.id)
}

export function skillsShareIdentity(a: SkillIdentityLike, b: SkillIdentityLike): boolean {
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

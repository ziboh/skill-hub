/** Shared skill name identity: normalize, display name, dedupe, install match. */

export function normalizeSkillNameKey(name: string | null | undefined): string {
  if (name == null) return ''
  return String(name).trim().toLowerCase()
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

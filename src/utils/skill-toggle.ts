export const ACTIVE_SKILL_FILE_NAME = 'SKILL.md'
export const DISABLED_SKILL_FILE_NAME = 'SKILL.md.disabled'

function skillFilePath(skillDir: string, fileName: string): string {
  return window.services.pathJoin(skillDir, fileName)
}

export function getDisabledSkillFilePath(skillDir: string): string {
  return skillFilePath(skillDir, DISABLED_SKILL_FILE_NAME)
}

export function getSkillEnabledState(skillDir: string): boolean | null {
  if (window.services.pathExists(skillFilePath(skillDir, ACTIVE_SKILL_FILE_NAME))) return true
  if (window.services.pathExists(getDisabledSkillFilePath(skillDir))) return false
  return null
}

export function isSkillEnabled(skill: { enabled?: boolean; dir?: string }): boolean {
  if (skill.enabled !== undefined) return skill.enabled !== false
  if (!skill.dir) return true
  return getSkillEnabledState(skill.dir) !== false
}

export function toggleSkillEnabled(skillDir: string, enabled: boolean): { enabled: boolean; path: string } {
  return window.services.setSkillEnabled(skillDir, enabled)
}

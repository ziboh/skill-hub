import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  DISABLED_SKILL_FILE_NAME,
  getDisabledSkillFilePath,
  getSkillEnabledState,
  toggleSkillEnabled,
} from '../skill-toggle'

const services = {
  pathJoin: vi.fn((...parts: string[]) => parts.join('/')),
  pathExists: vi.fn(),
  setSkillEnabled: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as any).services = services
})

describe('skill-toggle', () => {
  it('uses a non-standard filename for disabled regular skills', () => {
    expect(DISABLED_SKILL_FILE_NAME).not.toBe('SKILL.md')
    expect(getDisabledSkillFilePath('C:/project/.agents/skills/demo')).toBe(
      'C:/project/.agents/skills/demo/SKILL.md.disabled',
    )
  })

  it('detects enabled, disabled and unknown skill states from the directory', () => {
    services.pathExists.mockImplementation((file: string) => file.endsWith('/SKILL.md'))
    expect(getSkillEnabledState('C:/skill')).toBe(true)

    services.pathExists.mockImplementation((file: string) => file.endsWith('/SKILL.md.disabled'))
    expect(getSkillEnabledState('C:/skill')).toBe(false)

    services.pathExists.mockReturnValue(false)
    expect(getSkillEnabledState('C:/skill')).toBe(null)
  })

  it('delegates the toggle to the preload service and returns the next state', () => {
    services.setSkillEnabled.mockReturnValue({ enabled: false })
    expect(toggleSkillEnabled('C:/skill', false)).toEqual({ enabled: false })
    expect(services.setSkillEnabled).toHaveBeenCalledWith('C:/skill', false)
  })
})

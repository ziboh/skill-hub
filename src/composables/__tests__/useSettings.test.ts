import { describe, test, expect, beforeEach } from 'vitest'
import { useSettings } from '../useSettings'

beforeEach(() => {
  window.ztools.dbStorage.clear()
})

function resetToDefaults() {
  const { updateSettings } = useSettings()
  updateSettings({
    themeMode: 'auto',
    themeColor: 'blue',
    fontSize: 'medium',
    motionPreference: 'standard',
    compactMode: false,
    defaultInstallMode: 'copy',
    githubToken: '',
    theme: 'auto',
    aiModels: [],
    translationModelId: '',
    autoTranslate: false,
  })
}

describe('useSettings', () => {
  test('settings has default values', () => {
    const { settings } = useSettings()
    expect(settings.themeMode).toBe('auto')
    expect(settings.themeColor).toBe('blue')
    expect(settings.fontSize).toBe('medium')
    expect(settings.defaultInstallMode).toBe('copy')
  })

  test('updateSettings patches values', () => {
    const { settings, updateSettings } = useSettings()
    updateSettings({ themeColor: 'purple' })
    expect(settings.themeColor).toBe('purple')
  })

  test('updateSettings persists to storage', () => {
    const { updateSettings } = useSettings()
    updateSettings({ defaultInstallMode: 'symlink' })
    const saved = JSON.parse(window.ztools.dbStorage.getItem('sm_settings')!)
    expect(saved.defaultInstallMode).toBe('symlink')
  })

  test('multiple updates merge correctly', () => {
    const { settings, updateSettings } = useSettings()
    updateSettings({ themeColor: 'green' })
    updateSettings({ fontSize: 'large' })
    expect(settings.themeColor).toBe('green')
    expect(settings.fontSize).toBe('large')
  })

  test('state is shared across calls', () => {
    const { updateSettings } = useSettings()
    updateSettings({ themeColor: 'red' })
    const { settings } = useSettings()
    expect(settings.themeColor).toBe('red')
  })
})

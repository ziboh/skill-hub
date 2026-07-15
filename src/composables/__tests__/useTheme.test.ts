import { describe, test, expect, beforeEach } from 'vitest'
import { useTheme } from '../useTheme'
import { useSettings } from '../useSettings'

beforeEach(() => {
  window.ztools.dbStorage.clear()
  const { updateSettings } = useSettings()
  updateSettings({
    themeMode: 'light',
    themeColor: 'blue',
    fontSize: 'medium',
    motionPreference: 'standard',
    compactMode: false,
    defaultInstallMode: 'copy',
    githubToken: '',
    aiModels: [],
    translationModelId: '',
    autoTranslate: false,
  })
})

describe('useTheme', () => {
  test('isDarkMode is false when themeMode is light', () => {
    const { isDarkMode } = useTheme()
    expect(isDarkMode.value).toBe(false)
  })

  test('isDarkMode is true when themeMode is dark', () => {
    const { updateSettings } = useSettings()
    updateSettings({ themeMode: 'dark' })
    const { isDarkMode } = useTheme()
    expect(isDarkMode.value).toBe(true)
  })

  test('isDarkMode respects auto mode with matchMedia', () => {
    window.matchMedia = (query: string) => ({
      matches: query === '(prefers-color-scheme: dark)',
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
      media: query,
      onchange: null,
    })
    const { updateSettings } = useSettings()
    updateSettings({ themeMode: 'auto' })
    const { isDarkMode } = useTheme()
    expect(isDarkMode.value).toBe(true)
  })

  test('toggleTheme switches from light to dark', () => {
    const { isDarkMode, toggleTheme } = useTheme()
    expect(isDarkMode.value).toBe(false)
    toggleTheme()
    expect(isDarkMode.value).toBe(true)
  })

  test('toggleTheme switches from dark to light', () => {
    const { updateSettings } = useSettings()
    updateSettings({ themeMode: 'dark' })
    const { isDarkMode, toggleTheme } = useTheme()
    expect(isDarkMode.value).toBe(true)
    toggleTheme()
    expect(isDarkMode.value).toBe(false)
  })
})

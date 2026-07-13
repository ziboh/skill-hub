import type { AppSettings, ModelConfig } from '../../types'
import { BUILTIN_PROVIDERS } from '../../data/ai-providers'
import { KEYS, dbGet, dbSet } from './core'

function initBuiltinProviders(): ModelConfig[] {
  return BUILTIN_PROVIDERS.map((p) => ({
    id: `builtin-${p.id}`,
    name: p.name,
    provider: p.id,
    baseUrl: p.defaultBaseUrl,
    apiPath: p.defaultApiPath,
    apiKeys: [],
    model: '',
    isDefault: false,
    isBuiltin: true,
    enabled: false,
    models: [],
    icon: p.icon,
  }))
}

export const settingsApi = {
  getSettings(): AppSettings {
    const defaults: AppSettings = {
      defaultInstallMode: 'copy',
      githubToken: '',
      theme: 'auto',
      themeMode: 'auto',
      themeColor: 'blue',
      fontSize: 'medium',
      motionPreference: 'standard',
      compactMode: false,
      aiModels: [],
      translationModelId: '',
      autoTranslate: false,
      translationTimeout: 300,
      resumeTranslation: true,
      showDataManagement: false,
      translationExtraBody: {},
      mySkillsSort: 'default',
    }
    let saved: Partial<AppSettings> | null = null
    try {
      saved = dbGet<Partial<AppSettings>>(KEYS.SETTINGS)
    } catch {
      console.warn('[storage] failed to read settings, using defaults')
    }
    if (saved?.aiModels) {
      const activeIds = new Set(BUILTIN_PROVIDERS.map((p) => p.id))
      saved.aiModels = saved.aiModels.filter((m) => !m.isBuiltin || activeIds.has(m.provider))
    }
    const merged = { ...defaults, ...(saved || {}) }
    if (!Array.isArray(merged.aiModels) || merged.aiModels.length === 0) {
      merged.aiModels = initBuiltinProviders()
    } else {
      const existingIds = new Set(merged.aiModels.map((m) => m.id))
      const builtinProviders = initBuiltinProviders()
      for (const bp of builtinProviders) {
        if (!existingIds.has(bp.id)) {
          merged.aiModels.push(bp)
        }
      }
    }
    return merged
  },
  saveSettings(settings: Partial<AppSettings>): void {
    const current = settingsApi.getSettings()
    const merged = { ...current, ...settings }
    dbSet(KEYS.SETTINGS, merged)
  },
}

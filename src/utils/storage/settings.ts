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

function createDefaultSettings(): AppSettings {
  return {
    defaultInstallMode: 'copy',
    githubToken: '',
    storeCacheEnabled: true,
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
}

function pickKnownSettings(value: unknown, defaults: AppSettings): Partial<AppSettings> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const source = value as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(defaults)) {
    if (Object.prototype.hasOwnProperty.call(source, key)) result[key] = source[key]
  }
  return result as Partial<AppSettings>
}

function hasUnknownSettings(value: unknown, defaults: AppSettings): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.keys(value).some((key) => !Object.prototype.hasOwnProperty.call(defaults, key))
}

export const settingsApi = {
  getSettings(): AppSettings {
    const defaults = createDefaultSettings()
    let rawSaved: unknown = null
    try {
      rawSaved = dbGet(KEYS.SETTINGS)
    } catch {
      console.warn('[storage] failed to read settings, using defaults')
    }
    const saved = pickKnownSettings(rawSaved, defaults)
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
    if (hasUnknownSettings(rawSaved, defaults)) dbSet(KEYS.SETTINGS, merged)
    return merged
  },
  saveSettings(settings: Partial<AppSettings>): void {
    const current = settingsApi.getSettings()
    const merged = { ...current, ...pickKnownSettings(settings, createDefaultSettings()) }
    dbSet(KEYS.SETTINGS, merged)
  },
}

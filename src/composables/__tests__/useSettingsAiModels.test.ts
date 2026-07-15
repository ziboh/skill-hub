import { beforeEach, describe, expect, test, vi } from 'vitest'
import { useSettings } from '../useSettings'
import { useSettingsAiModels } from '../useSettingsAiModels'

describe('useSettingsAiModels', () => {
  beforeEach(() => {
    const { updateSettings } = useSettings()
    updateSettings({
      translationModelId: '',
      aiModels: [],
    })
  })

  test('does not accept a legacy provider id as the translation model id', () => {
    const { updateSettings } = useSettings()
    updateSettings({
      translationModelId: 'provider-1',
      aiModels: [
        {
          id: 'provider-1',
          name: 'Provider 1',
          provider: 'openai',
          baseUrl: '',
          apiPath: '',
          apiKeys: [],
          model: '',
          isDefault: false,
          isBuiltin: false,
          enabled: true,
          models: [{ id: 'model-1', name: 'Model 1', enabled: true }],
        },
      ],
    })

    const { hasValidTranslationModel } = useSettingsAiModels(vi.fn())

    expect(hasValidTranslationModel.value).toBe(false)
  })
})

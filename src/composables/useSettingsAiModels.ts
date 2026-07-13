import { ref, computed } from 'vue'
import { BUILTIN_PROVIDERS, getProviderInfo } from '../data/ai-providers'
import type { AppSettings, ModelConfig } from '../types'
import { useSettings } from './useSettings'
import { fetchAvailableModels, chatCompletion } from '../utils/ai'
import type { QuickSwitcherItem } from '../components/QuickSwitcher.vue'

type ShowToast = (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void

export interface ModelGroup {
  name: string
  models: Array<{ id: string; name: string; enabled: boolean; owned_by?: string; capabilities?: string[] }>
}

export function useSettingsAiModels(showToast: ShowToast) {
  const { settings, updateSettings } = useSettings()

  const confirmDeleteProviderId = ref<string | null>(null)
  const confirmDeleteProviderName = ref('')
  const confirmDeleteApiKey = ref<string | null>(null)
  const confirmDeleteApiKeyLabel = ref('')
  const confirmDeleteGroup = ref<string | null>(null)
  const confirmDeleteGroupLabel = ref('')
  const confirmDeleteModel = ref<string | null>(null)
  const confirmDeleteModelLabel = ref('')

  // === AI Model Management ===
  const showAddModelModal = ref(false)
  const addModelTargetIndex = ref<number | null>(null)
  const newModelName = ref('')
  const newModelCustomName = ref('')

  const showModelModal = ref(false)
  const editingModelIndex = ref<number | null>(null)
  const modelForm = ref<ModelConfig>({
    id: '',
    name: '',
    provider: 'openai',
    baseUrl: '',
    apiPath: '',
    apiKeys: [],
    model: '',
    isDefault: false,
    isBuiltin: false,
    enabled: true,
    models: [],
    icon: '',
  })
  const modelExtraBodyText = ref('')
  const modelExtraBodyError = ref('')
  const translationExtraBodyText = ref('')
  const translationExtraBodyError = ref('')
  const translationTimeoutError = ref('')
  const providerExtraBodyTexts = ref<Record<string, string>>({})
  const providerExtraBodyErrors = ref<Record<string, string>>({})

  function objectToJsonString(obj: Record<string, any> | undefined | null): string {
    if (!obj || !Object.keys(obj).length) return ''
    try {
      return JSON.stringify(obj, null, 2)
    } catch {
      return ''
    }
  }

  function tryParseJson(text: string): Record<string, any> | null {
    if (!text.trim()) return {}
    try {
      const parsed = JSON.parse(text.trim())
      if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null
      }
      return parsed
    } catch {
      return null
    }
  }

  function getProviderExtraBodyText(providerId: string): string {
    if (providerExtraBodyTexts.value[providerId] !== undefined) {
      return providerExtraBodyTexts.value[providerId]
    }
    const provider = settings.aiModels.find((m) => m.id === providerId)
    return objectToJsonString(provider?.extraBody)
  }

  function onProviderExtraBodyInput(providerId: string, e: Event) {
    const text = (e.target as HTMLTextAreaElement).value
    providerExtraBodyTexts.value = { ...providerExtraBodyTexts.value, [providerId]: text }
    if (!text.trim()) {
      providerExtraBodyErrors.value = { ...providerExtraBodyErrors.value, [providerId]: '' }
      const models = [...settings.aiModels]
      const idx = models.findIndex((m) => m.id === providerId)
      if (idx >= 0) {
        const updated = { ...models[idx] }
        delete updated.extraBody
        models[idx] = updated
        updateSettings({ aiModels: models })
      }
      return
    }
    const parsed = tryParseJson(text)
    if (parsed === null) {
      providerExtraBodyErrors.value = { ...providerExtraBodyErrors.value, [providerId]: 'JSON 格式无效' }
    } else {
      providerExtraBodyErrors.value = { ...providerExtraBodyErrors.value, [providerId]: '' }
      const models = [...settings.aiModels]
      const idx = models.findIndex((m) => m.id === providerId)
      if (idx >= 0) {
        models[idx] = { ...models[idx], extraBody: parsed }
        updateSettings({ aiModels: models })
      }
    }
  }

  function _onModelExtraBodyInput(e: Event) {
    const text = (e.target as HTMLTextAreaElement).value
    modelExtraBodyText.value = text
    if (!text.trim()) {
      modelExtraBodyError.value = ''
      modelForm.value.extraBody = undefined
      delete modelForm.value.extraBody
      return
    }
    const parsed = tryParseJson(text)
    if (parsed === null) {
      modelExtraBodyError.value = 'JSON 格式无效'
    } else {
      modelExtraBodyError.value = ''
      modelForm.value.extraBody = parsed
    }
  }

  function onTranslationExtraBodyInput(e: Event) {
    const text = (e.target as HTMLTextAreaElement).value
    translationExtraBodyText.value = text
    if (!text.trim()) {
      translationExtraBodyError.value = ''
      updateSettings({ translationExtraBody: undefined })
      return
    }
    const parsed = tryParseJson(text)
    if (parsed === null) {
      translationExtraBodyError.value = 'JSON 格式无效'
    } else {
      translationExtraBodyError.value = ''
      updateSettings({ translationExtraBody: parsed })
    }
  }

  function onTranslationTimeoutChange(e: Event) {
    const val = parseInt((e.target as HTMLInputElement).value)
    if (isNaN(val) || val < 10 || val > 3600) {
      translationTimeoutError.value = '请输入 10-3600 之间的数值'
      return
    }
    translationTimeoutError.value = ''
    updateSettings({ translationTimeout: val })
  }

  const showIconPicker = ref(false)
  const editingIconProviderId = ref<string | null>(null)
  const defaultProviderIcon = computed(() => {
    const providerId = editingIconProviderId.value
      ? settings.aiModels.find((m) => m.id === editingIconProviderId.value)?.provider || ''
      : modelForm.value.provider
    return getProviderInfo(providerId)?.icon || 'openai'
  })

  const currentIconValue = computed({
    get() {
      if (editingIconProviderId.value) {
        return settings.aiModels.find((m) => m.id === editingIconProviderId.value)?.icon || ''
      }
      return modelForm.value.icon
    },
    set(value: string) {
      if (editingIconProviderId.value) {
        const models = [...settings.aiModels]
        const idx = models.findIndex((m) => m.id === editingIconProviderId.value)
        if (idx >= 0) {
          models[idx] = { ...models[idx], icon: value }
          updateSettings({ aiModels: models })
        }
      } else {
        modelForm.value.icon = value
      }
    },
  })
  const showFetchModal = ref(false)
  const fetchModelsResult = ref<{ id: string; name: string; owned_by?: string }[]>([])
  const fetchLoading = ref(false)
  const fetchError = ref('')
  const selectedFetchIds = ref<Set<string>>(new Set())
  const fetchTargetIndex = ref<number | null>(null)
  const expandedFetchGroups = ref<Set<string>>(new Set())
  const fetchSearchQuery = ref('')
  const fetchFilteredModels = computed(() => {
    if (!fetchSearchQuery.value.trim()) return fetchModelsResult.value
    const q = fetchSearchQuery.value.toLowerCase()
    return fetchModelsResult.value.filter(
      (m) => m.id.toLowerCase().includes(q) || m.name?.toLowerCase().includes(q) || m.owned_by?.toLowerCase().includes(q),
    )
  })
  const fetchModelGroups = computed(() => {
    const groups: Record<string, { name: string; models: typeof fetchModelsResult.value }> = {}
    for (const m of fetchFilteredModels.value) {
      const g = m.owned_by || '其他'
      if (!groups[g]) groups[g] = { name: g, models: [] }
      groups[g].models.push(m)
    }
    return Object.values(groups).sort((a, b) => (a.name === '其他' ? 1 : b.name === '其他' ? -1 : a.name.localeCompare(b.name)))
  })
  function toggleFetchGroup(name: string) {
    const s = new Set(expandedFetchGroups.value)
    if (s.has(name)) s.delete(name)
    else s.add(name)
    expandedFetchGroups.value = s
  }
  function toggleAllFetchGroups() {
    const allGroupNames = fetchModelGroups.value.map((g) => g.name)
    const allExpanded = allGroupNames.every((n) => expandedFetchGroups.value.has(n))
    expandedFetchGroups.value = allExpanded ? new Set() : new Set(allGroupNames)
  }
  function handleFetchModelToggle(id: string) {
    const s = new Set(selectedFetchIds.value)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    selectedFetchIds.value = s
  }
  function toggleFetchGroupSelection(group: { name: string; models: { id: string }[] }) {
    const allSelected = group.models.every((m) => selectedFetchIds.value.has(m.id))
    const s = new Set(selectedFetchIds.value)
    for (const m of group.models) {
      if (allSelected) s.delete(m.id)
      else s.add(m.id)
    }
    selectedFetchIds.value = s
  }
  const GROUP_COLORS = ['#4ade80', '#60a5fa', '#f472b6', '#a78bfa', '#fbbf24', '#34d399', '#f87171', '#818cf8', '#fb923c', '#22d3ee']
  function getGroupColor(name: string): string {
    let hash = 0
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
    return GROUP_COLORS[Math.abs(hash) % GROUP_COLORS.length]
  }
  const testResult = ref<{ index: number; success: boolean; message: string } | null>(null)
  const modelTestResults = ref<Record<string, { success: boolean; message: string } | 'loading'>>({})

  const showApiKeyModal = ref(false)
  const editingKeyIndex = ref<number | null>(null)
  const editingProviderIndex = ref<number | null>(null)
  const apiKeyForm = ref({ key: '' })

  function maskKey(key: string): string {
    if (!key) return '未配置'
    if (key.length <= 4) return key + '*'.repeat(12)
    return key.substring(0, 4) + '*'.repeat(Math.min(key.length - 4, 12))
  }

  function _maskUrl(url: string): string {
    if (!url) return ''
    try {
      const u = new URL(url)
      return (
        u.protocol + '//' + u.hostname + (u.port ? ':' + u.port : '') + (u.pathname.length > 1 ? u.pathname.substring(0, 20) + '...' : '')
      )
    } catch {
      return url.length > 30 ? url.substring(0, 30) + '...' : url
    }
  }

  function _getModelUrl(model: any): string {
    const base = (model.baseUrl || '').replace(/\/+$/, '')
    const path = model.apiPath || '/v1/chat/completions'
    return `${base}${path}`
  }

  function _getModelsEndpoint(model: any): string {
    const base = (model.baseUrl || '').replace(/\/+$/, '')
    return `${base}/v1/models`
  }

  function expandAllGroups(providerId: string) {
    const provider = settings.aiModels.find((m) => m.id === providerId)
    if (provider?.models) {
      const groups = groupModels(provider.models)
      const newSet = new Set(groups.map((g) => g.name))
      expandedGroups.value[providerId] = newSet
    }
  }

  function toggleAllModels(provider: any) {
    if (!provider.models) return
    const allEnabled = provider.models.every((m: any) => m.enabled)
    provider.models.forEach((m: any) => (m.enabled = !allEnabled))
    updateSettings({ aiModels: [...settings.aiModels] })
  }

  function _startEditApiKey(provider: any) {
    showApiKey.value[provider.id] = true
  }

  function addApiKey(providerIndex: number) {
    editingProviderIndex.value = providerIndex
    editingKeyIndex.value = null
    apiKeyForm.value = { key: '' }
    showApiKeyModal.value = true
  }

  function editApiKey(providerIndex: number, keyIndex: number) {
    editingProviderIndex.value = providerIndex
    editingKeyIndex.value = keyIndex
    apiKeyForm.value = { key: settings.aiModels[providerIndex].apiKeys[keyIndex].key }
    showApiKeyModal.value = true
  }

  function saveApiKey() {
    if (editingProviderIndex.value === null) return
    const provider = settings.aiModels[editingProviderIndex.value]
    if (!provider.apiKeys) provider.apiKeys = []

    if (editingKeyIndex.value !== null) {
      provider.apiKeys[editingKeyIndex.value].key = apiKeyForm.value.key
    } else {
      const hasEnabled = provider.apiKeys.some((k) => k.enabled)
      provider.apiKeys.push({
        id: 'key-' + Date.now(),
        key: apiKeyForm.value.key,
        enabled: !hasEnabled,
      })
    }
    updateSettings({ aiModels: [...settings.aiModels] })
    showApiKeyModal.value = false
    showToast('密钥已保存', 'success')
  }

  function deleteApiKey(providerIndex: number, keyIndex: number) {
    const provider = settings.aiModels[providerIndex]
    const wasEnabled = provider.apiKeys[keyIndex].enabled
    provider.apiKeys.splice(keyIndex, 1)
    if (wasEnabled && provider.apiKeys.length > 0) {
      provider.apiKeys[0].enabled = true
    }
    updateSettings({ aiModels: [...settings.aiModels] })
    confirmDeleteApiKey.value = null
    showToast('密钥已删除', 'success')
  }

  function toggleApiKeyEnabled(providerIndex: number, keyIndex: number) {
    const provider = settings.aiModels[providerIndex]
    const target = provider.apiKeys[keyIndex]
    target.enabled = !target.enabled
    updateSettings({ aiModels: [...settings.aiModels] })
  }

  function _getActiveApiKey(provider: any): string {
    return provider.apiKeys?.find((k: any) => k.enabled)?.key || ''
  }

  const showApiKey = ref<Record<string, boolean>>({})
  const expandedSections = ref<Record<string, { apiInfo: boolean; models: boolean }>>({})

  function openAddModel() {
    editingModelIndex.value = null
    modelForm.value = {
      id: 'custom-' + Date.now(),
      name: '',
      provider: 'openai',
      baseUrl: '',
      apiPath: '',
      apiKeys: [],
      model: '',
      isDefault: false,
      isBuiltin: false,
      enabled: true,
      models: [],
      icon: '',
    }
    modelExtraBodyText.value = ''
    modelExtraBodyError.value = ''
    applyProviderPreset()
    showModelModal.value = true
  }

  function openEditModel(index: number) {
    editingModelIndex.value = index
    const m = settings.aiModels[index]
    modelForm.value = { ...m, models: m.models ? [...m.models] : [], apiKeys: m.apiKeys ? [...m.apiKeys] : [] }
    modelExtraBodyText.value = objectToJsonString(m.extraBody)
    modelExtraBodyError.value = ''
    showModelModal.value = true
  }

  function applyProviderPreset() {
    const info = getProviderInfo(modelForm.value.provider)
    if (info) {
      modelForm.value.baseUrl = info.defaultBaseUrl
      modelForm.value.apiPath = info.defaultApiPath
      modelForm.value.icon = info.icon
    }
  }

  function saveModel() {
    if (!modelForm.value.name.trim()) return
    if (!modelForm.value.provider) {
      showToast('请选择供应商类型', 'error')
      return
    }
    // Auto-fill API path from preset if empty
    if (!modelForm.value.apiPath.trim()) {
      const info = getProviderInfo(modelForm.value.provider)
      if (info) {
        modelForm.value.apiPath = info.defaultApiPath
      }
    }
    const models = [...settings.aiModels]
    if (editingModelIndex.value !== null) {
      models[editingModelIndex.value] = { ...modelForm.value }
    } else {
      if (!models.length) modelForm.value.isDefault = true
      models.push({ ...modelForm.value })
    }
    updateSettings({ aiModels: models })
    showModelModal.value = false
    showToast(editingModelIndex.value !== null ? '供应商已更新' : '供应商已添加', 'success')
  }

  function _deleteModel(index: number) {
    const models = settings.aiModels.filter((_, i) => i !== index)
    if (models.length && !models.some((m) => m.isDefault)) {
      models[0].isDefault = true
    }
    const deletedProviderId = settings.aiModels[index]?.id
    if (settings.translationModelId === deletedProviderId || settings.translationModelId.startsWith(deletedProviderId + '::')) {
      updateSettings({ aiModels: models, translationModelId: models.find((m) => m.isDefault)?.id || '' })
    } else {
      updateSettings({ aiModels: models })
    }
  }

  function deleteModelFromProvider(providerIndex: number, modelId: string) {
    const models = [...settings.aiModels]
    const provider = { ...models[providerIndex] }
    provider.models = (provider.models || []).filter((m) => m.id !== modelId)
    models[providerIndex] = provider
    const compoundKey = provider.id + '::' + modelId
    if (settings.translationModelId === modelId || settings.translationModelId === compoundKey) {
      updateSettings({ aiModels: models, translationModelId: '' })
    } else {
      updateSettings({ aiModels: models })
    }
    confirmDeleteModel.value = null
  }

  function toggleGroupModels(providerIndex: number, groupName: string) {
    const models = [...settings.aiModels]
    const m = { ...models[providerIndex] }
    const groupModels = (m.models || []).filter((mm) => (mm.owned_by || '其他') === groupName)
    const allEnabled = groupModels.every((mm) => mm.enabled)
    const newEnabled = !allEnabled
    m.models = (m.models || []).map((mm) => ((mm.owned_by || '其他') === groupName ? { ...mm, enabled: newEnabled } : mm))
    models[providerIndex] = m
    const patch: Partial<AppSettings> = { aiModels: models }
    if (
      !newEnabled &&
      settings.translationModelId &&
      groupModels.some((mm) => settings.translationModelId === mm.id || settings.translationModelId === m.id + '::' + mm.id)
    ) {
      patch.translationModelId = ''
    }
    updateSettings(patch)
  }

  function deleteGroupModels(providerIndex: number, groupName: string) {
    const models = [...settings.aiModels]
    const m = { ...models[providerIndex] }
    const deletedIds = new Set((m.models || []).filter((mm) => (mm.owned_by || '其他') === groupName).map((mm) => mm.id))
    const deletedCompoundKeys = new Set(
      (m.models || []).filter((mm) => (mm.owned_by || '其他') === groupName).map((mm) => m.id + '::' + mm.id),
    )
    m.models = (m.models || []).filter((mm) => (mm.owned_by || '其他') !== groupName)
    models[providerIndex] = m
    const patch: Partial<AppSettings> = { aiModels: models }
    if (
      settings.translationModelId &&
      (deletedIds.has(settings.translationModelId) || deletedCompoundKeys.has(settings.translationModelId))
    ) {
      patch.translationModelId = ''
    }
    updateSettings(patch)
    confirmDeleteGroup.value = null
  }

  function deleteProvider(id: string) {
    const provider = settings.aiModels.find((m) => m.id === id)
    if (provider?.isBuiltin) {
      showToast('内置供应商不能删除', 'error')
      return
    }
    const models = settings.aiModels.filter((m) => m.id !== id)
    if (models.length && !models.some((m) => m.isDefault)) {
      models[0].isDefault = true
    }
    if (settings.translationModelId === id || settings.translationModelId.startsWith(id + '::')) {
      updateSettings({ aiModels: models, translationModelId: models.find((m) => m.isDefault)?.id || '' })
    } else {
      updateSettings({ aiModels: models })
    }
    confirmDeleteProviderId.value = null
    showToast('供应商已删除', 'success')
  }

  function doDeleteApiKey() {
    const key = confirmDeleteApiKey.value
    confirmDeleteApiKey.value = null
    if (!key) return
    const lastDash = key.lastIndexOf('-')
    const providerId = key.substring(0, lastDash)
    const ki = parseInt(key.substring(lastDash + 1))
    const idx = settings.aiModels.findIndex((m) => m.id === providerId)
    if (idx >= 0) deleteApiKey(idx, ki)
  }

  function doDeleteGroup() {
    const key = confirmDeleteGroup.value
    confirmDeleteGroup.value = null
    if (!key) return
    const lastDash = key.lastIndexOf('-')
    const providerId = key.substring(0, lastDash)
    const groupName = key.substring(lastDash + 1)
    const idx = settings.aiModels.findIndex((m) => m.id === providerId)
    if (idx >= 0) deleteGroupModels(idx, groupName)
  }

  function doDeleteModel() {
    const modelId = confirmDeleteModel.value
    confirmDeleteModel.value = null
    if (!modelId) return
    const sepIdx = modelId.lastIndexOf('::')
    if (sepIdx >= 0) {
      const providerId = modelId.substring(0, sepIdx)
      const innerModelId = modelId.substring(sepIdx + 2)
      const idx = settings.aiModels.findIndex((m) => m.id === providerId)
      if (idx >= 0) deleteModelFromProvider(idx, innerModelId)
    } else {
      settings.aiModels.forEach((m, i) => {
        if (m.models?.some((mm: any) => mm.id === modelId)) deleteModelFromProvider(i, modelId)
      })
    }
  }

  function _setDefaultModel(index: number) {
    const models = settings.aiModels.map((m, i) => ({ ...m, isDefault: i === index }))
    updateSettings({ aiModels: models })
  }

  function setTranslationModel(modelId: string) {
    updateSettings({ translationModelId: modelId })
  }

  function _getTranslationModelName(): string {
    if (!settings.translationModelId) {
      return '未配置'
    }
    const sepIdx = settings.translationModelId.lastIndexOf('::')
    if (sepIdx >= 0) {
      const providerId = settings.translationModelId.substring(0, sepIdx)
      const modelId = settings.translationModelId.substring(sepIdx + 2)
      const provider = settings.aiModels.find((m) => m.id === providerId)
      if (provider) {
        const model = provider.models?.find((m) => m.id === modelId)
        if (model) return `${model.name || model.id} (${provider.name || getProviderInfo(provider.provider)?.name})`
      }
      return '未找到'
    }
    // 兼容旧格式：按供应商 ID 查找
    const byProvider = settings.aiModels.find((m) => m.id === settings.translationModelId)
    if (byProvider) {
      return `${byProvider.name || getProviderInfo(byProvider.provider)?.name} (供应商)`
    }
    return '未找到'
  }

  async function openFetchModels(index: number) {
    let baseUrl = ''
    let apiKey = ''
    if (index === -1) {
      baseUrl = modelForm.value.baseUrl
      apiKey = modelForm.value.apiKeys?.find((k) => k.enabled)?.key || ''
    } else {
      const m = settings.aiModels[index]
      if (!m) return
      baseUrl = m.baseUrl
      apiKey = m.apiKeys?.find((k) => k.enabled)?.key || ''
    }
    if (!baseUrl || !apiKey) return
    fetchTargetIndex.value = index
    fetchLoading.value = true
    fetchError.value = ''
    const existingModels = index >= 0 ? settings.aiModels[index]?.models?.filter((m) => m.enabled).map((m) => m.id) : []
    selectedFetchIds.value = new Set(existingModels || [])
    try {
      const result = await fetchAvailableModels(baseUrl, apiKey)
      if (result.success) {
        fetchModelsResult.value = result.models
        expandedFetchGroups.value = new Set(result.models.map((m) => m.owned_by || '其他'))
        showFetchModal.value = true
      } else {
        fetchError.value = result.error || '获取失败'
        showToast(fetchError.value, 'error')
      }
    } catch (err: unknown) {
      fetchError.value = (err as any)?.message || '获取失败'
      showToast(fetchError.value, 'error')
    }
    fetchLoading.value = false
  }

  function confirmFetchModels() {
    if (!selectedFetchIds.value.size || fetchTargetIndex.value === null) return
    const selectedIds = Array.from(selectedFetchIds.value)
    if (fetchTargetIndex.value === -1) {
      const firstSelected = fetchModelsResult.value.find((m) => m.id === selectedIds[0])
      modelForm.value.model = firstSelected?.id || selectedIds[0]
      if (!modelForm.value.name) modelForm.value.name = firstSelected?.name || selectedIds[0]
      modelForm.value.models = fetchModelsResult.value
        .filter((m) => selectedIds.includes(m.id))
        .map((m) => ({
          id: m.id,
          name: m.name,
          enabled: true,
          owned_by: m.owned_by,
        }))
    } else {
      const models = [...settings.aiModels]
      const existing = models[fetchTargetIndex.value]
      const selectedModels = fetchModelsResult.value
        .filter((m) => selectedIds.includes(m.id))
        .map((m) => ({
          id: m.id,
          name: m.name,
          enabled: true,
          owned_by: m.owned_by,
        }))
      models[fetchTargetIndex.value] = {
        ...existing,
        models: selectedModels,
      }
      if (!existing.model && selectedModels.length) {
        models[fetchTargetIndex.value].model = selectedModels[0].id
      }
      updateSettings({ aiModels: models })
    }
    showFetchModal.value = false
  }

  async function _testModelConnection(index: number) {
    const m = settings.aiModels[index]
    if (!m.baseUrl || !m.apiKeys?.length || !m.model) return
    testResult.value = null
    try {
      await chatCompletion(m, [{ role: 'user', content: 'Reply with exactly: OK' }], { temperature: 0, maxTokens: 8 })
      testResult.value = { index, success: true, message: '连接成功 ✓' }
    } catch (err: unknown) {
      const errMsg = (err as any)?.message || '连接失败'
      const msg = errMsg === 'AI_AUTH_ERROR' ? '认证失败，请检查 API Key' : errMsg
      testResult.value = { index, success: false, message: msg }
    }
    setTimeout(() => {
      testResult.value = null
    }, 5000)
  }

  async function testSingleModel(providerIndex: number, modelId: string) {
    const key = `${providerIndex}-${modelId}`
    const m = settings.aiModels[providerIndex]
    if (!m.baseUrl || !m.apiKeys?.length) return
    modelTestResults.value = { ...modelTestResults.value, [key]: 'loading' }
    try {
      const testConfig = { ...m, model: modelId }
      await chatCompletion(testConfig, [{ role: 'user', content: 'Reply with exactly: OK' }], { temperature: 0, maxTokens: 8 })
      modelTestResults.value = { ...modelTestResults.value, [key]: { success: true, message: '可用 ✓' } }
    } catch (err: unknown) {
      const errMsg = (err as any)?.message || '连接失败'
      const msg = errMsg === 'AI_AUTH_ERROR' ? '认证失败' : errMsg
      modelTestResults.value = { ...modelTestResults.value, [key]: { success: false, message: msg } }
    }
    setTimeout(() => {
      const copy = { ...modelTestResults.value }
      delete copy[key]
      modelTestResults.value = copy
    }, 5000)
  }

  async function testAllModels(providerIndex: number) {
    const m = settings.aiModels[providerIndex]
    if (!m.baseUrl || !m.apiKeys?.length || !m.models?.length) return
    for (const model of m.models) {
      testSingleModel(providerIndex, model.id)
    }
  }

  function getModelTestKey(providerIndex: number, modelId: string): string {
    return `${providerIndex}-${modelId}`
  }

  function getModelTestResult(providerIndex: number, modelId: string) {
    return modelTestResults.value[getModelTestKey(providerIndex, modelId)]
  }

  function isModelTestLoading(providerIndex: number, modelId: string): boolean {
    return getModelTestResult(providerIndex, modelId) === 'loading'
  }

  function isModelTestSuccess(providerIndex: number, modelId: string): boolean {
    const r = getModelTestResult(providerIndex, modelId)
    return r !== undefined && r !== 'loading' && r.success === true
  }

  function isModelTestFail(providerIndex: number, modelId: string): boolean {
    const r = getModelTestResult(providerIndex, modelId)
    return r !== undefined && r !== 'loading' && r.success === false
  }

  function restoreBaseUrl(index: number) {
    const m = settings.aiModels[index]
    const info = getProviderInfo(m.provider)
    if (info) {
      const models = [...settings.aiModels]
      models[index] = { ...m, baseUrl: info.defaultBaseUrl, apiPath: info.defaultApiPath }
      updateSettings({ aiModels: models })
    }
  }

  function toggleModelEnabled(modelIndex: number, modelId: string) {
    const models = [...settings.aiModels]
    const m = { ...models[modelIndex] }
    const modelList = m.models ? [...m.models] : []
    const idx = modelList.findIndex((item) => item.id === modelId)
    if (idx >= 0) {
      modelList[idx] = { ...modelList[idx], enabled: !modelList[idx].enabled }
      m.models = modelList
      models[modelIndex] = m
      const patch: Partial<AppSettings> = { aiModels: models }
      const compoundKey = m.id + '::' + modelId
      if (!modelList[idx].enabled && (settings.translationModelId === modelId || settings.translationModelId === compoundKey)) {
        patch.translationModelId = ''
      }
      updateSettings(patch)
    }
  }

  function _toggleApiKeyVisibility(modelId: string) {
    showApiKey.value = { ...showApiKey.value, [modelId]: !showApiKey.value[modelId] }
  }

  async function copyApiKey(apiKey: string) {
    try {
      await navigator.clipboard.writeText(apiKey)
      showToast('已复制到剪贴板', 'success')
    } catch {
      showToast('复制失败', 'error')
    }
  }

  function toggleExpandedSection(modelId: string, section: 'apiInfo' | 'models') {
    const current = expandedSections.value[modelId] || { apiInfo: false, models: false }
    expandedSections.value = {
      ...expandedSections.value,
      [modelId]: { ...current, [section]: !current[section] },
    }
  }

  const enabledProviders = computed(() =>
    settings.aiModels
      .filter((m) => m.enabled && m.apiKeys?.some((k) => k.enabled) && m.models?.length)
      .sort((a, b) => (a.isBuiltin === b.isBuiltin ? 0 : a.isBuiltin ? 1 : -1)),
  )
  const allEnabledProviders = computed(() => settings.aiModels.filter((m) => m.enabled && m.models?.length))
  const hasValidTranslationModel = computed(() => {
    if (!settings.translationModelId) return false
    const sepIdx = settings.translationModelId.lastIndexOf('::')
    if (sepIdx >= 0) {
      const providerId = settings.translationModelId.substring(0, sepIdx)
      const modelId = settings.translationModelId.substring(sepIdx + 2)
      const provider = settings.aiModels.find((m) => m.id === providerId && m.enabled)
      if (!provider) return false
      return provider.models?.some((m) => m.id === modelId && m.enabled) ?? false
    }
    const provider = settings.aiModels.find((m) => m.id === settings.translationModelId && m.enabled)
    return !!provider
  })

  const translationModelItems = computed<QuickSwitcherItem[]>(() => {
    const items: QuickSwitcherItem[] = []
    for (const provider of allEnabledProviders.value) {
      for (const model of (provider.models || []).filter((m) => m.enabled)) {
        items.push({
          id: `${provider.id}::${model.id}`,
          label: model.name || model.id,
          subtitle: provider.name || getProviderInfo(provider.provider)?.name || '',
        })
      }
    }
    return items
  })
  const pendingProviders = computed(() =>
    settings.aiModels
      .filter((m) => m.enabled && (!m.apiKeys?.some((k) => k.enabled) || !m.models?.length))
      .sort((a, b) => (a.isBuiltin === b.isBuiltin ? 0 : a.isBuiltin ? 1 : -1)),
  )
  const disabledProviders = computed(() =>
    settings.aiModels.filter((m) => !m.enabled).sort((a, b) => (a.isBuiltin === b.isBuiltin ? 0 : a.isBuiltin ? 1 : -1)),
  )

  function getModelIndex(id: string): number {
    return settings.aiModels.findIndex((m) => m.id === id)
  }

  function toggleProviderEnabled(provider: ModelConfig) {
    const models = [...settings.aiModels]
    const idx = models.findIndex((m) => m.id === provider.id)
    if (idx >= 0) {
      models[idx] = { ...models[idx], enabled: !models[idx].enabled }
      updateSettings({ aiModels: models })
    }
  }

  function openIconPickerForProvider(providerId: string) {
    editingIconProviderId.value = providerId
    editingModelIndex.value = null
    showIconPicker.value = true
  }

  function openAddModelModal(providerIndex: number) {
    addModelTargetIndex.value = providerIndex
    newModelName.value = ''
    newModelCustomName.value = ''
    showAddModelModal.value = true
  }

  function saveNewModel() {
    if (!newModelName.value.trim() || addModelTargetIndex.value === null) return
    const models = [...settings.aiModels]
    const provider = models[addModelTargetIndex.value]
    const modelList = provider.models ? [...provider.models] : []
    const modelId = newModelName.value.trim()
    const existingIndex = modelList.findIndex((m) => m.id === modelId)
    if (existingIndex >= 0) {
      showToast('模型已存在', 'warning')
      return
    }
    modelList.push({
      id: modelId,
      name: newModelCustomName.value.trim() || modelId,
      enabled: true,
    })
    models[addModelTargetIndex.value] = { ...provider, models: modelList }
    updateSettings({ aiModels: models })
    showAddModelModal.value = false
    showToast('模型已添加', 'success')
  }


  const expandedGroups = ref<Record<string, Set<string>>>({})

  function toggleGroup(providerId: string, groupName: string) {
    const current = expandedGroups.value[providerId] || new Set<string>()
    const newSet = new Set(current)
    if (newSet.has(groupName)) {
      newSet.delete(groupName)
    } else {
      newSet.add(groupName)
    }
    expandedGroups.value = { ...expandedGroups.value, [providerId]: newSet }
  }

  function groupModels(
    models: Array<{ id: string; name: string; enabled: boolean; owned_by?: string; capabilities?: string[] }>,
  ): ModelGroup[] {
    const groups: Record<string, ModelGroup> = {}

    for (const model of models) {
      const groupName = model.owned_by || '其他'

      if (!groups[groupName]) {
        groups[groupName] = { name: groupName, models: [] }
      }
      groups[groupName].models.push(model)
    }

    // Sort groups: named groups first (alphabetically), then "其他" last
    const sortedGroups = Object.values(groups).sort((a, b) => {
      if (a.name === '其他') return 1
      if (b.name === '其他') return -1
      return a.name.localeCompare(b.name)
    })

    return sortedGroups
  }

  return {
    confirmDeleteProviderId,
    confirmDeleteProviderName,
    confirmDeleteApiKey,
    confirmDeleteApiKeyLabel,
    confirmDeleteGroup,
    confirmDeleteGroupLabel,
    confirmDeleteModel,
    confirmDeleteModelLabel,
    showAddModelModal,
    addModelTargetIndex,
    newModelName,
    newModelCustomName,
    showModelModal,
    editingModelIndex,
    modelForm,
    modelExtraBodyText,
    modelExtraBodyError,
    translationExtraBodyText,
    translationExtraBodyError,
    translationTimeoutError,
    providerExtraBodyTexts,
    providerExtraBodyErrors,
    objectToJsonString,
    tryParseJson,
    getProviderExtraBodyText,
    onProviderExtraBodyInput,
    onTranslationExtraBodyInput,
    onTranslationTimeoutChange,
    showIconPicker,
    editingIconProviderId,
    defaultProviderIcon,
    currentIconValue,
    showFetchModal,
    fetchModelsResult,
    fetchLoading,
    fetchError,
    selectedFetchIds,
    expandedFetchGroups,
    fetchSearchQuery,
    fetchFilteredModels,
    fetchModelGroups,
    toggleFetchGroup,
    toggleAllFetchGroups,
    handleFetchModelToggle,
    toggleFetchGroupSelection,
    getGroupColor,
    testResult,
    modelTestResults,
    showApiKeyModal,
    editingKeyIndex,
    editingProviderIndex,
    apiKeyForm,
    maskKey,
    expandAllGroups,
    toggleAllModels,
    addApiKey,
    editApiKey,
    saveApiKey,
    deleteApiKey,
    toggleApiKeyEnabled,
    showApiKey,
    expandedSections,
    openAddModel,
    openEditModel,
    applyProviderPreset,
    saveModel,
    deleteModelFromProvider,
    toggleGroupModels,
    deleteGroupModels,
    deleteProvider,
    doDeleteApiKey,
    doDeleteGroup,
    doDeleteModel,
    setTranslationModel,
    openFetchModels,
    confirmFetchModels,
    testSingleModel,
    testAllModels,
    getModelTestKey,
    getModelTestResult,
    isModelTestLoading,
    isModelTestSuccess,
    isModelTestFail,
    restoreBaseUrl,
    toggleModelEnabled,
    copyApiKey,
    toggleExpandedSection,
    enabledProviders,
    allEnabledProviders,
    hasValidTranslationModel,
    translationModelItems,
    pendingProviders,
    disabledProviders,
    getModelIndex,
    toggleProviderEnabled,
    openIconPickerForProvider,
    openAddModelModal,
    saveNewModel,
    expandedGroups,
    toggleGroup,
    groupModels,
    BUILTIN_PROVIDERS,
    getProviderInfo,
  }
}

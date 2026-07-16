import { reactive, inject } from 'vue'
import type { AppSettings } from '../types'
import { storage } from '../utils/storage'
import { applyTheme } from '../utils/theme'
import { KeyShowToast, type ShowToast } from '../inject-keys'

const state = reactive<AppSettings>(storage.getSettings())

function patch(patch: Partial<AppSettings>, showToast: ShowToast) {
  const previous = { ...state }
  const next = { ...state, ...patch }
  Object.assign(state, next)
  try {
    if (!storage.saveSettings(next)) {
      Object.assign(state, previous)
      showToast({ type: 'error', message: '设置保存失败，请稍后重试' })
      return
    }
  } catch (e) {
    console.error('[useSettings] saveSettings failed:', e)
    Object.assign(state, previous)
    showToast({ type: 'error', message: '设置保存失败，请稍后重试' })
    return
  }
  applyTheme(next)
}

export function useSettings() {
  const showToast = inject(KeyShowToast, () => {})
  return { settings: state, updateSettings: (next: Partial<AppSettings>) => patch(next, showToast) }
}

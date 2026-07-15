<script setup lang="ts">
import { ref, onMounted, onActivated, computed, inject, provide, watch, nextTick } from 'vue'
import { KeyShowToast, KeyToggleTheme, KeyIsDarkMode } from '../../inject-keys'
import {
  getAllPlatformDefinitions,
  getDefaultPlatformOrder,
  createCustomPlatformId,
  platformDisplayIcon,
  isBuiltinPlatformId,
} from '../../data/platforms'
import { storage } from '../../utils/storage'
import { getMandiThemes, hexToHsl } from '../../utils/theme'
import type { PlatformInfo, ThemeMode, FontSize, MotionPreference, ToastPosition } from '../../types'
import { MORANDI_THEMES } from '../../types'
import { useSettings } from '../../composables/useSettings'
import { useTheme } from '../../composables/useTheme'
import { useSettingsAiModels } from '../../composables/useSettingsAiModels'
import ProviderIcon from '../../components/ProviderIcon.vue'
import UiIcon, { type UiIconName } from '../../components/UiIcon.vue'
import StoreIconPicker from '../../components/StoreIconPicker.vue'
import ConfirmModal from '../../components/ConfirmModal.vue'
import CleanupSelectModal from '../../components/CleanupSelectModal.vue'
import QuickSwitcher from '../../components/QuickSwitcher.vue'
import AddPlatformModal from '../../components/AddPlatformModal.vue'
import { syncAllowedWriteRoots } from '../../utils/write-roots'
import { useUnregisteredSkillsCleanup } from '../../composables/useUnregisteredSkillsCleanup'
import DataManagement from './DataManagement.vue'

const props = defineProps<{ anchor?: string }>()
const { settings, updateSettings } = useSettings()
const { isDarkMode, toggleTheme } = useTheme()
const showToast = inject(KeyShowToast, () => {})
provide(KeyToggleTheme, toggleTheme)
provide(KeyIsDarkMode, isDarkMode)

const activeSection = ref('general')
const showToken = ref(false)
const platforms = ref<PlatformInfo[]>([])
const customColorInput = ref('#58a4f6')
const sidebarWidth = ref(180)

const {
  showCleanupSelect,
  unregisteredDirs,
  cleanupResult,
  openCleanupSelect,
  onCleanupDeleted: onCleanupDeletedBase,
} = useUnregisteredSkillsCleanup()

function onCleanupDeleted(count: number) {
  onCleanupDeletedBase(count, showToast)
}

const {
  confirmDeleteProviderId,
  confirmDeleteProviderName,
  confirmDeleteApiKey,
  confirmDeleteApiKeyLabel,
  confirmDeleteGroup,
  confirmDeleteGroupLabel,
  confirmDeleteModel,
  confirmDeleteModelLabel,
  showAddModelModal,
  newModelName,
  newModelCustomName,
  showModelModal,
  editingModelIndex,
  modelForm,
  translationExtraBodyText,
  translationExtraBodyError,
  translationTimeoutError,
  providerExtraBodyErrors,
  objectToJsonString,
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
  fetchModelGroups,
  toggleFetchGroup,
  toggleAllFetchGroups,
  handleFetchModelToggle,
  toggleFetchGroupSelection,
  getGroupColor,
  showApiKeyModal,
  editingKeyIndex,
  apiKeyForm,
  maskKey,
  expandAllGroups,
  toggleAllModels,
  addApiKey,
  editApiKey,
  saveApiKey,
  toggleApiKeyEnabled,
  showApiKey,
  expandedSections,
  openAddModel,
  openEditModel,
  applyProviderPreset,
  saveModel,
  toggleGroupModels,
  deleteProvider,
  doDeleteApiKey,
  doDeleteGroup,
  doDeleteModel,
  setTranslationModel,
  openFetchModels,
  confirmFetchModels,
  testSingleModel,
  testAllModels,
  isModelTestLoading,
  isModelTestSuccess,
  isModelTestFail,
  restoreBaseUrl,
  toggleModelEnabled,
  copyApiKey,
  toggleExpandedSection,
  enabledProviders,
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
} = useSettingsAiModels(showToast)

// Sidebar resize
let isResizing = false

function startSidebarResize(e: MouseEvent | TouchEvent) {
  isResizing = true
  const startX = 'touches' in e ? e.touches[0].clientX : e.clientX
  const startWidth = sidebarWidth.value
  let rafId: number | null = null

  function onMove(ev: MouseEvent | TouchEvent) {
    if (!isResizing) return
    const cx = 'touches' in ev ? ev.touches[0].clientX : ev.clientX
    const delta = cx - startX
    if (rafId) cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(() => {
      sidebarWidth.value = Math.max(140, Math.min(280, startWidth + delta))
    })
  }

  function onEnd() {
    isResizing = false
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onEnd)
    document.removeEventListener('touchmove', onMove)
    document.removeEventListener('touchend', onEnd)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  document.addEventListener('mousemove', onMove, { passive: true })
  document.addEventListener('mouseup', onEnd)
  document.addEventListener('touchmove', onMove, { passive: true })
  document.addEventListener('touchend', onEnd)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

const sections: { id: string; label: string; icon: UiIconName }[] = [
  { id: 'general', label: '通用设置', icon: 'settings' },
  { id: 'appearance', label: '显示设置', icon: 'palette' },
  { id: 'ai', label: '模型设置', icon: 'cpu' },
  { id: 'default-model', label: '翻译设置', icon: 'globe' },
  { id: 'agent', label: 'Agent 设置', icon: 'bot' },
  { id: 'data', label: '数据管理', icon: 'database' },
]

const visibleSections = computed(() => {
  if (settings.showDataManagement) return sections
  return sections.filter((s) => s.id !== 'data')
})

watch(
  () => settings.showDataManagement,
  (val) => {
    if (!val && activeSection.value === 'data') {
      activeSection.value = 'general'
    }
  },
)

const themeModes: { id: ThemeMode; label: string; icon: UiIconName }[] = [
  { id: 'light', label: '浅色', icon: 'sun' },
  { id: 'dark', label: '深色', icon: 'moon' },
  { id: 'auto', label: '跟随系统', icon: 'monitor' },
]

const fontSizeOptions: { id: FontSize; label: string; size: string }[] = [
  { id: 'small', label: '小', size: '14px' },
  { id: 'medium', label: '中', size: '16px' },
  { id: 'large', label: '大', size: '18px' },
]

const motionOptions: { id: MotionPreference; label: string; desc: string }[] = [
  { id: 'off', label: '关闭', desc: '无动画' },
  { id: 'reduced', label: '减弱', desc: '最少动效' },
  { id: 'standard', label: '标准', desc: '完整动画' },
]

const toastPositionOptions: { id: ToastPosition; label: string }[] = [
  { id: 'center-bottom', label: '中间底部' },
  { id: 'center-top', label: '中间顶部' },
  { id: 'top-right', label: '右上角' },
]

const morandiThemes = getMandiThemes()

onMounted(() => {
  loadPlatforms()
  if (isCustomColor()) {
    customColorInput.value = settings.themeColor.startsWith('#') ? settings.themeColor : '#58a4f6'
  }
  translationExtraBodyText.value = objectToJsonString(settings.translationExtraBody)
  scrollToAnchor()
})

onActivated(() => {
  loadPlatforms()
  scrollToAnchor()
})

// Watch for anchor changes (e.g., when navigating from error link)
watch(
  () => props.anchor,
  () => {
    nextTick(scrollToAnchor)
  },
)

function scrollToAnchor() {
  if (props.anchor) {
    // Navigate to general section first
    activeSection.value = 'general'
    // Then scroll to the element
    nextTick(() => {
      const el = document.getElementById(props.anchor!)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // Add highlight effect
        el.classList.add('highlight-section')
        setTimeout(() => el.classList.remove('highlight-section'), 2000)
      }
    })
  }
}

const showAddPlatformModal = ref(false)
const editingPlatform = ref<PlatformInfo | null>(null)
const confirmDeletePlatformId = ref<string | null>(null)
const confirmDeletePlatformName = ref('')

function loadPlatforms() {
  platforms.value = getAllPlatformDefinitions()
  // Ensure order includes any new custom ids
  const allIds = platforms.value.map((p) => p.id)
  const missing = allIds.filter((id) => !platformOrder.value.includes(id))
  if (missing.length) {
    platformOrder.value = [...platformOrder.value, ...missing]
    savePlatformOrder()
  }
  // Drop order entries that no longer exist
  const idSet = new Set(allIds)
  const filtered = platformOrder.value.filter((id) => idSet.has(id))
  if (filtered.length !== platformOrder.value.length) {
    platformOrder.value = filtered
    savePlatformOrder()
  }
}

function openAddPlatform() {
  editingPlatform.value = null
  showAddPlatformModal.value = true
}

function onClosePlatformModal() {
  showAddPlatformModal.value = false
  editingPlatform.value = null
}

function openEditPlatform(p: PlatformInfo) {
  if (!isCustomPlatform(p)) return
  editingPlatform.value = { ...p }
  showAddPlatformModal.value = true
}

function isCustomPlatform(p: PlatformInfo): boolean {
  return !!(p.isCustom || !isBuiltinPlatformId(p.id))
}

function onPlatformSubmit(data: { id?: string; name: string; defaultPath: string; projectPath?: string; icon?: string }) {
  if (data.id && platforms.value.some((p) => p.id === data.id && isCustomPlatform(p))) {
    const idx = platforms.value.findIndex((p) => p.id === data.id)
    const prev = platforms.value[idx]
    platforms.value[idx] = {
      ...prev,
      name: data.name,
      defaultPath: data.defaultPath,
      projectPath: data.projectPath,
      customPath: undefined,
      icon: data.icon,
      isCustom: true,
    }
  } else {
    const id = createCustomPlatformId(data.name)
    const neu: PlatformInfo = {
      id,
      name: data.name,
      defaultPath: data.defaultPath,
      projectPath: data.projectPath,
      icon: data.icon,
      enabled: true,
      detected: false,
      isCustom: true,
    }
    platforms.value = [...platforms.value, neu]
    platformOrder.value = [...platformOrder.value, id]
    savePlatformOrder()
  }
  savePlatforms()
  loadPlatforms()
  showAddPlatformModal.value = false
  editingPlatform.value = null
  showToast({ type: 'success', message: data.id ? '平台已更新' : '平台已添加' })
}

function requestDeletePlatform(p: PlatformInfo) {
  if (!p.isCustom && isBuiltinPlatformId(p.id)) return
  confirmDeletePlatformId.value = p.id
  confirmDeletePlatformName.value = p.name
}

function confirmDeletePlatform() {
  const id = confirmDeletePlatformId.value
  if (!id) return
  platforms.value = platforms.value.filter((p) => p.id !== id)
  platformOrder.value = platformOrder.value.filter((x) => x !== id)
  savePlatformOrder()
  savePlatforms()
  confirmDeletePlatformId.value = null
  confirmDeletePlatformName.value = ''
  showToast({ type: 'success', message: '平台已删除' })
}

function setThemeMode(mode: ThemeMode) {
  updateSettings({ themeMode: mode })
}

function setFontSize(size: FontSize) {
  updateSettings({ fontSize: size })
}

function setMotion(pref: MotionPreference) {
  updateSettings({ motionPreference: pref })
}

function setToastPosition(position: ToastPosition) {
  updateSettings({ toastPosition: position })
  showToast({ type: 'success', message: '提示位置已更新' })
}

function setCompactMode(val: boolean) {
  updateSettings({ compactMode: val })
}

function savePlatforms() {
  // Persist: full custom platforms + overrides for builtins
  const toSave: PlatformInfo[] = platforms.value.map((p) => {
    if (p.isCustom || !isBuiltinPlatformId(p.id)) {
      return {
        id: p.id,
        name: p.name,
        defaultPath: p.defaultPath,
        projectPath: p.projectPath,
        customPath: p.customPath,
        customProjectPath: p.customProjectPath,
        icon: p.icon,
        enabled: p.enabled,
        detected: false,
        isCustom: true,
      }
    }
    return {
      id: p.id,
      name: p.name,
      defaultPath: p.defaultPath,
      enabled: p.enabled,
      detected: false,
      customPath: p.customPath,
      customProjectPath: p.customProjectPath,
      icon: p.icon,
    }
  })
  storage.savePlatformConfigs(toSave)
  syncAllowedWriteRoots({ platforms: getAllPlatformDefinitions() })
}

function togglePlatformEnabled(platform: PlatformInfo) {
  platform.enabled = !platform.enabled
  savePlatforms()
}

function detectAgent(platform: PlatformInfo): boolean {
  if (platform.rootDir && !platform.customPath) {
    const osKey = window.services.isWindows() ? 'win32' : window.services.isMacOS() ? 'darwin' : 'linux'
    const root = (platform.rootDir[osKey as keyof typeof platform.rootDir] || platform.rootDir.linux).replace(
      /^~/,
      window.services.homeDir(),
    )
    return window.services.pathExists(root)
  }
  const p = platform.customPath || platform.defaultPath || platform.projectPath || ''
  if (!p) return false
  return window.services.pathExists(p.replace(/^~/, window.services.homeDir()))
}

function _detectAllAgents() {
  for (const p of platforms.value) {
    detectAgent(p)
  }
}

function setThemeColor(id: string) {
  if (id === 'custom') {
    if (!settings.themeColor.startsWith('#')) {
      updateSettings({ themeColor: customColorInput.value || '#58a4f6' })
    }
  } else {
    updateSettings({ themeColor: id })
  }
}

function setCustomColor(hex: string) {
  const cleaned = hex.startsWith('#') ? hex : '#' + hex
  customColorInput.value = cleaned
  updateSettings({ themeColor: cleaned })
}

function isCustomColor(): boolean {
  return settings.themeColor.startsWith('#') || settings.themeColor === 'custom'
}

function isThemeColorActive(id: string): boolean {
  return settings.themeColor === id
}

function _getThemePreviewHue(id: string): number {
  const t = MORANDI_THEMES.find((t) => t.id === id)
  return t ? t.hue : 210
}

function _getThemePreviewSat(id: string): number {
  const t = MORANDI_THEMES.find((t) => t.id === id)
  return t ? t.saturation : 35
}

const _detectedCount = computed(() => platforms.value.filter((p) => detectAgent(p)).length)

// Platform ordering
const savedOrder = storage.getPlatformOrder()
const platformOrder = ref<string[]>(savedOrder.length ? savedOrder : getDefaultPlatformOrder())

function savePlatformOrder() {
  storage.savePlatformOrder(platformOrder.value)
}

function movePlatformUp(index: number) {
  if (index <= 0) return
  const newOrder = [...platformOrder.value]
  ;[newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]]
  platformOrder.value = newOrder
  savePlatformOrder()
}

function movePlatformDown(index: number) {
  if (index >= platformOrder.value.length - 1) return
  const newOrder = [...platformOrder.value]
  ;[newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]]
  platformOrder.value = newOrder
  savePlatformOrder()
}

function resetPlatformOrder() {
  platformOrder.value = getDefaultPlatformOrder()
  savePlatformOrder()
}

const sortedPlatforms = computed(() => {
  const platformMap = new Map(platforms.value.map((p) => [p.id, p]))
  return platformOrder.value.map((id) => platformMap.get(id)).filter((p): p is PlatformInfo => p !== undefined)
})

// Drag and drop with auto-scroll
const dragIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)
let autoScrollRafId: number | null = null
let lastDragY = 0
let scrollContainer: HTMLElement | null = null

function startAutoScroll() {
  stopAutoScroll()
  scrollContainer = document.querySelector('.settings-scroll')
  if (!scrollContainer) return

  const SCROLL_ZONE = 80
  const MAX_SCROLL_SPEED = 12

  function tick() {
    if (dragIndex.value === null) {
      stopAutoScroll()
      return
    }
    const rect = scrollContainer!.getBoundingClientRect()
    const y = lastDragY
    const distFromTop = y - rect.top
    const distFromBottom = rect.bottom - y

    if (distFromTop < SCROLL_ZONE && distFromTop > 0) {
      const speed = Math.round(MAX_SCROLL_SPEED * (1 - distFromTop / SCROLL_ZONE))
      scrollContainer!.scrollTop -= speed
    } else if (distFromBottom < SCROLL_ZONE && distFromBottom > 0) {
      const speed = Math.round(MAX_SCROLL_SPEED * (1 - distFromBottom / SCROLL_ZONE))
      scrollContainer!.scrollTop += speed
    }
    autoScrollRafId = requestAnimationFrame(tick)
  }
  autoScrollRafId = requestAnimationFrame(tick)
}

function stopAutoScroll() {
  if (autoScrollRafId) {
    cancelAnimationFrame(autoScrollRafId)
    autoScrollRafId = null
  }
}

function onDragStart(index: number, event: DragEvent) {
  dragIndex.value = index
  lastDragY = event.clientY
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', index.toString())
  }
  startAutoScroll()
}

function onDragOver(index: number, event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
  lastDragY = event.clientY
  dragOverIndex.value = index
}

function onDragLeave() {
  dragOverIndex.value = null
}

function onDrop(index: number, event: DragEvent) {
  event.preventDefault()
  stopAutoScroll()

  if (dragIndex.value === null || dragIndex.value === index) return

  const newOrder = [...platformOrder.value]
  const draggedItem = newOrder.splice(dragIndex.value, 1)[0]
  newOrder.splice(index, 0, draggedItem)
  platformOrder.value = newOrder
  savePlatformOrder()

  dragIndex.value = null
  dragOverIndex.value = null
}

function onDragEnd() {
  stopAutoScroll()
  dragIndex.value = null
  dragOverIndex.value = null
}

function getPlatformOsPath(platform: PlatformInfo): string {
  if (platform.customPath) return platform.customPath
  if (platform.rootDir) {
    const osKey = window.services?.isWindows?.() ? 'win32' : window.services?.isMacOS?.() ? 'darwin' : 'linux'
    const rootDir = platform.rootDir[osKey as keyof typeof platform.rootDir] || platform.rootDir.linux || ''
    if (platform.skillsRelativePath) {
      return `${rootDir}/${platform.skillsRelativePath}`.replace(/\\/g, '/')
    }
    return rootDir
  }
  return platform.defaultPath || platform.projectPath || ''
}

</script>

<template>
  <div class="settings-layout">
    <aside class="settings-sidebar" :style="{ width: sidebarWidth + 'px' }">
      <div class="settings-sidebar-header">
        <h2>设置</h2>
      </div>
      <nav class="settings-nav">
        <button
          v-for="s in visibleSections"
          :key="s.id"
          class="settings-nav-item"
          :class="{ active: activeSection === s.id }"
          @click="activeSection = s.id"
        >
          <span class="settings-nav-icon"><UiIcon :name="s.icon" :size="16" /></span>
          <span class="settings-nav-label">{{ s.label }}</span>
        </button>
      </nav>
      <div class="settings-sidebar-resize" @mousedown="startSidebarResize" @touchstart.prevent="startSidebarResize" />
    </aside>

    <div class="settings-content">
      <!-- ===== APPEARANCE ===== -->
      <template v-if="activeSection === 'appearance'">
        <div class="page-header settings-header">
          <div class="header-left">
            <h2>显示设置</h2>
            <p class="page-subtitle">自定义应用的外观和视觉效果。</p>
          </div>
          <div class="header-toolbar">
            <button class="settings-theme-toggle" @click="toggleTheme" :title="isDarkMode ? '切换亮色模式' : '切换暗色模式'">
              <svg
                v-if="isDarkMode"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="5" />
                <path
                  d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
                />
              </svg>
              <svg
                v-else
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
            </button>
          </div>
        </div>

        <div class="settings-scroll">
          <div class="setting-section">
            <h3 class="setting-section-title">主题模式</h3>
            <div class="setting-card">
              <div class="segmented-control">
                <button
                  v-for="m in themeModes"
                  :key="m.id"
                  class="segment-btn"
                  :class="{ active: settings.themeMode === m.id }"
                  @click="setThemeMode(m.id)"
                >
                  <span class="segment-icon"><UiIcon :name="m.icon" :size="16" /></span>
                  <span>{{ m.label }}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Theme Color -->
          <div class="setting-section">
            <h3 class="setting-section-title">主题颜色</h3>
            <div class="setting-card">
              <div class="color-name-bar">
                <template v-if="isCustomColor()"> {{ '自定义' }} {{ settings.themeColor }} </template>
                <template v-else>
                  {{ morandiThemes.find((t) => t.id === settings.themeColor)?.name || '' }}
                </template>
              </div>
              <div class="color-swatches-row">
                <div v-for="t in morandiThemes" :key="t.id" class="color-swatch-cell">
                  <button
                    class="color-swatch-btn"
                    :class="{ active: isThemeColorActive(t.id) }"
                    :style="{ background: `hsl(${t.hue}, ${t.saturation}%, 55%)` }"
                    :title="t.name"
                    @click="setThemeColor(t.id)"
                  >
                    <svg
                      v-if="isThemeColorActive(t.id)"
                      class="swatch-check"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="3"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </button>
                </div>
                <div class="color-swatch-cell">
                  <button
                    class="color-swatch-btn"
                    :class="{ active: isCustomColor() }"
                    :style="{ background: settings.themeColor.startsWith('#') ? settings.themeColor : '#58a4f6' }"
                    title="自定义"
                    @click="setThemeColor('custom')"
                  >
                    <svg
                      v-if="isCustomColor()"
                      class="swatch-check"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="3"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div v-if="isCustomColor()" class="custom-color-panel">
                <div class="custom-color-header">
                  <div>
                    <div class="custom-color-title">自定义颜色</div>
                    <div class="custom-color-desc">选择任意颜色并全局应用</div>
                  </div>
                  <div class="custom-color-inputs">
                    <input
                      type="color"
                      :value="settings.themeColor.startsWith('#') ? settings.themeColor : '#58a4f6'"
                      class="color-picker-native"
                      @input="setCustomColor(($event.target as HTMLInputElement).value)"
                    />
                    <input
                      v-model="customColorInput"
                      class="color-hex-native"
                      placeholder="#58a4f6"
                      @change="setCustomColor(customColorInput)"
                    />
                  </div>
                </div>
                <div class="preview-strip">
                  <div
                    class="preview-block primary"
                    :style="{
                      background: `hsl(${hexToHsl(settings.themeColor)?.h || 210}, ${hexToHsl(settings.themeColor)?.s || 35}%, 55%)`,
                    }"
                  >
                    主色
                  </div>
                  <div
                    class="preview-block accent"
                    :style="{
                      background: `hsl(${hexToHsl(settings.themeColor)?.h || 210}, ${Math.round((hexToHsl(settings.themeColor)?.s || 35) * 0.5)}%, 94%)`,
                    }"
                  >
                    强调色
                  </div>
                  <div class="preview-block neutral">中性色</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Font Size -->
          <div class="setting-section">
            <h3 class="setting-section-title">字体大小</h3>
            <div class="setting-card">
              <div class="option-grid">
                <button
                  v-for="f in fontSizeOptions"
                  :key="f.id"
                  class="option-btn"
                  :class="{ active: settings.fontSize === f.id }"
                  @click="setFontSize(f.id)"
                >
                  <span class="option-label">{{ f.label }}</span>
                  <span class="option-meta">{{ f.size }}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Toast Position -->
          <div class="setting-section">
            <h3 class="setting-section-title">提示位置</h3>
            <div class="setting-card">
              <div class="segmented-control">
                <button
                  v-for="position in toastPositionOptions"
                  :key="position.id"
                  class="segment-btn"
                  :class="{ active: settings.toastPosition === position.id }"
                  @click="setToastPosition(position.id)"
                >
                  <span>{{ position.label }}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Motion -->
          <div class="setting-section">
            <h3 class="setting-section-title">动画效果</h3>
            <div class="setting-card">
              <p class="setting-card-desc">控制应用中的动画量。"标准"会覆盖系统的"减少动效"设置。</p>
              <div class="option-grid">
                <button
                  v-for="m in motionOptions"
                  :key="m.id"
                  class="option-btn"
                  :class="{ active: settings.motionPreference === m.id }"
                  @click="setMotion(m.id)"
                >
                  <span class="option-label">{{ m.label }}</span>
                  <span class="option-meta">{{ m.desc }}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Compact Mode -->
          <div class="setting-section">
            <h3 class="setting-section-title">紧凑模式</h3>
            <div class="setting-card">
              <div class="setting-row">
                <div class="setting-row-info">
                  <div class="setting-row-label">启用紧凑模式</div>
                  <div class="setting-row-desc">减少间距和内边距，显示更多内容</div>
                </div>
                <button class="toggle-switch" :class="{ on: settings.compactMode }" @click="setCompactMode(!settings.compactMode)">
                  <span class="toggle-thumb" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- ===== GENERAL ===== -->
      <template v-if="activeSection === 'general'">
        <div class="page-header settings-header">
          <div class="header-left">
            <h2>通用设置</h2>
            <p class="page-subtitle">配置技能分发的默认行为和 GitHub 访问令牌。</p>
          </div>
          <div class="header-toolbar">
            <button class="settings-theme-toggle" @click="toggleTheme" :title="isDarkMode ? '切换亮色模式' : '切换暗色模式'">
              <svg
                v-if="isDarkMode"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="5" />
                <path
                  d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
                />
              </svg>
              <svg
                v-else
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
            </button>
          </div>
        </div>

        <div class="settings-scroll">
          <div class="setting-section">
            <h3 class="setting-section-title">分发模式</h3>
            <div class="setting-card">
              <div class="setting-row">
                <div class="setting-row-info">
                  <div class="setting-row-label">默认分发模式</div>
                  <div class="setting-row-desc">技能文件分发到 Agent 平台的方式</div>
                </div>
              </div>
              <div class="mode-grid">
                <button
                  class="mode-card"
                  :class="{ active: settings.defaultInstallMode === 'copy' }"
                  @click="updateSettings({ defaultInstallMode: 'copy' })"
                >
                  <span class="mode-icon"><UiIcon name="file" :size="24" /></span>
                  <span class="mode-name">复制</span>
                  <span class="mode-desc">每个平台独立副本</span>
                </button>
                <button
                  class="mode-card"
                  :class="{ active: settings.defaultInstallMode === 'symlink' }"
                  @click="updateSettings({ defaultInstallMode: 'symlink' })"
                >
                  <span class="mode-icon"><UiIcon name="link" :size="24" /></span>
                  <span class="mode-name">软链接</span>
                  <span class="mode-desc">共享编辑，同步更新</span>
                </button>
              </div>
            </div>
          </div>

          <!-- GitHub / Gitee -->
          <div id="github-token-section" class="setting-section">
            <h3 class="setting-section-title">GitHub / Gitee 访问令牌</h3>
            <div class="setting-card">
              <div class="setting-row">
                <div class="setting-row-info">
                  <div class="setting-row-label">访问令牌</div>
                  <div class="setting-row-desc">分别配置 GitHub 和 Gitee 的访问令牌，用于访问私有仓库和提高 API 请求额度。</div>
                </div>
              </div>
              <div class="token-provider-label">GitHub Token</div>
              <div class="token-row">
                <input
                  v-model="settings.githubToken"
                  :type="showToken ? 'text' : 'password'"
                  class="token-input"
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  @change="updateSettings({ githubToken: settings.githubToken })"
                />
                <button class="token-toggle" @click="showToken = !showToken">
                  {{ showToken ? '隐藏' : '显示' }}
                </button>
              </div>
              <a class="token-link" href="https://github.com/settings/tokens/new?scopes=repo&description=skill-hub" target="_blank">
                创建个人访问令牌 →
              </a>
              <div class="token-provider-label">Gitee Token</div>
              <div class="token-row">
                <input
                  v-model="settings.giteeToken"
                  :type="showToken ? 'text' : 'password'"
                  class="token-input"
                  placeholder="Gitee Token"
                  @change="updateSettings({ giteeToken: settings.giteeToken })"
                />
                <button class="token-toggle" @click="showToken = !showToken">
                  {{ showToken ? '隐藏' : '显示' }}
                </button>
              </div>
              <a class="token-link" href="https://gitee.com/profile/personal_access_tokens" target="_blank">
                创建 Gitee 个人访问令牌 →
              </a>
            </div>
          </div>

          <!-- Cleanup Unregistered Skills -->
          <div class="setting-section">
            <h3 class="setting-section-title">数据清理</h3>
            <div class="setting-card">
              <div class="setting-row">
                <div class="setting-row-info">
                  <div class="setting-row-label">清理未注册的技能</div>
                  <div class="setting-row-desc">删除 skills-repo 目录中未被注册的技能文件夹。已注册的技能会被保留。</div>
                </div>
                <button class="cleanup-btn" @click="openCleanupSelect">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                  清理
                </button>
              </div>
              <div v-if="cleanupResult" class="cleanup-result">
                <span class="cleanup-result-icon">✓</span>
                已扫描并清理：发现 {{ cleanupResult.found }} 个，删除 {{ cleanupResult.deleted }} 个
              </div>
            </div>
          </div>

          <!-- Show Data Management -->
          <div class="setting-section">
            <h3 class="setting-section-title">数据管理</h3>
            <div class="setting-card">
              <div class="setting-row">
                <div class="setting-row-info">
                  <div class="setting-row-label">显示数据管理</div>
                  <div class="setting-row-desc">在侧边栏中显示数据管理页面入口</div>
                </div>
                <button
                  class="toggle-switch"
                  :class="{ on: settings.showDataManagement }"
                  @click="updateSettings({ showDataManagement: !settings.showDataManagement })"
                >
                  <span class="toggle-thumb" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- ===== AI 模型服务 ===== -->
      <template v-if="activeSection === 'ai'">
        <div class="page-header settings-header">
          <div class="header-left">
            <h2>模型服务</h2>
            <p class="page-subtitle">配置 AI 模型服务用于翻译等功能。支持多个提供商，每个提供商可配置多个模型。</p>
          </div>
          <div class="header-toolbar">
            <button class="settings-theme-toggle" @click="toggleTheme" :title="isDarkMode ? '切换亮色模式' : '切换暗色模式'">
              <svg
                v-if="isDarkMode"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="5" />
                <path
                  d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
                />
              </svg>
              <svg
                v-else
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
            </button>
          </div>
        </div>

        <div class="settings-scroll">
          <div class="ai-model-toolbar">
            <button class="toolbar-btn primary" @click="openAddModel">+ 添加提供商</button>
          </div>

          <div class="ai-model-list">
            <div v-if="!settings.aiModels.length" class="ai-model-empty">还没有配置 AI 模型。点击上方按钮添加。</div>

            <!-- Enabled Providers -->
            <div v-if="enabledProviders.length" class="provider-group">
              <div class="provider-group-title">已启用</div>
              <div v-for="m in enabledProviders" :key="m.id" class="ai-model-provider-card">
                <div class="provider-card-header" @click="toggleExpandedSection(m.id, 'apiInfo')">
                  <div class="provider-card-left">
                    <span class="provider-card-icon clickable" @click.stop="openIconPickerForProvider(m.id)"
                      ><ProviderIcon :icon="m.icon || getProviderInfo(m.provider)?.icon" :size="20"
                    /></span>
                    <span class="provider-card-name">{{ m.name || getProviderInfo(m.provider)?.name }}</span>
                  </div>
                  <div class="provider-card-right">
                    <button
                      v-if="!m.isBuiltin"
                      class="provider-delete-btn"
                      title="删除供应商"
                      @click.stop="
                        ((confirmDeleteProviderId = m.id), (confirmDeleteProviderName = m.name || getProviderInfo(m.provider)?.name || ''))
                      "
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      </svg>
                    </button>
                    <label class="provider-toggle" :class="{ on: m.enabled }" @click.stop>
                      <input type="checkbox" :checked="m.enabled" @change="toggleProviderEnabled(m)" />
                      <span class="provider-toggle-slider" />
                    </label>
                  </div>
                </div>
                <div v-show="expandedSections[m.id]?.apiInfo" class="provider-card-body">
                  <!-- API Key Section -->
                  <div class="provider-section">
                    <div class="provider-section-header">
                      <span class="provider-section-title">API 密钥</span>
                      <div class="provider-section-header-actions">
                        <a
                          v-if="m.isBuiltin && getProviderInfo(m.provider)?.getKeyUrl"
                          :href="getProviderInfo(m.provider)?.getKeyUrl"
                          target="_blank"
                          class="provider-getkey-link"
                          @click.stop
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                          获取密钥
                        </a>
                        <button class="provider-section-add-btn" @click.stop="addApiKey(getModelIndex(m.id))">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                          添加密钥
                        </button>
                      </div>
                    </div>
                    <div v-if="!m.apiKeys?.length" class="provider-section-empty">暂无密钥，点击上方按钮添加</div>
                    <div v-else class="apikey-list">
                      <div v-for="(ak, ki) in m.apiKeys" :key="ak.id" class="provider-apikey-row">
                        <div class="apikey-masked">
                          <label class="provider-toggle" :class="{ on: ak.enabled }">
                            <input type="checkbox" :checked="ak.enabled" @change="toggleApiKeyEnabled(getModelIndex(m.id), ki)" />
                            <span class="provider-toggle-slider" />
                          </label>
                          <span class="apikey-lock"><UiIcon name="lock" :size="14" /></span>
                          <span v-if="!showApiKey[ak.id]" class="apikey-text">{{ maskKey(ak.key) }}</span>
                          <span v-else class="apikey-text apikey-text-visible">{{ ak.key }}</span>
                        </div>
                        <div class="apikey-actions">
                          <button class="apikey-action-btn" @click="showApiKey[ak.id] = !showApiKey[ak.id]">
                            <svg
                              v-if="showApiKey[ak.id]"
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2"
                            >
                              <path
                                d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
                              />
                              <line x1="1" y1="1" x2="23" y2="23" />
                            </svg>
                            <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          </button>
                          <button class="apikey-action-btn" @click="editApiKey(getModelIndex(m.id), ki)">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button class="apikey-action-btn" @click="copyApiKey(ak.key)">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                          </button>
                          <button
                            class="apikey-action-btn danger"
                            @click="((confirmDeleteApiKey = m.id + '-' + ki), (confirmDeleteApiKeyLabel = maskKey(ak.key)))"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <path d="M3 6h18" />
                              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <!-- API URL Section -->
                  <div class="provider-section">
                    <div class="provider-section-header">
                      <span class="provider-section-title">API 地址</span>
                    </div>
                    <div v-if="!m.baseUrl" class="provider-section-empty">请填写 API 地址以启用模型同步</div>
                    <div v-else class="provider-url-form">
                      <div class="url-form-row">
                        <label class="url-form-label">Base URL <span class="tooltip-icon" title="API 服务器的基础地址">?</span></label>
                        <div class="url-form-input-group">
                          <input
                            v-model="m.baseUrl"
                            type="text"
                            class="url-form-input"
                            placeholder="https://api.openai.com"
                            @change="updateSettings({ aiModels: [...settings.aiModels] })"
                          />
                          <button class="url-restore-btn" @click="restoreBaseUrl(getModelIndex(m.id))">恢复默认</button>
                        </div>
                      </div>
                      <div class="url-preview">
                        <div>实际请求: {{ m.baseUrl }}{{ m.apiPath || '/v1/chat/completions' }}</div>
                        <div>模型同步: {{ m.baseUrl }}/v1/models</div>
                      </div>
                      <div class="url-form-row">
                        <label class="url-form-label">API 路径 <span class="tooltip-icon" title="聊天补全接口的路径">?</span></label>
                        <input
                          v-model="m.apiPath"
                          type="text"
                          class="url-form-input"
                          placeholder="/v1/chat/completions"
                          @change="updateSettings({ aiModels: [...settings.aiModels] })"
                        />
                      </div>
                    </div>
                  </div>
                  <!-- Model List Section -->
                  <div class="provider-section">
                    <div class="provider-section-header">
                      <span class="provider-section-title"
                        >模型列表 <span class="model-count">{{ m.models?.length || 0 }}</span></span
                      >
                      <div class="provider-section-actions">
                        <button
                          class="provider-section-btn"
                          :disabled="!m.baseUrl || !m.apiKeys?.length || fetchLoading"
                          title="同步模型"
                          @click="openFetchModels(getModelIndex(m.id))"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="23 4 23 10 17 10" />
                            <polyline points="1 20 1 14 7 14" />
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                          </svg>
                        </button>
                        <button class="provider-section-btn" @click="openAddModelModal(getModelIndex(m.id))" title="添加模型">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                        </button>
                        <button class="provider-section-btn" @click="testAllModels(getModelIndex(m.id))" title="测试全部">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                          </svg>
                        </button>
                        <button class="provider-section-btn" @click="toggleAllModels(m)" title="启用/禁用全部">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="1" y="5" width="22" height="14" rx="7" ry="7" />
                            <circle cx="16" cy="12" r="3" />
                          </svg>
                        </button>
                        <button class="provider-section-btn" @click="expandAllGroups(m.id)" title="展开全部">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="15 3 21 3 21 9" />
                            <polyline points="9 21 3 21 3 15" />
                            <line x1="21" y1="3" x2="14" y2="10" />
                            <line x1="3" y1="21" x2="10" y2="14" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div v-if="!m.models?.length" class="model-list-empty">点击上方按钮同步模型</div>
                    <div v-else class="model-list-grouped">
                      <div v-for="group in groupModels(m.models)" :key="group.name" class="model-group">
                        <div class="model-group-header" @click="toggleGroup(m.id, group.name)">
                          <svg
                            class="model-group-arrow"
                            :class="{ expanded: expandedGroups[m.id]?.has(group.name) }"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                          <span class="model-group-name">{{ group.name }}</span>
                          <span class="model-group-count">{{ group.models.length }}</span>
                          <div class="model-group-actions" @click.stop>
                            <label class="model-group-toggle" title="开关分组所有模型"
                              ><input
                                type="checkbox"
                                :checked="group.models.every((m) => m.enabled)"
                                @change="toggleGroupModels(getModelIndex(m.id), group.name)" /><span class="model-item-toggle-slider"
                            /></label>
                            <button
                              class="model-group-btn danger"
                              title="删除分组所有模型"
                              @click="((confirmDeleteGroup = m.id + '-' + group.name), (confirmDeleteGroupLabel = group.name))"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18" />
                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div v-show="expandedGroups[m.id]?.has(group.name)" class="model-group-items">
                          <div v-for="model in group.models" :key="model.id" class="model-list-item">
                            <div class="model-list-item-left">
                              <span class="model-item-icon"><UiIcon name="bot" :size="14" /></span>
                              <span class="model-item-name">{{ model.name }}</span>
                            </div>
                            <div class="model-list-item-right">
                              <span v-if="isModelTestLoading(getModelIndex(m.id), model.id)" class="model-test-status testing"
                                >测试中...</span
                              >
                              <span v-else-if="isModelTestSuccess(getModelIndex(m.id), model.id)" class="model-test-status ok">可用</span>
                              <span v-else-if="isModelTestFail(getModelIndex(m.id), model.id)" class="model-test-status fail">不可用</span>
                              <label class="model-item-toggle"
                                ><input
                                  type="checkbox"
                                  :checked="model.enabled"
                                  @change="toggleModelEnabled(getModelIndex(m.id), model.id)" /><span class="model-item-toggle-slider"
                              /></label>
                              <button
                                class="model-item-action-btn"
                                title="测试"
                                :class="{
                                  testing: isModelTestLoading(getModelIndex(m.id), model.id),
                                  'test-ok': isModelTestSuccess(getModelIndex(m.id), model.id),
                                  'test-fail': isModelTestFail(getModelIndex(m.id), model.id),
                                }"
                                :disabled="isModelTestLoading(getModelIndex(m.id), model.id)"
                                @click="testSingleModel(getModelIndex(m.id), model.id)"
                              >
                                <svg
                                  v-if="isModelTestLoading(getModelIndex(m.id), model.id)"
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  stroke-width="2"
                                  class="spin"
                                >
                                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                </svg>
                                <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                  <polyline points="22 4 12 14.01 9 11.01" />
                                </svg>
                              </button>
                              <button
                                class="model-item-action-btn danger"
                                @click="((confirmDeleteModel = model.id), (confirmDeleteModelLabel = model.id))"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                  <path d="M3 6h18" />
                                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <!-- Extra Body -->
                  <div class="provider-section">
                    <div class="provider-section-header">
                      <span class="provider-section-title">额外请求参数 (extra_body)</span>
                    </div>
                    <div style="padding: 8px 16px 16px">
                      <textarea
                        class="json-textarea"
                        :value="getProviderExtraBodyText(m.id)"
                        placeholder='{"thinking": {"type": "disabled"}}'
                        rows="3"
                        spellcheck="false"
                        @input="onProviderExtraBodyInput(m.id, $event)"
                      />
                      <span v-if="providerExtraBodyErrors[m.id]" class="json-error">{{ providerExtraBodyErrors[m.id] }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Pending Providers (enabled but not fully configured) -->
            <div v-if="pendingProviders.length" class="provider-group">
              <div class="provider-group-title">待配置</div>
              <div v-for="m in pendingProviders" :key="m.id" class="ai-model-provider-card pending">
                <div class="provider-card-header" @click="toggleExpandedSection(m.id, 'apiInfo')">
                  <div class="provider-card-left">
                    <span class="provider-card-icon clickable" @click.stop="openIconPickerForProvider(m.id)"
                      ><ProviderIcon :icon="m.icon || getProviderInfo(m.provider)?.icon" :size="20"
                    /></span>
                    <span class="provider-card-name">{{ m.name || getProviderInfo(m.provider)?.name }}</span>
                    <span class="provider-pending-badge">需要配置</span>
                  </div>
                  <div class="provider-card-right">
                    <button class="provider-edit-btn" @click.stop="openEditModel(getModelIndex(m.id))" title="编辑供应商">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      v-if="!m.isBuiltin"
                      class="provider-delete-btn"
                      title="删除供应商"
                      @click.stop="
                        ((confirmDeleteProviderId = m.id), (confirmDeleteProviderName = m.name || getProviderInfo(m.provider)?.name || ''))
                      "
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      </svg>
                    </button>
                    <label class="provider-toggle" :class="{ on: m.enabled }" @click.stop>
                      <input type="checkbox" :checked="m.enabled" @change="toggleProviderEnabled(m)" />
                      <span class="provider-toggle-slider" />
                    </label>
                  </div>
                </div>
                <div v-show="expandedSections[m.id]?.apiInfo" class="provider-card-body">
                  <div class="provider-section">
                    <div class="provider-section-header">
                      <span class="provider-section-title">API 密钥</span>
                      <div class="provider-section-header-actions">
                        <a
                          v-if="m.isBuiltin && getProviderInfo(m.provider)?.getKeyUrl"
                          :href="getProviderInfo(m.provider)?.getKeyUrl"
                          target="_blank"
                          class="provider-getkey-link"
                          @click.stop
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                          获取密钥
                        </a>
                        <button class="provider-section-add-btn" @click.stop="addApiKey(getModelIndex(m.id))">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                          添加密钥
                        </button>
                      </div>
                    </div>
                    <div v-if="!m.apiKeys?.length" class="provider-section-empty">暂无密钥，点击上方按钮添加</div>
                    <div v-else class="apikey-list">
                      <div v-for="(ak, ki) in m.apiKeys" :key="ak.id" class="provider-apikey-row">
                        <div class="apikey-masked">
                          <label class="provider-toggle" :class="{ on: ak.enabled }">
                            <input type="checkbox" :checked="ak.enabled" @change="toggleApiKeyEnabled(getModelIndex(m.id), ki)" />
                            <span class="provider-toggle-slider" />
                          </label>
                          <span class="apikey-lock"><UiIcon name="lock" :size="14" /></span>
                          <span v-if="!showApiKey[ak.id]" class="apikey-text">{{ maskKey(ak.key) }}</span>
                          <span v-else class="apikey-text apikey-text-visible">{{ ak.key }}</span>
                        </div>
                        <div class="apikey-actions">
                          <button class="apikey-action-btn" @click="showApiKey[ak.id] = !showApiKey[ak.id]">
                            <svg
                              v-if="showApiKey[ak.id]"
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2"
                            >
                              <path
                                d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
                              />
                              <line x1="1" y1="1" x2="23" y2="23" />
                            </svg>
                            <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          </button>
                          <button class="apikey-action-btn" @click="editApiKey(getModelIndex(m.id), ki)">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button class="apikey-action-btn" @click="copyApiKey(ak.key)">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                          </button>
                          <button
                            class="apikey-action-btn danger"
                            @click="((confirmDeleteApiKey = m.id + '-' + ki), (confirmDeleteApiKeyLabel = maskKey(ak.key)))"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <path d="M3 6h18" />
                              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="provider-section">
                    <div class="provider-section-header">
                      <span class="provider-section-title">API 地址</span>
                    </div>
                    <div v-if="!m.baseUrl" class="provider-section-empty">请填写 API 地址以启用模型同步</div>
                    <div v-else class="provider-url-form">
                      <div class="url-form-row">
                        <label class="url-form-label">Base URL <span class="tooltip-icon" title="API 服务器的基础地址">?</span></label>
                        <div class="url-form-input-group">
                          <input
                            v-model="m.baseUrl"
                            type="text"
                            class="url-form-input"
                            placeholder="https://api.openai.com"
                            @change="updateSettings({ aiModels: [...settings.aiModels] })"
                          />
                          <button class="url-restore-btn" @click="restoreBaseUrl(getModelIndex(m.id))">恢复默认</button>
                        </div>
                      </div>
                      <div class="url-preview">
                        <div>实际请求: {{ m.baseUrl }}{{ m.apiPath || '/v1/chat/completions' }}</div>
                        <div>模型同步: {{ m.baseUrl }}/v1/models</div>
                      </div>
                      <div class="url-form-row">
                        <label class="url-form-label">API 路径 <span class="tooltip-icon" title="聊天补全接口的路径">?</span></label>
                        <input
                          v-model="m.apiPath"
                          type="text"
                          class="url-form-input"
                          placeholder="/v1/chat/completions"
                          @change="updateSettings({ aiModels: [...settings.aiModels] })"
                        />
                      </div>
                    </div>
                  </div>
                  <div class="provider-section">
                    <div class="provider-section-header">
                      <span class="provider-section-title"
                        >模型列表 <span class="model-count">{{ m.models?.length || 0 }}</span></span
                      >
                      <div class="provider-section-actions">
                        <button
                          class="provider-section-btn"
                          :disabled="!m.baseUrl || !m.apiKeys?.length || fetchLoading"
                          title="同步模型"
                          @click="openFetchModels(getModelIndex(m.id))"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="23 4 23 10 17 10" />
                            <polyline points="1 20 1 14 7 14" />
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                          </svg>
                        </button>
                        <button class="provider-section-btn" @click="openAddModelModal(getModelIndex(m.id))" title="添加模型">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                        </button>
                        <button class="provider-section-btn" @click="testAllModels(getModelIndex(m.id))" title="测试全部">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                          </svg>
                        </button>
                        <button class="provider-section-btn" @click="toggleAllModels(m)" title="启用/禁用全部">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="1" y="5" width="22" height="14" rx="7" ry="7" />
                            <circle cx="16" cy="12" r="3" />
                          </svg>
                        </button>
                        <button class="provider-section-btn" @click="expandAllGroups(m.id)" title="展开全部">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="15 3 21 3 21 9" />
                            <polyline points="9 21 3 21 3 15" />
                            <line x1="21" y1="3" x2="14" y2="10" />
                            <line x1="3" y1="21" x2="10" y2="14" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div v-if="!m.models?.length" class="model-list-empty">点击上方按钮同步模型</div>
                    <div v-else class="model-list-grouped">
                      <div v-for="group in groupModels(m.models)" :key="group.name" class="model-group">
                        <div class="model-group-header" @click="toggleGroup(m.id, group.name)">
                          <svg
                            class="model-group-arrow"
                            :class="{ expanded: expandedGroups[m.id]?.has(group.name) }"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                          <span class="model-group-name">{{ group.name }}</span>
                          <span class="model-group-count">{{ group.models.length }}</span>
                          <div class="model-group-actions" @click.stop>
                            <label class="model-group-toggle" title="开关分组所有模型"
                              ><input
                                type="checkbox"
                                :checked="group.models.every((m) => m.enabled)"
                                @change="toggleGroupModels(getModelIndex(m.id), group.name)" /><span class="model-item-toggle-slider"
                            /></label>
                            <button
                              class="model-group-btn danger"
                              title="删除分组所有模型"
                              @click="((confirmDeleteGroup = m.id + '-' + group.name), (confirmDeleteGroupLabel = group.name))"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18" />
                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div v-show="expandedGroups[m.id]?.has(group.name)" class="model-group-items">
                          <div v-for="model in group.models" :key="model.id" class="model-list-item">
                            <div class="model-list-item-left">
                              <span class="model-item-icon"><UiIcon name="bot" :size="14" /></span>
                              <span class="model-item-name">{{ model.name }}</span>
                            </div>
                            <div class="model-list-item-right">
                              <span v-if="isModelTestLoading(getModelIndex(m.id), model.id)" class="model-test-status testing"
                                >测试中...</span
                              >
                              <span v-else-if="isModelTestSuccess(getModelIndex(m.id), model.id)" class="model-test-status ok">可用</span>
                              <span v-else-if="isModelTestFail(getModelIndex(m.id), model.id)" class="model-test-status fail">不可用</span>
                              <label class="model-item-toggle"
                                ><input
                                  type="checkbox"
                                  :checked="model.enabled"
                                  @change="toggleModelEnabled(getModelIndex(m.id), model.id)" /><span class="model-item-toggle-slider"
                              /></label>
                              <button
                                class="model-item-action-btn"
                                title="测试"
                                :class="{
                                  testing: isModelTestLoading(getModelIndex(m.id), model.id),
                                  'test-ok': isModelTestSuccess(getModelIndex(m.id), model.id),
                                  'test-fail': isModelTestFail(getModelIndex(m.id), model.id),
                                }"
                                :disabled="isModelTestLoading(getModelIndex(m.id), model.id)"
                                @click="testSingleModel(getModelIndex(m.id), model.id)"
                              >
                                <svg
                                  v-if="isModelTestLoading(getModelIndex(m.id), model.id)"
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  stroke-width="2"
                                  class="spin"
                                >
                                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                </svg>
                                <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                  <polyline points="22 4 12 14.01 9 11.01" />
                                </svg>
                              </button>
                              <button
                                class="model-item-action-btn danger"
                                @click="((confirmDeleteModel = model.id), (confirmDeleteModelLabel = model.id))"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                  <path d="M3 6h18" />
                                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <!-- Extra Body -->
                  <div class="provider-section">
                    <div class="provider-section-header">
                      <span class="provider-section-title">额外请求参数 (extra_body)</span>
                    </div>
                    <div style="padding: 8px 16px 16px">
                      <textarea
                        class="json-textarea"
                        :value="getProviderExtraBodyText(m.id)"
                        placeholder='{"thinking": {"type": "disabled"}}'
                        rows="3"
                        spellcheck="false"
                        @input="onProviderExtraBodyInput(m.id, $event)"
                      />
                      <span v-if="providerExtraBodyErrors[m.id]" class="json-error">{{ providerExtraBodyErrors[m.id] }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Disabled Providers -->
            <div v-if="disabledProviders.length" class="provider-group">
              <div class="provider-group-title">未启用</div>
              <div v-for="m in disabledProviders" :key="m.id" class="ai-model-provider-card disabled">
                <div class="provider-card-header" @click="toggleExpandedSection(m.id, 'apiInfo')">
                  <div class="provider-card-left">
                    <span class="provider-card-icon clickable" @click.stop="openIconPickerForProvider(m.id)"
                      ><ProviderIcon :icon="m.icon || getProviderInfo(m.provider)?.icon" :size="20"
                    /></span>
                    <span class="provider-card-name">{{ m.name || getProviderInfo(m.provider)?.name }}</span>
                  </div>
                  <div class="provider-card-right">
                    <button class="provider-edit-btn" @click.stop="openEditModel(getModelIndex(m.id))" title="编辑供应商">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      v-if="!m.isBuiltin"
                      class="provider-delete-btn"
                      title="删除供应商"
                      @click.stop="
                        ((confirmDeleteProviderId = m.id), (confirmDeleteProviderName = m.name || getProviderInfo(m.provider)?.name || ''))
                      "
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      </svg>
                    </button>
                    <label class="provider-toggle" :class="{ on: m.enabled }" @click.stop>
                      <input type="checkbox" :checked="m.enabled" @change="toggleProviderEnabled(m)" />
                      <span class="provider-toggle-slider" />
                    </label>
                  </div>
                </div>
                <div v-show="expandedSections[m.id]?.apiInfo" class="provider-card-body">
                  <div class="provider-section">
                    <div class="provider-section-header">
                      <span class="provider-section-title">API 密钥</span>
                      <div class="provider-section-header-actions">
                        <a
                          v-if="m.isBuiltin && getProviderInfo(m.provider)?.getKeyUrl"
                          :href="getProviderInfo(m.provider)?.getKeyUrl"
                          target="_blank"
                          class="provider-getkey-link"
                          @click.stop
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                          获取密钥
                        </a>
                        <button class="provider-section-add-btn" @click.stop="addApiKey(getModelIndex(m.id))">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                          添加密钥
                        </button>
                      </div>
                    </div>
                    <div v-if="!m.apiKeys?.length" class="provider-section-empty">暂无密钥，点击上方按钮添加</div>
                    <div v-else class="apikey-list">
                      <div v-for="(ak, ki) in m.apiKeys" :key="ak.id" class="provider-apikey-row">
                        <div class="apikey-masked">
                          <label class="provider-toggle" :class="{ on: ak.enabled }">
                            <input type="checkbox" :checked="ak.enabled" @change="toggleApiKeyEnabled(getModelIndex(m.id), ki)" />
                            <span class="provider-toggle-slider" />
                          </label>
                          <span class="apikey-lock"><UiIcon name="lock" :size="14" /></span>
                          <span v-if="!showApiKey[ak.id]" class="apikey-text">{{ maskKey(ak.key) }}</span>
                          <span v-else class="apikey-text apikey-text-visible">{{ ak.key }}</span>
                        </div>
                        <div class="apikey-actions">
                          <button class="apikey-action-btn" @click="showApiKey[ak.id] = !showApiKey[ak.id]">
                            <svg
                              v-if="showApiKey[ak.id]"
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2"
                            >
                              <path
                                d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
                              />
                              <line x1="1" y1="1" x2="23" y2="23" />
                            </svg>
                            <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          </button>
                          <button class="apikey-action-btn" @click="editApiKey(getModelIndex(m.id), ki)">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button class="apikey-action-btn" @click="copyApiKey(ak.key)">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                          </button>
                          <button
                            class="apikey-action-btn danger"
                            @click="((confirmDeleteApiKey = m.id + '-' + ki), (confirmDeleteApiKeyLabel = maskKey(ak.key)))"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <path d="M3 6h18" />
                              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="provider-section">
                    <div class="provider-section-header">
                      <span class="provider-section-title">API 地址</span>
                    </div>
                    <div v-if="!m.baseUrl" class="provider-section-empty">请填写 API 地址以启用模型同步</div>
                    <div v-else class="provider-url-form">
                      <div class="url-form-row">
                        <label class="url-form-label">Base URL <span class="tooltip-icon" title="API 服务器的基础地址">?</span></label>
                        <div class="url-form-input-group">
                          <input
                            v-model="m.baseUrl"
                            type="text"
                            class="url-form-input"
                            placeholder="https://api.openai.com"
                            @change="updateSettings({ aiModels: [...settings.aiModels] })"
                          />
                          <button class="url-restore-btn" @click="restoreBaseUrl(getModelIndex(m.id))">恢复默认</button>
                        </div>
                      </div>
                      <div class="url-preview">
                        <div>实际请求: {{ m.baseUrl }}{{ m.apiPath || '/v1/chat/completions' }}</div>
                        <div>模型同步: {{ m.baseUrl }}/v1/models</div>
                      </div>
                      <div class="url-form-row">
                        <label class="url-form-label">API 路径 <span class="tooltip-icon" title="聊天补全接口的路径">?</span></label>
                        <input
                          v-model="m.apiPath"
                          type="text"
                          class="url-form-input"
                          placeholder="/v1/chat/completions"
                          @change="updateSettings({ aiModels: [...settings.aiModels] })"
                        />
                      </div>
                    </div>
                  </div>
                  <!-- Model List Section -->
                  <div class="provider-section">
                    <div class="provider-section-header">
                      <span class="provider-section-title"
                        >模型列表 <span class="model-count">{{ m.models?.length || 0 }}</span></span
                      >
                      <div class="provider-section-actions">
                        <button
                          class="provider-section-btn"
                          :disabled="!m.baseUrl || !m.apiKeys?.length || fetchLoading"
                          title="同步模型"
                          @click="openFetchModels(getModelIndex(m.id))"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="23 4 23 10 17 10" />
                            <polyline points="1 20 1 14 7 14" />
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                          </svg>
                        </button>
                        <button class="provider-section-btn" @click="openAddModelModal(getModelIndex(m.id))" title="添加模型">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                        </button>
                        <button class="provider-section-btn" @click="testAllModels(getModelIndex(m.id))" title="测试全部">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                          </svg>
                        </button>
                        <button class="provider-section-btn" @click="toggleAllModels(m)" title="启用/禁用全部">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="1" y="5" width="22" height="14" rx="7" ry="7" />
                            <circle cx="16" cy="12" r="3" />
                          </svg>
                        </button>
                        <button class="provider-section-btn" @click="expandAllGroups(m.id)" title="展开全部">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="15 3 21 3 21 9" />
                            <polyline points="9 21 3 21 3 15" />
                            <line x1="21" y1="3" x2="14" y2="10" />
                            <line x1="3" y1="21" x2="10" y2="14" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div v-if="!m.models?.length" class="model-list-empty">点击上方按钮同步模型</div>
                    <div v-else class="model-list-grouped">
                      <div v-for="group in groupModels(m.models)" :key="group.name" class="model-group">
                        <div class="model-group-header" @click="toggleGroup(m.id, group.name)">
                          <svg
                            class="model-group-arrow"
                            :class="{ expanded: expandedGroups[m.id]?.has(group.name) }"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                          <span class="model-group-name">{{ group.name }}</span>
                          <span class="model-group-count">{{ group.models.length }}</span>
                          <div class="model-group-actions" @click.stop>
                            <label class="model-group-toggle" title="开关分组所有模型"
                              ><input
                                type="checkbox"
                                :checked="group.models.every((m) => m.enabled)"
                                @change="toggleGroupModels(getModelIndex(m.id), group.name)" /><span class="model-item-toggle-slider"
                            /></label>
                            <button
                              class="model-group-btn danger"
                              title="删除分组所有模型"
                              @click="((confirmDeleteGroup = m.id + '-' + group.name), (confirmDeleteGroupLabel = group.name))"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18" />
                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div v-show="expandedGroups[m.id]?.has(group.name)" class="model-group-items">
                          <div v-for="model in group.models" :key="model.id" class="model-list-item">
                            <div class="model-list-item-left">
                              <span class="model-item-icon"><UiIcon name="bot" :size="14" /></span>
                              <span class="model-item-name">{{ model.name }}</span>
                            </div>
                            <div class="model-list-item-right">
                              <span v-if="isModelTestLoading(getModelIndex(m.id), model.id)" class="model-test-status testing"
                                >测试中...</span
                              >
                              <span v-else-if="isModelTestSuccess(getModelIndex(m.id), model.id)" class="model-test-status ok">可用</span>
                              <span v-else-if="isModelTestFail(getModelIndex(m.id), model.id)" class="model-test-status fail">不可用</span>
                              <label class="model-item-toggle"
                                ><input
                                  type="checkbox"
                                  :checked="model.enabled"
                                  @change="toggleModelEnabled(getModelIndex(m.id), model.id)" /><span class="model-item-toggle-slider"
                              /></label>
                              <button
                                class="model-item-action-btn"
                                title="测试"
                                :class="{
                                  testing: isModelTestLoading(getModelIndex(m.id), model.id),
                                  'test-ok': isModelTestSuccess(getModelIndex(m.id), model.id),
                                  'test-fail': isModelTestFail(getModelIndex(m.id), model.id),
                                }"
                                :disabled="isModelTestLoading(getModelIndex(m.id), model.id)"
                                @click="testSingleModel(getModelIndex(m.id), model.id)"
                              >
                                <svg
                                  v-if="isModelTestLoading(getModelIndex(m.id), model.id)"
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  stroke-width="2"
                                  class="spin"
                                >
                                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                </svg>
                                <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                  <polyline points="22 4 12 14.01 9 11.01" />
                                </svg>
                              </button>
                              <button
                                class="model-item-action-btn danger"
                                @click="((confirmDeleteModel = model.id), (confirmDeleteModelLabel = model.id))"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                  <path d="M3 6h18" />
                                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <!-- Extra Body -->
                  <div class="provider-section">
                    <div class="provider-section-header">
                      <span class="provider-section-title">额外请求参数 (extra_body)</span>
                    </div>
                    <div style="padding: 8px 16px 16px">
                      <textarea
                        class="json-textarea"
                        :value="getProviderExtraBodyText(m.id)"
                        placeholder='{"thinking": {"type": "disabled"}}'
                        rows="3"
                        spellcheck="false"
                        @input="onProviderExtraBodyInput(m.id, $event)"
                      />
                      <span v-if="providerExtraBodyErrors[m.id]" class="json-error">{{ providerExtraBodyErrors[m.id] }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Add/Edit Model Modal -->
      <div v-if="showModelModal" class="modal-overlay">
        <div class="modal modal-sm">
          <div class="modal-header">
            <h3 class="modal-title">
              {{ editingModelIndex !== null ? '编辑供应商' : '添加供应商' }}
            </h3>
            <button class="modal-close" @click="showModelModal = false">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">供应商名称 <span class="form-required">*</span></label>
              <input v-model="modelForm.name" type="text" class="form-input" placeholder="例如: 我的 OpenAI" @keyup.enter="saveModel" />
            </div>
            <div class="form-group">
              <label class="form-label">供应商类型 <span class="form-required">*</span></label>
              <select v-model="modelForm.provider" class="form-select" @change="applyProviderPreset">
                <option v-for="p in BUILTIN_PROVIDERS" :key="p.id" :value="p.id">
                  {{ p.name }}
                </option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Base URL</label>
              <input v-model="modelForm.baseUrl" type="text" class="form-input" placeholder="https://api.openai.com" />
            </div>
            <div class="form-group">
              <label class="form-label">API 路径</label>
              <input v-model="modelForm.apiPath" type="text" class="form-input" placeholder="/v1/chat/completions" />
            </div>
            <div class="form-group">
              <label class="form-label">图标</label>
              <div class="icon-picker-trigger" @click="((editingIconProviderId = null), (showIconPicker = true))">
                <span class="icon-picker-preview"
                  ><ProviderIcon :icon="modelForm.icon || getProviderInfo(modelForm.provider)?.icon || 'openai'" :size="28"
                /></span>
                <span class="icon-picker-label">{{ modelForm.icon || getProviderInfo(modelForm.provider)?.icon || 'openai' }}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="modal-btn cancel" @click="showModelModal = false">取消</button>
            <button class="modal-btn confirm" :disabled="!modelForm.name.trim() || !modelForm.provider" @click="saveModel">创建</button>
          </div>
        </div>
      </div>

      <!-- Icon Picker Modal -->
      <div v-if="showIconPicker" class="modal-overlay" style="z-index: 1100">
        <div class="modal modal-sm" style="width: 440px; max-height: min(85vh, 720px); display: flex; flex-direction: column">
          <div class="modal-header">
            <h3 class="modal-title">选择图标</h3>
            <button class="modal-close" @click="showIconPicker = false">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div class="modal-body" style="padding: 12px; flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column">
            <StoreIconPicker v-model="currentIconValue" :defaultIcon="defaultProviderIcon" style="flex: 1; min-height: 0" />
          </div>
        </div>
      </div>

      <!-- Add Model Modal -->
      <div v-if="showAddModelModal" class="modal-overlay">
        <div class="modal modal-sm">
          <div class="modal-header">
            <h3 class="modal-title">添加模型</h3>
            <button class="modal-close" @click="showAddModelModal = false">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">模型名称 <span class="form-required">*</span></label>
              <input
                v-model="newModelName"
                type="text"
                class="form-input"
                placeholder="例如: gpt-4o, claude-3-opus"
                @keyup.enter="saveNewModel"
              />
            </div>
            <div class="form-group">
              <label class="form-label">自定义名称（可选）</label>
              <input
                v-model="newModelCustomName"
                type="text"
                class="form-input"
                placeholder="用于显示的友好名称"
                @keyup.enter="saveNewModel"
              />
            </div>
          </div>
          <div class="modal-footer">
            <button class="modal-btn cancel" @click="showAddModelModal = false">取消</button>
            <button class="modal-btn confirm" :disabled="!newModelName.trim()" @click="saveNewModel">添加</button>
          </div>
        </div>
      </div>

      <!-- API Key Modal -->
      <div v-if="showApiKeyModal" class="modal-overlay">
        <div class="modal modal-sm">
          <div class="modal-header">
            <h3 class="modal-title">
              {{ editingKeyIndex !== null ? '编辑密钥' : '添加密钥' }}
            </h3>
            <button class="modal-close" @click="showApiKeyModal = false">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">API 密钥 <span class="form-required">*</span></label>
              <input v-model="apiKeyForm.key" type="password" class="form-input" placeholder="sk-..." @keyup.enter="saveApiKey" />
            </div>
          </div>
          <div class="modal-footer">
            <button class="modal-btn cancel" @click="showApiKeyModal = false">取消</button>
            <button class="modal-btn confirm" :disabled="!apiKeyForm.key.trim()" @click="saveApiKey">保存</button>
          </div>
        </div>
      </div>

      <!-- Fetch Models Modal -->
      <div v-if="showFetchModal" class="modal-overlay">
        <div class="modal">
          <div class="modal-header">
            <h3 class="modal-title">
              同步模型 <span v-if="fetchModelsResult.length" class="modal-title-count">{{ fetchModelsResult.length }}</span>
            </h3>
            <button class="modal-close" @click="showFetchModal = false">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div v-if="fetchError" class="modal-error">
              {{ fetchError }}
            </div>
            <div v-if="!fetchModelsResult.length && !fetchError" class="modal-empty">暂无可用模型</div>
            <div v-else class="fetch-model-list">
              <div class="fetch-model-toolbar">
                <label class="fetch-toolbar-select-all">
                  <input
                    type="checkbox"
                    :checked="selectedFetchIds.size === fetchModelsResult.length && fetchModelsResult.length > 0"
                    @change="
                      selectedFetchIds =
                        selectedFetchIds.size === fetchModelsResult.length ? new Set() : new Set(fetchModelsResult.map((m) => m.id))
                    "
                  />
                  <span class="fetch-toolbar-label">全选 ({{ selectedFetchIds.size }}/{{ fetchModelsResult.length }})</span>
                </label>
                <div class="fetch-toolbar-search">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input v-model="fetchSearchQuery" type="text" placeholder="搜索模型..." />
                </div>
                <button
                  class="fetch-toolbar-btn"
                  :title="fetchModelGroups.every((g) => expandedFetchGroups.has(g.name)) ? '收起所有' : '展开所有'"
                  @click="toggleAllFetchGroups"
                >
                  <svg
                    v-if="fetchModelGroups.every((g) => expandedFetchGroups.has(g.name))"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <polyline points="4 14 10 14 10 20" />
                    <polyline points="20 10 14 10 14 4" />
                    <line x1="14" y1="10" x2="21" y2="3" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                  <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="14 14 10 10 10 14" />
                    <polyline points="10 10 14 10 10 4" />
                    <line x1="10" y1="14" x2="3" y2="21" />
                    <line x1="21" y1="3" x2="14" y2="10" />
                  </svg>
                </button>
              </div>
              <div v-for="group in fetchModelGroups" :key="group.name" class="fetch-model-group">
                <div class="fetch-model-group-header" @click="toggleFetchGroup(group.name)">
                  <svg
                    class="fetch-model-group-arrow"
                    :class="{ expanded: expandedFetchGroups.has(group.name) }"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  <label class="fetch-group-checkbox" @click.stop>
                    <input
                      type="checkbox"
                      :checked="group.models.every((m) => selectedFetchIds.has(m.id))"
                      @change="toggleFetchGroupSelection(group)"
                    />
                  </label>
                  <span class="fetch-group-icon" :style="{ background: getGroupColor(group.name) }">{{
                    group.name.charAt(0).toUpperCase()
                  }}</span>
                  <span class="fetch-model-group-name">{{ group.name }}</span>
                  <span class="fetch-model-group-count">{{ group.models.length }}</span>
                </div>
                <div v-show="expandedFetchGroups.has(group.name)" class="fetch-model-group-items">
                  <div v-for="m in group.models" :key="m.id" class="fetch-model-item" :class="{ selected: selectedFetchIds.has(m.id) }">
                    <label class="fetch-model-checkbox">
                      <input type="checkbox" :checked="selectedFetchIds.has(m.id)" @change="handleFetchModelToggle(m.id)" />
                      <span class="fetch-item-icon" :style="{ background: getGroupColor(group.name) }">{{
                        group.name.charAt(0).toUpperCase()
                      }}</span>
                      <span class="fetch-model-id">{{ m.id }}</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="modal-btn cancel" @click="showFetchModal = false">取消</button>
            <button class="modal-btn confirm" :disabled="!selectedFetchIds.size" @click="confirmFetchModels">
              导入所选 ({{ selectedFetchIds.size }})
            </button>
          </div>
        </div>
      </div>

      <!-- ===== TRANSLATION SETTINGS ===== -->
      <template v-if="activeSection === 'default-model'">
        <div class="page-header settings-header">
          <div class="header-left">
            <h2>翻译设置</h2>
            <p class="page-subtitle">配置用于翻译等功能的默认 AI 模型。</p>
          </div>
          <div class="header-toolbar">
            <button class="settings-theme-toggle" @click="toggleTheme" :title="isDarkMode ? '切换亮色模式' : '切换暗色模式'">
              <svg
                v-if="isDarkMode"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="5" />
                <path
                  d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
                />
              </svg>
              <svg
                v-else
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
            </button>
          </div>
        </div>

        <div class="settings-scroll">
          <div class="setting-section">
            <h3 class="setting-section-title">翻译模型</h3>
            <div class="setting-card">
              <div class="setting-row">
                <div class="setting-row-info">
                  <div class="setting-row-label">选择默认翻译模型</div>
                  <div class="setting-row-desc">用于技能描述和内容的翻译功能。如果不设置，翻译功能将不可用。</div>
                </div>
              </div>
              <div class="default-model-select">
                <QuickSwitcher
                  :items="translationModelItems"
                  :selected-id="hasValidTranslationModel ? settings.translationModelId : null"
                  placeholder="选择翻译模型"
                  empty-text="暂无可用模型"
                  @select="setTranslationModel($event)"
                />
              </div>
            </div>

            <div class="setting-card" style="margin-top: 16px">
              <div class="setting-row">
                <div class="setting-row-info">
                  <div class="setting-row-label">自动翻译</div>
                  <div class="setting-row-desc">下载技能后自动翻译描述和内容</div>
                </div>
                <button
                  class="toggle-switch"
                  :class="{ on: settings.autoTranslate }"
                  @click="updateSettings({ autoTranslate: !settings.autoTranslate })"
                >
                  <span class="toggle-thumb" />
                </button>
              </div>
            </div>

            <div class="setting-card" style="margin-top: 16px">
              <div class="setting-row">
                <div class="setting-row-info">
                  <div class="setting-row-label">继续上次未完成的翻译</div>
                  <div class="setting-row-desc">启动插件时自动继续上次未完成的翻译</div>
                </div>
                <button
                  class="toggle-switch"
                  :class="{ on: settings.resumeTranslation }"
                  @click="updateSettings({ resumeTranslation: !settings.resumeTranslation })"
                >
                  <span class="toggle-thumb" />
                </button>
              </div>
            </div>

            <div class="setting-card" style="margin-top: 16px">
              <div class="setting-row">
                <div class="setting-row-info">
                  <div class="setting-row-label">翻译超时</div>
                  <div class="setting-row-desc">单次翻译请求的最大等待时间（秒），超过将视为失败</div>
                </div>
                <div class="setting-row-control">
                  <div>
                    <div style="display: flex; align-items: center; gap: 8px">
                      <input
                        type="number"
                        class="number-input"
                        :class="{ 'input-error': translationTimeoutError }"
                        :value="settings.translationTimeout"
                        min="10"
                        max="3600"
                        step="10"
                        @change="onTranslationTimeoutChange($event)"
                      />
                      <span class="input-suffix">秒</span>
                    </div>
                    <span v-if="translationTimeoutError" class="input-error-text">{{ translationTimeoutError }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="setting-card" style="margin-top: 16px">
              <div class="setting-card-header">
                <div class="setting-row-label">额外请求参数 (extra_body)</div>
                <div class="setting-row-desc">
                  以 JSON 格式指定附加到翻译请求体的额外字段，会覆盖供应商级别的同名配置。例如关闭 DeepSeek 思考模式：
                </div>
              </div>
              <div style="padding: 0 16px 16px">
                <textarea
                  class="json-textarea"
                  :value="translationExtraBodyText"
                  placeholder='{"thinking": {"type": "disabled"}}'
                  rows="3"
                  spellcheck="false"
                  @input="onTranslationExtraBodyInput"
                />
                <span v-if="translationExtraBodyError" class="json-error">{{ translationExtraBodyError }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- ===== AGENT ===== -->
      <template v-if="activeSection === 'agent'">
        <div class="page-header settings-header">
          <div class="header-left">
            <h2>Agent 设置</h2>
            <p class="page-subtitle">控制整个 Agent 平台是否启用，以及它们在 Skills 和 Rules 中的显示顺序。</p>
          </div>
          <div class="header-toolbar">
            <button class="settings-theme-toggle" @click="toggleTheme" :title="isDarkMode ? '切换亮色模式' : '切换暗色模式'">
              <svg
                v-if="isDarkMode"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="5" />
                <path
                  d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
                />
              </svg>
              <svg
                v-else
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
            </button>
          </div>
        </div>

        <div class="settings-scroll">
          <div class="setting-section">
            <div class="agent-toolbar">
              <button class="toolbar-btn" type="button" @click="openAddPlatform">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                添加平台
              </button>
              <button class="toolbar-btn reset-btn" type="button" @click="resetPlatformOrder">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
                重置顺序
              </button>
            </div>
            <div class="platform-order-list">
              <div
                v-for="(p, index) in sortedPlatforms"
                :key="p.id"
                class="platform-order-item"
                :class="{
                  dragging: dragIndex === index,
                  'drag-over': dragOverIndex === index,
                  disabled: !p.enabled,
                }"
                draggable="true"
                @dragstart="onDragStart(index, $event)"
                @dragover="onDragOver(index, $event)"
                @dragleave="onDragLeave"
                @drop="onDrop(index, $event)"
                @dragend="onDragEnd"
              >
                <div class="platform-drag-handle">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="8" cy="6" r="2" />
                    <circle cx="16" cy="6" r="2" />
                    <circle cx="8" cy="12" r="2" />
                    <circle cx="16" cy="12" r="2" />
                    <circle cx="8" cy="18" r="2" />
                    <circle cx="16" cy="18" r="2" />
                  </svg>
                </div>
                <div class="platform-icon-wrapper">
                  <ProviderIcon :icon="platformDisplayIcon(p)" :size="32" variant="mono" />
                </div>
                <div class="platform-info">
                  <div class="platform-name-row">
                    <span class="platform-name">{{ p.name }}</span>
                    <span class="platform-builtin-tag" :class="{ custom: isCustomPlatform(p) }">
                      {{ isCustomPlatform(p) ? '自定义' : '内置' }}
                    </span>
                    <span class="platform-status" :class="{ detected: detectAgent(p) }">
                      {{ detectAgent(p) ? '已启用' : '未检测' }}
                    </span>
                  </div>
                  <div class="platform-path">
                    {{ getPlatformOsPath(p) }}
                  </div>
                </div>
                <div class="platform-actions">
                  <button
                    v-if="isCustomPlatform(p)"
                    class="order-btn"
                    type="button"
                    title="编辑"
                    @click.stop="openEditPlatform(p)"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                  </button>
                  <button
                    v-if="isCustomPlatform(p)"
                    class="order-btn danger"
                    type="button"
                    title="删除"
                    @click.stop="requestDeletePlatform(p)"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                      <path d="M10 11v6M14 11v6" />
                    </svg>
                  </button>
                  <button class="toggle-switch" :class="{ on: p.enabled }" type="button" @click="togglePlatformEnabled(p)">
                    <span class="toggle-thumb" />
                  </button>
                  <button class="order-btn" type="button" :disabled="index === 0" title="上移" @click="movePlatformUp(index)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="18 15 12 9 6 15" />
                    </svg>
                  </button>
                  <button
                    class="order-btn"
                    type="button"
                    :disabled="index === sortedPlatforms.length - 1"
                    title="下移"
                    @click="movePlatformDown(index)"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- ===== DATA ===== -->
      <template v-if="activeSection === 'data' && settings.showDataManagement">
        <DataManagement />
      </template>
    </div>
  </div>

  <AddPlatformModal
    v-if="showAddPlatformModal"
    :platform="editingPlatform"
    @close="onClosePlatformModal"
    @submit="onPlatformSubmit"
  />
  <ConfirmModal
    v-if="confirmDeletePlatformId"
    title="删除平台"
    :message="`确定要删除自定义平台 <strong>${confirmDeletePlatformName}</strong> 吗？`"
    @confirm="confirmDeletePlatform"
    @cancel="confirmDeletePlatformId = null"
  />
  <ConfirmModal
    v-if="confirmDeleteProviderId"
    title="删除供应商"
    :message="`确定要删除供应商 <strong>${confirmDeleteProviderName}</strong> 吗？`"
    @confirm="deleteProvider(confirmDeleteProviderId!)"
    @cancel="confirmDeleteProviderId = null"
  />
  <ConfirmModal
    v-if="confirmDeleteApiKey"
    title="删除密钥"
    :message="`确定要删除密钥 <strong>${confirmDeleteApiKeyLabel}</strong> 吗？`"
    @confirm="doDeleteApiKey"
    @cancel="confirmDeleteApiKey = null"
  />
  <ConfirmModal
    v-if="confirmDeleteGroup"
    title="删除模型分组"
    :message="`确定要删除分组 <strong>${confirmDeleteGroupLabel}</strong> 中的所有模型吗？`"
    @confirm="doDeleteGroup"
    @cancel="confirmDeleteGroup = null"
  />
  <ConfirmModal
    v-if="confirmDeleteModel"
    title="删除模型"
    :message="`确定要删除模型 <strong>${confirmDeleteModelLabel}</strong> 吗？`"
    @confirm="doDeleteModel"
    @cancel="confirmDeleteModel = null"
  />
  <CleanupSelectModal v-if="showCleanupSelect" :dirs="unregisteredDirs" @close="showCleanupSelect = false" @deleted="onCleanupDeleted" />
</template>

<style src="../../styles/settings-page.css"></style>

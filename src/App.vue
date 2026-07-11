<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, provide, defineAsyncComponent } from 'vue'
import { useRouter } from './composables/useRouter'
import { useProjectManager } from './composables/useProjectManager'
import type { RouteName } from './composables/useRouter'
import {
  KeyShowToast,
  KeySelectedProject,
  KeySelectedProjectSkill,
  KeySelectProjectSkill,
  KeySelectProject,
  KeyRegisteredProjects,
  KeyOpenAddProjectModal,
  KeyNavigateToProjectSkills,
  KeyDetectedPlatforms,
  KeyPlatformSkillCounts,
  KeyScanProject,
  KeyProjectScanning,
  KeyRefreshCounts,
  KeyCurrentRoute,
  KeyFilterCategory,
  KeyFilterSource,
  KeyRefreshMySkills,
  KeyOpenImportModal,
  KeyRefreshKey,
  KeyTriggerRefresh,
  KeyAgentSkills,
  KeyUpdateAgentPlatformSkills,
  KeySelectedAgentPlatformId,
  KeyMarkAgentSkillsDirty,
  KeyIsAgentSkillsDirty,
  KeyBumpCachedSkillsVersion,
} from './inject-keys'

const SkillStore = defineAsyncComponent(() => import('./views/SkillStore/index.vue'))
const SkillDetail = defineAsyncComponent(() => import('./views/SkillStore/Detail.vue'))
const MySkills = defineAsyncComponent(() => import('./views/MySkills/index.vue'))
const ProjectSkills = defineAsyncComponent(() => import('./views/ProjectSkills/index.vue'))
const AgentSkills = defineAsyncComponent(() => import('./views/AgentSkills/index.vue'))
const AgentSkillDetail = defineAsyncComponent(() => import('./views/AgentSkills/Detail.vue'))
const Sources = defineAsyncComponent(() => import('./views/Sources/index.vue'))
const Settings = defineAsyncComponent(() => import('./views/Settings/index.vue'))
const Records = defineAsyncComponent(() => import('./views/Records/index.vue'))
const TranslatePanel = defineAsyncComponent(() => import('./components/TranslatePanel.vue'))
const AddProjectModal = defineAsyncComponent(() => import('./components/AddProjectModal.vue'))
const NewSkillModal = defineAsyncComponent(() => import('./components/NewSkillModal.vue'))
const AppToast = defineAsyncComponent(() => import('./components/AppToast.vue'))
import { storage } from './utils/storage'
import { applyTheme } from './utils/theme'
import { useSettings } from './composables/useSettings'
import { useSkillInventory, normalizeSkillScanResult } from './composables/useSkillInventory'
import { useTranslationQueue } from './composables/useTranslationQueue'
import { detectPlatforms, defaultPlatforms } from './data/platforms'
import { syncAllowedWriteRoots } from './utils/write-roots'
import type { Skill, PlatformInfo, ModelConfig } from './types'

const { settings } = useSettings()

const showTranslatePanel = ref(false)
const appToast = ref<InstanceType<typeof AppToast> | null>(null)
function showToast(message: string, type?: 'success' | 'error' | 'info' | 'warning') {
  appToast.value?.showToast(message, type)
}
provide(KeyShowToast, showToast)

const projectSkillsRef = ref()
const agentSkillsRef = ref()

const downloadedCount = ref(0)
const agentCount = ref(0)
const detectedPlatforms = ref<PlatformInfo[]>([])
const platformSkillCounts = ref<Record<string, number>>({})
const {
  agentSkills: inventoryAgentSkills,
  allSkills: inventoryAllSkills,
  ensureAgentSkills,
  updateAgentPlatformSkills,
  markAgentSkillsDirty,
  isAgentSkillsDirty,
  bumpCachedSkillsVersion,
} = useSkillInventory()

const {
  route,
  selectedSkill,
  detailContext,
  selectedAgentSkill,
  selectedAgentPlatformId,
  selectedDuplicateSkills,
  settingsAnchor,
  storeSubId,
  activeRoute,
  isFullHeight,
  navigate: routerNavigate,
} = useRouter()

function navigate(code: string, params?: any) {
  routerNavigate(code as RouteName, params)
  if (code === 'agent-skills') refreshCounts()
  refreshMySkills()
  if (code === 'project-skills') {
    if (selectedProject.value) {
      scanProject(selectedProject.value)
    } else if (registeredProjects.value.length) {
      selectProject(registeredProjects.value[0])
    }
  }
}

const {
  registeredProjects,
  selectedProject,
  selectedProjectSkill,
  showAddProjectModal,
  showEditProjectModal,
  editingProject,
  showImportModal,
  projectScanning,
  addProjectError,
  selectProject,
  selectProjectSkill,
  scanProject,
  handleProjectSubmit,
  editProject,
  removeProject,
} = useProjectManager({ showToast, navigate })

provide(KeySelectedProject, selectedProject)
provide(KeySelectedProjectSkill, selectedProjectSkill)
provide(KeySelectProjectSkill, selectProjectSkill)
provide(KeySelectProject, selectProject)
provide(KeyRegisteredProjects, registeredProjects)
provide(KeyOpenAddProjectModal, () => {
  showAddProjectModal.value = true
})
provide(KeyNavigateToProjectSkills, () => {
  route.value = 'project-skills'
  showAddProjectModal.value = true
})
provide(KeyDetectedPlatforms, detectedPlatforms)
provide(KeyPlatformSkillCounts, platformSkillCounts)
provide(KeyAgentSkills, inventoryAgentSkills)
provide(KeySelectedAgentPlatformId, selectedAgentPlatformId)
provide(KeyUpdateAgentPlatformSkills, updateAgentPlatformSkills)
provide(KeyMarkAgentSkillsDirty, markAgentSkillsDirty)
provide(KeyIsAgentSkillsDirty, isAgentSkillsDirty)
provide(KeyBumpCachedSkillsVersion, bumpCachedSkillsVersion)
provide(KeyScanProject, scanProject)
provide(KeyProjectScanning, projectScanning)

function refreshCounts() {
  downloadedCount.value = storage.getDownloadedIds().length
  try {
    const allPlatforms = detectPlatforms()
    const savedConfigs = storage.getPlatformConfigs()
    const installedPlatforms = allPlatforms.filter((p) => {
      if (!p.detected) return false
      const savedConfig = savedConfigs.find((c) => c.id === p.id)
      return savedConfig ? savedConfig.enabled : p.enabled
    })
    const platformOrder = storage.getPlatformOrder()
    const orderToUse = platformOrder.length ? platformOrder : defaultPlatforms.map((p) => p.id)
    const orderMap = new Map(orderToUse.map((id, idx) => [id, idx]))
    installedPlatforms.sort((a, b) => (orderMap.get(a.id) ?? Infinity) - (orderMap.get(b.id) ?? Infinity))
    agentCount.value = installedPlatforms.length
    detectedPlatforms.value = installedPlatforms
    const counts: Record<string, number> = {}
    for (const p of installedPlatforms) {
      counts[p.id] = inventoryAgentSkills.value[p.id]?.length || 0
    }
    platformSkillCounts.value = counts
    syncAllowedWriteRoots({
      projects: registeredProjects.value,
      platforms: allPlatforms,
    })
  } catch {
    agentCount.value = 0
    detectedPlatforms.value = []
  }
  refreshMySkills()
  refreshKey.value++
}

provide(KeyRefreshCounts, refreshCounts)
provide(KeyCurrentRoute, route)

const NAV_ITEM_ICONS: Record<string, string> = {
  my: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  'project-skills': 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
  'agent-skills':
    'M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5m-4.25-11.396c.251.023.501.05.75.082M12 21a8.966 8.966 0 005.982-2.275M12 21a8.966 8.966 0 01-5.982-2.275M15.75 3.186a24.284 24.284 0 011.957.967M15.75 3.186c-.376.056-.75.118-1.12.185m1.12-.185a24.284 24.284 0 00-1.957.967M6.258 5.526a24.284 24.284 0 011.957-.967m0 0A24.234 24.234 0 0112 3.493',
  store:
    'M13.5 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z',
  records: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
}

const navItems = computed(() => [
  { code: 'my', label: '我的 Skill', icon: NAV_ITEM_ICONS.my, count: downloadedCount.value },
  { code: 'project-skills', label: '项目 Skill', icon: NAV_ITEM_ICONS['project-skills'], count: registeredProjects.value.length },
  { code: 'agent-skills', label: 'Agent Skill', icon: NAV_ITEM_ICONS['agent-skills'], count: agentCount.value },
  { code: 'store', label: 'Skill 商店', icon: NAV_ITEM_ICONS.store, count: 0 },
  { code: 'records', label: '记录', icon: NAV_ITEM_ICONS.records, count: 0 },
])

let mqCleanup: (() => void) | null = null

onMounted(() => {
  storage.cleanStaleCachedSkills()
  storage.migrateFavorites()
  storage.updateChineseTags()
  syncAllowedWriteRoots({ projects: registeredProjects.value })
  refreshCounts()
  refreshMySkills()
  ensureAgentSkills()
  isAgentSkillsDirty.value = false
  applyTheme(settings)
  ;(async () => {
    const s = storage.getSettings()
    if (s.resumeTranslation && s.translationModelId) {
      const { queue: transQueue, resumeAll } = useTranslationQueue()
      if (transQueue.value.length > 0) {
        const providers = s.aiModels || []
        const sepIdx = s.translationModelId.lastIndexOf('::')
        let model: ModelConfig | undefined
        if (sepIdx >= 0) {
          const providerId = s.translationModelId.substring(0, sepIdx)
          const modelId = s.translationModelId.substring(sepIdx + 2)
          const provider = providers.find((m) => m.id === providerId)
          if (provider && provider.enabled !== false && provider.models?.some((m) => m.id === modelId && m.enabled)) {
            model = { ...provider, model: modelId } as ModelConfig
          }
        } else {
          for (const provider of providers) {
            if (provider.models) {
              const m = provider.models.find((m) => m.id === s.translationModelId && m.enabled)
              if (m && provider.enabled !== false) {
                model = { ...provider, model: m.id } as ModelConfig
                break
              }
            }
          }
        }
        if (model) {
          try {
            resumeAll(model)
          } catch {}
        }
      }
    }
  })()
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const onColorSchemeChange = () => {
    if (settings.themeMode === 'auto') applyTheme(settings)
  }
  mq.addEventListener('change', onColorSchemeChange)
  mqCleanup = () => mq.removeEventListener('change', onColorSchemeChange)
  window.ztools.onPluginEnter((_action) => {
    if (!route.value) {
      route.value = 'my'
    }
  })
  window.ztools.onPluginOut(() => {
    /* 不清理 route，保持当前页面 */
  })
})

onUnmounted(() => {
  mqCleanup?.()
})

const filterCategory = ref('all')
const filterSource = ref('')

function refreshMySkills() {
  bumpCachedSkillsVersion()
}
provide(KeyFilterCategory, filterCategory)
provide(KeyFilterSource, filterSource)
provide(KeyRefreshMySkills, refreshMySkills)
provide(KeyOpenImportModal, () => {
  showImportModal.value = true
})

const refreshKey = ref(0)
provide(KeyRefreshKey, refreshKey)
provide(KeyTriggerRefresh, () => {
  refreshKey.value++
})

const allAvailableSkills = computed<Skill[]>(() => inventoryAllSkills.value as Skill[])

const allProjectsSkills = computed<Skill[]>(() => {
  const all = registeredProjects.value.flatMap((p) => (p.skills || []).map((s) => normalizeSkillScanResult(s)))
  const seen = new Set<string>()
  return all.filter((s) => {
    const key = s.name.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
})

const currentAgentPlatform = computed(() => {
  if (route.value !== 'agent-skills' || !selectedAgentPlatformId.value) return null
  const platform = detectedPlatforms.value.find((p) => p.id === selectedAgentPlatformId.value)
  return platform ? { id: platform.id, name: platform.name } : null
})

const currentAgentPlatformSkills = computed<Skill[]>(() => {
  if (route.value !== 'agent-skills' || !selectedAgentPlatformId.value) return []
  const all = (inventoryAgentSkills.value[selectedAgentPlatformId.value] || []).map((s) => normalizeSkillScanResult(s))
  const seen = new Set<string>()
  return all.filter((s) => {
    const key = s.name.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
})

const currentPageSkills = computed<Skill[]>(() => {
  if (route.value === 'my') {
    return storage.getCachedSkills().filter((s) => storage.isDownloaded(s.id))
  } else if (route.value === 'project-skills') {
    const all = ((selectedProject.value?.skills || []) as any[]).map((s) => normalizeSkillScanResult(s))
    const seen = new Set<string>()
    return all.filter((s) => {
      const key = s.name.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  } else if (route.value === 'agent-skills') {
    const all = (Object.values(inventoryAgentSkills.value).flat() as any[]).map((s) => normalizeSkillScanResult(s))
    const seen = new Set<string>()
    return all.filter((s) => {
      const key = s.name.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  return []
})
</script>

<template>
  <div class="app-shell">
    <AddProjectModal
      v-if="showAddProjectModal"
      :submit-error="addProjectError"
      @close="((showAddProjectModal = false), (addProjectError = ''))"
      @submit="handleProjectSubmit"
    />
    <AddProjectModal
      v-if="showEditProjectModal"
      :project="editingProject"
      @close="((showEditProjectModal = false), (editingProject = null))"
      @submit="handleProjectSubmit"
    />
    <NewSkillModal
      v-if="showImportModal"
      @close="showImportModal = false"
      @imported="refreshCounts"
      @navigate="
        (route) => {
          showImportModal = false
          navigate(route)
        }
      "
    />
    <AppToast ref="appToast" />
    <div class="app-content">
      <aside class="rail-sidebar">
        <div class="rail-logo" title="技能管理器" style="cursor: pointer" @click="navigate('my')">
          <img src="/app-icon.png" alt="技能管理器" class="rail-logo-img" />
        </div>
        <nav class="rail-nav">
          <button
            v-for="item in navItems"
            :key="item.code"
            class="rail-btn"
            :class="{ active: activeRoute === item.code }"
            :title="item.label"
            @click="navigate(item.code)"
          >
            <span class="rail-btn-icon">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path :d="item.icon" />
              </svg>
            </span>
            <span class="rail-btn-label">{{ item.label }}</span>
          </button>
        </nav>
        <div class="rail-footer">
          <button class="rail-btn" :class="{ active: route === 'settings' }" title="设置" @click="navigate('settings')">
            <span class="rail-btn-icon">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path
                  d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
                />
                <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </span>
          </button>
        </div>
      </aside>

      <div class="main-area">
        <!-- ===== ALL VIEWS — SINGLE COLUMN ===== -->
        <main class="main-content" :class="{ 'full-height': isFullHeight, 'no-padding': true }">
          <KeepAlive :max="5">
            <MySkills v-if="route === 'my'" key="my" @navigate="navigate" />
            <SkillDetail v-else-if="route === 'detail'" key="detail" :skill="selectedSkill" :context="detailContext" @navigate="navigate" />
            <AgentSkillDetail
              v-else-if="route === 'agent-skill-detail'"
              key="agent-skill-detail"
              :skill="selectedAgentSkill"
              :platform-id="selectedAgentPlatformId"
              :duplicate-skills="selectedDuplicateSkills"
              @navigate="navigate"
            />
            <Sources v-else-if="route === 'sources'" key="sources" @navigate="navigate" />
            <Settings v-else-if="route === 'settings'" key="settings" :anchor="settingsAnchor" />
            <SkillStore v-else-if="route === 'store'" key="store" :store-id="storeSubId" @navigate="navigate" />
            <Records v-else-if="route === 'records'" key="records" @navigate="navigate" />
            <ProjectSkills
              v-else-if="route === 'project-skills'"
              ref="projectSkillsRef"
              key="project-skills"
              @navigate="navigate"
              @edit-project="editProject"
              @delete-project="removeProject"
            />
            <AgentSkills
              v-else-if="route === 'agent-skills'"
              ref="agentSkillsRef"
              key="agent-skills"
              :initial-platform-id="selectedAgentPlatformId"
              @navigate="navigate"
            />
          </KeepAlive>
        </main>
      </div>
    </div>

    <!-- 浮动翻译按钮 -->
    <button
      v-if="route === 'my' || route === 'project-skills' || route === 'agent-skills'"
      class="floating-translate-btn"
      title="批量翻译"
      @click="showTranslatePanel = !showTranslatePanel"
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="m5 8 6 6" />
        <path d="m4 14 6-6 2-3" />
        <path d="M2 5h12" />
        <path d="M7 2h1" />
        <path d="m22 22-5-10-5 10" />
        <path d="M14 18h6" />
      </svg>
    </button>

    <!-- 翻译面板 -->
    <TranslatePanel
      v-if="showTranslatePanel"
      :current-route="route"
      :current-skills="currentPageSkills"
      :all-skills="allAvailableSkills"
      :selected-project="selectedProject"
      :all-project-skills="allProjectsSkills"
      :selected-agent-platform="currentAgentPlatform"
      :agent-platform-skills="currentAgentPlatformSkills"
      @close="showTranslatePanel = false"
    />
  </div>
</template>

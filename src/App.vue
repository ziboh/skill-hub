<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, provide } from 'vue'
import { useRouter } from './composables/useRouter'
import { useProjectManager } from './composables/useProjectManager'
import type { RouteName } from './composables/useRouter'
import {
  KeyShowToast, KeySelectedProject, KeySelectedProjectSkill, KeySelectProjectSkill,
  KeySelectProject, KeyRegisteredProjects, KeyOpenAddProjectModal, KeyNavigateToProjectSkills,
  KeyDetectedPlatforms, KeyPlatformSkillCounts, KeyScanProject, KeyProjectScanning,
  KeyRefreshCounts, KeyCurrentRoute, KeyFilterCategory, KeyFilterSource,
  KeyRefreshMySkills, KeyOpenImportModal, KeyRefreshKey, KeyTriggerRefresh,
  KeyAgentSkills, KeyUpdateAgentPlatformSkills,
} from './inject-keys'

import SkillStore from './views/SkillStore/index.vue'
import SkillDetail from './views/SkillStore/Detail.vue'
import MySkills from './views/MySkills/index.vue'
import ProjectSkills from './views/ProjectSkills/index.vue'
import AgentSkills from './views/AgentSkills/index.vue'
import AgentSkillDetail from './views/AgentSkills/Detail.vue'
import Sources from './views/Sources/index.vue'
import Settings from './views/Settings/index.vue'
import Records from './views/Records/index.vue'
import TranslatePanel from './components/TranslatePanel.vue'
import AddProjectModal from './components/AddProjectModal.vue'
import NewSkillModal from './components/NewSkillModal.vue'
import AppToast from './components/AppToast.vue'
import { storage } from './utils/storage'
import { applyTheme } from './utils/theme'
import { useSettings } from './composables/useSettings'
import { useTheme } from './composables/useTheme'
import { useSkillInventory, normalizeSkillScanResult } from './composables/useSkillInventory'
import { detectPlatforms, getPlatformPath, defaultPlatforms } from './data/platforms'
import type { Skill, AppSettings, PlatformInfo } from './types'

const { settings, updateSettings } = useSettings()

const showTranslatePanel = ref(false)
const appToast = ref<InstanceType<typeof AppToast> | null>(null)
function showToast(message: string, type?: 'success' | 'error' | 'info' | 'warning') { appToast.value?.showToast(message, type) }
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
} = useSkillInventory()

const {
  route, subRoute, selectedSkill, detailContext,
  selectedAgentSkill, selectedAgentPlatformId, selectedDuplicateSkills,
  settingsAnchor, storeSubId,
  activeRoute, isSettings, isFullHeight, isMySkills,
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
  registeredProjects, selectedProject, selectedProjectSkill,
  showAddProjectModal, showEditProjectModal, editingProject,
  showImportModal, projectScanning, addProjectError,
  selectProject, selectProjectSkill, scanProject,
  handleProjectSubmit, editProject, removeProject,
} = useProjectManager({ showToast, navigate })

provide(KeySelectedProject, selectedProject)
provide(KeySelectedProjectSkill, selectedProjectSkill)
provide(KeySelectProjectSkill, selectProjectSkill)
provide(KeySelectProject, selectProject)
provide(KeyRegisteredProjects, registeredProjects)
provide(KeyOpenAddProjectModal, () => { showAddProjectModal.value = true })
provide(KeyNavigateToProjectSkills, () => { route.value = 'project-skills'; showAddProjectModal.value = true })
provide(KeyDetectedPlatforms, detectedPlatforms)
provide(KeyPlatformSkillCounts, platformSkillCounts)
provide(KeyAgentSkills, inventoryAgentSkills)
provide(KeyUpdateAgentPlatformSkills, updateAgentPlatformSkills)
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
    const orderToUse = platformOrder.length ? platformOrder : defaultPlatforms.map(p => p.id)
    const orderMap = new Map(orderToUse.map((id, idx) => [id, idx]))
    installedPlatforms.sort((a, b) => (orderMap.get(a.id) ?? Infinity) - (orderMap.get(b.id) ?? Infinity))
    agentCount.value = installedPlatforms.length
    detectedPlatforms.value = installedPlatforms
    const counts: Record<string, number> = {}
    for (const p of installedPlatforms) {
      counts[p.id] = inventoryAgentSkills.value[p.id]?.length || 0
    }
    platformSkillCounts.value = counts
  } catch {
    agentCount.value = 0
    detectedPlatforms.value = []
  }
  refreshMySkills()
  refreshKey.value++
}

provide(KeyRefreshCounts, refreshCounts)
provide(KeyCurrentRoute, route)

const navItems = computed(() => [
  { code: 'my', label: '我的 Skill', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', count: downloadedCount.value },
  { code: 'project-skills', label: '项目 Skill', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z', count: registeredProjects.value.length },
  { code: 'agent-skills', label: 'Agent Skill', icon: 'M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5m-4.25-11.396c.251.023.501.05.75.082M12 21a8.966 8.966 0 005.982-2.275M12 21a8.966 8.966 0 01-5.982-2.275M15.75 3.186a24.284 24.284 0 011.957.967M15.75 3.186c-.376.056-.75.118-1.12.185m1.12-.185a24.284 24.284 0 00-1.957.967M6.258 5.526a24.284 24.284 0 011.957-.967m0 0A24.234 24.234 0 0112 3.493', count: agentCount.value },
  { code: 'store', label: 'Skill 商店', icon: 'M13.5 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z', count: 0 },
  { code: 'records', label: '记录', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', count: 0 },
])

let mqCleanup: (() => void) | null = null

onMounted(() => {
  storage.cleanStaleCachedSkills()
  storage.updateChineseTags()
  window.ztools.dbStorage.removeItem('sm_translation_queue')
  refreshCounts()
  refreshMySkills()
  ensureAgentSkills()
  applyTheme(settings)
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const onColorSchemeChange = () => {
    if (settings.themeMode === 'auto') applyTheme(settings)
  }
  mq.addEventListener('change', onColorSchemeChange)
  mqCleanup = () => mq.removeEventListener('change', onColorSchemeChange)
  window.ztools.onPluginEnter((action) => {
    if (!route.value) {
      route.value = 'my'
    }
  })
  window.ztools.onPluginOut(() => { /* 不清理 route，保持当前页面 */ })
})

onUnmounted(() => {
  mqCleanup?.()
})

const storePresets = [
  { id: 'claude', name: 'Claude Code', icon: '' },
  { id: 'codex', name: 'OpenAI Codex', icon: '' },
  { id: 'skills-sh', name: 'skills.sh', icon: '' },
]

const filterCategory = ref('all')
const filterSource = ref('')

const myAllSkills = ref<Skill[]>([])
const myDownloadedIds = ref<string[]>([])
const myInstallRecords = ref<any[]>([])
const myFavoriteIds = ref<string[]>([])
const myInstalledIds = computed(() => new Set(myInstallRecords.value.map((r: any) => r.skillId)))
const myDownloadedSkills = computed(() => myAllSkills.value.filter((s: Skill) => myDownloadedIds.value.includes(s.id)))
const myCategories = computed(() => [
  { id: 'all', label: '全部', count: myDownloadedSkills.value.length },
  { id: 'favorites', label: '收藏', count: myDownloadedSkills.value.filter((s: Skill) => myFavoriteIds.value.includes(s.id)).length },
  { id: 'distributed', label: '已分发', count: myDownloadedSkills.value.filter((s: Skill) => myInstalledIds.value.has(s.id)).length },
  { id: 'pending', label: '待分发', count: myDownloadedSkills.value.filter((s: Skill) => !myInstalledIds.value.has(s.id)).length },
])
const mySources = computed(() => {
  const map = new Map<string, number>()
  for (const s of myDownloadedSkills.value) {
    const src = getSkillSourceLabel(s)
    map.set(src, (map.get(src) || 0) + 1)
  }
  return Array.from(map.entries())
})
function getSkillSourceLabel(skill: Skill): string {
  if (skill.source === 'skills-sh') return 'skills.sh'
  if (skill.repo) {
    if (skill.repo === 'anthropics/skills') return 'Claude Code'
    if (skill.repo === 'openai/skills') return 'Codex'
    return 'GitHub'
  }
  return 'Local'
}
function refreshMySkills() {
  myAllSkills.value = storage.getCachedSkills()
  myDownloadedIds.value = storage.getDownloadedIds()
  myInstallRecords.value = storage.getInstallRecords()
  myFavoriteIds.value = storage.getFavoriteIds()
}
provide(KeyFilterCategory, filterCategory)
provide(KeyFilterSource, filterSource)
provide(KeyRefreshMySkills, refreshMySkills)
provide(KeyOpenImportModal, () => { showImportModal.value = true })

const refreshKey = ref(0)
provide(KeyRefreshKey, refreshKey)
provide(KeyTriggerRefresh, () => { refreshKey.value++ })

const { isDarkMode, toggleTheme } = useTheme()

const allAvailableSkills = computed<Skill[]>(() => inventoryAllSkills.value as Skill[])

const currentPageSkills = computed<Skill[]>(() => {
  if (route.value === 'my') {
    return storage.getCachedSkills().filter(s => storage.getDownloadedIds().includes(s.id))
  } else if (route.value === 'project-skills') {
    return ((selectedProject.value?.skills || []) as any[]).map(s => normalizeSkillScanResult(s))
  } else if (route.value === 'agent-skills') {
    return (Object.values(inventoryAgentSkills.value).flat() as any[]).map(s => normalizeSkillScanResult(s))
  }
  return []
})


</script>

<template>
  <div class="app-shell">
    <div class="app-background"></div>
    <AddProjectModal v-if="showAddProjectModal" :submit-error="addProjectError" @close="showAddProjectModal = false; addProjectError = ''" @submit="handleProjectSubmit" />
    <AddProjectModal v-if="showEditProjectModal" :project="editingProject" @close="showEditProjectModal = false; editingProject = null" @submit="handleProjectSubmit" />
    <NewSkillModal v-if="showImportModal" @close="showImportModal = false" @imported="refreshCounts" @navigate="(route) => { showImportModal = false; navigate(route) }" />
    <AppToast ref="appToast" />
    <div class="app-content">
      <aside class="rail-sidebar">
        <div class="rail-logo" title="技能管理器" @click="navigate('my')" style="cursor:pointer">
          <img src="/app-icon.png" alt="技能管理器" class="rail-logo-img" />
        </div>
        <nav class="rail-nav">
          <button
            v-for="item in navItems"
            :key="item.code"
            class="rail-btn"
            :class="{ active: activeRoute === item.code }"
            @click="navigate(item.code)"
            :title="item.label"
          >
            <span class="rail-btn-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path :d="item.icon" />
              </svg>
            </span>
            <span class="rail-btn-label">{{ item.label }}</span>
          </button>
        </nav>
        <div class="rail-footer">
          <button
            class="rail-btn"
            :class="{ active: route === 'settings' }"
            @click="navigate('settings')"
            title="设置"
          >
            <span class="rail-btn-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </span>
          </button>
        </div>
      </aside>

      <div class="main-area">
        <!-- ===== ALL VIEWS — SINGLE COLUMN ===== -->
        <main class="main-content" :class="{ 'full-height': isFullHeight, 'no-padding': true }">
          <MySkills v-if="route === 'my'" @navigate="navigate" />
          <SkillDetail v-else-if="route === 'detail'" :skill="selectedSkill" :context="detailContext" @navigate="navigate" />
          <AgentSkillDetail v-else-if="route === 'agent-skill-detail'" :skill="selectedAgentSkill" :platform-id="selectedAgentPlatformId" :duplicate-skills="selectedDuplicateSkills" @navigate="navigate" />
          <Sources v-else-if="route === 'sources'" @navigate="navigate" />
          <Settings v-else-if="route === 'settings'" :anchor="settingsAnchor" />
          <SkillStore v-else-if="route === 'store'" :store-id="storeSubId" @navigate="navigate" />
          <Records v-else-if="route === 'records'" @navigate="navigate" />
          <ProjectSkills ref="projectSkillsRef" v-else-if="route === 'project-skills'" @navigate="navigate" @edit-project="editProject" @delete-project="removeProject" />
          <AgentSkills ref="agentSkillsRef" v-else-if="route === 'agent-skills'" :initial-platform-id="selectedAgentPlatformId" @navigate="navigate" />
        </main>
      </div>
    </div>

    <!-- 浮动翻译按钮 -->
    <button
      v-if="route === 'my' || route === 'project-skills' || route === 'agent-skills'"
      class="floating-translate-btn"
      @click="showTranslatePanel = !showTranslatePanel"
      title="批量翻译"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
      @close="showTranslatePanel = false"
      :current-skills="currentPageSkills"
      :all-skills="allAvailableSkills"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, watch } from 'vue'
import { KeyShowToast, KeySelectedProject, KeyRegisteredProjects, KeySelectProject, KeyNavigateToProjectSkills, KeyMarkAgentSkillsDirty } from '../inject-keys'
import { detectPlatforms, getPlatformPath } from '../data/platforms'
import { storage } from '../utils/storage'
import { normalizePath } from '../utils/path'
import type { Skill, InstallMode, RegisteredProject } from '../types'
import ProviderIcon from './ProviderIcon.vue'
import ConfirmModal from './ConfirmModal.vue'
import { getAvatarColor } from '../utils/color'

const props = defineProps<{
  skill: Skill
  projectRoot?: string
}>()

const emit = defineEmits(['close', 'deployed'])
const showToast = inject(KeyShowToast, () => {})
const selectedProject = inject(KeySelectedProject, ref(null))
const registeredProjects = inject(KeyRegisteredProjects, ref([]))
const selectProject = inject(KeySelectProject, () => {})
const navigateToProjectSkills = inject(KeyNavigateToProjectSkills, () => {})
const markAgentSkillsDirty = inject(KeyMarkAgentSkillsDirty, () => {})

const distScope = ref<'global' | 'project'>('global')
const installMode = ref<InstallMode>(storage.getSettings().defaultInstallMode)
const deploying = ref(false)
const deployProgress = ref<{ current: number; total: number; platform: string } | null>(null)
const deployResults = ref<{ platform: string; status: 'ok' | 'error'; msg: string }[]>([])

// --- Global distribution state ---
const selectedPlatforms = ref<Set<string>>(new Set())

const platforms = computed(() => {
  const saved = storage.getPlatformConfigs()
  return detectPlatforms().filter((p) => p.detected && (p.defaultPath || p.projectPath)).map((p) => {
    const cfg = saved.find((s) => s.id === p.id)
    return cfg ? { ...p, customPath: cfg.customPath, customProjectPath: cfg.customProjectPath } : p
  })
})

const physicallyInstalledPlatforms = computed(() => {
  void globalRefreshTick.value
  const result = new Set<string>()
  for (const p of platforms.value) {
    const base = getPlatformPath(p, 'global') || getPlatformPath(p, 'project')
    if (!base) continue
    if (!window.services.pathExists(base)) continue
    const existingSkills = window.services.scanForSkillFiles([base])
    const skillDir = (props.skill.path && props.skill.path !== '.') ? normalizePath(props.skill.path).split('/').pop() || props.skill.name : props.skill.name
    const exists = existingSkills.some(
      (s) => s.dir.includes(skillDir) || (s.manifest?.name || s.name).toLowerCase() === props.skill.name.toLowerCase()
    )
    if (exists) result.add(p.id)
  }
  return result
})

const sourcePlatformIds = computed(() => {
  const result = new Set<string>()
  if (props.skill.source !== 'local' || !props.skill.path) return result
  const skillPath = normalizePath(props.skill.path)
  for (const p of platforms.value) {
    const base = getPlatformPath(p, 'global') || getPlatformPath(p, 'project')
    if (!base) continue
    if (skillPath.startsWith(normalizePath(base))) {
      result.add(p.id)
    }
  }
  return result
})

const recordPlatformIds = computed(() => {
  void globalRefreshTick.value
  const records = storage.getDistributedForSkill(props.skill.id)
  const validIds = new Set<string>()
  for (const r of records) {
    if (r.targetPath && window.services.pathExists(r.targetPath)) {
      const files = window.services.readDir(r.targetPath)
      if (files.some((f: any) => f.name === 'SKILL.md' || f.name === 'skill.md')) {
        validIds.add(r.platformId)
      }
    } else {
      validIds.add(r.platformId)
    }
  }
  return validIds
})

const installedPlatformIds = computed(() => {
  const result = new Set(recordPlatformIds.value)
  for (const id of physicallyInstalledPlatforms.value) {
    result.add(id)
  }
  for (const id of sourcePlatformIds.value) {
    result.add(id)
  }
  return result
})

const selectedCount = computed(() => {
  if (distScope.value === 'global') return selectedPlatforms.value.size
  return selectedAgentDirs.value.length
})

function togglePlatform(id: string) {
  const next = new Set(selectedPlatforms.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedPlatforms.value = next
}

function toggleAll() {
  const available = platforms.value.filter((p) => !installedPlatformIds.value.has(p.id))
  if (selectedPlatforms.value.size === available.length) {
    selectedPlatforms.value = new Set()
  } else {
    selectedPlatforms.value = new Set(available.map((p) => p.id))
  }
}

const confirmGlobalUninstall = ref(false)
const uninstallPlatformId = ref('')
const globalRefreshTick = ref(0)

function confirmUninstallPlatform(id: string) {
  uninstallPlatformId.value = id
  confirmGlobalUninstall.value = true
}

function cancelGlobalUninstall() {
  confirmGlobalUninstall.value = false
  uninstallPlatformId.value = ''
}

function uninstallGlobalPlatform() {
  const pid = uninstallPlatformId.value
  const platform = platforms.value.find((p) => p.id === pid)
  const skillDir = (props.skill.path && props.skill.path !== '.') ? normalizePath(props.skill.path).split('/').pop() || props.skill.name : props.skill.name
  const base = platform ? (getPlatformPath(platform, 'global') || getPlatformPath(platform, 'project')) : ''
  if (base) {
    const targetDir = window.services.pathJoin(base, skillDir)
    try {
      if (window.services.pathExists(targetDir)) {
        window.services.removeFile(targetDir)
      }
    } catch {}
  }
  storage.removeDistributeRecord(props.skill.id, pid, 'global')
  globalRefreshTick.value++
  showToast(`已从 ${platform?.name || pid} 卸载`, 'success')
  cancelGlobalUninstall()
}

// --- Project distribution state ---
const projectList = computed(() => registeredProjects.value || [])
const selectedProjects = ref<RegisteredProject[]>([])
const selectedAgentDirs = ref<string[]>([])
const customDirInputValue = ref('')
const customAgentDirs = ref<{ id: string; name: string; path: string; type: string }[]>([])

const skillDirName = computed(() => {
  return (props.skill.path && props.skill.path !== '.')
    ? normalizePath(props.skill.path).split('/').pop() || props.skill.name
    : props.skill.name
})

function addCustomDir() {
  const p = customDirInputValue.value.trim()
  if (!p) return
  const exists = agentDirOptions.value.some(d => d.path === p)
  if (exists) {
    showToast('该路径已存在', 'warning')
    return
  }
  const dir = { id: 'custom-' + Date.now(), name: '自定义', path: p, type: 'custom' }
  customAgentDirs.value.push(dir)
  selectedAgentDirs.value.push(p)
  customDirInputValue.value = ''
}

const agentDirOptions = computed(() => {
  const dirs: { id: string; name: string; path: string; type: string }[] = [
    { id: '_generic', name: '通用位置', path: '.agents/skills', type: 'global' },
  ]
  for (const p of platforms.value) {
    const path = p.customProjectPath || p.projectPath || ''
    if (path && !dirs.some(d => d.path === path)) {
      dirs.push({ id: p.id, name: p.name, path, type: 'agent' })
    }
  }
  for (const d of customAgentDirs.value) {
    if (!dirs.some(dd => dd.path === d.path)) {
      dirs.push(d)
    }
  }
  return dirs
})

const projectDistributeRecords = ref<any[]>([])
const physicallyExistingAgentDirs = ref<Set<string>>(new Set())

function loadProjectInstallStatus() {
  const allRecords = storage.getDistributeRecords()
  const pids = new Set(selectedProjects.value.map((p) => p.id))
  if (!pids.size) { projectDistributeRecords.value = []; physicallyExistingAgentDirs.value = new Set(); return }
  const valid: any[] = []
  for (const r of allRecords) {
    if (r.scope !== 'project') continue
    let matched = false
    for (const pid of pids) {
      if (r.platformId.startsWith(`project:${pid}/`)) { matched = true; break }
    }
    if (!matched) continue
    if (r.targetPath && window.services.pathExists(r.targetPath)) {
      const files = window.services.readDir(r.targetPath)
      if (files.some((f: any) => f.name === 'SKILL.md' || f.name === 'skill.md')) {
        valid.push(r)
        continue
      }
    }
    storage.removeDistributeRecord(r.skillId, r.platformId, 'project')
  }
  projectDistributeRecords.value = valid

  const existingDirs = new Set<string>()
  const primaryProject = selectedProjects.value[0]
  if (primaryProject) {
    for (const a of agentDirOptions.value) {
      const baseDir = window.services.pathJoin(primaryProject.rootDir, a.path)
      if (!window.services.pathExists(baseDir)) continue
      const existingSkills = window.services.scanForSkillFiles([baseDir])
      const exists = existingSkills.some(
        (s: any) => s.dir.includes(skillDirName.value) || (s.manifest?.name || s.name).toLowerCase() === props.skill.name.toLowerCase()
      )
      if (exists) existingDirs.add(a.path)
    }
  }
  physicallyExistingAgentDirs.value = existingDirs
}

const sourceAgentDirs = computed(() => {
  if (!selectedProjects.value.length) return new Set<string>()
  const project = selectedProjects.value[0]
  const result = new Set<string>()
  if (props.skill.source !== 'local' || !props.skill.path) return result
  const skillPath = normalizePath(props.skill.path)
  const projectRoot = normalizePath(project.rootDir)
  if (!skillPath.startsWith(projectRoot)) return result
  for (const a of agentDirOptions.value) {
    const agentFull = normalizePath(window.services.pathJoin(projectRoot, a.path))
    if (skillPath.startsWith(agentFull)) {
      result.add(a.path)
    }
  }
  return result
})

function isProjectDirInstalled(agentPath: string): boolean {
  const project = selectedProjects.value[0]
  if (!project) return false
  const key = `project:${project.id}/${agentPath}`
  const hasRecord = projectDistributeRecords.value.some((r: any) => r.platformId === key)
  if (!hasRecord) return false
  const targetDir = window.services.pathJoin(project.rootDir, agentPath, skillDirName.value)
  if (!window.services.pathExists(targetDir)) return false
  const files = window.services.readDir(targetDir)
  return files.some((f: any) => f.name === 'SKILL.md' || f.name === 'skill.md')
}

const uninstalledAgentDirs = computed(() =>
  agentDirOptions.value.filter((a) => !isProjectDirInstalled(a.path) && !sourceAgentDirs.value.has(a.path))
)
const totalUninstalled = computed(() => uninstalledAgentDirs.value.length)

const confirmUninstall = ref(false)
const uninstallTarget = ref<{ agentPath: string; projectId: string } | null>(null)

function confirmUninstallItem(agentPath: string) {
  if (!selectedProjects.value.length) return
  const pid = selectedProjects.value[0].id
  uninstallTarget.value = { agentPath, projectId: pid }
  confirmUninstall.value = true
}

function cancelUninstall() {
  confirmUninstall.value = false
  uninstallTarget.value = null
}

function uninstall() {
  const target = uninstallTarget.value
  if (!target) { cancelUninstall(); return }
  const key = `project:${target.projectId}/${target.agentPath}`
  const record = projectDistributeRecords.value.find((r: any) => r.platformId === key)
  if (!record) { cancelUninstall(); return }

  try {
    if (record.targetPath && window.services.pathExists(record.targetPath)) {
      window.services.removeFile(record.targetPath)
    }
    storage.removeDistributeRecord(props.skill.id, key, 'project')
    loadProjectInstallStatus()
    const stillExists = projectDistributeRecords.value.some((r: any) => r.platformId === key)
    if (stillExists) {
      showToast('卸载失败：记录删除异常', 'error')
    } else {
      showToast(`已从项目卸载`, 'success')
    }
  } catch (err: any) {
    showToast('卸载失败: ' + (err.message || '未知错误'), 'error')
  }
  cancelUninstall()
}

const selectedProjectCount = computed(() => selectedProjects.value.length)

function toggleProject(p: RegisteredProject) {
  const idx = selectedProjects.value.findIndex((sp) => sp.id === p.id)
  if (idx >= 0) selectedProjects.value.splice(idx, 1)
  else selectedProjects.value.push(p)
}

function isSelectedProject(p: RegisteredProject): boolean {
  return selectedProjects.value.some((sp) => sp.id === p.id)
}

function toggleAllProjects() {
  if (selectedProjects.value.length === projectList.value.length) {
    selectedProjects.value = []
  } else {
    selectedProjects.value = [...projectList.value]
  }
}

function toggleAgentDir(path: string) {
  const idx = selectedAgentDirs.value.indexOf(path)
  if (idx >= 0) selectedAgentDirs.value.splice(idx, 1)
  else selectedAgentDirs.value.push(path)
}

function toggleAllAgentDirs() {
  const available = uninstalledAgentDirs.value.map((a) => a.path)
  if (selectedAgentDirs.value.length === available.length) {
    selectedAgentDirs.value = []
  } else {
    selectedAgentDirs.value = [...available]
  }
}

watch(() => selectedProjects.value.map((p) => p.id), () => {
  loadProjectInstallStatus()
  selectedAgentDirs.value = []
  customAgentDirs.value = []
})

// --- Deploy logic ---
function resolveSourceDir(skill: Skill): string | null {
  const repoDir = window.services.pathJoin(window.ztools.getPath('userData'), 'skills-repo', skill.id)
  if (window.services.pathExists(repoDir)) return repoDir
  const localPath = (skill as any).path
  if (localPath && window.services.pathExists(localPath)) return localPath
  return null
}

async function deploy() {
  if (deploying.value) return

  if (distScope.value === 'global') {
    await deployGlobal()
  } else {
    await deployProject()
  }
}

async function deployGlobal() {
  if (!selectedPlatforms.value.size) return
  deploying.value = true
  deployResults.value = []
  deployProgress.value = { current: 0, total: selectedPlatforms.value.size, platform: '' }

  const sourceDir = resolveSourceDir(props.skill)
  if (!sourceDir) {
    showToast(`「${props.skill.name}」的源文件不存在，无法分发`, 'error')
    deploying.value = false
    return
  }
  const pids = Array.from(selectedPlatforms.value)
  let done = 0

  for (const pid of pids) {
    const platform = platforms.value.find((p) => p.id === pid)
    if (!platform) { done++; continue }
    deployProgress.value = { current: done, total: pids.length, platform: platform.name }

    const base = getPlatformPath(platform, 'global') || getPlatformPath(platform, 'project')
    if (!base) {
      deployResults.value.push({ platform: platform.name, status: 'error', msg: '未配置路径' })
      done++
      continue
    }

    const skillDir = (props.skill.path && props.skill.path !== '.') ? normalizePath(props.skill.path).split('/').pop() || props.skill.name : props.skill.name
    const targetDir = window.services.pathJoin(base, skillDir)

    try {
      window.services.mkdir(targetDir)
      if (installMode.value === 'symlink') {
        window.services.createSymlink(sourceDir, targetDir)
      } else {
        window.services.copyFile(sourceDir, targetDir)
      }
      storage.saveDistributeRecord({
        skillId: props.skill.id,
        platformId: pid,
        mode: installMode.value,
        scope: 'global',
        targetPath: targetDir,
        sourceDir,
        distributedAt: new Date().toISOString(),
      })
      deployResults.value.push({ platform: platform.name, status: 'ok', msg: installMode.value === 'symlink' ? '已链接' : '已复制' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误'
      deployResults.value.push({ platform: platform.name, status: 'error', msg })
      storage.addFailureRecord({ type: 'distribution', skillId: props.skill.id, skillName: props.skill.name, error: msg, details: `分发到 ${platform.name} 失败` })
    }
    done++
  }

  deployProgress.value = null
  deploying.value = false

  const okCount = deployResults.value.filter((r) => r.status === 'ok').length
  const errCount = deployResults.value.filter((r) => r.status === 'error').length
  if (okCount > 0) showToast(`已将 ${props.skill.name} 分发到 ${okCount} 个平台`, 'success')
  if (errCount > 0) showToast(`${errCount} 个平台分发失败`, 'error')
  markAgentSkillsDirty()
  emit('deployed')
}

async function deployProject() {
  const projects = selectedProjects.value
  if (!projects.length) { showToast('请先选择项目', 'error'); return }
  const agentPaths = [...selectedAgentDirs.value]
  if (!agentPaths.length) { showToast('请先选择保存位置', 'error'); return }

  deploying.value = true
  deployResults.value = []
  const totalItems = projects.length * agentPaths.length
  deployProgress.value = { current: 0, total: totalItems, platform: '' }

  const sourceDir = resolveSourceDir(props.skill)
  if (!sourceDir) {
    showToast(`「${props.skill.name}」的源文件不存在，无法分发`, 'error')
    deploying.value = false
    return
  }

  let done = 0
  for (const project of projects) {
    for (const agentPath of agentPaths) {
      const targetDir = window.services.pathJoin(project.rootDir, agentPath, skillDirName.value)
      deployProgress.value = { current: done, total: totalItems, platform: `${project.name}/${agentPath}` }

      try {
        window.services.mkdir(targetDir)
        if (installMode.value === 'symlink') {
          window.services.createSymlink(sourceDir, targetDir)
        } else {
          window.services.copyFile(sourceDir, targetDir)
        }
        storage.saveDistributeRecord({
          skillId: props.skill.id,
          platformId: `project:${project.id}/${agentPath}`,
          mode: installMode.value,
          scope: 'project',
          targetPath: targetDir,
          sourceDir,
          distributedAt: new Date().toISOString(),
        })
        deployResults.value.push({ platform: `${project.name}/${agentPath}`, status: 'ok', msg: installMode.value === 'symlink' ? '已链接' : '已复制' })
      } catch (err) {
        const msg = err instanceof Error ? err.message : '未知错误'
        deployResults.value.push({ platform: `${project.name}/${agentPath}`, status: 'error', msg })
        storage.addFailureRecord({ type: 'distribution', skillId: props.skill.id, skillName: props.skill.name, error: msg, details: `分发到 ${project.name}/${agentPath} 失败` })
      }
      done++
    }
  }

  deployProgress.value = null
  deploying.value = false

  const okCount = deployResults.value.filter((r) => r.status === 'ok').length
  const errCount = deployResults.value.filter((r) => r.status === 'error').length
  if (okCount > 0) {
    const detail = projects.length === 1 ? projects[0].name : `${projects.length} 个项目`
    showToast(`已将 ${props.skill.name} 分发到${detail}`, 'success')
  }
  if (errCount > 0) showToast(`${errCount} 个位置分发失败`, 'error')
  emit('deployed')
}

const confirmBtnDisabled = computed(() => {
  if (deploying.value) return true
  if (distScope.value === 'global') return !selectedPlatforms.value.size
  return !selectedProjects.value.length || !selectedAgentDirs.value.length
})

const confirmBtnText = computed(() => {
  if (deploying.value) return deployProgress.value ? `${deployProgress.value.current}/${deployProgress.value.total}` : '分发中...'
  if (distScope.value === 'global') return `分发到 ${selectedPlatforms.value.size} 个平台`
  const projectCount = selectedProjects.value.length
  const dirCount = selectedAgentDirs.value.length
  if (projectCount > 1) return `分发到 ${projectCount} 个项目`
  return `分发到 ${dirCount} 个位置`
})

watch(() => distScope.value, () => {
  deployResults.value = []
  deployProgress.value = null
  if (distScope.value === 'project') {
    loadProjectInstallStatus()
  }
})
</script>

<template>
  <div class="deploy-overlay" @click.self="emit('close')">
    <div class="deploy-modal">
      <!-- Header -->
      <div class="deploy-header">
        <div class="deploy-skill">
          <div class="deploy-skill-avatar" :style="{ background: getAvatarColor(skill.name) }">
            {{ skill.name.charAt(0).toUpperCase() }}
          </div>
          <div class="deploy-skill-info">
            <h3 class="deploy-skill-name">{{ skill.name }}</h3>
            <span class="deploy-skill-desc">{{ skill.description || '暂无描述' }}</span>
          </div>
        </div>
        <button class="deploy-close" @click="emit('close')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <!-- Content -->
      <div class="deploy-content">
        <!-- Scope toggle -->
        <div class="scope-toggle">
          <button :class="{ active: distScope === 'global' }" @click="distScope = 'global'" :disabled="deploying">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            全局分发
          </button>
          <button :class="{ active: distScope === 'project' }" @click="distScope = 'project'" :disabled="deploying">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            项目分发
          </button>
        </div>

        <!-- Install mode -->
        <div class="deploy-section">
          <div class="mode-toggle">
            <button :class="{ active: installMode === 'copy' }" @click="installMode = 'copy'" :disabled="deploying">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              复制
            </button>
            <button :class="{ active: installMode === 'symlink' }" @click="installMode = 'symlink'" :disabled="deploying">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              软链接
            </button>
          </div>
        </div>

        <!-- Global: Platform selection -->
        <template v-if="distScope === 'global'">
          <div class="deploy-section">
            <div class="deploy-section-header">
              <h4 class="deploy-section-title">选择平台</h4>
              <span class="deploy-section-badge">{{ selectedPlatforms.size }} / {{ platforms.filter(p => !installedPlatformIds.has(p.id)).length }}</span>
              <button class="deploy-select-all" @click="toggleAll" :disabled="deploying">
                {{ selectedPlatforms.size === platforms.filter(p => !installedPlatformIds.has(p.id)).length ? '取消全选' : '全选' }}
              </button>
            </div>

            <div v-if="!platforms.length" class="deploy-empty">
              <p>未检测到已配置的 AI 平台</p>
            </div>
            <div v-else class="deploy-platform-grid">
              <div
                v-for="p in platforms"
                :key="p.id"
                class="deploy-platform-card"
                :class="{
                  installed: recordPlatformIds.has(p.id),
                  source: sourcePlatformIds.has(p.id),
                  existing: physicallyInstalledPlatforms.has(p.id) && !recordPlatformIds.has(p.id) && !sourcePlatformIds.has(p.id),
                  selected: selectedPlatforms.has(p.id),
                  disabled: deploying || recordPlatformIds.has(p.id) || sourcePlatformIds.has(p.id)
                }"
                @click="!recordPlatformIds.has(p.id) && !sourcePlatformIds.has(p.id) && !deploying && togglePlatform(p.id)"
              >
                <div class="deploy-platform-icon">
                  <ProviderIcon :icon="p.id" :size="28" variant="mono" />
                </div>
                <div class="deploy-platform-info">
                  <span class="deploy-platform-name">{{ p.name }}</span>
                  <span v-if="recordPlatformIds.has(p.id)" class="deploy-platform-status installed">已分发</span>
                  <span v-else-if="sourcePlatformIds.has(p.id)" class="deploy-platform-status source">源文件</span>
                  <span v-else-if="physicallyInstalledPlatforms.has(p.id) && selectedPlatforms.has(p.id)" class="deploy-platform-status existing">覆盖</span>
                  <span v-else-if="physicallyInstalledPlatforms.has(p.id)" class="deploy-platform-status existing">已存在</span>
                  <span v-else-if="selectedPlatforms.has(p.id)" class="deploy-platform-status selected">待分发</span>
                  <span v-else class="deploy-platform-status">点击选择</span>
                </div>
                <button v-if="recordPlatformIds.has(p.id)" class="uninstall-btn" title="卸载" @click.stop="confirmUninstallPlatform(p.id)" :disabled="deploying">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
                <div v-else-if="sourcePlatformIds.has(p.id)" class="deploy-platform-check installed">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div v-else class="deploy-platform-check" :class="{ checked: selectedPlatforms.has(p.id) }">
                  <svg v-if="selectedPlatforms.has(p.id)" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- Project: Project + Agent dir selection -->
        <template v-else>
          <!-- Project selection -->
          <div class="deploy-section">
            <div class="deploy-section-header">
              <h4 class="deploy-section-title">选择项目</h4>
              <button v-if="projectList.length > 1" class="deploy-select-all" @click="toggleAllProjects" :disabled="deploying">
                {{ selectedProjects.length === projectList.length ? '取消全选' : '全选' }}
              </button>
              <button class="deploy-add-project-btn" @click="navigateToProjectSkills" :disabled="deploying">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                添加项目
              </button>
            </div>

            <div v-if="projectList.length > 0" class="project-select-list">
              <div
                v-for="p in projectList"
                :key="p.id"
                class="project-select-item"
                :class="{ active: isSelectedProject(p) }"
                @click="!deploying && toggleProject(p)"
              >
                <div class="project-select-checkbox" :class="{ checked: isSelectedProject(p) }">
                  <svg v-if="isSelectedProject(p)" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                <span class="project-select-name">{{ p.name }}</span>
              </div>
            </div>
            <div v-else class="deploy-empty">
              <p>暂无项目，请先添加</p>
            </div>
            <div v-if="selectedProjects.length" class="project-hint">
              已选 {{ selectedProjects.length }} 个项目
            </div>
          </div>

          <!-- Agent dir selection (shown when project selected) -->
          <div v-if="selectedProjects.length" class="deploy-section">
            <div class="deploy-section-header">
              <h4 class="deploy-section-title">选择位置</h4>
              <span class="deploy-section-badge">{{ selectedAgentDirs.length }} / {{ uninstalledAgentDirs.length }}</span>
              <button class="deploy-select-all" @click="toggleAllAgentDirs" :disabled="deploying">
                {{ selectedAgentDirs.length === uninstalledAgentDirs.length ? '取消全选' : '全选' }}
              </button>
            </div>

            <div class="deploy-platform-grid">
              <div
                v-for="a in agentDirOptions"
                :key="a.id"
                class="deploy-platform-card"
                :class="{
                  installed: isProjectDirInstalled(a.path),
                  source: sourceAgentDirs.has(a.path),
                  existing: physicallyExistingAgentDirs.has(a.path) && !isProjectDirInstalled(a.path) && !sourceAgentDirs.has(a.path),
                  selected: selectedAgentDirs.includes(a.path),
                  disabled: deploying || isProjectDirInstalled(a.path) || sourceAgentDirs.has(a.path)
                }"
                @click="!isProjectDirInstalled(a.path) && !sourceAgentDirs.has(a.path) && !deploying && toggleAgentDir(a.path)"
              >
                <div class="deploy-platform-icon">
                  <ProviderIcon :icon="(a.type === 'generic' || a.type === 'custom') ? '_generic' : a.id" :size="28" variant="mono" />
                </div>
                <div class="deploy-platform-info">
                  <span class="deploy-platform-name">{{ a.name }}</span>
                  <span class="deploy-platform-sub">/{{ a.path }}</span>
                  <span v-if="isProjectDirInstalled(a.path)" class="deploy-platform-status installed">已分发</span>
                  <span v-else-if="sourceAgentDirs.has(a.path)" class="deploy-platform-status source">源文件</span>
                  <span v-else-if="physicallyExistingAgentDirs.has(a.path) && selectedAgentDirs.includes(a.path)" class="deploy-platform-status existing">覆盖</span>
                  <span v-else-if="physicallyExistingAgentDirs.has(a.path)" class="deploy-platform-status existing">已存在</span>
                  <span v-else-if="selectedAgentDirs.includes(a.path)" class="deploy-platform-status selected">待分发</span>
                  <span v-else class="deploy-platform-status">点击选择</span>
                </div>
                <button v-if="isProjectDirInstalled(a.path)" class="uninstall-btn" title="卸载" @click.stop="confirmUninstallItem(a.path)" :disabled="deploying">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
                <div v-else-if="sourceAgentDirs.has(a.path)" class="deploy-platform-check installed">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div v-else class="deploy-platform-check" :class="{ checked: selectedAgentDirs.includes(a.path) }">
                  <svg v-if="selectedAgentDirs.includes(a.path)" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
              </div>
            </div>
            <div class="custom-dir-row">
              <input v-model="customDirInputValue" placeholder="自定义目录路径，如 .claude/skills" class="custom-dir-input" :disabled="deploying" @keyup.enter="addCustomDir" />
              <button class="custom-dir-add-btn" @click="addCustomDir" :disabled="deploying || !customDirInputValue.trim()">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                添加
              </button>
            </div>
          </div>
        </template>

        <!-- Progress -->
        <div v-if="deployProgress" class="deploy-progress">
          <div class="deploy-progress-text">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            正在分发到 {{ deployProgress.platform }}... ({{ deployProgress.current }}/{{ deployProgress.total }})
          </div>
          <div class="deploy-progress-bar">
            <div class="deploy-progress-fill" :style="{ width: `${(deployProgress.current / deployProgress.total) * 100}%` }"></div>
          </div>
        </div>

        <!-- Results -->
        <div v-if="deployResults.length && !deploying" class="deploy-results">
          <div v-for="r in deployResults" :key="r.platform" class="deploy-result" :class="r.status">
            <svg v-if="r.status === 'ok'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            <span class="deploy-result-name">{{ r.platform }}</span>
            <span class="deploy-result-msg">{{ r.msg }}</span>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="deploy-footer">
        <button class="deploy-btn cancel" @click="emit('close')" :disabled="deploying">取消</button>
        <button class="deploy-btn confirm" :disabled="confirmBtnDisabled" @click="deploy">
          <svg v-if="deploying" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          {{ confirmBtnText }}
        </button>
      </div>
    </div>
  </div>
  <ConfirmModal v-if="confirmGlobalUninstall" title="卸载 Skill" :message="`确定要从该平台卸载 <strong>${props.skill.name}</strong> 吗？`" @confirm="uninstallGlobalPlatform" @cancel="cancelGlobalUninstall" />
  <ConfirmModal v-if="confirmUninstall" title="卸载 Skill" :message="`确定要从项目卸载 <strong>${props.skill.name}</strong> 吗？`" @confirm="uninstall" @cancel="cancelUninstall" />
</template>



<style scoped>
.deploy-overlay { position: fixed; inset: 0; background: hsl(0 0% 0% / 0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(4px); }
.deploy-modal { width: 520px; max-width: 90vw; height: 65vh; min-height: 420px; max-height: 85vh; background: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: 20px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 24px 64px hsl(0 0% 0% / 0.2); }

/* Header */
.deploy-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid hsl(var(--border)); }
.deploy-skill { display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1; }
.deploy-skill-avatar { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; color: #fff; flex-shrink: 0; }
.deploy-skill-info { min-width: 0; }
.deploy-skill-name { font-size: 16px; font-weight: 700; color: hsl(var(--foreground)); margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.deploy-skill-desc { font-size: 12px; color: hsl(var(--muted-foreground)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; margin-top: 2px; }
.deploy-close { width: 32px; height: 32px; border-radius: 8px; border: none; background: transparent; color: hsl(var(--muted-foreground)); cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all var(--duration-base) var(--ease-standard); }
.deploy-close:hover { background: hsl(var(--muted)); color: hsl(var(--foreground)); }

/* Content */
.deploy-content { flex: 1; overflow-y: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 20px; }

/* Scope toggle */
.scope-toggle { display: flex; gap: 4px; padding: 3px; background: hsl(var(--accent) / 0.4); border-radius: 10px; }
.scope-toggle button { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 0; font-size: 12px; font-weight: 500; border-radius: 8px; border: none; background: transparent; color: hsl(var(--muted-foreground)); cursor: pointer; transition: all var(--duration-base) var(--ease-standard); }
.scope-toggle button.active { background: hsl(var(--card)); color: hsl(var(--primary)); box-shadow: 0 1px 3px hsl(0 0% 0% / 0.08); }
.scope-toggle button:disabled { opacity: 0.5; cursor: default; }

/* Sections */
.deploy-section { display: flex; flex-direction: column; gap: 10px; }
.deploy-section-header { display: flex; align-items: center; gap: 8px; }
.deploy-section-title { font-size: 11px; font-weight: 700; color: hsl(var(--muted-foreground)); text-transform: uppercase; letter-spacing: 0.1em; margin: 0; }
.deploy-section-badge { font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 6px; background: hsl(var(--primary) / 0.1); color: hsl(var(--primary)); }
.deploy-select-all { margin-left: auto; font-size: 11px; font-weight: 600; color: hsl(var(--primary)); background: none; border: none; cursor: pointer; padding: 0; transition: opacity var(--duration-base) var(--ease-standard); }
.deploy-select-all:hover { opacity: 0.7; }
.deploy-select-all:disabled { opacity: 0.4; cursor: default; }
.deploy-add-project-btn { display: flex; align-items: center; gap: 3px; margin-left: auto; padding: 4px 8px; font-size: 11px; font-weight: 600; border-radius: 5px; border: 1px solid hsl(var(--primary) / 0.3); background: hsl(var(--primary) / 0.1); color: hsl(var(--primary)); cursor: pointer; transition: all var(--duration-base) var(--ease-standard); white-space: nowrap; }
.deploy-add-project-btn:hover { background: hsl(var(--primary) / 0.2); }
.deploy-add-project-btn:disabled { opacity: 0.4; cursor: default; }

/* Mode toggle */
.mode-toggle { display: flex; gap: 4px; padding: 3px; background: hsl(var(--accent) / 0.4); border-radius: 10px; }
.mode-toggle button { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 0; font-size: 12px; font-weight: 500; border-radius: 8px; border: none; background: transparent; color: hsl(var(--muted-foreground)); cursor: pointer; transition: all var(--duration-base) var(--ease-standard); }
.mode-toggle button.active { background: hsl(var(--card)); color: hsl(var(--primary)); box-shadow: 0 1px 3px hsl(0 0% 0% / 0.08); }
.mode-toggle button:disabled { opacity: 0.5; cursor: default; }

/* Platform grid */
.deploy-platform-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.deploy-platform-card { display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 12px; border: 1px solid hsl(var(--border)); background: hsl(var(--card)); cursor: pointer; transition: all var(--duration-base) var(--ease-standard); text-align: left; }
.deploy-platform-card:hover:not(.installed):not(.source):not(.disabled) { border-color: hsl(var(--primary) / 0.3); background: hsl(var(--primary) / 0.03); }
.deploy-platform-card.selected { border-color: hsl(var(--primary)); background: hsl(var(--primary) / 0.06); }
.deploy-platform-card.installed { border-color: hsl(142 50% 50% / 0.2); background: hsl(142 50% 50% / 0.03); cursor: default; }
.deploy-platform-card.source { border-color: hsl(var(--primary) / 0.2); background: hsl(var(--primary) / 0.03); cursor: default; }
.deploy-platform-card.existing { border-color: hsl(38 80% 50% / 0.2); background: hsl(38 80% 50% / 0.03); }
.deploy-platform-card.disabled { opacity: 0.6; cursor: default; }
.deploy-platform-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: hsl(var(--muted)); flex-shrink: 0; overflow: hidden; }
.deploy-platform-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.deploy-platform-name { font-size: 12px; font-weight: 600; color: hsl(var(--foreground)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.deploy-platform-sub { font-size: 10px; font-weight: 400; color: hsl(var(--muted-foreground)); }
.deploy-platform-status { font-size: 10px; color: hsl(var(--muted-foreground)); }
.deploy-platform-status.installed { color: hsl(142 50% 40%); }
.deploy-platform-status.source { color: hsl(var(--primary)); }
.deploy-platform-status.existing { color: hsl(38 90% 45%); }
.deploy-platform-status.selected { color: hsl(var(--primary)); }
.deploy-platform-check { width: 20px; height: 20px; border-radius: 6px; border: 2px solid hsl(var(--border)); display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all var(--duration-base) var(--ease-standard); }
.deploy-platform-check.checked { background: hsl(var(--primary)); border-color: hsl(var(--primary)); color: #fff; }
.deploy-platform-check.installed { border-color: hsl(142 50% 50%); color: hsl(142 50% 40%); background: transparent; }
.deploy-platform-check.existing { border-color: hsl(38 80% 50%); color: hsl(38 80% 40%); background: transparent; }
.uninstall-btn { display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 6px; border: 1px solid hsl(var(--destructive) / 0.2); background: hsl(var(--destructive) / 0.08); color: hsl(var(--destructive)); cursor: pointer; flex-shrink: 0; transition: all var(--duration-base) var(--ease-standard); padding: 0; }
.uninstall-btn:hover { background: hsl(var(--destructive) / 0.15); border-color: hsl(var(--destructive) / 0.4); }
.uninstall-btn:disabled { opacity: 0.4; cursor: default; }

.deploy-empty { display: flex; align-items: center; justify-content: center; padding: 32px; color: hsl(var(--muted-foreground)); font-size: 13px; }

/* Project selection */
.project-select-list { display: flex; flex-direction: column; gap: 4px; }
.project-select-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; border: 1px solid hsl(var(--border)); background: hsl(var(--accent) / 0.15); cursor: pointer; transition: all var(--duration-base) var(--ease-standard); }
.project-select-item:hover { background: hsl(var(--accent) / 0.45); border-color: hsl(var(--primary) / 0.3); }
.project-select-item.active { border-color: hsl(var(--primary) / 0.45); background: hsl(var(--primary) / 0.08); }
.project-select-checkbox { width: 18px; height: 18px; border-radius: 5px; border: 2px solid hsl(var(--border)); background: transparent; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.project-select-checkbox.checked { background: hsl(var(--primary)); border-color: hsl(var(--primary)); }
.project-select-checkbox.checked svg { color: #fff; }
.project-select-name { font-size: 12px; font-weight: 600; color: hsl(var(--primary)); flex: 1; }
.project-hint { padding: 8px 12px; border-radius: 8px; background: hsl(var(--primary) / 0.08); border: 1px solid hsl(var(--primary) / 0.15); font-size: 11px; color: hsl(var(--primary)); text-align: center; }

/* Custom dir input */
.custom-dir-row { display: flex; gap: 6px; margin-top: 4px; align-items: center; }
.custom-dir-input { flex: 1; padding: 8px 10px; font-size: 12px; border-radius: 8px; border: 1px solid hsl(var(--border)); background: hsl(var(--accent) / 0.3); color: hsl(var(--foreground)); outline: none; font-family: inherit; box-sizing: border-box; }
.custom-dir-input::placeholder { color: hsl(var(--muted-foreground)); }
.custom-dir-input:focus { border-color: hsl(var(--primary) / 0.5); }
.custom-dir-input:disabled { opacity: 0.5; cursor: default; }
.custom-dir-add-btn { display: flex; align-items: center; gap: 3px; padding: 8px 12px; font-size: 12px; font-weight: 600; border-radius: 8px; border: 1px solid hsl(var(--primary) / 0.3); background: hsl(var(--primary) / 0.1); color: hsl(var(--primary)); cursor: pointer; white-space: nowrap; transition: all var(--duration-base) var(--ease-standard); flex-shrink: 0; }
.custom-dir-add-btn:hover:not(:disabled) { background: hsl(var(--primary) / 0.2); }
.custom-dir-add-btn:disabled { opacity: 0.4; cursor: default; }

/* Progress */
.deploy-progress { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 10px; background: hsl(var(--primary) / 0.05); border: 1px solid hsl(var(--primary) / 0.15); }
.deploy-progress-text { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 500; color: hsl(var(--primary)); }
.deploy-progress-bar { height: 4px; border-radius: 2px; background: hsl(var(--primary) / 0.15); overflow: hidden; }
.deploy-progress-fill { height: 100%; border-radius: 2px; background: hsl(var(--primary)); transition: width var(--duration-smooth) var(--ease-standard); }

/* Results */
.deploy-results { display: flex; flex-direction: column; gap: 4px; }
.deploy-result { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; font-size: 12px; }
.deploy-result.ok { background: hsl(142 50% 50% / 0.06); color: hsl(142 50% 35%); }
.deploy-result.error { background: hsl(var(--destructive) / 0.06); color: hsl(var(--destructive)); }
.deploy-result-name { font-weight: 600; }
.deploy-result-msg { color: hsl(var(--muted-foreground)); }

/* Footer */
.deploy-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 16px 24px; border-top: 1px solid hsl(var(--border)); }
.deploy-btn { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 20px; font-size: 13px; font-weight: 600; border-radius: 10px; border: none; cursor: pointer; transition: all var(--duration-base) var(--ease-standard); }
.deploy-btn.cancel { background: hsl(var(--muted)); color: hsl(var(--muted-foreground)); }
.deploy-btn.cancel:hover { background: hsl(var(--muted) / 0.8); }
.deploy-btn.confirm { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); }
.deploy-btn.confirm:hover { opacity: 0.9; }
.deploy-btn.confirm:disabled { opacity: 0.5; cursor: default; }

@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin 0.7s linear infinite; }
</style>

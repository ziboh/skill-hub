<script setup lang="ts">
import { inject, ref, computed, unref, onDeactivated, watch } from 'vue'
import {
  KeyShowToast,
  KeyScanProject,
  KeyProjectScanning,
  KeySelectProject,
  KeyOpenAddProjectModal,
  KeyDetectedPlatforms,
  KeyRefreshCounts,
  KeyRefreshKey,
} from '../../inject-keys'
import { storage } from '../../utils/storage'
import { isChineseContent } from '../../utils/translate'
import { useSettings } from '../../composables/useSettings'
import { useTheme } from '../../composables/useTheme'
import { useProjectState } from '../../composables/useProjectState'
import { useBatchSelection } from '../../composables/useBatchSelection'
import { normalizePath } from '../../utils/path'
import type { Skill, SkillScanResult, PlatformInfo } from '../../types'
import { getAllPlatformDefinitions, findPlatformById, getPlatformPath, platformDisplayIcon } from '../../data/platforms'
import SkillCard from '../../components/SkillCard.vue'
import SkillEnabledToggle from '../../components/SkillEnabledToggle.vue'
import ProviderIcon from '../../components/ProviderIcon.vue'
import DeployModal from '../../components/DeployModal.vue'
import QuickSwitcher from '../../components/QuickSwitcher.vue'
import ConfirmModal from '../../components/ConfirmModal.vue'
import ConfirmUninstallSkillModal from '../../components/ConfirmUninstallSkillModal.vue'
import { getAvatarColor } from '../../utils/color'
import { cacheVersion as translationCacheVersion } from '../../composables/useTranslationQueue'
import { getSkillsRepoDir } from '../../utils/skill-path'
import { safeRemovePath } from '../../utils/fs-ops'
import { importScanResultToMySkills } from '../../utils/skill-import'
import { makeProjectPlatformKey } from '../../utils/skill-deploy'
import { normalizeSkillNameKey, getSkillDisplayName } from '../../utils/skill-identity'
import { sortProcessedSkillsLast } from '../../utils/skill-modal-sort'
import { isSkillEnabled, toggleSkillEnabled } from '../../utils/skill-toggle'

const emit = defineEmits(['navigate', 'edit-project', 'delete-project'])

const scanProject = inject(KeyScanProject, () => {})
const projectScanning = inject(KeyProjectScanning, ref(false))
const showToast = inject(KeyShowToast, () => {})
const { registeredProjects, selectedProject } = useProjectState()
const selectProject = inject(KeySelectProject, () => {})
const openAddProjectModal = inject(KeyOpenAddProjectModal, () => {})
const detectedPlatforms = inject(KeyDetectedPlatforms, ref<PlatformInfo[]>([]))
const refreshCounts = inject(KeyRefreshCounts, () => {})
const refreshKey = inject(KeyRefreshKey, ref(0))

const importing = ref<Record<string, boolean>>({})
const toggling = ref<Record<string, boolean>>({})
const confirmImportSkill = ref<SkillScanResult | null>(null)
const showBatchImportConfirm = ref(false)

const confirmDeleteProjectId = ref<string | null>(null)
const confirmDeleteProjectName = ref('')

const confirmUninstallSkill = ref<any>(null)
const uninstalling = ref(false)

const showBatchRemoveConfirm = ref(false)

const downloadedIds = ref<string[]>(storage.getDownloadedIds())

function refreshDownloaded() {
  downloadedIds.value = storage.getDownloadedIds()
  refreshInstallDirs()
}

const { settings, updateSettings: _updateSettings } = useSettings()
const { isDarkMode, toggleTheme } = useTheme()

const skillFilter = ref<string>('')
const agentFilter = ref<string>('')
const viewMode = ref<'grid' | 'list'>('grid')
const showAgentDropdown = ref(false)
const agentBtnRef = ref<HTMLElement>()
const agentDropdownStyle = ref<Record<string, string>>({})

function toggleAgentDropdown() {
  if (showAgentDropdown.value) {
    showAgentDropdown.value = false
  } else {
    const btn = agentBtnRef.value
    if (btn) {
      const rect = btn.getBoundingClientRect()
      const dropdownWidth = 180
      let left = rect.left
      if (left + dropdownWidth > window.innerWidth - 12) {
        left = window.innerWidth - dropdownWidth - 12
      }
      agentDropdownStyle.value = {
        top: `${rect.bottom + 6}px`,
        left: `${left}px`,
      }
    }
    showAgentDropdown.value = true
  }
}

function findDownloadedSkill(skill: any): Skill | null {
  const skillDir = normalizePath(skill.dir || '')
  if (!skillDir) return null
  const cached = storage.getDownloadedSkills()
  const downloadedSet = new Set(downloadedIds.value)
  const byPath = cached.find((s) => downloadedSet.has(s.id) && normalizePath(s.path || '') === skillDir)
  if (byPath) return byPath
  const record = storage.getDistributeRecords().find((r) => normalizePath(r.targetPath) === skillDir)
  if (record) {
    const byId = cached.find((s) => s.id === record.skillId)
    if (byId) return byId
  }
  return null
}

function isInMySkills(skill: any): boolean {
  return findDownloadedSkill(skill) !== null
}

function getProjectInstallDirSet(): Set<string> {
  const records = storage.getDistributeRecords()
  const projectId = selectedProject.value?.id
  return new Set(
    records
      .filter((r) =>
        projectId
          ? r.scope === 'project' &&
            (r.platformId === projectId || r.platformId.startsWith(`project:${projectId}/`))
          : r.scope === 'project',
      )
      .map((r) => normalizePath(r.targetPath)),
  )
}

const _projectInstallDirs = ref<Set<string>>(getProjectInstallDirSet())

function refreshInstallDirs() {
  _projectInstallDirs.value = getProjectInstallDirSet()
}

watch(
  () => selectedProject.value?.id,
  () => {
    refreshInstallDirs()
  },
)

watch(refreshKey, () => {
  refreshInstallDirs()
})

function getBadgeType(skill: any): string {
  const skillDir = normalizePath(skill.dir || '')
  const cached = findDownloadedSkill(skill)
  if (cached && cached.source === 'local') {
    const cachedPath = normalizePath(cached.path || '')
    if (cachedPath && skillDir && cachedPath === skillDir) {
      return 'source'
    }
  }
  if (skillDir && _projectInstallDirs.value.has(skillDir)) return 'managed'
  return 'local'
}

function getBadge(skill: any): { text: string; type: string } {
  const t = getBadgeType(skill)
  const labels: Record<string, string> = { local: '本地', managed: '已管理', source: '源文件' }
  return { text: labels[t] || t, type: t }
}

function getLanguageTags(skill: any): { showChineseTag: boolean; showTranslatedTag: boolean } {
  void translationCacheVersion.value
  const desc = skill.manifest?.description || ''
  const isChinese = isChineseContent(desc)
  if (isChinese) return { showChineseTag: true, showTranslatedTag: false }
  try {
    const raw = skill.content || ''
    const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const fh = window.services.hashContent(normalized)
    const hasTranslation = !!(fh && storage.getTranslationByHash(fh)?.translatedContent)
    return { showChineseTag: false, showTranslatedTag: hasTranslation }
  } catch {
    return { showChineseTag: false, showTranslatedTag: false }
  }
}

const projectItems = computed(() =>
  unref(registeredProjects).map((p: any) => ({
    id: p.id,
    label: p.name,
    count: p.skills?.length || 0,
  })),
)

function getSkillId(skill: any): string {
  return skill.manifest?.name || skill.name
}

interface MergedSkill extends SkillScanResult {
  isDuplicate: boolean
  duplicateCount: number
  allDirs: string[]
  allSkills: SkillScanResult[]
}

function mergeDuplicateSkills(skills: SkillScanResult[]): MergedSkill[] {
  const groups = new Map<string, SkillScanResult[]>()
  for (const s of skills) {
    const key = normalizeSkillNameKey(getSkillDisplayName(s))
    if (!key) {
      const fallback = `__unamed__${s.dir}`
      groups.set(fallback, [s])
      continue
    }
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(s)
  }
  const result: MergedSkill[] = []
  for (const [, items] of groups) {
    const primary = items[0]
    const allDirs = items.map((s) => s.dir)
    const isDuplicate = items.length > 1
    const merged: MergedSkill = {
      ...primary,
      isDuplicate,
      duplicateCount: items.length,
      allDirs,
      allSkills: items,
    }
    result.push(merged)
  }
  return result
}

function getSkillPlatformIds(skill: MergedSkill): string[] {
  const dirs = skill.isDuplicate ? skill.allDirs : [skill.dir]
  const ids = new Set<string>()
  for (const dir of dirs) {
    const normalized = dir.replace(/\\/g, '/').toLowerCase()
    for (const p of getAllPlatformDefinitions()) {
      const pp = (p.projectPath || p.customProjectPath || '').replace(/\\/g, '/').toLowerCase()
      if (pp && normalized.includes(pp)) ids.add(p.id)
    }
    if (normalized.includes('.agents/skills')) {
      ids.add('_generic')
    }
  }
  return [...ids]
}

function getMatchedLibrarySkill(skill: any): any | null {
  const dirName = (skill.dir || '').split(/[\\/]/).pop() || ''
  if (!dirName) return null
  const cached = storage.getDownloadedSkills()
  return (
    cached.find((s) => {
      if (!downloadedIds.value.includes(s.id)) return false
      const cachedPathLast = (s.path || '').split('/').pop() || ''
      if (cachedPathLast && cachedPathLast === dirName) return true
      if (s.name && s.name.toLowerCase() === (skill.manifest?.name || skill.name || '').toLowerCase()) return true
      return false
    }) || null
  )
}

function skillToSkill(skill: SkillScanResult): any {
  const matched = getMatchedLibrarySkill(skill)
  if (matched) {
    return {
      ...matched,
      skillDir: skill.dir || '',
      readme: skill.content || matched.readme || '',
    }
  }
  return {
    id: skill.manifest?.name || skill.name,
    name: skill.manifest?.name || skill.name,
    description: skill.manifest?.description || '',
    author: skill.manifest?.author || '',
    tags: skill.manifest?.tags || [],
    source: 'local',
    readme: skill.content || '',
    path: skill.dir || '',
    skillDir: skill.dir || '',
  }
}

function viewDetail(skill: SkillScanResult) {
  const merged = skill as MergedSkill
  emit('navigate', 'agent-skill-detail', { skill, platformId: '', duplicateSkills: merged.allSkills || null, context: 'project' })
}

async function toggleProjectSkill(skill: SkillScanResult) {
  const dir = skill.dir
  const nextEnabled = !isSkillEnabled(skill)
  if (!dir || toggling.value[dir]) return
  toggling.value[dir] = true
  try {
    const result = toggleSkillEnabled(dir, nextEnabled)
    if (selectedProject.value) {
      const nextSkills = selectedProject.value.skills.map((item) => (item.dir === dir ? { ...item, enabled: result.enabled } : item))
      selectedProject.value.skills = nextSkills
      storage.updateRegisteredProject(selectedProject.value.id, { skills: nextSkills })
    }
    refreshCounts()
    showToast({ type: 'success', message: result.enabled ? 'Skill 已启用' : 'Skill 已停用' })
  } catch (err: any) {
    showToast({ type: 'error', message: err?.message || '切换 Skill 状态失败' })
  } finally {
    toggling.value[dir] = false
  }
}

async function importSkill(skill: SkillScanResult) {
  confirmImportSkill.value = null
  const id = getSkillId(skill)
  importing.value[id] = true
  try {
    importScanResultToMySkills({ skill, sessionSource: 'project' })
    refreshDownloaded()
    refreshCounts()
    showToast({ type: 'success', message: `已导入「${skill.manifest?.name || skill.name}」到我的 Skill` })
  } catch (err: any) {
    showToast({ type: 'error', message: err?.message || `导入「${skill.manifest?.name || skill.name}」失败` })
  }
  importing.value[id] = false
}

function requestImportSkill(skill: SkillScanResult) {
  if (!importing.value[getSkillId(skill)]) confirmImportSkill.value = skill
}

async function uninstallSkillFromProject(skills: SkillScanResult[]) {
  uninstalling.value = true
  let okCount = 0
  let failCount = 0

  for (const skill of skills) {
    const dir = skill.dir
    const rm = safeRemovePath(dir)
    if (!rm.ok) {
      failCount++
      continue
    }

    const projectDistributes = storage
      .getDistributeRecords()
      .filter((r) => r.targetPath.replace(/\\/g, '/') === dir.replace(/\\/g, '/') && r.scope === 'project')
    for (const r of projectDistributes) {
      storage.removeDistributeRecord(r.skillId, r.platformId, r.scope)
    }

    if (selectedProject.value) {
      selectedProject.value.skills = selectedProject.value.skills.filter((s: SkillScanResult) => s.dir !== dir)
    }

    okCount++
  }

  if (selectedProject.value && okCount > 0) {
    storage.updateRegisteredProject(selectedProject.value.id, {
      skills: selectedProject.value.skills,
    })
  }

  refreshDownloaded()
  refreshCounts()

  if (failCount && okCount) {
    showToast({ type: 'warning', message: `${okCount} 个已删除，${failCount} 个删除失败` })
  } else if (failCount && !okCount) {
    showToast({ type: 'error', message: `删除失败（${failCount} 个），请检查文件权限` })
  } else {
    const name = skills[0]?.manifest?.name || skills[0]?.name || 'Skill'
    showToast({ type: 'success', message: skills.length > 1 ? `已删除 ${okCount} 个副本` : `已删除「${name}」` })
  }

  confirmUninstallSkill.value = null
  uninstalling.value = false
}

function openFolder(skill: any) {
  window.services.openFolder(skill.dir || skill.skillFile)
}

function doDeleteProject() {
  const pid = confirmDeleteProjectId.value
  confirmDeleteProjectId.value = null
  if (pid) emit('delete-project', pid)
}

function openProjectFolder() {
  if (selectedProject.value?.rootDir) {
    window.services.openFolder(selectedProject.value.rootDir)
  }
}

function _openImportModal() {
  showImportModal.value = true
}

async function batchImportToMySkills() {
  showBatchImportConfirm.value = false
  let successCount = 0
  let failCount = 0
  for (const dir of selectedIds.value) {
    const skill = filteredProjectSkills.value.find((s: any) => s.dir === dir)
    if (!skill || isInMySkills(skill)) continue
    try {
      importScanResultToMySkills({ skill, sessionSource: 'project' })
      successCount++
    } catch {
      failCount++
    }
  }
  refreshDownloaded()
  refreshCounts()
  exitBatchMode()
  if (failCount > 0) {
    showToast({ type: 'warning', message: `导入完成：${successCount} 成功，${failCount} 失败` })
  } else if (successCount > 0) {
    showToast({ type: 'success', message: `已导入 ${successCount} 个技能` })
  }
}

function requestBatchImportToMySkills() {
  if (selectedIds.value.size > 0) showBatchImportConfirm.value = true
}

function batchSetProjectSkillsEnabled(enabled: boolean) {
  const selectedSkills = filteredProjectSkills.value.filter((skill) => selectedIds.value.has(skill.dir))
  const selectedDirs = new Set(selectedSkills.flatMap((skill) => (skill.isDuplicate ? skill.allDirs : [skill.dir])))
  let successCount = 0
  let failCount = 0
  const updatedDirs = new Set<string>()

  for (const dir of selectedDirs) {
    try {
      toggleSkillEnabled(dir, enabled)
      updatedDirs.add(dir)
      successCount++
    } catch {
      failCount++
    }
  }

  if (selectedProject.value && updatedDirs.size > 0) {
    const nextSkills = selectedProject.value.skills.map((skill) =>
      updatedDirs.has(skill.dir) ? { ...skill, enabled } : skill,
    )
    selectedProject.value.skills = nextSkills
    storage.updateRegisteredProject(selectedProject.value.id, { skills: nextSkills })
  }

  refreshCounts()
  exitBatchMode()
  const action = enabled ? '启用' : '停用'
  if (failCount > 0 && successCount > 0) {
    showToast({ type: 'warning', message: `批量${action}完成：${successCount} 个成功，${failCount} 个失败` })
  } else if (failCount > 0) {
    showToast({ type: 'error', message: `批量${action}失败：${failCount} 个 Skill` })
  } else if (successCount > 0) {
    showToast({ type: 'success', message: `已批量${action} ${successCount} 个 Skill` })
  }
}

function batchRemoveFromLibrary() {
  showBatchRemoveConfirm.value = true
}

function executeBatchRemove() {
  const removedDirs = new Set<string>()
  for (const dir of selectedIds.value) {
    const skill = filteredProjectSkills.value.find((s: any) => s.dir === dir)
    if (!skill) continue
    const projectDistributes = storage
      .getDistributeRecords()
      .filter((r) => r.targetPath.replace(/\\/g, '/') === dir.replace(/\\/g, '/') && r.scope === 'project')
    for (const r of projectDistributes) {
      storage.removeDistributeRecord(r.skillId, r.platformId, r.scope)
    }
    const rm = safeRemovePath(dir)
    if (!rm.ok) continue
    removedDirs.add(dir)
  }
  if (selectedProject.value && removedDirs.size > 0) {
    selectedProject.value.skills = selectedProject.value.skills.filter((s: SkillScanResult) => !removedDirs.has(s.dir))
    storage.updateRegisteredProject(selectedProject.value.id, {
      skills: selectedProject.value.skills,
    })
  }
  refreshDownloaded()
  refreshCounts()
  exitBatchMode()
  showBatchRemoveConfirm.value = false
}

const allProjectSkills = computed(() => selectedProject.value?.skills || [])

const localCount = computed(() => allProjectSkills.value.filter((s: any) => getBadgeType(s) === 'local').length)
const managedCount = computed(() => allProjectSkills.value.filter((s: any) => getBadgeType(s) === 'managed').length)
const sourceCount = computed(() => allProjectSkills.value.filter((s: any) => getBadgeType(s) === 'source').length)

const agentCounts = computed(() => {
  const map = new Map<string, number>()
  for (const s of allProjectSkills.value) {
    const pids = getSkillPlatformIds(s as MergedSkill)
    for (const pid of pids) {
      map.set(pid, (map.get(pid) || 0) + 1)
    }
  }
  return Array.from(map.entries())
})

const totalAgents = computed(() => agentCounts.value.reduce((sum, [, c]) => sum + c, 0))

const agentFilterCount = computed(() => {
  if (!agentFilter.value) return allProjectSkills.value.length
  const entry = agentCounts.value.find(([id]) => id === agentFilter.value)
  return entry ? entry[1] : 0
})

const agentLabel = computed(() => {
  if (!agentFilter.value) return ''
  if (agentFilter.value === '_generic') return '通用'
  const p = findPlatformById(agentFilter.value)
  return p?.name || agentFilter.value
})

const filteredProjectSkills = computed(() => {
  let skills = allProjectSkills.value
  if (skillFilter.value) {
    skills = skills.filter((s: any) => getBadgeType(s) === skillFilter.value)
  }
  if (agentFilter.value) {
    skills = skills.filter((s: any) => {
      const pids = getSkillPlatformIds(s as MergedSkill)
      return pids.includes(agentFilter.value)
    })
  }
  return mergeDuplicateSkills(skills)
})
const { batchMode, selectedIds, isAllSelected, toggleBatchMode, toggleSelect, toggleSelectAll, exitBatchMode } = useBatchSelection({
  getItems: () => filteredProjectSkills.value,
  getKey: (s: any) => s.dir,
})

onDeactivated(() => {
  exitBatchMode()
})

// === Deploy modal ===
const showDeployModal = ref(false)
const deploySkill = ref<Skill | null>(null)

function openDeploy(skill: SkillScanResult) {
  deploySkill.value = skillToSkill(skill)
  showDeployModal.value = true
}

function onDeployed() {
  showDeployModal.value = false
  deploySkill.value = null
  refreshInstallDirs()
  if (selectedProject.value) scanProject(selectedProject.value)
}

// === Import from My Skills modal ===
const showImportModal = ref(false)
const showAdvanced = ref(false)
const importMode = ref<'copy' | 'symlink'>(settings.defaultInstallMode === 'symlink' ? 'symlink' : 'copy')
const importSearch = ref('')
const selectedImportIds = ref<Set<string>>(new Set())
const importingFromMy = ref(false)
const importTargetDirs = ref<string[]>(['.agents/skills'])
const importTargetSearch = ref('')
const importAdvancedSummary = computed(
  () => `${importTargetDirs.value.length} 个位置 · ${importMode.value === 'copy' ? '复制' : '软链接'}`,
)

const availableProjectDirs = computed(() => {
  const dirs = [{ path: '.agents/skills', label: '.agents/skills（通用）', agentName: '', icon: '_generic' }]
  const platforms = unref(detectedPlatforms)
  for (const p of platforms) {
    if (!p.enabled || !p.detected) continue
    const projectDir = getPlatformPath(p, 'project')
    if (projectDir && projectDir !== '.agents/skills' && !dirs.some((d) => d.path === projectDir)) {
      dirs.push({ path: projectDir, label: projectDir, agentName: p.name, icon: platformDisplayIcon(p) })
    }
  }
  return dirs
})

const filteredProjectDirs = computed(() => {
  const query = importTargetSearch.value.trim().toLowerCase()
  if (!query) return availableProjectDirs.value
  return availableProjectDirs.value.filter(
    (dir) => dir.path.toLowerCase().includes(query) || dir.agentName.toLowerCase().includes(query),
  )
})

const mySkills = computed(() => {
  const cached = storage.getDownloadedSkills()
  const downloaded = storage.getDownloadedIds()
  return cached.filter((s) => downloaded.includes(s.id))
})

const filteredMySkills = computed(() => {
  const q = importSearch.value.toLowerCase()
  const filtered = !q
    ? mySkills.value
    : mySkills.value.filter((s) => s.name.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q))
  return sortProcessedSkillsLast(filtered, isAlreadyInProject)
})

const projectSkillNames = computed(() => {
  if (!selectedProject.value?.skills) return new Set<string>()
  return new Set(selectedProject.value.skills.map((s: SkillScanResult) => normalizeSkillNameKey(getSkillDisplayName(s))))
})

function isAlreadyInProject(skill: Skill): boolean {
  return projectSkillNames.value.has(normalizeSkillNameKey(skill.name))
}

function toggleImportSelect(skill: Skill) {
  if (selectedImportIds.value.has(skill.id)) {
    selectedImportIds.value.delete(skill.id)
  } else {
    selectedImportIds.value.add(skill.id)
  }
  selectedImportIds.value = new Set(selectedImportIds.value)
}

function selectAllMySkills() {
  const available = filteredMySkills.value.filter((s) => !isAlreadyInProject(s))
  if (selectedImportIds.value.size === available.length) {
    selectedImportIds.value = new Set()
  } else {
    selectedImportIds.value = new Set(available.map((s) => s.id))
  }
}

function resolveSourceDir(skill: Skill): string | null {
  const repoDir = getSkillsRepoDir(skill.id)
  if (window.services.pathExists(repoDir)) return repoDir
  const localPath = (skill as any).path
  if (localPath && window.services.pathExists(localPath)) return localPath
  return null
}

async function confirmImportFromMy() {
  if (!selectedProject.value || !selectedImportIds.value.size || !importTargetDirs.value.length) return
  importingFromMy.value = true
  let importedCount = 0
  let failCount = 0
  try {
    for (const skillId of selectedImportIds.value) {
      const skill = mySkills.value.find((s) => s.id === skillId)
      if (!skill) continue
      const skillDirName =
        skill.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || skill.id
      const sourceDir = resolveSourceDir(skill)
      if (!sourceDir) {
        showToast({ type: 'warning', message: `「${skill.name}」的源文件不存在，已跳过` })
        failCount++
        continue
      }
      for (const targetRel of importTargetDirs.value) {
        const targetDir = window.services.pathJoin(selectedProject.value.rootDir, targetRel, skillDirName)
        try {
          if (importMode.value === 'symlink') {
            window.services.createSymlink(sourceDir, targetDir)
          } else {
            window.services.copyFile(sourceDir, targetDir)
          }
          storage.saveDistributeRecord({
            skillId: skill.id,
            platformId: makeProjectPlatformKey(selectedProject.value.id, targetRel),
            mode: importMode.value,
            scope: 'project',
            targetPath: targetDir,
            sourceDir,
            distributedAt: new Date().toISOString(),
          })
          importedCount++
        } catch (err: any) {
          showToast({ type: 'error', message: `导入「${skill.name}」到 ${targetRel} 失败：${err?.message || '未知错误'}` })
          failCount++
        }
      }
    }
    if (importedCount > 0) {
      refreshInstallDirs()
      scanProject(selectedProject.value)
      if (failCount > 0) showToast({ type: 'warning', message: `导入完成：${importedCount} 成功，${failCount} 失败` })
      else showToast({ type: 'success', message: `已导入 ${importedCount} 个技能到项目` })
    } else if (failCount > 0) {
      showToast({ type: 'error', message: `所有技能导入失败` })
    }
  } catch (err: any) {
    showToast({ type: 'error', message: err.message })
  }
  importingFromMy.value = false
  selectedImportIds.value = new Set()
  importTargetDirs.value = ['.agents/skills']
  importTargetSearch.value = ''
  showImportModal.value = false
}
</script>

<template>
  <div class="project-skills">
    <div class="page-header">
      <div class="header-left">
        <div class="header-title-row">
          <h2>项目 Skill</h2>
          <span class="count-badge">{{ allProjectSkills.length }}</span>
        </div>
        <p class="page-subtitle">登记项目 Skill 目录并管理其中的本地 Skill。</p>
      </div>
      <div class="header-toolbar-wrapper">
        <div class="header-toolbar">
          <button class="toolbar-btn add-project-btn" @click="openAddProjectModal()">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            添加项目
          </button>
          <button class="toolbar-btn import-btn" :disabled="!selectedProject" @click="showImportModal = true">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            导入
          </button>
          <button class="toolbar-btn" :class="{ 'batch-active': batchMode }" :disabled="!allProjectSkills.length" @click="toggleBatchMode">
            <svg
              v-if="!batchMode"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
            <svg
              v-else
              width="14"
              height="14"
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
            批量管理
          </button>
          <div class="view-toggle">
            <button :class="{ active: viewMode === 'grid' }" @click="viewMode = 'grid'" title="网格视图">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
            </button>
            <button :class="{ active: viewMode === 'list' }" @click="viewMode = 'list'" title="列表视图">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </button>
          </div>
          <button
            class="toolbar-icon-btn"
            title="刷新"
            :disabled="!selectedProject || projectScanning"
            @click="selectedProject && scanProject(selectedProject)"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
          <button class="toolbar-icon-btn" @click="toggleTheme" :title="isDarkMode ? '切换亮色模式' : '切换暗色模式'">
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
    </div>

    <div class="ps-filter-row">
      <QuickSwitcher
        :items="projectItems"
        :selected-id="selectedProject?.id || null"
        placeholder="搜索项目..."
        add-label="添加项目"
        :show-add="true"
        @select="selectProject(registeredProjects.find((p) => p.id === $event)!)"
        @add="openAddProjectModal()"
      >
        <template #item-prefix="{ item }">
          <span
            class="qs-item-avatar"
            :style="{ background: getAvatarColor(registeredProjects.find((p) => p.id === item.id)?.name || item.label) }"
            >{{ (registeredProjects.find((p) => p.id === item.id)?.name || item.label).charAt(0).toUpperCase() }}</span
          >
        </template>
      </QuickSwitcher>
      <div class="ps-filter-actions">
        <button class="toolbar-icon-btn" title="打开项目文件夹" :disabled="!selectedProject" @click="openProjectFolder()">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </button>
        <button
          class="toolbar-icon-btn"
          title="编辑项目"
          :disabled="!selectedProject"
          @click="selectedProject && emit('edit-project', selectedProject)"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
        <button
          class="toolbar-icon-btn danger"
          title="删除项目"
          :disabled="!selectedProject"
          @click="selectedProject && ((confirmDeleteProjectId = selectedProject.id), (confirmDeleteProjectName = selectedProject.name))"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>

    <div v-if="allProjectSkills.length" class="filter-tabs">
      <button class="tab-btn" :class="{ active: skillFilter === '' }" @click="skillFilter = ''">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        全部
        <span class="tab-count">{{ allProjectSkills.length }}</span>
      </button>
      <button class="tab-btn" :class="{ active: skillFilter === 'local' }" @click="skillFilter = skillFilter === 'local' ? '' : 'local'">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        本地
        <span class="tab-count">{{ localCount }}</span>
      </button>
      <button
        class="tab-btn"
        :class="{ active: skillFilter === 'managed' }"
        @click="skillFilter = skillFilter === 'managed' ? '' : 'managed'"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
        已管理
        <span class="tab-count">{{ managedCount }}</span>
      </button>
      <button class="tab-btn" :class="{ active: skillFilter === 'source' }" @click="skillFilter = skillFilter === 'source' ? '' : 'source'">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
        源文件
        <span class="tab-count">{{ sourceCount }}</span>
      </button>
      <div class="agent-dropdown-wrap">
        <button ref="agentBtnRef" class="tab-btn agent-tab" :class="{ active: agentFilter }" @click="toggleAgentDropdown">
          {{ agentLabel || '全部位置' }}
          <span class="tab-count">{{ agentFilterCount }}</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="showAgentDropdown" class="agent-dropdown-overlay" @click="showAgentDropdown = false" />
      <div v-if="showAgentDropdown" class="agent-dropdown" :style="agentDropdownStyle">
        <button class="dropdown-item" :class="{ active: !agentFilter }" @click="((agentFilter = ''), (showAgentDropdown = false))">
          全部位置
          <span class="dropdown-count">{{ totalAgents }}</span>
        </button>
        <button
          v-if="agentCounts.some(([id]) => id === '_generic')"
          class="dropdown-item"
          :class="{ active: agentFilter === '_generic' }"
          @click="((agentFilter = agentFilter === '_generic' ? '' : '_generic'), (showAgentDropdown = false))"
        >
          通用
          <span class="dropdown-count">{{ agentCounts.find(([id]) => id === '_generic')?.[1] || 0 }}</span>
        </button>
        <button
          v-for="[pid, cnt] in agentCounts.filter(([id]) => id !== '_generic')"
          :key="pid"
          class="dropdown-item"
          :class="{ active: agentFilter === pid }"
          @click="((agentFilter = agentFilter === pid ? '' : pid), (showAgentDropdown = false))"
        >
          {{ findPlatformById(pid)?.name || pid }}
          <span class="dropdown-count">{{ cnt }}</span>
        </button>
      </div>
    </Teleport>

    <div v-if="batchMode" class="batch-bar">
      <div class="batch-left">
        <span class="batch-label">批量模式</span>
        <span class="batch-count">已选 {{ selectedIds.size }} 项</span>
      </div>
      <div class="batch-actions">
        <button class="batch-action-btn" @click="toggleSelectAll">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" :fill="isAllSelected ? 'currentColor' : 'none'" />
            <polyline v-if="isAllSelected" points="9 11 12 14 22 4" />
          </svg>
          全选
        </button>
        <button class="batch-action-btn" title="批量启用" :disabled="selectedIds.size === 0" @click="batchSetProjectSkillsEnabled(true)">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M12 19V5" />
            <polyline points="5 12 12 5 19 12" />
          </svg>
          开启
        </button>
        <button class="batch-action-btn" title="批量停用" :disabled="selectedIds.size === 0" @click="batchSetProjectSkillsEnabled(false)">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M12 5v14" />
            <polyline points="19 12 12 19 5 12" />
          </svg>
          关闭
        </button>
        <button class="batch-action-btn primary" :disabled="selectedIds.size === 0" @click="requestBatchImportToMySkills">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          导入到我的 Skill
        </button>
        <button class="batch-action-btn danger" :disabled="selectedIds.size === 0" @click="batchRemoveFromLibrary">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </svg>
          移除
        </button>
      </div>
    </div>

    <template v-if="selectedProject">
      <div class="ps-scroll">
        <div v-if="!filteredProjectSkills.length" class="empty-state">
          <div class="empty-icon">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h3 class="empty-title">
            {{ skillFilter ? '没有匹配的 Skill' : '暂无 Skill' }}
          </h3>
          <p class="empty-desc">
            {{ skillFilter ? '尝试切换筛选条件。' : '该项目中未扫描到 SKILL.md 文件。点击重新扫描或检查项目目录结构。' }}
          </p>
        </div>
        <div v-else class="skill-grid" :class="viewMode">
          <SkillCard
            v-for="skill in filteredProjectSkills"
            :key="skill.dir"
            :name="skill.manifest?.name || skill.name"
            :description="skill.manifest?.description || ''"
            empty-description-reason="项目技能描述未解析成功"
            :selected="selectedIds.has(skill.dir)"
            :show-batch-checkbox="batchMode"
            :show-platform-icons="true"
            :installed-platforms="getSkillPlatformIds(skill)"
            :show-chinese-tag="getLanguageTags(skill).showChineseTag"
            :show-translated-tag="getLanguageTags(skill).showTranslatedTag"
            :badges="getBadge(skill).text ? [{ text: getBadge(skill).text, type: getBadge(skill).type }] : []"
            :duplicate-badge="skill.isDuplicate ? { count: skill.duplicateCount } : null"
            :show-symlink-badge="!!skill.isSymlink"
            @click="batchMode ? toggleSelect(skill.dir) : viewDetail(skill)"
            @select="toggleSelect(skill.dir)"
          >
            <template #top-left>
              <SkillEnabledToggle
                :enabled="isSkillEnabled(skill)"
                :busy="!!toggling[skill.dir]"
                @toggle="toggleProjectSkill(skill)"
              />
            </template>
            <template #actions>
              <button class="card-action-btn" title="打开文件夹" @click.stop="openFolder(skill)">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </button>
              <button v-if="getBadgeType(skill) !== 'local'" class="card-action-btn primary" title="分发到平台" @click.stop="openDeploy(skill)">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
              <button
                v-if="getBadgeType(skill) === 'local'"
                class="card-action-btn primary"
                :disabled="importing[getSkillId(skill)]"
                title="导入到我的 Skill"
                @click.stop="requestImportSkill(skill)"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
              <button class="card-action-btn danger" :disabled="uninstalling" title="删除" @click.stop="confirmUninstallSkill = skill">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </template>
            <template #after-desc>
              <div v-if="skill.manifest?.tags?.length" class="card-tags">
                <span v-for="tag in skill.manifest.tags.slice(0, 5)" :key="tag" class="tag">{{ tag }}</span>
              </div>
            </template>
          </SkillCard>
        </div>
      </div>
    </template>

    <div v-else class="empty-state center">
      <div class="empty-icon">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <h3 class="empty-title">还没有项目</h3>
      <p class="empty-desc">添加项目根目录后，即可扫描并管理项目内的本地 Skill。</p>
      <button class="empty-add-btn" @click="openAddProjectModal()">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        添加项目
      </button>
    </div>

    <!-- Import from My Skills modal -->
    <div v-if="showImportModal" class="modal-overlay skill-import-overlay">
      <div class="modal skill-import-modal">
        <div class="modal-header">
          <h3 class="modal-title">从我的 Skill 导入</h3>
          <button class="modal-close" @click="showImportModal = false">
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
          <p class="modal-desc">
            选择要导入到项目 <strong>{{ selectedProject?.name }}</strong> 的技能
          </p>

          <button type="button" class="modal-advanced-toggle" :class="{ open: showAdvanced }" @click="showAdvanced = !showAdvanced">
            <span class="modal-advanced-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.1A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3V9.6h.1A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.14.38.35.72.6 1 .3.3.68.5 1.1.6h.1v4h-.1a1.7 1.7 0 0 0-1.7.4Z" />
              </svg>
            </span>
            <span class="modal-advanced-label">高级设置</span>
            <span class="modal-advanced-summary">{{ importAdvancedSummary }}</span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              :class="{ rotated: showAdvanced }"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>

          <div v-if="showAdvanced" class="modal-advanced-body">
            <section class="advanced-section">
              <div class="advanced-section-heading">
                <span class="advanced-section-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                </span>
                <div>
                  <h4>导入位置</h4>
                  <p>可同时分发到项目内的多个 Agent 目录</p>
                </div>
                <span class="advanced-section-count">{{ availableProjectDirs.length }}</span>
              </div>
              <label v-if="availableProjectDirs.length > 6" class="import-target-search">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <input v-model="importTargetSearch" type="text" placeholder="搜索 Agent 或目录..." />
              </label>
              <div class="import-target-options" :class="{ 'is-scrollable': availableProjectDirs.length > 6 }">
                <label v-for="dir in filteredProjectDirs" :key="dir.path" class="import-target-option">
                  <input type="checkbox" :value="dir.path" v-model="importTargetDirs" />
                  <span class="import-target-check">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                  <span class="import-target-icon">
                    <ProviderIcon :icon="dir.icon" :size="18" variant="mono" />
                  </span>
                  <span class="import-target-content">
                    <span class="import-target-path">{{ dir.label }}</span>
                    <span class="import-target-meta">{{ dir.agentName || '所有 Agent 通用' }}</span>
                  </span>
                  <span v-if="dir.agentName" class="import-target-agent">{{ dir.agentName }}</span>
                </label>
                <div v-if="!filteredProjectDirs.length" class="import-target-empty">没有匹配的 Agent 位置</div>
              </div>
            </section>

            <section class="advanced-section">
              <div class="advanced-section-heading">
                <span class="advanced-section-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </span>
                <div>
                  <h4>导入方式</h4>
                  <p>选择项目中的 Skill 如何关联源文件</p>
                </div>
              </div>
              <div class="import-mode-options">
                <label class="import-mode-option" :class="{ active: importMode === 'copy' }">
                  <input type="radio" value="copy" v-model="importMode" />
                  <span class="import-mode-icon">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </span>
                  <span class="import-mode-content"><strong>复制</strong><small>创建独立副本，修改互不影响</small></span>
                  <span class="import-mode-radio" />
                </label>
                <label class="import-mode-option" :class="{ active: importMode === 'symlink' }">
                  <input type="radio" value="symlink" v-model="importMode" />
                  <span class="import-mode-icon">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                  </span>
                  <span class="import-mode-content"><strong>软链接</strong><small>跟随我的 Skill 源文件实时更新</small></span>
                  <span class="import-mode-radio" />
                </label>
              </div>
            </section>
          </div>

          <div class="modal-toolbar">
            <input v-model="importSearch" type="text" placeholder="搜索技能..." class="modal-search" />
            <button class="modal-select-all" @click="selectAllMySkills">
              {{ selectedImportIds.size === filteredMySkills.filter((s) => !isAlreadyInProject(s)).length ? '取消全选' : '全选' }}
            </button>
          </div>

          <div class="modal-skill-list">
            <div v-if="!filteredMySkills.length" class="modal-empty">
              <p>暂无已下载的技能</p>
            </div>
            <div v-else class="modal-skill-grid">
              <div
                v-for="skill in filteredMySkills"
                :key="skill.id"
                class="modal-skill-card"
                :class="{ selected: selectedImportIds.has(skill.id), disabled: isAlreadyInProject(skill) }"
                @click="!isAlreadyInProject(skill) && toggleImportSelect(skill)"
              >
                <div class="modal-skill-check" :class="{ checked: selectedImportIds.has(skill.id) || isAlreadyInProject(skill) }">
                  <svg
                    v-if="selectedImportIds.has(skill.id) || isAlreadyInProject(skill)"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="3"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div class="modal-skill-avatar" :style="{ background: getAvatarColor(skill.name) }">
                  {{ skill.name.charAt(0).toUpperCase() }}
                </div>
                <div class="modal-skill-info">
                  <div class="modal-skill-name">
                    {{ skill.name }}
                    <span v-if="isAlreadyInProject(skill)" class="badge-already">已在项目中</span>
                  </div>
                  <div class="modal-skill-desc">
                    {{ skill.description || '项目技能描述未解析成功' }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="modal-btn cancel" @click="showImportModal = false">取消</button>
          <button
            class="modal-btn confirm"
            :disabled="!selectedImportIds.size || !importTargetDirs.length || importingFromMy"
            @click="confirmImportFromMy"
          >
            <svg
              v-if="importingFromMy"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="spin"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            {{ importingFromMy ? '导入中...' : `导入 ${selectedImportIds.size} 个技能` }}
          </button>
        </div>
      </div>
    </div>

    <!-- Deploy modal -->
    <DeployModal
      v-if="showDeployModal && deploySkill"
      :skill="deploySkill"
      :project-root="selectedProject?.rootDir"
      @close="showDeployModal = false"
      @deployed="onDeployed"
    />

    <ConfirmUninstallSkillModal
      v-if="confirmUninstallSkill"
      :skill-name="confirmUninstallSkill.manifest?.name || confirmUninstallSkill.name"
      :skills="confirmUninstallSkill.allSkills || [confirmUninstallSkill]"
      @confirm="uninstallSkillFromProject"
      @cancel="confirmUninstallSkill = null"
    />
    <ConfirmModal
      v-if="confirmImportSkill"
      title="确认导入 Skill"
      :message="`确定要将 <strong>${confirmImportSkill.manifest?.name || confirmImportSkill.name}</strong> 导入到我的 Skill 吗？`"
      confirm-text="导入"
      @confirm="importSkill(confirmImportSkill)"
      @cancel="confirmImportSkill = null"
    />

    <ConfirmModal
      v-if="showBatchImportConfirm"
      title="批量导入 Skill"
      :message="`确定要将选中的 <strong>${selectedIds.size}</strong> 个 Skill 导入到我的 Skill 吗？`"
      confirm-text="导入"
      @confirm="batchImportToMySkills"
      @cancel="showBatchImportConfirm = false"
    />

    <ConfirmModal
      v-if="confirmDeleteProjectId"
      title="删除项目"
      :message="`确定要删除项目 <strong>${confirmDeleteProjectName}</strong> 吗？此操作不可撤销。`"
      confirm-text="删除项目"
      @confirm="doDeleteProject"
      @cancel="confirmDeleteProjectId = null"
    />
    <ConfirmModal
      v-if="showBatchRemoveConfirm"
      title="批量移除 Skill"
      :message="`确定要移除选中的 <strong>${selectedIds.size}</strong> 个 Skill 吗？此操作将从项目中移除相关文件和分发记录。`"
      :confirm-text="`移除 ${selectedIds.size} 个 Skill`"
      @confirm="executeBatchRemove"
      @cancel="showBatchRemoveConfirm = false"
    />
  </div>
</template>

<style scoped>
.project-skills {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0;
}

.ps-filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 28px 0;
  flex-wrap: wrap;
}

.ps-filter-row .quick-switcher {
  width: 240px;
  flex-shrink: 0;
}

.ps-filter-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 22px 28px 16px;
  background: hsl(var(--card));
  border-bottom: 1px solid hsl(var(--border));
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.header-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-left h2 {
  font-size: 22px;
  font-weight: 600;
  color: hsl(var(--foreground));
  margin: 0;
}

.page-subtitle {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
}

.count-badge {
  font-size: 11px;
  font-weight: 600;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--accent));
  padding: 2px 8px;
  border-radius: 10px;
}

.header-toolbar-wrapper {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.header-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.toolbar-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 8px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--card));
  color: hsl(var(--foreground));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
  white-space: nowrap;
}

.toolbar-btn:hover {
  background: hsl(var(--accent));
  border-color: hsl(var(--primary) / 0.3);
}

.toolbar-btn.batch-active {
  background: hsl(var(--destructive) / 0.08);
  border-color: hsl(var(--destructive) / 0.3);
  color: hsl(var(--destructive));
}

.toolbar-btn.batch-active:hover {
  background: hsl(var(--destructive) / 0.15);
}

.toolbar-btn:disabled {
  opacity: 0.35;
  cursor: default;
  pointer-events: none;
}

.toolbar-btn.add-project-btn {
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  border-color: transparent;
}

.toolbar-btn.add-project-btn:hover {
  background: hsl(var(--primary) / 0.9);
}

.toolbar-btn.import-btn {
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  border-color: transparent;
}

.toolbar-btn.import-btn:hover {
  background: hsl(var(--primary) / 0.9);
}

.toolbar-btn.import-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.toolbar-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: hsl(var(--card));
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
}

.toolbar-icon-btn:hover {
  background: hsl(var(--accent));
  color: hsl(var(--foreground));
}

.toolbar-icon-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.toolbar-icon-btn.danger:hover {
  color: hsl(var(--destructive));
  background: hsl(var(--destructive) / 0.08);
}

.view-toggle {
  display: flex;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  overflow: hidden;
}

.view-toggle button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: hsl(var(--card));
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
}

.view-toggle button + button {
  border-left: 1px solid hsl(var(--border));
}

.view-toggle button:hover {
  background: hsl(var(--accent));
  color: hsl(var(--foreground));
}

.view-toggle button.active {
  background: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
}

.filter-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 12px 28px 0;
  flex-wrap: wrap;
}

.tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
  white-space: nowrap;
}

.tab-btn:hover {
  background: hsl(var(--accent));
  color: hsl(var(--foreground));
}

.tab-btn.active {
  background: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
  font-weight: 600;
}

.tab-count {
  font-size: 11px;
  font-weight: 600;
  padding: 0 4px;
  border-radius: 6px;
  background: hsl(var(--muted) / 0.6);
  color: hsl(var(--muted-foreground));
  line-height: 1.6;
}

.tab-btn.active .tab-count {
  background: hsl(var(--primary) / 0.15);
  color: hsl(var(--primary));
}

.agent-tab {
  flex-shrink: 0;
}

.agent-dropdown-wrap {
  position: relative;
  margin-left: auto;
}

.agent-dropdown-overlay {
  position: fixed;
  inset: 0;
  z-index: 99;
}

.agent-dropdown {
  position: fixed;
  min-width: 160px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
  z-index: 100;
  padding: 4px;
  overflow: hidden;
}

.dropdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: hsl(var(--foreground));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
  white-space: nowrap;
}

.dropdown-item:hover {
  background: hsl(var(--accent));
}

.dropdown-item.active {
  background: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
}

.dropdown-count {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 6px;
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
}

.dropdown-item.active .dropdown-count {
  background: hsl(var(--primary) / 0.15);
  color: hsl(var(--primary));
}

.batch-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 28px;
  margin: 12px 28px 0;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
}

.batch-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
}
.batch-label {
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--foreground));
}
.batch-count {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
.batch-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.batch-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
  background: hsl(var(--card));
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
  white-space: nowrap;
}

.batch-action-btn svg {
  color: hsl(var(--muted-foreground));
  flex-shrink: 0;
}

.batch-action-btn:hover:not(:disabled) {
  background: hsl(var(--accent));
  border-color: hsl(var(--primary) / 0.3);
  color: hsl(var(--foreground));
}

.batch-action-btn:hover:not(:disabled) svg {
  color: hsl(var(--primary));
}

.batch-action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.batch-action-btn.primary {
  color: hsl(var(--primary));
  border-color: hsl(var(--primary) / 0.25);
  background: hsl(var(--primary) / 0.04);
}

.batch-action-btn.primary svg {
  color: hsl(var(--primary));
}

.batch-action-btn.primary:hover:not(:disabled) {
  background: hsl(var(--primary) / 0.1);
  border-color: hsl(var(--primary) / 0.4);
}

.batch-action-btn.danger {
  color: hsl(var(--destructive));
  border-color: hsl(var(--destructive) / 0.25);
  background: hsl(var(--destructive) / 0.04);
}

.batch-action-btn.danger svg {
  color: hsl(var(--destructive));
}

.batch-action-btn.danger:hover:not(:disabled) {
  background: hsl(var(--destructive) / 0.1);
  border-color: hsl(var(--destructive) / 0.4);
}

.ps-scroll {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  min-height: 0;
  padding: 20px 28px 28px;
  scrollbar-gutter: stable;
}

.skill-grid {
  display: grid;
}
.skill-grid.grid {
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px;
}
.skill-grid.list {
  grid-template-columns: 1fr;
  gap: 10px;
}

.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}
.tag {
  font-size: 10px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 6px;
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 28px;
  color: hsl(var(--muted-foreground));
  text-align: center;
}

.empty-state.center {
  flex: 1;
  min-height: 0;
}

.empty-icon {
  margin-bottom: 16px;
  color: hsl(var(--muted-foreground) / 0.5);
}
.empty-title {
  font-size: 16px;
  font-weight: 600;
  color: hsl(var(--foreground));
  margin: 0 0 8px;
}
.empty-desc {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  margin: 0 0 20px;
  max-width: 360px;
  line-height: 1.5;
}

.empty-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 20px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 10px;
  border: none;
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  cursor: pointer;
  font-family: inherit;
  transition: all var(--duration-base) var(--ease-standard);
}

.empty-add-btn:hover {
  opacity: 0.9;
}

.qs-item-avatar {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: hsl(var(--background) / 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(8px);
}
.modal {
  width: min(920px, 92vw);
  max-height: 86vh;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: var(--shadow-lg);
}
.modal-body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 0;
}
.modal-title {
  font-size: 18px;
  font-weight: 700;
  color: hsl(var(--foreground));
  margin: 0;
}
.modal-close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-base) var(--ease-standard);
}
.modal-close:hover {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
}
.modal-desc {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  padding: 8px 24px 0;
  margin: 0;
}
.modal-desc strong {
  color: hsl(var(--foreground));
}
.modal-advanced-toggle {
  width: calc(100% - 48px);
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 24px 0;
  padding: 10px 12px;
  font-size: 12px;
  font-weight: 600;
  color: hsl(var(--foreground));
  background: hsl(var(--muted) / 0.28);
  cursor: pointer;
  user-select: none;
  border-radius: 8px;
  transition: all var(--duration-base) var(--ease-standard);
  border: 1px solid hsl(var(--border));
  font-family: inherit;
  text-align: left;
}
.modal-advanced-toggle:hover {
  border-color: hsl(var(--primary) / 0.35);
  background: hsl(var(--muted) / 0.5);
}
.modal-advanced-toggle.open {
  border-color: hsl(var(--primary) / 0.3);
  background: hsl(var(--primary) / 0.04);
}
.modal-advanced-icon {
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 0.1);
}
.modal-advanced-label {
  font-weight: 650;
}
.modal-advanced-summary {
  margin-left: auto;
  font-size: 11px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
}
.modal-advanced-toggle > svg {
  transition: transform var(--duration-base);
  flex-shrink: 0;
}
.modal-advanced-toggle > svg.rotated {
  transform: rotate(90deg);
}
.modal-advanced-body {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
  gap: 12px;
  margin: 8px 24px 0;
}
.advanced-section {
  min-width: 0;
  padding: 14px;
  border-radius: 12px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--card));
}
.advanced-section-heading {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 12px;
}
.advanced-section-heading h4 {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  color: hsl(var(--foreground));
}
.advanced-section-heading p {
  margin: 2px 0 0;
  font-size: 10px;
  line-height: 1.4;
  color: hsl(var(--muted-foreground));
}
.advanced-section-count {
  margin-left: auto;
  padding: 2px 7px;
  border-radius: 999px;
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
  font-size: 10px;
  font-weight: 700;
}
.advanced-section-icon {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border-radius: 8px;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 0.08);
}
.import-target-search {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 8px;
  padding: 7px 9px;
  border: 1px solid hsl(var(--border));
  border-radius: 9px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--background));
}
.import-target-search:focus-within {
  border-color: hsl(var(--ring));
  box-shadow: 0 0 0 2px hsl(var(--ring) / 0.1);
}
.import-target-search input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  color: hsl(var(--foreground));
  background: transparent;
  font-size: 11px;
}
.import-target-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
}
.import-target-options.is-scrollable {
  max-height: 188px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 4px;
  scrollbar-gutter: stable;
}
.import-target-option {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding: 9px 10px;
  border-radius: 10px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--card));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
  user-select: none;
}
.import-target-option:hover {
  border-color: hsl(var(--primary) / 0.4);
}
.import-target-option:has(input:checked) {
  border-color: hsl(var(--primary));
  background: hsl(var(--primary) / 0.06);
}
.import-target-option input[type='checkbox'] {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.import-target-check {
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border: 1.5px solid hsl(var(--border));
  border-radius: 5px;
  color: transparent;
}
.import-target-option:has(input:checked) .import-target-check {
  border-color: hsl(var(--primary));
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
}
.import-target-icon {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border-radius: 8px;
  color: hsl(var(--foreground));
  background: hsl(var(--muted));
}
.import-target-option:has(input:checked) .import-target-icon {
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 0.1);
}
.import-target-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.import-target-path {
  overflow: hidden;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 11px;
  font-weight: 600;
  color: hsl(var(--foreground));
  text-overflow: ellipsis;
  white-space: nowrap;
}
.import-target-meta {
  margin-top: 2px;
  font-size: 9px;
  color: hsl(var(--muted-foreground));
}
.import-target-agent {
  margin-left: auto;
  font-size: 10px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted));
  padding: 1px 6px;
  border-radius: 5px;
}
.import-target-empty {
  grid-column: 1 / -1;
  padding: 18px;
  text-align: center;
  color: hsl(var(--muted-foreground));
  font-size: 11px;
}
.import-mode-options {
  display: grid;
  gap: 8px;
}
.import-mode-option {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 10px;
  border-radius: 10px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--card));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
  user-select: none;
}
.import-mode-option:hover {
  border-color: hsl(var(--primary) / 0.4);
}
.import-mode-option.active {
  border-color: hsl(var(--primary));
  background: hsl(var(--primary) / 0.06);
}
.import-mode-option input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.import-mode-icon {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border-radius: 8px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted));
}
.import-mode-option.active .import-mode-icon {
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 0.1);
}
.import-mode-content {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}
.import-mode-content strong {
  font-size: 11px;
  color: hsl(var(--foreground));
}
.import-mode-content small {
  margin-top: 1px;
  overflow: hidden;
  font-size: 9px;
  color: hsl(var(--muted-foreground));
  text-overflow: ellipsis;
  white-space: nowrap;
}
.import-mode-radio {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 1.5px solid hsl(var(--border));
  transition: all var(--duration-base) var(--ease-standard);
}
.import-mode-option.active .import-mode-radio {
  border-color: hsl(var(--primary));
  background: hsl(var(--primary));
  box-shadow: inset 0 0 0 3px hsl(var(--card));
}
.modal-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 24px 0;
}
.modal-search {
  flex: 1;
  padding: 9px 14px;
  font-size: 13px;
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
  background: hsl(var(--card));
  color: hsl(var(--foreground));
  outline: none;
  transition: all var(--duration-base) var(--ease-standard);
}
.modal-search:focus {
  border-color: hsl(var(--ring));
  box-shadow: 0 0 0 3px hsl(var(--ring) / 0.12);
}
.modal-search::placeholder {
  color: hsl(var(--muted-foreground));
}
.modal-select-all {
  padding: 8px 14px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 8px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--card));
  color: hsl(var(--foreground));
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--duration-base) var(--ease-standard);
}
.modal-select-all:hover {
  background: hsl(var(--muted));
}
.modal-skill-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px 24px;
  min-height: 200px;
}
.modal-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 120px;
  color: hsl(var(--muted-foreground));
  font-size: 13px;
}
.modal-skill-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 8px;
}
.modal-skill-card {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  min-height: 58px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--card));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
}
.modal-skill-card:hover:not(.disabled) {
  border-color: hsl(var(--primary) / 0.4);
  background: hsl(var(--primary) / 0.03);
}
.modal-skill-card.selected {
  border-color: hsl(var(--primary));
  background: hsl(var(--primary) / 0.06);
}
.modal-skill-card.disabled {
  opacity: 0.5;
  cursor: default;
}
.modal-skill-avatar {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}
.modal-skill-check {
  width: 18px;
  height: 18px;
  border-radius: 6px;
  border: 2px solid hsl(var(--border));
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all var(--duration-base) var(--ease-standard);
}
.modal-skill-check.checked {
  background: hsl(var(--primary));
  border-color: hsl(var(--primary));
  color: #fff;
}
.modal-skill-info {
  flex: 1;
  min-width: 0;
}
.modal-skill-name {
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--foreground));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.modal-skill-desc {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.badge-already {
  margin-left: 6px;
  font-size: 10px;
  font-weight: 500;
  color: hsl(var(--primary));
}
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 24px;
  border-top: 1px solid hsl(var(--border));
}
.modal-btn {
  padding: 9px 20px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 10px;
  border: none;
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
  display: flex;
  align-items: center;
  gap: 6px;
}
.modal-btn.cancel {
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
}
.modal-btn.cancel:hover {
  background: hsl(var(--muted) / 0.8);
}
.modal-btn.confirm {
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
}
.modal-btn.confirm:hover {
  opacity: 0.9;
}
.modal-btn.confirm:disabled {
  opacity: 0.5;
  cursor: default;
}

@media (max-width: 720px) {
  .modal {
    width: 94vw;
  }
  .modal-advanced-body {
    grid-template-columns: 1fr;
  }
  .modal-skill-grid {
    grid-template-columns: 1fr;
  }
  .modal-advanced-summary {
    display: none;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.spin {
  animation: spin 0.7s linear infinite;
}

.confirm-overlay {
  position: fixed;
  inset: 0;
  background: hsl(0 0% 0% / 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}
.confirm-modal {
  width: 420px;
  max-width: 90vw;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 24px 64px hsl(0 0% 0% / 0.2);
}
.confirm-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 20px;
  border-bottom: 1px solid hsl(var(--border));
}
.confirm-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: hsl(var(--destructive) / 0.1);
  color: hsl(var(--destructive));
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.confirm-title {
  font-size: 15px;
  font-weight: 600;
  color: hsl(var(--foreground));
  margin: 0;
  flex: 1;
}
.confirm-close {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-base) var(--ease-standard);
}
.confirm-close:hover {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
}
.confirm-body {
  padding: 18px 20px;
}
.confirm-desc {
  font-size: 13px;
  line-height: 1.6;
  color: hsl(var(--muted-foreground));
  margin: 0;
}
.confirm-desc :deep(strong) {
  color: hsl(var(--foreground));
  font-weight: 600;
}
.confirm-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 20px;
  border-top: 1px solid hsl(var(--border));
}
.confirm-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
}
.confirm-btn.cancel {
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
}
.confirm-btn.cancel:hover {
  background: hsl(var(--muted) / 0.8);
}
.confirm-btn.delete {
  background: hsl(var(--destructive));
  color: #fff;
}
.confirm-btn.delete:hover {
  opacity: 0.9;
}
</style>

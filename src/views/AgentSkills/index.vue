<script setup lang="ts">
import { ref, computed, onMounted, onActivated, watch, inject, unref, onDeactivated } from 'vue'
import {
  KeyShowToast,
  KeyDetectedPlatforms,
  KeyPlatformSkillCounts,
  KeyRefreshCounts,
  KeyAgentSkills,
  KeyUpdateAgentPlatformSkills,
  KeySelectedAgentPlatformId,
  KeyIsAgentSkillsDirty,
} from '../../inject-keys'
import {
  detectPlatforms,
  getPlatformPath,
  getDefaultPlatformOrder,
  platformDisplayIcon,
  findPlatformById,
} from '../../data/platforms'
import { storage } from '../../utils/storage'
import { isChineseContent } from '../../utils/translate'
import { useSettings } from '../../composables/useSettings'
import { normalizePath } from '../../utils/path'
import type { PlatformInfo, Skill, SkillScanResult } from '../../types'
import ProviderIcon from '../../components/ProviderIcon.vue'
import SkillCard from '../../components/SkillCard.vue'
import SkillEnabledToggle from '../../components/SkillEnabledToggle.vue'
import QuickSwitcher from '../../components/QuickSwitcher.vue'
import ConfirmModal from '../../components/ConfirmModal.vue'
import DeployModal from '../../components/DeployModal.vue'
import { cacheVersion as translationCacheVersion } from '../../composables/useTranslationQueue'
import { getSkillsRepoDir } from '../../utils/skill-path'
import { safeRemovePath } from '../../utils/fs-ops'
import { uninstallPathAndRecord } from '../../utils/skill-install-status'
import { formatSkillLifecycleWarnings } from '../../utils/skill-lifecycle'
import { sortProcessedSkillsLast } from '../../utils/skill-modal-sort'
import { isSkillEnabled, toggleSkillEnabled } from '../../utils/skill-toggle'
import { importScanResultToMySkills } from '../../utils/skill-import'

const props = defineProps<{ initialPlatformId?: string }>()
const emit = defineEmits(['navigate'])
const showToast = inject(KeyShowToast, () => {})
const allPlatforms = inject(KeyDetectedPlatforms, ref([]) as any)
const platformSkillCounts = inject(KeyPlatformSkillCounts, ref({}) as any)
const refreshCounts = inject(KeyRefreshCounts, () => {})
const injectAgentSkills = inject(KeyAgentSkills)!

if (!injectAgentSkills) throw new Error('KeyAgentSkills not provided')
const updateAgentPlatformSkills = inject(KeyUpdateAgentPlatformSkills, () => {})
const injectSelectedAgentPlatformId = inject(KeySelectedAgentPlatformId)
const isAgentSkillsDirty = inject(KeyIsAgentSkillsDirty, ref(false))

const detectedPlatforms = ref<PlatformInfo[]>([])
const selectedId = ref(props.initialPlatformId || '')
const platformSkills = computed(() => injectAgentSkills.value)
const loading = ref(false)
const skillFilter = ref<string>('')
const viewMode = ref<'grid' | 'list'>('grid')
const downloadedIds = ref<string[]>(storage.getDownloadedIds())
const importing = ref<Record<string, boolean>>({})
const toggling = ref<Record<string, boolean>>({})
const confirmImportSkill = ref<any>(null)
const showBatchImportConfirm = ref(false)
function refreshDownloaded() {
  downloadedIds.value = storage.getDownloadedIds()
}

function getSkillId(skill: SkillScanResult): string {
  return skill.manifest?.name || skill.name
}

function findCachedSkill(skill: any): Skill | null {
  const id = getSkillId(skill)
  const cached = storage.getDownloadedSkills()
  const downloadedSet = storage.getDownloadedSet()
  const found = cached.find((s) => s.id === id && downloadedSet.has(s.id))
  if (found) return found
  const dirName = (skill.dir || '').split(/[\\/]/).pop() || ''
  if (!dirName) return null
  return (
    cached.find((s) => {
      if (!downloadedSet.has(s.id)) return false
      const cachedPathLast = (s.path || '').split('/').pop() || ''
      if (cachedPathLast && cachedPathLast === dirName) return true
      if (s.name && s.name.toLowerCase() === (skill.manifest?.name || skill.name || '').toLowerCase()) return true
      return false
    }) || null
  )
}

function getPlatFormInstallDirSet(): Set<string> {
  if (!selectedPlatform.value) return new Set()
  const distributed = storage.getDistributedForPlatform(selectedPlatform.value.id)
  return new Set(distributed.map((r) => normalizePath(r.targetPath)))
}

function getBadgeType(skill: any): string {
  const skillDir = normalizePath(skill.dir || '')
  const cached = findCachedSkill(skill)
  if (cached && cached.source === 'local') {
    const cachedPath = normalizePath(cached.path || '')
    if (cachedPath && skillDir && cachedPath === skillDir) {
      return 'source'
    }
  }
  if (skillDir && _platformInstallDirs.value.has(skillDir)) return 'managed'
  return 'local'
}

const _platformInstallDirs = ref<Set<string>>(new Set())

const { settings, updateSettings } = useSettings()

const isDarkMode = computed(() => {
  if (settings.themeMode === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  return settings.themeMode === 'dark'
})

function toggleTheme() {
  const next = isDarkMode.value ? 'light' : 'dark'
  updateSettings({ themeMode: next })
}

const _agentColors: Record<string, string> = {
  claude: '#f97316',
  codex: '#3b82f6',
  gemini: '#8b5cf6',
  opencode: '#1a1a2e',
  'cherry-studio': '#ec4899',
  cursor: '#64748b',
  windsurf: '#06b6d4',
  trae: '#3b82f6',
  'trae-cn': '#3b82f6',
  copilot: '#238636',
  kiro: '#f59e0b',
  cline: '#10b981',
  openclaw: '#8b5cf6',
  kilo: '#6366f1',
  hermes: '#ec4899',
  codebuddy: '#14b8a6',
  qoder: '#ef4444',
  antigravity: '#8b5cf6',
  mimo: '#ff6d00',
}

const platformItems = computed(() =>
  unref(allPlatforms).map((p: any) => ({
    id: p.id,
    label: p.name,
    count: unref(platformSkillCounts)[p.id] ?? 0,
  })),
)

function platformIconForSwitcher(item: { id: string } | null | undefined): string {
  if (!item?.id) return '_generic'
  const full =
    findPlatformById(item.id) ||
    detectedPlatforms.value.find((p) => p.id === item.id) ||
    unref(allPlatforms).find((p: any) => p.id === item.id)
  return platformDisplayIcon(full || { id: item.id })
}

function loadDetectedPlatforms(): PlatformInfo[] {
  const installedPlatforms = detectPlatforms().filter((p) => p.detected && p.enabled !== false)
  const platformOrder = storage.getPlatformOrder()
  const orderToUse = platformOrder.length ? platformOrder : getDefaultPlatformOrder()
  const orderMap = new Map(orderToUse.map((id, idx) => [id, idx]))
  installedPlatforms.sort((a, b) => (orderMap.get(a.id) ?? Infinity) - (orderMap.get(b.id) ?? Infinity))
  return installedPlatforms
}

onMounted(() => {
  storage.cleanStaleDownloadedSkills()
  detectedPlatforms.value = loadDetectedPlatforms()
  const savedState = storage.getPageState('agent-skills')
  if (savedState?.platformId && detectedPlatforms.value.some((p) => p.id === savedState.platformId))
    selectedId.value = savedState.platformId
  else if (props.initialPlatformId && detectedPlatforms.value.some((p) => p.id === props.initialPlatformId))
    selectedId.value = props.initialPlatformId
  else if (detectedPlatforms.value.length) selectedId.value = detectedPlatforms.value[0].id
})

onActivated(() => {
  detectedPlatforms.value = loadDetectedPlatforms()

  if (isAgentSkillsDirty.value) {
    isAgentSkillsDirty.value = false
    for (const p of detectedPlatforms.value) {
      const dir = getPlatformPath(p, 'global') || getPlatformPath(p, 'project')
      if (dir) {
        try {
          const skills = (window.services.scanForSkillFilesIncludingDisabled || window.services.scanForSkillFiles)([dir])
          updateAgentPlatformSkills(p.id, skills)
        } catch {
          updateAgentPlatformSkills(p.id, [])
        }
      }
    }
    refreshCounts()
  }
})

watch(
  () => props.initialPlatformId,
  (id) => {
    if (id && detectedPlatforms.value.some((p) => p.id === id)) selectedId.value = id
  },
)

function refreshCurrent() {
  loading.value = true
  setTimeout(() => {
    const p = detectedPlatforms.value.find((p) => p.id === selectedId.value)
    if (p) {
      const dir = getPlatformPath(p, 'global') || getPlatformPath(p, 'project')
      if (dir) {
        try {
          const skills = (window.services.scanForSkillFilesIncludingDisabled || window.services.scanForSkillFiles)([dir])
          updateAgentPlatformSkills(p.id, skills)
        } catch {
          updateAgentPlatformSkills(p.id, [])
        }
      }
    }
    refreshCounts()
    loading.value = false
  }, 300)
}

function selectPlatform(p: PlatformInfo) {
  selectedId.value = p.id
  skillFilter.value = ''
  storage.savePageState('agent-skills', { platformId: p.id })
}

watch(selectedId, (id) => {
  if (injectSelectedAgentPlatformId) injectSelectedAgentPlatformId.value = id
})

onDeactivated(() => {
  batchMode.value = false
  selectedIds.value.clear()
})

const selectedPlatform = computed(() => detectedPlatforms.value.find((p) => p.id === selectedId.value))
const selectedSkills = computed(() => (selectedId.value ? platformSkills.value[selectedId.value] || [] : []))

async function toggleAgentSkill(skill: SkillScanResult) {
  const dir = skill.dir
  const nextEnabled = !isSkillEnabled(skill)
  if (!dir || toggling.value[dir]) return
  toggling.value[dir] = true
  try {
    const result = toggleSkillEnabled(dir, nextEnabled)
    const platform = selectedPlatform.value
    const scanDir = platform ? getPlatformPath(platform, 'global') || getPlatformPath(platform, 'project') : ''
    if (platform && scanDir) {
      const scan = window.services.scanForSkillFilesIncludingDisabled || window.services.scanForSkillFiles
      updateAgentPlatformSkills(platform.id, scan([scanDir]))
    } else {
      updateAgentPlatformSkills(
        selectedId.value,
        selectedSkills.value.map((item) => (item.dir === dir ? { ...item, enabled: result.enabled } : item)),
      )
    }
    refreshCounts()
    showToast({ type: 'success', message: result.enabled ? 'Skill 已启用' : 'Skill 已停用' })
  } catch (err: any) {
    showToast({ type: 'error', message: err?.message || '切换 Skill 状态失败' })
  } finally {
    toggling.value[dir] = false
  }
}

watch(
  selectedPlatform,
  () => {
    _platformInstallDirs.value = getPlatFormInstallDirSet()
  },
  { immediate: true },
)

const filteredSkills = computed(() => {
  const skills = selectedSkills.value
  if (!skillFilter.value) return skills
  return skills.filter((s) => getBadgeType(s) === skillFilter.value)
})

const localAndManagedCount = computed(() => {
  let local = 0,
    managed = 0,
    source = 0
  for (const s of selectedSkills.value) {
    const type = getBadgeType(s)
    if (type === 'local') local++
    else if (type === 'source') source++
    else managed++
  }
  return { local, managed, source }
})
const localCount = computed(() => localAndManagedCount.value.local)
const managedCount = computed(() => localAndManagedCount.value.managed)
const sourceCount = computed(() => localAndManagedCount.value.source)

function getBadge(skill: any): { text: string; type: string } {
  const t = getBadgeType(skill)
  const labels: Record<string, string> = { local: '本地', managed: '已管理', source: '源文件' }
  return { text: labels[t] || t, type: t }
}

function getAvatarColor(name: string): string {
  if (!name) return 'hsl(0 0% 60%)'
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash << 5) - hash + name.charCodeAt(i)
  const h = Math.abs(hash) % 360
  return `hsl(${h} 45% 50%)`
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

function findDuplicateSkills(skill: any): any[] {
  const name = skill.manifest?.name || skill.name || ''
  if (!name) return [skill]
  const all = selectedSkills.value
  return all.filter((s: any) => (s.manifest?.name || s.name || '') === name)
}

function openSkillDetail(skill: any) {
  const duplicates = findDuplicateSkills(skill)
  emit('navigate', 'agent-skill-detail', {
    skill,
    platformId: selectedId.value,
    duplicateSkills: duplicates.length > 1 ? duplicates : null,
    context: 'agent',
  })
}

function openFolder(skill: any) {
  try {
    window.services.openFolder(skill.dir)
  } catch {}
}

function openPlatformFolder() {
  const p = selectedPlatform.value
  if (!p) return
  const dir = getPlatformPath(p, 'global') || getPlatformPath(p, 'project')
  if (dir) {
    try {
      window.services.openFolder(dir)
    } catch {}
  }
}

function skillToSkill(skill: any): Skill {
  const cached = findCachedSkill(skill)
  if (cached) return { ...cached, skillDir: skill.dir || '', readme: skill.content || cached.readme || '' } as any
  const id = getSkillId(skill)
  return {
    id,
    name: skill.manifest?.name || skill.name,
    description: skill.manifest?.description || '',
    author: skill.manifest?.author || '',
    tags: skill.manifest?.tags || [],
    source: 'local',
    readme: skill.content || '',
    path: skill.dir || '',
    skillDir: skill.dir || '',
  } as any
}

const showDeployModal = ref(false)
const deploySkill = ref<Skill | null>(null)

function openDeploy(skill: any) {
  deploySkill.value = skillToSkill(skill)
  showDeployModal.value = true
}

function onDeployed() {
  showDeployModal.value = false
  deploySkill.value = null
  _platformInstallDirs.value = getPlatFormInstallDirSet()
  refreshCurrent()
}

async function importSkillToMy(skill: any) {
  confirmImportSkill.value = null
  const id = getSkillId(skill)
  importing.value[id] = true
  try {
    const targetDir = getSkillsRepoDir(id)
    window.services.mkdir(targetDir)
    window.services.copyFile(skill.dir, targetDir)
    const cached = storage.getDownloadedSkills()
    if (!cached.some((s) => s.id === id)) {
      const manifest = skill.manifest || { name: id, description: '', author: '', tags: [] }
      cached.push({
        id,
        name: manifest.name || id,
        description: manifest.description || '',
        author: manifest.author || '',
        tags: manifest.tags || [],
        source: 'local',
        path: skill.dir || '',
      })
      storage.saveDownloadedSkills(cached)
    }
    storage.addDownloadedId(id)
    storage.addSessionDownload(id, skill.manifest?.name || skill.name, 'agent')
    refreshDownloaded()
    refreshCounts()
    showToast({ type: 'success', message: `已导入「${skill.manifest?.name || skill.name}」到我的 Skill` })
  } catch (err: any) {
    showToast({ type: 'error', message: err?.message || `导入「${skill.manifest?.name || skill.name}」失败` })
  }
  importing.value[id] = false
}

function requestImportSkillToMy(skill: any) {
  if (!importing.value[getSkillId(skill)]) confirmImportSkill.value = skill
}

function executeUninstallByScope() {
  const dir = uninstallScopeDir.value
  if (!dir) return
  const selected = uninstallScopeOptions.value.filter((o) => o.checked).map((o) => o.scope)
  if (!selected.length) {
    showToast({ type: 'warning', message: '请选择至少一个范围' })
    return
  }

  const records = storage.getDistributeRecords().filter((r) => r.targetPath.replace(/\\/g, '/') === dir.replace(/\\/g, '/'))
  const selectedRecords = records.filter((r) => selected.includes(r.scope || 'global'))
  if (selectedRecords.length) {
    for (const r of selectedRecords) {
      const result = uninstallPathAndRecord({
        targetPath: r.targetPath,
        skillId: r.skillId,
        skillName: uninstallScopeSkillName.value || r.skillId,
        platformId: r.platformId,
        scope: r.scope,
      })
      if (!result.ok) {
        showToast({ type: 'error', message: `删除失败: ${result.error || '请检查文件权限'}` })
        return
      }
      const warning = formatSkillLifecycleWarnings('uninstall', result.warnings)
      if (warning) showToast({ type: 'warning', message: warning })
    }
  } else {
    const rm = safeRemovePath(dir)
    if (!rm.ok) {
      showToast({ type: 'error', message: `删除失败: ${rm.error || '请检查文件权限'}` })
      return
    }
  }

  refreshCurrent()
  showToast({ type: 'success', message: '已卸载' })
  uninstallScopeDir.value = null
  confirmDeleteDir.value = null
}

function uninstallSkill(skill: any) {
  const dir = skill.dir
  const allRecords = storage.getDistributeRecords().filter((r) => r.targetPath.replace(/\\/g, '/') === dir.replace(/\\/g, '/'))
  const hasGlobal = allRecords.some((r) => r.scope !== 'project')
  const hasProject = allRecords.some((r) => r.scope === 'project')

  if (hasGlobal && hasProject) {
    showUninstallScopePicker(dir, skill.manifest?.name || skill.name)
    confirmDeleteDir.value = null
    return
  }

  if (allRecords.length) {
    for (const r of allRecords) {
      const result = uninstallPathAndRecord({
        targetPath: r.targetPath,
        skillId: r.skillId,
        skillName: skill.manifest?.name || skill.name,
        platformId: r.platformId,
        scope: r.scope,
      })
      if (!result.ok) {
        showToast({ type: 'error', message: `删除失败: ${result.error || '请检查文件权限'}` })
        return
      }
      const warning = formatSkillLifecycleWarnings('uninstall', result.warnings)
      if (warning) showToast({ type: 'warning', message: warning })
    }
  } else {
    const rm = safeRemovePath(dir)
    if (!rm.ok) {
      showToast({ type: 'error', message: `删除失败: ${rm.error || '请检查文件权限'}` })
      return
    }
  }
  refreshCurrent()
  for (const r of allRecords) storage.removeDistributeRecord(r.skillId, r.platformId, r.scope)
  confirmDeleteDir.value = null
}

const batchMode = ref(false)
const selectedIds = ref<Set<string>>(new Set())
const confirmDeleteDir = ref<string | null>(null)
const confirmDeleteSkillName = ref('')
const showBatchDeleteConfirm = ref(false)

const uninstallScopeDir = ref<string | null>(null)
const uninstallScopeSkillName = ref('')
const uninstallScopeOptions = ref<{ scope: string; label: string; checked: boolean }[]>([])
function showUninstallScopePicker(dir: string, name: string) {
  const records = storage.getDistributeRecords().filter((r) => r.targetPath.replace(/\\/g, '/') === dir.replace(/\\/g, '/'))
  const hasGlobal = records.some((r) => r.scope !== 'project')
  const hasProject = records.some((r) => r.scope === 'project')
  uninstallScopeOptions.value = []
  if (hasGlobal) uninstallScopeOptions.value.push({ scope: 'global', label: 'Agent 平台目录', checked: true })
  if (hasProject) uninstallScopeOptions.value.push({ scope: 'project', label: '项目目录', checked: true })
  uninstallScopeDir.value = dir
  uninstallScopeSkillName.value = name
}

function toggleBatchMode() {
  batchMode.value = !batchMode.value
  selectedIds.value.clear()
}

function toggleSelectAll() {
  if (selectedIds.value.size === filteredSkills.value.length) {
    selectedIds.value.clear()
  } else {
    selectedIds.value = new Set(filteredSkills.value.map((s) => s.dir))
  }
}

function toggleSelect(dir: string) {
  const s = new Set(selectedIds.value)
  if (s.has(dir)) s.delete(dir)
  else s.add(dir)
  selectedIds.value = s
}

const isAllSelected = computed(() => filteredSkills.value.length > 0 && selectedIds.value.size === filteredSkills.value.length)

function batchDelete() {
  showBatchDeleteConfirm.value = true
}

function batchSetAgentSkillsEnabled(enabled: boolean) {
  const selectedSkills = filteredSkills.value.filter((skill) => selectedIds.value.has(skill.dir))
  let successCount = 0
  let failCount = 0

  for (const skill of selectedSkills) {
    try {
      toggleSkillEnabled(skill.dir, enabled)
      successCount++
    } catch {
      failCount++
    }
  }

  const platform = selectedPlatform.value
  const scanDir = platform ? getPlatformPath(platform, 'global') || getPlatformPath(platform, 'project') : ''
  if (platform && scanDir) {
    try {
      const scan = window.services.scanForSkillFilesIncludingDisabled || window.services.scanForSkillFiles
      updateAgentPlatformSkills(platform.id, scan([scanDir]))
    } catch {
      updateAgentPlatformSkills(platform.id, [])
    }
  } else {
    updateAgentPlatformSkills(
      selectedId.value,
      selectedSkills.map((skill) => ({ ...skill, enabled })),
    )
  }

  refreshCounts()
  selectedIds.value.clear()
  batchMode.value = false
  const action = enabled ? '启用' : '停用'
  if (failCount > 0 && successCount > 0) {
    showToast({ type: 'warning', message: `批量${action}完成：${successCount} 个成功，${failCount} 个失败` })
  } else if (failCount > 0) {
    showToast({ type: 'error', message: `批量${action}失败：${failCount} 个 Skill` })
  } else if (successCount > 0) {
    showToast({ type: 'success', message: `已批量${action} ${successCount} 个 Skill` })
  }
}

function requestBatchImportToMySkills() {
  if (selectedIds.value.size > 0) showBatchImportConfirm.value = true
}

function batchImportToMySkills() {
  showBatchImportConfirm.value = false
  const selectedSkills = filteredSkills.value.filter((skill) => selectedIds.value.has(skill.dir) && getBadgeType(skill) === 'local')
  let successCount = 0
  let failCount = 0

  for (const skill of selectedSkills) {
    try {
      importScanResultToMySkills({ skill, sessionSource: 'agent' })
      successCount++
    } catch {
      failCount++
    }
  }

  refreshDownloaded()
  refreshCounts()
  selectedIds.value.clear()
  batchMode.value = false
  if (failCount > 0 && successCount > 0) {
    showToast({ type: 'warning', message: `导入完成：${successCount} 成功，${failCount} 失败` })
  } else if (failCount > 0) {
    showToast({ type: 'error', message: `批量导入失败：${failCount} 个 Skill` })
  } else if (successCount > 0) {
    showToast({ type: 'success', message: `已导入 ${successCount} 个技能到我的 Skill` })
  } else {
    showToast({ type: 'warning', message: '选中的 Skill 没有可导入到我的 Skill 的本地项目' })
  }
}

function executeBatchDelete() {
  let failCount = 0
  let okCount = 0
  for (const dir of selectedIds.value) {
    const selectedSkill = filteredSkills.value.find((s) => s.dir === dir)
    const records = storage.getDistributeRecords().filter((r) => r.targetPath.replace(/\\/g, '/') === dir.replace(/\\/g, '/'))
    let failed = false
    if (records.length) {
      for (const r of records) {
        const result = uninstallPathAndRecord({
          targetPath: r.targetPath,
          skillId: r.skillId,
          skillName: selectedSkill?.manifest?.name || selectedSkill?.name || r.skillId,
          platformId: r.platformId,
          scope: r.scope,
        })
        if (!result.ok) failed = true
        const warning = formatSkillLifecycleWarnings('uninstall', result.warnings)
        if (warning) showToast({ type: 'warning', message: warning })
      }
    } else {
      const rm = safeRemovePath(dir)
      if (!rm.ok) failed = true
    }
    if (failed) failCount++
    else okCount++
  }
  if (failCount > 0 && okCount > 0) {
    showToast({ type: 'warning', message: `${okCount} 个已删除，${failCount} 个失败` })
  } else if (failCount > 0) {
    showToast({ type: 'error', message: `${failCount} 个技能删除失败，请检查文件权限` })
  }
  refreshCurrent()
  selectedIds.value.clear()
  batchMode.value = false
  showBatchDeleteConfirm.value = false
}

const showImportModal = ref(false)
const importingFromMy = ref(false)
const importSearch = ref('')
const selectedImportIds = ref<Set<string>>(new Set())
const allCachedSkills = ref<Skill[]>([])

const filteredMySkills = computed(() => {
  const q = importSearch.value.toLowerCase().trim()
  const skills = allCachedSkills.value.filter((s) => storage.isDownloaded(s.id))
  const filtered = !q ? skills : skills.filter((s) => s.name.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q))
  return sortProcessedSkillsLast(filtered, isAlreadyInAgent)
})

function openImportModal() {
  allCachedSkills.value = storage.getDownloadedSkills()
  selectedImportIds.value = new Set()
  importSearch.value = ''
  refreshPlatformSkillsForImport()
  showImportModal.value = true
}

function refreshPlatformSkillsForImport() {
  if (!selectedPlatform.value) return
  const dir = getPlatformPath(selectedPlatform.value, 'global') || getPlatformPath(selectedPlatform.value, 'project')
  if (dir) {
    try {
      updateAgentPlatformSkills(selectedPlatform.value.id, (window.services.scanForSkillFilesIncludingDisabled || window.services.scanForSkillFiles)([dir]))
    } catch {
      updateAgentPlatformSkills(selectedPlatform.value.id, [])
    }
  }
}

function isAlreadyInAgent(skill: Skill): boolean {
  if (!selectedPlatform.value) return false
  const platformPath = getPlatformPath(selectedPlatform.value, 'global') || getPlatformPath(selectedPlatform.value, 'project')
  if (!platformPath) return false
  const existingSkills = platformSkills.value[selectedPlatform.value.id] || []
  return existingSkills.some((s: any) => {
    const skillName = skill.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    return s.dir.includes(skillName) || (s.manifest?.name || s.name).toLowerCase() === skill.name.toLowerCase()
  })
}

function toggleImportSelect(skill: Skill) {
  const s = new Set(selectedImportIds.value)
  if (s.has(skill.id)) s.delete(skill.id)
  else s.add(skill.id)
  selectedImportIds.value = s
}

function selectAllMySkills() {
  const selectable = filteredMySkills.value.filter((s) => !isAlreadyInAgent(s))
  if (selectedImportIds.value.size === selectable.length) {
    selectedImportIds.value = new Set()
  } else {
    selectedImportIds.value = new Set(selectable.map((s) => s.id))
  }
}

function confirmImportFromMy() {
  if (importingFromMy.value) return
  importingFromMy.value = true
  try {
    const targetPlatform = selectedPlatform.value
    if (!targetPlatform) {
      showToast({ type: 'error', message: '请先选择 Agent' })
      importingFromMy.value = false
      return
    }
    const targetDir = getPlatformPath(targetPlatform, 'global') || getPlatformPath(targetPlatform, 'project')
    if (!targetDir) {
      showToast({ type: 'error', message: '未找到 Agent 路径' })
      importingFromMy.value = false
      return
    }
    let importedCount = 0
    let failCount = 0
    for (const skillId of selectedImportIds.value) {
      const skill = allCachedSkills.value.find((s) => s.id === skillId)
      if (!skill) continue
      const skillDirName =
        skill.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || skill.id
      const dest = window.services.pathJoin(targetDir, skillDirName)
      const repoDir = getSkillsRepoDir(skillId)
      const sourceDir = window.services.pathExists(repoDir)
        ? repoDir
        : (skill as any).path && window.services.pathExists((skill as any).path)
          ? (skill as any).path
          : null
      try {
        if (!sourceDir) {
          showToast({ type: 'warning', message: `「${skill.name}」的源文件不存在，已跳过` })
          failCount++
          continue
        }
        window.services.mkdir(dest)
        window.services.copyFile(sourceDir, dest)
        storage.saveDistributeRecord({
          skillId: skill.id,
          platformId: targetPlatform.id,
          mode: 'copy',
          scope: 'global',
          targetPath: dest,
          sourceDir,
          distributedAt: new Date().toISOString(),
        })
        importedCount++
      } catch {
        failCount++
      }
    }
    if (importedCount > 0 && failCount > 0) {
      showToast({ type: 'warning', message: `导入完成：${importedCount} 成功，${failCount} 失败` })
      refreshCurrent()
    } else if (importedCount > 0) {
      showToast({ type: 'success', message: `已导入 ${importedCount} 个技能到 ${targetPlatform.name}` })
      refreshCurrent()
      _platformInstallDirs.value = getPlatFormInstallDirSet()
    } else if (failCount > 0) {
      showToast({ type: 'error', message: `所有技能导入失败` })
    }
  } catch (err: any) {
    showToast({ type: 'error', message: err.message })
  }
  importingFromMy.value = false
  selectedImportIds.value = new Set()
  showImportModal.value = false
}
</script>

<template>
  <div class="agent-skills">
    <div class="page-header">
      <div class="header-left">
        <div class="header-title-row">
          <h2>Agent Skill</h2>
          <span class="count-badge">{{ selectedSkills.length }}</span>
        </div>
        <p class="page-subtitle">浏览每个 Agent 的 Skill 目录，并管理复制或软链接分发。</p>
      </div>
      <div class="header-toolbar">
        <button class="toolbar-btn import-btn" :disabled="!selectedPlatform" @click="openImportModal">
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
        <button class="toolbar-btn" :class="{ 'batch-active': batchMode }" :disabled="!filteredSkills.length" @click="toggleBatchMode">
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
        <button class="toolbar-icon-btn" title="刷新" :disabled="loading" @click="refreshCurrent">
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
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
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

    <div class="as-filter-row">
      <QuickSwitcher
        :items="platformItems"
        :selected-id="selectedId"
        placeholder="搜索 Agent..."
        @select="selectPlatform(detectedPlatforms.find((p) => p.id === $event)!)"
      >
        <template #trigger-prefix="{ item }">
          <ProviderIcon v-if="item" :icon="platformIconForSwitcher(item)" :size="22" variant="mono" />
        </template>
        <template #item-prefix="{ item }">
          <ProviderIcon :icon="platformIconForSwitcher(item)" :size="18" variant="mono" />
        </template>
      </QuickSwitcher>
      <div class="as-filter-actions">
        <button
          class="toolbar-icon-btn"
          title="打开文件夹"
          :disabled="!selectedPlatform"
          @click="openPlatformFolder"
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
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      </div>
    </div>

    <div class="filter-tabs">
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
        <span class="tab-count">{{ selectedSkills.length }}</span>
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
    </div>

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
        <button class="batch-action-btn" title="批量启用" :disabled="selectedIds.size === 0" @click="batchSetAgentSkillsEnabled(true)">
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
        <button class="batch-action-btn" title="批量停用" :disabled="selectedIds.size === 0" @click="batchSetAgentSkillsEnabled(false)">
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
        <button class="batch-action-btn primary" title="批量导入到我的 Skill" :disabled="selectedIds.size === 0" @click="requestBatchImportToMySkills">
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
        <button class="batch-action-btn danger" :disabled="selectedIds.size === 0" @click="batchDelete">
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
          删除
        </button>
      </div>
    </div>

    <template v-if="selectedPlatform">
      <div class="as-scroll">
        <div v-if="loading" class="loading">扫描中...</div>
        <div v-else-if="!filteredSkills.length" class="empty-state">未找到技能</div>
        <div v-else class="skill-grid" :class="viewMode">
          <SkillCard
            v-for="s in filteredSkills"
            :key="s.dir"
            :name="s.manifest?.name || s.name"
            :description="s.manifest?.description || ''"
            empty-description-reason="Agent 技能描述未解析成功"
            :selected="selectedIds.has(s.dir)"
            :show-batch-checkbox="batchMode"
            :show-platform-icons="false"
            :show-chinese-tag="getLanguageTags(s).showChineseTag"
            :show-translated-tag="getLanguageTags(s).showTranslatedTag"
            :badges="getBadge(s).text ? [{ text: getBadge(s).text, type: getBadge(s).type }] : []"
            :show-symlink-badge="!!s.isSymlink"
            @click="batchMode ? toggleSelect(s.dir) : openSkillDetail(s)"
            @select="toggleSelect(s.dir)"
          >
            <template #top-left>
              <SkillEnabledToggle
                :enabled="isSkillEnabled(s)"
                :busy="!!toggling[s.dir]"
                @toggle="toggleAgentSkill(s)"
              />
            </template>
            <template #actions>
              <button class="card-action-btn" title="打开文件夹" @click.stop="openFolder(s)">
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
              <button v-if="getBadgeType(s) !== 'local'" class="card-action-btn primary" title="分发到平台" @click.stop="openDeploy(s)">
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
                v-if="getBadgeType(s) === 'local'"
                class="card-action-btn primary"
                :disabled="importing[getSkillId(s)]"
                title="导入到我的 Skill"
                @click.stop="requestImportSkillToMy(s)"
              >
                <svg
                  v-if="importing[getSkillId(s)]"
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
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
              <button
                class="card-action-btn danger"
                title="删除"
                @click.stop="((confirmDeleteDir = s.dir), (confirmDeleteSkillName = s.manifest?.name || s.name))"
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
            </template>
          </SkillCard>
        </div>
      </div>
    </template>
    <div v-else class="empty-right">选择 Agent 查看技能</div>

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
        <p class="modal-desc">
          选择要导入到 <strong>{{ selectedPlatform?.name }}</strong> 的技能
        </p>

        <div class="modal-toolbar">
          <input v-model="importSearch" type="text" placeholder="搜索技能..." class="modal-search" />
          <button class="modal-select-all" @click="selectAllMySkills">
            {{ selectedImportIds.size === filteredMySkills.filter((s) => !isAlreadyInAgent(s)).length ? '取消全选' : '全选' }}
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
              :class="{ selected: selectedImportIds.has(skill.id), disabled: isAlreadyInAgent(skill) }"
              @click="!isAlreadyInAgent(skill) && toggleImportSelect(skill)"
            >
              <div class="modal-skill-check" :class="{ checked: selectedImportIds.has(skill.id) || isAlreadyInAgent(skill) }">
                <svg
                  v-if="selectedImportIds.has(skill.id) || isAlreadyInAgent(skill)"
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
                  <span v-if="isAlreadyInAgent(skill)" class="badge-already">已在 Agent 中</span>
                </div>
                <div class="modal-skill-desc">
                  {{ skill.description || 'Agent 技能描述未解析成功' }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="modal-btn cancel" @click="showImportModal = false">取消</button>
          <button class="modal-btn confirm" :disabled="!selectedImportIds.size || importingFromMy" @click="confirmImportFromMy">
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

    <DeployModal v-if="showDeployModal && deploySkill" :skill="deploySkill" @close="showDeployModal = false" @deployed="onDeployed" />

    <ConfirmModal
      v-if="confirmImportSkill"
      title="确认导入 Skill"
      :message="`确定要将 <strong>${confirmImportSkill.manifest?.name || confirmImportSkill.name}</strong> 导入到我的 Skill 吗？`"
      confirm-text="导入"
      @confirm="importSkillToMy(confirmImportSkill)"
      @cancel="confirmImportSkill = null"
    />

    <ConfirmModal
      v-if="showBatchImportConfirm"
      title="批量导入 Skill"
      :message="`确定要将选中的 <strong>${selectedIds.size}</strong> 个 Agent Skill 导入到我的 Skill 吗？`"
      :confirm-text="`导入 ${selectedIds.size} 个 Skill`"
      @confirm="batchImportToMySkills"
      @cancel="showBatchImportConfirm = false"
    />

    <ConfirmModal
      v-if="confirmDeleteDir"
      title="删除 Skill"
      :message="`确定要删除 <strong>${confirmDeleteSkillName}</strong> 吗？此操作不可撤销。`"
      @confirm="uninstallSkill({ dir: confirmDeleteDir, manifest: { name: confirmDeleteSkillName } })"
      @cancel="confirmDeleteDir = null"
    />

    <div v-if="showBatchDeleteConfirm" class="confirm-overlay">
      <div class="confirm-modal">
        <div class="confirm-header">
          <div class="confirm-icon">
            <svg
              width="20"
              height="20"
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
          </div>
          <h3 class="confirm-title">批量删除 Skill</h3>
          <button class="confirm-close" @click="showBatchDeleteConfirm = false">
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
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div class="confirm-body">
          <p class="confirm-desc">
            确定要删除选中的 <strong>{{ selectedIds.size }}</strong> 个 Skill 吗？此操作不可撤销。
          </p>
        </div>
        <div class="confirm-footer">
          <button class="confirm-btn cancel" @click="showBatchDeleteConfirm = false">取消</button>
          <button class="confirm-btn delete" @click="executeBatchDelete">
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
            删除 {{ selectedIds.size }} 个 Skill
          </button>
        </div>
      </div>
    </div>

    <div v-if="uninstallScopeDir" class="confirm-overlay">
      <div class="confirm-modal">
        <div class="confirm-header">
          <div class="confirm-icon">
            <svg
              width="20"
              height="20"
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
          </div>
          <h3 class="confirm-title">卸载 Skill</h3>
          <button class="confirm-close" @click="uninstallScopeDir = null">
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
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div class="confirm-body">
          <p class="confirm-desc">
            <strong>{{ uninstallScopeSkillName }}</strong> 同时存在于以下位置，请选择要卸载的范围：
          </p>
          <div class="scope-list">
            <label v-for="opt in uninstallScopeOptions" :key="opt.scope" class="scope-item" :class="{ checked: opt.checked }">
              <input v-model="opt.checked" type="checkbox" class="scope-checkbox" />
              <span class="scope-label">{{ opt.label }}</span>
            </label>
          </div>
        </div>
        <div class="confirm-footer">
          <button class="confirm-btn cancel" @click="uninstallScopeDir = null">取消</button>
          <button class="confirm-btn delete" @click="executeUninstallByScope">
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
            确认卸载
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.agent-skills {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0;
}

.as-filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 28px 0;
  flex-wrap: wrap;
}

.as-filter-row .quick-switcher {
  width: 240px;
  flex-shrink: 0;
}

.as-filter-actions {
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

.toolbar-btn.import-btn {
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  border-color: hsl(var(--primary));
}
.toolbar-btn.import-btn:hover {
  background: hsl(var(--primary) / 0.85);
  border-color: hsl(var(--primary) / 0.85);
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

.as-scroll {
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

.loading,
.empty-state,
.empty-right {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  color: hsl(var(--muted-foreground));
  font-size: 13px;
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
  min-height: 56px;
  padding: 10px;
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
  margin: 0 0 14px;
}
.confirm-desc strong {
  color: hsl(var(--foreground));
  font-weight: 600;
}
.scope-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.scope-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--accent) / 0.15);
  cursor: pointer;
}
.scope-item.checked {
  border-color: hsl(var(--primary) / 0.45);
  background: hsl(var(--primary) / 0.06);
}
.scope-checkbox {
  accent-color: hsl(var(--primary));
}
.scope-label {
  font-size: 13px;
  font-weight: 500;
  color: hsl(var(--foreground));
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

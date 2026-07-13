import { ref, computed } from 'vue'
import { storage } from '../utils/storage'
import { detectPlatforms, getPlatformPath, getDefaultPlatformOrder } from '../data/platforms'
import { useProjectState } from './useProjectState'
import { normalizeSkillNameKey } from '../utils/skill-identity'
import type { Skill, SkillScanResult } from '../types'

function normalizeSkillScanResult(scan: SkillScanResult): Skill {
  const name = scan.manifest?.name || scan.name
  return {
    id: name,
    name,
    description: scan.manifest?.description || '',
    author: scan.manifest?.author || '',
    tags: scan.manifest?.tags || [],
    source: 'local',
    path: scan.dir,
  }
}

const agentSkills = ref<Record<string, SkillScanResult[]>>({})
const agentSkillsLoaded = ref(false)
const agentSkillsDirty = ref(false)
const downloadedSkillsVersion = ref(0)

export { normalizeSkillScanResult }

export function useSkillInventory() {
  const { registeredProjects } = useProjectState()

  function ensureAgentSkills() {
    if (agentSkillsLoaded.value) return
    agentSkillsLoaded.value = true
    try {
      const allPlatforms = detectPlatforms()
      const installedPlatforms = allPlatforms.filter((p) => p.detected && p.enabled !== false)
      const platformOrder = storage.getPlatformOrder()
      const orderToUse = platformOrder.length ? platformOrder : getDefaultPlatformOrder()
      const orderMap = new Map(orderToUse.map((id, idx) => [id, idx]))
      installedPlatforms.sort((a, b) => (orderMap.get(a.id) ?? Infinity) - (orderMap.get(b.id) ?? Infinity))

      const result: Record<string, SkillScanResult[]> = {}
      for (const p of installedPlatforms) {
        const dir = getPlatformPath(p, 'global') || getPlatformPath(p, 'project')
        if (dir) {
          try {
            result[p.id] = window.services.scanForSkillFiles([dir])
          } catch (e) {
            console.warn('[useSkillInventory] scan failed for', p.id, dir, e)
            result[p.id] = []
          }
        } else {
          result[p.id] = []
        }
      }
      agentSkills.value = result
    } catch (e) {
      console.warn('[useSkillInventory] ensureAgentSkills failed:', e)
    }
  }

  function refreshAgentSkills() {
    agentSkillsLoaded.value = false
    ensureAgentSkills()
  }

  function markAgentSkillsDirty() {
    agentSkillsDirty.value = true
  }

  function refreshDirtyAgentSkills() {
    if (!agentSkillsDirty.value) return
    agentSkillsLoaded.value = false
    ensureAgentSkills()
    agentSkillsDirty.value = false
  }

  function updateAgentPlatformSkills(platformId: string, skills: SkillScanResult[]) {
    agentSkills.value = { ...agentSkills.value, [platformId]: skills }
  }

  function bumpDownloadedSkillsVersion() {
    downloadedSkillsVersion.value++
  }

  const allSkills = computed(() => {
    downloadedSkillsVersion.value // 建立响应式依赖
    const cachedSkills = (storage.getDownloadedSkills() as Skill[]).filter((s) => storage.isDownloaded(s.id))
    const projectSkills = registeredProjects.value.flatMap((p) => p.skills || []) as SkillScanResult[]
    const agentList = Object.values(agentSkills.value).flat() as SkillScanResult[]

    const combined: Skill[] = [...cachedSkills]
    const seenNames = new Set(cachedSkills.map((s) => normalizeSkillNameKey(s.name)))

    for (const scan of projectSkills) {
      const normalized = normalizeSkillScanResult(scan)
      const key = normalizeSkillNameKey(normalized.name)
      if (!seenNames.has(key)) {
        seenNames.add(key)
        combined.push(normalized)
      }
    }
    for (const scan of agentList) {
      const normalized = normalizeSkillScanResult(scan)
      const key = normalizeSkillNameKey(normalized.name)
      if (!seenNames.has(key)) {
        seenNames.add(key)
        combined.push(normalized)
      }
    }
    return combined
  })

  const agentCount = computed(() => Object.keys(agentSkills.value).length)

  const totalAgentSkillCount = computed(() => Object.values(agentSkills.value).reduce((sum, skills) => sum + skills.length, 0))

  return {
    agentSkills,
    agentSkillsLoaded,
    allSkills,
    agentCount,
    totalAgentSkillCount,
    ensureAgentSkills,
    refreshAgentSkills,
    updateAgentPlatformSkills,
    markAgentSkillsDirty,
    isAgentSkillsDirty: agentSkillsDirty,
    refreshDirtyAgentSkills,
    bumpDownloadedSkillsVersion,
  }
}

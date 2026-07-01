import { ref, computed } from 'vue'
import { storage } from '../utils/storage'
import { detectPlatforms, getPlatformPath, defaultPlatforms } from '../data/platforms'
import { useProjectState } from './useProjectState'
import type { Skill, SkillFormat, SkillScanResult } from '../types'

function normalizeSkillScanResult(scan: SkillScanResult): Skill {
  const name = scan.manifest?.name || scan.name
  return {
    id: name,
    name,
    description: scan.manifest?.description || '',
    author: scan.manifest?.author || '',
    tags: scan.manifest?.tags || [],
    format: (scan.manifest?.format as SkillFormat) || 'generic',
    source: 'local',
    path: scan.dir,
  }
}

const agentSkills = ref<Record<string, SkillScanResult[]>>({})
const agentSkillsLoaded = ref(false)

export { normalizeSkillScanResult }

export function useSkillInventory() {
  const { registeredProjects } = useProjectState()

  function ensureAgentSkills() {
    if (agentSkillsLoaded.value) return
    agentSkillsLoaded.value = true
    try {
      const allPlatforms = detectPlatforms()
      const savedConfigs = storage.getPlatformConfigs()
      const installedPlatforms = allPlatforms.filter((p) => {
        if (!p.detected) return false
        const saved = savedConfigs.find((c) => c.id === p.id)
        return saved ? saved.enabled : p.enabled
      })
      const platformOrder = storage.getPlatformOrder()
      const orderToUse = platformOrder.length ? platformOrder : defaultPlatforms.map(p => p.id)
      const orderMap = new Map(orderToUse.map((id, idx) => [id, idx]))
      installedPlatforms.sort((a, b) => (orderMap.get(a.id) ?? Infinity) - (orderMap.get(b.id) ?? Infinity))

      const result: Record<string, SkillScanResult[]> = {}
      for (const p of installedPlatforms) {
        const dir = getPlatformPath(p, 'global') || getPlatformPath(p, 'project')
        if (dir) {
          try {
            result[p.id] = window.services.scanForSkillFiles([dir])
          } catch {
            result[p.id] = []
          }
        } else {
          result[p.id] = []
        }
      }
      agentSkills.value = result
    } catch { /* ignore */ }
  }

  function refreshAgentSkills() {
    agentSkillsLoaded.value = false
    ensureAgentSkills()
  }

  function updateAgentPlatformSkills(platformId: string, skills: SkillScanResult[]) {
    agentSkills.value = { ...agentSkills.value, [platformId]: skills }
  }

  const allSkills = computed(() => {
    const cachedSkills = (storage.getCachedSkills() as Skill[]).filter(s => storage.isDownloaded(s.id))
    const projectSkills = registeredProjects.value.flatMap(p => p.skills || []) as SkillScanResult[]
    const agentList = Object.values(agentSkills.value).flat() as SkillScanResult[]

    const combined: Skill[] = [...cachedSkills]
    const seenNames = new Set(cachedSkills.map(s => s.name.toLowerCase()))

    for (const scan of projectSkills) {
      const normalized = normalizeSkillScanResult(scan)
      if (!seenNames.has(normalized.name.toLowerCase())) {
        seenNames.add(normalized.name.toLowerCase())
        combined.push(normalized)
      }
    }
    for (const scan of agentList) {
      const normalized = normalizeSkillScanResult(scan)
      if (!seenNames.has(normalized.name.toLowerCase())) {
        seenNames.add(normalized.name.toLowerCase())
        combined.push(normalized)
      }
    }
    return combined
  })

  const agentCount = computed(() => Object.keys(agentSkills.value).length)

  const totalAgentSkillCount = computed(() =>
    Object.values(agentSkills.value).reduce((sum, skills) => sum + skills.length, 0)
  )

  return {
    agentSkills,
    agentSkillsLoaded,
    allSkills,
    agentCount,
    totalAgentSkillCount,
    ensureAgentSkills,
    refreshAgentSkills,
    updateAgentPlatformSkills,
  }
}

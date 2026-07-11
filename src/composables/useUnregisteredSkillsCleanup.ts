import { ref } from 'vue'
import { storage } from '../utils/storage'
import { loadRegistry } from '../utils/skill-registry'
import { isRegisteredSkillsRepoFolder } from '../utils/skill-path'

/**
 * Settings: scan / clean unregistered folders under skills-repo.
 */
export function useUnregisteredSkillsCleanup() {
  const showCleanupSelect = ref(false)
  const unregisteredDirs = ref<string[]>([])
  const cleanupResult = ref<{ found: number; deleted: number } | null>(null)

  function scanUnregisteredSkills(): string[] {
    const stateDir = window.services.getStateDir()
    const registry = loadRegistry()
    const registeredIds = new Set<string>()
    for (const identity of registry.values()) {
      registeredIds.add(identity.canonicalId)
    }
    for (const s of storage.getCachedSkills()) {
      if (s.id) registeredIds.add(s.id)
    }
    const entries = window.services.readDir(stateDir)
    const unregistered: string[] = []
    for (const entry of entries) {
      if (!entry.isDirectory) continue
      if (isRegisteredSkillsRepoFolder(entry.name, registeredIds)) continue
      unregistered.push(entry.path)
    }
    return unregistered
  }

  function getUnregisteredCount(): number {
    return scanUnregisteredSkills().length
  }

  function openCleanupSelect() {
    unregisteredDirs.value = scanUnregisteredSkills()
    showCleanupSelect.value = true
  }

  function onCleanupDeleted(count: number, showToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void) {
    cleanupResult.value = { found: unregisteredDirs.value.length, deleted: count }
    showCleanupSelect.value = false
    showToast(`已清理 ${count} 个未注册的技能文件夹`, 'success')
  }

  return {
    showCleanupSelect,
    unregisteredDirs,
    cleanupResult,
    scanUnregisteredSkills,
    getUnregisteredCount,
    openCleanupSelect,
    onCleanupDeleted,
  }
}

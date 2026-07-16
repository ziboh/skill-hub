import { ref } from 'vue'
import { storage } from '../utils/storage'
import { isRegisteredSkillsRepoFolder } from '../utils/skill-path'
import type { ShowToast } from '../inject-keys'

/**
 * Settings: scan / clean skills-repo folders not present in downloaded skills.
 */
export function useUnregisteredSkillsCleanup() {
  const showCleanupSelect = ref(false)
  const unregisteredDirs = ref<string[]>([])
  const cleanupResult = ref<{ found: number; deleted: number } | null>(null)

  function scanUnregisteredSkills(): string[] {
    const stateDir = window.services.getStateDir()
    const downloadedIds = new Set<string>()
    for (const s of storage.getDownloadedSkills()) {
      if (s.id) downloadedIds.add(s.id)
    }
    const entries = window.services.readDir(stateDir)
    const unregistered: string[] = []
    for (const entry of entries) {
      if (!entry.isDirectory) continue
      if (isRegisteredSkillsRepoFolder(entry.name, downloadedIds)) continue
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

  function onCleanupDeleted(count: number, failed: number, showToast: ShowToast) {
    cleanupResult.value = { found: unregisteredDirs.value.length, deleted: count }
    showCleanupSelect.value = false
    if (failed && count) {
      showToast({ type: 'warning', message: `已清理 ${count} 个文件夹，${failed} 个删除失败，请检查文件权限` })
    } else if (failed) {
      showToast({ type: 'error', message: `${failed} 个文件夹删除失败，请检查文件权限` })
    } else {
      showToast({ type: 'success', message: `已清理 ${count} 个未在已下载列表中的技能文件夹` })
    }
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

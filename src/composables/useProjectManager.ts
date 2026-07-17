import { ref } from 'vue'
import { useProjectState } from './useProjectState'
import { storage } from '../utils/storage'
import { getAllPlatformDefinitions } from '../data/platforms'
import { syncAllowedWriteRoots } from '../utils/write-roots'
import { isValidGlobalSkillPath } from '../utils/path'
import type { RegisteredProject, SkillScanResult } from '../types'
import type { ShowToast } from '../inject-keys'

function getDefaultProjectScanSubdirs(): string[] {
  const paths = getAllPlatformDefinitions()
    .map((p) => p.projectPath || p.customProjectPath)
    .filter(Boolean)
    .map((p) => p!.replace(/^\.\//, ''))
  return ['.agents/skills', ...new Set(paths)]
}

export function useProjectManager(opts: { showToast: ShowToast; navigate: (code: string, params?: any) => void }) {
  const { registeredProjects, selectedProject, selectedProjectSkill, persistSelectedProject } = useProjectState()
  registeredProjects.value = storage.getRegisteredProjects()

  const showAddProjectModal = ref(false)
  const showEditProjectModal = ref(false)
  const editingProject = ref<RegisteredProject | null>(null)
  const showImportModal = ref(false)
  const projectScanning = ref(false)
  const addProjectError = ref('')

  let projectScanTimer: ReturnType<typeof setTimeout> | null = null

  function selectProject(project: RegisteredProject) {
    selectedProject.value = project
    selectedProjectSkill.value = project.skills?.[0] || null
    persistSelectedProject()
  }

  function selectProjectSkill(skill: SkillScanResult) {
    selectedProjectSkill.value = skill
  }

  function scanProject(project: RegisteredProject) {
    projectScanning.value = true
    if (projectScanTimer) clearTimeout(projectScanTimer)
    projectScanTimer = setTimeout(async () => {
      try {
        const dirs = [
          project.rootDir,
          ...getDefaultProjectScanSubdirs().map((d) => window.services.pathJoin(project.rootDir, d)),
          ...project.scanPaths,
        ]
        const scan = window.services.scanForSkillFilesIncludingDisabled || window.services.scanForSkillFiles
        const skills = scan(dirs)
        const idx = registeredProjects.value.findIndex((p) => p.id === project.id)
        if (idx >= 0) {
          const newList = [...registeredProjects.value]
          newList[idx] = { ...newList[idx], skills }
          registeredProjects.value = newList
          storage.saveRegisteredProjects(newList)
          selectedProject.value = newList[idx]
          if (!selectedProjectSkill.value || !skills?.some((s) => s.dir === selectedProjectSkill.value?.dir)) {
            selectedProjectSkill.value = skills?.[0] || null
          }
        }
      } catch (err) {
        console.error('[ProjectManager] scanProject failed:', err)
        opts.showToast({ type: 'error', message: err instanceof Error ? err.message : '扫描项目失败' })
      }
      projectScanning.value = false
    }, 300)
  }

  function validateProjectRoot(root: string): string | null {
    if (!isValidGlobalSkillPath(root)) {
      return '项目根目录路径格式无效，请填写当前系统支持的绝对路径或 ~ 路径。'
    }

    try {
      const result = window.services.stat(root)
      if (!result.exists) return '项目根目录不存在，请检查路径。'
      if (!result.isDirectory) return '项目根目录必须是文件夹。'
    } catch {
      return '无法访问项目根目录，请检查路径是否有效且有访问权限。'
    }

    return null
  }

  function validateScanPaths(scanPaths: string[]): string | null {
    for (const rawPath of scanPaths) {
      const path = rawPath.trim()
      if (!path) continue
      if (!isValidGlobalSkillPath(path)) {
        return `扫描路径格式无效：${path}`
      }
      try {
        const result = window.services.stat(path)
        if (!result.exists) return `扫描路径不存在：${path}`
        if (!result.isDirectory) return `扫描路径必须是文件夹：${path}`
      } catch {
        return `无法访问扫描路径：${path}`
      }
    }
    return null
  }

  function addProject(project: { name: string; rootDir: string; scanPaths: string[] }) {
    try {
      const root = project.rootDir.trim()
      const name = project.name.trim()
      if (!root || !name) return

      const rootError = validateProjectRoot(root)
      if (rootError) {
        addProjectError.value = rootError
        return
      }

      const scanPathError = validateScanPaths(project.scanPaths)
      if (scanPathError) {
        addProjectError.value = scanPathError
        return
      }

      const hasConflict = registeredProjects.value.some((p) => p.rootDir.toLowerCase() === root.toLowerCase())
      if (hasConflict) {
        const conflict = registeredProjects.value.find((p) => p.rootDir.toLowerCase() === root.toLowerCase())
        addProjectError.value = conflict
          ? `根目录已存在，与项目「${conflict.name}」冲突（${conflict.rootDir}）`
          : '该项目根目录已存在，请选择其他目录或删除已有项目'
        return
      }

      const newProject: RegisteredProject = {
        id: `project-${Date.now()}`,
        name,
        rootDir: root,
        scanPaths: project.scanPaths.filter((p) => p.trim()),
        skills: [],
        createdAt: new Date().toISOString(),
      }
      registeredProjects.value = [...registeredProjects.value, newProject]
      storage.saveRegisteredProjects(registeredProjects.value)
      syncAllowedWriteRoots({ projects: registeredProjects.value })
      selectedProject.value = newProject
      showAddProjectModal.value = false
      addProjectError.value = ''
      scanProject(newProject)
    } catch (err) {
      addProjectError.value = err instanceof Error ? err.message : '添加项目时发生未知错误'
    }
  }

  function updateProject(id: string, data: { name: string; rootDir: string; scanPaths: string[] }) {
    try {
      const root = data.rootDir.trim()
      const name = data.name.trim()
      if (!root || !name) return

      const rootError = validateProjectRoot(root)
      if (rootError) {
        addProjectError.value = rootError
        return
      }

      const scanPathError = validateScanPaths(data.scanPaths)
      if (scanPathError) {
        addProjectError.value = scanPathError
        return
      }

      const hasConflict = registeredProjects.value.some((p) => p.id !== id && p.rootDir.toLowerCase() === root.toLowerCase())
      if (hasConflict) {
        const conflict = registeredProjects.value.find((p) => p.id !== id && p.rootDir.toLowerCase() === root.toLowerCase())
        addProjectError.value = conflict
          ? `根目录已存在，与项目「${conflict.name}」冲突（${conflict.rootDir}）`
          : '该项目根目录已存在，请选择其他目录或删除已有项目'
        return
      }

      const patch = { name, rootDir: root, scanPaths: data.scanPaths.filter((p) => p.trim()) }
      storage.updateRegisteredProject(id, patch)
      const idx = registeredProjects.value.findIndex((p) => p.id === id)
      if (idx >= 0) {
        const newList = [...registeredProjects.value]
        newList[idx] = { ...newList[idx], ...patch }
        registeredProjects.value = newList
        selectedProject.value = newList[idx]
        syncAllowedWriteRoots({ projects: newList })
      }
      showEditProjectModal.value = false
      editingProject.value = null
      if (selectedProject.value) {
        scanProject(selectedProject.value)
      }
    } catch (err) {
      addProjectError.value = err instanceof Error ? err.message : '更新项目时发生未知错误'
    }
  }

  function removeProject(id: string) {
    registeredProjects.value = registeredProjects.value.filter((p) => p.id !== id)
    storage.saveRegisteredProjects(registeredProjects.value)
    syncAllowedWriteRoots({ projects: registeredProjects.value })
    if (selectedProject.value?.id === id) {
      if (registeredProjects.value.length > 0) {
        selectProject(registeredProjects.value[0])
      } else {
        selectedProject.value = null
        selectedProjectSkill.value = null
        opts.navigate('my')
      }
    }
    showEditProjectModal.value = false
    editingProject.value = null
  }

  function handleProjectSubmit(data: { name: string; rootDir: string; scanPaths: string[]; id?: string }) {
    addProjectError.value = ''
    if (data.id) {
      updateProject(data.id, data)
    } else {
      addProject(data)
    }
  }

  function editProject(project: RegisteredProject) {
    editingProject.value = project
    showEditProjectModal.value = true
  }

  return {
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
    addProject,
    updateProject,
    removeProject,
    handleProjectSubmit,
    editProject,
  }
}

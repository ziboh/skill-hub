import { ref } from 'vue'
import { useProjectState } from './useProjectState'
import { storage } from '../utils/storage'
import { defaultPlatforms } from '../data/platforms'
import type { RegisteredProject, SkillScanResult } from '../types'

const DEFAULT_PROJECT_SCAN_SUBDIRS = defaultPlatforms
  .filter(p => p.projectPath)
  .map(p => p.projectPath!.replace(/^\.\//, ''))

export function useProjectManager(opts: {
  showToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void
  navigate: (code: string, params?: any) => void
}) {
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
          ...DEFAULT_PROJECT_SCAN_SUBDIRS.map((d) => window.services.pathJoin(project.rootDir, d)),
          ...project.scanPaths,
        ]
        const skills = window.services.scanForSkillFiles(dirs)
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
        opts.showToast(err instanceof Error ? err.message : '扫描项目失败', 'error')
      }
      projectScanning.value = false
    }, 300)
  }

  function addProject(project: { name: string; rootDir: string; scanPaths: string[] }) {
    try {
      const root = project.rootDir.trim()
      const name = project.name.trim()
      if (!root || !name) return

      const hasConflict = registeredProjects.value.some(
        (p) => p.rootDir.toLowerCase() === root.toLowerCase(),
      )
      if (hasConflict) {
        const conflict = registeredProjects.value.find(
          (p) => p.rootDir.toLowerCase() === root.toLowerCase(),
        )
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

      const hasConflict = registeredProjects.value.some(
        (p) => p.id !== id && p.rootDir.toLowerCase() === root.toLowerCase(),
      )
      if (hasConflict) {
        showEditProjectModal.value = false
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
      }
      showEditProjectModal.value = false
      editingProject.value = null
      if (selectedProject.value) {
        scanProject(selectedProject.value)
      }
    } catch (err) {
      console.error('[ProjectManager] updateProject failed:', err)
    }
  }

  function removeProject(id: string) {
    registeredProjects.value = registeredProjects.value.filter((p) => p.id !== id)
    storage.saveRegisteredProjects(registeredProjects.value)
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

import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest'
import { useProjectManager } from '../useProjectManager'
import { useProjectState } from '../useProjectState'

function createManager() {
  const showToast = vi.fn()
  const navigate = vi.fn()
  vi.mocked(window.services.stat).mockReturnValue({ exists: true, isDirectory: true })
  const mgr = useProjectManager({ showToast, navigate })
  return { ...mgr, showToast, navigate }
}

beforeEach(() => {
  vi.useFakeTimers()
  window.ztools.dbStorage.clear()
  const ps = useProjectState()
  ps.registeredProjects.value = []
  ps.selectedProject.value = null
  ps.selectedProjectSkill.value = null
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useProjectManager', () => {
  function addProject(manager: ReturnType<typeof createManager>, name: string, rootDir: string) {
    vi.setSystemTime(new Date(2024, 0, 1 + manager.registeredProjects.value.length))
    manager.addProject({ name, rootDir, scanPaths: [] })
  }

  test('registeredProjects starts empty', () => {
    const { registeredProjects } = createManager()
    expect(registeredProjects.value).toEqual([])
  })

  test('addProject adds a project and selects it', () => {
    const mgr = createManager()
    addProject(mgr, 'Test', '/test/path')
    expect(mgr.registeredProjects.value).toHaveLength(1)
    expect(mgr.registeredProjects.value[0].name).toBe('Test')
    expect(mgr.selectedProject.value?.name).toBe('Test')
  })

  test('addProject detects root directory conflicts', () => {
    const mgr = createManager()
    addProject(mgr, 'First', '/same/path')
    addProject(mgr, 'Second', '/same/path')
    expect(mgr.registeredProjects.value).toHaveLength(1)
  })

  test('addProject sets error on conflict', () => {
    const mgr = createManager()
    addProject(mgr, 'First', '/same/path')
    addProject(mgr, 'Second', '/same/path')
    expect(mgr.addProjectError.value).toContain('冲突')
  })

  test('addProject rejects an invalid root path', () => {
    const mgr = createManager()
    mgr.addProject({ name: 'Invalid', rootDir: 'relative/path', scanPaths: [] })
    expect(mgr.registeredProjects.value).toHaveLength(0)
    expect(mgr.addProjectError.value).toContain('路径格式无效')
  })

  test('addProject rejects a missing root directory', () => {
    const mgr = createManager()
    vi.mocked(window.services.stat).mockReturnValue({ exists: false })
    mgr.addProject({ name: 'Missing', rootDir: '/missing/path', scanPaths: [] })
    expect(mgr.registeredProjects.value).toHaveLength(0)
    expect(mgr.addProjectError.value).toContain('不存在')
  })

  test('addProject rejects a root path that is not a directory', () => {
    const mgr = createManager()
    vi.mocked(window.services.stat).mockReturnValue({ exists: true, isDirectory: false })
    mgr.addProject({ name: 'File', rootDir: '/file', scanPaths: [] })
    expect(mgr.registeredProjects.value).toHaveLength(0)
    expect(mgr.addProjectError.value).toContain('必须是文件夹')
  })

  test('addProject rejects a scan path that can escape the project root', () => {
    const mgr = createManager()
    mgr.addProject({ name: 'Unsafe', rootDir: '/project', scanPaths: ['../outside'] })
    expect(mgr.registeredProjects.value).toHaveLength(0)
    expect(mgr.addProjectError.value).toContain('扫描路径格式无效')
  })

  test('addProject rejects a missing scan directory', () => {
    const mgr = createManager()
    vi.mocked(window.services.stat).mockImplementation((path: string) => ({
      exists: path === '/project',
      isDirectory: path === '/project',
    }))
    mgr.addProject({ name: 'Missing Scan', rootDir: '/project', scanPaths: ['/missing'] })
    expect(mgr.registeredProjects.value).toHaveLength(0)
    expect(mgr.addProjectError.value).toContain('扫描路径不存在')
  })

  test('removeProject removes project and selects next', () => {
    const mgr = createManager()
    addProject(mgr, 'First', '/path1')
    addProject(mgr, 'Second', '/path2')
    mgr.removeProject(mgr.selectedProject.value!.id)
    expect(mgr.registeredProjects.value).toHaveLength(1)
    expect(mgr.registeredProjects.value[0].name).toBe('First')
  })

  test('removeProject navigates away when no projects left', () => {
    const mgr = createManager()
    addProject(mgr, 'Only', '/path')
    mgr.removeProject(mgr.registeredProjects.value[0].id)
    expect(mgr.registeredProjects.value).toHaveLength(0)
    expect(mgr.navigate).toHaveBeenCalledWith('my')
  })

  test('selectProject selects and persists', () => {
    const mgr = createManager()
    addProject(mgr, 'A', '/a')
    mgr.selectProject(mgr.selectedProject.value!)
    const saved = JSON.parse(window.ztools.dbStorage.getItem('sm_page_state')!)
    expect(saved['project-skills'].projectId).toBe(mgr.selectedProject.value!.id)
  })

  test('handleProjectSubmit dispatches to addProject for new', () => {
    const mgr = createManager()
    mgr.handleProjectSubmit({ name: 'New', rootDir: '/new/path', scanPaths: [] })
    expect(mgr.registeredProjects.value).toHaveLength(1)
  })

  test('handleProjectSubmit dispatches to updateProject for existing', () => {
    const mgr = createManager()
    addProject(mgr, 'Orig', '/orig')
    const id = mgr.selectedProject.value!.id
    mgr.handleProjectSubmit({ id, name: 'Updated', rootDir: '/updated', scanPaths: [] })
    expect(mgr.registeredProjects.value[0].name).toBe('Updated')
    expect(mgr.registeredProjects.value[0].rootDir).toBe('/updated')
  })

  test('updateProject keeps the modal open and reports root conflicts', () => {
    const mgr = createManager()
    addProject(mgr, 'First', '/first')
    addProject(mgr, 'Second', '/second')
    const second = mgr.registeredProjects.value[1]
    mgr.editProject(second)
    mgr.handleProjectSubmit({ id: second.id, name: second.name, rootDir: '/first', scanPaths: [] })
    expect(mgr.showEditProjectModal.value).toBe(true)
    expect(mgr.addProjectError.value).toContain('First')
  })

  test('editProject sets editing state', () => {
    const { editingProject, showEditProjectModal, editProject } = createManager()
    const project = { id: 'p1', name: 'Test', rootDir: '/path', scanPaths: [] }
    editProject(project as any)
    expect(editingProject.value).toEqual(project)
    expect(showEditProjectModal.value).toBe(true)
  })

  test('selectProjectSkill sets the selected skill', () => {
    const { selectProjectSkill, selectedProjectSkill } = createManager()
    const skill = { dir: '/skill', name: 'test-skill' } as any
    selectProjectSkill(skill)
    expect(selectedProjectSkill.value).toEqual(skill)
  })
})

import { describe, test, expect, beforeEach } from 'vitest'
import { useProjectState } from '../useProjectState'

beforeEach(() => {
  const { registeredProjects, selectedProject, selectedProjectSkill } = useProjectState()
  registeredProjects.value = []
  selectedProject.value = null
  selectedProjectSkill.value = null
})

describe('useProjectState', () => {
  test('initial state is empty', () => {
    const { registeredProjects, selectedProject, selectedProjectSkill } = useProjectState()
    expect(registeredProjects.value).toEqual([])
    expect(selectedProject.value).toBeNull()
    expect(selectedProjectSkill.value).toBeNull()
  })

  test('persistSelectedProject saves project id to storage', () => {
    const { persistSelectedProject, selectedProject } = useProjectState()
    selectedProject.value = { id: 'proj-1', name: 'Test', rootDir: '/path', scanPaths: ['skills'] }
    persistSelectedProject()
    const saved = JSON.parse(window.ztools.dbStorage.getItem('sm_page_state')!)
    expect(saved['project-skills'].projectId).toBe('proj-1')
  })

  test('registeredProjects can be modified', () => {
    const { registeredProjects } = useProjectState()
    registeredProjects.value = [
      { id: 'p1', name: 'Project 1', rootDir: '/a', scanPaths: ['skills'] },
      { id: 'p2', name: 'Project 2', rootDir: '/b', scanPaths: ['.skills'] },
    ]
    expect(registeredProjects.value).toHaveLength(2)
  })
})

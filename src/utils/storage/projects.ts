import type { RegisteredProject } from '../../types'
import { KEYS, dbGet, dbSet } from './core'

export const projectsApi = {
  getRegisteredProjects(): RegisteredProject[] {
    return dbGet<RegisteredProject[]>(KEYS.REGISTERED_PROJECTS) || []
  },
  saveRegisteredProjects(projects: RegisteredProject[]): void {
    dbSet(KEYS.REGISTERED_PROJECTS, projects)
  },
  updateRegisteredProject(id: string, patch: Partial<RegisteredProject>): void {
    const projects = projectsApi.getRegisteredProjects()
    const idx = projects.findIndex((p) => p.id === id)
    if (idx >= 0) {
      projects[idx] = { ...projects[idx], ...patch }
      projectsApi.saveRegisteredProjects(projects)
    }
  },
}

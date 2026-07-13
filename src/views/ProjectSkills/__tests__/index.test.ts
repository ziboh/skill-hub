import { beforeEach, describe, expect, test, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import ProjectSkills from '../index.vue'
import {
  KeyDetectedPlatforms,
  KeyOpenAddProjectModal,
  KeyProjectScanning,
  KeyRefreshCounts,
  KeyScanProject,
  KeySelectProject,
  KeyShowToast,
} from '../../../inject-keys'
import { useProjectState } from '../../../composables/useProjectState'
import { storage, resetStorageCaches } from '../../../utils/storage'

vi.mock('../../../data/platforms', () => ({
  getAllPlatformDefinitions: () => [{ id: 'cursor', name: 'Cursor', projectPath: '.agents/skills' }],
  findPlatformById: (id: string) => (id === 'cursor' ? { id: 'cursor', name: 'Cursor' } : null),
  getPlatformPath: () => '.agents/skills',
}))

const project = { id: 'proj-1', name: 'Project One', rootDir: '/projects/one', scanPaths: ['.agents/skills'], skills: [] as any[] }
const platform = { id: 'cursor', name: 'Cursor', detected: true, enabled: true, projectPath: '.agents/skills' }

function createSkill(dir: string, name: string) {
  return {
    name,
    dir,
    skillFile: `${dir}/SKILL.md`,
    content: `# ${name}`,
    manifest: { name, description: '', author: '', tags: [], language: 'en' },
  }
}

function setProjectSkill(skill: ReturnType<typeof createSkill>) {
  const state = useProjectState()
  const current = { ...project, skills: [skill] }
  state.registeredProjects.value = [current]
  state.selectedProject.value = current
  state.selectedProjectSkill.value = skill
}

function createWrapper(skill: ReturnType<typeof createSkill>) {
  setProjectSkill(skill)
  return mount(ProjectSkills, {
    global: {
      provide: {
        [KeyShowToast as symbol]: vi.fn(),
        [KeyScanProject as symbol]: vi.fn(),
        [KeyProjectScanning as symbol]: ref(false),
        [KeySelectProject as symbol]: vi.fn(),
        [KeyOpenAddProjectModal as symbol]: vi.fn(),
        [KeyDetectedPlatforms as symbol]: ref([platform]),
        [KeyRefreshCounts as symbol]: vi.fn(),
      },
      stubs: {
        SkillCard: { template: '<div class="skill-card"><slot name="actions" /></div>' },
        DeployModal: true,
        QuickSwitcher: true,
        ConfirmModal: true,
        ConfirmUninstallSkillModal: true,
      },
    },
  })
}

describe('ProjectSkills card deploy action', () => {
  beforeEach(() => {
    window.ztools.dbStorage.clear()
    resetStorageCaches()
    const state = useProjectState()
    state.registeredProjects.value = []
    state.selectedProject.value = null
    state.selectedProjectSkill.value = null
    vi.mocked(window.services.pathExists).mockReturnValue(true)
  })

  test('shows deploy action for the source skill', async () => {
    const skill = createSkill('/projects/one/.agents/skills/source-skill', 'source-skill')
    storage.saveDownloadedSkills([{ id: 'source-skill', name: 'source-skill', description: '', tags: [], source: 'local', path: skill.dir }])

    const wrapper = createWrapper(skill)
    await nextTick()

    expect(wrapper.find('[title="分发到平台"]').exists()).toBe(true)
    expect(wrapper.find('[title="导入到我的 Skill"]').exists()).toBe(false)
  })

  test('shows deploy action for a managed skill with a project distribution record', async () => {
    const skill = createSkill('/projects/one/.agents/skills/managed-skill', 'managed-skill')
    storage.saveDownloadedSkills([{ id: 'managed-skill', name: 'managed-skill', description: '', tags: [], source: 'local', path: '/skills-repo/managed-skill' }])
    storage.saveDistributeRecord({
      skillId: 'managed-skill',
      platformId: 'project:proj-1/.agents/skills',
      mode: 'copy',
      scope: 'project',
      targetPath: skill.dir,
      sourceDir: '/skills-repo/managed-skill',
      distributedAt: new Date().toISOString(),
    })

    const wrapper = createWrapper(skill)
    await nextTick()

    expect(wrapper.find('[title="分发到平台"]').exists()).toBe(true)
    expect(wrapper.find('[title="导入到我的 Skill"]').exists()).toBe(false)
  })

  test('shows only import action for a local skill without source or distribution record', async () => {
    const skill = createSkill('/projects/one/.agents/skills/local-skill', 'local-skill')

    const wrapper = createWrapper(skill)
    await nextTick()

    expect(wrapper.find('[title="分发到平台"]').exists()).toBe(false)
    expect(wrapper.find('[title="导入到我的 Skill"]').exists()).toBe(true)
  })
})

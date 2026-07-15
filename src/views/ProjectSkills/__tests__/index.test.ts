import { beforeEach, describe, expect, test, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import ProjectSkills from '../index.vue'
import ConfirmModal from '../../../components/ConfirmModal.vue'
import {
  KeyDetectedPlatforms,
  KeyOpenAddProjectModal,
  KeyProjectScanning,
  KeyRefreshCounts,
  KeyRefreshKey,
  KeyScanProject,
  KeySelectProject,
  KeyShowToast,
} from '../../../inject-keys'
import { useProjectState } from '../../../composables/useProjectState'
import { storage, resetStorageCaches } from '../../../utils/storage'

vi.mock('../../../data/platforms', () => ({
  getAllPlatformDefinitions: () => [{ id: 'cursor', name: 'Cursor', projectPath: '.agents/skills' }],
  findPlatformById: (id: string) => (id === 'cursor' ? { id: 'cursor', name: 'Cursor' } : null),
  getPlatformPath: (item: any) => item.projectPath || '.agents/skills',
  platformDisplayIcon: (item: any) => item.id,
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

function setProjectSkills(skills: ReturnType<typeof createSkill>[]) {
  const state = useProjectState()
  const current = { ...project, skills }
  state.registeredProjects.value = [current]
  state.selectedProject.value = current
  state.selectedProjectSkill.value = skills[0]
}

function setProjectSkill(skill: ReturnType<typeof createSkill>) {
  setProjectSkills([skill])
}

function createWrapper(skillOrSkills: ReturnType<typeof createSkill> | ReturnType<typeof createSkill>[], platforms = [platform]) {
  setProjectSkills(Array.isArray(skillOrSkills) ? skillOrSkills : [skillOrSkills])
  return mount(ProjectSkills, {
    global: {
      provide: {
        [KeyShowToast as symbol]: vi.fn(),
        [KeyScanProject as symbol]: vi.fn(),
        [KeyProjectScanning as symbol]: ref(false),
        [KeySelectProject as symbol]: vi.fn(),
        [KeyOpenAddProjectModal as symbol]: vi.fn(),
        [KeyDetectedPlatforms as symbol]: ref(platforms),
        [KeyRefreshCounts as symbol]: vi.fn(),
        [KeyRefreshKey as symbol]: ref(0),
      },
      stubs: {
        SkillCard: {
          props: ['badges'],
          template:
            '<div class="skill-card"><span v-for="badge in badges" :key="badge.text" class="skill-badge">{{ badge.text }}</span><slot name="actions" /></div>',
        },
        DeployModal: true,
        QuickSwitcher: true,
         ConfirmModal,
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

  test('updates local badge after an external project distribution refresh', async () => {
    const skill = createSkill('/projects/one/.agents/skills/local-skill', 'local-skill')
    const refreshKey = ref(0)
    setProjectSkill(skill)
    const wrapper = mount(ProjectSkills, {
      global: {
        provide: {
          [KeyShowToast as symbol]: vi.fn(),
          [KeyScanProject as symbol]: vi.fn(),
          [KeyProjectScanning as symbol]: ref(false),
          [KeySelectProject as symbol]: vi.fn(),
          [KeyOpenAddProjectModal as symbol]: vi.fn(),
          [KeyDetectedPlatforms as symbol]: ref([platform]),
          [KeyRefreshCounts as symbol]: vi.fn(),
          [KeyRefreshKey as symbol]: refreshKey,
        },
        stubs: {
          SkillCard: {
            props: ['badges'],
            template:
              '<div class="skill-card"><span v-for="badge in badges" :key="badge.text" class="skill-badge">{{ badge.text }}</span><slot name="actions" /></div>',
          },
          DeployModal: true,
          QuickSwitcher: true,
          ConfirmModal,
          ConfirmUninstallSkillModal: true,
        },
      },
    })
    await nextTick()
    expect(wrapper.find('.skill-badge').text()).toBe('本地')

    storage.saveDownloadedSkills([{ id: 'local-skill', name: 'local-skill', description: '', tags: [], source: 'local', path: '/skills-repo/local-skill' }])
    storage.saveDistributeRecord({
      skillId: 'local-skill',
      platformId: 'project:proj-1/.agents/skills',
      mode: 'copy',
      scope: 'project',
      targetPath: skill.dir,
      sourceDir: '/skills-repo/local-skill',
      distributedAt: new Date().toISOString(),
    })
    refreshKey.value++
    await nextTick()

    expect(wrapper.find('.skill-badge').text()).toBe('已管理')
  })

  test('asks for confirmation before importing a local skill', async () => {
    const skill = createSkill('/projects/one/.agents/skills/local-skill', 'local-skill')
    const wrapper = createWrapper(skill)
    await nextTick()

    await wrapper.find('[title="导入到我的 Skill"]').trigger('click')

    expect(wrapper.find('.confirm-modal').exists()).toBe(true)
    expect(wrapper.find('.confirm-modal').text()).toContain('local-skill')
  })

  test('uses the shared compact import layout and structured advanced settings', async () => {
    const installed = createSkill('/projects/one/.agents/skills/installed-skill', 'installed-skill')
    storage.saveDownloadedSkills([
      { id: 'installed-skill', name: 'installed-skill', description: 'Installed', tags: [], source: 'local' },
      { id: 'available-skill', name: 'available-skill', description: 'Available', tags: [], source: 'local' },
    ])
    const wrapper = createWrapper(installed)
    await nextTick()

    await wrapper.find('.toolbar-btn.import-btn').trigger('click')

    expect(wrapper.find('.modal').classes()).toContain('skill-import-modal')
    const cards = wrapper.findAll('.modal-skill-card')
    expect(cards.map((card) => card.find('.modal-skill-name').text())).toEqual(['available-skill', 'installed-skill 已在项目中'])
    expect(cards[0].element.children[0].classList.contains('modal-skill-check')).toBe(true)
    expect(cards[0].element.children[1].classList.contains('modal-skill-avatar')).toBe(true)
    expect(cards[0].element.children[2].classList.contains('modal-skill-info')).toBe(true)

    expect(wrapper.find('.modal-advanced-summary').text()).toContain('1 个位置 · 复制')
    await wrapper.find('.modal-advanced-toggle').trigger('click')
    expect(wrapper.findAll('.advanced-section')).toHaveLength(2)
    expect(wrapper.find('.import-target-icon').exists()).toBe(true)
  })

  test('keeps many Agent locations searchable and scrollable', async () => {
    const skill = createSkill('/projects/one/.agents/skills/current-skill', 'current-skill')
    storage.saveDownloadedSkills([{ id: 'available-skill', name: 'available-skill', description: '', tags: [], source: 'local' }])
    const platforms = Array.from({ length: 7 }, (_, index) => ({
      id: `agent-${index}`,
      name: `Agent ${index}`,
      detected: true,
      enabled: true,
      projectPath: `.agent-${index}/skills`,
    }))
    const wrapper = createWrapper(skill, platforms as any)
    await nextTick()

    await wrapper.find('.toolbar-btn.import-btn').trigger('click')
    await wrapper.find('.modal-advanced-toggle').trigger('click')

    expect(wrapper.find('.import-target-search').exists()).toBe(true)
    expect(wrapper.find('.import-target-options').classes()).toContain('is-scrollable')
    expect(wrapper.findAll('.import-target-option')).toHaveLength(8)
  })

  test('批量管理可以启用和停用选中的项目 Skill', async () => {
    const skills = [
      createSkill('/projects/one/.agents/skills/first', 'first'),
      createSkill('/projects/one/.agents/skills/second', 'second'),
    ]
    const wrapper = createWrapper(skills)
    await nextTick()

    await wrapper.findAll('.toolbar-btn').find((button) => button.text().includes('批量管理'))!.trigger('click')
    await wrapper.findAll('.batch-action-btn').find((button) => button.text().includes('全选'))!.trigger('click')
    await wrapper.find('[title="批量停用"]').trigger('click')

    expect(window.services.setSkillEnabled).toHaveBeenNthCalledWith(1, skills[0].dir, false)
    expect(window.services.setSkillEnabled).toHaveBeenNthCalledWith(2, skills[1].dir, false)
    expect(wrapper.text()).not.toContain('批量模式')

    await wrapper.findAll('.toolbar-btn').find((button) => button.text().includes('批量管理'))!.trigger('click')
    await wrapper.findAll('.batch-action-btn').find((button) => button.text().includes('全选'))!.trigger('click')
    await wrapper.find('[title="批量启用"]').trigger('click')

    expect(window.services.setSkillEnabled).toHaveBeenNthCalledWith(3, skills[0].dir, true)
    expect(window.services.setSkillEnabled).toHaveBeenNthCalledWith(4, skills[1].dir, true)
  })
})

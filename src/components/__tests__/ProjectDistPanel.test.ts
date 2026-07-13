import { describe, test, expect, vi, afterEach, beforeEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import ProjectDistPanel from '../ProjectDistPanel.vue'
import { detectPlatforms } from '../../data/platforms'
import { KeyShowToast, KeyNavigateToProjectSkills } from '../../inject-keys'
import { useProjectState } from '../../composables/useProjectState'

vi.mock('../../data/platforms', () => ({
  detectPlatforms: vi.fn(() => []),
}))

vi.mock('../../utils/storage', () => ({
  storage: {
    getPlatformConfigs: vi.fn(() => []),
    getDistributeRecords: vi.fn(() => []),
    saveDistributeRecord: vi.fn(),
    removeDistributeRecord: vi.fn(),
    getRegisteredProjects: vi.fn(() => []),
    getPageState: vi.fn(() => null),
    savePageState: vi.fn(),
  },
}))

function createSkill(overrides = {}) {
  return {
    id: 'test/skill',
    name: 'Test Skill',
    description: 'A test skill',
    author: 'Test',
    tags: [],
    source: 'local',
    path: '/home/user/.config/skills/test-skill',
    ...overrides,
  }
}

function createProject(overrides = {}) {
  return { id: 'p1', name: 'My Project', rootDir: '/home/user/project', scanPaths: [], ...overrides }
}

describe('ProjectDistPanel', () => {
  let wrapper: VueWrapper

  beforeEach(() => {
    const { registeredProjects, selectedProject, selectedProjectSkill } = useProjectState()
    registeredProjects.value = []
    selectedProject.value = null
    selectedProjectSkill.value = null
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.clearAllMocks()
  })

  function mountPanel(skill = createSkill(), provides: Record<symbol, any> = {}, projects: any[] = []) {
    const { registeredProjects } = useProjectState()
    registeredProjects.value = projects as any
    return mount(ProjectDistPanel, {
      props: { skill, installMode: 'copy', installing: false, installProgressText: '' },
      global: {
        provide: {
          [KeyShowToast as symbol]: vi.fn(),
          [KeyNavigateToProjectSkills as symbol]: vi.fn(),
          ...provides,
        },
      },
    })
  }

  test('renders mode toggle with copy and symlink', () => {
    wrapper = mountPanel()
    const modeBtns = wrapper.findAll('.mode-toggle button')
    expect(modeBtns.length).toBe(2)
    expect(modeBtns[0].text()).toContain('复制')
    expect(modeBtns[1].text()).toContain('软链接')
  })

  test('default install mode is copy', () => {
    wrapper = mountPanel()
    const activeBtn = wrapper.find('.mode-toggle button.active')
    expect(activeBtn.text()).toContain('复制')
  })

  test('emits update:installMode on mode toggle', async () => {
    wrapper = mountPanel()
    await wrapper.findAll('.mode-toggle button')[1].trigger('click')
    expect(wrapper.emitted('update:installMode')).toBeTruthy()
    expect(wrapper.emitted('update:installMode')![0]).toEqual(['symlink'])
  })

  test('shows no project placeholder when no projects', () => {
    wrapper = mountPanel()
    expect(wrapper.find('.no-project-hint').text()).toContain('暂无项目')
  })

  test('shows project list', () => {
    wrapper = mountPanel(createSkill(), {}, [createProject()])
    expect(wrapper.find('.project-select-name').text()).toContain('My Project')
  })

  test('toggles project selection', async () => {
    wrapper = mountPanel(createSkill(), {}, [createProject()])
    await wrapper.find('.project-select-item').trigger('click')
    expect(wrapper.find('.project-select-checkbox.checked').exists()).toBe(true)
    await wrapper.find('.project-select-item').trigger('click')
    expect(wrapper.find('.project-select-checkbox.checked').exists()).toBe(false)
  })

  test('shows selected projects hint', async () => {
    wrapper = mountPanel(createSkill(), {}, [createProject()])
    expect(wrapper.find('.selected-projects-hint').text()).toContain('尚未选择项目')
    await wrapper.find('.project-select-item').trigger('click')
    expect(wrapper.find('.selected-projects-hint').text()).toContain('已选 1')
  })

  test('select all projects button works', async () => {
    wrapper = mountPanel(createSkill(), {}, [createProject({ id: 'p1' }), createProject({ id: 'p2', name: 'P2' })])
    await wrapper.find('.select-all-projects-btn').trigger('click')
    expect(wrapper.findAll('.project-select-checkbox.checked').length).toBe(2)
  })

  test('shows agent directory options when project selected', async () => {
    vi.mocked(detectPlatforms).mockReturnValue([
      { id: 'cursor', name: 'Cursor', detected: true, defaultPath: '', projectPath: '.cursor/skills' },
    ] as any)
    wrapper = mountPanel(createSkill(), {}, [createProject()])
    await wrapper.find('.project-select-item').trigger('click')
    await wrapper.vm.$nextTick()
    const cards = wrapper.findAll('.platform-card')
    expect(cards.length).toBeGreaterThanOrEqual(1)
    expect(cards[0].text()).toContain('.agents/skills')
  })

  test('custom dir input exists', async () => {
    wrapper = mountPanel(createSkill(), {}, [createProject()])
    await wrapper.find('.project-select-item').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.custom-dir-input').exists()).toBe(true)
  })

  test('install button disabled when no agent dirs selected', async () => {
    wrapper = mountPanel(createSkill(), {}, [createProject()])
    await wrapper.find('.project-select-item').trigger('click')
    await wrapper.vm.$nextTick()
    const installBtn = wrapper.find('.install-all-btn')
    expect(installBtn.attributes('disabled')).toBeDefined()
  })

  test('add project button calls navigateToProjectSkills', async () => {
    const navigate = vi.fn()
    wrapper = mountPanel(createSkill(), { [KeyNavigateToProjectSkills as symbol]: navigate }, [])
    await wrapper.find('.add-project-btn').trigger('click')
    expect(navigate).toHaveBeenCalled()
  })
})

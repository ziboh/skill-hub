import { describe, test, expect, vi, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import GlobalDistPanel from '../GlobalDistPanel.vue'
import { storage } from '../../utils/storage'
import { detectPlatforms } from '../../data/platforms'

vi.mock('../../data/platforms', () => ({
  detectPlatforms: vi.fn(() => []),
  getPlatformPath: vi.fn((p: { defaultPath?: string }) => p.defaultPath || ''),
}))

vi.mock('../../utils/storage', () => ({
  storage: {
    getPlatformConfigs: vi.fn(() => []),
    getDistributedForSkill: vi.fn(() => []),
    saveDistributeRecord: vi.fn(),
    removeDistributeRecord: vi.fn(),
    getDistributeRecords: vi.fn(() => []),
    addFailureRecord: vi.fn(),
  },
  resetStorageCaches: vi.fn(),
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

describe('GlobalDistPanel', () => {
  let wrapper: VueWrapper

  afterEach(() => {
    wrapper?.unmount()
    vi.clearAllMocks()
  })

  function mountPanel(skill = createSkill()) {
    return mount(GlobalDistPanel, {
      props: {
        skill,
        installMode: 'copy',
        installing: false,
        installProgressText: '',
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

  test('default install mode is copy (active)', () => {
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

  test('shows mode description text for copy', () => {
    wrapper = mountPanel()
    expect(wrapper.find('.mode-desc').text()).toContain('复制')
  })

  test('shows mode description text for symlink', async () => {
    wrapper = mount(GlobalDistPanel, {
      props: {
        skill: createSkill(),
        installMode: 'symlink',
        installing: false,
        installProgressText: '',
      },
    })
    expect(wrapper.find('.mode-desc').text()).toContain('软链接')
  })

  test('shows platforms grid', () => {
    vi.mocked(detectPlatforms).mockReturnValue([
      { id: 'cursor', name: 'Cursor', detected: true, defaultPath: '/home/user/.cursor', projectPath: '' },
      { id: 'windsurf', name: 'Windsurf', detected: true, defaultPath: '/home/user/.windsurf', projectPath: '' },
    ])
    vi.mocked(storage.getPlatformConfigs).mockReturnValue([])
    window.services.scanForSkillFiles = vi.fn(() => [])
    wrapper = mountPanel()
    const cards = wrapper.findAll('.platform-card')
    expect(cards.length).toBe(2)
    expect(cards[0].text()).toContain('Cursor')
    expect(cards[1].text()).toContain('Windsurf')
  })

  test('platform cards show unselected status', () => {
    vi.mocked(detectPlatforms).mockReturnValue([
      { id: 'cursor', name: 'Cursor', detected: true, defaultPath: '/home/user/.cursor', projectPath: '' },
    ])
    vi.mocked(storage.getPlatformConfigs).mockReturnValue([])
    window.services.scanForSkillFiles = vi.fn(() => [])
    wrapper = mountPanel()
    const badge = wrapper.find('.platform-status-badge')
    expect(badge.text()).toBe('点击选择')
  })

  test('clicking platform card toggles selection', async () => {
    vi.mocked(detectPlatforms).mockReturnValue([
      { id: 'cursor', name: 'Cursor', detected: true, defaultPath: '/home/user/.cursor', projectPath: '' },
    ])
    vi.mocked(storage.getPlatformConfigs).mockReturnValue([])
    window.services.scanForSkillFiles = vi.fn(() => [])
    wrapper = mountPanel()
    const card = wrapper.find('.platform-card')
    await card.trigger('click')
    expect(wrapper.find('.platform-checkbox.checked').exists()).toBe(true)
    await card.trigger('click')
    expect(wrapper.find('.platform-checkbox.checked').exists()).toBe(false)
  })

  test('select all button toggles all platforms', async () => {
    vi.mocked(detectPlatforms).mockReturnValue([
      { id: 'cursor', name: 'Cursor', detected: true, defaultPath: '/home/user/.cursor', projectPath: '' },
      { id: 'windsurf', name: 'Windsurf', detected: true, defaultPath: '/home/user/.windsurf', projectPath: '' },
    ])
    vi.mocked(storage.getPlatformConfigs).mockReturnValue([])
    window.services.scanForSkillFiles = vi.fn(() => [])
    wrapper = mountPanel()
    await wrapper.find('.select-all-btn').trigger('click')
    expect(wrapper.findAll('.platform-checkbox.checked').length).toBe(2)
    await wrapper.find('.select-all-btn').trigger('click')
    expect(wrapper.findAll('.platform-checkbox.checked').length).toBe(0)
  })

  test('install button disabled when no platforms selected', () => {
    vi.mocked(detectPlatforms).mockReturnValue([
      { id: 'cursor', name: 'Cursor', detected: true, defaultPath: '/home/user/.cursor', projectPath: '' },
    ])
    vi.mocked(storage.getPlatformConfigs).mockReturnValue([])
    window.services.scanForSkillFiles = vi.fn(() => [])
    wrapper = mountPanel()
    const installBtn = wrapper.find('.install-all-btn')
    expect(installBtn.attributes('disabled')).toBeDefined()
  })

  test('install button enabled when platforms selected', async () => {
    vi.mocked(detectPlatforms).mockReturnValue([
      { id: 'cursor', name: 'Cursor', detected: true, defaultPath: '/home/user/.cursor', projectPath: '' },
    ])
    vi.mocked(storage.getPlatformConfigs).mockReturnValue([])
    window.services.scanForSkillFiles = vi.fn(() => [])
    wrapper = mountPanel()
    await wrapper.find('.platform-card').trigger('click')
    const installBtn = wrapper.find('.install-all-btn')
    expect(installBtn.attributes('disabled')).toBeUndefined()
  })

  test('shows total uninstalled count', () => {
    vi.mocked(detectPlatforms).mockReturnValue([
      { id: 'cursor', name: 'Cursor', detected: true, defaultPath: '/home/user/.cursor', projectPath: '' },
      { id: 'windsurf', name: 'Windsurf', detected: true, defaultPath: '/home/user/.windsurf', projectPath: '' },
    ])
    vi.mocked(storage.getPlatformConfigs).mockReturnValue([])
    window.services.scanForSkillFiles = vi.fn(() => [])
    wrapper = mountPanel()
    expect(wrapper.find('.selected-count').text()).toContain('2')
  })

  test('shows selected count', async () => {
    vi.mocked(detectPlatforms).mockReturnValue([
      { id: 'cursor', name: 'Cursor', detected: true, defaultPath: '/home/user/.cursor', projectPath: '' },
    ])
    vi.mocked(storage.getPlatformConfigs).mockReturnValue([])
    window.services.scanForSkillFiles = vi.fn(() => [])
    wrapper = mountPanel()
    await wrapper.find('.platform-card').trigger('click')
    const counts = wrapper.findAll('.selected-count')
    expect(counts.map((c) => c.text()).some((t) => t.includes('已选 1'))).toBe(true)
  })

  test('install emits install-started and install-finished', async () => {
    vi.mocked(detectPlatforms).mockReturnValue([
      { id: 'cursor', name: 'Cursor', detected: true, defaultPath: '/home/user/.cursor', projectPath: '' },
    ])
    vi.mocked(storage.getPlatformConfigs).mockReturnValue([])
    window.services.scanForSkillFiles = vi.fn(() => [])
    window.services.pathExists = vi.fn(() => true)
    window.services.pathJoin = vi.fn((...p: string[]) => p.join('/'))
    window.services.mkdir = vi.fn()
    window.services.copyFile = vi.fn()
    window.services.readDir = vi.fn(() => [{ name: 'SKILL.md', isDirectory: false, path: '/path/SKILL.md' }])
    vi.mocked(storage.getDistributedForSkill).mockReturnValue([])
    wrapper = mountPanel()
    await wrapper.find('.platform-card').trigger('click')
    await wrapper.find('.install-all-btn').trigger('click')
    expect(wrapper.emitted('install-started')).toBeTruthy()
    expect(wrapper.emitted('install-finished')).toBeTruthy()
  })
})

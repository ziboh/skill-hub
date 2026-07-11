import { describe, test, expect, vi, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import NewSkillModal from '../NewSkillModal.vue'
import * as github from '../../utils/github'
import { parseFrontmatter } from '../../utils/frontmatter'

vi.mock('../../utils/github', () => ({
  parseGitHubUrl: vi.fn(),
  fetchGitHubRepoTree: vi.fn(),
  fetchGitHubFile: vi.fn(),
  detectSkillDirectories: vi.fn(),
}))

vi.mock('../../utils/frontmatter', () => ({
  parseFrontmatter: vi.fn(),
}))

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('NewSkillModal', () => {
  let wrapper: VueWrapper

  afterEach(() => {
    wrapper?.unmount()
    vi.clearAllMocks()
  })

  test('renders choose step with hint text', () => {
    wrapper = mount(NewSkillModal)
    expect(wrapper.find('.hint').text()).toContain('选择添加技能的方式')
  })

  test('renders method items', () => {
    wrapper = mount(NewSkillModal)
    const items = wrapper.findAll('.method-item')
    expect(items.length).toBeGreaterThan(0)
    expect(items[0].text()).toContain('从 Git 仓库')
  })

  test('click method item navigates to git input step', async () => {
    wrapper = mount(NewSkillModal)
    await wrapper.find('.method-item').trigger('click')
    expect(wrapper.find('.git-input').exists()).toBe(true)
  })

  test('shows git input with placeholder', async () => {
    wrapper = mount(NewSkillModal)
    await wrapper.find('.method-item').trigger('click')
    const input = wrapper.find('.git-input')
    expect(input.exists()).toBe(true)
    expect((input.element as HTMLInputElement).placeholder).toContain('https://github.com')
  })

  test('scan button disabled when url empty', async () => {
    wrapper = mount(NewSkillModal)
    await wrapper.find('.method-item').trigger('click')
    const scanBtn = wrapper.find('.scan-btn')
    expect(scanBtn.attributes('disabled')).toBeDefined()
  })

  test('scan button enabled when url has content', async () => {
    wrapper = mount(NewSkillModal)
    await wrapper.find('.method-item').trigger('click')
    const input = wrapper.find('.git-input')
    await input.setValue('owner/repo')
    const scanBtn = wrapper.find('.scan-btn')
    expect(scanBtn.attributes('disabled')).toBeUndefined()
  })

  test('shows scan error for invalid url', async () => {
    vi.mocked(github.parseGitHubUrl).mockReturnValue(null as any)
    wrapper = mount(NewSkillModal)
    await wrapper.find('.method-item').trigger('click')
    const input = wrapper.find('.git-input')
    await input.setValue('invalid-url')
    await wrapper.find('.scan-btn').trigger('click')
    await flush()
    expect(wrapper.find('.scan-error').text()).toContain('请输入有效的 GitHub URL')
  })

  test('back link returns to choose step from git input', async () => {
    wrapper = mount(NewSkillModal)
    await wrapper.find('.method-item').trigger('click')
    expect(wrapper.find('.git-input').exists()).toBe(true)
    await wrapper.find('.back-link').trigger('click')
    expect(wrapper.find('.hint').text()).toContain('选择添加技能的方式')
  })

  test('scan error shows settings link when rate limited', async () => {
    vi.mocked(github.parseGitHubUrl).mockImplementation(() => {
      throw new Error('API 速率限制')
    })
    wrapper = mount(NewSkillModal)
    await wrapper.find('.method-item').trigger('click')
    const input = wrapper.find('.git-input')
    await input.setValue('owner/repo')
    await wrapper.find('.scan-btn').trigger('click')
    await flush()
    expect(wrapper.find('.scan-error').text()).toContain('速率限制')
    expect(wrapper.find('.error-settings-link').exists()).toBe(true)
  })

  test('error settings link emits navigate event', async () => {
    vi.mocked(github.parseGitHubUrl).mockImplementation(() => {
      throw new Error('API 速率限制')
    })
    wrapper = mount(NewSkillModal)
    await wrapper.find('.method-item').trigger('click')
    const input = wrapper.find('.git-input')
    await input.setValue('owner/repo')
    await wrapper.find('.scan-btn').trigger('click')
    await flush()
    await wrapper.find('.error-settings-link').trigger('click')
    expect(wrapper.emitted('navigate')).toBeTruthy()
    expect(wrapper.emitted('navigate')![0]).toEqual(['settings', { anchor: 'github-token-section' }])
  })

  test('shows scan results with skills', async () => {
    const mockInfo = { owner: 'user', repo: 'repo', defaultBranch: 'main' }
    vi.mocked(github.parseGitHubUrl).mockReturnValue(mockInfo)
    vi.mocked(github.fetchGitHubRepoTree).mockResolvedValue([])
    vi.mocked(github.detectSkillDirectories).mockReturnValue([{ dir: 'skills/test', manifestFile: 'skills/test/SKILL.md' }])
    vi.mocked(github.fetchGitHubFile).mockResolvedValue('---\nname: Test Skill\ndescription: A test\n---')
    vi.mocked(parseFrontmatter).mockReturnValue({ name: 'Test Skill', description: 'A test', tags: '', author: '' })
    wrapper = mount(NewSkillModal)
    await wrapper.find('.method-item').trigger('click')
    const input = wrapper.find('.git-input')
    await input.setValue('user/repo')
    await wrapper.find('.scan-btn').trigger('click')
    await flush()
    expect(wrapper.find('.hint').text()).toContain('找到 1 个技能')
    expect(wrapper.find('.skill-name').text()).toContain('Test Skill')
  })

  test('toggle skill selection', async () => {
    const mockInfo = { owner: 'user', repo: 'repo', defaultBranch: 'main' }
    vi.mocked(github.parseGitHubUrl).mockReturnValue(mockInfo)
    vi.mocked(github.fetchGitHubRepoTree).mockResolvedValue([])
    vi.mocked(github.detectSkillDirectories).mockReturnValue([
      { dir: 'skills/test', manifestFile: 'skills/test/SKILL.md' },
      { dir: 'skills/test2', manifestFile: 'skills/test2/SKILL.md' },
    ])
    vi.mocked(github.fetchGitHubFile).mockResolvedValue('---\nname: Test\n---')
    vi.mocked(parseFrontmatter).mockReturnValue({ name: 'Test', description: '', tags: '', author: '' })
    wrapper = mount(NewSkillModal)
    await wrapper.find('.method-item').trigger('click')
    const input = wrapper.find('.git-input')
    await input.setValue('user/repo')
    await wrapper.find('.scan-btn').trigger('click')
    await flush()
    const checkboxes = wrapper.findAll('.skill-select-item input[type="checkbox"]')
    expect(checkboxes.length).toBe(2)
    await checkboxes[0].setValue(true)
    expect((checkboxes[0].element as HTMLInputElement).checked).toBe(true)
  })

  test('toggle select all', async () => {
    const mockInfo = { owner: 'user', repo: 'repo', defaultBranch: 'main' }
    vi.mocked(github.parseGitHubUrl).mockReturnValue(mockInfo)
    vi.mocked(github.fetchGitHubRepoTree).mockResolvedValue([])
    vi.mocked(github.detectSkillDirectories).mockReturnValue([
      { dir: 'skills/test', manifestFile: 'skills/test/SKILL.md' },
      { dir: 'skills/test2', manifestFile: 'skills/test2/SKILL.md' },
    ])
    vi.mocked(github.fetchGitHubFile).mockResolvedValue('---\nname: Test\n---')
    vi.mocked(parseFrontmatter).mockReturnValue({ name: 'Test', description: '', tags: '', author: '' })
    wrapper = mount(NewSkillModal)
    await wrapper.find('.method-item').trigger('click')
    const input = wrapper.find('.git-input')
    await input.setValue('user/repo')
    await wrapper.find('.scan-btn').trigger('click')
    await flush()
    await wrapper.find('.select-all-btn').trigger('click')
    const checkboxes = wrapper.findAll('.skill-select-item input[type="checkbox"]')
    expect((checkboxes[0].element as HTMLInputElement).checked).toBe(true)
    expect((checkboxes[1].element as HTMLInputElement).checked).toBe(true)
  })

  test('import button disabled when no skills selected', async () => {
    const mockInfo = { owner: 'user', repo: 'repo', defaultBranch: 'main' }
    vi.mocked(github.parseGitHubUrl).mockReturnValue(mockInfo)
    vi.mocked(github.fetchGitHubRepoTree).mockResolvedValue([])
    vi.mocked(github.detectSkillDirectories).mockReturnValue([{ dir: 'skills/test', manifestFile: 'skills/test/SKILL.md' }])
    vi.mocked(github.fetchGitHubFile).mockResolvedValue('---\nname: Test\n---')
    vi.mocked(parseFrontmatter).mockReturnValue({ name: 'Test', description: '', tags: '', author: '' })
    wrapper = mount(NewSkillModal)
    await wrapper.find('.method-item').trigger('click')
    const input = wrapper.find('.git-input')
    await input.setValue('user/repo')
    await wrapper.find('.scan-btn').trigger('click')
    await flush()
    const importBtn = wrapper.find('.import-btn')
    expect(importBtn.attributes('disabled')).toBeDefined()
  })

  test('close button emits close', async () => {
    wrapper = mount(NewSkillModal)
    await wrapper.find('.close-btn').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  test('overlay click emits close', async () => {
    wrapper = mount(NewSkillModal)
    await wrapper.find('.modal-overlay').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  test('shows no skills message when scan finds nothing', async () => {
    const mockInfo = { owner: 'user', repo: 'repo', defaultBranch: 'main' }
    vi.mocked(github.parseGitHubUrl).mockReturnValue(mockInfo)
    vi.mocked(github.fetchGitHubRepoTree).mockResolvedValue([])
    vi.mocked(github.detectSkillDirectories).mockReturnValue([])
    wrapper = mount(NewSkillModal)
    await wrapper.find('.method-item').trigger('click')
    const input = wrapper.find('.git-input')
    await input.setValue('user/repo')
    await wrapper.find('.scan-btn').trigger('click')
    await flush()
    expect(wrapper.find('.scan-error').text()).toContain('未找到可安装的技能')
  })

  test('scan error on API failure', async () => {
    const mockInfo = { owner: 'user', repo: 'repo', defaultBranch: 'main' }
    vi.mocked(github.parseGitHubUrl).mockReturnValue(mockInfo)
    vi.mocked(github.fetchGitHubRepoTree).mockRejectedValue(new Error('Network error'))
    wrapper = mount(NewSkillModal)
    await wrapper.find('.method-item').trigger('click')
    const input = wrapper.find('.git-input')
    await input.setValue('user/repo')
    await wrapper.find('.scan-btn').trigger('click')
    await flush()
    expect(wrapper.find('.scan-error').text()).toContain('Network error')
  })

  test('import button text shows count when selected', async () => {
    const mockInfo = { owner: 'user', repo: 'repo', defaultBranch: 'main' }
    vi.mocked(github.parseGitHubUrl).mockReturnValue(mockInfo)
    vi.mocked(github.fetchGitHubRepoTree).mockResolvedValue([])
    vi.mocked(github.detectSkillDirectories).mockReturnValue([{ dir: 'skills/test', manifestFile: 'skills/test/SKILL.md' }])
    vi.mocked(github.fetchGitHubFile).mockResolvedValue('---\nname: Test\n---')
    vi.mocked(parseFrontmatter).mockReturnValue({ name: 'Test', description: 'desc', tags: '', author: '' })
    wrapper = mount(NewSkillModal)
    await wrapper.find('.method-item').trigger('click')
    const input = wrapper.find('.git-input')
    await input.setValue('user/repo')
    await wrapper.find('.scan-btn').trigger('click')
    await flush()
    await wrapper.find('.select-all-btn').trigger('click')
    const importBtn = wrapper.find('.import-btn')
    expect(importBtn.text()).toContain('1')
  })
})

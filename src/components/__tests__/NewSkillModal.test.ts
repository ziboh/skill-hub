import { describe, test, expect, vi, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import NewSkillModal from '../NewSkillModal.vue'
import * as github from '../../utils/github'
import { parseFrontmatter } from '../../utils/frontmatter'
import { KeyShowToast } from '../../inject-keys'
import { resetStorageCaches, storage } from '../../utils/storage'

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
const showToast = vi.fn()

function mountModalWithToast() {
  return mount(NewSkillModal, {
    global: {
      provide: {
        [KeyShowToast as symbol]: showToast,
      },
    },
  })
}

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
    expect(items[0].text()).toContain('从 GitHub 导入')
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
    const scanBtn = wrapper.find('.scan-btn.secondary')
    expect(scanBtn.attributes('disabled')).toBeDefined()
  })

  test('scan button enabled when url has content', async () => {
    wrapper = mount(NewSkillModal)
    await wrapper.find('.method-item').trigger('click')
    const input = wrapper.find('.git-input')
    await input.setValue('owner/repo')
    const scanBtn = wrapper.find('.scan-btn.secondary')
    expect(scanBtn.attributes('disabled')).toBeUndefined()
  })

  test('shows scan error for invalid url', async () => {
    vi.mocked(github.parseGitHubUrl).mockReturnValue(null as any)
    wrapper = mountModalWithToast()
    await wrapper.find('.method-item').trigger('click')
    const input = wrapper.find('.git-input')
    await input.setValue('invalid-url')
    await wrapper.find('.scan-btn.secondary').trigger('click')
    await flush()
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        message: expect.stringContaining('请输入有效的 GitHub URL'),
      }),
    )
  })

  test('返回按钮位于标题栏并返回添加方式选择', async () => {
    wrapper = mount(NewSkillModal)
    await wrapper.find('.method-item').trigger('click')
    expect(wrapper.find('.git-input').exists()).toBe(true)
    const backButton = wrapper.find('.modal-header .back-btn')
    expect(backButton.attributes('title')).toBe('返回选择添加方式')
    expect(backButton.find('svg').exists()).toBe(true)
    expect(wrapper.find('.modal-footer .back-link').exists()).toBe(false)
    await backButton.trigger('click')
    expect(wrapper.find('.hint').text()).toContain('选择添加技能的方式')
  })

  test('scan error shows toast when rate limited', async () => {
    const mockInfo = { owner: 'user', repo: 'repo', defaultBranch: 'main' }
    vi.mocked(github.parseGitHubUrl).mockReturnValue(mockInfo)
    vi.mocked(github.fetchGitHubRepoTree).mockRejectedValue(new Error('API 速率限制'))
    wrapper = mountModalWithToast()
    await wrapper.find('.method-item').trigger('click')
    const input = wrapper.find('.git-input')
    await input.setValue('owner/repo')
    await wrapper.find('.scan-btn.secondary').trigger('click')
    await flush()
    expect(showToast).toHaveBeenCalledWith({ type: 'error', message: 'API 速率限制' })
  })

  test('scan error is reported through toast', async () => {
    const mockInfo = { owner: 'user', repo: 'repo', defaultBranch: 'main' }
    vi.mocked(github.parseGitHubUrl).mockReturnValue(mockInfo)
    vi.mocked(github.fetchGitHubRepoTree).mockRejectedValue(new Error('Network error'))
    wrapper = mountModalWithToast()
    await wrapper.find('.method-item').trigger('click')
    const input = wrapper.find('.git-input')
    await input.setValue('owner/repo')
    await wrapper.find('.scan-btn.secondary').trigger('click')
    await flush()
    expect(showToast).toHaveBeenCalledWith({ type: 'error', message: 'Network error' })
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
    await wrapper.find('.scan-btn.secondary').trigger('click')
    await flush()
    expect(wrapper.find('.scan-header .hint').text()).toContain('找到 1 个技能')
    expect(wrapper.find('.skill-name').text()).toContain('Test Skill')
  })

  test('moves imported GitHub skills after available skills', async () => {
    window.ztools.dbStorage.clear()
    resetStorageCaches()
    storage.saveDownloadedSkills([{ id: 'user/repo/imported', name: 'Imported', description: '', tags: [], source: 'github' }])
    vi.mocked(github.parseGitHubUrl).mockReturnValue({ owner: 'user', repo: 'repo', defaultBranch: 'main' })
    vi.mocked(github.fetchGitHubRepoTree).mockResolvedValue([])
    vi.mocked(github.detectSkillDirectories).mockReturnValue([
      { dir: 'skills/imported', manifestFile: 'skills/imported/SKILL.md' },
      { dir: 'skills/available', manifestFile: 'skills/available/SKILL.md' },
    ])
    vi.mocked(github.fetchGitHubFile).mockImplementation(async (_owner, _repo, path) => path)
    vi.mocked(parseFrontmatter).mockImplementation((content) => ({
      name: content.includes('imported') ? 'Imported' : 'Available',
      description: '',
      tags: '',
      author: '',
    }))
    wrapper = mount(NewSkillModal)
    await wrapper.find('.method-item').trigger('click')
    await wrapper.find('.git-input').setValue('user/repo')
    await wrapper.find('.scan-btn.secondary').trigger('click')
    await flush()

    expect(wrapper.findAll('.skill-name').map((item) => item.text())).toEqual(['Available', 'Imported 已导入'])
  })

  test('treats a GitHub folder alias as imported when its SKILL.md name was installed from skills.sh', async () => {
    window.ztools.dbStorage.clear()
    resetStorageCaches()
    storage.saveDownloadedSkills([
      {
        id: 'vercel-labs/agent-skills/vercel-react-best-practices',
        canonicalId: 'vercel-labs/agent-skills/vercel-react-best-practices',
        name: 'vercel-react-best-practices',
        description: '',
        author: '',
        tags: [],
        source: 'skills-sh',
        repo: 'vercel-labs/agent-skills',
      },
    ])
    vi.mocked(github.parseGitHubUrl).mockReturnValue({ owner: 'vercel-labs', repo: 'agent-skills', defaultBranch: 'main' })
    vi.mocked(github.fetchGitHubRepoTree).mockResolvedValue([])
    vi.mocked(github.detectSkillDirectories).mockReturnValue([
      { dir: 'skills/react-best-practices', manifestFile: 'skills/react-best-practices/SKILL.md' },
    ])
    vi.mocked(github.fetchGitHubFile).mockResolvedValue('---\nname: vercel-react-best-practices\n---')
    vi.mocked(parseFrontmatter).mockReturnValue({ name: 'vercel-react-best-practices', description: '', tags: '', author: '' })

    wrapper = mount(NewSkillModal)
    await wrapper.find('.method-item').trigger('click')
    await wrapper.find('.git-input').setValue('vercel-labs/agent-skills')
    await wrapper.find('.scan-btn.secondary').trigger('click')
    await flush()

    expect(wrapper.find('.skill-name').text()).toContain('已导入')
    expect(wrapper.find<HTMLInputElement>('.skill-select-item input').element.disabled).toBe(true)
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
    await wrapper.find('.scan-btn.secondary').trigger('click')
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
    await wrapper.find('.scan-btn.secondary').trigger('click')
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
    await wrapper.find('.scan-btn.secondary').trigger('click')
    await flush()
    const importBtn = wrapper.find('.import-btn')
    expect(importBtn.attributes('disabled')).toBeDefined()
  })

  test('close button emits close', async () => {
    wrapper = mount(NewSkillModal)
    await wrapper.find('.close-btn').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  test('点击遮罩不会关闭弹窗', async () => {
    wrapper = mount(NewSkillModal)
    await wrapper.find('.modal-overlay').trigger('click')
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  test('shows no skills message when scan finds nothing', async () => {
    const mockInfo = { owner: 'user', repo: 'repo', defaultBranch: 'main' }
    vi.mocked(github.parseGitHubUrl).mockReturnValue(mockInfo)
    vi.mocked(github.fetchGitHubRepoTree).mockResolvedValue([])
    vi.mocked(github.detectSkillDirectories).mockReturnValue([])
    wrapper = mountModalWithToast()
    await wrapper.find('.method-item').trigger('click')
    const input = wrapper.find('.git-input')
    await input.setValue('user/repo')
    await wrapper.find('.scan-btn.secondary').trigger('click')
    await flush()
    expect(showToast).toHaveBeenCalledWith({ type: 'error', message: '未找到可安装的技能' })
  })

  test('scan error on API failure', async () => {
    const mockInfo = { owner: 'user', repo: 'repo', defaultBranch: 'main' }
    vi.mocked(github.parseGitHubUrl).mockReturnValue(mockInfo)
    vi.mocked(github.fetchGitHubRepoTree).mockRejectedValue(new Error('Network error'))
    wrapper = mountModalWithToast()
    await wrapper.find('.method-item').trigger('click')
    const input = wrapper.find('.git-input')
    await input.setValue('user/repo')
    await wrapper.find('.scan-btn.secondary').trigger('click')
    await flush()
    expect(showToast).toHaveBeenCalledWith({ type: 'error', message: 'Network error' })
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
    await wrapper.find('.scan-btn.secondary').trigger('click')
    await flush()
    await wrapper.find('.select-all-btn').trigger('click')
    const importBtn = wrapper.find('.import-btn')
    expect(importBtn.text()).toContain('1')
  })
})

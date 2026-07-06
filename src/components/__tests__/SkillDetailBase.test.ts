import { describe, test, expect, vi, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import SkillDetailBase from '../SkillDetailBase.vue'
import { KeyShowToast } from '../../inject-keys'
import { storage } from '../../utils/storage'

vi.mock('../../utils/storage', () => ({
  storage: {
    getSettings: vi.fn(() => ({ themeMode: 'light', aiModels: [], translationModelId: '' })),
    getTranslation: vi.fn(() => null),
    getTranslationDesc: vi.fn(() => null),
    saveTranslation: vi.fn(),
    saveTranslationDesc: vi.fn(),
    getSkillUserTags: vi.fn(() => []),
    saveSkillUserTags: vi.fn(),
  },
}))

vi.mock('../../composables/useSettings', () => ({
  useSettings: vi.fn(() => ({
    settings: { themeMode: 'light', aiModels: [], translationModelId: '' },
    updateSettings: vi.fn(),
  })),
}))

vi.mock('../../composables/useTranslationQueue', () => ({
  useTranslationQueue: vi.fn(() => ({
    addTranslation: vi.fn(),
    removeTranslation: vi.fn(),
    isTranslating: vi.fn(() => false),
    notifyCacheChanged: vi.fn(),
  })),
}))

vi.mock('../../utils/translate', () => ({
  isChineseContent: vi.fn(() => false),
  translateContent: vi.fn(async () => 'Translated'),
  translateDescription: vi.fn(async () => 'Translated desc'),
  stripFrontmatter: vi.fn((s: string) => s),
  renderImmersiveSegments: vi.fn(() => []),
  resolveTranslationKey: vi.fn(() => 'test-key'),
}))

vi.mock('../../utils/frontmatter', () => ({
  parseFrontmatter: vi.fn(() => ({})),
}))

vi.mock('../../utils/color', () => ({
  getAvatarColor: vi.fn(() => '#7c3aed'),
}))

vi.mock('../../data/skill-categories', () => ({
  SKILL_CATEGORIES: { coding: { label: '编程' }, other: { label: '其他' } },
  ALL_CATEGORIES: ['coding', 'other'],
  inferCategory: vi.fn(() => 'other'),
  CATEGORY_ICONS: { coding: '💻', other: '📋' },
}))

vi.mock('../../utils/source-info', () => ({
  getSourceInfo: vi.fn(() => ({ icon: 'git', label: 'GitHub', bg: '#333', color: '#fff' })),
}))

vi.mock('../SkillFileEditor.vue', () => ({
  default: {
    name: 'SkillFileEditor',
    props: ['skillDir'],
    template: '<div class="mock-file-editor">File Editor Mock</div>',
  },
}))

function createSkill(overrides = {}) {
  return {
    id: 'test/skill', name: 'Test Skill', description: 'A test skill',
    author: 'Test', tags: [], source: 'github',
    repo: 'user/repo', path: 'skills/test',
    ...overrides,
  }
}

describe('SkillDetailBase', () => {
  let wrapper: VueWrapper

  afterEach(() => {
    wrapper?.unmount()
    vi.clearAllMocks()
  })

  function mountBase(skill = createSkill(), overrides: Record<string, any> = {}) {
    return mount(SkillDetailBase, {
      props: {
        skill,
        skillName: 'Test Skill',
        skillDesc: 'A test skill',
        skillContent: '# Hello\nThis is content.',
        isFavorited: false,
        isEditing: false,
        editedContent: '',
        copyStatus: {},
        ...overrides,
      },
      global: {
        provide: {
          [KeyShowToast as symbol]: vi.fn(),
        },
      },
    })
  }

  test('renders header with skill name', () => {
    wrapper = mountBase()
    expect(wrapper.find('h2').text()).toBe('Test Skill')
  })

  test('renders back button', () => {
    wrapper = mountBase()
    expect(wrapper.find('.back-btn').exists()).toBe(true)
  })

  test('render source and category tags in header', () => {
    wrapper = mountBase()
    const tags = wrapper.findAll('.header-tag')
    expect(tags.length).toBeGreaterThanOrEqual(2)
  })

  test('back button emits navigate', async () => {
    wrapper = mountBase()
    await wrapper.find('.back-btn').trigger('click')
    expect(wrapper.emitted('navigate')).toBeTruthy()
    expect(wrapper.emitted('navigate')![0][0]).toBe('my')
  })

  test('back button emits navigate to store context', async () => {
    wrapper = mountBase(createSkill(), { context: 'store' })
    await wrapper.find('.back-btn').trigger('click')
    expect(wrapper.emitted('navigate')![0][0]).toBe('store')
  })

  test('renders tab bar with preview, source, files', () => {
    wrapper = mountBase()
    const tabs = wrapper.findAll('.detail-tabs-row button')
    expect(tabs.length).toBe(3)
    expect(tabs[0].text()).toContain('预览')
    expect(tabs[1].text()).toContain('源码')
    expect(tabs[2].text()).toContain('文件')
  })

  test('preview tab is active by default', () => {
    wrapper = mountBase()
    const activeTab = wrapper.find('.detail-tabs-row button.active')
    expect(activeTab.text()).toContain('预览')
  })

  test('switching to source tab shows metadata', async () => {
    wrapper = mountBase()
    const tabs = wrapper.findAll('.detail-tabs-row button')
    await tabs[1].trigger('click')
    expect(wrapper.find('.section-heading').text()).toContain('元数据')
  })

  test('switching to files tab shows file editor', async () => {
    wrapper = mountBase(createSkill(), { skillDir: '/some/dir' })
    const tabs = wrapper.findAll('.detail-tabs-row button')
    await tabs[2].trigger('click')
    expect(wrapper.find('.mock-file-editor').exists()).toBe(true)
  })

  test('files tab shows empty state when no skillDir', async () => {
    wrapper = mountBase()
    const tabs = wrapper.findAll('.detail-tabs-row button')
    await tabs[2].trigger('click')
    expect(wrapper.find('.empty-state').exists()).toBe(true)
    expect(wrapper.find('.empty-state').text()).toContain('暂无本地文件')
  })

  test('shows description section in preview tab', () => {
    wrapper = mountBase()
    expect(wrapper.find('.desc-text').text()).toBe('A test skill')
  })

  test('shows skill content in preview tab', () => {
    wrapper = mountBase()
    expect(wrapper.find('.skill-markdown-body').exists()).toBe(true)
  })

  test('favorite toolbar button exists', () => {
    wrapper = mountBase()
    const favBtn = wrapper.find('.toolbar-icon-btn')
    expect(favBtn.exists()).toBe(true)
  })

  test('close toolbar button emits navigate', async () => {
    wrapper = mountBase()
    const closeBtn = wrapper.find('.toolbar-icon-btn.close-btn')
    await closeBtn.trigger('click')
    expect(wrapper.emitted('navigate')).toBeTruthy()
  })

  test('copy content button emits copy-content', async () => {
    wrapper = mountBase()
    const copyBtn = wrapper.findAll('.heading-btn').find(b => b.text().includes('复制 MD'))
    if (copyBtn) {
      await copyBtn.trigger('click')
      expect(wrapper.emitted('copy-content')).toBeTruthy()
    }
  })

  test('translate button exists', () => {
    wrapper = mountBase()
    const translateBtns = wrapper.findAll('.heading-btn').filter(b => b.text().includes('翻译'))
    expect(translateBtns.length).toBeGreaterThanOrEqual(1)
  })

  test('description shows placeholder when empty', () => {
    wrapper = mountBase(createSkill({ description: '' }), { skillDesc: '' })
    expect(wrapper.find('.desc-text').text()).toContain('暂无描述')
  })

  test('shows content empty state when no content', () => {
    wrapper = mountBase(createSkill(), { skillContent: '' })
    expect(wrapper.find('.empty-content').exists()).toBe(true)
    expect(wrapper.find('.empty-content').text()).toContain('暂无内容')
  })

  test('source tab shows debug fields for my context', async () => {
    wrapper = mountBase(createSkill(), { context: 'my' })
    const tabs = wrapper.findAll('.detail-tabs-row button')
    await tabs[1].trigger('click')
    expect(wrapper.find('.debug-fields-grid').exists()).toBe(true)
  })

  test('source tab shows source link card', async () => {
    wrapper = mountBase()
    const tabs = wrapper.findAll('.detail-tabs-row button')
    await tabs[1].trigger('click')
    expect(wrapper.find('.source-link-card').exists()).toBe(true)
  })

  test('source tab shows raw skill content', async () => {
    wrapper = mountBase()
    const tabs = wrapper.findAll('.detail-tabs-row button')
    await tabs[1].trigger('click')
    expect(wrapper.find('.source-code-block').text()).toContain('# Hello')
  })

  test('theme toggle button exists', () => {
    wrapper = mountBase()
    const themeBtn = wrapper.findAll('.toolbar-icon-btn').find(b => {
      return b.attributes('title')?.includes('暗色') || b.attributes('title')?.includes('亮色')
    })
    expect(themeBtn).toBeDefined()
  })

  test('category shows in side panel for my context', () => {
    wrapper = mountBase(createSkill(), { context: 'my' })
    expect(wrapper.find('.side-panel-section').exists()).toBe(true)
    expect(wrapper.find('.side-panel-heading').text()).toContain('分类')
  })

  test('edit tags button exists in my context', () => {
    wrapper = mountBase(createSkill(), { context: 'my' })
    const sidePanel = wrapper.find('.side-panel-section')
    expect(sidePanel.text()).toContain('修改')
  })

  test('category editing shows category grid', async () => {
    wrapper = mountBase(createSkill(), { context: 'my' })
    const editTagBtns = wrapper.findAll('.heading-btn').filter(b => b.text() === '修改')
    await editTagBtns[0].trigger('click')
    expect(wrapper.find('.category-grid').exists()).toBe(true)
    expect(wrapper.findAll('.category-option').length).toBe(2)
  })

  test('save category button works', async () => {
    wrapper = mountBase(createSkill(), { context: 'my' })
    const editTagBtns = wrapper.findAll('.heading-btn').filter(b => b.text() === '修改')
    await editTagBtns[0].trigger('click')
    await wrapper.find('.category-option').trigger('click')
    const saveBtn = wrapper.findAll('.heading-btn').filter(b => b.text() === '保存')
    await saveBtn[0].trigger('click')
    expect(storage.saveSkillUserTags).toHaveBeenCalled()
  })

  test('cancel tag editing', async () => {
    wrapper = mountBase(createSkill(), { context: 'my' })
    const editTagBtns = wrapper.findAll('.heading-btn').filter(b => b.text() === '修改')
    await editTagBtns[0].trigger('click')
    const cancelBtns = wrapper.findAll('.heading-btn').filter(b => b.text() === '取消')
    await cancelBtns[0].trigger('click')
    expect(wrapper.find('.category-grid').exists()).toBe(false)
  })

  test('protocol label shows in source tab', async () => {
    wrapper = mountBase()
    const tabs = wrapper.findAll('.detail-tabs-row button')
    await tabs[1].trigger('click')
    expect(wrapper.find('.meta-value.protocol').text()).toContain('OpenCode')
  })
})

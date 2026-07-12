import { describe, test, expect, vi, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import SkillDetailModal from '../SkillDetailModal.vue'
import {} from 'vue'
import { storage } from '../../utils/storage'
import { KeyShowToast, KeyRefreshCounts } from '../../inject-keys'

vi.mock('../../utils/storage', () => ({
  storage: {
    getDownloadedIds: vi.fn(() => []),
    getFavoriteIds: vi.fn(() => []),
    toggleFavorite: vi.fn(),
    getSettings: vi.fn(() => ({ githubToken: '', aiModels: [], translationModelId: '', themeMode: 'light' })),
    getTranslation: vi.fn(() => null),
    getTranslationDesc: vi.fn(() => null),
    getTranslationByHash: vi.fn(() => null),
    getDescTranslationByHash: vi.fn(() => null),
    saveTranslation: vi.fn(),
    saveTranslationDesc: vi.fn(),
    saveDownloadedSkills: vi.fn(),
    addDownloadedId: vi.fn(),
    addSessionDownload: vi.fn(),
  },
}))

vi.mock('../../utils/skills-sh', () => ({
  fetchSkillDetailFromSkill: vi.fn(async () => ({ description: 'Remote desc', content: 'Remote content' })),
}))

vi.mock('../../utils/frontmatter', () => ({
  parseFrontmatter: vi.fn(() => ({ name: 'Test', description: 'Test desc' })),
}))

vi.mock('../../utils/color', () => ({
  getAvatarColor: vi.fn(() => '#7c3aed'),
}))

vi.mock('../../utils/translate', () => ({
  isChineseContent: vi.fn(() => false),
  translateContent: vi.fn(async () => 'Translated content'),
  translateDescription: vi.fn(async () => 'Translated desc'),
  stripFrontmatter: vi.fn((s: string) => s),
  renderImmersiveSegments: vi.fn(() => []),
}))

vi.mock('../../composables/useTranslationQueue', () => ({
  useTranslationQueue: vi.fn(() => ({
    addTranslation: vi.fn(),
    removeTranslation: vi.fn(),
    isTranslating: vi.fn(() => false),
    notifyCacheChanged: vi.fn(),
    findInQueueByHash: vi.fn(() => []),
    cacheVersion: { value: 0 },
  })),
}))

vi.mock('../../data/skill-categories', () => ({
  SKILL_CATEGORIES: { other: { label: '其他' } },
  inferCategory: vi.fn(() => 'other'),
  CATEGORY_ICONS: { other: '📋' },
}))

vi.mock('../../utils/source-info', () => ({
  getSourceInfo: vi.fn(() => ({ icon: '📦', label: 'GitHub', bg: '#333', color: '#fff' })),
}))

function createSkill(overrides = {}) {
  return {
    id: 'test/skill',
    name: 'Test Skill',
    description: 'A test skill',
    author: 'Test',
    tags: [],
    source: 'github',
    repo: 'user/repo',
    path: 'skills/test',
    ...overrides,
  }
}

describe('SkillDetailModal', () => {
  let wrapper: VueWrapper

  afterEach(() => {
    wrapper?.unmount()
    vi.clearAllMocks()
  })

  function mountModal(skill = createSkill()) {
    return mount(SkillDetailModal, {
      props: { skill },
      global: {
        provide: {
          [KeyShowToast as symbol]: vi.fn(),
          [KeyRefreshCounts as symbol]: vi.fn(),
        },
      },
    })
  }

  test('renders modal overlay', () => {
    wrapper = mountModal()
    expect(wrapper.find('.modal-overlay').exists()).toBe(true)
  })

  test('shows skill name in header', () => {
    wrapper = mountModal()
    expect(wrapper.find('h2').text()).toContain('Test Skill')
  })

  test('shows loading state initially', () => {
    wrapper = mountModal()
    expect(wrapper.find('.loading').exists()).toBe(true)
    expect(wrapper.find('.loading').text()).toContain('加载中')
  })

  test('shows content after loading', async () => {
    wrapper = mountModal()
    await vi.dynamicImportSettled?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(wrapper.find('.section-heading').text()).toContain('SKILL 描述')
  })

  test('close button emits close', async () => {
    wrapper = mountModal()
    await wrapper.find('.close-btn').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  test('overlay click emits close', async () => {
    wrapper = mountModal()
    await wrapper.find('.modal-overlay').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  test('shows import button for non-downloaded skill', () => {
    wrapper = mountModal()
    const importBtn = wrapper.find('.import-btn')
    expect(importBtn.exists()).toBe(true)
    expect(importBtn.text()).toContain('导入')
  })

  test('shows imported status when already downloaded', async () => {
    vi.mocked(storage.getDownloadedIds).mockReturnValue(['test/skill'])
    wrapper = mountModal()
    await wrapper.vm.$nextTick()
    const importBtn = wrapper.find('.import-btn')
    expect(importBtn.text()).toContain('已在我的 Skill 中')
  })

  test('copy button exists', async () => {
    wrapper = mountModal()
    await vi.dynamicImportSettled?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(wrapper.find('.copy-md-btn').exists()).toBe(true)
  })

  test('toggle favorite button exists', () => {
    wrapper = mountModal()
    const favBtn = wrapper.find('.toolbar-icon-btn')
    expect(favBtn.exists()).toBe(true)
  })

  test('renders source and category tags', () => {
    wrapper = mountModal()
    const tags = wrapper.findAll('.header-tag')
    expect(tags.length).toBeGreaterThanOrEqual(2)
  })
})

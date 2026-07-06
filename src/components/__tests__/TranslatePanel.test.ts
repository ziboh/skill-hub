import { describe, test, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import TranslatePanel from '../TranslatePanel.vue'
import type { Skill } from '../../types'

const sampleSkills: Skill[] = [
  { id: 'skill-1', name: 'Skill One', description: 'First skill', tags: [] },
  { id: 'skill-2', name: 'Skill Two', description: 'Second skill', tags: [] },
]

function setupStorageSkills(skills: Skill[] = sampleSkills) {
  window.ztools.dbStorage.setItem('sm_cached_skills', JSON.stringify(skills))
}

function setupSettings(overrides: Record<string, unknown> = {}) {
  window.ztools.dbStorage.setItem('sm_settings', JSON.stringify({
    themeMode: 'auto', githubToken: '', translationModelId: '',
    aiModels: [], defaultInstallMode: 'copy', platformConfigs: [], storeSources: [],
    ...overrides,
  }))
}

function setupTranslationCache(descEntries: Record<string, string> = {}, contentEntries: Record<string, string> = {}) {
  const descCache: Record<string, { translatedDesc: string; updatedAt: number }> = {}
  for (const [id, desc] of Object.entries(descEntries)) {
    descCache[id] = { translatedDesc: desc, updatedAt: Date.now() }
  }
  window.ztools.dbStorage.setItem('sm_translations_desc', JSON.stringify(descCache))

  const contentCache: Record<string, { sourceContent: string; translatedContent: string; mode: string; updatedAt: number }> = {}
  for (const [id, content] of Object.entries(contentEntries)) {
    contentCache[id] = { sourceContent: '', translatedContent: content, mode: 'immersive', updatedAt: Date.now() }
  }
  window.ztools.dbStorage.setItem('sm_translations', JSON.stringify(contentCache))
}

function createWrapper() {
  return mount(TranslatePanel)
}

describe('TranslatePanel', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    window.ztools.dbStorage.clear()
    setupSettings()
  })

  test('renders title and close button', () => {
    const wrapper = createWrapper()
    expect(wrapper.text()).toContain('批量翻译')
    expect(wrapper.find('.panel-close').exists()).toBe(true)
  })

  test('shows empty state when no skills', () => {
    const wrapper = createWrapper()
    expect(wrapper.text()).toContain('暂无已下载的技能')
  })

  test('renders scope options', () => {
    const wrapper = createWrapper()
    expect(wrapper.text()).toContain('所有技能')
    expect(wrapper.text()).toContain('当前页面')
  })

  test('renders type options', () => {
    const wrapper = createWrapper()
    expect(wrapper.text()).toContain('描述')
    expect(wrapper.text()).toContain('内容')
    expect(wrapper.text()).toContain('描述和内容')
  })

  test('shows hint when no translation model configured', () => {
    const wrapper = createWrapper()
    expect(wrapper.text()).toContain('请先在设置中配置翻译模型')
  })

  test('shows skills from storage', async () => {
    setupStorageSkills()
    const wrapper = createWrapper()
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Skill One')
    expect(wrapper.text()).toContain('Skill Two')
  })

  test('translate all button enabled when model configured', () => {
    setupStorageSkills()
    setupSettings({
      translationModelId: 'test-model',
      aiModels: [{
        id: 'test-provider', name: 'Test Provider', isDefault: true, enabled: true,
        models: [{ id: 'test-model', name: 'Test Model', enabled: true }],
      }],
    })
    const wrapper = createWrapper()
    const btn = wrapper.find('.translate-all-btn')
    expect(btn.attributes('disabled')).toBeUndefined()
  })

  test('translate all button disabled without model', () => {
    setupStorageSkills()
    const wrapper = createWrapper()
    const btn = wrapper.find('.translate-all-btn')
    expect(btn.attributes('disabled')).toBeDefined()
  })

  test('individual translate button disabled per skill without model', () => {
    setupStorageSkills()
    const wrapper = createWrapper()
    const btns = wrapper.findAll('.translate-btn')
    btns.forEach(btn => {
      expect(btn.attributes('disabled')).toBeDefined()
    })
  })

  test('click close emits close', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.panel-close').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  test('click overlay emits close', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.translate-panel-overlay').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })
})

describe('Translation status detection', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    window.ztools.dbStorage.clear()
    setupSettings()
  })

  function setupModel() {
    setupSettings({
      translationModelId: 'test-model',
      aiModels: [{
        id: 'test-provider', name: 'Test Provider', isDefault: true, enabled: true,
        models: [{ id: 'test-model', name: 'Test Model', enabled: true }],
      }],
    })
  }

  function makeSkill(overrides: Partial<Skill> & { id: string; name: string }): Skill {
    return { description: '', tags: [], ...overrides }
  }

  function getStatusBadge(wrapper: ReturnType<typeof mount>, skillName: string) {
    const items = wrapper.findAll('.skill-item')
    const item = items.find(el => el.text().includes(skillName))
    if (!item) return null
    const badge = item.find('.skill-status-badge')
    return badge?.text() ?? null
  }

  function getTranslateBtn(wrapper: ReturnType<typeof mount>, skillName: string) {
    const items = wrapper.findAll('.skill-item')
    const item = items.find(el => el.text().includes(skillName))
    if (!item) return null
    return item.find('.translate-btn')
  }

  test('Chinese skill shows 已是中文 label and button disabled', async () => {
    setupModel()
    const skills = [
      makeSkill({ id: 'skill-cn', name: 'Skill CN', description: '这是一个中文技能描述，用于测试' }),
    ]
    setupStorageSkills(skills)

    vi.mocked(window.services.pathExists).mockReturnValue(false)

    const wrapper = createWrapper()
    const typeButtons = wrapper.findAll('.segment-btn')
    const descBtn = typeButtons.find(btn => btn.text() === '描述')
    await descBtn?.trigger('click')
    await wrapper.vm.$nextTick()

    const badge = getStatusBadge(wrapper, 'Skill CN')
    expect(badge).toBe('中文')

    const btn = getTranslateBtn(wrapper, 'Skill CN')
    expect(btn?.attributes('disabled')).toBeDefined()
  })

  test('Chinese skill in SKILL.md file shows 中文', async () => {
    setupModel()
    const skills = [
      makeSkill({ id: 'skill-cn-file', name: 'Skill CN File', description: 'English desc', path: '/skills/cn-file' }),
    ]
    setupStorageSkills(skills)

    vi.mocked(window.services.pathExists).mockImplementation((p: string) => p.includes('cn-file'))
    vi.mocked(window.services.readFile).mockReturnValue('# 这是一个中文技能\n\n中文内容描述，用于测试技能翻译状态')

    const wrapper = createWrapper()
    const typeButtons = wrapper.findAll('.segment-btn')
    const contentBtn = typeButtons.find(btn => btn.text() === '内容')
    await contentBtn?.trigger('click')
    await wrapper.vm.$nextTick()

    const badge = getStatusBadge(wrapper, 'Skill CN File')
    expect(badge).toBe('中文')

    const btn = getTranslateBtn(wrapper, 'Skill CN File')
    expect(btn?.attributes('disabled')).toBeDefined()
  })

  test('English skill shows 待翻译 label and button enabled', async () => {
    setupModel()
    const skills = [
      makeSkill({ id: 'skill-en', name: 'Skill EN', description: 'An English skill description' }),
    ]
    setupStorageSkills(skills)

    vi.mocked(window.services.pathExists).mockReturnValue(false)

    const wrapper = createWrapper()
    await wrapper.vm.$nextTick()

    const badge = getStatusBadge(wrapper, 'Skill EN')
    expect(badge).toBe('待翻译')

    const btn = getTranslateBtn(wrapper, 'Skill EN')
    expect(btn?.attributes('disabled')).toBeUndefined()
  })

  test('already translated (desc) shows 已翻译 and button enabled', async () => {
    setupModel()
    const skills = [
      makeSkill({ id: 'skill-done', name: 'Skill Done', description: 'An English description' }),
    ]
    setupStorageSkills(skills)
    setupTranslationCache({ 'skill-done': '已翻译的描述' })

    vi.mocked(window.services.pathExists).mockReturnValue(false)

    const wrapper = createWrapper()
    await wrapper.vm.$nextTick()

    const badge = getStatusBadge(wrapper, 'Skill Done')
    expect(badge).toBe('已翻译')

    const btn = getTranslateBtn(wrapper, 'Skill Done')
    expect(btn?.attributes('disabled')).toBeUndefined()
  })

  test('already translated (content) shows 已翻译 and button enabled', async () => {
    setupModel()
    const skills = [
      makeSkill({ id: 'skill-done2', name: 'Skill Done2', description: 'An English description', path: '/skills/done2' }),
    ]
    setupStorageSkills(skills)
    setupTranslationCache({}, { 'skill-done2': '已翻译的内容' })

    vi.mocked(window.services.pathExists).mockReturnValue(true)
    vi.mocked(window.services.readFile).mockReturnValue('Original English content')

    const wrapper = createWrapper()
    await wrapper.vm.$nextTick()

    const badge = getStatusBadge(wrapper, 'Skill Done2')
    expect(badge).toBe('已翻译')

    const btn = getTranslateBtn(wrapper, 'Skill Done2')
    expect(btn?.attributes('disabled')).toBeUndefined()
  })

  test('skill with empty description and no file shows 待翻译', async () => {
    setupModel()
    const skills = [
      makeSkill({ id: 'skill-empty', name: 'Skill Empty', description: '' }),
    ]
    setupStorageSkills(skills)

    vi.mocked(window.services.pathExists).mockReturnValue(false)

    const wrapper = createWrapper()
    await wrapper.vm.$nextTick()

    const badge = getStatusBadge(wrapper, 'Skill Empty')
    expect(badge).toBe('待翻译')
  })

  test('translating skill shows 翻译中 label', async () => {
    setupModel()
    const skills = [
      makeSkill({ id: 'skill-trans', name: 'Skill Trans', description: 'An English skill' }),
    ]
    setupStorageSkills(skills)

    vi.mocked(window.services.pathExists).mockReturnValue(false)

    const { useTranslationQueue } = await import('../../composables/useTranslationQueue')
    const { addTranslation } = useTranslationQueue()
    addTranslation('skill-trans', 'Skill Trans', 'content')

    const wrapper = createWrapper()
    await wrapper.vm.$nextTick()

    const badge = getStatusBadge(wrapper, 'Skill Trans')
    expect(badge).toBe('翻译中')
  })

  test('queued skill shows 排队中 label', async () => {
    setupModel()
    const skills = [
      makeSkill({ id: 'skill-queue', name: 'Skill Queue', description: 'An English skill' }),
    ]
    setupStorageSkills(skills)

    vi.mocked(window.services.pathExists).mockReturnValue(false)

    const { useTranslationQueue } = await import('../../composables/useTranslationQueue')
    const { addTranslation, queue } = useTranslationQueue()
    addTranslation('skill-queue', 'Skill Queue', 'content')
    addTranslation('skill-queue', 'Skill Queue', 'desc')

    queue.value = queue.value.map(item => ({
      ...item,
      status: 'pending' as const,
    }))
    queue.value[0].status = 'translating'

    const wrapper = createWrapper()
    await wrapper.vm.$nextTick()

    const badge = getStatusBadge(wrapper, 'Skill Queue')
    expect(badge).toBe('排队中')
  })

  test('Chinese skill with English tags shows 中文', async () => {
    setupModel()
    const skills = [
      makeSkill({
        id: 'skill-cn-tags',
        name: 'Skill CN Tags',
        description: '这是一个中文技能描述',
        tags: ['english', 'tag'],
        path: '/skills/cn-tags'
      }),
    ]
    setupStorageSkills(skills)

    vi.mocked(window.services.pathExists).mockImplementation((p: string) => p.includes('cn-tags'))
    vi.mocked(window.services.readFile).mockReturnValue('# 这是一个中文技能\n\n中文内容描述，用于测试技能翻译状态')

    const wrapper = createWrapper()
    await wrapper.vm.$nextTick()

    const badge = getStatusBadge(wrapper, 'Skill CN Tags')
    expect(badge).toBe('中文')

    const btn = getTranslateBtn(wrapper, 'Skill CN Tags')
    expect(btn?.attributes('disabled')).toBeDefined()
  })
})

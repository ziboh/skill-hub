import { describe, test, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import TranslatePanel from '../TranslatePanel.vue'
import { storage } from '../../utils/storage'
import type { Skill } from '../../types'
import { processingHashes, useTranslationQueue } from '../../composables/useTranslationQueue'

vi.mock('../../utils/translate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/translate')>()
  return {
    ...actual,
    translateContent: vi.fn(async () => new Promise(() => {})),
    translateDescription: vi.fn(async () => new Promise(() => {})),
  }
})

const sampleSkills: Skill[] = [
  { id: 'skill-1', name: 'Skill One', description: 'First skill', tags: [] },
  { id: 'skill-2', name: 'Skill Two', description: 'Second skill', tags: [] },
]

let currentTestSkills: Skill[] | undefined

function setupStorageSkills(skills: Skill[] = sampleSkills) {
  currentTestSkills = skills
  window.ztools.dbStorage.setItem('sm_downloaded_skills', JSON.stringify(skills))
}

function setupSettings(overrides: Record<string, unknown> = {}) {
  window.ztools.dbStorage.setItem(
    'sm_settings',
    JSON.stringify({
      themeMode: 'auto',
      githubToken: '',
      translationModelId: '',
      aiModels: [],
      defaultInstallMode: 'copy',
      platformConfigs: [],
      storeSources: [],
      ...overrides,
    }),
  )
}

function setupTranslationCache(
  entries: Record<string, { translatedDesc?: string; translatedContent?: string; sourceContent?: string; mode?: string }> = {},
) {
  const cache: Record<string, any> = {}
  for (const [key, data] of Object.entries(entries)) {
    cache[key] = { ...data, updatedAt: Date.now() }
  }
  window.ztools.dbStorage.setItem('sm_translations', JSON.stringify(cache))
}

function createWrapper() {
  return mount(TranslatePanel, {
    props: {
      currentSkills: currentTestSkills,
      allSkills: currentTestSkills,
    },
  })
}

describe('TranslatePanel', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    window.ztools.dbStorage.clear()
    processingHashes.clear()
    useTranslationQueue().clearAll()
    currentTestSkills = undefined
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
    expect(wrapper.text()).toContain('所有 Skill')
    expect(wrapper.text()).toContain('我的 Skill')
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
      translationModelId: 'test-provider::test-model',
      aiModels: [
        {
          id: 'test-provider',
          name: 'Test Provider',
          isDefault: true,
          enabled: true,
          models: [{ id: 'test-model', name: 'Test Model', enabled: true }],
        },
      ],
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
    btns.forEach((btn) => {
      expect(btn.attributes('disabled')).toBeDefined()
    })
  })

  test('click close emits close', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.panel-close').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  test('点击遮罩不会关闭弹窗', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.translate-panel-overlay').trigger('click')
    expect(wrapper.emitted('close')).toBeUndefined()
  })
})

describe('Translation status detection', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    window.ztools.dbStorage.clear()
    processingHashes.clear()
    useTranslationQueue().clearAll()
    currentTestSkills = undefined
    setupSettings()
  })

  function setupModel() {
    setupSettings({
      translationModelId: 'test-provider::test-model',
      aiModels: [
        {
          id: 'test-provider',
          name: 'Test Provider',
          isDefault: true,
          enabled: true,
          models: [{ id: 'test-model', name: 'Test Model', enabled: true }],
        },
      ],
    })
  }

  function makeSkill(overrides: Partial<Skill> & { id: string; name: string }): Skill {
    return { description: '', tags: [], ...overrides }
  }

  function getStatusBadge(wrapper: ReturnType<typeof mount>, skillName: string) {
    const items = wrapper.findAll('.skill-item')
    const item = items.find((el) => el.text().includes(skillName))
    if (!item) return null
    const badge = item.find('.skill-status-badge')
    return badge?.text() ?? null
  }

  function getTranslateBtn(wrapper: ReturnType<typeof mount>, skillName: string) {
    const items = wrapper.findAll('.skill-item')
    const item = items.find((el) => el.text().includes(skillName))
    if (!item) return null
    return item.find('.translate-btn')
  }

  test('Chinese skill shows 已是中文 label and button disabled', async () => {
    setupModel()
    const skills = [makeSkill({ id: 'skill-cn', name: 'Skill CN', description: '这是一个中文技能描述，用于测试' })]
    setupStorageSkills(skills)

    vi.mocked(window.services.pathExists).mockReturnValue(false)

    const wrapper = createWrapper()
    const typeButtons = wrapper.findAll('.segment-btn')
    const descBtn = typeButtons.find((btn) => btn.text() === '描述')
    await descBtn?.trigger('click')
    await wrapper.vm.$nextTick()

    const badge = getStatusBadge(wrapper, 'Skill CN')
    expect(badge).toBe('中文')

    const btn = getTranslateBtn(wrapper, 'Skill CN')
    expect(btn?.attributes('disabled')).toBeDefined()
  })

  test('Chinese skill in SKILL.md file shows 中文', async () => {
    setupModel()
    const skills = [makeSkill({ id: 'skill-cn-file', name: 'Skill CN File', description: 'English desc', path: '/skills/cn-file' })]
    setupStorageSkills(skills)

    vi.mocked(window.services.pathExists).mockImplementation((p: string) => p.includes('cn-file'))
    vi.mocked(window.services.readFile).mockReturnValue('# 这是一个中文技能\n\n中文内容描述，用于测试技能翻译状态')

    const wrapper = createWrapper()
    const typeButtons = wrapper.findAll('.segment-btn')
    const contentBtn = typeButtons.find((btn) => btn.text() === '内容')
    await contentBtn?.trigger('click')
    await wrapper.vm.$nextTick()

    const badge = getStatusBadge(wrapper, 'Skill CN File')
    expect(badge).toBe('中文')

    const btn = getTranslateBtn(wrapper, 'Skill CN File')
    expect(btn?.attributes('disabled')).toBeDefined()
  })

  test('English skill shows 待翻译 label and button enabled', async () => {
    setupModel()
    const skills = [makeSkill({ id: 'skill-en', name: 'Skill EN', description: 'An English skill description' })]
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
    const readme = '# Skill Done\n\nSome content'
    const skills = [makeSkill({ id: 'skill-done', name: 'Skill Done', description: 'An English description', readme })]
    setupStorageSkills(skills)
    setupTranslationCache({ [readme]: { translatedDesc: '已翻译的描述' } })

    vi.mocked(window.services.pathExists).mockReturnValue(false)

    const wrapper = createWrapper()
    const typeButtons = wrapper.findAll('.segment-btn')
    const descBtn = typeButtons.find((btn) => btn.text() === '描述')
    await descBtn?.trigger('click')
    await wrapper.vm.$nextTick()

    const badge = getStatusBadge(wrapper, 'Skill Done')
    expect(badge).toBe('已翻译')

    const btn = getTranslateBtn(wrapper, 'Skill Done')
    expect(btn?.attributes('disabled')).toBeUndefined()
  })

  test('already translated (content) shows 已翻译 and button enabled', async () => {
    setupModel()
    const skills = [makeSkill({ id: 'skill-done2', name: 'Skill Done2', description: 'An English description', path: '/skills/done2' })]
    setupStorageSkills(skills)
    setupTranslationCache({
      'Original English content': { translatedContent: '已翻译的内容', sourceContent: 'Original English content', mode: 'immersive' },
    })

    vi.mocked(window.services.pathExists).mockReturnValue(true)
    vi.mocked(window.services.readFile).mockReturnValue('Original English content')

    const wrapper = createWrapper()
    const typeButtons = wrapper.findAll('.segment-btn')
    const contentBtn = typeButtons.find((btn) => btn.text() === '内容')
    await contentBtn?.trigger('click')
    await wrapper.vm.$nextTick()

    const badge = getStatusBadge(wrapper, 'Skill Done2')
    expect(badge).toBe('已翻译')

    const btn = getTranslateBtn(wrapper, 'Skill Done2')
    expect(btn?.attributes('disabled')).toBeUndefined()
  })

  test('skill with empty description and no file shows 待翻译', async () => {
    setupModel()
    const skills = [makeSkill({ id: 'skill-empty', name: 'Skill Empty', description: '' })]
    setupStorageSkills(skills)

    vi.mocked(window.services.pathExists).mockReturnValue(false)

    const wrapper = createWrapper()
    await wrapper.vm.$nextTick()

    const badge = getStatusBadge(wrapper, 'Skill Empty')
    expect(badge).toBe('待翻译')
  })

  test('translating skill shows 翻译中 label', async () => {
    setupModel()
    const readme = '# Skill Trans\n\nAn English skill for testing'
    const skills = [makeSkill({ id: 'skill-trans', name: 'Skill Trans', description: 'An English skill', readme })]
    setupStorageSkills(skills)

    vi.mocked(window.services.pathExists).mockReturnValue(false)

    const { useTranslationQueue } = await import('../../composables/useTranslationQueue')
    const { addTranslation } = useTranslationQueue()
    addTranslation(readme, 'desc', 'Skill Trans', 'An English skill')

    const wrapper = createWrapper()
    await wrapper.vm.$nextTick()

    const badge = getStatusBadge(wrapper, 'Skill Trans')
    expect(badge).toBe('翻译中')
  })

  test('desc-only translating does not show 翻译中 under content type', async () => {
    setupModel()
    const readme = '# Skill Desc Only\n\nContent'
    const skills = [makeSkill({ id: 'skill-desc-only', name: 'Skill Desc Only', description: 'An English skill', readme })]
    setupStorageSkills(skills)
    vi.mocked(window.services.pathExists).mockReturnValue(false)

    const { useTranslationQueue } = await import('../../composables/useTranslationQueue')
    const { addTranslation } = useTranslationQueue()
    addTranslation(readme, 'desc', 'Skill Desc Only', 'An English skill')

    const wrapper = createWrapper()
    const typeButtons = wrapper.findAll('.segment-btn')
    const contentBtn = typeButtons.find((btn) => btn.text() === '内容')
    await contentBtn?.trigger('click')
    await wrapper.vm.$nextTick()
    expect(getStatusBadge(wrapper, 'Skill Desc Only')).not.toBe('翻译中')

    const descBtn = typeButtons.find((btn) => btn.text() === '描述')
    await descBtn?.trigger('click')
    await wrapper.vm.$nextTick()
    expect(getStatusBadge(wrapper, 'Skill Desc Only')).toBe('翻译中')
  })

  test('queued skill shows 排队中 label', async () => {
    setupModel()
    const readme = '# Skill Queue\n\nTest content'
    const skills = [makeSkill({ id: 'skill-queue', name: 'Skill Queue', description: 'An English skill', readme })]
    setupStorageSkills(skills)

    vi.mocked(window.services.pathExists).mockReturnValue(false)

    const { useTranslationQueue, MAX_CONCURRENT } = await import('../../composables/useTranslationQueue')
    const { addTranslation } = useTranslationQueue()
    for (let i = 0; i < MAX_CONCURRENT; i++) {
      // text keeps worker hanging so slots stay occupied
      addTranslation(`filler-hash-${i}`, 'content', `Filler ${i}`, 'English filler content to translate')
    }
    addTranslation(readme, 'desc', 'Skill Queue', 'An English skill')

    const wrapper = createWrapper()
    const typeButtons = wrapper.findAll('.segment-btn')
    const descBtn = typeButtons.find((btn) => btn.text() === '描述')
    await descBtn?.trigger('click')
    await wrapper.vm.$nextTick()

    const badge = getStatusBadge(wrapper, 'Skill Queue')
    expect(badge).toBe('排队中')
  })

  test('content translation does not mark description as translated', async () => {
    setupModel()
    const skills = [
      makeSkill({
        id: 'skill-content-only',
        name: 'Skill Content Only',
        description: 'An English description',
        path: '/skills/content-only',
      }),
    ]
    setupStorageSkills(skills)

    vi.mocked(window.services.pathExists).mockReturnValue(true)
    vi.mocked(window.services.readFile).mockReturnValue('Original English content')
    vi.mocked(window.services.hashContent).mockImplementation((content: string) => content)
    setupTranslationCache({
      'Original English content': { translatedContent: '已翻译的内容', sourceContent: 'Original English content', mode: 'immersive' },
    })

    const wrapper = createWrapper()
    const typeButtons = wrapper.findAll('.segment-btn')
    const descBtn = typeButtons.find((btn) => btn.text() === '描述')
    await descBtn?.trigger('click')
    await wrapper.vm.$nextTick()

    const badge = getStatusBadge(wrapper, 'Skill Content Only')
    expect(badge).toBe('待翻译')
    expect(storage.getDescTranslationByHash('An English description')).toBeNull()
  })

  test('Chinese skill with English tags shows 中文', async () => {
    setupModel()
    const skills = [
      makeSkill({
        id: 'skill-cn-tags',
        name: 'Skill CN Tags',
        description: '这是一个中文技能描述',
        tags: ['english', 'tag'],
        path: '/skills/cn-tags',
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

  test('translateAll with only desc cached still enqueues content', async () => {
    setupModel()
    const readme = '# Skill Partial\n\nOriginal English body content for partial translation'
    const skills = [
      makeSkill({
        id: 'skill-partial',
        name: 'Skill Partial',
        description: 'An English description for partial',
        readme,
      }),
    ]
    setupStorageSkills(skills)
    setupTranslationCache({ [readme]: { translatedDesc: '已翻译的描述' } })
    vi.mocked(window.services.pathExists).mockReturnValue(false)

    const wrapper = createWrapper()
    await wrapper.vm.$nextTick()

    expect(getStatusBadge(wrapper, 'Skill Partial')).toBe('待翻译')

    await wrapper.find('.translate-all-btn').trigger('click')
    await wrapper.vm.$nextTick()

    const { queue } = useTranslationQueue()
    const items = queue.value.filter((i) => i.hash === readme)
    expect(items.some((i) => i.type === 'content')).toBe(true)
    expect(items.some((i) => i.type === 'desc')).toBe(false)
  })

  test('translateAll with both cached enqueues nothing', async () => {
    setupModel()
    const readme = '# Skill Full\n\nOriginal English body content fully translated'
    const skills = [
      makeSkill({
        id: 'skill-full',
        name: 'Skill Full',
        description: 'An English description fully done',
        readme,
      }),
    ]
    setupStorageSkills(skills)
    setupTranslationCache({
      [readme]: {
        translatedDesc: '已翻译的描述',
        translatedContent: '已翻译的内容',
        sourceContent: readme,
        mode: 'full',
      },
    })
    vi.mocked(window.services.pathExists).mockReturnValue(false)

    const wrapper = createWrapper()
    await wrapper.vm.$nextTick()

    expect(getStatusBadge(wrapper, 'Skill Full')).toBe('已翻译')

    await wrapper.find('.translate-all-btn').trigger('click')
    await wrapper.vm.$nextTick()

    const { queue } = useTranslationQueue()
    expect(queue.value.filter((i) => i.hash === readme)).toHaveLength(0)
  })

  test('retranslate force clears cache and re-enqueues', async () => {
    setupModel()
    const readme = '# Skill Retrans\n\nOriginal English body for retranslate force'
    const skills = [
      makeSkill({
        id: 'skill-retrans',
        name: 'Skill Retrans',
        description: 'An English description for retranslate',
        readme,
      }),
    ]
    setupStorageSkills(skills)
    setupTranslationCache({
      [readme]: {
        translatedDesc: '已翻译的描述',
        translatedContent: '已翻译的内容',
        sourceContent: readme,
        mode: 'full',
      },
    })
    vi.mocked(window.services.pathExists).mockReturnValue(false)

    const wrapper = createWrapper()
    await wrapper.vm.$nextTick()

    expect(getStatusBadge(wrapper, 'Skill Retrans')).toBe('已翻译')

    const btn = getTranslateBtn(wrapper, 'Skill Retrans')
    expect(btn?.classes()).toContain('retranslate-btn')
    await btn?.trigger('click')
    await wrapper.vm.$nextTick()

    const entry = storage.getTranslationByHash(readme)
    expect(entry?.translatedDesc).toBeFalsy()
    expect(entry?.translatedContent).toBeFalsy()

    const { queue } = useTranslationQueue()
    const items = queue.value.filter((i) => i.hash === readme)
    expect(items.some((i) => i.type === 'desc')).toBe(true)
    expect(items.some((i) => i.type === 'content')).toBe(true)
  })
})

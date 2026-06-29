import { describe, test, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import TranslatePanel from '../TranslatePanel.vue'
import type { Skill } from '../../types'

const sampleSkills: Skill[] = [
  { id: 'skill-1', name: 'Skill One', description: 'First skill', tags: [], format: 'opencode' },
  { id: 'skill-2', name: 'Skill Two', description: 'Second skill', tags: [], format: 'opencode' },
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
    expect(wrapper.text()).toContain('当前页面技能')
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

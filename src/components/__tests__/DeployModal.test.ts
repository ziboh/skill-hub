import { describe, test, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import DeployModal from '../DeployModal.vue'
import { KeyShowToast } from '../../inject-keys'
import type { Skill } from '../../types'

const sampleSkill: Skill = {
  id: 'skill-1',
  name: 'Test Skill',
  description: 'A test skill',
  tags: [],
}

vi.mock('../../data/platforms', () => ({
  detectPlatforms: () => [
    { id: 'windsurf', name: 'Windsurf', detected: true, enabled: true, defaultPath: '/mock/windsurf' },
    { id: 'cursor', name: 'Cursor', detected: true, enabled: true, defaultPath: '/mock/cursor' },
  ],
  getPlatformPath: (p: { defaultPath?: string }, _mode?: string) => p.defaultPath || '',
  defaultPlatforms: [],
  platformDisplayIcon: (p: { id: string; icon?: string }) => p.icon || p.id,
}))

function createWrapper(skill: Skill = sampleSkill) {
  return mount(DeployModal, {
    props: { skill },
    global: {
      provide: {
        [KeyShowToast as symbol]: vi.fn(),
      },
    },
  })
}

describe('DeployModal', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  test('renders skill name in header', () => {
    const wrapper = createWrapper()
    expect(wrapper.text()).toContain('Test Skill')
    expect(wrapper.text()).toContain('A test skill')
  })

  test('shows mode toggle with copy and symlink', () => {
    const wrapper = createWrapper()
    const modeBtns = wrapper.findAll('.mode-toggle button')
    expect(modeBtns.length).toBe(2)
    expect(modeBtns[0].text()).toContain('复制')
    expect(modeBtns[1].text()).toContain('软链接')
  })

  test('default install mode is copy', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.mode-toggle button.active').text()).toContain('复制')
  })

  test('click close emits close', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.deploy-close').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  test('click cancel emits close', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.deploy-btn.cancel').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  test('点击遮罩不会关闭弹窗', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.deploy-overlay').trigger('click')
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  test('shows platform selection grid', () => {
    const wrapper = createWrapper()
    const cards = wrapper.findAll('.deploy-platform-card')
    expect(cards.length).toBe(2)
    expect(cards[0].text()).toContain('Windsurf')
  })

  test('toggle platform selection', async () => {
    const wrapper = createWrapper()
    const cards = wrapper.findAll('.deploy-platform-card')
    await cards[0].trigger('click')
    expect(cards[0].classes()).toContain('selected')
  })

  test('deploy button disabled when no platforms selected', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.deploy-btn.confirm').attributes('disabled')).toBeDefined()
  })

  test('deploy button enabled when platforms selected', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.deploy-platform-card').trigger('click')
    expect(wrapper.find('.deploy-btn.confirm').attributes('disabled')).toBeUndefined()
  })
})

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import BatchSyncModal from '../BatchSyncModal.vue'
import { KeyShowToast } from '../../inject-keys'
import type { Skill } from '../../types'

const sampleSkills: Skill[] = [
  { id: 'skill-1', name: 'Test Skill 1', description: '', tags: [] },
  { id: 'skill-2', name: 'Test Skill 2', description: '', tags: [] },
]

vi.mock('../../data/platforms', () => ({
  detectPlatforms: () => [
    { id: 'windsurf', name: 'Windsurf', detected: true, enabled: true, defaultPath: '/mock/windsurf' },
    { id: 'cursor', name: 'Cursor', detected: true, enabled: true, defaultPath: '/mock/cursor' },
  ],
  getPlatformPath: (p: { defaultPath?: string }) => p.defaultPath || '',
  defaultPlatforms: [],
  platformDisplayIcon: (p: { id: string; icon?: string }) => p.icon || p.id,
}))

function createWrapper(skills: Skill[] = sampleSkills) {
  return mount(BatchSyncModal, {
    props: { skills },
    global: {
      provide: {
        [KeyShowToast as symbol]: vi.fn(),
      },
    },
  })
}

describe('BatchSyncModal', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  test('renders title and skill count', () => {
    const wrapper = createWrapper()
    expect(wrapper.text()).toContain('批量分发')
    expect(wrapper.text()).toContain('2 个技能')
  })

  test('shows skill names', () => {
    const wrapper = createWrapper()
    expect(wrapper.text()).toContain('Test Skill 1')
    expect(wrapper.text()).toContain('Test Skill 2')
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
    const activeBtn = wrapper.find('.mode-toggle button.active')
    expect(activeBtn.text()).toContain('复制')
  })

  test('click close button emits close', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.deploy-close').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  test('click cancel emits close', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.deploy-btn.cancel').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  test('click overlay emits close', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.deploy-overlay').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  test('shows platform selection grid', () => {
    const wrapper = createWrapper()
    const cards = wrapper.findAll('.deploy-platform-card')
    expect(cards.length).toBe(2)
    expect(cards[0].text()).toContain('Windsurf')
    expect(cards[1].text()).toContain('Cursor')
  })

  test('toggle platform selection', async () => {
    const wrapper = createWrapper()
    const cards = wrapper.findAll('.deploy-platform-card')
    await cards[0].trigger('click')
    expect(cards[0].classes()).toContain('selected')
    expect(wrapper.text()).toContain('1 / 2')
  })

  test('toggle all selects all platforms', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.deploy-select-all').trigger('click')
    expect(wrapper.text()).toContain('2 / 2')
  })

  test('deploy button shows selected count', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.deploy-platform-card').trigger('click')
    expect(wrapper.find('.deploy-btn.confirm').text()).toContain('1 个平台')
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

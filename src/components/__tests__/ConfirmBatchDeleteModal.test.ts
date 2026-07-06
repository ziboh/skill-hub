import { describe, test, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ConfirmBatchDeleteModal from '../ConfirmBatchDeleteModal.vue'
import { storage } from '../../utils/storage'
import type { Skill } from '../../types'

const sampleSkills: Skill[] = [
  { id: 'skill-1', name: 'Test Skill 1', description: 'First skill', tags: [] },
  { id: 'skill-2', name: 'Test Skill 2', description: 'Second skill', tags: [] },
]

function createWrapper(skills: Skill[] = sampleSkills) {
  return mount(ConfirmBatchDeleteModal, { props: { skills } })
}

describe('ConfirmBatchDeleteModal', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  test('renders title and skill count', () => {
    const wrapper = createWrapper()
    expect(wrapper.text()).toContain('批量删除 Skill')
    expect(wrapper.text()).toContain('2 个 Skill')
  })

  test('shows skill names in the list', () => {
    const wrapper = createWrapper()
    const items = wrapper.findAll('.skill-item-name')
    expect(items.length).toBe(2)
    expect(items[0].text()).toBe('Test Skill 1')
    expect(items[1].text()).toBe('Test Skill 2')
  })

  test('click overlay emits close', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.confirm-overlay').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  test('click close button emits close', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.confirm-close').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  test('click cancel button emits close', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.confirm-btn.cancel').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  test('click delete button emits deleted', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.confirm-btn.delete').trigger('click')
    expect(wrapper.emitted('deleted')).toBeTruthy()
  })

  test('shows distributed section when skills have install records', () => {
    vi.spyOn(storage, 'getInstalledForSkill').mockReturnValue([
      { platformId: 'windsurf', targetPath: '/some/path', platformName: 'Windsurf' },
    ])
    const wrapper = createWrapper()
    expect(wrapper.find('.distributed-section').exists()).toBe(true)
    expect(wrapper.text()).toContain('同时移除已分发的文件')
  })

  test('checking remove distributed shows platform selection', async () => {
    vi.spyOn(storage, 'getInstalledForSkill').mockReturnValue([
      { platformId: 'windsurf', targetPath: '/some/path', platformName: 'Windsurf' },
    ])
    const wrapper = createWrapper()
    await wrapper.find('.remove-distributed-checkbox').setValue(true)
    expect(wrapper.find('.platform-select').exists()).toBe(true)
    expect(wrapper.text()).toContain('Windsurf')
  })

  test('toggle platform selection works', async () => {
    vi.spyOn(storage, 'getInstalledForSkill').mockReturnValue([
      { platformId: 'windsurf', targetPath: '/some/path', platformName: 'Windsurf' },
      { platformId: 'cursor', targetPath: '/some/path2', platformName: 'Cursor' },
    ])
    const wrapper = createWrapper()
    await wrapper.find('.remove-distributed-checkbox').setValue(true)
    const checkboxes = wrapper.findAll('.platform-checkbox')
    expect(checkboxes.length).toBe(2)
    await checkboxes[1].trigger('change')
  })

  test('no distributed section when no install records', () => {
    vi.spyOn(storage, 'getInstalledForSkill').mockReturnValue([])
    const wrapper = createWrapper()
    expect(wrapper.find('.distributed-section').exists()).toBe(false)
  })

  test('delete button shows skill count', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.confirm-btn.delete').text()).toContain('2 个 Skill')
  })
})

import { describe, test, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SkillPickModal from '../SkillPickModal.vue'

const mockSkills = [
  { name: 'Test Skill', description: 'A test skill', dir: '/skills/test' },
  { name: 'Another', description: 'Another skill', dir: '/skills/another' },
]

function createWrapper() {
  return mount(SkillPickModal, {
    props: { skills: mockSkills },
  })
}

describe('SkillPickModal', () => {
  test('renders all skills', () => {
    const wrapper = createWrapper()
    expect(wrapper.text()).toContain('Test Skill')
    expect(wrapper.text()).toContain('Another')
  })

  test('renders skill count in subtitle', () => {
    const wrapper = createWrapper()
    expect(wrapper.text()).toContain('2 个技能')
  })

  test('confirm button is disabled when no selection', () => {
    const wrapper = createWrapper()
    const confirmBtn = wrapper.find('.pick-btn.confirm')
    expect((confirmBtn.element as HTMLButtonElement).disabled).toBe(true)
  })

  test('clicking a skill enables confirm button', async () => {
    const wrapper = createWrapper()
    await wrapper.findAll('.pick-item')[0].trigger('click')
    const confirmBtn = wrapper.find('.pick-btn.confirm')
    expect((confirmBtn.element as HTMLButtonElement).disabled).toBe(false)
  })

  test('clicking a skill shows checkmark', async () => {
    const wrapper = createWrapper()
    await wrapper.findAll('.pick-item')[0].trigger('click')
    expect(wrapper.findAll('.pick-item-check')).toHaveLength(1)
  })

  test('clicking confirm emits select with the dir', async () => {
    const wrapper = createWrapper()
    await wrapper.findAll('.pick-item')[1].trigger('click')
    await wrapper.find('.pick-btn.confirm').trigger('click')
    const emits = wrapper.emitted('select')!
    expect(emits).toHaveLength(2)
    expect(emits[1]).toEqual(['/skills/another'])
  })

  test('clicking a skill emits select immediately', async () => {
    const wrapper = createWrapper()
    await wrapper.findAll('.pick-item')[0].trigger('click')
    expect(wrapper.emitted('select')).toHaveLength(1)
    expect(wrapper.emitted('select')![0]).toEqual(['/skills/test'])
  })

  test('clicking cancel button emits close', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.pick-btn.cancel').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  test('clicking overlay emits close', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.pick-overlay').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  test('close button emits close', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.pick-close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})

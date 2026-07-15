import { describe, expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import SkillEnabledToggle from '../SkillEnabledToggle.vue'

describe('SkillEnabledToggle', () => {
  test('shows the enabled status label', () => {
    const wrapper = mount(SkillEnabledToggle, {
      props: { enabled: true },
    })

    expect(wrapper.text()).toContain('已启用')
    expect(wrapper.find('.skill-enabled-toggle').classes()).toContain('enabled')
  })

  test('shows the disabled status label', () => {
    const wrapper = mount(SkillEnabledToggle, {
      props: { enabled: false },
    })

    expect(wrapper.text()).toContain('已停用')
    expect(wrapper.find('.skill-enabled-toggle').classes()).not.toContain('enabled')
  })

  test('emits toggle when clicked', async () => {
    const wrapper = mount(SkillEnabledToggle, {
      props: { enabled: true },
    })

    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('toggle')).toHaveLength(1)
  })

  test('does not emit toggle while busy', async () => {
    const wrapper = mount(SkillEnabledToggle, {
      props: { enabled: true, busy: true },
    })

    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('toggle')).toBeUndefined()
  })
})

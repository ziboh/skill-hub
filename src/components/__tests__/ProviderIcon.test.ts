import { describe, test, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ProviderIcon from '../ProviderIcon.vue'

describe('ProviderIcon', () => {
  test('renders avatar variant by default', () => {
    const wrapper = mount(ProviderIcon)
    expect(wrapper.find('.pi-avatar').exists()).toBe(true)
  })

  test('renders mono fallback when variant mono with no icon', () => {
    const wrapper = mount(ProviderIcon, { props: { variant: 'mono' } })
    expect(wrapper.find('.pi-fallback-mono').exists()).toBe(true)
  })

  test('shows fallback gear icon when no icon prop', () => {
    const wrapper = mount(ProviderIcon)
    expect(wrapper.find('.pi-fallback').exists()).toBe(true)
  })

  test('applies custom size', () => {
    const wrapper = mount(ProviderIcon, { props: { size: 32 } })
    const avatar = wrapper.find('.pi-avatar')
    expect(avatar.attributes('style')).toContain('width: 32px')
    expect(avatar.attributes('style')).toContain('height: 32px')
  })

  test('with known icon renders avatar-icon', () => {
    const wrapper = mount(ProviderIcon, { props: { icon: 'openai' } })
    expect(wrapper.find('.pi-avatar-icon').exists()).toBe(true)
  })

  test('with unknown icon name shows fallback', () => {
    const wrapper = mount(ProviderIcon, { props: { icon: 'nonexistent' } })
    expect(wrapper.find('.pi-fallback').exists()).toBe(true)
  })

  test('mono variant with known icon renders pi-mono', () => {
    const wrapper = mount(ProviderIcon, { props: { icon: 'openai', variant: 'mono' } })
    expect(wrapper.find('.pi-mono').exists()).toBe(true)
  })
})

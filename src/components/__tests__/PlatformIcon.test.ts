import { describe, test, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PlatformIcon from '../PlatformIcon.vue'

describe('PlatformIcon', () => {
  test('renders an img for known platform', () => {
    const wrapper = mount(PlatformIcon, { props: { platformId: 'cursor' } })
    const img = wrapper.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('alt')).toBe('cursor')
  })

  test('renders fallback for unknown platform', () => {
    const wrapper = mount(PlatformIcon, { props: { platformId: 'unknown-platform' } })
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('.platform-fallback').exists()).toBe(true)
  })

  test('applies default size', () => {
    const wrapper = mount(PlatformIcon, { props: { platformId: 'cursor' } })
    const container = wrapper.find('.platform-icon')
    expect(container.attributes('style')).toContain('24px')
  })

  test('applies custom size', () => {
    const wrapper = mount(PlatformIcon, { props: { platformId: 'cursor', size: 32 } })
    const container = wrapper.find('.platform-icon')
    expect(container.attributes('style')).toContain('32px')
  })

  test('shows fallback on img error', async () => {
    const wrapper = mount(PlatformIcon, { props: { platformId: 'cursor' } })
    await wrapper.find('img').trigger('error')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('.platform-fallback').exists()).toBe(true)
  })

  test('fallback text for known platform', async () => {
    const wrapper = mount(PlatformIcon, { props: { platformId: 'cursor' } })
    await wrapper.find('img').trigger('error')
    expect(wrapper.find('.platform-fallback').text()).toBe('▮')
  })

  test('fallback text for unknown platform defaults to robot', () => {
    const wrapper = mount(PlatformIcon, { props: { platformId: 'nope' } })
    expect(wrapper.find('.platform-fallback').text()).toBe('🤖')
  })
})

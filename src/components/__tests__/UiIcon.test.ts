import { describe, expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import UiIcon from '../UiIcon.vue'

describe('UiIcon', () => {
  test('renders a named SVG icon without text fallback', () => {
    const wrapper = mount(UiIcon, { props: { name: 'folder', size: 18 } })

    expect(wrapper.find('svg').exists()).toBe(true)
    expect(wrapper.find('svg').attributes('width')).toBe('18')
    expect(wrapper.find('path').exists()).toBe(true)
    expect(wrapper.text()).toBe('')
  })

  test('supports status and category icons used by the interface', () => {
    for (const name of ['alert-triangle', 'lock', 'search', 'rocket'] as const) {
      const wrapper = mount(UiIcon, { props: { name } })
      expect(wrapper.find('svg').exists()).toBe(true)
    }
  })
})

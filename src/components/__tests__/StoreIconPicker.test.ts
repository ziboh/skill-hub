import { describe, expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import StoreIconPicker from '../StoreIconPicker.vue'

function createWrapper(modelValue = 'openai', library: 'providers' | 'platforms' | 'all' = 'providers') {
  return mount(StoreIconPicker, {
    props: { modelValue, library },
    global: {
      stubs: {
        ProviderIcon: { template: '<span class="provider-icon-stub" />' },
      },
    },
  })
}

describe('StoreIconPicker', () => {
  test('renders library icons as accessible selectable buttons', async () => {
    const wrapper = createWrapper()
    const tiles = wrapper.findAll('.sip-grid-item')

    expect(tiles.length).toBeGreaterThan(1)
    expect(tiles.every((tile) => tile.element.tagName === 'BUTTON')).toBe(true)
    expect(wrapper.find('.sip-grid-item[aria-pressed="true"]').attributes('title')).toBe('openai')

    const defaultTile = wrapper.find('.sip-grid-item[title="默认"]')
    await defaultTile.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([''])
  })

  test('keeps store source shortcuts out of the provider icon library', () => {
    const providers = createWrapper()
    const all = createWrapper('openai', 'all')

    expect(providers.find('.sip-grid-item[title="Git"]').exists()).toBe(false)
    expect(all.find('.sip-grid-item[title="Git"]').exists()).toBe(true)
  })

  test('includes provider icons in the platform icon library', () => {
    const platforms = createWrapper('openai', 'platforms')

    expect(platforms.find('.sip-grid-item[title="openai"]').exists()).toBe(true)
    expect(platforms.find('.sip-grid-item[title="Cursor"]').exists()).toBe(true)
  })
})

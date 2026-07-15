import { describe, test, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StoreHeader from '../StoreHeader.vue'

function createWrapper(props?: Record<string, unknown>) {
  return mount(StoreHeader, {
    props: {
      searchActive: false,
      resultCount: 0,
      totalCount: 12,
      sourceSubtitle: '社区技能市场',
      isCurrentStoreCustom: false,
      viewMode: 'grid',
      loading: false,
      isDarkMode: false,
      cacheEnabled: true,
      ...props,
    },
  })
}

describe('StoreHeader', () => {
  test('shows title and total count badge', () => {
    const wrapper = createWrapper()
    expect(wrapper.text()).toContain('Skill 商店')
    expect(wrapper.text()).toContain('12')
    expect(wrapper.text()).toContain('社区技能市场')
  })

  test('shows search result count when searchActive', () => {
    const wrapper = createWrapper({ searchActive: true, resultCount: 5 })
    expect(wrapper.text()).toContain('5 个结果')
  })

  test('emits refresh and add-store', async () => {
    const wrapper = createWrapper()
    await wrapper.find('[title="刷新"]').trigger('click')
    expect(wrapper.emitted('refresh')).toBeTruthy()
    await wrapper.find('.add-store-btn').trigger('click')
    expect(wrapper.emitted('add-store')).toBeTruthy()
  })

  test('shows edit button only for custom store', async () => {
    const noEdit = createWrapper({ isCurrentStoreCustom: false })
    expect(noEdit.find('.add-store-edit-btn').exists()).toBe(false)
    const withEdit = createWrapper({ isCurrentStoreCustom: true })
    expect(withEdit.find('.add-store-edit-btn').exists()).toBe(true)
    await withEdit.find('.add-store-edit-btn').trigger('click')
    expect(withEdit.emitted('edit-store')).toBeTruthy()
  })

  test('emits view-mode change', async () => {
    const wrapper = createWrapper({ viewMode: 'grid' })
    const buttons = wrapper.findAll('.view-toggle button')
    await buttons[1].trigger('click')
    expect(wrapper.emitted('update:viewMode')?.[0]).toEqual(['list'])
  })

  test('emits cache toggle', async () => {
    const wrapper = createWrapper({ cacheEnabled: true })
    await wrapper.find('[title="关闭商店缓存"]').trigger('click')
    expect(wrapper.emitted('toggle-cache')).toBeTruthy()
  })
})

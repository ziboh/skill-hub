import { describe, test, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StoreFilters from '../StoreFilters.vue'

function createWrapper(props?: Record<string, unknown>) {
  return mount(StoreFilters, {
    props: {
      sourceItems: [
        { id: 'claude', label: 'Claude' },
        { id: 'skills-sh', label: 'skills.sh' },
      ],
      activePresetId: 'claude',
      searchQuery: '',
      leaderboardFilter: 'all',
      filterTab: 'all',
      categoryCounts: { all: 3, dev: 2 },
      searchActive: false,
      getSourceIcon: () => undefined,
      ...props,
    },
    global: {
      stubs: {
        QuickSwitcher: {
          template:
            '<div class="qs-stub"><slot name="trigger-prefix" :item="{ id: \'claude\', label: \'Claude\' }" /><slot name="item-prefix" :item="{ id: \'claude\', label: \'Claude\' }" /></div>',
          props: ['items', 'selectedId', 'placeholder', 'addLabel', 'showAdd'],
          emits: ['select', 'add', 'delete'],
        },
        ProviderIcon: true,
      },
    },
  })
}

describe('StoreFilters', () => {
  test('renders category tabs for non-skills-sh store', () => {
    const wrapper = createWrapper({ activePresetId: 'claude' })
    expect(wrapper.find('.filter-tabs').exists()).toBe(true)
    expect(wrapper.text()).toContain('全部')
  })

  test('renders leaderboard tabs instead of category tabs for skills-sh', () => {
    const wrapper = createWrapper({ activePresetId: 'skills-sh', searchActive: false })
    const tabs = wrapper.findAll('.filter-tabs .tab-btn')

    expect(tabs.map((tab) => tab.text().trim())).toEqual(['全部', '趋势', '热门'])
    expect(wrapper.find('.tab-count').exists()).toBe(false)
  })

  test('emits update:searchQuery on input', async () => {
    const wrapper = createWrapper()
    const input = wrapper.find('.ss-search-input')
    await input.setValue('foo')
    expect(wrapper.emitted('update:searchQuery')?.[0]).toEqual(['foo'])
  })

  test('emits search on enter for skills-sh', async () => {
    const wrapper = createWrapper({ activePresetId: 'skills-sh', searchQuery: 'x' })
    await wrapper.find('.ss-search-input').trigger('keyup.enter')
    expect(wrapper.emitted('search')).toBeTruthy()
  })

  test('emits search on enter for non-skills-sh store', async () => {
    const wrapper = createWrapper({ activePresetId: 'claude', searchQuery: 'x' })
    await wrapper.find('.ss-search-input').trigger('keyup.enter')
    expect(wrapper.emitted('search')).toBeTruthy()
  })

  test('emits search when search button clicked', async () => {
    const wrapper = createWrapper({ activePresetId: 'claude', searchQuery: 'foo' })
    await wrapper.find('.ss-search-btn').trigger('click')
    expect(wrapper.emitted('search')).toBeTruthy()
  })

  test('emits clear-search when clear clicked', async () => {
    const wrapper = createWrapper({ searchQuery: 'abc' })
    await wrapper.find('.ss-search-clear').trigger('click')
    expect(wrapper.emitted('clear-search')).toBeTruthy()
  })
})

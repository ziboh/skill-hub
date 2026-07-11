import { describe, test, expect, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import QuickSwitcher from '../QuickSwitcher.vue'

const items = [
  { id: '1', label: 'Alpha', subtitle: 'First item' },
  { id: '2', label: 'Beta', subtitle: 'Second item' },
  { id: '3', label: 'Gamma', subtitle: 'Third item' },
]

function createWrapper(props: Record<string, any> = {}) {
  return mount(QuickSwitcher, {
    props: {
      items,
      selectedId: null,
      ...props,
    },
    attachTo: document.body,
  })
}

describe('QuickSwitcher', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  test('renders trigger with placeholder when no selection', () => {
    const wrapper = createWrapper()
    expect(wrapper.text()).toContain('选择...')
  })

  test('renders trigger with label when item selected', () => {
    const wrapper = createWrapper({ selectedId: '2' })
    expect(wrapper.text()).toContain('Beta')
  })

  test('render disabled state when items empty', () => {
    const wrapper = createWrapper({ items: [] })
    expect(wrapper.find('.qs-trigger').classes()).toContain('disabled')
  })

  test('clicking trigger opens panel', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.qs-trigger').trigger('click')
    await nextTick()
    expect(wrapper.find('.qs-panel').isVisible()).toBe(true)
  })

  test('clicking trigger again closes panel', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.qs-trigger').trigger('click')
    await nextTick()
    await wrapper.find('.qs-trigger').trigger('click')
    await nextTick()
    expect(wrapper.find('.qs-panel').isVisible()).toBe(false)
  })

  test('displays all items in list', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.qs-trigger').trigger('click')
    await nextTick()
    const listItems = wrapper.findAll('.qs-item')
    expect(listItems).toHaveLength(3)
  })

  test('filters items by search', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.qs-trigger').trigger('click')
    await nextTick()
    const input = wrapper.find('.qs-search')
    await input.setValue('beta')
    await nextTick()
    const visibleItems = wrapper.findAll('.qs-item').filter((el) => el.isVisible())
    expect(visibleItems).toHaveLength(1)
    expect(visibleItems[0].text()).toContain('Beta')
  })

  test('shows empty state when filter has no match', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.qs-trigger').trigger('click')
    await nextTick()
    const input = wrapper.find('.qs-search')
    await input.setValue('zzz')
    await nextTick()
    expect(wrapper.text()).toContain('未找到匹配项')
  })

  test('clicking an item emits select', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.qs-trigger').trigger('click')
    await nextTick()
    await wrapper.findAll('.qs-item')[1].trigger('click')
    expect(wrapper.emitted('select')).toHaveLength(1)
    expect(wrapper.emitted('select')![0]).toEqual(['2'])
  })

  test('pressing Enter on highlighted item emits select', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.qs-trigger').trigger('click')
    await nextTick()
    await wrapper.find('.qs-search').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('select')).toHaveLength(1)
    expect(wrapper.emitted('select')![0]).toEqual(['1'])
  })

  test('arrow keys move highlight', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.qs-trigger').trigger('click')
    await nextTick()
    const searchInput = wrapper.find('.qs-search')
    await searchInput.trigger('keydown', { key: 'ArrowDown' })
    await nextTick()
    const highlighted = wrapper.findAll('.qs-item.highlighted')
    expect(highlighted).toHaveLength(1)
    expect(highlighted[0].text()).toContain('Beta')
  })

  test('Escape closes panel', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.qs-trigger').trigger('click')
    await nextTick()
    await wrapper.find('.qs-search').trigger('keydown', { key: 'Escape' })
    await nextTick()
    expect(wrapper.find('.qs-panel').isVisible()).toBe(false)
  })

  test('shows add button when showAdd is true', async () => {
    const wrapper = createWrapper({ showAdd: true })
    await wrapper.find('.qs-trigger').trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('添加')
  })

  test('clicking add button emits add', async () => {
    const wrapper = createWrapper({ showAdd: true })
    await wrapper.find('.qs-trigger').trigger('click')
    await nextTick()
    await wrapper.find('.qs-add-item').trigger('click')
    expect(wrapper.emitted('add')).toHaveLength(1)
  })

  test('clicking delete button emits delete', async () => {
    const itemsWithDelete = [
      { id: '1', label: 'A', deletable: true },
      { id: '2', label: 'B', deletable: false },
    ]
    const wrapper = createWrapper({ items: itemsWithDelete })
    await wrapper.find('.qs-trigger').trigger('click')
    await nextTick()
    const deleteBtns = wrapper.findAll('.qs-item-delete')
    expect(deleteBtns).toHaveLength(1)
    await deleteBtns[0].trigger('click')
    expect(wrapper.emitted('delete')).toHaveLength(1)
    expect(wrapper.emitted('delete')![0]).toEqual(['1'])
  })
})

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import CleanupSelectModal from '../CleanupSelectModal.vue'

beforeEach(() => {
  vi.mocked(window.services.readFileText).mockReset()
  vi.mocked(window.services.pathJoin).mockImplementation((...parts: string[]) => parts.join('/'))
  vi.mocked(window.services.removeFile).mockReset()
})

function createWrapper(dirs: string[] = ['/skills/a', '/skills/b']) {
  return mount(CleanupSelectModal, {
    props: { dirs },
  })
}

describe('CleanupSelectModal', () => {
  test('renders all dirs as items', () => {
    const wrapper = createWrapper()
    const items = wrapper.findAll('.cleanup-item')
    expect(items).toHaveLength(2)
  })

  test('uses folder name as default name', () => {
    const wrapper = createWrapper()
    const text = wrapper.text()
    expect(text).toContain('a')
    expect(text).toContain('b')
  })

  test('reads SKILL.md for name when available', () => {
    vi.mocked(window.services.readFileText).mockReturnValue('name: MySkill\n')
    const wrapper = createWrapper(['/skills/myskill'])
    expect(wrapper.text()).toContain('MySkill')
  })

  test('falls back to folder name when readFileText throws', () => {
    vi.mocked(window.services.readFileText).mockImplementation(() => {
      throw new Error('not found')
    })
    const wrapper = createWrapper(['/skills/fallback-dir'])
    expect(wrapper.text()).toContain('fallback-dir')
  })

  test('no item selected initially', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.cleanup-btn.delete').attributes('disabled')).toBeDefined()
  })

  test('selecting an item enables delete button', async () => {
    const wrapper = createWrapper()
    await wrapper.findAll('.cleanup-checkbox')[0].trigger('change')
    expect(wrapper.find('.cleanup-btn.delete').attributes('disabled')).toBeUndefined()
  })

  test('select all / deselect all toggles', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.cleanup-select-all').trigger('click')
    expect(wrapper.findAll('.cleanup-item.checked')).toHaveLength(2)
    await wrapper.find('.cleanup-select-all').trigger('click')
    expect(wrapper.findAll('.cleanup-item.checked')).toHaveLength(0)
  })

  test('delete button count shows selected number', async () => {
    const wrapper = createWrapper(['/skills/a', '/skills/b', '/skills/c'])
    await wrapper.findAll('.cleanup-checkbox')[0].trigger('change')
    await wrapper.findAll('.cleanup-checkbox')[1].trigger('change')
    expect(wrapper.find('.cleanup-btn.delete').text()).toContain('2')
  })

  test('clicking delete emits deleted with count', async () => {
    const wrapper = createWrapper(['/skills/a', '/skills/b'])
    await wrapper.findAll('.cleanup-checkbox')[0].trigger('change')
    await wrapper.find('.cleanup-btn.delete').trigger('click')
    expect(wrapper.emitted('deleted')).toHaveLength(1)
    expect(wrapper.emitted('deleted')![0]).toEqual([1, 0])
  })

  test('delete calls removeFile for each selected', async () => {
    const gone = new Set<string>()
    vi.mocked(window.services.pathExists).mockImplementation((p: string) => !gone.has(p))
    vi.mocked(window.services.removeFile).mockImplementation((p: string) => {
      gone.add(p)
    })
    const wrapper = createWrapper(['/skills/a', '/skills/b', '/skills/c'])
    await wrapper.findAll('.cleanup-checkbox')[0].trigger('change')
    await wrapper.findAll('.cleanup-checkbox')[2].trigger('change')
    await wrapper.find('.cleanup-btn.delete').trigger('click')
    expect(window.services.removeFile).toHaveBeenCalledTimes(2)
    expect(window.services.removeFile).toHaveBeenCalledWith('/skills/a')
    expect(window.services.removeFile).toHaveBeenCalledWith('/skills/c')
  })

  test('emits failed count when a selected path cannot be removed', async () => {
    vi.mocked(window.services.pathExists).mockReturnValue(true)
    const wrapper = createWrapper(['/skills/blocked'])
    await wrapper.find('.cleanup-checkbox').trigger('change')
    await wrapper.find('.cleanup-btn.delete').trigger('click')
    expect(wrapper.emitted('deleted')![0]).toEqual([0, 1])
  })

  test('cancel button emits close', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.cleanup-btn.cancel').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  test('点击遮罩不会关闭弹窗', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.cleanup-overlay').trigger('click')
    expect(wrapper.emitted('close')).toBeUndefined()
  })
})

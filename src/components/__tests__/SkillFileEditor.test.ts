import { describe, test, expect, vi, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import {} from 'vue'
import SkillFileEditor from '../SkillFileEditor.vue'
import { KeyShowToast } from '../../inject-keys'

vi.mock('../SkillCodeEditor.vue', () => ({
  default: {
    name: 'SkillCodeEditor',
    props: ['modelValue', 'language', 'readonly'],
    template:
      '<div class="mock-editor"><textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"></textarea></div>',
  },
}))

describe('SkillFileEditor', () => {
  let wrapper: VueWrapper

  afterEach(() => {
    wrapper?.unmount()
    vi.clearAllMocks()
  })

  function mountEditor(skillDir = '', provides: Record<string, any> = {}) {
    return mount(SkillFileEditor, {
      props: { skillDir },
      global: {
        provide: {
          [KeyShowToast as symbol]: vi.fn(),
          ...provides,
        },
      },
      attachTo: document.body,
    })
  }

  test('renders file editor container', () => {
    wrapper = mountEditor('/some/dir')
    expect(wrapper.find('.file-editor').exists()).toBe(true)
  })

  test('shows tree header with title', () => {
    wrapper = mountEditor('/some/dir')
    expect(wrapper.find('.tree-title').text()).toBe('文件')
  })

  test('shows tree action buttons', () => {
    wrapper = mountEditor('/some/dir')
    const btns = wrapper.findAll('.tree-btn')
    expect(btns.length).toBe(3)
  })

  test('shows empty state when no files after load', async () => {
    window.services.readDir = vi.fn(() => [])
    window.services.pathJoin = vi.fn((...p: string[]) => p.join('/'))
    wrapper = mountEditor('/some/dir')
    await wrapper.vm.$nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(wrapper.find('.tree-empty').exists()).toBe(true)
    expect(wrapper.find('.tree-empty').text()).toContain('暂无文件')
  })

  test('shows file tree with items', async () => {
    window.services.readDir = vi.fn(() => [{ name: 'SKILL.md', path: '/some/dir/SKILL.md', isDirectory: false }])
    window.services.pathJoin = vi.fn((...p: string[]) => p.join('/'))
    window.services.stat = vi.fn(() => ({ isDirectory: () => false }))
    window.services.readFile = vi.fn(() => '# Test content')
    wrapper = mountEditor('/some/dir')
    await wrapper.vm.$nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(wrapper.find('.tree-item.file').exists()).toBe(true)
    expect(wrapper.find('.item-name').text()).toContain('SKILL.md')
  })

  test('shows directory items with expand toggle', async () => {
    window.services.readDir = vi.fn((path: string) => {
      if (path === '/some/dir') return [{ name: 'subdir', path: '/some/dir/subdir', isDirectory: true }]
      return []
    })
    window.services.pathJoin = vi.fn((...p: string[]) => p.join('/'))
    wrapper = mountEditor('/some/dir')
    await wrapper.vm.$nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(wrapper.find('.tree-item.directory').exists()).toBe(true)
  })

  test('selecting a file shows editor header with file name', async () => {
    window.services.readDir = vi.fn(() => [{ name: 'SKILL.md', path: '/some/dir/SKILL.md', isDirectory: false }])
    window.services.pathJoin = vi.fn((...p: string[]) => p.join('/'))
    window.services.stat = vi.fn(() => ({ isDirectory: () => false }))
    window.services.readFile = vi.fn(() => '# Test content')
    wrapper = mountEditor('/some/dir')
    await wrapper.vm.$nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await wrapper.find('.tree-item.file').trigger('click')
    expect(wrapper.find('.editor-file-name').exists()).toBe(true)
    expect(wrapper.find('.editor-file-name').text()).toContain('SKILL.md')
  })

  test('shows empty editor when no file selected', () => {
    window.services.readDir = vi.fn(() => [])
    wrapper = mountEditor('/some/dir')
    expect(wrapper.find('.editor-empty').exists()).toBe(true)
    expect(wrapper.find('.editor-empty').text()).toContain('选择一个文件进行编辑')
  })

  test('status bar shown when file selected', async () => {
    window.services.readDir = vi.fn(() => [{ name: 'SKILL.md', path: '/some/dir/SKILL.md', isDirectory: false }])
    window.services.pathJoin = vi.fn((...p: string[]) => p.join('/'))
    window.services.stat = vi.fn(() => ({ isDirectory: () => false }))
    window.services.readFile = vi.fn(() => '# Test content')
    wrapper = mountEditor('/some/dir')
    await wrapper.vm.$nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await wrapper.find('.tree-item.file').trigger('click')
    expect(wrapper.find('.status-bar').exists()).toBe(true)
    expect(wrapper.find('.status-path').text()).toContain('SKILL.md')
  })

  test('new file dialog opens and closes', async () => {
    window.services.readDir = vi.fn(() => [])
    wrapper = mountEditor('/some/dir')
    await wrapper.findAll('.tree-btn')[1].trigger('click')
    expect(wrapper.find('.dialog-overlay').exists()).toBe(true)
    expect(wrapper.find('.dialog h3').text()).toBe('新建文件')
    await wrapper.find('.dialog-btn.cancel').trigger('click')
    expect(wrapper.find('.dialog-overlay').exists()).toBe(false)
  })

  test('new folder dialog opens and closes', async () => {
    window.services.readDir = vi.fn(() => [])
    wrapper = mountEditor('/some/dir')
    await wrapper.findAll('.tree-btn')[2].trigger('click')
    expect(wrapper.find('.dialog-overlay').exists()).toBe(true)
    expect(wrapper.find('.dialog h3').text()).toBe('新建文件夹')
    await wrapper.find('.dialog-btn.cancel').trigger('click')
  })

  test('create button disabled when input empty', async () => {
    window.services.readDir = vi.fn(() => [])
    wrapper = mountEditor('/some/dir')
    await wrapper.findAll('.tree-btn')[1].trigger('click')
    const createBtn = wrapper.find('.dialog-btn.primary')
    expect(createBtn.attributes('disabled')).toBeDefined()
  })

  test('create button enabled with input', async () => {
    window.services.readDir = vi.fn(() => [])
    wrapper = mountEditor('/some/dir')
    await wrapper.findAll('.tree-btn')[1].trigger('click')
    const input = wrapper.find('.dialog-input')
    await input.setValue('test.md')
    const createBtn = wrapper.find('.dialog-btn.primary')
    expect(createBtn.attributes('disabled')).toBeUndefined()
  })

  test('shows readonly message for binary files', async () => {
    window.services.readDir = vi.fn(() => [{ name: 'image.png', path: '/some/dir/image.png', isDirectory: false }])
    window.services.pathJoin = vi.fn((...p: string[]) => p.join('/'))
    window.services.stat = vi.fn(() => ({ isDirectory: () => false }))
    window.services.readFile = vi.fn(() => '')
    wrapper = mountEditor('/some/dir')
    await wrapper.vm.$nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await wrapper.find('.tree-item.file').trigger('click')
    expect(wrapper.find('.editor-readonly').exists()).toBe(true)
    expect(wrapper.find('.editor-readonly').text()).toContain('此文件类型不支持编辑')
  })
})

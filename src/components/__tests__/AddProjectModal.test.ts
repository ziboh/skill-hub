import { describe, test, expect, vi, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import AddProjectModal from '../AddProjectModal.vue'
import type { RegisteredProject } from '../../types'
import { KeyShowToast } from '../../inject-keys'

describe('AddProjectModal', () => {
  let wrapper: VueWrapper

  afterEach(() => {
    wrapper?.unmount()
  })

  test('renders add mode title', () => {
    wrapper = mount(AddProjectModal)
    expect(wrapper.find('.modal-title').text()).toBe('添加项目')
  })

  test('renders edit mode title when project prop given', () => {
    const project: RegisteredProject = { id: 'p1', name: 'My Project', rootDir: '/path', scanPaths: [] }
    wrapper = mount(AddProjectModal, { props: { project } })
    expect(wrapper.find('.modal-title').text()).toBe('编辑项目')
  })

  test('fills rootDir and name in edit mode', () => {
    const project: RegisteredProject = { id: 'p1', name: 'MyName', rootDir: '/path/to/proj', scanPaths: ['/extra'] }
    wrapper = mount(AddProjectModal, { props: { project } })
    const inputs = wrapper.findAll('input[type="text"]')
    expect((inputs[0].element as HTMLInputElement).value).toBe('/path/to/proj')
    expect((inputs[1].element as HTMLInputElement).value).toBe('MyName')
  })

  test('submit button is disabled when fields empty', () => {
    wrapper = mount(AddProjectModal)
    expect(wrapper.find('.btn-primary').attributes('disabled')).toBeDefined()
  })

  test('submit enabled when rootDir and projectName filled', async () => {
    wrapper = mount(AddProjectModal)
    const inputs = wrapper.findAll('input[type="text"]')
    await inputs[0].setValue('/my/project')
    await inputs[1].setValue('My Project')
    expect(wrapper.find('.btn-primary').attributes('disabled')).toBeUndefined()
  })

  test('clicking submit emits submit with form data', async () => {
    wrapper = mount(AddProjectModal)
    const inputs = wrapper.findAll('input[type="text"]')
    await inputs[0].setValue('/my/project')
    await inputs[1].setValue('My Project')
    await wrapper.find('.btn-primary').trigger('click')
    expect(wrapper.emitted('submit')).toHaveLength(1)
    expect(wrapper.emitted('submit')![0][0]).toEqual({
      name: 'My Project',
      rootDir: '/my/project',
      scanPaths: [],
    })
  })

  test('submit includes id in edit mode', async () => {
    const project: RegisteredProject = { id: 'p-123', name: 'Old', rootDir: '/old', scanPaths: [] }
    wrapper = mount(AddProjectModal, { props: { project } })
    const inputs = wrapper.findAll('input[type="text"]')
    await inputs[1].setValue('Updated')
    await wrapper.find('.btn-primary').trigger('click')
    expect(wrapper.emitted('submit')![0][0]).toMatchObject({
      id: 'p-123',
      name: 'Updated',
      rootDir: '/old',
    })
  })

  test('displays submitError prop', () => {
    const showToast = vi.fn()
    wrapper = mount(AddProjectModal, {
      props: { submitError: 'Already exists' },
      global: { provide: { [KeyShowToast as symbol]: showToast } },
    })
    expect(showToast).toHaveBeenCalledWith({ type: 'error', message: 'Already exists' })
  })

  test('点击遮罩不会关闭弹窗', async () => {
    wrapper = mount(AddProjectModal)
    await wrapper.find('.modal-overlay').trigger('click')
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  test('close button emits close', async () => {
    wrapper = mount(AddProjectModal)
    await wrapper.find('.modal-close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  test('cancel button emits close', async () => {
    wrapper = mount(AddProjectModal)
    await wrapper.find('.btn-cancel').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  test('root dir is readonly in edit mode', () => {
    const project: RegisteredProject = { id: 'p1', name: 'P', rootDir: '/path', scanPaths: [] }
    wrapper = mount(AddProjectModal, { props: { project } })
    const inputs = wrapper.findAll('input[type="text"]')
    expect(inputs[0].attributes('readonly')).toBeDefined()
  })

  test('add scan path to list', async () => {
    wrapper = mount(AddProjectModal)
    const inputs = wrapper.findAll('input[type="text"]')
    await inputs[2].setValue('/extra/path')
    await wrapper.find('.btn-secondary').trigger('click')
    expect(wrapper.findAll('.scan-path-item')).toHaveLength(1)
    expect(wrapper.find('.scan-path-text').text()).toBe('/extra/path')
  })

  test('remove scan path from list', async () => {
    wrapper = mount(AddProjectModal)
    const inputs = wrapper.findAll('input[type="text"]')
    await inputs[2].setValue('/extra/path')
    await wrapper.find('.btn-secondary').trigger('click')
    await wrapper.find('.scan-path-remove').trigger('click')
    expect(wrapper.findAll('.scan-path-item')).toHaveLength(0)
  })

  test('shows subtle hint when no scan paths', () => {
    wrapper = mount(AddProjectModal)
    expect(wrapper.text()).toContain('暂无额外扫描路径')
  })

  test('selectFolder with available dialog sets rootDir', async () => {
    vi.mocked(window.ztools.showOpenDialog).mockReturnValue(['/selected/path'])
    wrapper = mount(AddProjectModal)
    await wrapper.find('.btn-browse').trigger('click')
    const inputs = wrapper.findAll('input[type="text"]')
    expect((inputs[0].element as HTMLInputElement).value).toBe('/selected/path')
  })

  test('selectFolder fills project name from folder name', async () => {
    vi.mocked(window.ztools.showOpenDialog).mockReturnValue(['/some/deep/folder-name'])
    wrapper = mount(AddProjectModal)
    await wrapper.find('.btn-browse').trigger('click')
    const inputs = wrapper.findAll('input[type="text"]')
    expect((inputs[1].element as HTMLInputElement).value).toBe('folder-name')
  })

  test('selectFolder dialog not available shows error', async () => {
    const showToast = vi.fn()
    const orig = window.ztools.showOpenDialog
    ;(window.ztools as any).showOpenDialog = undefined
    wrapper = mount(AddProjectModal, {
      global: { provide: { [KeyShowToast as symbol]: showToast } },
    })
    await wrapper.find('.btn-browse').trigger('click')
    expect(showToast).toHaveBeenCalledWith({ type: 'error', message: '文件选择对话框不可用，请手动输入路径。' })
    ;(window.ztools as any).showOpenDialog = orig
  })

  test('selectFolder for scan path adds to list', async () => {
    vi.mocked(window.ztools.showOpenDialog).mockReturnValue(['/scan/path'])
    wrapper = mount(AddProjectModal)
    const browseBtns = wrapper.findAll('.btn-browse')
    await browseBtns[1].trigger('click')
    expect(wrapper.find('.scan-path-text').text()).toBe('/scan/path')
  })

  test('shows scan paths from project in edit mode', () => {
    const project: RegisteredProject = { id: 'p1', name: 'P', rootDir: '/r', scanPaths: ['/sp1', '/sp2'] }
    wrapper = mount(AddProjectModal, { props: { project } })
    const items = wrapper.findAll('.scan-path-item')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('/sp1')
  })
})

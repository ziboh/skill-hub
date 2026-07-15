import { describe, test, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ConfirmModal from '../ConfirmModal.vue'

function createWrapper(props: Record<string, any> = {}) {
  return mount(ConfirmModal, {
    props: {
      message: '确定要删除吗？',
      ...props,
    },
  })
}

describe('ConfirmModal', () => {
  test('renders message', () => {
    const wrapper = createWrapper()
    expect(wrapper.text()).toContain('确定要删除吗？')
  })

  test('renders default title and confirm text', () => {
    const wrapper = createWrapper()
    expect(wrapper.text()).toContain('确认删除')
    expect(wrapper.text()).toContain('删除')
  })

  test('renders custom title and confirm text', () => {
    const wrapper = createWrapper({ title: '警告', confirmText: '继续' })
    expect(wrapper.text()).toContain('警告')
    expect(wrapper.text()).toContain('继续')
  })

  test('emits cancel on close button click', () => {
    const wrapper = createWrapper()
    wrapper.find('.confirm-close').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  test('点击遮罩不会取消弹窗', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.confirm-overlay').trigger('click')
    expect(wrapper.emitted('cancel')).toBeUndefined()
  })

  test('does not emit cancel on modal click', () => {
    const wrapper = createWrapper()
    wrapper.find('.confirm-modal').trigger('click')
    expect(wrapper.emitted('cancel')).toBeUndefined()
  })

  test('emits confirm on delete button click', () => {
    const wrapper = createWrapper()
    wrapper.find('.confirm-btn.delete').trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })

  test('emits cancel on cancel button click', () => {
    const wrapper = createWrapper()
    wrapper.find('.confirm-btn.cancel').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  test('renders message as HTML', () => {
    const wrapper = createWrapper({ message: '删除 <strong>test</strong>？' })
    expect(wrapper.html()).toContain('<strong>test</strong>')
  })

  test('escapes untrusted markup while preserving strong text', () => {
    const wrapper = createWrapper({ message: '删除 <strong>test</strong><img src=x onerror=alert(1)>？' })
    expect(wrapper.html()).toContain('<strong>test</strong>')
    expect(wrapper.html()).not.toContain('<img')
    expect(wrapper.html()).toContain('&lt;img')
  })
})

import { describe, test, expect, beforeEach, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import StoreConfigModal from '../StoreConfigModal.vue'
import type { StoreSource } from '../../types'

vi.mock('../../utils/validate-store', () => ({
  validateStoreUrl: vi.fn().mockResolvedValue({ valid: true, message: '验证通过' }),
}))

const sampleSource: StoreSource = {
  id: 'src-1',
  type: 'well-known-index',
  name: 'Test Store',
  url: 'https://example.com/.well-known/skills/index.json',
  branch: undefined,
  directory: undefined,
  icon: undefined,
  enabled: true,
}

function createWrapper(props?: Record<string, unknown>) {
  return mount(StoreConfigModal, { props: props || {} })
}

describe('StoreConfigModal', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('renders with "添加商店" title when no editSource', () => {
    const wrapper = createWrapper()
    expect(wrapper.text()).toContain('添加商店')
  })

  test('renders with "编辑商店" title when editSource provided', () => {
    const wrapper = createWrapper({ editSource: sampleSource })
    expect(wrapper.text()).toContain('编辑商店')
  })

  test('shows four type options', () => {
    const wrapper = createWrapper()
    const typeCards = wrapper.findAll('.type-card')
    expect(typeCards.length).toBe(4)
  })

  test('default type is git-repo', () => {
    const wrapper = createWrapper()
    const activeCard = wrapper.find('.type-card.active')
    expect(activeCard.text()).toContain('Git 仓库')
  })

  test('switching type changes active card', async () => {
    const wrapper = createWrapper()
    const typeCards = wrapper.findAll('.type-card')
    await typeCards[1].trigger('click')
    expect(wrapper.find('.type-card.active').text()).toContain('Well-Known Index')
  })

  test('git-repo type shows branch and directory fields', () => {
    const wrapper = createWrapper()
    const branchInput = wrapper.find('input[placeholder="分支（可选）"]')
    const dirInput = wrapper.find('input[placeholder="目录（可选）"]')
    expect(branchInput.exists()).toBe(true)
    expect(dirInput.exists()).toBe(true)
  })

  test('local-dir type hides branch/directory fields', async () => {
    const wrapper = createWrapper()
    await wrapper.findAll('.type-card')[3].trigger('click')
    expect(wrapper.find('input[placeholder="分支（可选）"]').exists()).toBe(false)
  })

  test('save button disabled when name empty', () => {
    const wrapper = createWrapper()
    const saveBtn = wrapper.find('.modal-btn.save')
    expect(saveBtn.attributes('disabled')).toBeDefined()
  })

  test('save button disabled when URL empty', async () => {
    const wrapper = createWrapper()
    await wrapper.find('input[placeholder="商店名称"]').setValue('My Store')
    const saveBtn = wrapper.find('.modal-btn.save')
    expect(saveBtn.attributes('disabled')).toBeDefined()
  })

  test('save button enabled when name and URL filled', async () => {
    const wrapper = createWrapper()
    await wrapper.find('input[placeholder="商店名称"]').setValue('My Store')
    await wrapper.find('input[placeholder*="URL"]').setValue('https://example.com')
    const saveBtn = wrapper.find('.modal-btn.save')
    expect(saveBtn.attributes('disabled')).toBeUndefined()
  })

  test('click save emits saved and close', async () => {
    const wrapper = createWrapper()
    await wrapper.find('input[placeholder="商店名称"]').setValue('My Store')
    await wrapper.find('input[placeholder*="URL"]').setValue('https://example.com')
    await wrapper.find('.modal-btn.save').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('saved')).toBeTruthy()
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  test('点击遮罩不会关闭弹窗', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.store-config-overlay').trigger('click')
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  test('edit mode pre-fills fields', () => {
    const wrapper = createWrapper({ editSource: sampleSource })
    const nameInput = wrapper.find('input[placeholder="商店名称"]')
    const urlInput = wrapper.find('input[placeholder*="URL"]')
    expect((nameInput.element as HTMLInputElement).value).toBe('Test Store')
    expect((urlInput.element as HTMLInputElement).value).toBe('https://example.com/.well-known/skills/index.json')
  })

  test('edit mode disables type selection', () => {
    const wrapper = createWrapper({ editSource: sampleSource })
    const typeCards = wrapper.findAll('.type-card')
    typeCards.forEach((card) => {
      expect(card.attributes('disabled')).toBeDefined()
    })
  })

  test('shows a compact icon trigger instead of embedding the full icon library', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.icon-picker-trigger').exists()).toBe(true)
    expect(wrapper.find('.icon-picker-modal').exists()).toBe(false)
  })

  test('opens the icon picker in a separate modal', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.icon-picker-trigger').trigger('click')
    expect(wrapper.find('.icon-picker-modal').exists()).toBe(true)
    expect(wrapper.find('.icon-picker-modal .store-icon-picker').exists()).toBe(true)
    expect(wrapper.find('.icon-picker-modal .icon-picker-modal-close').exists()).toBe(true)
    expect(wrapper.find('.icon-picker-modal .icon-picker-modal-footer').exists()).toBe(true)
    expect(wrapper.find('.icon-picker-modal .icon-picker-modal-done').text()).toBe('完成')

    await wrapper.find('.icon-picker-modal .sip-grid-item[title="openai"]').trigger('click')
    expect(wrapper.find('.icon-picker-modal').exists()).toBe(true)
    await wrapper.find('.icon-picker-modal .icon-picker-modal-done').trigger('click')
    expect(wrapper.find('.icon-picker-modal').exists()).toBe(false)
  })
})

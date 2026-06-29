import { describe, test, expect, vi, afterEach, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import AppToast from '../AppToast.vue'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

async function createWrapper() {
  const wrapper = mount(AppToast, {
    attachTo: document.body,
  })
  await nextTick()
  return wrapper
}

function toastEls() {
  return document.querySelectorAll('.toast-item')
}

describe('AppToast', () => {
  test('starts with no toasts', async () => {
    await createWrapper()
    expect(toastEls()).toHaveLength(0)
  })

  test('showToast adds a toast', async () => {
    const wrapper = await createWrapper()
    ;(wrapper.vm as any).showToast('Hello')
    await nextTick()
    expect(toastEls()).toHaveLength(1)
    expect(document.body.textContent).toContain('Hello')
  })

  test('showToast defaults to success type', async () => {
    const wrapper = await createWrapper()
    ;(wrapper.vm as any).showToast('OK')
    await nextTick()
    expect(toastEls()[0].classList).toContain('toast-success')
  })

  test('showToast accepts custom type', async () => {
    const wrapper = await createWrapper()
    ;(wrapper.vm as any).showToast('Error!', 'error')
    await nextTick()
    expect(toastEls()[0].classList).toContain('toast-error')
    ;(wrapper.vm as any).showToast('Info', 'info')
    await nextTick()
    expect(toastEls()[1].classList).toContain('toast-info')
    ;(wrapper.vm as any).showToast('Warning', 'warning')
    await nextTick()
    expect(toastEls()[2].classList).toContain('toast-warning')
  })

  test('multiple toasts are rendered', async () => {
    const wrapper = await createWrapper()
    ;(wrapper.vm as any).showToast('First')
    ;(wrapper.vm as any).showToast('Second')
    ;(wrapper.vm as any).showToast('Third')
    await nextTick()
    expect(toastEls()).toHaveLength(3)
  })

  test('closeToast removes a toast', async () => {
    const wrapper = await createWrapper()
    ;(wrapper.vm as any).showToast('Temp')
    await nextTick()
    expect(toastEls()).toHaveLength(1)
    ;(document.querySelector('.toast-close') as HTMLElement)?.click()
    await nextTick()
    expect(toastEls()[0].classList).toContain('toast-leaving')
    vi.advanceTimersByTime(200)
    await nextTick()
    expect(toastEls()).toHaveLength(0)
  })

  test('auto-dismiss after 3 seconds', async () => {
    const wrapper = await createWrapper()
    ;(wrapper.vm as any).showToast('Auto')
    await nextTick()
    expect(toastEls()).toHaveLength(1)
    vi.advanceTimersByTime(3000)
    await nextTick()
    expect(toastEls()[0].classList).toContain('toast-leaving')
    vi.advanceTimersByTime(200)
    await nextTick()
    expect(toastEls()).toHaveLength(0)
  })

  test('expanding message pauses auto-dismiss', async () => {
    const wrapper = await createWrapper()
    ;(wrapper.vm as any).showToast('Long message that can be expanded')
    await nextTick()
    vi.advanceTimersByTime(1000)
    ;(document.querySelector('.toast-message') as HTMLElement)?.click()
    await nextTick()
    vi.advanceTimersByTime(5000)
    await nextTick()
    expect(toastEls()).toHaveLength(1)
  })
})

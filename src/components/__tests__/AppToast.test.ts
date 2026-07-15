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

  test('showToast adds a notification toast by default', async () => {
    const wrapper = await createWrapper()
    ;(wrapper.vm as any).showToast('Hello')
    await nextTick()
    expect(toastEls()).toHaveLength(1)
    expect(document.body.textContent).toContain('Hello')
    expect(toastEls()[0].classList).toContain('toast-notification')
    expect(document.body.textContent).not.toContain('通知')
  })

  test('showToast accepts the structured notification options', async () => {
    const wrapper = await createWrapper()
    ;(wrapper.vm as any).showToast({
      type: 'warning',
      title: '请注意',
      message: '配置尚未保存',
      duration: 7000,
    })
    await nextTick()
    expect(toastEls()[0].classList).toContain('toast-warning')
    expect(document.body.textContent).toContain('请注意')
    expect(document.body.textContent).toContain('配置尚未保存')

    vi.advanceTimersByTime(6999)
    await nextTick()
    expect(toastEls()).toHaveLength(1)
    vi.advanceTimersByTime(1)
    await nextTick()
    expect(toastEls()[0].classList).toContain('toast-leaving')
  })

  test('does not add generic titles by default', async () => {
    const wrapper = await createWrapper()
    ;(wrapper.vm as any).showToast('Saved', 'success')
    ;(wrapper.vm as any).showToast('Heads up', 'warning')
    ;(wrapper.vm as any).showToast('Failed', 'error')
    await nextTick()

    const text = document.body.textContent || ''
    expect(text).not.toContain('操作成功')
    expect(text).not.toContain('注意')
    expect(text).not.toContain('操作失败')
  })

  test('renders an explicit custom title', async () => {
    const wrapper = await createWrapper()
    ;(wrapper.vm as any).showToast({
      title: '同步状态',
      message: '技能同步完成',
      duration: 0,
    })
    await nextTick()

    expect(document.body.textContent).toContain('同步状态')
    expect(document.body.textContent).toContain('技能同步完成')
  })

  test('maps the legacy info type to notification', async () => {
    const wrapper = await createWrapper()
    ;(wrapper.vm as any).showToast('Info', 'info')
    await nextTick()
    expect(toastEls()[0].classList).toContain('toast-notification')
    expect(toastEls()[0].classList).not.toContain('toast-info')
  })

  test('uses longer defaults for warning and error toasts', async () => {
    const wrapper = await createWrapper()
    ;(wrapper.vm as any).showToast('Warning', 'warning')
    ;(wrapper.vm as any).showToast('Error', 'error')
    await nextTick()

    vi.advanceTimersByTime(3000)
    await nextTick()
    expect(toastEls()[0].classList).not.toContain('toast-leaving')
    expect(toastEls()[1].classList).not.toContain('toast-leaving')

    vi.advanceTimersByTime(2000)
    await nextTick()
    expect(toastEls()[0].classList).toContain('toast-leaving')
    expect(toastEls()[1].classList).not.toContain('toast-leaving')
  })

  test('duration less than or equal to zero disables auto-dismiss', async () => {
    const wrapper = await createWrapper()
    ;(wrapper.vm as any).showToast({ message: 'Persistent', duration: 0 })
    await nextTick()
    vi.advanceTimersByTime(10000)
    await nextTick()
    expect(toastEls()).toHaveLength(1)
    expect(toastEls()[0].classList).not.toContain('toast-leaving')
  })

  test('supports an action and closes after the action is clicked', async () => {
    const wrapper = await createWrapper()
    const onClick = vi.fn()
    ;(wrapper.vm as any).showToast({
      type: 'error',
      message: '同步失败',
      action: { label: '重试', onClick },
    })
    await nextTick()

    const action = document.querySelector('.toast-action') as HTMLElement
    expect(action).not.toBeNull()
    expect(action.textContent).toContain('重试')
    action.click()
    await nextTick()
    expect(onClick).toHaveBeenCalledOnce()
    expect(toastEls()[0].classList).toContain('toast-leaving')
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

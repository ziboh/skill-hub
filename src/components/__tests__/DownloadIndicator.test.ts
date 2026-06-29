import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { mount, VueWrapper } from '@vue/test-utils'
import DownloadIndicator from '../DownloadIndicator.vue'
import { useDownloadQueue } from '../../composables/useDownloadQueue'

describe('DownloadIndicator', () => {
  let queue: ReturnType<typeof useDownloadQueue>
  let wrapper: VueWrapper

  beforeEach(() => {
    queue = useDownloadQueue()
    queue.isExpanded.value = false
  })

  afterEach(() => {
    wrapper?.unmount()
    queue.queue.value = []
    document.body.innerHTML = ''
  })

  test('does not render when queue is empty', () => {
    wrapper = mount(DownloadIndicator)
    expect(document.querySelector('.download-indicator')).toBeNull()
  })

  test('renders when item exists', async () => {
    queue.addDownload('skill-1', 'Test Skill')
    wrapper = mount(DownloadIndicator)
    await nextTick()
    expect(document.querySelector('.download-indicator')).not.toBeNull()
  })

  test('shows active count', async () => {
    queue.addDownload('skill-1', 'Skill A')
    queue.addDownload('skill-2', 'Skill B')
    wrapper = mount(DownloadIndicator)
    await nextTick()
    expect(document.querySelector('.download-indicator')!.textContent).toContain('2')
    expect(document.querySelector('.download-indicator')!.textContent).toContain('分发中')
  })

  test('shows "已完成" when no active downloads', async () => {
    const item = queue.addDownload('skill-1', 'Skill A')
    queue.updateItem(item.id, { status: 'success' })
    wrapper = mount(DownloadIndicator)
    await nextTick()
    expect(document.querySelector('.download-indicator')!.textContent).toContain('已完成')
  })

  test('toggle expands and collapses', async () => {
    queue.addDownload('skill-1', 'Test Skill')
    wrapper = mount(DownloadIndicator)
    await nextTick()

    const toggle = document.querySelector('.di-toggle') as HTMLElement
    toggle.click()
    await nextTick()
    expect(document.querySelector('.download-indicator')!.classList.contains('expanded')).toBe(true)
    expect(document.querySelector('.di-list')).not.toBeNull()

    toggle.click()
    await nextTick()
    expect(document.querySelector('.download-indicator')!.classList.contains('expanded')).toBe(false)
  })

  test('displays download item in list', async () => {
    queue.addDownload('skill-1', 'My Skill')
    wrapper = mount(DownloadIndicator)
    await nextTick()
    queue.isExpanded.value = true
    await nextTick()
    const items = document.querySelectorAll('.di-item')
    expect(items).toHaveLength(1)
    expect(items[0].textContent).toContain('My Skill')
  })

  test('hides install items from list', async () => {
    queue.addDownload('dl-1', 'Download Skill')
    queue.addInstall('inst-1', 'Install Skill', ['cursor'])
    wrapper = mount(DownloadIndicator)
    await nextTick()
    queue.isExpanded.value = true
    await nextTick()
    const items = document.querySelectorAll('.di-item')
    expect(items).toHaveLength(1)
    expect(items[0].textContent).toContain('Download Skill')
  })

  test('shows error indicator for failed item', async () => {
    const item = queue.addDownload('skill-1', 'Fail Skill')
    queue.updateItem(item.id, { status: 'error', error: 'Connection failed' })
    wrapper = mount(DownloadIndicator)
    await nextTick()
    queue.isExpanded.value = true
    await nextTick()
    expect(document.querySelector('.di-item-error')).not.toBeNull()
    expect(document.querySelector('.di-item-error')!.getAttribute('title')).toBe('Connection failed')
  })

  test('clear button appears when completed items exist', async () => {
    const item1 = queue.addDownload('skill-1', 'Done')
    queue.updateItem(item1.id, { status: 'success' })
    queue.addDownload('skill-2', 'Running')
    wrapper = mount(DownloadIndicator)
    await nextTick()
    queue.isExpanded.value = true
    await nextTick()
    expect(document.querySelector('.di-clear')).not.toBeNull()
  })

  test('clear button not shown when only running items', async () => {
    queue.addDownload('skill-1', 'Running')
    wrapper = mount(DownloadIndicator)
    await nextTick()
    queue.isExpanded.value = true
    await nextTick()
    expect(document.querySelector('.di-clear')).toBeNull()
  })

  test('clearCompleted removes done items', async () => {
    const item1 = queue.addDownload('skill-1', 'Done')
    queue.updateItem(item1.id, { status: 'success' })
    const item2 = queue.addDownload('skill-2', 'Running')
    wrapper = mount(DownloadIndicator)
    await nextTick()
    queue.isExpanded.value = true
    await nextTick()
    ;(document.querySelector('.di-clear') as HTMLElement).click()
    expect(queue.queue.value).toHaveLength(1)
    expect(queue.queue.value[0].id).toBe(item2.id)
  })
})

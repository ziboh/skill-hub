import { afterEach, describe, expect, test } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import DataManagement from '../DataManagement.vue'
import { resetStorageCaches } from '../../../utils/storage'

let wrapper: VueWrapper | null = null

function mountDataManagement() {
  wrapper = mount(DataManagement, {
    global: {
      stubs: {
        Teleport: true,
      },
    },
  })
  return wrapper
}

async function openBucket(label: string) {
  const row = wrapper!.findAll('.setting-row').find((item) => item.text().includes(label))
  expect(row, `未找到数据集：${label}`).toBeDefined()
  await row!.find('button').trigger('click')
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('数据管理查看弹窗', () => {
  test('JSON 数据使用可聚焦的滚动区域展示', async () => {
    mountDataManagement()
    await openBucket('应用设置')

    const scrollSurface = wrapper!.find('.dm-json-scroll')
    expect(scrollSurface.exists()).toBe(true)
    expect(scrollSurface.attributes('role')).toBe('region')
    expect(scrollSurface.attributes('tabindex')).toBe('0')
    expect(scrollSurface.attributes('aria-label')).toBe('应用设置数据')
  })

  test('键值数据使用可聚焦的滚动区域展示', async () => {
    mountDataManagement()
    await openBucket('页面状态')

    const scrollSurface = wrapper!.find('.dm-kv-scroll')
    expect(scrollSurface.exists()).toBe(true)
    expect(scrollSurface.attributes('role')).toBe('region')
    expect(scrollSurface.attributes('tabindex')).toBe('0')
    expect(scrollSurface.attributes('aria-label')).toBe('页面状态数据')
  })

  test('行详情为长字段提供可聚焦的滚动区域', async () => {
    window.ztools.dbStorage.setItem(
      'sm_downloaded_skills',
      JSON.stringify([{ id: 'long-skill', name: '长内容技能', description: '内容'.repeat(500), source: 'local' }]),
    )
    resetStorageCaches()
    mountDataManagement()
    await openBucket('已下载技能')
    await wrapper!.find('.dm-tr').trigger('click')

    const scrollSurface = wrapper!.find('.dm-detail-card-body')
    expect(scrollSurface.attributes('role')).toBe('region')
    expect(scrollSurface.attributes('tabindex')).toBe('0')
    expect(scrollSurface.attributes('aria-label')).toBe('行详情内容')
  })
})

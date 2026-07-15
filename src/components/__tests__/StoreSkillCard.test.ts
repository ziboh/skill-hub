import { mount } from '@vue/test-utils'
import { describe, expect, test } from 'vitest'
import StoreSkillCard from '../StoreSkillCard.vue'

const skill = {
  id: 'downloaded-skill',
  name: 'Downloaded Skill',
  description: 'A downloaded skill',
  tags: [],
  source: 'github',
}

describe('StoreSkillCard', () => {
  test('下载事件向父级透传原始点击事件', async () => {
    const wrapper = mount(StoreSkillCard, { props: { skill }, global: { stubs: { ProviderIcon: true, UiIcon: true } } })
    await wrapper.find('button:not([title])').trigger('click')
    expect(wrapper.emitted('download')?.[0]?.[0]).toBeInstanceOf(MouseEvent)
  })

  test('下载按钮及下载中状态使用高对比度样式', () => {
    const ready = mount(StoreSkillCard, { props: { skill }, global: { stubs: { ProviderIcon: true, UiIcon: true } } })
    const downloading = mount(StoreSkillCard, {
      props: { skill, isDownloading: true },
      global: { stubs: { ProviderIcon: true, UiIcon: true } },
    })

    expect(ready.find('button:not([title])').classes()).toContain('download')
    expect(downloading.find('button:not([title])').classes()).toContain('download')
    expect(downloading.find('button:not([title])').classes()).toContain('is-downloading')
    expect(downloading.find('button:not([title]) svg').classes()).toContain('spin')
  })

  test('商店卡片的操作按钮使用统一按钮样式类', () => {
    const wrapper = mount(StoreSkillCard, {
      props: { skill, skillUrl: 'https://example.com' },
      global: { stubs: { ProviderIcon: true, UiIcon: true } },
    })

    expect(wrapper.find('[title="打开链接"]').classes()).toContain('store-action-btn')
    const downloaded = mount(StoreSkillCard, {
      props: { skill, isDownloaded: true },
      global: { stubs: { ProviderIcon: true, UiIcon: true } },
    })
    expect(downloaded.find('button[title="前往我的 Skill"]').classes()).toContain('store-action-btn')
    expect(wrapper.find('button.download').classes()).toContain('store-action-btn')
  })

  test('可用部分已下载的 Skill 显示前往我的 Skill 而不是删除', async () => {
    const wrapper = mount(StoreSkillCard, {
      props: { skill, isDownloaded: true },
      global: { stubs: { ProviderIcon: true, UiIcon: true } },
    })

    const locateButton = wrapper.find('[title="前往我的 Skill"]')
    expect(locateButton.exists()).toBe(true)
    expect(wrapper.find('[title="删除"]').exists()).toBe(false)
    expect(wrapper.find('button:not([title])').exists()).toBe(false)

    await locateButton.trigger('click')
    expect(wrapper.emitted('locate')).toHaveLength(1)
  })
})

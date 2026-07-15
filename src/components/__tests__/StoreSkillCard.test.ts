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

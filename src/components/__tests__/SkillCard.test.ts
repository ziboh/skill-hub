import { mount } from '@vue/test-utils'
import { describe, expect, test } from 'vitest'
import SkillCard from '../SkillCard.vue'
import SkillCardSource from '../SkillCard.vue?raw'

describe('SkillCard 样式约束', () => {
  test('不使用 content-visibility 避免商店首屏描述懒加载漏触发', () => {
    expect(SkillCardSource).not.toContain('content-visibility')
    expect(SkillCardSource).not.toContain('contain-intrinsic-height')
  })

  test('空描述显示明确原因而不是暂无描述', () => {
    const wrapper = mount(SkillCard, {
      props: {
        name: 'Demo',
        description: '',
        emptyDescriptionReason: '索引暂未返回描述',
      },
      global: { stubs: { ProviderIcon: true, UiIcon: true } },
    })

    expect(wrapper.text()).toContain('索引暂未返回描述')
    expect(wrapper.text()).not.toContain('暂无描述')
  })
})

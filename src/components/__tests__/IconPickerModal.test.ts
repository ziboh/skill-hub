import { describe, expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import IconPickerModal from '../IconPickerModal.vue'

describe('IconPickerModal', () => {
  test('keeps the picker open until the user clicks 完成', async () => {
    const wrapper = mount(IconPickerModal, {
      props: {
        modelValue: 'openai',
        title: '选择商店图标',
        library: 'all',
        defaultIcon: 'store:git-repo',
      },
      global: {
        stubs: {
          StoreIconPicker: {
            props: ['modelValue', 'library', 'defaultIcon'],
            template: '<button class="stub-picker" @click="$emit(\'update:modelValue\', \'github\')">选择</button>',
          },
        },
      },
    })

    await wrapper.find('.stub-picker').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['github']])
    expect(wrapper.find('.icon-picker-modal').exists()).toBe(true)

    await wrapper.find('.icon-picker-modal-done').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})

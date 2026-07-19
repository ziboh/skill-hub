import { describe, expect, test, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import SkillStore from './SkillStore/index.vue'
import * as github from '../utils/github'
import * as skillsSh from '../utils/skills-sh'
import { storage } from '../utils/storage'
import { KeyBumpDownloadedSkillsVersion, KeyRefreshCounts, KeyShowToast } from '../inject-keys'

class PassiveIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('SkillStore 首屏描述加载', () => {
  test('可用区域已下载 Skill 的前往按钮会导航到我的 Skill', async () => {
    vi.stubGlobal('IntersectionObserver', PassiveIntersectionObserver)
    const treeSpy = vi.spyOn(github, 'fetchGitHubRepoTree').mockResolvedValue([{ path: 'skills/demo/SKILL.md', type: 'blob' }])

    try {
      const wrapper = mount(SkillStore, {
        props: { storeId: 'claude' },
        global: {
          provide: {
            [KeyShowToast as symbol]: vi.fn(),
            [KeyRefreshCounts as symbol]: vi.fn(),
            [KeyBumpDownloadedSkillsVersion as symbol]: vi.fn(),
          },
          stubs: {
            StoreHeader: true,
            StoreFilters: true,
            StoreSkillCard: {
              props: ['skill'],
              template: '<button class="locate" @click="$emit(\'locate\')">{{ skill.id }}</button>',
            },
            SkillDetailModal: true,
            SkillPickModal: true,
            ConfirmModal: true,
            StoreConfigModal: true,
            UiIcon: true,
          },
        },
      })

      await flushPromises()
      await nextTick()

      await wrapper.find('.locate').trigger('click')

      expect(wrapper.emitted('navigate')).toContainEqual(['my', { targetSkillId: 'anthropics/skills/demo' }])
    } finally {
      treeSpy.mockRestore()
      vi.unstubAllGlobals()
    }
  })

  test('跨商店已下载 Skill 使用我的 Skill 记录 ID 进行定位', async () => {
    vi.stubGlobal('IntersectionObserver', PassiveIntersectionObserver)
    storage.saveDownloadedSkills([
      {
        id: 'other-store/demo',
        name: 'Demo',
        description: 'Downloaded demo',
        author: '',
        tags: [],
        source: 'github',
        repo: 'anthropics/skills',
        storeSourceId: 'codex',
      },
    ])
    const treeSpy = vi.spyOn(github, 'fetchGitHubRepoTree').mockResolvedValue([{ path: 'skills/demo/SKILL.md', type: 'blob' }])

    try {
      const wrapper = mount(SkillStore, {
        props: { storeId: 'claude' },
        global: {
          provide: {
            [KeyShowToast as symbol]: vi.fn(),
            [KeyRefreshCounts as symbol]: vi.fn(),
            [KeyBumpDownloadedSkillsVersion as symbol]: vi.fn(),
          },
          stubs: {
            StoreHeader: true,
            StoreFilters: true,
            StoreSkillCard: {
              props: ['skill'],
              template: '<button class="locate" @click="$emit(\'locate\')">{{ skill.id }}</button>',
            },
            SkillDetailModal: true,
            SkillPickModal: true,
            ConfirmModal: true,
            StoreConfigModal: true,
            UiIcon: true,
          },
        },
      })

      await flushPromises()
      await nextTick()

      await wrapper.find('.locate').trigger('click')

      expect(wrapper.emitted('navigate')).toContainEqual(['my', { targetSkillId: 'other-store/demo' }])
    } finally {
      treeSpy.mockRestore()
      vi.unstubAllGlobals()
    }
  })

  test('KeepAlive 首次激活时只请求一次 GitHub 商店列表', async () => {
    vi.stubGlobal('IntersectionObserver', PassiveIntersectionObserver)
    const treeSpy = vi.spyOn(github, 'fetchGitHubRepoTree').mockResolvedValue([])
    const Host = defineComponent({
      components: { SkillStore },
      template: '<KeepAlive><SkillStore store-id="claude" /></KeepAlive>',
    })

    try {
      mount(Host, {
        global: {
          provide: {
            [KeyShowToast as symbol]: vi.fn(),
            [KeyRefreshCounts as symbol]: vi.fn(),
            [KeyBumpDownloadedSkillsVersion as symbol]: vi.fn(),
          },
          stubs: {
            StoreHeader: true,
            StoreFilters: true,
            StoreSkillCard: true,
            SkillDetailModal: true,
            SkillPickModal: true,
            ConfirmModal: true,
            StoreConfigModal: true,
            UiIcon: true,
          },
        },
      })

      await flushPromises()

      expect(treeSpy).toHaveBeenCalledOnce()
    } finally {
      treeSpy.mockRestore()
      vi.unstubAllGlobals()
    }
  })

  test('观察器尚未回调时不主动请求 GitHub 卡片描述', async () => {
    vi.stubGlobal('IntersectionObserver', PassiveIntersectionObserver)
    const treeSpy = vi
      .spyOn(github, 'fetchGitHubRepoTree')
      .mockResolvedValue(Array.from({ length: 7 }, (_, index) => ({ path: `skills/demo-${index}/SKILL.md`, type: 'blob' as const })))
    const fileSpy = vi.spyOn(github, 'fetchGitHubFile').mockResolvedValue('---\nname: Demo\ndescription: Demo description\n---')

    try {
      mount(SkillStore, {
        props: { storeId: 'claude' },
        global: {
          provide: {
            [KeyShowToast as symbol]: vi.fn(),
            [KeyRefreshCounts as symbol]: vi.fn(),
            [KeyBumpDownloadedSkillsVersion as symbol]: vi.fn(),
          },
          stubs: {
            StoreHeader: true,
            StoreFilters: true,
            StoreSkillCard: { template: '<div />' },
            SkillDetailModal: true,
            SkillPickModal: true,
            ConfirmModal: true,
            StoreConfigModal: true,
            UiIcon: true,
          },
        },
      })

      await flushPromises()
      await nextTick()
      await flushPromises()

      expect(treeSpy).toHaveBeenCalledOnce()
      expect(fileSpy).not.toHaveBeenCalled()
    } finally {
      treeSpy.mockRestore()
      fileSpy.mockRestore()
      vi.unstubAllGlobals()
    }
  })

  test('观察器未回调但卡片位于可视区时请求 GitHub 描述', async () => {
    vi.stubGlobal('IntersectionObserver', PassiveIntersectionObserver)
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 300,
      height: 300,
      top: 0,
      right: 300,
      bottom: 300,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)
    const treeSpy = vi.spyOn(github, 'fetchGitHubRepoTree').mockResolvedValue([{ path: 'skills/demo/SKILL.md', type: 'blob' }])
    const fileSpy = vi.spyOn(github, 'fetchGitHubFile').mockResolvedValue('---\nname: Demo\ndescription: Demo description\n---')

    try {
      const wrapper = mount(SkillStore, {
        props: { storeId: 'claude' },
        global: {
          provide: {
            [KeyShowToast as symbol]: vi.fn(),
            [KeyRefreshCounts as symbol]: vi.fn(),
            [KeyBumpDownloadedSkillsVersion as symbol]: vi.fn(),
          },
          stubs: {
            StoreHeader: true,
            StoreFilters: true,
            StoreSkillCard: { props: ['skill'], template: '<div :data-skill-id="skill.id" />' },
            SkillDetailModal: true,
            SkillPickModal: true,
            ConfirmModal: true,
            StoreConfigModal: true,
            UiIcon: true,
          },
        },
      })

      await flushPromises()
      await nextTick()
      await flushPromises()

      expect(wrapper.find('[data-skill-id="anthropics/skills/demo"]').exists()).toBe(true)
      expect(fileSpy).toHaveBeenCalledOnce()
    } finally {
      rectSpy.mockRestore()
      treeSpy.mockRestore()
      fileSpy.mockRestore()
      vi.unstubAllGlobals()
    }
  })

  test('首屏容器首次未完成布局时会重试请求 GitHub 描述', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', PassiveIntersectionObserver)
    let visible = false
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      () =>
        ({
          width: visible ? 300 : 0,
          height: visible ? 300 : 0,
          top: 0,
          right: visible ? 300 : 0,
          bottom: visible ? 300 : 0,
          left: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    )
    const treeSpy = vi.spyOn(github, 'fetchGitHubRepoTree').mockResolvedValue([{ path: 'skills/demo/SKILL.md', type: 'blob' }])
    const fileSpy = vi.spyOn(github, 'fetchGitHubFile').mockResolvedValue('---\nname: Demo\ndescription: Demo description\n---')

    try {
      mount(SkillStore, {
        props: { storeId: 'claude' },
        global: {
          provide: {
            [KeyShowToast as symbol]: vi.fn(),
            [KeyRefreshCounts as symbol]: vi.fn(),
            [KeyBumpDownloadedSkillsVersion as symbol]: vi.fn(),
          },
          stubs: {
            StoreHeader: true,
            StoreFilters: true,
            StoreSkillCard: { props: ['skill'], template: '<div :data-skill-id="skill.id" />' },
            SkillDetailModal: true,
            SkillPickModal: true,
            ConfirmModal: true,
            StoreConfigModal: true,
            UiIcon: true,
          },
        },
      })

      await flushPromises()
      await nextTick()
      await vi.advanceTimersByTimeAsync(0)
      await flushPromises()
      expect(fileSpy).not.toHaveBeenCalled()

      visible = true
      await vi.advanceTimersByTimeAsync(100)
      await flushPromises()

      expect(treeSpy).toHaveBeenCalledOnce()
      expect(fileSpy).toHaveBeenCalledOnce()
    } finally {
      rectSpy.mockRestore()
      treeSpy.mockRestore()
      fileSpy.mockRestore()
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  test('首屏卡片首次未完成布局时会重试请求 GitHub 描述', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', PassiveIntersectionObserver)
    let cardVisible = false
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const isCard = this.hasAttribute('data-skill-id')
      const visible = !isCard || cardVisible
      return {
        width: visible ? 300 : 0,
        height: visible ? 300 : 0,
        top: 0,
        right: visible ? 300 : 0,
        bottom: visible ? 300 : 0,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect
    })
    const treeSpy = vi.spyOn(github, 'fetchGitHubRepoTree').mockResolvedValue([{ path: 'skills/demo/SKILL.md', type: 'blob' }])
    const fileSpy = vi.spyOn(github, 'fetchGitHubFile').mockResolvedValue('---\nname: Demo\ndescription: Demo description\n---')

    try {
      mount(SkillStore, {
        props: { storeId: 'claude' },
        global: {
          provide: {
            [KeyShowToast as symbol]: vi.fn(),
            [KeyRefreshCounts as symbol]: vi.fn(),
            [KeyBumpDownloadedSkillsVersion as symbol]: vi.fn(),
          },
          stubs: {
            StoreHeader: true,
            StoreFilters: true,
            StoreSkillCard: { props: ['skill'], template: '<div :data-skill-id="skill.id" />' },
            SkillDetailModal: true,
            SkillPickModal: true,
            ConfirmModal: true,
            StoreConfigModal: true,
            UiIcon: true,
          },
        },
      })

      await flushPromises()
      await nextTick()
      await vi.advanceTimersByTimeAsync(0)
      await flushPromises()
      expect(fileSpy).not.toHaveBeenCalled()

      cardVisible = true
      await vi.advanceTimersByTimeAsync(100)
      await flushPromises()

      expect(treeSpy).toHaveBeenCalledOnce()
      expect(fileSpy).toHaveBeenCalledOnce()
    } finally {
      rectSpy.mockRestore()
      treeSpy.mockRestore()
      fileSpy.mockRestore()
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  test('GitHub 商店内存缓存命中后仍请求首屏缺失描述', async () => {
    vi.stubGlobal('IntersectionObserver', PassiveIntersectionObserver)
    let visible = false
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      () =>
        ({
          width: 300,
          height: visible ? 300 : 0,
          top: 0,
          right: 300,
          bottom: visible ? 300 : 0,
          left: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    )
    const treeSpy = vi.spyOn(github, 'fetchGitHubRepoTree').mockImplementation(async (owner) => {
      if (owner === 'anthropics') return [{ path: 'skills/demo/SKILL.md', type: 'blob' }]
      return [{ path: 'skills/.curated/demo-codex/SKILL.md', type: 'blob' }]
    })
    const fileSpy = vi.spyOn(github, 'fetchGitHubFile').mockResolvedValue('---\nname: Demo\ndescription: Demo description\n---')

    try {
      const wrapper = mount(SkillStore, {
        props: { storeId: 'claude' },
        global: {
          provide: {
            [KeyShowToast as symbol]: vi.fn(),
            [KeyRefreshCounts as symbol]: vi.fn(),
            [KeyBumpDownloadedSkillsVersion as symbol]: vi.fn(),
          },
          stubs: {
            StoreHeader: true,
            StoreFilters: {
              template:
                '<div><button class="to-codex" @click="$emit(\'select-store\', \'codex\')" /><button class="to-claude" @click="$emit(\'select-store\', \'claude\')" /></div>',
            },
            StoreSkillCard: { props: ['skill'], template: '<div :data-skill-id="skill.id" />' },
            SkillDetailModal: true,
            SkillPickModal: true,
            ConfirmModal: true,
            StoreConfigModal: true,
            UiIcon: true,
          },
        },
      })

      await flushPromises()
      await nextTick()
      await flushPromises()
      expect(fileSpy).not.toHaveBeenCalled()

      await wrapper.find('.to-codex').trigger('click')
      await flushPromises()
      await nextTick()
      await flushPromises()
      fileSpy.mockClear()

      visible = true
      await wrapper.find('.to-claude').trigger('click')
      await flushPromises()
      await nextTick()
      await flushPromises()

      expect(treeSpy).toHaveBeenCalledTimes(2)
      expect(wrapper.find('[data-skill-id="anthropics/skills/demo"]').exists()).toBe(true)
      expect(fileSpy).toHaveBeenCalledOnce()
      expect(fileSpy).toHaveBeenCalledWith('anthropics', 'skills', 'skills/demo/SKILL.md', 'main', undefined, expect.any(AbortSignal))
    } finally {
      rectSpy.mockRestore()
      treeSpy.mockRestore()
      fileSpy.mockRestore()
      vi.unstubAllGlobals()
    }
  })

  test('商店内切换后父级同步 storeId 时不重复加载同一商店', async () => {
    vi.stubGlobal('IntersectionObserver', PassiveIntersectionObserver)
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 300,
      height: 300,
      top: 0,
      right: 300,
      bottom: 300,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)
    const treeSpy = vi.spyOn(github, 'fetchGitHubRepoTree').mockImplementation(async (owner) => {
      if (owner === 'anthropics') return [{ path: 'skills/demo/SKILL.md', type: 'blob' }]
      return [{ path: 'skills/.curated/demo-codex/SKILL.md', type: 'blob' }]
    })
    const fileSpy = vi.spyOn(github, 'fetchGitHubFile').mockResolvedValue('---\nname: Demo\ndescription: Demo description\n---')

    try {
      const wrapper = mount(SkillStore, {
        props: { storeId: 'claude' },
        global: {
          provide: {
            [KeyShowToast as symbol]: vi.fn(),
            [KeyRefreshCounts as symbol]: vi.fn(),
            [KeyBumpDownloadedSkillsVersion as symbol]: vi.fn(),
          },
          stubs: {
            StoreHeader: true,
            StoreFilters: {
              template: '<button class="to-codex" @click="$emit(\'select-store\', \'codex\')" />',
            },
            StoreSkillCard: { props: ['skill'], template: '<div :data-skill-id="skill.id" />' },
            SkillDetailModal: true,
            SkillPickModal: true,
            ConfirmModal: true,
            StoreConfigModal: true,
            UiIcon: true,
          },
        },
      })

      await flushPromises()
      await nextTick()
      await flushPromises()
      expect(treeSpy).toHaveBeenCalledTimes(1)

      await wrapper.find('.to-codex').trigger('click')
      await flushPromises()
      await nextTick()
      await flushPromises()
      expect(treeSpy).toHaveBeenCalledTimes(2)

      await wrapper.setProps({ storeId: 'codex' })
      await flushPromises()
      await nextTick()
      await flushPromises()

      expect(treeSpy).toHaveBeenCalledTimes(2)
      expect(fileSpy).toHaveBeenCalledWith(
        'openai',
        'skills',
        'skills/.curated/demo-codex/SKILL.md',
        'main',
        undefined,
        expect.any(AbortSignal),
      )
    } finally {
      rectSpy.mockRestore()
      treeSpy.mockRestore()
      fileSpy.mockRestore()
      vi.unstubAllGlobals()
    }
  })

  test('商店切换并同步 storeId 后卡片稍晚布局仍会请求描述', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', PassiveIntersectionObserver)
    let codexCardVisible = false
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const skillId = this.getAttribute('data-skill-id') || ''
      const isCodexCard = skillId.includes('openai/skills')
      const visible = !isCodexCard || codexCardVisible
      return {
        width: visible ? 300 : 0,
        height: visible ? 300 : 0,
        top: 0,
        right: visible ? 300 : 0,
        bottom: visible ? 300 : 0,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect
    })
    const treeSpy = vi.spyOn(github, 'fetchGitHubRepoTree').mockImplementation(async (owner) => {
      if (owner === 'anthropics') return [{ path: 'skills/demo/SKILL.md', type: 'blob' }]
      return [{ path: 'skills/.curated/demo-codex/SKILL.md', type: 'blob' }]
    })
    const fileSpy = vi.spyOn(github, 'fetchGitHubFile').mockResolvedValue('---\nname: Demo\ndescription: Demo description\n---')

    try {
      const wrapper = mount(SkillStore, {
        props: { storeId: 'claude' },
        global: {
          provide: {
            [KeyShowToast as symbol]: vi.fn(),
            [KeyRefreshCounts as symbol]: vi.fn(),
            [KeyBumpDownloadedSkillsVersion as symbol]: vi.fn(),
          },
          stubs: {
            StoreHeader: true,
            StoreFilters: {
              template: '<button class="to-codex" @click="$emit(\'select-store\', \'codex\')" />',
            },
            StoreSkillCard: { props: ['skill'], template: '<div :data-skill-id="skill.id" />' },
            SkillDetailModal: true,
            SkillPickModal: true,
            ConfirmModal: true,
            StoreConfigModal: true,
            UiIcon: true,
          },
        },
      })

      await flushPromises()
      await nextTick()
      await vi.advanceTimersByTimeAsync(0)
      await flushPromises()
      fileSpy.mockClear()

      await wrapper.find('.to-codex').trigger('click')
      await flushPromises()
      await nextTick()
      await vi.advanceTimersByTimeAsync(0)
      await flushPromises()
      expect(fileSpy).not.toHaveBeenCalledWith(
        'openai',
        'skills',
        'skills/.curated/demo-codex/SKILL.md',
        'main',
        undefined,
        expect.any(AbortSignal),
      )

      await wrapper.setProps({ storeId: 'codex' })
      await flushPromises()
      await nextTick()
      await vi.advanceTimersByTimeAsync(0)
      await flushPromises()
      expect(fileSpy).not.toHaveBeenCalledWith(
        'openai',
        'skills',
        'skills/.curated/demo-codex/SKILL.md',
        'main',
        undefined,
        expect.any(AbortSignal),
      )

      codexCardVisible = true
      await vi.advanceTimersByTimeAsync(100)
      await flushPromises()

      expect(treeSpy).toHaveBeenCalled()
      expect(fileSpy).toHaveBeenCalledWith(
        'openai',
        'skills',
        'skills/.curated/demo-codex/SKILL.md',
        'main',
        undefined,
        expect.any(AbortSignal),
      )
    } finally {
      rectSpy.mockRestore()
      treeSpy.mockRestore()
      fileSpy.mockRestore()
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  test('商店切换后布局检测一直不可见时会兜底请求已渲染卡片描述', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', PassiveIntersectionObserver)
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const isCard = this.hasAttribute('data-skill-id')
      const visible = !isCard
      return {
        width: visible ? 300 : 0,
        height: visible ? 300 : 0,
        top: 0,
        right: visible ? 300 : 0,
        bottom: visible ? 300 : 0,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect
    })
    const treeSpy = vi.spyOn(github, 'fetchGitHubRepoTree').mockImplementation(async (owner) => {
      if (owner === 'anthropics') return [{ path: 'skills/demo/SKILL.md', type: 'blob' }]
      return [{ path: 'skills/.curated/demo-codex/SKILL.md', type: 'blob' }]
    })
    const fileSpy = vi.spyOn(github, 'fetchGitHubFile').mockResolvedValue('---\nname: Demo\ndescription: Demo description\n---')

    try {
      const wrapper = mount(SkillStore, {
        props: { storeId: 'claude' },
        global: {
          provide: {
            [KeyShowToast as symbol]: vi.fn(),
            [KeyRefreshCounts as symbol]: vi.fn(),
            [KeyBumpDownloadedSkillsVersion as symbol]: vi.fn(),
          },
          stubs: {
            StoreHeader: true,
            StoreFilters: {
              template: '<button class="to-codex" @click="$emit(\'select-store\', \'codex\')" />',
            },
            StoreSkillCard: { props: ['skill'], template: '<div :data-skill-id="skill.id" />' },
            SkillDetailModal: true,
            SkillPickModal: true,
            ConfirmModal: true,
            StoreConfigModal: true,
            UiIcon: true,
          },
        },
      })

      await flushPromises()
      await nextTick()
      await vi.advanceTimersByTimeAsync(2000)
      await flushPromises()
      fileSpy.mockClear()

      await wrapper.find('.to-codex').trigger('click')
      await flushPromises()
      await nextTick()
      await wrapper.setProps({ storeId: 'codex' })
      await flushPromises()
      await nextTick()
      await vi.advanceTimersByTimeAsync(2000)
      await flushPromises()

      expect(treeSpy).toHaveBeenCalled()
      expect(fileSpy).toHaveBeenCalledWith(
        'openai',
        'skills',
        'skills/.curated/demo-codex/SKILL.md',
        'main',
        undefined,
        expect.any(AbortSignal),
      )
    } finally {
      rectSpy.mockRestore()
      treeSpy.mockRestore()
      fileSpy.mockRestore()
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  test('商店切换后不等待滚动即可及时兜底请求首屏描述', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', PassiveIntersectionObserver)
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const isCard = this.hasAttribute('data-skill-id')
      return {
        width: isCard ? 0 : 300,
        height: isCard ? 0 : 300,
        top: 0,
        right: isCard ? 0 : 300,
        bottom: isCard ? 0 : 300,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect
    })
    const treeSpy = vi.spyOn(github, 'fetchGitHubRepoTree').mockImplementation(async (owner) => {
      if (owner === 'anthropics') return [{ path: 'skills/demo/SKILL.md', type: 'blob' }]
      return [{ path: 'skills/.curated/demo-codex/SKILL.md', type: 'blob' }]
    })
    const fileSpy = vi.spyOn(github, 'fetchGitHubFile').mockResolvedValue('---\nname: Demo\ndescription: Demo description\n---')

    try {
      const wrapper = mount(SkillStore, {
        props: { storeId: 'claude' },
        global: {
          provide: {
            [KeyShowToast as symbol]: vi.fn(),
            [KeyRefreshCounts as symbol]: vi.fn(),
            [KeyBumpDownloadedSkillsVersion as symbol]: vi.fn(),
          },
          stubs: {
            StoreHeader: true,
            StoreFilters: {
              template: '<button class="to-codex" @click="$emit(\'select-store\', \'codex\')" />',
            },
            StoreSkillCard: { props: ['skill'], template: '<div :data-skill-id="skill.id" />' },
            SkillDetailModal: true,
            SkillPickModal: true,
            ConfirmModal: true,
            StoreConfigModal: true,
            UiIcon: true,
          },
        },
      })

      await flushPromises()
      await nextTick()
      await vi.advanceTimersByTimeAsync(2000)
      await flushPromises()
      fileSpy.mockClear()

      await wrapper.find('.to-codex').trigger('click')
      await flushPromises()
      await nextTick()
      await wrapper.setProps({ storeId: 'codex' })
      await flushPromises()
      await nextTick()
      await vi.advanceTimersByTimeAsync(160)
      await flushPromises()

      expect(treeSpy).toHaveBeenCalled()
      expect(fileSpy).toHaveBeenCalledWith(
        'openai',
        'skills',
        'skills/.curated/demo-codex/SKILL.md',
        'main',
        undefined,
        expect.any(AbortSignal),
      )
    } finally {
      rectSpy.mockRestore()
      treeSpy.mockRestore()
      fileSpy.mockRestore()
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  test('忽略同一商店刷新前未完成的 GitHub 描述请求', async () => {
    vi.stubGlobal('IntersectionObserver', PassiveIntersectionObserver)
    let visible = true
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      () =>
        ({
          width: 300,
          height: visible ? 300 : 0,
          top: 0,
          right: 300,
          bottom: visible ? 300 : 0,
          left: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    )
    const firstRequest = createDeferred<string>()
    const treeSpy = vi.spyOn(github, 'fetchGitHubRepoTree').mockResolvedValue([{ path: 'skills/demo/SKILL.md', type: 'blob' }])
    const fileSpy = vi.spyOn(github, 'fetchGitHubFile').mockReturnValue(firstRequest.promise)

    try {
      const wrapper = mount(SkillStore, {
        props: { storeId: 'claude' },
        global: {
          provide: {
            [KeyShowToast as symbol]: vi.fn(),
            [KeyRefreshCounts as symbol]: vi.fn(),
            [KeyBumpDownloadedSkillsVersion as symbol]: vi.fn(),
          },
          stubs: {
            StoreHeader: { template: '<button class="refresh" @click="$emit(\'refresh\')" />' },
            StoreFilters: true,
            StoreSkillCard: {
              props: ['skill', 'emptyDescriptionReason'],
              template: '<div :data-skill-id="skill.id">{{ skill.description }}{{ emptyDescriptionReason }}</div>',
            },
            SkillDetailModal: true,
            SkillPickModal: true,
            ConfirmModal: true,
            StoreConfigModal: true,
            UiIcon: true,
          },
        },
      })

      await flushPromises()
      await nextTick()
      await flushPromises()
      expect(fileSpy).toHaveBeenCalledOnce()

      visible = false
      await wrapper.find('.refresh').trigger('click')
      await flushPromises()
      await nextTick()
      await flushPromises()
      expect(treeSpy).toHaveBeenCalledTimes(2)

      firstRequest.resolve('---\nname: Demo\ndescription: Demo description\n---')
      await flushPromises()
      await nextTick()

      expect(wrapper.find('[data-skill-id="anthropics/skills/demo"]').text()).not.toContain('尚未进入可视区，等待加载描述')
      expect(wrapper.find('[data-skill-id="anthropics/skills/demo"]').text()).not.toContain('描述已读取但未解析成功')
    } finally {
      rectSpy.mockRestore()
      treeSpy.mockRestore()
      fileSpy.mockRestore()
      vi.unstubAllGlobals()
    }
  })

  test('观察器尚未回调时不主动请求 skills.sh 卡片描述', async () => {
    vi.stubGlobal('IntersectionObserver', PassiveIntersectionObserver)
    const catalogPayload = {
      entries: [
        {
          owner: 'example',
          repo: 'skills',
          skillName: 'Demo',
          detailPath: '/example/skills/demo',
          detailUrl: 'https://skills.sh/example/skills/demo',
          installs: 1,
        },
      ],
      totalCount: 1,
    }
    const catalogSpy = vi.spyOn(skillsSh, 'fetchAllSkillsFromSitemap').mockResolvedValue(catalogPayload)
    const descriptionSpy = vi.spyOn(skillsSh, 'fetchSkillDescriptionFromSh').mockResolvedValue('Demo description')

    try {
      mount(SkillStore, {
        props: { storeId: 'skills-sh' },
        global: {
          provide: {
            [KeyShowToast as symbol]: vi.fn(),
            [KeyRefreshCounts as symbol]: vi.fn(),
            [KeyBumpDownloadedSkillsVersion as symbol]: vi.fn(),
          },
          stubs: {
            StoreHeader: true,
            StoreFilters: true,
            StoreSkillCard: { template: '<div />' },
            SkillDetailModal: true,
            SkillPickModal: true,
            ConfirmModal: true,
            StoreConfigModal: true,
            UiIcon: true,
          },
        },
      })

      await flushPromises()
      await nextTick()
      await flushPromises()

      expect(catalogSpy).toHaveBeenCalledOnce()
      expect(descriptionSpy).not.toHaveBeenCalled()
    } finally {
      catalogSpy.mockRestore()
      descriptionSpy.mockRestore()
      vi.unstubAllGlobals()
    }
  })
})

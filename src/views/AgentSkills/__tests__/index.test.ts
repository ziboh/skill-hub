import { beforeEach, describe, expect, test, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import AgentSkills from '../index.vue'
import ConfirmModal from '../../../components/ConfirmModal.vue'
import {
  KeyAgentSkills,
  KeyDetectedPlatforms,
  KeyIsAgentSkillsDirty,
  KeyPlatformSkillCounts,
  KeyRefreshCounts,
  KeySelectedAgentPlatformId,
  KeyShowToast,
  KeyUpdateAgentPlatformSkills,
} from '../../../inject-keys'
import { storage, resetStorageCaches } from '../../../utils/storage'

vi.mock('../../../data/platforms', () => ({
  detectPlatforms: () => [{ id: 'cursor', name: 'Cursor', detected: true, enabled: true, defaultPath: '/agents/cursor' }],
  getPlatformPath: () => '/agents/cursor',
  getDefaultPlatformOrder: () => ['cursor'],
  platformDisplayIcon: () => 'cursor',
  findPlatformById: () => null,
}))

const platform = { id: 'cursor', name: 'Cursor', detected: true, enabled: true, defaultPath: '/agents/cursor' }

function createSkill(dir: string, name: string) {
  return {
    name,
    dir,
    skillFile: `${dir}/SKILL.md`,
    content: `# ${name}`,
    manifest: { name, description: '', author: '', tags: [], language: 'en' },
  }
}

function createWrapper(skillOrSkills: ReturnType<typeof createSkill> | ReturnType<typeof createSkill>[]) {
  const skills = Array.isArray(skillOrSkills) ? skillOrSkills : [skillOrSkills]
  return mount(AgentSkills, {
    props: { initialPlatformId: 'cursor' },
    global: {
      provide: {
        [KeyShowToast as symbol]: vi.fn(),
        [KeyDetectedPlatforms as symbol]: ref([platform]),
        [KeyPlatformSkillCounts as symbol]: ref({ cursor: 1 }),
        [KeyRefreshCounts as symbol]: vi.fn(),
        [KeyAgentSkills as symbol]: ref({ cursor: skills }),
        [KeyUpdateAgentPlatformSkills as symbol]: vi.fn(),
        [KeySelectedAgentPlatformId as symbol]: ref('cursor'),
        [KeyIsAgentSkillsDirty as symbol]: ref(false),
      },
      stubs: {
        SkillCard: { template: '<div class="skill-card"><slot name="actions" /></div>' },
        ProviderIcon: true,
        QuickSwitcher: true,
         ConfirmModal,
        DeployModal: true,
      },
    },
  })
}

describe('AgentSkills card deploy action', () => {
  beforeEach(() => {
    window.ztools.dbStorage.clear()
    resetStorageCaches()
    vi.mocked(window.services.pathExists).mockReturnValue(true)
  })

  test('shows deploy action for the source skill', async () => {
    const skill = createSkill('/agents/cursor/source-skill', 'source-skill')
    storage.saveDownloadedSkills([{ id: 'source-skill', name: 'source-skill', description: '', tags: [], source: 'local', path: skill.dir }])

    const wrapper = createWrapper(skill)
    await nextTick()

    expect(wrapper.find('[title="分发到平台"]').exists()).toBe(true)
    expect(wrapper.find('[title="导入到我的 Skill"]').exists()).toBe(false)
  })

  test('shows deploy action for a managed skill with a distribution record', async () => {
    const skill = createSkill('/agents/cursor/managed-skill', 'managed-skill')
    storage.saveDownloadedSkills([{ id: 'managed-skill', name: 'managed-skill', description: '', tags: [], source: 'local', path: '/skills-repo/managed-skill' }])
    storage.saveDistributeRecord({
      skillId: 'managed-skill',
      platformId: 'cursor',
      mode: 'copy',
      scope: 'global',
      targetPath: skill.dir,
      sourceDir: '/skills-repo/managed-skill',
      distributedAt: new Date().toISOString(),
    })

    const wrapper = createWrapper(skill)
    await nextTick()

    expect(wrapper.find('[title="分发到平台"]').exists()).toBe(true)
    expect(wrapper.find('[title="导入到我的 Skill"]').exists()).toBe(false)
  })

  test('shows only import action for a local skill without source or distribution record', async () => {
    const skill = createSkill('/agents/cursor/local-skill', 'local-skill')
    storage.saveDownloadedSkills([{ id: 'local-skill', name: 'local-skill', description: '', tags: [], source: 'local', path: '/skills-repo/local-skill' }])

    const wrapper = createWrapper(skill)
    await nextTick()

    expect(wrapper.find('[title="分发到平台"]').exists()).toBe(false)
    expect(wrapper.find('[title="导入到我的 Skill"]').exists()).toBe(true)
  })

  test('asks for confirmation before importing a local skill', async () => {
    const skill = createSkill('/agents/cursor/local-skill', 'local-skill')
    const wrapper = createWrapper(skill)
    await nextTick()

    await wrapper.find('[title="导入到我的 Skill"]').trigger('click')

    expect(wrapper.find('.confirm-modal').exists()).toBe(true)
    expect(wrapper.find('.confirm-modal').text()).toContain('local-skill')
  })

  test('refreshes platform counts after the skill scan completes', async () => {
    vi.useFakeTimers()
    const refreshCounts = vi.fn()
    const skill = createSkill('/agents/cursor/skill', 'skill')
    vi.mocked(window.services.scanForSkillFiles).mockReturnValue([skill])
    const wrapper = mount(AgentSkills, {
      props: { initialPlatformId: 'cursor' },
      global: {
        provide: {
          [KeyShowToast as symbol]: vi.fn(),
          [KeyDetectedPlatforms as symbol]: ref([platform]),
          [KeyPlatformSkillCounts as symbol]: ref({ cursor: 0 }),
          [KeyRefreshCounts as symbol]: refreshCounts,
          [KeyAgentSkills as symbol]: ref({ cursor: [] }),
          [KeyUpdateAgentPlatformSkills as symbol]: vi.fn(),
          [KeySelectedAgentPlatformId as symbol]: ref('cursor'),
          [KeyIsAgentSkillsDirty as symbol]: ref(false),
        },
        stubs: {
          SkillCard: { template: '<div class="skill-card"><slot name="actions" /></div>' },
          ProviderIcon: true,
          QuickSwitcher: true,
          ConfirmModal,
          DeployModal: true,
        },
      },
    })

    await wrapper.find('[title="刷新"]').trigger('click')
    expect(refreshCounts).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(300)
    expect(refreshCounts).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  test('matches the GitHub import card selection layout', async () => {
    const skill = createSkill('/agents/cursor/current-skill', 'current-skill')
    storage.saveDownloadedSkills([{ id: 'available-skill', name: 'available-skill', description: 'Available', tags: [], source: 'local' }])
    const wrapper = createWrapper(skill)
    await nextTick()

    await wrapper.find('.toolbar-btn.import-btn').trigger('click')

    expect(wrapper.find('.modal').classes()).toContain('skill-import-modal')
    const card = wrapper.find('.modal-skill-card')
    expect(card.element.children[0].classList.contains('modal-skill-check')).toBe(true)
    expect(card.element.children[1].classList.contains('modal-skill-avatar')).toBe(true)
    expect(card.element.children[2].classList.contains('modal-skill-info')).toBe(true)
  })

  test('批量管理可以将选中的 Agent Skill 导入到我的 Skill', async () => {
    const skills = [
      createSkill('/agents/cursor/first-skill', 'first-skill'),
      createSkill('/agents/cursor/second-skill', 'second-skill'),
    ]
    const wrapper = createWrapper(skills)
    await nextTick()

    await wrapper.findAll('.toolbar-btn').find((button) => button.text().includes('批量管理'))!.trigger('click')
    await wrapper.findAll('.batch-action-btn').find((button) => button.text().includes('全选'))!.trigger('click')
    await wrapper.find('[title="批量导入到我的 Skill"]').trigger('click')
    expect(wrapper.find('.confirm-modal').exists()).toBe(true)

    await wrapper.find('.confirm-btn.delete').trigger('click')

    expect(window.services.copyFile).toHaveBeenCalledWith('/agents/cursor/first-skill', '/mock/path/skills-repo/first-skill')
    expect(window.services.copyFile).toHaveBeenCalledWith('/agents/cursor/second-skill', '/mock/path/skills-repo/second-skill')
  })

  test('批量管理可以启用和停用选中的 Agent Skill', async () => {
    const skills = [
      createSkill('/agents/cursor/first-skill', 'first-skill'),
      createSkill('/agents/cursor/second-skill', 'second-skill'),
    ]
    const wrapper = createWrapper(skills)
    await nextTick()

    await wrapper.findAll('.toolbar-btn').find((button) => button.text().includes('批量管理'))!.trigger('click')
    await wrapper.findAll('.batch-action-btn').find((button) => button.text().includes('全选'))!.trigger('click')
    await wrapper.find('[title="批量停用"]').trigger('click')

    expect(window.services.setSkillEnabled).toHaveBeenNthCalledWith(1, skills[0].dir, false)
    expect(window.services.setSkillEnabled).toHaveBeenNthCalledWith(2, skills[1].dir, false)

    await wrapper.findAll('.toolbar-btn').find((button) => button.text().includes('批量管理'))!.trigger('click')
    await wrapper.findAll('.batch-action-btn').find((button) => button.text().includes('全选'))!.trigger('click')
    await wrapper.find('[title="批量启用"]').trigger('click')

    expect(window.services.setSkillEnabled).toHaveBeenNthCalledWith(3, skills[0].dir, true)
    expect(window.services.setSkillEnabled).toHaveBeenNthCalledWith(4, skills[1].dir, true)
  })
})

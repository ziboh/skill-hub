import { beforeEach, describe, expect, test, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import AgentSkills from '../index.vue'
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

function createWrapper(skill: ReturnType<typeof createSkill>) {
  return mount(AgentSkills, {
    props: { initialPlatformId: 'cursor' },
    global: {
      provide: {
        [KeyShowToast as symbol]: vi.fn(),
        [KeyDetectedPlatforms as symbol]: ref([platform]),
        [KeyPlatformSkillCounts as symbol]: ref({ cursor: 1 }),
        [KeyRefreshCounts as symbol]: vi.fn(),
        [KeyAgentSkills as symbol]: ref({ cursor: [skill] }),
        [KeyUpdateAgentPlatformSkills as symbol]: vi.fn(),
        [KeySelectedAgentPlatformId as symbol]: ref('cursor'),
        [KeyIsAgentSkillsDirty as symbol]: ref(false),
      },
      stubs: {
        SkillCard: { template: '<div class="skill-card"><slot name="actions" /></div>' },
        ProviderIcon: true,
        QuickSwitcher: true,
        ConfirmModal: true,
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
})

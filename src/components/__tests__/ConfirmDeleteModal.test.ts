import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { mount, VueWrapper } from '@vue/test-utils'
import ConfirmDeleteModal from '../ConfirmDeleteModal.vue'
import { storage, resetStorageCaches } from '../../utils/storage'
import { KeyShowToast } from '../../inject-keys'
import type { Skill, DistributeRecord } from '../../types'

const mockSkill: Skill = {
  id: 'skill-1',
  name: 'TestSkill',
  slug: 'test-skill',
  description: 'A test skill',
  tags: [],
  platforms: [],
  config: {},
}

function createDistributeRecord(platformId: string, mode = 'copy'): DistributeRecord {
  return {
    skillId: 'skill-1',
    platformId,
    targetPath: `/platforms/${platformId}/skills/TestSkill`,
    mode,
    scope: 'user',
    distributedAt: new Date().toISOString(),
  }
}

function seedDistributeRecords(records: DistributeRecord[]) {
  // Use storage API so module-level distribute cache is invalidated
  for (const r of records) {
    storage.saveDistributeRecord(r)
  }
}

describe('ConfirmDeleteModal', () => {
  let wrapper: VueWrapper

  function mountModal(skill: Skill = mockSkill) {
    return mount(ConfirmDeleteModal, {
      props: { skill },
      global: {
        provide: { [KeyShowToast as symbol]: vi.fn() },
      },
    })
  }

  beforeEach(() => {
    window.ztools.dbStorage.clear()
    resetStorageCaches()
    vi.clearAllMocks()
    // safeRemovePath needs pathExists true to call removeFile
    vi.mocked(window.services.pathExists).mockImplementation((p: string) => {
      if (String(p).includes('skills-repo') || String(p).includes('platforms')) return true
      return false
    })
    // After removeFile, path is gone
    vi.mocked(window.services.removeFile).mockImplementation((p: string) => {
      vi.mocked(window.services.pathExists).mockImplementation((path: string) => {
        if (path === p) return false
        if (String(path).includes('skills-repo') || String(path).includes('platforms')) return true
        return false
      })
    })
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  test('renders skill name', () => {
    wrapper = mountModal()
    expect(wrapper.text()).toContain('TestSkill')
  })

  test('close button emits close', async () => {
    wrapper = mountModal()
    await wrapper.find('.confirm-close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  test('overlay click emits close', async () => {
    wrapper = mountModal()
    await wrapper.find('.confirm-overlay').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  test('cancel button emits close', async () => {
    wrapper = mountModal()
    await wrapper.find('.confirm-btn.cancel').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  test('shows distributed section when distribute records exist', () => {
    seedDistributeRecords([createDistributeRecord('cursor')])
    wrapper = mountModal()
    expect(wrapper.find('.distributed-section').exists()).toBe(true)
  })

  test('hides distributed section when no distribute records', () => {
    wrapper = mountModal()
    expect(wrapper.find('.distributed-section').exists()).toBe(false)
  })

  test('delete button emits deleted', async () => {
    wrapper = mountModal()
    await wrapper.find('.confirm-btn.delete').trigger('click')
    expect(wrapper.emitted('deleted')).toHaveLength(1)
  })

  test('delete calls removeFile for skill dir', async () => {
    wrapper = mountModal()
    await wrapper.find('.confirm-btn.delete').trigger('click')
    expect(window.services.pathJoin).toHaveBeenCalledWith('/mock/path', 'skills-repo', 'skill-1')
    expect(window.services.removeFile).toHaveBeenCalled()
  })

  test('delete removes storage entries', async () => {
    seedDistributeRecords([createDistributeRecord('cursor')])
    wrapper = mountModal()
    await wrapper.find('.confirm-btn.delete').trigger('click')
    const stored = JSON.parse(window.ztools.dbStorage.getItem('sm_distributed_skills')!)
    expect(stored).toHaveLength(0)
    const cached = JSON.parse(window.ztools.dbStorage.getItem('sm_downloaded_skills')!)
    expect(cached.find((s: any) => s.id === 'skill-one')).toBeFalsy()
  })

  test('remove distributed checkbox triggers platform select', async () => {
    seedDistributeRecords([createDistributeRecord('cursor'), createDistributeRecord('windsurf')])
    wrapper = mountModal()
    await wrapper.find('.remove-distributed-checkbox').setValue(true)
    await nextTick()
    expect(wrapper.findAll('.platform-item')).toHaveLength(2)
  })

  test('checking remove distributed selects all platforms', async () => {
    seedDistributeRecords([createDistributeRecord('cursor'), createDistributeRecord('windsurf')])
    wrapper = mountModal()
    await wrapper.find('.remove-distributed-checkbox').setValue(true)
    await nextTick()
    expect(wrapper.findAll('.platform-item.checked')).toHaveLength(2)
  })

  test('toggle all / deselect all', async () => {
    seedDistributeRecords([createDistributeRecord('cursor'), createDistributeRecord('windsurf')])
    wrapper = mountModal()
    await wrapper.find('.remove-distributed-checkbox').setValue(true)
    await nextTick()
    await wrapper.find('.platform-select-all').trigger('click')
    await nextTick()
    expect(wrapper.findAll('.platform-item.checked')).toHaveLength(0)
    await wrapper.find('.platform-select-all').trigger('click')
    await nextTick()
    expect(wrapper.findAll('.platform-item.checked')).toHaveLength(2)
  })

  test('deselect platforms then delete only removes selected', async () => {
    seedDistributeRecords([createDistributeRecord('cursor'), createDistributeRecord('windsurf')])
    wrapper = mountModal()
    await wrapper.find('.remove-distributed-checkbox').setValue(true)
    await nextTick()
    await wrapper.findAll('.platform-checkbox')[1].trigger('change')
    await nextTick()
    await wrapper.find('.confirm-btn.delete').trigger('click')
    expect(window.services.removeFile).toHaveBeenCalledWith('/platforms/cursor/skills/TestSkill')
    expect(window.services.removeFile).not.toHaveBeenCalledWith('/platforms/windsurf/skills/TestSkill')
  })

  test('shows platform mode text', async () => {
    seedDistributeRecords([createDistributeRecord('cursor', 'symlink')])
    wrapper = mountModal()
    await wrapper.find('.remove-distributed-checkbox').setValue(true)
    await nextTick()
    expect(wrapper.text()).toContain('软链接')
  })
})

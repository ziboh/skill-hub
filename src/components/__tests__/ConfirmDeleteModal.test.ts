import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { mount, VueWrapper } from '@vue/test-utils'
import ConfirmDeleteModal from '../ConfirmDeleteModal.vue'
import type { Skill, InstallRecord } from '../../types'

vi.mock('../../utils/skill-registry', () => ({
  loadRegistry: vi.fn(() => new Map()),
  removeFromRegistry: vi.fn(),
}))

const mockSkill: Skill = {
  id: 'skill-1',
  name: 'TestSkill',
  slug: 'test-skill',
  description: 'A test skill',
  tags: [],
  platforms: [],
  config: {}
}

function createInstallRecord(platformId: string, mode = 'copy'): InstallRecord {
  return {
    skillId: 'skill-1',
    platformId,
    targetPath: `/platforms/${platformId}/skills/TestSkill`,
    mode,
    scope: 'user',
    installedAt: Date.now(),
  }
}

function seedInstallRecords(records: InstallRecord[]) {
  window.ztools.dbStorage.setItem('sm_installed_skills', JSON.stringify(records))
}

describe('ConfirmDeleteModal', () => {
  let wrapper: VueWrapper

  beforeEach(() => {
    window.ztools.dbStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  test('renders skill name', () => {
    wrapper = mount(ConfirmDeleteModal, { props: { skill: mockSkill } })
    expect(wrapper.text()).toContain('TestSkill')
  })

  test('close button emits close', async () => {
    wrapper = mount(ConfirmDeleteModal, { props: { skill: mockSkill } })
    await wrapper.find('.confirm-close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  test('overlay click emits close', async () => {
    wrapper = mount(ConfirmDeleteModal, { props: { skill: mockSkill } })
    await wrapper.find('.confirm-overlay').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  test('cancel button emits close', async () => {
    wrapper = mount(ConfirmDeleteModal, { props: { skill: mockSkill } })
    await wrapper.find('.confirm-btn.cancel').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  test('shows distributed section when install records exist', () => {
    seedInstallRecords([createInstallRecord('cursor')])
    wrapper = mount(ConfirmDeleteModal, { props: { skill: mockSkill } })
    expect(wrapper.find('.distributed-section').exists()).toBe(true)
  })

  test('hides distributed section when no install records', () => {
    wrapper = mount(ConfirmDeleteModal, { props: { skill: mockSkill } })
    expect(wrapper.find('.distributed-section').exists()).toBe(false)
  })

  test('delete button emits deleted', async () => {
    wrapper = mount(ConfirmDeleteModal, { props: { skill: mockSkill } })
    await wrapper.find('.confirm-btn.delete').trigger('click')
    expect(wrapper.emitted('deleted')).toHaveLength(1)
  })

  test('delete calls removeFile for skill dir', async () => {
    wrapper = mount(ConfirmDeleteModal, { props: { skill: mockSkill } })
    await wrapper.find('.confirm-btn.delete').trigger('click')
    expect(window.services.pathJoin).toHaveBeenCalledWith(
      '/mock/path', 'skills-repo', 'skill-1'
    )
    expect(window.services.removeFile).toHaveBeenCalledWith(
      '/mock/path/skills-repo/skill-1'
    )
  })

  test('delete removes storage entries', async () => {
    seedInstallRecords([createInstallRecord('cursor')])
    wrapper = mount(ConfirmDeleteModal, { props: { skill: mockSkill } })
    await wrapper.find('.confirm-btn.delete').trigger('click')
    const stored = JSON.parse(window.ztools.dbStorage.getItem('sm_installed_skills')!)
    expect(stored).toHaveLength(0)
    const downloadedIds = JSON.parse(window.ztools.dbStorage.getItem('sm_downloaded_ids')!)
    expect(downloadedIds).toEqual([])
  })

  test('remove distributed checkbox triggers platform select', async () => {
    seedInstallRecords([createInstallRecord('cursor'), createInstallRecord('windsurf')])
    wrapper = mount(ConfirmDeleteModal, { props: { skill: mockSkill } })
    await wrapper.find('.remove-distributed-checkbox').setValue(true)
    await nextTick()
    expect(wrapper.findAll('.platform-item')).toHaveLength(2)
  })

  test('checking remove distributed selects all platforms', async () => {
    seedInstallRecords([createInstallRecord('cursor'), createInstallRecord('windsurf')])
    wrapper = mount(ConfirmDeleteModal, { props: { skill: mockSkill } })
    await wrapper.find('.remove-distributed-checkbox').setValue(true)
    await nextTick()
    expect(wrapper.findAll('.platform-item.checked')).toHaveLength(2)
  })

  test('toggle all / deselect all', async () => {
    seedInstallRecords([createInstallRecord('cursor'), createInstallRecord('windsurf')])
    wrapper = mount(ConfirmDeleteModal, { props: { skill: mockSkill } })
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
    seedInstallRecords([createInstallRecord('cursor'), createInstallRecord('windsurf')])
    wrapper = mount(ConfirmDeleteModal, { props: { skill: mockSkill } })
    await wrapper.find('.remove-distributed-checkbox').setValue(true)
    await nextTick()
    await wrapper.findAll('.platform-checkbox')[1].trigger('change')
    await nextTick()
    await wrapper.find('.confirm-btn.delete').trigger('click')
    expect(window.services.removeFile).toHaveBeenCalledWith('/platforms/cursor/skills/TestSkill')
    expect(window.services.removeFile).not.toHaveBeenCalledWith('/platforms/windsurf/skills/TestSkill')
  })

  test('shows platform mode text', async () => {
    seedInstallRecords([createInstallRecord('cursor', 'symlink')])
    wrapper = mount(ConfirmDeleteModal, { props: { skill: mockSkill } })
    await wrapper.find('.remove-distributed-checkbox').setValue(true)
    await nextTick()
    expect(wrapper.text()).toContain('软链接')
  })

  test('calls loadRegistry and removeFromRegistry on delete', async () => {
    const { loadRegistry, removeFromRegistry } = await import('../../utils/skill-registry')
    wrapper = mount(ConfirmDeleteModal, { props: { skill: mockSkill } })
    await wrapper.find('.confirm-btn.delete').trigger('click')
    expect(loadRegistry).toHaveBeenCalledOnce()
    expect(removeFromRegistry).toHaveBeenCalledWith(expect.any(Map), 'TestSkill')
  })
})

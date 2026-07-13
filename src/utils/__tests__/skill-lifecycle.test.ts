import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  clearSkillLifecycleHooks,
  registerSkillLifecycleHook,
  runSkillLifecycleHooks,
  type SkillLifecycleContext,
} from '../skill-lifecycle'

const context: SkillLifecycleContext = {
  operation: 'install',
  phase: 'before',
  skillId: 'skill-1',
  skillName: 'Test Skill',
  platformId: 'cursor',
  targetPath: '/target/skill',
}

describe('skill lifecycle hooks', () => {
  afterEach(() => {
    clearSkillLifecycleHooks()
  })

  test('runs hooks in registration order and unregisters them', () => {
    const calls: string[] = []
    const unregisterFirst = registerSkillLifecycleHook('beforeInstall', () => calls.push('first'))
    registerSkillLifecycleHook('beforeInstall', () => calls.push('second'))

    expect(runSkillLifecycleHooks('beforeInstall', context)).toEqual([])
    expect(calls).toEqual(['first', 'second'])

    unregisterFirst()
    runSkillLifecycleHooks('beforeInstall', context)
    expect(calls).toEqual(['first', 'second', 'second'])
  })

  test('stops before hooks after the first error when requested', () => {
    const second = vi.fn()
    registerSkillLifecycleHook('beforeInstall', () => {
      throw new Error('blocked')
    })
    registerSkillLifecycleHook('beforeInstall', second)

    expect(runSkillLifecycleHooks('beforeInstall', context, true)).toEqual(['blocked'])
    expect(second).not.toHaveBeenCalled()
  })

  test('runs all after hooks and collects errors', () => {
    const second = vi.fn()
    registerSkillLifecycleHook('afterInstall', () => {
      throw new Error('first failed')
    })
    registerSkillLifecycleHook('afterInstall', second)
    registerSkillLifecycleHook('afterInstall', () => {
      throw new Error('second failed')
    })

    expect(runSkillLifecycleHooks('afterInstall', { ...context, phase: 'after' })).toEqual(['first failed', 'second failed'])
    expect(second).toHaveBeenCalledOnce()
  })
})
